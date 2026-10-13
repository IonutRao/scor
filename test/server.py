"""Server de test: tine locul Supabase pe calculatorul de dezvoltare.

   - serveste aplicatia construita, cu configuratia indreptata catre el insusi
   - conturi simplificate: /auth/v1/signup, /auth/v1/token, /auth/v1/logout
   - functii: /rest/v1/rpc/<nume>, rulate in PostgreSQL local cu rolul si identitatea utilizatorului,
     adica exact felul in care ajunge o cerere din aplicatie in baza de date Supabase

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
MODE = {"confirm": False, "feed": 0}
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
            return self.send(200, MODE)
        rel = "index.html" if url.path in ("/", "") else url.path.lstrip("/")
        target = (ROOT / rel).resolve()
        if ROOT not in target.parents or not target.is_file():
            return self.send(404, {"message": "not found"})
        data = target.read_bytes()
        if rel == "index.html":
            cfg = {"backend": {"url": f"http://127.0.0.1:{PORT}", "key": "test-key", "lib": "/test/fake-supabase.js"}}
            if MODE["feed"]:
                cfg["feedEvery"] = MODE["feed"]
            text, n = re.subn(r"window\.SCOR_BUILD = \{.*?\};\n", "window.SCOR_BUILD = " + json.dumps(cfg) + ";\n", data.decode("utf-8"), count=1)
            if n != 1:
                return self.send(500, {"message": "config line not found in index.html"})
            data = text.encode("utf-8")
        self.send(200, data, TYPES.get(target.suffix, "application/octet-stream"))

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self.send(400, {"message": "bad json"})
        if not isinstance(body, dict):
            return self.send(400, {"message": "bad json"})

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
            token = (self.headers.get("Authorization") or "").replace("Bearer ", "", 1)
            with LOCK:
                TOKENS.pop(token, None)
            return self.send(204)

        self.send(404, {"message": "not found"})


if __name__ == "__main__":
    load_signatures()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"server de test pe http://127.0.0.1:{PORT} ({len(SIGS)} functii)", flush=True)
    server.serve_forever()
