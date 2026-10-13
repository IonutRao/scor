-- Scorul zilei: baza de date (versiunea 0.3: activitatile pot avea detalii)
--
-- Se lipeste in Supabase, la SQL Editor, si se apasa Run.
-- Poate fi rulat din nou oricand: nu sterge si nu modifica datele existente.
-- Aduce la zi si o baza creata cu o versiune mai veche a acestui script.
--
-- Ce contine:
--   1. tabelele: profiles, settings, entries, cheers
--   2. cine ce are voie sa vada si sa schimbe (drepturi si reguli pe randuri)
--   3. numaratoarea incurajarilor
--   4. functiile pe care le apeleaza aplicatia


-- 1. TABELE -----------------------------------------------------------------

-- Numele afisat al fiecarui utilizator. Vizibil pentru ceilalti utilizatori autentificati.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint profiles_name_ok check (
    char_length(name) between 3 and 20
    and name = btrim(name)
    and name !~ '[[:cntrl:]<>]'
    and name !~ '\s\s'
  )
);
create unique index if not exists profiles_name_unique on public.profiles (lower(name));

-- Date private ale utilizatorului: lista de favorite.
create table if not exists public.settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  favs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint settings_favs_ok check (jsonb_typeof(favs) = 'array' and octet_length(favs::text) <= 16000)
);

-- Activitatile notate. Private, in afara de cele pe care utilizatorul le arata in flux.
create table if not exists public.entries (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  ts timestamptz not null,
  type text not null,
  pts smallint not null,
  key text,
  name text,
  is_public boolean not null default false,
  lang text not null default 'ro',
  cheers_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint entries_type_ok check (type in ('plus', 'minus')),
  constraint entries_pts_ok check (pts between 1 and 20),
  constraint entries_label_ok check (
    (key is not null and name is null and key ~ '^[a-z]{2,20}$')
    or (key is null and name is not null and char_length(name) between 1 and 40
        and name = btrim(name) and name !~ '[[:cntrl:]]')
  ),
  constraint entries_lang_ok check (lang in ('ro', 'en')),
  constraint entries_day_ok check (
    day between (ts at time zone 'UTC')::date - 1 and (ts at time zone 'UTC')::date + 1
  ),
  constraint entries_cheers_ok check (cheers_count >= 0)
);
create index if not exists entries_user_ts on public.entries (user_id, ts desc);
create index if not exists entries_public_ts on public.entries (ts desc) where is_public;

-- Detaliile unei activitati (din versiunea 0.3): cateva randuri, optionale. Le vede cine vede activitatea.
alter table public.entries add column if not exists note text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entries_note_ok' and conrelid = 'public.entries'::regclass
  ) then
    alter table public.entries add constraint entries_note_ok check (
      note is null
      or (char_length(note) between 1 and 300 and note = btrim(note, E' \n') and note !~ '[\x01-\x09\x0B-\x1F\x7F]')
    );
  end if;
end
$$;

-- Incurajarile: cel mult una de la un utilizator pentru o activitate.
create table if not exists public.cheers (
  entry_id uuid not null references public.entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);
create index if not exists cheers_user on public.cheers (user_id);


-- 2. DREPTURI SI REGULI -----------------------------------------------------

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.entries enable row level security;
alter table public.cheers enable row level security;

-- Se porneste de la zero drepturi si se da inapoi doar strictul necesar.
-- Vizitatorii neautentificati (anon) nu primesc nimic.
revoke all on public.profiles, public.settings, public.entries, public.cheers from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (id, name) on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

grant select on public.settings to authenticated;
grant insert (user_id, favs, updated_at) on public.settings to authenticated;
grant update (favs, updated_at) on public.settings to authenticated;

-- La activitati se pot schimba ulterior doar vizibilitatea si detaliile. Numarul de incurajari nu poate fi scris de nimeni.
grant select, delete on public.entries to authenticated;
grant insert (id, user_id, day, ts, type, pts, key, name, is_public, lang, note) on public.entries to authenticated;
grant update (is_public, note) on public.entries to authenticated;

