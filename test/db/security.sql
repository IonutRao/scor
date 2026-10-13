-- Verifica regulile de acces din supabase/schema.sql pe o baza locala.
-- Trei utilizatori: Ana (a), Bogdan (b), Carmen (c). Orice FAIL opreste scriptul.

\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema t;
grant usage on schema t to anon, authenticated;

create function t.a() returns uuid language sql immutable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function t.b() returns uuid language sql immutable as $$ select '22222222-2222-4222-8222-222222222222'::uuid $$;
create function t.c() returns uuid language sql immutable as $$ select '33333333-3333-4333-8333-333333333333'::uuid $$;

-- Devine utilizatorul dat, exact cum ajunge o cerere din aplicatie in baza de date.
create function t.be(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false);
end $$;

create function t.be_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', false);
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
end $$;

create function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL  %', p_msg; end if;
  raise notice 'ok    %', p_msg;
end $$;

-- Comanda data trebuie sa esueze cu starea sau mesajul asteptat.
create function t.fails(p_sql text, p_expect text, p_msg text) returns void language plpgsql as $$
declare v_state text; v_text text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_text = message_text;
    if v_state = p_expect or v_text = p_expect then
      raise notice 'ok    %', p_msg;
      return;
    end if;
    raise exception 'FAIL  %: alta eroare decat cea asteptata (% %)', p_msg, v_state, v_text;
  end;
  raise exception 'FAIL  %: comanda a reusit, desi trebuia refuzata', p_msg;
end $$;

insert into auth.users (id, email, encrypted_password) values
  (t.a(), 'ana@example.test', 'x'), (t.b(), 'bogdan@example.test', 'x'), (t.c(), 'carmen@example.test', 'x');

