#!/usr/bin/env python3
import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import threading
from datetime import datetime, timezone
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".tts_cache"
CACHE.mkdir(exist_ok=True)

KOREAN_VOICES = [
    {"ShortName": "gtts-ko-human", "Locale": "ko-KR", "FriendlyName": "Google 자연 낭독"},
    {"ShortName": "gtts-ko", "Locale": "ko-KR", "FriendlyName": "Google 한국어"},
    {"ShortName": "ko-KR-HyunsuMultilingualNeural", "Locale": "ko-KR", "FriendlyName": "Hyunsu 남성"},
    {"ShortName": "ko-KR-InJoonNeural", "Locale": "ko-KR", "FriendlyName": "InJoon 남성"},
    {"ShortName": "ko-KR-SunHiNeural", "Locale": "ko-KR", "FriendlyName": "SunHi 여성"},
]
KOREAN_VOICE_NAMES = {v["ShortName"] for v in KOREAN_VOICES}
SILENCE_MP3_BASE64 = {
    280: "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAADgAAAhAAaGhoaGhoaHR0dHR0dHSAgICAgICAi4uLi4uLi5eXl5eXl5eioqKioqKirq6urq6urrq6urq6urq6xcXFxcXFxdHR0dHR0dHd3d3d3d3d6Ojo6Ojo6PT09PT09PT/////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQDAAAAAAAAAAIQ9gcbIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//MUxAAAAANIAAAAAExBTUUzLjEwMFVV//MUxAsAAANIAAAAAFVVVVVVVVVVVVVV//MUxBYAAANIAAAAAFVVVVVVVVVVVVVV//MUxCEAAANIAAAAAFVVVVVVVVVVVVVV//MUxCwAAANIAAAAAFVVVVVVVVVVVVVV//MUxDcAAANIAAAAAFVVVVVVVVVVVVVV//MUxEIAAANIAAAAAFVVVVVVVVVVVVVV//MUxE0AAANIAAAAAFVVVVVVVVVVVVVV//MUxFgAAANIAAAAAFVVVVVVVVVVVVVV//MUxGMAAANIAAAAAFVVVVVVVVVVVVVV//MUxG4AAANIAAAAAFVVVVVVVVVVVVVV//MUxHkAAANIAAAAAFVVVVVVVVVVVVVV//MUxIQAAANIAAAAAFVVVVVVVVVVVVVV//MUxI8AAANIAAAAAFVVVVVVVVVVVVVV",
    520: "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAAGAAAAwAASEhISFBQUFBYWFhYYGBgYGhoaGhwcHBweHh4eHiAgICAiIiIiJCQkJCYmJiYoKCgoKioqKiosLCwsLi4uLjAwMDAyMjIyNDQ0NDY2NjY2ODg4ODo6Ojo8PDw8Pj4+Pj/////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQDAAAAAAAAAAMAvyaQwgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//MUxAAAAANIAAAAAExBTUUzLjEwMExB//MUxAsAAANIAAAAAE1FMy4xMDBVVVVV//MUxBYAAANIAAAAAFVVVVVVVVVVVVVV//MUxCEAAANIAAAAAFVVVVVVVVVVVVVV//MUxCwAAANIAAAAAFVVVVVVVVVVVVVV//MUxDcAAANIAAAAAFVVVVVVVVVVVVVV//MUxEIAAANIAAAAAFVVVVVVVVVVVVVV//MUxE0AAANIAAAAAFVVVVVVVVVVVVVV//MUxFgAAANIAAAAAFVVVVVVVVVVVVVV//MUxGMAAANIAAAAAFVVVVVVVVVVVVVV//MUxG4AAANIAAAAAFVVVVVVVVVVVVVV//MUxHkAAANIAAAAAFVVVVVVVVVVVVVV//MUxIQAAANIAAAAAFVVVVVVVVVVVVVV//MUxI8AAANIAAAAAFVVVVVVVVVVVVVV//MUxJoAAANIAAAAAFVVVVVVVVVVVVVV//MUxKUAAANIAAAAAFVVVVVVVVVVVVVV//MUxLAAAANIAAAAAFVVVVVVVVVVVVVV//MUxLsAAANIAAAAAFVVVVVVVVVVVVVV//MUxMYAAANIAAAAAFVVVVVVVVVVVVVV//MUxNEAAANIAAAAAFVVVVVVVVVVVVVV//MUxNwAAANIAAAAAFVVVVVVVVVVVVVV//MUxOcAAANIAAAAAFVVVVVVVVVVVVVV//MUxPIAAANIAAAAAFVVVVVVVVVVVVVV//MUxPQAAANIAAAAAFVVVVVVVVVVVVVV",
}
CACHE_VERSION = "audiobook-reading-v2"
RATE_MAP = {
    "0.5": "-50%",
    "0.6": "-40%",
    "0.7": "-30%",
    "0.8": "-20%",
    "0.9": "-10%",
    "1": "+0%",
    "1.0": "+0%",
    "1.1": "+10%",
    "1.2": "+20%",
    "1.3": "+30%",
    "1.4": "+40%",
    "1.5": "+50%",
    "1.6": "+60%",
    "1.7": "+70%",
    "1.8": "+80%",
    "1.9": "+90%",
    "2": "+100%",
    "2.0": "+100%",
}
DEFAULT_BETA_CONTACT_URL = "https://open.kakao.com/o/sKDe1RBi"
USER_STORE = Path(os.environ.get("DOC_LISTEN_USER_STORE_PATH", ROOT / ".doclisten_users.json"))
OAUTH_STATE_STORE = ROOT / ".doclisten_oauth_states.json"
USER_STORE_LOCK = threading.Lock()
OAUTH_STATE_LOCK = threading.Lock()
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/voices":
            return self.send_json({"voices": KOREAN_VOICES})
        if path == "/api/config":
            return self.send_json(get_public_config())
        if path == "/api/health":
            return self.send_json(get_health_status())
        if path == "/api/me":
            token = self.headers.get("X-DocListen-Token", "")
            return self.send_json(get_user_status(token))
        if path == "/api/oauth/start":
            provider = (parse_qs(urlparse(self.path).query).get("provider") or [""])[0]
            return start_oauth_flow(self, provider)
        if path.startswith("/api/oauth/callback/"):
            provider = path.rsplit("/", 1)[-1]
            query = parse_qs(urlparse(self.path).query)
            return finish_oauth_flow(self, provider, query)
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/login":
            return self.send_json({"ok": False, "reason": "google-login-required"}, status=410)
        try:
            length = int(self.headers.get("content-length", "0"))
            try:
                payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return self.send_json({"ok": False, "reason": "invalid-json"}, status=400)
            if path == "/api/listen":
                token = self.headers.get("X-DocListen-Token", "") or str(payload.get("token", ""))
                return self.send_json(record_listen_usage(token))
            if path == "/api/logout":
                token = self.headers.get("X-DocListen-Token", "") or str(payload.get("token", ""))
                result = revoke_user_token(token)
                return self.send_json(result, status=200 if result.get("ok") else 400)
            if path == "/api/delete-account":
                token = self.headers.get("X-DocListen-Token", "") or str(payload.get("token", ""))
                result = delete_user_account(token)
                return self.send_json(result, status=200 if result.get("ok") else 400)
            if path == "/api/activate":
                token = self.headers.get("X-DocListen-Token", "") or str(payload.get("token", ""))
                code = str(payload.get("code", "")).strip()
                result = mark_user_paid_with_code(token, code)
                return self.send_json(result, status=200 if result.get("ok") else 400)
            if path != "/api/tts":
                self.send_error(404)
                return
            text = str(payload.get("text", "")).strip()
            voice = str(payload.get("voice", "ko-KR-SunHiNeural"))
            rate = str(payload.get("rate", "1"))
            if not text:
                self.send_error(400, "text required")
                return
            if voice not in KOREAN_VOICE_NAMES:
                self.send_error(400, f"unsupported Korean voice: {voice}")
                return
            audio_text = normalize_tts_pronunciation(text[:1800])
            audio_path = synthesize_cached(audio_text, voice, rate)
            data = audio_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("X-TTS-Voice", voice)
            self.send_header("X-TTS-Locale", "ko-KR")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=31536000")
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            self.send_error(500, str(exc))

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_html(self, html: str, status=200):
        data = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_redirect(self, location: str):
        self.send_response(302)
        self.send_header("Location", location)
        self.end_headers()