grant select, delete on public.cheers to authenticated;
grant insert (entry_id, user_id) on public.cheers to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (true);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists settings_read_own on public.settings;
create policy settings_read_own on public.settings for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists settings_insert_own on public.settings;
create policy settings_insert_own on public.settings for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists settings_update_own on public.settings;
create policy settings_update_own on public.settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Fiecare isi vede toate activitatile; pe ale altora doar daca sunt publice.
drop policy if exists entries_read on public.entries;
create policy entries_read on public.entries for select to authenticated
  using (user_id = (select auth.uid()) or is_public);
drop policy if exists entries_insert_own on public.entries;
create policy entries_insert_own on public.entries for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists entries_update_own on public.entries;
create policy entries_update_own on public.entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists entries_delete_own on public.entries;
create policy entries_delete_own on public.entries for delete to authenticated
  using (user_id = (select auth.uid()));

-- Se pot incuraja doar activitatile publice ale altora. Fiecare isi vede doar propriile incurajari date.
drop policy if exists cheers_read_own on public.cheers;
create policy cheers_read_own on public.cheers for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists cheers_insert on public.cheers;
create policy cheers_insert on public.cheers for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.entries e
      where e.id = entry_id and e.is_public and e.user_id <> (select auth.uid())
    )
  );
drop policy if exists cheers_delete_own on public.cheers;
create policy cheers_delete_own on public.cheers for delete to authenticated
  using (user_id = (select auth.uid()));


-- 3. NUMARATOAREA INCURAJARILOR ----------------------------------------------

-- Tine la zi numarul de incurajari al fiecarei activitati. Ruleaza cu drepturile bazei de date,
-- pentru ca utilizatorii nu au voie sa scrie acest numar.
create or replace function public.tg_cheers_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.entries set cheers_count = cheers_count + 1 where id = new.entry_id;
    return new;
  end if;
  update public.entries set cheers_count = greatest(cheers_count - 1, 0) where id = old.entry_id;
  return old;
end
$$;

drop trigger if exists cheers_count_ins on public.cheers;
create trigger cheers_count_ins after insert on public.cheers
  for each row execute function public.tg_cheers_count();
drop trigger if exists cheers_count_del on public.cheers;
create trigger cheers_count_del after delete on public.cheers
  for each row execute function public.tg_cheers_count();

-- O activitate nu poate fi datata in viitor (ceasul telefonului poate fi gresit).
create or replace function public.tg_entries_clamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ts > now() + interval '5 minutes' then
    new.ts := now();
  end if;
  return new;
end
$$;

drop trigger if exists entries_clamp on public.entries;
create trigger entries_clamp before insert on public.entries
  for each row execute function public.tg_entries_clamp();


-- 4. FUNCTIILE APELATE DE APLICATIE ------------------------------------------

-- Profilul utilizatorului autentificat, sau null daca nu si-a ales inca un nume.
create or replace function public.me() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select (
    select jsonb_build_object('id', p.id, 'name', p.name)
    from public.profiles p where p.id = (select auth.uid())
  );
$$;

-- Alege sau schimba numele afisat.
create or replace function public.set_name(p_name text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 20 or v_name ~ '[[:cntrl:]<>]' then
    raise exception 'name_invalid';
  end if;
  begin
    insert into public.profiles (id, name) values (v_uid, v_name)
    on conflict (id) do update set name = excluded.name;
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  return jsonb_build_object('id', v_uid, 'name', v_name);
end
$$;

-- Aduce detaliile scrise de om la forma pastrata: randuri curate, cel mult 300 de caractere, sau nimic daca nu ramane nimic.
create or replace function public.note_text(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(left(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''), E'\r\n?', E'\n', 'g'),
        '[\x01-\x09\x0B-\x1F\x7F]', ' ', 'g'),
      E'\n{3,}', E'\n\n', 'g'),
    E' \n'), 300), E' \n'), '');
