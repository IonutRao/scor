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

-- Supabase Storage tine evidenta fisierelor in schema storage si verifica fiecare cerere cu regulile de pe storage.objects,
-- cu rolul si identitatea utilizatorului. Aici este doar atat cat foloseste supabase/schema.sql si serverul de test.
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  owner_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  version text,
  user_metadata jsonb,
  unique (bucket_id, name)
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;

-- La fel ca in Supabase: stergerea directa din tabelele de fisiere este refuzata; doar serviciul de fisiere o poate face.
create function storage.protect_delete() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') <> 'true' then
    raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      using errcode = '42501', hint = 'This prevents accidental data loss from orphaned objects.';
  end if;
  return null;
end
$$;
create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();
create trigger protect_buckets_delete before delete on storage.buckets for each statement execute function storage.protect_delete();

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;