def today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def is_valid_email(email: str) -> bool:
    return bool(EMAIL_RE.fullmatch(str(email or "").strip().lower()))


def normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def admin_emails() -> set[str]:
    raw = os.environ.get("DOC_LISTEN_ADMIN_EMAILS", "")
    return {normalize_email(item) for item in re.split(r"[,\s]+", raw) if is_valid_email(item)}


def is_admin_email(email: str) -> bool:
    return normalize_email(email) in admin_emails()


def sync_admin_plan(user: dict, auth_provider: str = "") -> bool:
    if auth_provider == "google" and is_admin_email(user.get("email", "")) and user.get("plan") != "admin":
        user["plan"] = "admin"
        user["adminGrantedAt"] = datetime.now(timezone.utc).isoformat()
        return True
    return False


def is_sqlite_user_store(path: Path = USER_STORE) -> bool:
    return Path(path).suffix.lower() in {".db", ".sqlite", ".sqlite3"}


def init_sqlite_user_store(path: Path = USER_STORE):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                token TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                plan TEXT NOT NULL DEFAULT 'free',
                auth_provider TEXT NOT NULL DEFAULT 'manual',
                usage_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                admin_granted_at TEXT,
                activated_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS beta_codes (
                code TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                used_at TEXT NOT NULL
            )
            """
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "activated_code" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN activated_code TEXT")
        conn.commit()


def sqlite_row_to_user(row: sqlite3.Row) -> dict:
    try:
        usage = json.loads(row["usage_json"] or "{}")
    except Exception:
        usage = {}
    user = {
        "email": row["email"],
        "token": row["token"],
        "plan": row["plan"] or "free",
        "authProvider": row["auth_provider"] or "manual",
        "usage": usage if isinstance(usage, dict) else {},
        "createdAt": row["created_at"],
    }
    if row["admin_granted_at"]:
        user["adminGrantedAt"] = row["admin_granted_at"]
    if row["activated_at"]:
        user["activatedAt"] = row["activated_at"]
    if "activated_code" in row.keys() and row["activated_code"]:
        user["activatedCode"] = row["activated_code"]
    return user


def empty_user_store() -> dict:
    return {"users": {}, "usedBetaCodes": {}}


def load_user_store(path: Path = USER_STORE) -> dict:
    path = Path(path)
    if is_sqlite_user_store(path):
        init_sqlite_user_store(path)
        with sqlite3.connect(path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM users").fetchall()
            code_rows = conn.execute("SELECT * FROM beta_codes").fetchall()
        return {
            "users": {row["token"]: sqlite_row_to_user(row) for row in rows},
            "usedBetaCodes": {row["code"]: {"email": row["email"], "usedAt": row["used_at"]} for row in code_rows},
        }
    if not path.exists():
        return empty_user_store()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return empty_user_store()
    if not isinstance(data, dict) or not isinstance(data.get("users"), dict):
        return empty_user_store()
    if not isinstance(data.get("usedBetaCodes"), dict):
        data["usedBetaCodes"] = {}
    return data


def save_user_store(data: dict, path: Path = USER_STORE):
    path = Path(path)
    if is_sqlite_user_store(path):
        init_sqlite_user_store(path)
        users = data.get("users", {}) if isinstance(data, dict) else {}
        used_codes = data.get("usedBetaCodes", {}) if isinstance(data, dict) else {}
        with sqlite3.connect(path) as conn:
            conn.execute("DELETE FROM users")
            conn.executemany(
                """
                INSERT INTO users (
                    token, email, plan, auth_provider, usage_json,
                    created_at, admin_granted_at, activated_at, activated_code
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        user.get("token", token),
                        normalize_email(user.get("email", "")),
                        user.get("plan", "free"),
                        user.get("authProvider", "manual"),
                        json.dumps(user.get("usage") or {}, ensure_ascii=False),
                        user.get("createdAt") or datetime.now(timezone.utc).isoformat(),
                        user.get("adminGrantedAt"),
                        user.get("activatedAt"),
                        user.get("activatedCode"),
                    )
                    for token, user in users.items()
                    if is_valid_email(user.get("email", ""))
                ],
            )
            conn.execute("DELETE FROM beta_codes")
            conn.executemany(
                """
                INSERT INTO beta_codes (code, email, used_at) VALUES (?, ?, ?)
                """,
                [
                    (
                        str(code),
                        normalize_email(item.get("email", "")),
                        item.get("usedAt") or datetime.now(timezone.utc).isoformat(),
                    )
                    for code, item in used_codes.items()
                    if str(code).strip() and is_valid_email(item.get("email", ""))
                ],
            )
            conn.commit()
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_oauth_state_store(path: Path = OAUTH_STATE_STORE) -> dict:
    if not path.exists():
        return {"states": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"states": {}}
    if not isinstance(data, dict) or not isinstance(data.get("states"), dict):
        return {"states": {}}
    return data