$$;

-- Un singur drum: primeste schimbarile facute pe dispozitiv si intoarce starea contului.
--   p_add  activitati noi: [{id, day, ts (milisecunde), type, pts, key sau name, pub, note}]
--   p_del  id-urile activitatilor sterse
--   p_vis  schimbari de vizibilitate: [{id, pub}]
--   p_favs lista de favorite, daca s-a schimbat
--   p_note detalii schimbate sau sterse: [{id, note}]
-- Raspunsul poarta si versiunea acestui script (v), ca aplicatia sa stie ce poate cere.
-- Forma veche, fara p_note, este stearsa: altfel ar exista doua functii cu acelasi nume. Aplicatiile mai vechi,
-- care nu trimit p_note, o folosesc pe cea noua fara nicio schimbare.
drop function if exists public.sync(jsonb, jsonb, jsonb, jsonb, text);
create or replace function public.sync(
  p_add jsonb default '[]'::jsonb,
  p_del jsonb default '[]'::jsonb,
  p_vis jsonb default '[]'::jsonb,
  p_favs jsonb default null,
  p_lang text default 'ro',
  p_note jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lang text := case when p_lang in ('ro', 'en') then p_lang else 'ro' end;
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_item jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_favs jsonb;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'no_profile';
  end if;

  if jsonb_typeof(p_add) = 'array' then
    if jsonb_array_length(p_add) > 500 then
      raise exception 'too_many';
    end if;
    for v_item in select x from jsonb_array_elements(p_add) x loop
      begin
        insert into public.entries (id, user_id, day, ts, type, pts, key, name, is_public, lang, note)
        values (
          (v_item->>'id')::uuid,
          v_uid,
          (v_item->>'day')::date,
          to_timestamp((v_item->>'ts')::double precision / 1000.0),
          v_item->>'type',
          (v_item->>'pts')::smallint,
          v_item->>'key',
          v_item->>'name',
          coalesce((v_item->>'pub')::boolean, false),
          v_lang,
          public.note_text(v_item->>'note')
        )
        on conflict (id) do nothing;
      exception when others then
        -- O activitate cu date gresite este sarita, ca sa nu le blocheze pe celelalte.
        v_rejected := v_rejected || jsonb_build_array(v_item->>'id');
      end;
    end loop;
  end if;

  -- Valorile care nu arata a id sunt ignorate, nu opresc tot drumul.
  if jsonb_typeof(p_del) = 'array' then
    delete from public.entries e
    using (
      select case when (x #>> '{}') ~ v_uuid then (x #>> '{}')::uuid end as id
      from jsonb_array_elements(p_del) x
      where jsonb_typeof(x) = 'string'
    ) d
    where e.user_id = v_uid and e.id = d.id;
  end if;

  if jsonb_typeof(p_vis) = 'array' then
    update public.entries e
    set is_public = v.pub
    from (
      select case when (x->>'id') ~ v_uuid then (x->>'id')::uuid end as id, (x->>'pub') = 'true' as pub
      from jsonb_array_elements(p_vis) x
      where jsonb_typeof(x) = 'object' and (x->>'pub') in ('true', 'false')
    ) v
    where e.user_id = v_uid and e.id = v.id;
  end if;

  -- Detalii schimbate dupa notare. Cu text gol sau cu null, detaliile se sterg. Orice altceva este ignorat.
  if jsonb_typeof(p_note) = 'array' then
    update public.entries e
    set note = public.note_text(n.note)
    from (
      select case when (x->>'id') ~ v_uuid then (x->>'id')::uuid end as id, x->>'note' as note
      from jsonb_array_elements(p_note) x
      where jsonb_typeof(x) = 'object' and jsonb_typeof(x->'note') in ('string', 'null')
    ) n
    where e.user_id = v_uid and e.id = n.id;
  end if;

  if p_favs is not null and jsonb_typeof(p_favs) = 'array' then
    insert into public.settings (user_id, favs, updated_at) values (v_uid, p_favs, now())
    on conflict (user_id) do update set favs = excluded.favs, updated_at = excluded.updated_at;
  end if;

  select s.favs into v_favs from public.settings s where s.user_id = v_uid;

  return jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'day', e.day, 'ts', (extract(epoch from e.ts) * 1000)::bigint,
        'type', e.type, 'pts', e.pts, 'key', e.key, 'name', e.name,
        'pub', e.is_public, 'cheers', e.cheers_count, 'note', e.note
      ) order by e.ts desc)
      from public.entries e where e.user_id = v_uid
    ), '[]'::jsonb),
    'favs', v_favs,
    'rejected', v_rejected,
    'now', (extract(epoch from now()) * 1000)::bigint,
    'v', 3
  );
