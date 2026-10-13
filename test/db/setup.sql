-- Imita ce exista deja intr-un proiect Supabase, ca supabase/schema.sql sa poata fi incercat pe un PostgreSQL local.
-- Nu se ruleaza niciodata in Supabase.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  encrypted_password text not null,
  created_at timestamptz not null default now()
);

-- La fel ca in Supabase: identitatea vine din datele cererii, puse de serviciul care primeste apelurile.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema public, auth to anon, authenticated, service_role;

-- Supabase da implicit toate drepturile pe orice obiect nou din schema public.
-- Le dam si aici, ca sa se vada ca schema.sql le restrange singura.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