def save_oauth_state_store(data: dict, path: Path = OAUTH_STATE_STORE):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def remember_oauth_state(provider: str, redirect_uri: str, path: Path = OAUTH_STATE_STORE) -> str:
    state = secrets.token_urlsafe(24)
    with OAUTH_STATE_LOCK:
        data = load_oauth_state_store(path)
        data["states"][state] = {
            "provider": provider,
            "redirectUri": redirect_uri,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        save_oauth_state_store(data, path)
    return state


def consume_oauth_state(state: str, provider: str, path: Path = OAUTH_STATE_STORE) -> dict | None:
    with OAUTH_STATE_LOCK:
        data = load_oauth_state_store(path)
        item = data["states"].pop(str(state or ""), None)
        save_oauth_state_store(data, path)
    if not item or item.get("provider") != provider:
        return None
    return item


def public_user(user: dict) -> dict:
    return {
        "email": user.get("email", ""),
        "token": user.get("token", ""),
        "plan": user.get("plan", "free"),
    }


def get_or_create_user(email: str, path: Path = USER_STORE, auth_provider: str = "") -> dict:
    email = normalize_email(email)
    if not is_valid_email(email):
        raise ValueError("invalid email")
    with USER_STORE_LOCK:
        data = load_user_store(path)
        for user in data["users"].values():
            if user.get("email") == email:
                if sync_admin_plan(user, auth_provider):
                    save_user_store(data, path)
                return public_user(user)
        token = secrets.token_urlsafe(24)
        data["users"][token] = {
            "email": email,
            "token": token,
            "plan": "admin" if auth_provider == "google" and is_admin_email(email) else "free",
            "authProvider": auth_provider or "manual",
            "usage": {},
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        save_user_store(data, path)
        return public_user(data["users"][token])


def find_user_by_token(token: str, path: Path = USER_STORE) -> tuple[dict, dict | None]:
    data = load_user_store(path)
    user = data["users"].get(str(token or ""))
    return data, user


def create_usage_snapshot(user: dict | None, day: str | None = None, limit: int | None = None) -> dict:
    limit = int(limit or os.environ.get("DOC_LISTEN_FREE_DAILY_LIMIT", "20"))
    day = day or today_key()
    if not user:
        return {"authenticated": False, "plan": "free", "day": day, "used": 0, "limit": limit, "remaining": limit, "reached": False}
    plan = user.get("plan", "free")
    used = int((user.get("usage") or {}).get(day, 0))
    if plan != "free":
        return {"authenticated": True, "plan": plan, "day": day, "used": used, "limit": limit, "remaining": None, "reached": False}
    remaining = max(0, limit - used)
    return {"authenticated": True, "plan": plan, "day": day, "used": used, "limit": limit, "remaining": remaining, "reached": used >= limit}


def get_user_status(token: str, path: Path = USER_STORE) -> dict:
    with USER_STORE_LOCK:
        data, user = find_user_by_token(token, path)
        if not user:
            return {"ok": False, "reason": "not-authenticated", "usage": create_usage_snapshot(None)}
        if sync_admin_plan(user, user.get("authProvider", "")):
            save_user_store(data, path)
        return {"ok": True, "user": public_user(user), "usage": create_usage_snapshot(user)}


def revoke_user_token(token: str, path: Path = USER_STORE) -> dict:
    with USER_STORE_LOCK:
        data, user = find_user_by_token(token, path)
        if not user:
            return {"ok": False, "reason": "not-authenticated"}
        old_token = str(token or "")
        new_token = secrets.token_urlsafe(24)
        while new_token in data["users"]:
            new_token = secrets.token_urlsafe(24)
        data["users"].pop(old_token, None)
        user["token"] = new_token
        user["lastLogoutAt"] = datetime.now(timezone.utc).isoformat()
        data["users"][new_token] = user
        save_user_store(data, path)
        return {"ok": True, "revoked": True}


def delete_user_account(token: str, path: Path = USER_STORE) -> dict:
    with USER_STORE_LOCK:
        data, user = find_user_by_token(token, path)
        if not user:
            return {"ok": False, "reason": "not-authenticated"}
        email = user.get("email", "")
        tokens_to_delete = [item_token for item_token, item in data["users"].items() if item.get("email") == email]
        for item_token in tokens_to_delete:
            data["users"].pop(item_token, None)
        save_user_store(data, path)
        return {"ok": True, "deleted": True}


def record_listen_usage(token: str, path: Path = USER_STORE, day: str | None = None, limit: int | None = None) -> dict:
    day = day or today_key()
    limit = int(limit or os.environ.get("DOC_LISTEN_FREE_DAILY_LIMIT", "20"))
    with USER_STORE_LOCK:
        data, user = find_user_by_token(token, path)
        if not user:
            return {"allowed": False, "reason": "not-authenticated", "usage": create_usage_snapshot(None, day, limit)}
        if sync_admin_plan(user, user.get("authProvider", "")):
            save_user_store(data, path)
        usage = create_usage_snapshot(user, day, limit)
        if user.get("plan", "free") == "free" and usage["reached"]:
            return {"allowed": False, "reason": "free-daily-limit", "usage": usage, "user": public_user(user)}
        user.setdefault("usage", {})[day] = int(user.setdefault("usage", {}).get(day, 0)) + 1
        save_user_store(data, path)
        return {"allowed": True, "reason": "ok", "usage": create_usage_snapshot(user, day, limit), "user": public_user(user)}


def beta_access_codes() -> tuple[set[str], bool]:
    multi_codes = {
        item.strip()
        for item in os.environ.get("DOC_LISTEN_BETA_ACCESS_CODES", "").split(",")
        if item.strip()
    }
    if multi_codes:
        return multi_codes, True
    single_code = os.environ.get("DOC_LISTEN_BETA_ACCESS_CODE", "").strip()
    return ({single_code} if single_code else set()), False


def mark_user_paid_with_code(token: str, code: str, path: Path = USER_STORE) -> dict:
    codes, one_time_codes = beta_access_codes()
    submitted_code = str(code or "").strip()
    if not codes:
        return {"ok": False, "reason": "code-not-configured"}
    if submitted_code not in codes:
        return {"ok": False, "reason": "invalid-code"}
    with USER_STORE_LOCK:
        data, user = find_user_by_token(token, path)
        if not user:
            return {"ok": False, "reason": "not-authenticated"}
        if one_time_codes:
            used_codes = data.setdefault("usedBetaCodes", {})
            existing_use = used_codes.get(submitted_code)
            if existing_use and existing_use.get("email") != user.get("email"):
                return {"ok": False, "reason": "code-already-used"}
            if user.get("activatedCode") and user.get("activatedCode") != submitted_code:
                return {"ok": False, "reason": "code-already-used"}
            if not existing_use:
                used_codes[submitted_code] = {
                    "email": user.get("email", ""),
                    "usedAt": datetime.now(timezone.utc).isoformat(),
                }
            user["activatedCode"] = submitted_code
        user["plan"] = "beta-pro"
        user["activatedAt"] = datetime.now(timezone.utc).isoformat()
        save_user_store(data, path)
        return {"ok": True, "user": public_user(user), "usage": create_usage_snapshot(user)}


def get_base_url(handler=None) -> str:
    configured = safe_public_url(os.environ.get("DOC_LISTEN_BASE_URL", "")) if "safe_public_url" in globals() else ""
    if configured:
        return configured.rstrip("/")
    host = handler.headers.get("Host", "doclisten.app") if handler else "doclisten.app"
    scheme = "http" if host.startswith("127.0.0.1") or host.startswith("localhost") else "https"
    return f"{scheme}://{host}".rstrip("/")


def oauth_redirect_uri(provider: str, handler=None) -> str:
    return f"{get_base_url(handler)}/api/oauth/callback/{provider}"


def oauth_provider_config(provider: str) -> dict:
    provider = str(provider or "").lower()
    if provider == "google":
        return {
            "provider": "google",
            "clientId": os.environ.get("GOOGLE_CLIENT_ID", "").strip(),
            "clientSecret": os.environ.get("GOOGLE_CLIENT_SECRET", "").strip(),
            "authorizeUrl": "https://accounts.google.com/o/oauth2/v2/auth",
            "tokenUrl": "https://oauth2.googleapis.com/token",
            "userInfoUrl": "https://openidconnect.googleapis.com/v1/userinfo",
            "scope": "openid email profile",
        }
    return {}


def configured_social_providers() -> list[str]:
    providers = []
    for provider in ["google"]:
        config = oauth_provider_config(provider)
        if config.get("clientId") and config.get("clientSecret"):
            providers.append(provider)
    return providers


def build_oauth_authorize_url(provider: str, redirect_uri: str, state: str) -> str:
    config = oauth_provider_config(provider)
    if not config:
        raise ValueError("unsupported provider")
    params = {
        "client_id": config["clientId"],
        "redirect_uri": redirect_uri,
        "state": state,
    }
    if provider == "google":
        params.update({"response_type": "code", "scope": config["scope"], "access_type": "offline", "prompt": "select_account"})
    return f"{config['authorizeUrl']}?{urlencode(params)}"


def provider_display_name(provider: str) -> str:
    return {"google": "Google"}.get(provider, provider)


def oauth_error_html(message: str) -> str:
    return f"""<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>로그인 오류</title></head><body style=\"font-family:system-ui;padding:24px;background:#070a12;color:#f8fafc\"><h1>소셜 로그인을 사용할 수 없습니다</h1><p>{message}</p><p><a style=\"color:#93c5fd\" href=\"/\">DocListen으로 돌아가기</a></p></body></html>"""


def oauth_success_html(user: dict) -> str:
    token = json.dumps(user.get("token", ""))
    email = json.dumps(user.get("email", ""))
    return f"""<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>로그인 완료</title></head><body style=\"font-family:system-ui;padding:24px;background:#070a12;color:#f8fafc\"><h1>로그인 완료</h1><p>DocListen으로 돌아갑니다.</p><script>localStorage.setItem('doclisten-user-token', {token}); localStorage.setItem('doclisten-user-email', {email}); location.replace('/');</script></body></html>"""


def start_oauth_flow(handler, provider: str):
    provider = str(provider or "").lower()
    config = oauth_provider_config(provider)
    if not config:
        return handler.send_html(oauth_error_html("지원하지 않는 로그인 방식입니다."), status=400)
    if not config.get("clientId") or not config.get("clientSecret"):
        return handler.send_html(oauth_error_html(f"{provider_display_name(provider)} 로그인 키가 아직 설정되지 않았습니다. Render 환경변수 설정이 필요합니다."), status=503)
    redirect_uri = oauth_redirect_uri(provider, handler)
    state = remember_oauth_state(provider, redirect_uri)
    handler.send_redirect(build_oauth_authorize_url(provider, redirect_uri, state))


def post_form_json(url: str, form: dict, headers: dict | None = None) -> dict:
    data = urlencode(form).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded", **(headers or {})}, method="POST")
    with urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def get_bearer_json(url: str, access_token: str) -> dict:
    req = Request(url, headers={"Authorization": f"Bearer {access_token}"})
    with urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def exchange_oauth_code(provider: str, code: str, redirect_uri: str) -> dict:
    config = oauth_provider_config(provider)
    form = {
        "grant_type": "authorization_code",
        "client_id": config["clientId"],
        "client_secret": config["clientSecret"],
        "code": code,
        "redirect_uri": redirect_uri,
    }
    token = post_form_json(config["tokenUrl"], form)
    access_token = token.get("access_token")
    if not access_token:
        raise ValueError("access token missing")
    return get_bearer_json(config["userInfoUrl"], access_token)


def extract_oauth_email(provider: str, profile: dict) -> str:
    if provider == "google":
        if profile.get("email_verified") is not True:
            return ""
        return normalize_email(profile.get("email", ""))
    return ""


def finish_oauth_flow(handler, provider: str, query: dict):
    provider = str(provider or "").lower()
    code = (query.get("code") or [""])[0]
    state = (query.get("state") or [""])[0]
    item = consume_oauth_state(state, provider)
    if not item or not code:
        return handler.send_html(oauth_error_html("로그인 상태값이 만료되었거나 잘못되었습니다. 다시 시도해주세요."), status=400)
    try:
        profile = exchange_oauth_code(provider, code, item["redirectUri"])
        email = extract_oauth_email(provider, profile)
        if not is_valid_email(email):
            return handler.send_html(oauth_error_html("소셜 계정에서 이메일을 확인할 수 없습니다. 이메일 제공 권한을 허용해주세요."), status=400)
        user = get_or_create_user(email, auth_provider=provider)
        return handler.send_html(oauth_success_html(user))
    except Exception as exc:
        return handler.send_html(oauth_error_html(f"소셜 로그인 처리 중 오류가 발생했습니다: {str(exc)}"), status=500)


def safe_public_url(value: str) -> str:
    url = str(value or "").strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        return ""
    return url


def get_public_config() -> dict:
    payment_url = safe_public_url(os.environ.get("DOC_LISTEN_PAYMENT_URL", DEFAULT_BETA_CONTACT_URL))
    env_provider = os.environ.get("DOC_LISTEN_PAYMENT_PROVIDER", "kakao-openchat")
    env_price_label = os.environ.get("DOC_LISTEN_BETA_PRICE_LABEL", "월 4,900원 · 카카오톡 베타 신청")
    is_kakao_openchat = "open.kakao.com" in payment_url
    return {
        "paymentProvider": "kakao-openchat" if is_kakao_openchat else env_provider,
        "paymentUrl": payment_url,
        "betaPriceLabel": "월 4,900원 · 카카오톡 베타 신청" if is_kakao_openchat else env_price_label,
        "freeDailyLimit": int(os.environ.get("DOC_LISTEN_FREE_DAILY_LIMIT", "20")),
        "serverUsage": True,
        "activationEnabled": bool(os.environ.get("DOC_LISTEN_BETA_ACCESS_CODE", "").strip()),
        "socialLoginProviders": configured_social_providers(),
    }


def get_health_status() -> dict:
    store_path = Path(os.environ.get("DOC_LISTEN_USER_STORE_PATH", USER_STORE))
    return {
        "ok": True,
        "storage": "sqlite" if is_sqlite_user_store(store_path) else "json",
        "googleOAuthConfigured": bool(os.environ.get("GOOGLE_CLIENT_ID", "").strip() and os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()),
        "betaActivationConfigured": bool(os.environ.get("DOC_LISTEN_BETA_ACCESS_CODE", "").strip()),
        "freeDailyLimit": int(os.environ.get("DOC_LISTEN_FREE_DAILY_LIMIT", "20")),
    }


def _format_count_korean(count: int) -> str:
    labels = {2: "두", 3: "세", 4: "네", 5: "다섯", 6: "여섯", 7: "일곱", 8: "여덟"}
    return labels.get(count, str(count))


def _naturalize_item(item: str, final: bool = False) -> str:
    cleaned = re.sub(r"\s+", " ", item).strip(" .")
    cleaned = re.sub(r"이다$|입니다$|한다$|합니다$", "", cleaned).strip()
    suffix = "입니다." if final else "."
    return f"{cleaned}{suffix}"


def _generic_list_to_reading_script(spoken: str) -> str:
    match = re.fullmatch(r"(.{2,35}?)(?:은|는)\s+(.+?)(?:이다|입니다|한다|합니다)\.?", spoken)
    if not match:
        return ""
    topic, raw_items = match.groups()
    if raw_items.count(",") < 1:
        return ""
    items = [item.strip() for item in re.split(r"\s*,\s*", raw_items) if item.strip()]
    if not 2 <= len(items) <= 8:
        return ""
    if any(len(item) > 35 for item in items):
        return ""

    connectors = ["먼저", "그다음", "그리고"]
    sentences = [f"{topic}은, 크게 {_format_count_korean(len(items))} 가지입니다."]
    for index, item in enumerate(items):
        if index == len(items) - 1:
            sentences.append(f"마지막으로 {_naturalize_item(item, final=True)}")
        else:
            connector = connectors[min(index, len(connectors) - 1)]
            sentences.append(f"{connector} {_naturalize_item(item)}")
    return " ".join(sentences)


def transform_to_reading_script(text: str) -> str:
    """문서용 PDF 문장을 TTS가 더 사람처럼 설명하도록 읽기용 문장으로 바꾼다.

    화면에 보이는 PDF 원문은 건드리지 않고, 음성 생성 입력에만 적용한다.
    """
    spoken = re.sub(r"\s+", " ", text).strip()
    if not spoken:
        return ""

    # 문서식 나열 문장을 말로 설명하는 문장으로 변환한다.
    plan_match = re.fullmatch(
        r"가격\s*정책\s*및\s*회원\s*플랜\s*설계는\s*무료\s*체험,\s*베이직,\s*프로,\s*엔터프라이즈\s*플랜으로\s*구성한다\. ?",
        spoken,
    )
    if plan_match:
        return " ".join([
            "가격 정책과 회원 플랜은, 크게 네 가지로 나눌 수 있습니다.",
            "먼저 무료 체험.",
            "그다음 베이직.",
            "그리고 프로.",
            "마지막으로 엔터프라이즈 플랜입니다.",
        ])

    generic_list = _generic_list_to_reading_script(spoken)
    if generic_list:
        spoken = generic_list

    # 긴 사업 설명 문장은 연결어를 넣어 리듬을 만든다.
    spoken = re.sub(
        r"단계별\s*사업\s*확장\s*전략은\s*초기\s*고객\s*확보와\s*유료\s*전환율\s*검증\s*이후\s*본격적으로\s*시장(?:을|을\s*)\s*넓히는\s*방식입니다\.",
        "단계별 사업 확장 전략은, 먼저 초기 고객 확보와 그다음 유료 전환율 검증 이후 본격적으로 시장을 넓히는 방식입니다.",
        spoken,
    )

    # 자주 나오는 문서 표현 앞에는 약한 쉼표를 넣어 한 덩어리로 밀어 읽지 않게 한다.
    spoken = re.sub(r"(?<![.!?。！？])\s+(먼저|그리고|하지만|다만|즉|예를 들어|그다음|마지막으로)\s+", r", \1 ", spoken)
    spoken = re.sub(r"\s+(이후|뒤)\s+", r" \1, ", spoken)
    return re.sub(r"\s+", " ", spoken).strip()


def normalize_tts_pronunciation(text: str) -> str:
    normalized = transform_to_reading_script(text)
    # TTS가 `사업확장`을 `싸업확장`처럼 뭉개 읽는 것을 줄이기 위한 음성 전용 보정.
    normalized = re.sub(r"사업\s*(확장|계획|모델|전략|구조|운영|부문|단계|화|성장)", r"사업 \1", normalized)
    normalized = re.sub(r"단계별\s*사업\s*확장", "단계별 사업 확장", normalized)
    normalized = re.sub(r"([가-힣])\s+([.,!?])", r"\1\2", normalized)
    return normalized


def synthesize_cached(text: str, voice: str, rate: str) -> Path:
    safe_rate = RATE_MAP.get(rate, "+0%")
    key = hashlib.sha256(json.dumps({"version": CACHE_VERSION, "text": text, "voice": voice, "rate": safe_rate}, ensure_ascii=False).encode()).hexdigest()
    out = CACHE / f"{key}.mp3"
    if out.exists() and out.stat().st_size > 0:
        return out
    if voice == "gtts-ko-human":
        synthesize_gtts_human(text, out)
    elif voice == "gtts-ko":
        synthesize_gtts(text, out)
    else:
        asyncio.run(synthesize_edge(text, voice, safe_rate, out))
    return out


def split_multilingual_tts_segments(text: str) -> list[tuple[str, str]]:
    """한국어 TTS가 영어를 억지로 읽지 않도록 영어 구간을 분리한다."""
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []

    english_pattern = re.compile(r"[A-Za-z][A-Za-z0-9&+./:#%_-]*(?:\s+[A-Za-z][A-Za-z0-9&+./:#%_-]*)*[.!?]?")
    segments: list[tuple[str, str]] = []
    cursor = 0
    for match in english_pattern.finditer(normalized):
        start, end = match.span()
        if start > cursor:
            ko = normalized[cursor:start].strip()
            if ko:
                segments.append(("ko", ko))
        en = match.group(0).strip()
        if en:
            segments.append(("en", en))
        cursor = end
    if cursor < len(normalized):
        ko = normalized[cursor:].strip()
        if ko:
            segments.append(("ko", ko))

    merged: list[tuple[str, str]] = []
    for lang, part in segments:
        if merged and merged[-1][0] == lang:
            merged[-1] = (lang, f"{merged[-1][1]} {part}".strip())
        else:
            merged.append((lang, part))
    return merged or [("ko", normalized)]


def split_for_human_reading(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    marked = re.sub(r"(다\.|요\.|니다\.|[.!?。！？])\s+", r"\1<break>", normalized)
    pieces = marked.split("<break>")
    chunks: list[str] = []
    for piece in pieces:
        piece = piece.strip()
        if not piece:
            continue
        if len(piece) <= 70:
            chunks.append(piece)
            continue
        clause_parts = re.split(r"(?<=[,，;；:：])\s+|(?<=며)\s+|(?<=고)\s+|(?<=지만)\s+|(?<=으며)\s+", piece)
        current = ""
        for part in clause_parts:
            part = part.strip()
            if not part:
                continue
            if current and len(current) + len(part) > 75:
                chunks.append(current.strip())
                current = part
            else:
                current = f"{current} {part}".strip()
        if current:
            chunks.append(current.strip())
    return chunks or [normalized]


def make_silence_mp3(path: Path, ms: int):
    seconds = max(0.08, ms / 1000)
    if shutil.which("ffmpeg"):
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
            "-t", f"{seconds:.3f}", "-q:a", "9", "-acodec", "libmp3lame", str(path)
        ], check=True)
        return
    nearest = 520 if ms >= 400 else 280
    path.write_bytes(base64.b64decode(SILENCE_MP3_BASE64[nearest]))


def concat_mp3(files: list[Path], out: Path):
    if not shutil.which("ffmpeg"):
        with out.open("wb") as target:
            for file in files:
                target.write(file.read_bytes())
        return
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".txt", delete=False) as f:
        list_path = Path(f.name)
        for file in files:
            f.write(f"file '{file.as_posix()}'\n")
    try:
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(list_path),
            "-ar", "24000", "-ac", "1", "-b:a", "64k", str(out)
        ], check=True)
    finally:
        list_path.unlink(missing_ok=True)


