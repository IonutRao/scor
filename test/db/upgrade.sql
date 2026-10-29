-- Trecerea unei baze create cu scriptul unei versiuni mai vechi la scriptul de acum, cu date deja in ea.
-- Se ruleaza pe o baza pornita cu SCOR_SCHEMA_FILE=test/db/schema-0.6.sql (scriptul versiunii dinainte). Orice FAIL opreste scriptul.

\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema t;
grant usage on schema t to anon, authenticated;
create function t.a() returns uuid language sql immutable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function t.b() returns uuid language sql immutable as $$ select '22222222-2222-4222-8222-222222222222'::uuid $$;
create function t.e(n int) returns uuid language sql immutable as $$ select ('aaaaaaaa-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function t.ms(p timestamptz) returns bigint language sql immutable as $$ select (extract(epoch from p) * 1000)::bigint $$;
create function t.pic(n int) returns text language sql immutable as $$ select lpad(to_hex(n), 16, '0') || '-1280x960.jpg' $$;
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
select t.ok(coalesce((public.sync()->>'v')::int, 2) < 7, 'inainte: baza este la o versiune mai veche a scriptului');
select t.ok(jsonb_array_length(public.sync(
  p_add => jsonb_build_array(
    jsonb_build_object('id', t.e(1), 'day', current_date, 'ts', t.ms(now() - interval '2 hours'), 'type', 'plus', 'pts', 10, 'key', 'gym', 'pub', true),
    jsonb_build_object('id', t.e(2), 'day', current_date, 'ts', t.ms(now() - interval '1 hour'), 'type', 'minus', 'pts', 10, 'name', 'Tigara', 'pub', false),
    jsonb_build_object('id', t.e(3), 'day', current_date, 'ts', t.ms(now() - interval '30 minutes'), 'type', 'plus', 'pts', 5, 'name', 'Citit', 'pub', false,
                       'note', 'detalii', 'photo', t.pic(7), 'altceva', 'un camp pe care nicio versiune nu il cunoaste')),
  p_favs => '[{"id":"f1","type":"plus","pts":10,"name":"Inot"}]'::jsonb)->'entries') = 3,
  'inainte: Ana are trei activitati si o favorita; campurile necunoscute versiunii vechi sunt ignorate');
select t.be(t.b());
select public.set_name('Bogdan');
select t.ok((public.cheer(t.e(1))->>'cheers')::int = 1, 'inainte: Bogdan incurajeaza activitatea publica a Anei');
reset role;
create table t.before as select id, to_jsonb(e) as row from public.entries e;

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
    where b.id is null or e.id is null or not (to_jsonb(e) @> b.row)),
  'dupa: toate activitatile sunt la locul lor, cu tot ce aveau');
select t.ok((select count(*) from public.entries where photo is not null) = 0, 'dupa: nicio activitate veche nu are poza');
select t.ok((select count(*) from public.pulse) = 0, 'dupa: lista participantilor la "Azi pe plus" exista si este goala');
select t.ok((select count(*) from public.entries where kid is not null) = 0 and (select count(*) from public.settings where kids is not null) = 0,
  'dupa: nicio activitate veche nu este a unui copil si nimeni nu are modul educator pornit');
select t.ok((select count(*) from public.settings where show_score) = 0, 'dupa: nimeni nu are scorul la vedere pana nu alege');
select t.ok((select count(*) from public.cheers) = 1 and (select favs->0->>'name' from public.settings) = 'Inot', 'dupa: incurajarile si favoritele au ramas');
select t.ok((select count(*) from storage.buckets where id = 'photos' and not public) = 1, 'dupa: locul pentru poze exista si este privat');

-- O aplicatie mai veche apeleaza functiile exact ca inainte.
select t.be(t.a());
select t.ok(
  jsonb_array_length(public.sync(p_add => '[]'::jsonb, p_del => '[]'::jsonb, p_vis => '[]'::jsonb, p_favs => null, p_lang => 'ro')->'entries') = 3,
  'dupa: apelul versiunii 0.2, cu cinci parametri, merge la fel');