-- Id-urile activitatilor folosite mai jos.
create function t.e(n int) returns uuid language sql immutable as $$ select ('aaaaaaaa-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function t.ms(p timestamptz) returns bigint language sql immutable as $$ select (extract(epoch from p) * 1000)::bigint $$;
grant execute on all functions in schema t to anon, authenticated;

-- ---------------------------------------------------------------- vizitator neautentificat
select t.be_anon();
select t.fails('select public.me()', '42501', 'neautentificat: nu poate apela me()');
select t.fails('select public.feed()', '42501', 'neautentificat: nu poate citi fluxul');
select t.fails('select public.sync()', '42501', 'neautentificat: nu poate apela sync()');
select t.fails('select count(*) from public.entries', '42501', 'neautentificat: nu poate citi tabela de activitati');
select t.fails('select count(*) from public.profiles', '42501', 'neautentificat: nu poate citi numele utilizatorilor');

-- ---------------------------------------------------------------- nume
select t.be(t.a());
select t.ok(public.me() is null, 'Ana: fara nume ales, me() intoarce null');
select t.fails('select public.sync()', 'no_profile', 'Ana: fara nume nu poate salva nimic');
select t.fails($$select public.set_name('ab')$$, 'name_invalid', 'nume prea scurt refuzat');
select t.fails($$select public.set_name('un nume mult prea lung pentru aplicatie')$$, 'name_invalid', 'nume prea lung refuzat');
select t.fails($$select public.set_name('<b>Ana</b>')$$, 'name_invalid', 'nume cu marcaje refuzat');
select t.ok(public.set_name('  Ana   Maria ')->>'name' = 'Ana Maria', 'numele este curatat de spatii in plus');
select t.ok(public.me()->>'name' = 'Ana Maria', 'me() intoarce numele ales');
select t.ok(public.set_name('Ana')->>'name' = 'Ana', 'numele poate fi schimbat');

select t.be(t.b());
select t.fails($$select public.set_name('ANA')$$, 'name_taken', 'acelasi nume cu alte litere mari este refuzat');
select t.ok(public.set_name('Bogdan')->>'name' = 'Bogdan', 'Bogdan isi alege numele');
select t.fails($$insert into public.profiles (id, name) values (t.c(), 'Fals')$$, '42501', 'Bogdan nu poate crea profil in numele altcuiva');
update public.profiles set name = 'Furat' where id = t.a();
select t.ok((select name from public.profiles where id = t.a()) = 'Ana', 'Bogdan nu poate schimba numele Anei');
select t.be(t.c());
select t.ok(public.set_name('Carmen')->>'name' = 'Carmen', 'Carmen isi alege numele');

-- ---------------------------------------------------------------- Ana noteaza activitati
select t.be(t.a());
select t.ok(
  jsonb_array_length(public.sync(p_add => jsonb_build_array(
    jsonb_build_object('id', t.e(1), 'day', current_date, 'ts', t.ms(now() - interval '2 hours'), 'type', 'plus', 'pts', 10, 'key', 'gym', 'pub', true),
    jsonb_build_object('id', t.e(2), 'day', current_date, 'ts', t.ms(now() - interval '1 hour'), 'type', 'minus', 'pts', 10, 'name', 'Tigara', 'pub', false),
    jsonb_build_object('id', t.e(3), 'day', current_date, 'ts', t.ms(now() - interval '30 minutes'), 'type', 'plus', 'pts', 5, 'name', 'Citit', 'pub', false)
  ))->'entries') = 3,
  'Ana: trei activitati salvate si intoarse');
select t.ok(
  public.sync(p_add => jsonb_build_array(
    jsonb_build_object('id', t.e(1), 'day', current_date, 'ts', t.ms(now()), 'type', 'plus', 'pts', 20, 'key', 'gym', 'pub', true)
  ))->'entries' @> jsonb_build_array(jsonb_build_object('id', t.e(1), 'pts', 10)),
  'aceeasi activitate trimisa de doua ori nu se dubleaza si nu se modifica');
select t.ok(
  public.sync(p_add => jsonb_build_array(
    jsonb_build_object('id', t.e(90), 'day', current_date, 'ts', t.ms(now()), 'type', 'plus', 'pts', 99, 'name', 'Prea multe puncte'),
    jsonb_build_object('id', t.e(91), 'day', current_date - 30, 'ts', t.ms(now()), 'type', 'plus', 'pts', 5, 'name', 'Zi gresita'),
    jsonb_build_object('id', t.e(92), 'day', current_date, 'ts', t.ms(now()), 'type', 'altceva', 'pts', 5, 'name', 'Fel gresit'),
    jsonb_build_object('id', 'nu-e-id', 'day', current_date, 'ts', t.ms(now()), 'type', 'plus', 'pts', 5, 'name', 'Id gresit'),
    jsonb_build_object('id', t.e(4), 'day', current_date, 'ts', t.ms(now() - interval '10 minutes'), 'type', 'plus', 'pts', 20, 'name', 'Buna', 'pub', true)
  ))->'rejected' = jsonb_build_array(t.e(90), t.e(91), t.e(92), 'nu-e-id'),
  'activitatile cu date gresite sunt sarite, cea buna trece');
select t.ok((select count(*) from public.entries) = 4, 'Ana vede cele 4 activitati ale ei');
select t.ok(
  (public.sync(p_add => jsonb_build_array(
    jsonb_build_object('id', t.e(5), 'day', current_date, 'ts', t.ms(now() + interval '3 hours'), 'type', 'plus', 'pts', 5, 'name', 'Din viitor')
  ))->'entries'->0->>'ts')::bigint <= t.ms(now() + interval '1 minute'),
  'o activitate datata in viitor este adusa la ora serverului');

-- ---------------------------------------------------------------- ce vede Bogdan
select t.be(t.b());
select t.ok((select count(*) from public.entries) = 2, 'Bogdan vede doar cele 2 activitati publice ale Anei');
select t.ok((select count(*) from public.entries where id in (t.e(2), t.e(3), t.e(5))) = 0, 'Bogdan nu vede activitatile private ale Anei');
select t.ok(jsonb_array_length(public.feed()) = 2, 'fluxul lui Bogdan are 2 activitati');
select t.ok(public.feed()->0->>'author' = 'Ana' and (public.feed()->0->>'mine')::boolean = false, 'fluxul arata numele autorului si ca nu e activitatea lui');
select t.ok(not (public.feed()::text ~ 'example.test'), 'fluxul nu contine adrese de email');
select t.ok(not (public.feed()::text ~ 'Tigara'), 'fluxul nu contine activitati private');
select t.ok(jsonb_array_length(public.feed(p_lang => 'en')) = 0, 'filtrul de limba ascunde activitatile in alta limba');
select t.ok(jsonb_array_length(public.feed(p_limit => 1)) = 1, 'fluxul respecta limita ceruta');
select t.ok(jsonb_array_length(public.feed(p_before => (public.feed()->1->>'ts')::bigint)) = 0, 'paginarea nu repeta activitatile deja vazute');
select t.ok(jsonb_array_length(public.sync()->'entries') = 0, 'sync() ii intoarce lui Bogdan doar activitatile lui');
select t.fails('select count(*) from auth.users', '42501', 'Bogdan nu poate citi conturile si adresele de email');

-- ---------------------------------------------------------------- Bogdan incearca sa umble la datele Anei
select t.fails(
  $$insert into public.entries (id, user_id, day, ts, type, pts, name) values (t.e(50), t.a(), current_date, now(), 'plus', 5, 'Fals')$$,
  '42501', 'Bogdan nu poate nota o activitate in numele Anei');
select t.fails($$update public.entries set pts = 1 where id = t.e(1)$$, '42501', 'punctele unei activitati nu pot fi modificate');
select t.fails($$update public.entries set cheers_count = 99 where id = t.e(1)$$, '42501', 'numarul de incurajari nu poate fi scris');
select t.fails(
  $$insert into public.entries (id, user_id, day, ts, type, pts, name, cheers_count) values (t.e(51), t.b(), current_date, now(), 'plus', 5, 'Umflat', 50)$$,
  '42501', 'o activitate noua nu poate porni cu incurajari');
update public.entries set is_public = false where id = t.e(1);
delete from public.entries where id in (t.e(1), t.e(2));
select t.ok(public.sync(p_del => jsonb_build_array(t.e(2), t.e(3)), p_vis => jsonb_build_array(jsonb_build_object('id', t.e(2), 'pub', true))) is not null, 'sync() cu id-urile Anei nu da eroare');
reset role;
select t.ok((select count(*) from public.entries where user_id = t.a()) = 5, 'activitatile Anei sunt toate la locul lor dupa incercarile lui Bogdan');
select t.ok((select is_public from public.entries where id = t.e(1)) and not (select is_public from public.entries where id = t.e(2)), 'vizibilitatea activitatilor Anei a ramas neschimbata');

-- ---------------------------------------------------------------- incurajari
select t.be(t.b());
select t.ok(public.cheer(t.e(1)) = '{"cheers": 1, "cheered": true}'::jsonb, 'Bogdan incurajeaza activitatea publica a Anei');
select t.ok(public.cheer(t.e(1)) = '{"cheers": 1, "cheered": true}'::jsonb, 'a doua incurajare de la acelasi om nu se numara');
select t.ok((public.feed()->1->>'cheered')::boolean and (public.feed()->1->>'cheers')::int = 1, 'fluxul arata incurajarea data');
select t.fails($$select public.cheer(t.e(2))$$, '42501', 'o activitate privata nu poate fi incurajata');
select t.fails($$insert into public.cheers (entry_id, user_id) values (t.e(1), t.c())$$, '42501', 'Bogdan nu poate incuraja in numele lui Carmen');
select t.be(t.c());
select t.ok((public.cheer(t.e(1))->>'cheers')::int = 2, 'Carmen incurajeaza si ea: 2 incurajari');
select t.ok((select count(*) from public.cheers) = 1, 'Carmen vede doar incurajarea data de ea');
select t.be(t.a());
select t.fails($$select public.cheer(t.e(1))$$, '42501', 'Ana nu isi poate incuraja propria activitate');
select t.ok(public.sync()->'entries' @> jsonb_build_array(jsonb_build_object('id', t.e(1), 'cheers', 2)), 'Ana isi vede cele 2 incurajari primite');
select t.ok((select count(*) from public.cheers) = 0, 'Ana nu vede cine a incurajat');
select t.be(t.b());
select t.ok(public.cheer(t.e(1), false) = '{"cheers": 1, "cheered": false}'::jsonb, 'Bogdan isi retrage incurajarea');
select t.ok(public.cheer(t.e(1), false) = '{"cheers": 1, "cheered": false}'::jsonb, 'retragerea repetata nu scade sub ce exista');

-- ---------------------------------------------------------------- vizibilitate, stergere, favorite
select t.be(t.a());
select t.ok(public.sync(p_vis => jsonb_build_array(jsonb_build_object('id', t.e(1), 'pub', false), 'gunoi', jsonb_build_object('id', 'x', 'pub', true)))->'entries' @> jsonb_build_array(jsonb_build_object('id', t.e(1), 'pub', false)), 'Ana scoate o activitate din flux; valorile gresite sunt ignorate');
select t.be(t.b());
select t.ok(jsonb_array_length(public.feed()) = 1, 'activitatea scoasa din flux nu mai apare la ceilalti');
select t.fails($$select public.cheer(t.e(1))$$, '42501', 'activitatea scoasa din flux nu mai poate fi incurajata');
select t.be(t.a());
select t.ok(jsonb_array_length(public.sync(p_del => jsonb_build_array(t.e(3), 'abc', 123, null))->'entries') = 4, 'Ana sterge o activitate; valorile gresite sunt ignorate');
select t.ok(public.sync(p_favs => '[{"id":"f1","type":"plus","pts":10,"name":"Inot"}]'::jsonb)->'favs'->0->>'name' = 'Inot', 'favoritele se salveaza in cont');
select t.ok(public.sync()->'favs'->0->>'name' = 'Inot', 'favoritele se intorc la urmatorul drum');
select t.fails($$select public.sync(p_favs => (select jsonb_agg(repeat('x', 200)) from generate_series(1, 200)))$$, '23514', 'o lista de favorite uriasa este refuzata');
select t.be(t.b());
select t.ok(public.sync()->'favs' = 'null'::jsonb, 'Bogdan nu primeste favoritele Anei');
select t.ok((select count(*) from public.settings) = 0, 'Bogdan nu poate citi setarile Anei');
select t.ok((select count(*) from public.profiles) = 3, 'numele celor trei utilizatori sunt vizibile intre ei');

-- ---------------------------------------------------------------- detalii
select t.be(t.a());
select t.ok((public.sync()->>'v')::int = 4, 'raspunsul lui sync() poarta versiunea scriptului');
select t.ok(
  public.sync(p_add => jsonb_build_array(
    jsonb_build_object('id', t.e(70), 'day', current_date, 'ts', t.ms(now() - interval '5 minutes'), 'type', 'plus', 'pts', 10, 'name', 'Ajutor', 'pub', true,
                       'note', E'  Am ajutat un vecin.\r\n\r\n\r\n\r\nA durat o ora.\t \x01 '),
    jsonb_build_object('id', t.e(71), 'day', current_date, 'ts', t.ms(now() - interval '4 minutes'), 'type', 'minus', 'pts', 5, 'name', 'Secret', 'pub', false, 'note', 'doar pentru mine'),
    jsonb_build_object('id', t.e(72), 'day', current_date, 'ts', t.ms(now() - interval '3 minutes'), 'type', 'plus', 'pts', 5, 'name', 'Lung', 'pub', false, 'note', repeat('ș', 400)),
    jsonb_build_object('id', t.e(73), 'day', current_date, 'ts', t.ms(now() - interval '2 minutes'), 'type', 'plus', 'pts', 5, 'name', 'Gol', 'pub', false, 'note', E' \n '),
    jsonb_build_object('id', t.e(74), 'day', current_date, 'ts', t.ms(now() - interval '1 minute'), 'type', 'plus', 'pts', 5, 'name', 'Numar', 'pub', false, 'note', 12)
  ))->'entries' @> jsonb_build_array(
    jsonb_build_object('id', t.e(70), 'note', E'Am ajutat un vecin.\n\nA durat o ora.'),
    jsonb_build_object('id', t.e(71), 'note', 'doar pentru mine'),
    jsonb_build_object('id', t.e(72), 'note', repeat('ș', 300)),
    jsonb_build_object('id', t.e(73), 'note', null),
    jsonb_build_object('id', t.e(74), 'note', '12')),
  'detaliile se salveaza curatate: randuri ordonate, cel mult 300 de caractere, gol inseamna fara');
select t.ok(public.sync()->'rejected' = '[]'::jsonb and (select count(*) from public.entries where id in (t.e(70), t.e(71), t.e(72), t.e(73), t.e(74))) = 5,
  'nicio activitate nu este respinsa din cauza detaliilor');

select t.be(t.b());
select t.ok(public.feed()->0->>'note' = E'Am ajutat un vecin.\n\nA durat o ora.', 'Bogdan vede in flux detaliile activitatii publice');
select t.ok(not (public.feed()::text ~ 'doar pentru mine'), 'fluxul nu contine detaliile unei activitati private');
select t.ok((select count(*) from public.entries where note = 'doar pentru mine') = 0, 'Bogdan nu poate citi detaliile private nici direct din tabela');
select t.ok(public.sync(p_note => jsonb_build_array(jsonb_build_object('id', t.e(70), 'note', 'scris de Bogdan'), jsonb_build_object('id', t.e(71), 'note', null))) is not null,
  'sync() cu detalii pentru activitatile Anei nu da eroare');
update public.entries set note = 'scris direct de Bogdan' where id in (t.e(70), t.e(71));
reset role;
select t.ok((select note from public.entries where id = t.e(70)) = E'Am ajutat un vecin.\n\nA durat o ora.' and (select note from public.entries where id = t.e(71)) = 'doar pentru mine',
  'detaliile Anei au ramas neschimbate dupa incercarile lui Bogdan');

select t.be(t.a());
select t.ok(
  public.sync(p_note => jsonb_build_array(
    jsonb_build_object('id', t.e(70), 'note', E' Am ajutat un vecin sa mute o canapea. \n'),
    jsonb_build_object('id', t.e(71), 'note', null),
    jsonb_build_object('id', t.e(72), 'note', ''),
    jsonb_build_object('id', t.e(74), 'note', 99),
    jsonb_build_object('id', t.e(74)),
    'gunoi', jsonb_build_object('id', 'x', 'note', 'fara id bun')
  ))->'entries' @> jsonb_build_array(
    jsonb_build_object('id', t.e(70), 'note', 'Am ajutat un vecin sa mute o canapea.'),
    jsonb_build_object('id', t.e(71), 'note', null),
    jsonb_build_object('id', t.e(72), 'note', null),
    jsonb_build_object('id', t.e(74), 'note', '12')),
  'Ana schimba si sterge detalii; valorile gresite sunt ignorate');
select t.ok(public.sync(p_add => jsonb_build_array(
    jsonb_build_object('id', t.e(70), 'day', current_date, 'ts', t.ms(now()), 'type', 'plus', 'pts', 10, 'name', 'Ajutor', 'pub', true, 'note', 'retrimisa')
  ))->'entries' @> jsonb_build_array(jsonb_build_object('id', t.e(70), 'note', 'Am ajutat un vecin sa mute o canapea.')),
  'o activitate retrimisa nu isi pierde detaliile schimbate intre timp');
select t.fails($$update public.entries set note = repeat('x', 301) where id = t.e(70)$$, '23514', 'detalii prea lungi, scrise direct, sunt refuzate');
select t.fails($$update public.entries set note = E'cu semn\x02ascuns' where id = t.e(70)$$, '23514', 'detalii cu semne de control sunt refuzate');
select t.fails($$update public.entries set note = ' cu spatiu la inceput' where id = t.e(70)$$, '23514', 'detalii necuratate sunt refuzate');
select t.fails($$update public.entries set note = '' where id = t.e(70)$$, '23514', 'detalii goale sunt refuzate: fara detalii inseamna null');
select t.fails($$update public.entries set name = 'Altceva' where id = t.e(70)$$, '42501', 'numele unei activitati tot nu poate fi schimbat');
select t.ok(public.note_text(E'a\n\n\n\nb') = E'a\n\nb', 'functia de curatare poate fi folosita si de aplicatie');
select t.be(t.b());
select t.ok(public.feed()->0->>'note' = 'Am ajutat un vecin sa mute o canapea.', 'fluxul arata detaliile schimbate');
select t.be(t.a());
select t.ok(jsonb_array_length(public.sync(p_del => jsonb_build_array(t.e(70), t.e(71), t.e(72), t.e(73), t.e(74)))->'entries') = 4, 'activitatile cu detalii se sterg ca oricare altele');
select t.be_anon();
select t.fails($$select public.note_text('x')$$, '42501', 'neautentificat: nu poate apela nici functia de curatare');

-- ---------------------------------------------------------------- poze
-- Serviciul de fisiere din Supabase scrie si citeste randurile din storage.objects cu rolul si identitatea utilizatorului;
-- aici se face la fel, direct. Numele fisierelor: dosarul utilizatorului, apoi un nume de poza.
reset role;
create function t.pic(n int) returns text language sql immutable as $$ select lpad(to_hex(n), 16, '0') || '-1280x960.jpg' $$;
grant execute on function t.pic(int) to anon, authenticated;

select t.be(t.a());
select t.ok(
  jsonb_array_length(public.sync(p_add => jsonb_build_array(
    jsonb_build_object('id', t.e(80), 'day', current_date, 'ts', t.ms(now() - interval '5 minutes'), 'type', 'plus', 'pts', 10, 'name', 'Cu poza publica', 'pub', true),
    jsonb_build_object('id', t.e(81), 'day', current_date, 'ts', t.ms(now() - interval '4 minutes'), 'type', 'plus', 'pts', 10, 'name', 'Cu poza privata', 'pub', false),
    jsonb_build_object('id', t.e(82), 'day', current_date, 'ts', t.ms(now() - interval '3 minutes'), 'type', 'plus', 'pts', 5, 'name', 'Poza de la inceput', 'pub', false, 'photo', t.pic(3)),
    jsonb_build_object('id', t.e(83), 'day', current_date, 'ts', t.ms(now() - interval '2 minutes'), 'type', 'plus', 'pts', 5, 'name', 'Nume de poza gresit', 'pub', false, 'photo', '../altundeva.jpg')
  ))->'entries') = 8,
  'Ana noteaza patru activitati pentru poze; o poza trimisa odata cu activitatea nu o respinge');
select t.ok((select count(*) from public.entries where id in (t.e(82), t.e(83)) and photo is not null) = 0,
  'poza trimisa odata cu activitatea este ignorata: contul afla de poze doar prin p_photo, dupa ce fisierul lor exista');

insert into storage.objects (bucket_id, name, owner_id) values ('photos', t.a()::text || '/' || t.pic(1), t.a()::text);
insert into storage.objects (bucket_id, name, owner_id) values ('photos', t.a()::text || '/' || t.pic(2), t.a()::text);
insert into storage.objects (bucket_id, name, owner_id) values ('photos', t.a()::text || '/' || t.pic(9), t.a()::text);
select t.ok((select count(*) from storage.objects) = 3, 'Ana incarca trei poze in dosarul ei si le vede');
select t.fails($$insert into storage.objects (bucket_id, name) values ('photos', t.b()::text || '/' || t.pic(4))$$, '42501', 'Ana nu poate incarca in dosarul lui Bogdan');
select t.fails($$insert into storage.objects (bucket_id, name) values ('photos', t.a()::text || '/orice.exe')$$, '42501', 'un fisier care nu arata a poza este refuzat');
select t.fails($$insert into storage.objects (bucket_id, name) values ('photos', t.a()::text || '/sub/' || t.pic(4))$$, '42501', 'nici intr-un dosar mai adanc nu se poate incarca');
select t.fails($$insert into storage.objects (bucket_id, name) values ('photos', t.pic(4))$$, '42501', 'nici in afara dosarului');
select t.fails($$insert into storage.objects (bucket_id, name) values ('altceva', t.a()::text || '/' || t.pic(4))$$, '42501', 'intr-un alt loc decat cel de poze nu se poate incarca');
update storage.objects set name = t.a()::text || '/' || t.pic(5) where name like '%' || t.pic(9);
select t.ok((select count(*) from storage.objects where name like '%' || t.pic(9)) = 1 and (select count(*) from storage.objects where name like '%' || t.pic(5)) = 0,
  'un fisier incarcat nu poate fi redenumit sau inlocuit');

select t.ok(
  public.sync(p_photo => jsonb_build_array(
    jsonb_build_object('id', t.e(80), 'photo', t.pic(1)),
    jsonb_build_object('id', t.e(81), 'photo', t.pic(2)),
    jsonb_build_object('id', t.e(83), 'photo', 'nu-e-poza.png'),
    jsonb_build_object('id', t.e(83), 'photo', 12),
    jsonb_build_object('id', t.e(83)),
    'gunoi', jsonb_build_object('id', 'x', 'photo', t.pic(1))
  ))->'entries' @> jsonb_build_array(
    jsonb_build_object('id', t.e(80), 'photo', t.pic(1)),
    jsonb_build_object('id', t.e(81), 'photo', t.pic(2)),
    jsonb_build_object('id', t.e(83), 'photo', null)),
  'Ana leaga pozele de activitati; valorile gresite sunt ignorate');
select t.ok(public.sync(p_photo => jsonb_build_array(jsonb_build_object('id', t.e(82), 'photo', t.pic(7)), jsonb_build_object('id', t.e(80), 'photo', t.pic(8))))->'entries'
    @> jsonb_build_array(jsonb_build_object('id', t.e(82), 'photo', null), jsonb_build_object('id', t.e(80), 'photo', t.pic(1))),
  'o legatura catre un fisier care nu exista in dosarul ei nu se aplica: activitatile raman cum erau');
select t.ok(public.sync(p_photo => jsonb_build_array(jsonb_build_object('id', t.e(82), 'photo', t.pic(9))))->'entries'
    @> jsonb_build_array(jsonb_build_object('id', t.e(82), 'photo', t.pic(9))),
  'o legatura catre un fisier existent se aplica');
select t.ok(public.sync(p_photo => jsonb_build_array(jsonb_build_object('id', t.e(82), 'photo', null)))->'entries'
    @> jsonb_build_array(jsonb_build_object('id', t.e(82), 'photo', null)),
  'si scoaterea pozei se aplica oricand');
select t.fails($$update public.entries set photo = 'x.jpg' where id = t.e(80)$$, '23514', 'un nume de poza gresit, scris direct, este refuzat');

select t.be(t.b());
select t.ok(public.feed()->0->>'photo' = t.a()::text || '/' || t.pic(1), 'fluxul ii spune lui Bogdan unde este poza activitatii publice');
select t.ok(not (public.feed()::text ~ t.pic(2)), 'fluxul nu pomeneste poza activitatii private');
select t.ok((select count(*) from storage.objects) = 1 and (select name from storage.objects) = t.a()::text || '/' || t.pic(1),
  'Bogdan poate citi doar poza activitatii publice; nici pe cea privata, nici pe cea nelegata de vreo activitate');
update storage.objects set owner_id = t.b()::text, name = t.b()::text || '/' || t.pic(1);
select t.ok((select owner_id from storage.objects) = t.a()::text and (select name from storage.objects) = t.a()::text || '/' || t.pic(1), 'Bogdan nu poate modifica sau muta poza Anei');
select set_config('storage.allow_delete_query', 'true', false);
delete from storage.objects;
select t.ok((select count(*) from storage.objects) = 1, 'Bogdan nu poate sterge poza Anei');
select t.ok(public.sync(p_photo => jsonb_build_array(jsonb_build_object('id', t.e(80), 'photo', null), jsonb_build_object('id', t.e(81), 'photo', t.pic(1)))) is not null,
  'sync() cu pozele activitatilor Anei nu da eroare');
reset role;
select t.ok((select photo from public.entries where id = t.e(80)) = t.pic(1) and (select photo from public.entries where id = t.e(81)) = t.pic(2),
  'pozele activitatilor Anei au ramas neschimbate dupa incercarile lui Bogdan');
select t.ok((select count(*) from storage.objects) = 3, 'si fisierele ei sunt toate la locul lor');

select t.be_anon();
select t.ok((select count(*) from storage.objects) = 0, 'neautentificat: nicio poza nu poate fi citita');
select t.fails($$insert into storage.objects (bucket_id, name) values ('photos', t.a()::text || '/' || t.pic(6))$$, '42501', 'neautentificat: nu se poate incarca nimic');

-- Activitatea devine privata: poza ei nu mai poate fi citita de altcineva. Redevine publica: se poate din nou.
select t.be(t.a());
select t.ok(public.sync(p_vis => jsonb_build_array(jsonb_build_object('id', t.e(80), 'pub', false))) is not null, 'Ana scoate din flux activitatea cu poza');
select t.be(t.b());
select t.ok((select count(*) from storage.objects) = 0, 'poza unei activitati scoase din flux nu mai poate fi citita de Bogdan');
select t.be(t.a());
select t.ok(public.sync(p_vis => jsonb_build_array(jsonb_build_object('id', t.e(80), 'pub', true), jsonb_build_object('id', t.e(81), 'pub', true)),
                        p_photo => jsonb_build_array(jsonb_build_object('id', t.e(81), 'photo', null))) is not null,
  'Ana le face publice pe amandoua si scoate poza celei de-a doua');
select t.be(t.b());
select t.ok((select count(*) from storage.objects) = 1, 'Bogdan vede din nou o singura poza: cea scoasa de la activitate nu mai e a nimanui');
select t.be(t.a());
delete from storage.objects where name like '%' || t.pic(9);
select t.ok((select count(*) from storage.objects) = 2, 'Ana isi sterge o poza prin serviciul de fisiere');
select t.ok(jsonb_array_length(public.sync(p_del => jsonb_build_array(t.e(80), t.e(81), t.e(82), t.e(83)))->'entries') = 4, 'activitatile cu poze se sterg ca oricare altele');
delete from storage.objects;
select set_config('storage.allow_delete_query', 'false', false);
reset role;
select t.ok((select count(*) from storage.objects) = 0, 'dupa curatenie nu mai ramane nicio poza');

-- ---------------------------------------------------------------- stergerea contului
select t.be(t.a());
select t.ok(public.sync(p_vis => jsonb_build_array(jsonb_build_object('id', t.e(1), 'pub', true)))->'entries' @> jsonb_build_array(jsonb_build_object('id', t.e(1), 'cheers', 1)), 'incurajarea lui Carmen a ramas pe activitatea Anei');
select t.be(t.c());
select t.ok(jsonb_array_length(public.sync(p_add => jsonb_build_array(
  jsonb_build_object('id', t.e(60), 'day', current_date, 'ts', t.ms(now()), 'type', 'plus', 'pts', 5, 'name', 'Alergare', 'pub', true)))->'entries') = 1, 'Carmen noteaza o activitate publica');
select t.be(t.b());
select t.ok((public.cheer(t.e(60))->>'cheers')::int = 1, 'Bogdan o incurajeaza');
select t.be(t.c());
select t.ok(public.delete_my_account() = '{"ok": true}'::jsonb, 'Carmen isi sterge contul');
reset role;
select t.ok((select count(*) from auth.users where id = t.c()) = 0, 'contul lui Carmen nu mai exista');
select t.ok((select count(*) from public.profiles where id = t.c()) = 0, 'profilul lui Carmen a disparut');
select t.ok((select count(*) from public.entries where user_id = t.c()) = 0, 'activitatile lui Carmen au disparut');
select t.ok((select count(*) from public.cheers) = 0, 'incurajarile date si primite de Carmen au disparut');
select t.ok((select cheers_count from public.entries where id = t.e(1)) = 0, 'activitatea Anei nu mai numara incurajarea lui Carmen');
select t.ok((select count(*) from auth.users) = 2 and (select count(*) from public.entries where user_id = t.a()) = 4, 'conturile si datele celorlalti au ramas neatinse');
select t.fails($$select public.tg_cheers_count()$$, '0A000', 'functia interna de numarare nu poate fi apelata direct');

\warn SECURITATE: toate verificarile au trecut
