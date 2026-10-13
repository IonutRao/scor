-- Trecerea unei baze create cu scriptul versiunii 0.2 la scriptul de acum, cu date deja in ea.
-- Se ruleaza pe o baza pornita cu SCOR_SCHEMA_FILE=test/db/schema-0.2.sql. Orice FAIL opreste scriptul.

\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema t;
grant usage on schema t to anon, authenticated;
create function t.a() returns uuid language sql immutable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function t.b() returns uuid language sql immutable as $$ select '22222222-2222-4222-8222-222222222222'::uuid $$;
create function t.e(n int) returns uuid language sql immutable as $$ select ('aaaaaaaa-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function t.ms(p timestamptz) returns bigint language sql immutable as $$ select (extract(epoch from p) * 1000)::bigint $$;
create function t.be(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false);
end $$;
create function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL  %', p_msg; end if;
  raise notice 'ok    %', p_msg;
end $$;
grant execute on all functions in schema t to anon, authenticated;

-- ---------------------------------------------------------------- date notate cu versiunea veche
insert into auth.users (id, email, encrypted_password) values (t.a(), 'ana@example.test', 'x'), (t.b(), 'bogdan@example.test', 'x');
select t.be(t.a());
select public.set_name('Ana');
select t.ok(not (public.sync() ? 'v'), 'inainte: scriptul vechi nu isi spune versiunea');
select t.ok(jsonb_array_length(public.sync(
  p_add => jsonb_build_array(
    jsonb_build_object('id', t.e(1), 'day', current_date, 'ts', t.ms(now() - interval '2 hours'), 'type', 'plus', 'pts', 10, 'key', 'gym', 'pub', true),
    jsonb_build_object('id', t.e(2), 'day', current_date, 'ts', t.ms(now() - interval '1 hour'), 'type', 'minus', 'pts', 10, 'name', 'Tigara', 'pub', false),
    jsonb_build_object('id', t.e(3), 'day', current_date, 'ts', t.ms(now() - interval '30 minutes'), 'type', 'plus', 'pts', 5, 'name', 'Citit', 'pub', false, 'note', 'detalii trimise prea devreme')),
  p_favs => '[{"id":"f1","type":"plus","pts":10,"name":"Inot"}]'::jsonb)->'entries') = 3,
  'inainte: Ana are trei activitati si o favorita; un camp necunoscut este ignorat');
select t.be(t.b());
select public.set_name('Bogdan');
select t.ok((public.cheer(t.e(1))->>'cheers')::int = 1, 'inainte: Bogdan incurajeaza activitatea publica a Anei');
reset role;
create table t.before as select id, user_id, day, ts, type, pts, key, name, is_public, lang, cheers_count, created_at from public.entries;

-- ---------------------------------------------------------------- scriptul nou, rulat de doua ori
\ir ../../supabase/schema.sql
\ir ../../supabase/schema.sql
\set ON_ERROR_STOP on
set client_min_messages = notice;

select t.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sync') = 1,
  'dupa: exista o singura functie sync');
select t.ok(
  not exists (
    select 1 from t.before b full join public.entries e using (id)
    where b.id is null or e.id is null
       or (b.user_id, b.day, b.ts, b.type, b.pts, b.key, b.name, b.is_public, b.lang, b.cheers_count, b.created_at)
          is distinct from (e.user_id, e.day, e.ts, e.type, e.pts, e.key, e.name, e.is_public, e.lang, e.cheers_count, e.created_at)),
  'dupa: toate activitatile sunt la locul lor, neschimbate');
select t.ok((select count(*) from public.entries where note is not null) = 0, 'dupa: nicio activitate veche nu are detalii');
select t.ok((select count(*) from public.cheers) = 1 and (select favs->0->>'name' from public.settings) = 'Inot', 'dupa: incurajarile si favoritele au ramas');

-- O aplicatie mai veche apeleaza functiile exact ca inainte.
select t.be(t.a());
select t.ok(
  jsonb_array_length(public.sync(p_add => '[]'::jsonb, p_del => '[]'::jsonb, p_vis => '[]'::jsonb, p_favs => null, p_lang => 'ro')->'entries') = 3,
  'dupa: apelul vechi, cu cei cinci parametri, merge la fel');
select t.ok(public.sync(p_vis => jsonb_build_array(jsonb_build_object('id', t.e(2), 'pub', true)))->'entries' @> jsonb_build_array(jsonb_build_object('id', t.e(2), 'pub', true, 'cheers', 0)),
  'dupa: schimbarea de vizibilitate trimisa de o aplicatie veche merge');
select t.ok((public.sync()->>'v')::int = 3, 'dupa: raspunsul poarta versiunea scriptului');

-- Ce aduce versiunea noua.
select t.ok(
  public.sync(p_note => jsonb_build_array(jsonb_build_object('id', t.e(1), 'note', 'picioare, 45 de minute')))->'entries'
    @> jsonb_build_array(jsonb_build_object('id', t.e(1), 'note', 'picioare, 45 de minute', 'cheers', 1)),
  'dupa: o activitate veche primeste detalii si isi pastreaza incurajarea');
select t.be(t.b());
select t.ok(public.feed()->1->>'note' = 'picioare, 45 de minute' and public.feed()->0->'note' = 'null'::jsonb, 'dupa: fluxul arata detaliile acolo unde exista');
select t.ok(public.sync(p_note => jsonb_build_array(jsonb_build_object('id', t.e(1), 'note', 'schimbat de altcineva'))) is not null, 'dupa: Bogdan trimite detalii pentru activitatea Anei, fara eroare');
update public.entries set note = 'schimbat direct' where id = t.e(1);
reset role;
select t.ok((select note from public.entries where id = t.e(1)) = 'picioare, 45 de minute', 'dupa: detaliile Anei nu pot fi schimbate de Bogdan');

\warn TRECERE: toate verificarile au trecut