select t.ok(
  public.sync(p_add => '[]'::jsonb, p_del => '[]'::jsonb, p_vis => '[]'::jsonb, p_favs => null, p_lang => 'ro',
              p_note => jsonb_build_array(jsonb_build_object('id', t.e(1), 'note', 'picioare, 45 de minute')))->'entries'
    @> jsonb_build_array(jsonb_build_object('id', t.e(1), 'note', 'picioare, 45 de minute', 'cheers', 1)),
  'dupa: apelul versiunii 0.3, cu detalii, merge la fel si pastreaza incurajarea');
select t.ok(public.sync(p_vis => jsonb_build_array(jsonb_build_object('id', t.e(2), 'pub', true)))->'entries' @> jsonb_build_array(jsonb_build_object('id', t.e(2), 'pub', true, 'cheers', 0)),
  'dupa: schimbarea de vizibilitate trimisa de o aplicatie veche merge');
select t.ok((public.sync()->>'v')::int = 7, 'dupa: raspunsul poarta versiunea scriptului');

-- Ce aduce versiunea noua.
insert into storage.objects (bucket_id, name, owner_id) values ('photos', t.a()::text || '/' || t.pic(1), t.a()::text);
select t.ok(
  public.sync(p_photo => jsonb_build_array(jsonb_build_object('id', t.e(1), 'photo', t.pic(1))))->'entries'
    @> jsonb_build_array(jsonb_build_object('id', t.e(1), 'photo', t.pic(1), 'note', 'picioare, 45 de minute', 'cheers', 1)),
  'dupa: o activitate veche primeste o poza si isi pastreaza restul');
select t.be(t.b());
select t.ok(public.feed()->1->>'photo' = t.a()::text || '/' || t.pic(1) and public.feed()->0->'photo' = 'null'::jsonb, 'dupa: fluxul arata poza acolo unde exista');
select t.ok((select count(*) from storage.objects) = 1, 'dupa: Bogdan poate citi poza activitatii publice');
select t.ok(public.sync(p_photo => jsonb_build_array(jsonb_build_object('id', t.e(1), 'photo', null)),
                        p_note => jsonb_build_array(jsonb_build_object('id', t.e(1), 'note', 'schimbat de altcineva'))) is not null,
  'dupa: Bogdan trimite schimbari pentru activitatea Anei, fara eroare');
update public.entries set note = 'schimbat direct', photo = null where id = t.e(1);
reset role;
select t.ok((select note || '/' || photo from public.entries where id = t.e(1)) = 'picioare, 45 de minute/' || t.pic(1), 'dupa: detaliile si poza Anei nu pot fi schimbate de Bogdan');
select t.be(t.a());
select t.ok(public.pulse(p_join => true) = jsonb_build_object('day', current_date, 'in', true, 'total', 1, 'up', jsonb_build_array('Ana'), 'others', '[]'::jsonb, 'you', true, 'v', 7),
  'dupa: Ana intra in "Azi pe plus" si, cu ziua ei veche pe plus, apare pe lista');
reset role;
select t.be(t.a());
select t.ok(public.sync(p_kids => '{"on": true, "list": [{"id": "cccccccc-0000-4000-8000-000000000009", "name": "Vlad"}]}'::jsonb)->'kids'->'list'->0->>'name' = 'Vlad',
  'dupa: Ana poate porni modul educator');
select t.ok(public.sync(p_add => jsonb_build_array(jsonb_build_object('id', t.e(9), 'day', current_date, 'ts', t.ms(now()), 'type', 'plus', 'pts', 5, 'name', 'Teme', 'kid', 'cccccccc-0000-4000-8000-000000000009')))->'entries'
    @> jsonb_build_array(jsonb_build_object('id', t.e(9), 'kid', 'cccccccc-0000-4000-8000-000000000009', 'pub', false)),
  'dupa: o activitate pentru Vlad intra, privata');
select t.ok(public.sync(p_show => true)->'show' = 'true'::jsonb, 'dupa: Ana isi poate pune scorul la vedere');
select t.be(t.b());
select t.ok((select x->'score' from jsonb_array_elements(public.feed()) x where x->>'author' = 'Ana' limit 1) is not null, 'dupa: Bogdan vede scorul Anei in flux');
reset role;

\warn TRECERE: toate verificarile au trecut