end
$$;

-- Fluxul: cele mai noi activitati publice, cu detaliile lor. Fara nimic privat, fara adrese de email.
create or replace function public.feed(
  p_lang text default null,
  p_before bigint default null,
  p_limit integer default 30
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ts desc), '[]'::jsonb)
  from (
    select
      e.id,
      p.name as author,
      (e.user_id = (select auth.uid())) as mine,
      e.type, e.pts, e.key, e.name, e.lang, e.note,
      (extract(epoch from e.ts) * 1000)::bigint as ts,
      e.cheers_count as cheers,
      exists (
        select 1 from public.cheers c
        where c.entry_id = e.id and c.user_id = (select auth.uid())
      ) as cheered
    from public.entries e
    join public.profiles p on p.id = e.user_id
    where e.is_public
      and (p_lang is null or e.lang = p_lang)
      and (p_before is null or e.ts < to_timestamp(p_before / 1000.0))
    order by e.ts desc
    limit least(greatest(coalesce(p_limit, 30), 1), 50)
  ) t;
$$;

-- Da sau retrage o incurajare.
create or replace function public.cheer(p_entry uuid, p_on boolean default true) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if p_on then
    insert into public.cheers (entry_id, user_id) values (p_entry, v_uid)
    on conflict do nothing;
  else
    delete from public.cheers c where c.entry_id = p_entry and c.user_id = v_uid;
  end if;
  select e.cheers_count into v_count from public.entries e where e.id = p_entry;
  return jsonb_build_object(
    'cheers', coalesce(v_count, 0),
    'cheered', exists (select 1 from public.cheers c where c.entry_id = p_entry and c.user_id = v_uid)
  );
end
$$;

-- Sterge definitiv contul celui care o apeleaza, impreuna cu toate datele lui.
create or replace function public.delete_my_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  delete from auth.users where id = v_uid;
  return jsonb_build_object('ok', true);
end
$$;

-- Functiile pot fi apelate doar de utilizatori autentificati.
revoke all on function public.me() from public, anon;
revoke all on function public.set_name(text) from public, anon;
revoke all on function public.note_text(text) from public, anon;
revoke all on function public.sync(jsonb, jsonb, jsonb, jsonb, text, jsonb) from public, anon;
revoke all on function public.feed(text, bigint, integer) from public, anon;
revoke all on function public.cheer(uuid, boolean) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.tg_cheers_count() from public, anon, authenticated;
revoke all on function public.tg_entries_clamp() from public, anon, authenticated;

grant execute on function public.me() to authenticated;
grant execute on function public.set_name(text) to authenticated;
grant execute on function public.note_text(text) to authenticated;
grant execute on function public.sync(jsonb, jsonb, jsonb, jsonb, text, jsonb) to authenticated;
grant execute on function public.feed(text, bigint, integer) to authenticated;
grant execute on function public.cheer(uuid, boolean) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- Anunta serviciul care expune functiile ca s-au schimbat.
notify pgrst, 'reload schema';
