"""Server de test: tine locul Supabase pe calculatorul de dezvoltare.

   - serveste aplicatia construita, cu configuratia indreptata catre el insusi
   - conturi simplificate: /auth/v1/signup, /auth/v1/token, /auth/v1/logout
   - functii: /rest/v1/rpc/<nume>, rulate in PostgreSQL local cu rolul si identitatea utilizatorului,
     adica exact felul in care ajunge o cerere din aplicatie in baza de date Supabase
   - fisiere: /storage/v1/object/..., ca Supabase Storage: fiecare cerere este verificata cu regulile de pe
     storage.objects, cu rolul si identitatea utilizatorului; continutul fisierelor sta in memoria serverului

   Pornire: test/db/start.sh, apoi python3 test/server.py
"""
import http.server
import json
import os
import pathlib
import re
import secrets
import subprocess
import threading
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("SCOR_PORT", "8766"))
PSQL = ["psql", "-X", "-q", "-t", "-A", "-h", "127.0.0.1", "-p", os.environ.get("SCOR_PG_PORT", "54329"),
        "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
TOKENS = {}
FILES = {}
MODE = {"confirm": False, "feed": 0, "patience": 0}
LOCK = threading.Lock()
SIGS = {}
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png"}


def sql(script, **variables):
    args = PSQL[:]
    for k, v in variables.items():
        args += ["-v", f"{k}={v}"]
    p = subprocess.run(args, input=script, capture_output=True, text=True)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def load_signatures():
    code, out, err = sql("""
        select json_agg(json_build_object('name', p.proname, 'args', coalesce(to_json(p.proargnames), '[]'::json),
                        'types', (select coalesce(json_agg(format_type(u.t, null) order by u.i), '[]'::json)
                                  from unnest(p.proargtypes::oid[]) with ordinality as u(t, i))))
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype;""")
    if code:
        raise SystemExit("nu pot citi functiile din baza locala: " + err)
    for f in json.loads(out or "[]"):
        SIGS[f["name"]] = list(zip(f["args"], f["types"]))


def rpc(name, body, uid):
    if name not in SIGS:
        return 404, {"code": "PGRST202", "message": f"Could not find the function public.{name} in the schema cache", "details": None, "hint": None}
    known = dict(SIGS[name])
    parts = []
    for key in body:
        if key not in known:
            return 404, {"code": "PGRST202", "message": f"Could not find the function public.{name}({key}) in the schema cache", "details": None, "hint": None}
        typ = known[key]
        if typ in ("json", "jsonb"):
            parts.append(f"\"{key}\" => nullif(:'args'::jsonb -> '{key}', 'null'::jsonb)")
        else:
            parts.append(f"\"{key}\" => (:'args'::jsonb ->> '{key}')::{typ}")
    role = "authenticated" if uid else "anon"
    claims = json.dumps({"sub": uid, "role": role} if uid else {"role": role})
    script = (
        "\\set VERBOSITY verbose\n"
        "begin;\n"
        f"set local role {role};\n"
        "select set_config('request.jwt.claims', :'claims', true) as claims_set \\gset\n"
        f"select public.\"{name}\"({', '.join(parts)})::text;\n"
        "commit;\n"
    )
    code, out, err = sql(script, args=json.dumps(body), claims=claims)
    if code == 0:
        return 200, (json.loads(out) if out else None)
    m = re.search(r"ERROR:\s+([0-9A-Z]{5}):\s+(.*)", err)
    state, message = (m.group(1), m.group(2).strip()) if m else ("XX000", err)
    status = {"42501": 403 if uid else 401, "23505": 409, "23503": 409}.get(state, 400)
    return status, {"code": state, "message": message, "details": None, "hint": None}


def as_user(uid, body, **variables):
    """Ruleaza comenzile cu rolul si identitatea utilizatorului, ca serviciile Supabase."""
    role = "authenticated" if uid else "anon"
    claims = json.dumps({"sub": uid, "role": role} if uid else {"role": role})
    script = ("\\set VERBOSITY verbose\nbegin;\n" + f"set local role {role};\n"
              "select set_config('request.jwt.claims', :'claims', true) as claims_set \\gset\n" + body + "\ncommit;\n")
    return sql(script, claims=claims, **variables)


def storage_error(status, code, name, message):
    """Raspunsul de eroare al serviciului de fisiere, in forma pe care o primeste biblioteca Supabase."""
    return status, {"statusCode": str(code), "error": name, "message": message}


def storage_upload(bucket, name, data, ctype, uid):
    code, out, err = sql("select coalesce(file_size_limit, 0) || '|' || coalesce(array_to_string(allowed_mime_types, ','), '') "
                         "from storage.buckets where id = :'bucket';", bucket=bucket)
    if code or not out:
        return storage_error(400, 404, "Bucket not found", "Bucket not found")
    limit, mimes = out.split("|", 1)
    if int(limit) and len(data) > int(limit):
        return storage_error(400, 413, "Payload too large", "The object exceeded the maximum allowed size")
    if mimes and ctype.split(";")[0].strip() not in mimes.split(","):
        return storage_error(400, 415, "invalid_mime_type", f"mime type {ctype} is not supported")
    code, out, err = as_user(uid, "insert into storage.objects (bucket_id, name, owner_id, metadata) "
                                  "values (:'bucket', :'name', nullif(:'owner', ''), :'meta'::jsonb) returning id;",
                             bucket=bucket, name=name, owner=uid or "", meta=json.dumps({"size": len(data), "mimetype": ctype}))
    if code:
        if "23505" in err:
            return storage_error(400, 409, "Duplicate", "The resource already exists")
        return storage_error(400, 403, "Unauthorized", "new row violates row-level security policy")
    with LOCK:
        FILES[(bucket, name)] = (data, ctype)
    return 200, {"Key": f"{bucket}/{name}", "Id": out.splitlines()[0]}


def storage_download(bucket, name, uid):
    code, out, err = as_user(uid, "select count(*) from storage.objects where bucket_id = :'bucket' and name = :'name';", bucket=bucket, name=name)
    with LOCK:
        found = FILES.get((bucket, name))
    if code or out != "1" or not found:
        return None
    return found


def storage_remove(bucket, names, uid):
    code, out, err = as_user(uid, "select set_config('storage.allow_delete_query', 'true', true) as allowed \\gset\n"
                                  "delete from storage.objects where bucket_id = :'bucket' and name = any(string_to_array(:'names', E'\\n')) returning name;",
                             bucket=bucket, names="\n".join(names))
    if code:
        return storage_error(400, 500, "DatabaseError", err[:200])
    gone = [n for n in out.splitlines() if n]
    with LOCK:
        for n in gone:
            FILES.pop((bucket, n), None)
    return 200, [{"name": n, "bucket_id": bucket} for n in gone]


def storage_list(bucket, prefix, uid, limit, offset):
    """Fisierele dintr-un dosar, in ordinea numelui, cel mult limit o data: ca serviciul adevarat, care le da pe bucati."""
    code, out, err = as_user(uid, "select coalesce(json_agg(x.j order by x.name), '[]'::json) from ("
                                  "select name, json_build_object('name', substr(name, length(:'prefix') + 2), 'id', id, 'metadata', metadata) as j "
                                  "from storage.objects where bucket_id = :'bucket' and name like :'prefix' || '/%' "
                                  "order by name limit :lim offset :off) x;",
                             bucket=bucket, prefix=prefix.strip("/"), lim=max(1, min(int(limit), 1000)), off=max(0, int(offset)))
    if code:
        return storage_error(400, 500, "DatabaseError", err[:200])
    return 200, json.loads(out or "[]")


def new_session(uid, email):
    token = secrets.token_urlsafe(24)
    with LOCK:
        TOKENS[token] = uid
    return {"access_token": token, "token_type": "bearer", "expires_in": 3600, "refresh_token": secrets.token_urlsafe(12),
            "user": {"id": uid, "aud": "authenticated", "role": "authenticated", "email": email}}


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def send(self, status, body=None, ctype="application/json"):
        data = b"" if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def uid(self):
        token = (self.headers.get("Authorization") or "").replace("Bearer ", "", 1)
        with LOCK:
            return TOKENS.get(token)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/__test/set":
            # confirm=1: conturile noi asteapta confirmarea prin email
            # feed=1000: paginile deschise de acum incolo isi improspateaza fluxul la o secunda, nu la 15
            q = urllib.parse.parse_qs(url.query)
            if "confirm" in q:
                MODE["confirm"] = q["confirm"][0] == "1"
            if "feed" in q:
                MODE["feed"] = int(q["feed"][0])
            # patience=2000: paginile deschise de acum incolo dau pierduta dupa doua secunde, nu dupa trei minute,
            # o cerere catre locul de poze ramasa fara raspuns
            if "patience" in q:
                MODE["patience"] = int(q["patience"][0])
            return self.send(200, MODE)
        if url.path.startswith("/storage/v1/object/"):
            bucket, _, name = urllib.parse.unquote(url.path[len("/storage/v1/object/"):]).partition("/")
            found = storage_download(bucket, name, self.uid())
            if not found:
                return self.send(*storage_error(400, 404, "not_found", "Object not found"))
            return self.send(200, found[0], found[1])
        rel = "index.html" if url.path in ("/", "") else url.path.lstrip("/")
        target = (ROOT / rel).resolve()
        if ROOT not in target.parents or not target.is_file():
            return self.send(404, {"message": "not found"})
        data = target.read_bytes()
        if rel == "index.html":
            cfg = {"backend": {"url": f"http://127.0.0.1:{PORT}", "key": "test-key", "lib": "/test/fake-supabase.js"}}
            if MODE["feed"]:
                cfg["feedEvery"] = MODE["feed"]
            if MODE["patience"]:
                cfg["pumpPatience"] = MODE["patience"]
            text, n = re.subn(r"window\.SCOR_BUILD = \{.*?\};\n", "window.SCOR_BUILD = " + json.dumps(cfg) + ";\n", data.decode("utf-8"), count=1)
            if n != 1:
                return self.send(500, {"message": "config line not found in index.html"})
            data = text.encode("utf-8")
        self.send(200, data, TYPES.get(target.suffix, "application/octet-stream"))

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        if url.path.startswith("/storage/v1/object/") and not url.path.startswith("/storage/v1/object/list/"):
            bucket, _, name = urllib.parse.unquote(url.path[len("/storage/v1/object/"):]).partition("/")
            return self.send(*storage_upload(bucket, name, raw, self.headers.get("Content-Type") or "", self.uid()))
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            return self.send(400, {"message": "bad json"})
        if not isinstance(body, dict):
            return self.send(400, {"message": "bad json"})
        if url.path.startswith("/storage/v1/object/list/"):
            bucket = urllib.parse.unquote(url.path[len("/storage/v1/object/list/"):])
            try:
                limit, offset = int(body.get("limit", 100)), int(body.get("offset", 0))
            except (TypeError, ValueError):
                return self.send(*storage_error(400, 400, "InvalidRequest", "limit and offset must be numbers"))
            return self.send(*storage_list(bucket, str(body.get("prefix", "")), self.uid(), limit, offset))

        if url.path.startswith("/rest/v1/rpc/"):
            status, out = rpc(url.path.rsplit("/", 1)[1], body, self.uid())
            return self.send(status, out)

        if url.path == "/auth/v1/signup":
            email, password = str(body.get("email", "")).strip().lower(), str(body.get("password", ""))
            if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
                return self.send(400, {"code": 400, "error_code": "validation_failed", "msg": "Unable to validate email address: invalid format"})
            if len(password) < 6:
                return self.send(422, {"code": 422, "error_code": "weak_password", "msg": "Password should be at least 6 characters."})
            code, out, err = sql("insert into auth.users (email, encrypted_password) values (:'email', :'pw') returning id;", email=email, pw=password)
            if code:
                return self.send(422, {"code": 422, "error_code": "user_already_exists", "msg": "User already registered"})
            if MODE["confirm"]:
                return self.send(200, {"id": out, "aud": "authenticated", "role": "authenticated", "email": email, "confirmation_sent_at": "now"})
            return self.send(200, new_session(out, email))

        if url.path == "/auth/v1/token":
            email, password = str(body.get("email", "")).strip().lower(), str(body.get("password", ""))
            code, out, err = sql("select id from auth.users where email = :'email' and encrypted_password = :'pw';", email=email, pw=password)
            if code or not out:
                return self.send(400, {"code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials"})
            return self.send(200, new_session(out, email))

        if url.path == "/auth/v1/logout":
            # Ca in Supabase: iesirea din cont nu anuleaza tokenul de acces deja emis, care ramane bun pana expira.
            # O cerere pornita inainte de iesire, sau una facuta cu tokenul vechi, este primita in continuare.
            return self.send(204)

        self.send(404, {"message": "not found"})


    def do_DELETE(self):
        url = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            body = {}
        if url.path.startswith("/storage/v1/object/"):
            bucket = urllib.parse.unquote(url.path[len("/storage/v1/object/"):]).strip("/")
            names = [str(n) for n in body.get("prefixes", []) if isinstance(n, str)]
            return self.send(*storage_remove(bucket, names, self.uid()))
        self.send(404, {"message": "not found"})


if __name__ == "__main__":
    load_signatures()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"server de test pe http://127.0.0.1:{PORT} ({len(SIGS)} functii)", flush=True)
    server.serve_forever()