def download_google_tts_mp3(text: str, lang: str, out: Path):
    # gTTS 라이브러리 없이도 Render 런타임에서 동작하도록 Google translate TTS HTTP endpoint를 직접 호출한다.
    # 긴 문장은 이미 split_for_human_reading에서 잘게 나뉘므로 여기서는 한 조각만 받는다.
    safe_lang = "en" if lang == "en" else "ko"
    url = f"https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl={safe_lang}&q={quote(text[:190])}"
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=30) as response:
        data = response.read()
    if not data.startswith(b"ID3") and b"\xff" not in data[:8]:
        raise RuntimeError("Google TTS returned non-audio data")
    out.write_bytes(data)


def synthesize_gtts_human(text: str, out: Path):
    chunks = split_for_human_reading(text)
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        files: list[Path] = []
        serial = 0
        for i, chunk in enumerate(chunks):
            for lang, segment in split_multilingual_tts_segments(chunk):
                chunk_path = tmpdir / f"chunk_{serial:03d}_{lang}.mp3"
                download_google_tts_mp3(segment, lang, chunk_path)
                files.append(chunk_path)
                serial += 1
            if i < len(chunks) - 1:
                pause_ms = 520 if re.search(r"[.!?。！？]$|다\.$|요\.$|니다\.$", chunk) else 280
                silence_path = tmpdir / f"silence_{i:03d}.mp3"
                make_silence_mp3(silence_path, pause_ms)
                files.append(silence_path)
        concat_mp3(files, out)


def synthesize_gtts(text: str, out: Path):
    download_google_tts_mp3(text, "ko", out)

async def synthesize_edge(text: str, voice: str, rate: str, out: Path):
    import edge_tts
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    await communicate.save(str(out))


def main():
    port = int(os.environ.get("PORT", "4173"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving PDF listener on http://0.0.0.0:{port}", flush=True)
    server.serve_forever()

if __name__ == "__main__":
    main()
