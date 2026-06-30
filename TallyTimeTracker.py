#!/usr/bin/env python3
"""
Time Tracker - Smart desktop time tracking app
- Reads Chrome URL to detect Monday.com boards/items
- Learns app->project associations and auto-tracks silently
- Tracks unknown apps/boards quietly under General
"""

import tkinter as tk
import webbrowser
from tkinter import ttk, messagebox, filedialog
import threading
import time
import sqlite3
import csv
import re
import os
import json
import logging
import sys
from datetime import datetime, date, timedelta
from pathlib import Path
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs


APP_DIR = (
    Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent
)
BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", APP_DIR))


def _load_netsuite_data():
    p = BUNDLE_DIR / "netsuite_data.json"
    if p.exists():
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {"tasks_1778": [], "tasks_1779": [], "service_items": [], "projects": []}

NS_DATA = _load_netsuite_data()
NS_PROJECT_NAMES = [
    "1778 — Admin (Leave / PTO)",
    "1779 — Admin (Internal)",
] + [f"{p['code']} — {p['name']}" for p in NS_DATA["projects"]]
NS_ADMIN_PROJECTS = {"1778", "1779"}


def resource_path(name):
    """Return a bundled resource path in source or frozen builds."""
    return BUNDLE_DIR / name


# -- Brand fonts ---------------------------------------------------------------
# Tally's face: Archivo (display headings), Manrope (body/UI), Spline Sans Mono
# (numeric/token readouts) -- matching Tally.html / dashboard.html. The bundled
# TTFs in fonts/ are clean RIBBI pairs (Regular 400 + Bold 700) so Tk can select
# by family name with an optional "bold" style. Intermediate weights are not
# bundled because the UI only requests regular/bold via tkinter font tuples.
FONT_HEAD  = "Archivo"            # display face for titles / headings (700)
FONT_BLACK = "Archivo Black"     # ultra-heavy for wordmark / large display (900)
FONT_BODY  = "Manrope"           # body / form / button / UI text
FONT_MONO  = "Spline Sans Mono"  # numeric / token readouts

_BUNDLED_FONTS = [
    "archivo-400.ttf", "archivo-700.ttf",
    "archivo-900.ttf", "archivo-black.ttf",
    "manrope-400.ttf", "manrope-700.ttf",
    "spline-sans-mono-400.ttf", "spline-sans-mono-700.ttf",
]


def register_fonts():
    """Register bundled brand fonts for this process only (Windows GDI).

    Uses AddFontResourceExW with FR_PRIVATE so fonts load without being
    installed system-wide. No-op on non-Windows or if files are missing;
    the UI then falls back to default system fonts.
    """
    if sys.platform != "win32":
        return
    try:
        import ctypes
        FR_PRIVATE = 0x10
        gdi32 = ctypes.windll.gdi32
        font_dir = resource_path("fonts")
        for fname in _BUNDLED_FONTS:
            fpath = font_dir / fname
            if fpath.exists():
                gdi32.AddFontResourceExW(str(fpath), FR_PRIVATE, 0)
    except Exception as exc:  # never block startup on cosmetics
        logging.warning("Font registration skipped: %s", exc)


def theme_titlebar(win, caption="#0B2A6B", text="#FFFFFF"):
    """Paint the native window title bar to match the Tally brand (navy).

    Uses DWM caption/text-colour attributes (Windows 11 build 22000+). Without
    this, Windows paints the caption with the user's OS accent colour, which can
    clash with the app (e.g. a magenta accent). No-op on non-Windows, older
    Windows, or if the call fails -- the OS default caption is used instead.
    """
    if sys.platform != "win32":
        return
    try:
        import ctypes
        win.update_idletasks()
        hwnd = ctypes.windll.user32.GetParent(win.winfo_id())

        def _colorref(hexstr):  # "#RRGGBB" -> COLORREF 0x00BBGGRR
            r = int(hexstr[1:3], 16)
            g = int(hexstr[3:5], 16)
            b = int(hexstr[5:7], 16)
            return r | (g << 8) | (b << 16)

        DWMWA_CAPTION_COLOR = 35
        DWMWA_TEXT_COLOR = 36
        for attr, col in ((DWMWA_CAPTION_COLOR, caption),
                          (DWMWA_TEXT_COLOR, text)):
            val = ctypes.c_int(_colorref(col))
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd, attr, ctypes.byref(val), ctypes.sizeof(val))
    except Exception as exc:  # cosmetics only -- never block the UI
        logging.warning("Title bar theming skipped: %s", exc)

# -- Optional Windows libraries ------------------------------------------------
try:
    import win32gui
    import win32process
    import psutil
    WIN32_OK = True
except ImportError:
    WIN32_OK = False

# -- Optional macOS activity backend (PyObjC + AppleScript) --------------------
try:
    import mac_activity
    MAC_OK = mac_activity.MAC_OK
except Exception:
    MAC_OK = False

try:
    import uiautomation as auto
    UIA_OK = True
except ImportError:
    UIA_OK = False

# -- Optional Monday.com enrichment dependencies -------------------------------
try:
    import requests
    REQUESTS_OK = True
except ImportError:
    REQUESTS_OK = False

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=APP_DIR / ".env")
except ImportError:
    # python-dotenv not installed; users can still configure via Settings dialog
    pass

# -- Optional system-tray dependencies (v1.2.1) --------------------------------
try:
    import pystray
    from PIL import Image
    TRAY_OK = True
except ImportError:
    TRAY_OK = False

# -- Optional calendar date-picker widget --------------------------------------
try:
    from tkcalendar import DateEntry
    TKCAL_OK = True
except ImportError:
    TKCAL_OK = False

# -- Optional audio ping (Windows stdlib) --------------------------------------
try:
    import winsound
    WINSOUND_OK = True
except ImportError:
    WINSOUND_OK = False

logger = logging.getLogger("timetracker")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(levelname)s - %(message)s",
)

# -- Embedded HTTP server config ----------------------------------------------
HTTP_HOST = "127.0.0.1"  # loopback only - no external exposure
HTTP_PORT = int(os.getenv("TIMETRACKER_HTTP_PORT", "5610"))

# -- Database ------------------------------------------------------------------
DB_PATH = Path.home() / ".timetracker" / "data.db"
DB_PATH.parent.mkdir(exist_ok=True)


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS entries (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                project          TEXT    NOT NULL,
                category         TEXT,
                task             TEXT,
                notes            TEXT,
                start_time       TEXT    NOT NULL,
                end_time         TEXT,
                duration_seconds INTEGER,
                app_name         TEXT,
                url_context      TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    UNIQUE NOT NULL,
                created_at TEXT    DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    UNIQUE NOT NULL,
                created_at TEXT    DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Migrate existing databases - additive columns on entries
        existing = [r[1] for r in conn.execute("PRAGMA table_info(entries)").fetchall()]
        for col, ddl in [
            ("url_context",      "ALTER TABLE entries ADD COLUMN url_context TEXT"),
            ("monday_board_id",  "ALTER TABLE entries ADD COLUMN monday_board_id TEXT"),
            ("monday_item_id",   "ALTER TABLE entries ADD COLUMN monday_item_id TEXT"),
            ("task_name",        "ALTER TABLE entries ADD COLUMN task_name TEXT"),
            ("board_name",       "ALTER TABLE entries ADD COLUMN board_name TEXT"),
            ("status",           "ALTER TABLE entries ADD COLUMN status TEXT"),
            ("assignee",         "ALTER TABLE entries ADD COLUMN assignee TEXT"),
            ("due_date",         "ALTER TABLE entries ADD COLUMN due_date TEXT"),
            ("ns_project",       "ALTER TABLE entries ADD COLUMN ns_project TEXT"),
            ("ns_task",          "ALTER TABLE entries ADD COLUMN ns_task TEXT"),
            ("ns_service_item",  "ALTER TABLE entries ADD COLUMN ns_service_item TEXT"),
        ]:
            if col not in existing:
                conn.execute(ddl)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_associations (
                app_name       TEXT PRIMARY KEY,
                project        TEXT NOT NULL,
                category       TEXT,
                task_hint      TEXT,
                auto_track     INTEGER DEFAULT 1,
                ns_project     TEXT,
                ns_task        TEXT,
                ns_service_item TEXT
            )
        """)
        # Migrate existing app_associations — add NS columns if absent
        assoc_cols = [r[1] for r in conn.execute("PRAGMA table_info(app_associations)").fetchall()]
        for col, ddl in [
            ("ns_project",      "ALTER TABLE app_associations ADD COLUMN ns_project TEXT"),
            ("ns_task",         "ALTER TABLE app_associations ADD COLUMN ns_task TEXT"),
            ("ns_service_item", "ALTER TABLE app_associations ADD COLUMN ns_service_item TEXT"),
        ]:
            if col not in assoc_cols:
                conn.execute(ddl)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS monday_boards (
                board_id   TEXT PRIMARY KEY,
                board_name TEXT,
                project    TEXT NOT NULL,
                category   TEXT,
                auto_track INTEGER DEFAULT 1
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            )
        """)


def get_setting(key, default=None):
    """Read a setting from SQLite; fall back to env var, then default."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ).fetchone()
    if row and row["value"]:
        return row["value"]
    return os.getenv(key, default)


def set_setting(key, value):
    """Persist a setting to SQLite (None deletes the override)."""
    with get_db() as conn:
        if value is None or value == "":
            conn.execute("DELETE FROM settings WHERE key = ?", (key,))
        else:
            conn.execute("""
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """, (key, value))


# -- Colour palette (Tally brand: red / white / blue, editorial) ----------------
# Navy #0B2A6B = structure, red #E10E17 = primary, cream #FBF8F2 = canvas,
# blue #2F6BFF = info/links, white cards. Bold, high-contrast, light theme.
C = {
    "bg":        "#FBF8F2",  # cream canvas
    "surface":   "#0B2A6B",  # navy bars / table headings / tab strip
    "card":      "#FFFFFF",  # white content cards / tree rows
    "accent":    "#EDE7DA",  # light field + secondary-button background
    "border":    "#D8D0C0",  # subtle separators
    "primary":   "#E10E17",  # red - primary CTA / stop / active tab
    "primary_dk":"#B00C13",  # pressed / darker red
    "secondary": "#2F6BFF",  # blue - info / links / Resume
    "teal":      "#0B2A6B",  # navy - table headings
    "success":   "#0B2A6B",  # navy - start button / tracking accent
    "warn":      "#C77D1B",  # amber - warnings
    "monday":    "#2F6BFF",  # blue - Monday.com accent
    "text":      "#0B2A6B",  # navy ink (on light surfaces)
    "dim":       "#8A857C",  # warm grey muted
    "timer":     "#0B2A6B",  # navy clock readout
    "on_dark":   "#FFFFFF",  # text on navy bars
    "dim_dark":  "#9FB2DD",  # muted text on navy
}

DEFAULT_CATEGORIES = [
    "Deep Work", "Meetings", "Admin", "Research",
    "Creative", "Communication", "Learning", "Other",
]

BROWSER_APPS = {"chrome", "msedge", "firefox", "brave", "opera", "safari", "vivaldi"}

SKIP_APPS = {
    "explorer", "searchhost", "shellexperiencehost",
    "startmenuexperiencehost", "lockapp", "screenclipper",
    "timetracker", "python", "pythonw", "cmd", "powershell",
    "windowsterminal", "taskmgr", "applicationframehost",
}

# -- Monday.com URL parsing ----------------------------------------------------
# Independent patterns so board_id and item_id are extracted separately,
# covering path-based and query-param URL formats.
_MON_BOARD_PATH = re.compile(r"/boards/(\d+)")
_MON_ITEM_PATH  = re.compile(r"/(?:pulses|items)/(\d+)")
_MON_BOARD_QP   = re.compile(r"[?&]boardId=(\d+)")
_MON_ITEM_QP    = re.compile(r"[?&](?:pulseId|itemId)=(\d+)")
# Recognise non-board Monday sections (inbox, workdocs, dashboards, etc.)
_MON_SECTION    = re.compile(
    r"monday\.com/([a-zA-Z][a-zA-Z0-9_-]*)"  # first path segment after domain
)


def parse_monday_url(url):
    """Return (board_id, item_id) for any monday.com URL.

    board_id may be a numeric string for real boards, or a synthetic
    'page_<section>' string for non-board pages (inbox, workdocs, etc.).
    item_id is a numeric string or None.
    """
    if not url or "monday.com" not in url:
        return None, None

    # --- board_id: path first, then query param ---
    m = _MON_BOARD_PATH.search(url)
    board_id = m.group(1) if m else None
    if not board_id:
        m = _MON_BOARD_QP.search(url)
        board_id = m.group(1) if m else None

    # --- item_id: path first, then query param ---
    m = _MON_ITEM_PATH.search(url)
    item_id = m.group(1) if m else None
    if not item_id:
        m = _MON_ITEM_QP.search(url)
        item_id = m.group(1) if m else None

    # --- fallback: non-board Monday page ---
    if not board_id:
        m = _MON_SECTION.search(url)
        section = m.group(1) if m else "home"
        # Exclude "boards" path (shouldn't happen but guard anyway)
        if section != "boards":
            board_id = f"page_{section}"

    return board_id, item_id


# -- Monday.com GraphQL client -------------------------------------------------
class MondayAPIClient:
    """Lightweight Monday.com GraphQL client for item enrichment.

    Ported from monday-activitywatch/monday_watcher.py:92-180. Fetches task name,
    board name, status, assignee, due date for a given item_id.
    """

    GRAPHQL_URL = "https://api.monday.com/v2"

    def __init__(self, api_token=None, timeout=5):
        self.api_token = api_token
        self.timeout = timeout
        self._session = None
        if REQUESTS_OK and api_token:
            self._session = requests.Session()
            self._session.headers.update({"Authorization": api_token})

    def is_available(self):
        return bool(self._session and self.api_token)

    def set_token(self, api_token):
        """Hot-swap the API token (called from Settings dialog)."""
        self.api_token = api_token
        self.get_item.cache_clear()
        self.get_board.cache_clear()
        if REQUESTS_OK and api_token:
            self._session = requests.Session()
            self._session.headers.update({"Authorization": api_token})
        else:
            self._session = None

    @lru_cache(maxsize=256)
    def get_item(self, item_id):
        """Fetch a Monday item by id. Returns dict or None on any failure."""
        if not self.is_available():
            return None
        query = """
        query {
            items(ids: [%s]) {
                id
                name
                board { id name }
                column_values {
                    id text value
                    column { title }
                }
            }
        }
        """ % item_id
        try:
            resp = self._session.post(
                self.GRAPHQL_URL,
                json={"query": query},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("errors"):
                logger.debug("Monday API error: %s", data["errors"])
                return None
            items = (data.get("data") or {}).get("items") or []
            return items[0] if items else None
        except Exception as e:
            logger.debug("Monday item %s fetch failed: %s", item_id, e)
            return None

    @lru_cache(maxsize=256)
    def get_board(self, board_id):
        """Fetch a Monday board by id. Returns dict or None on any failure."""
        if not self.is_available() or not board_id:
            return None
        query = """
        query {
            boards(ids: [%s]) {
                id
                name
            }
        }
        """ % board_id
        try:
            resp = self._session.post(
                self.GRAPHQL_URL,
                json={"query": query},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("errors"):
                logger.debug("Monday API error: %s", data["errors"])
                return None
            boards = (data.get("data") or {}).get("boards") or []
            return boards[0] if boards else None
        except Exception as e:
            logger.debug("Monday board %s fetch failed: %s", board_id, e)
            return None

    def graphql(self, query, variables=None):
        """Run an arbitrary GraphQL query/mutation.
        Returns (data, error_str) where error_str is None on success."""
        if not self.is_available():
            return None, "Monday API token not configured"
        payload = {"query": query}
        if variables:
            payload["variables"] = variables
        try:
            resp = self._session.post(
                self.GRAPHQL_URL, json=payload, timeout=self.timeout)
            resp.raise_for_status()
            body = resp.json()
            if body.get("errors"):
                msgs = "; ".join(
                    (e.get("message") or str(e)) for e in body["errors"])
                logger.warning("Monday GraphQL error: %s", msgs)
                return None, msgs
            return body.get("data"), None
        except Exception as e:
            logger.warning("Monday GraphQL request failed: %s", e)
            return None, str(e)

    def get_or_create_group(self, board_id, group_name):
        """Return the group id for group_name on board, creating it if needed."""
        data, err = self.graphql(
            "query($b: ID!) { boards(ids: [$b]) { groups { id title } } }",
            {"b": str(board_id)})
        if err:
            return None, err
        groups = (((data or {}).get("boards") or [{}])[0]).get("groups") or []
        for g in groups:
            if g.get("title", "").strip().lower() == group_name.strip().lower():
                return g["id"], None
        # Create it
        data2, err2 = self.graphql("""
            mutation($b: ID!, $name: String!) {
                create_group(board_id: $b, group_name: $name) { id }
            }
        """, {"b": str(board_id), "name": group_name})
        gid = ((data2 or {}).get("create_group") or {}).get("id")
        return gid, err2

    def get_items_in_group(self, board_id, group_id):
        """Return {item_name_lower: item_id} for all items in a group."""
        data, err = self.graphql("""
            query($b: ID!, $g: String!) {
                boards(ids: [$b]) {
                    groups(ids: [$g]) {
                        items_page(limit: 500) {
                            items { id name }
                        }
                    }
                }
            }
        """, {"b": str(board_id), "g": str(group_id)})
        if err or not data:
            return {}
        groups = (((data or {}).get("boards") or [{}])[0]).get("groups") or []
        items = ((groups[0] if groups else {}).get("items_page") or {}).get("items") or []
        return {item["name"].strip().lower(): item["id"] for item in items}

    def update_item(self, board_id, item_id, column_values):
        """Update column values on an existing item."""
        import json as _json
        cv_json = _json.dumps(_json.dumps(column_values or {}))
        mutation = f"""
        mutation ($board: ID!, $item: ID!) {{
            change_multiple_column_values(board_id: $board, item_id: $item, column_values: {cv_json}) {{
                id
            }}
        }}
        """
        data, err = self.graphql(mutation, {"board": str(board_id), "item": str(item_id)})
        updated_id = ((data or {}).get("change_multiple_column_values") or {}).get("id")
        return updated_id, err

    def create_item(self, board_id, name, column_values=None, group_id=None):
        """Create a Monday item on the given board.
        Returns (item_id, error_str) — item_id is None on failure.

        column_values is inlined as a JSON string literal — Monday's JSON scalar
        does not accept GraphQL variables in the normal way.
        """
        import json as _json
        cv_json = _json.dumps(_json.dumps(column_values or {}))  # double-encode → inline string
        grp_arg = f', group_id: "{group_id}"' if group_id else ""
        mutation = f"""
        mutation ($board: ID!, $name: String!) {{
            create_item(board_id: $board, item_name: $name{grp_arg}, column_values: {cv_json}) {{
                id
            }}
        }}
        """
        data, err = self.graphql(mutation, {"board": str(board_id), "name": name})
        item_id = ((data or {}).get("create_item") or {}).get("id")
        return item_id, err

    def get_or_create_columns(self, board_id, wanted):
        """Ensure columns exist on the board. wanted = list of (title, type).
        Returns (dict of {title_lower: column_id}, error_str)."""
        data, err = self.graphql(
            "query($b: ID!) { boards(ids: [$b]) { columns { id title } } }",
            {"b": str(board_id)})
        if err:
            return {}, err
        boards = (data or {}).get("boards") or []
        existing = {}
        for col in ((boards[0] if boards else {}).get("columns") or []):
            existing[col["title"].lower()] = col["id"]
        result = {}
        for title, col_type in wanted:
            key = title.lower()
            if key in existing:
                result[key] = existing[key]
                continue
            col_data, col_err = self.graphql("""
                mutation($b: ID!, $title: String!, $type: ColumnType!) {
                    create_column(board_id: $b, title: $title, column_type: $type) {
                        id
                    }
                }
            """, {"b": str(board_id), "title": title, "type": col_type})
            col_id = ((col_data or {}).get("create_column") or {}).get("id")
            if col_id:
                result[key] = col_id
            else:
                logger.warning("Could not create column '%s': %s", title, col_err)
        return result, None

    def get_me(self):
        """Return the authenticated user's Monday.com numeric ID, or None."""
        data, err = self.graphql("query { me { id } }", {})
        if err:
            return None
        return ((data or {}).get("me") or {}).get("id")

    @staticmethod
    def extract_metadata(item_data):
        """Flatten Monday item payload into the columns we store on entries."""
        if not item_data:
            return {}
        meta = {
            "task_id":   item_data.get("id"),
            "task_name": item_data.get("name"),
        }
        board = item_data.get("board") or {}
        if board:
            meta["board_id"]   = board.get("id")
            meta["board_name"] = board.get("name")
        for col in item_data.get("column_values", []) or []:
            title = ((col.get("column") or {}).get("title") or "").lower()
            value = col.get("text") or col.get("value")
            if not value:
                continue
            if "status" in title:
                meta["status"] = value
            elif "assignee" in title or "owner" in title or "person" in title:
                meta["assignee"] = value
            elif "due" in title and "date" in title:
                meta["due_date"] = value
        return meta


# -- Embedded HTTP server ------------------------------------------------------
# Serves dashboard.html and JSON endpoints over localhost only. The browser
# content script (see browser_extension/monday_content.js) POSTs task IDs here
# when a Monday modal opens without a URL change.

class _Handler(BaseHTTPRequestHandler):
    """Loopback-only HTTP handler.

    Routes:
      GET  /                    -> dashboard.html (static)
      GET  /api/entries         -> [{...}, ...] (date-range filtered)
      GET  /api/summary         -> aggregated totals
      POST /task                -> {board_id, task_id} from browser extension
      GET  /healthz             -> "ok"
    """

    # Suppress default access log noise
    def log_message(self, fmt, *args):
        logger.debug("http %s - %s", self.address_string(), fmt % args)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text, status=200, ctype="text/plain"):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs   = parse_qs(parsed.query)

        if path in ("/", "/index.html", "/dashboard.html"):
            html_path = resource_path("dashboard.html")
            if html_path.exists():
                self._send_text(html_path.read_text(encoding="utf-8"),
                                ctype="text/html; charset=utf-8")
            else:
                self._send_text("dashboard.html not found", status=404)
            return

        if path == "/healthz":
            self._send_text("ok")
            return

        if path == "/api/entries":
            days = int(qs.get("days", ["7"])[0])
            self._send_json(_query_entries(days_back=days))
            return

        if path == "/api/summary":
            days = int(qs.get("days", ["7"])[0])
            self._send_json(_query_summary(days_back=days))
            return

        self._send_text("not found", status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/task":
            self._send_text("not found", status=404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            payload = json.loads(raw or "{}")
        except Exception as e:
            self._send_json({"ok": False, "error": f"bad json: {e}"}, status=400)
            return

        callback = getattr(_Handler, "app_callback", None)
        if callback is None:
            self._send_json({"ok": False, "error": "app not ready"}, status=503)
            return
        try:
            callback(payload)
            self._send_json({"ok": True})
        except Exception as e:
            logger.exception("POST /task callback failed")
            self._send_json({"ok": False, "error": str(e)}, status=500)


def _query_entries(days_back=7, limit=2000):
    """Read entries from SQLite for the HTTP API."""
    cutoff = (datetime.now() - timedelta(days=days_back)).isoformat()
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, project, category, task, notes,
                   start_time, end_time, duration_seconds, app_name, url_context,
                   monday_board_id, monday_item_id, task_name, board_name,
                   status, assignee, due_date
            FROM entries
            WHERE start_time >= ? AND end_time IS NOT NULL
            ORDER BY start_time DESC
            LIMIT ?
        """, (cutoff, limit)).fetchall()
    return [dict(r) for r in rows]


def _query_summary(days_back=7):
    """Aggregated totals for the HTTP API."""
    cutoff = (datetime.now() - timedelta(days=days_back)).isoformat()
    with get_db() as conn:
        total = conn.execute("""
            SELECT COALESCE(SUM(duration_seconds), 0) AS t
            FROM entries WHERE start_time >= ? AND end_time IS NOT NULL
        """, (cutoff,)).fetchone()["t"]
        by_proj = conn.execute("""
            SELECT project, SUM(duration_seconds) AS secs, COUNT(*) AS n
            FROM entries
            WHERE start_time >= ? AND end_time IS NOT NULL
            GROUP BY project ORDER BY secs DESC
        """, (cutoff,)).fetchall()
        by_task = conn.execute("""
            SELECT COALESCE(task_name, task) AS task,
                   monday_board_id,
                   COALESCE(entries.board_name, monday_boards.board_name) AS board_name,
                   SUM(duration_seconds) AS secs, COUNT(*) AS n
            FROM entries
            LEFT JOIN monday_boards
              ON monday_boards.board_id = entries.monday_board_id
            WHERE start_time >= ? AND end_time IS NOT NULL
            GROUP BY COALESCE(task_name, task), monday_board_id
            ORDER BY secs DESC
        """, (cutoff,)).fetchall()
        by_board = conn.execute("""
            SELECT COALESCE(entries.board_name, monday_boards.board_name, monday_board_id) AS board,
                   SUM(duration_seconds) AS secs, COUNT(*) AS n
            FROM entries
            LEFT JOIN monday_boards
              ON monday_boards.board_id = entries.monday_board_id
            WHERE start_time >= ? AND end_time IS NOT NULL
              AND monday_board_id IS NOT NULL
            GROUP BY COALESCE(entries.board_name, monday_boards.board_name, monday_board_id)
            ORDER BY secs DESC
        """, (cutoff,)).fetchall()
    return {
        "total_seconds": total,
        "by_project":  [dict(r) for r in by_proj],
        "by_task":     [dict(r) for r in by_task],
        "by_board":    [dict(r) for r in by_board],
    }


# -- Chrome URL reader ---------------------------------------------------------
_url_cache = {"url": None, "ts": 0}


_ADDR_BAR_NAMES = (
    "Address and search bar",       # Chrome / Edge default
    "Search or enter web address",  # older Chrome
    "Address bar",                  # Edge alternate
)


def _read_addr_bar(win):
    """Return the URL string from a browser window's address bar, or None."""
    for name in _ADDR_BAR_NAMES:
        ctrl = win.EditControl(searchDepth=8, Name=name)
        if ctrl.Exists(0, 0):
            return ctrl.GetValuePattern().Value
    return None


# -- Browser task labeling helpers --------------------------------------------
_BROWSER_TITLE_SUFFIXES = (
    " - Google Chrome", " — Google Chrome",
    " - Microsoft Edge", " — Microsoft Edge",
    " - Mozilla Firefox", " — Mozilla Firefox",
    " - Brave", " — Brave",
    " - Opera", " — Opera",
)


def clean_browser_title(title):
    """Strip the trailing browser-app suffix from a window title."""
    if not title:
        return ""
    t = title
    for suf in _BROWSER_TITLE_SUFFIXES:
        if t.endswith(suf):
            return t[: -len(suf)].strip()
    return t.strip()


def hostname_from_url(url):
    """Return a normalised hostname (no www., lowercase) or empty string."""
    if not url:
        return ""
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def browser_task_label(url, window_title):
    """Build a useful task label for a browser tab.

    Prefers "hostname - cleaned page title", falls back to either piece.
    Used when no app-association overrides the task name.
    """
    host = hostname_from_url(url)
    title = clean_browser_title(window_title)
    if host and title:
        if title.lower().startswith(host):
            return title
        return f"{host} - {title}"
    return host or title or "Browser"


def get_chrome_url():
    """Return the active URL from any open Chromium-based browser window.

    Prefers whichever window is currently showing a monday.com URL so that
    a Monday board in a background window still gets picked up when the user
    switches focus away from the browser momentarily.
    """
    if sys.platform == "darwin":
        try:
            return mac_activity.get_browser_url()
        except Exception:
            return None
    if not UIA_OK:
        return None
    now = time.time()
    if now - _url_cache["ts"] < 3:
        return _url_cache["url"]
    try:
        root = auto.GetRootControl()
        best_url = None
        for win in root.GetChildren():
            cn = (win.ClassName or "").lower()
            nm = (win.Name or "").lower()
            # Chrome_WidgetWin_1 covers both Chrome and Edge
            if "chrome" not in cn and "chrome" not in nm and "edge" not in nm:
                continue
            url = _read_addr_bar(win)
            if not url:
                continue
            # Always prefer a window that has monday.com in the URL
            if best_url is None or "monday.com" in url:
                best_url = url
            # Once we've found a monday.com URL no point checking further
            if "monday.com" in best_url:
                break
        _url_cache["url"] = best_url
        _url_cache["ts"] = now
        return best_url
    except Exception:
        pass
    _url_cache["url"] = None
    _url_cache["ts"] = now
    return None


# -- Toast notification --------------------------------------------------------
class Toast(tk.Toplevel):
    def __init__(self, parent, message, color=None):
        super().__init__(parent)
        color = color or C["success"]

        self.overrideredirect(True)
        self.attributes("-topmost", True)
        self.attributes("-alpha", 0.95)
        self.configure(bg=C["surface"])
        theme_titlebar(self, C["surface"])

        # Coloured accent strip along the top
        tk.Frame(self, bg=color, height=3).pack(fill="x")

        # Card body — navy surface with white text to match the app's header bar
        body = tk.Frame(self, bg=C["surface"], padx=16, pady=10)
        body.pack(fill="both", expand=True)
        tk.Label(body, text=message,
                 font=(FONT_BODY, 10), bg=C["surface"], fg=C["on_dark"],
                 wraplength=320, justify="left").pack(anchor="w")

        if WINSOUND_OK:
            import threading
            threading.Thread(
                target=lambda: winsound.PlaySound(
                    r"C:\Windows\Media\Windows Ding.wav",
                    winsound.SND_FILENAME),
                daemon=True).start()


        sw = self.winfo_screenwidth()
        self.update_idletasks()
        w = self.winfo_reqwidth()
        h = self.winfo_reqheight()
        self.geometry(f"{w}x{h}+{sw - w - 20}+60")
        self.after(15000, self.destroy)


# -- Switch-confirmation dialog ------------------------------------------------
class SwitchConfirmDialog(tk.Toplevel):
    """Toast-style prompt shown after the 90-second debounce threshold.

    Auto-dismisses to 'keep current' after TIMEOUT_MS milliseconds.
    Calls on_yes() or on_no() exactly once, then destroys itself.
    """
    TIMEOUT_MS = 10_000  # 10 seconds

    def __init__(self, parent, new_label: str, on_yes, on_no):
        super().__init__(parent)
        self._on_yes  = on_yes
        self._on_no   = on_no
        self._decided = False

        bg = "#0B2A6B"  # navy - stands out from the red / blue toasts
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        self.attributes("-alpha", 0.95)
        self.configure(bg=bg)

        tk.Label(self,
                 text=f"Switch timer to:\n{new_label}",
                 font=(FONT_BODY, 10, "bold"), bg=bg, fg="white",
                 padx=18, pady=10, wraplength=340).pack()

        self._countdown_var = tk.StringVar(
            value=f"Auto-keeping current in {self.TIMEOUT_MS // 1000}s")
        tk.Label(self, textvariable=self._countdown_var,
                 font=(FONT_BODY, 8), bg=bg, fg="#9FB2DD",
                 padx=18, pady=0).pack()

        btn_frame = tk.Frame(self, bg=bg)
        btn_frame.pack(padx=18, pady=(6, 12), fill="x")
        tk.Button(btn_frame, text="Yes, switch",
                  command=self._yes,
                  bg="#2F6BFF", fg="white", relief="flat",
                  font=(FONT_BODY, 9, "bold"), padx=12, pady=4,
                  cursor="hand2").pack(side="left", padx=(0, 8))
        tk.Button(btn_frame, text="Keep current",
                  command=self._no,
                  bg="#39477A", fg="white", relief="flat",
                  font=(FONT_BODY, 9), padx=12, pady=4,
                  cursor="hand2").pack(side="left")

        sw = self.winfo_screenwidth()
        self.update_idletasks()
        w = self.winfo_reqwidth()
        self.geometry(f"{w}x{self.winfo_reqheight()}+{sw - w - 20}+160")

        self._remaining_ms = self.TIMEOUT_MS
        self._tick()

    def _tick(self):
        if self._decided:
            return
        secs = max(0, self._remaining_ms // 1000)
        self._countdown_var.set(f"Auto-keeping current in {secs}s")
        if self._remaining_ms <= 0:
            self._no()
            return
        self._remaining_ms -= 1000
        self.after(1000, self._tick)

    def _yes(self):
        if self._decided:
            return
        self._decided = True
        self.destroy()
        self._on_yes()

    def _no(self):
        if self._decided:
            return
        self._decided = True
        self.destroy()
        self._on_no()


# -- Add-project dialog --------------------------------------------------------
class AddNameDialog(tk.Toplevel):
    def __init__(self, parent, title, label, table, on_save):
        super().__init__(parent)
        self.table = table
        self.on_save = on_save
        self.title(title)
        self.configure(bg=C["bg"])
        self.resizable(False, False)
        self.attributes("-topmost", True)
        self.geometry("300x190")
        self.grab_set()
        theme_titlebar(self)
        self.after(60, lambda: theme_titlebar(self))
        tk.Label(self, text=label, font=(FONT_BODY, 10),
                 bg=C["bg"], fg=C["text"]).pack(pady=(20, 6))
        self.var = tk.StringVar()
        e = ttk.Entry(self, textvariable=self.var, font=(FONT_BODY, 10))
        e.pack(padx=20, fill="x")
        e.focus()
        tk.Button(self, text="Add", command=self._save,
                  bg=C["primary"], fg="white",
                  font=(FONT_BODY, 10, "bold"), relief="flat",
                  padx=20, pady=6, cursor="hand2").pack(pady=18)
        self.bind("<Return>", lambda _: self._save())

    def _save(self):
        name = self.var.get().strip()
        if name:
            with get_db() as conn:
                conn.execute(f"INSERT OR IGNORE INTO {self.table} (name) VALUES (?)", (name,))
            self.on_save(name)
        self.destroy()


class AddProjectDialog(AddNameDialog):
    def __init__(self, parent, on_save):
        super().__init__(parent, "Add Project", "Project name:", "projects", on_save)


class AddCategoryDialog(AddNameDialog):
    def __init__(self, parent, on_save):
        super().__init__(parent, "Add Category", "Category name:", "categories", on_save)


# -- Settings dialog -----------------------------------------------------------
class SettingsDialog(tk.Toplevel):
    """Override Monday.com API token (saved to SQLite settings table).

    Precedence at runtime: SQLite override > .env > unset.
    Saving an empty value clears the override and reverts to .env.
    """

    def __init__(self, parent, monday_api):
        super().__init__(parent)
        self.monday_api = monday_api

        self.title("Settings")
        self.configure(bg=C["bg"])
        self.resizable(False, False)
        self.attributes("-topmost", True)
        w, h = 480, 320
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")
        self.grab_set()
        theme_titlebar(self)
        self.after(60, lambda: theme_titlebar(self))

        hdr = tk.Frame(self, bg=C["primary"], pady=12)
        hdr.pack(fill="x")
        tk.Label(hdr, text="  Settings", font=(FONT_HEAD, 15, "bold"),
                 bg=C["primary"], fg="white").pack(side="left")

        body = tk.Frame(self, bg=C["bg"], padx=22, pady=14)
        body.pack(fill="both", expand=True)

        tk.Label(body, text="Monday.com API token",
                 font=(FONT_BODY, 10, "bold"),
                 bg=C["bg"], fg=C["text"]).pack(anchor="w", pady=(0, 4))
        tk.Label(body,
                 text=("Used to auto-fetch task name, status, assignee and due "
                       "date when a Monday item is detected. Settings -> API in "
                       "Monday.com to generate one."),
                 font=(FONT_BODY, 9), bg=C["bg"], fg=C["dim"],
                 wraplength=420, justify="left").pack(anchor="w", pady=(0, 8))

        self.token_var = tk.StringVar(value=get_setting("MONDAY_API_TOKEN") or "")
        tk.Entry(body, textvariable=self.token_var, show="*",
                 font=(FONT_MONO, 10)).pack(fill="x")

        # Source indicator
        from_env = bool(os.getenv("MONDAY_API_TOKEN"))
        with get_db() as conn:
            from_db = bool(conn.execute(
                "SELECT 1 FROM settings WHERE key='MONDAY_API_TOKEN'").fetchone())
        if from_db:
            src = "Currently using: SQLite override (set in this dialog)"
        elif from_env:
            src = "Currently using: .env file"
        else:
            src = "No token configured"
        tk.Label(body, text=src, font=(FONT_BODY, 8, "italic"),
                 bg=C["bg"], fg=C["dim"]).pack(anchor="w", pady=(4, 12))

        # HTTP server status
        tk.Label(body, text=(f"Local dashboard: "
                              f"http://{HTTP_HOST}:{HTTP_PORT}/"),
                 font=(FONT_BODY, 9), bg=C["bg"], fg=C["dim"]
                 ).pack(anchor="w", pady=(0, 2))
        tk.Label(body, text=(f"Browser extension endpoint: "
                              f"http://{HTTP_HOST}:{HTTP_PORT}/task"),
                 font=(FONT_BODY, 9), bg=C["bg"], fg=C["dim"]
                 ).pack(anchor="w", pady=(0, 12))

        btns = tk.Frame(body, bg=C["bg"])
        btns.pack(fill="x", pady=(8, 0))
        tk.Button(btns, text="Clear override", command=self._clear,
                  bg=C["accent"], fg=C["dim"],
                  font=(FONT_BODY, 9), relief="flat",
                  padx=12, pady=6, cursor="hand2").pack(side="left")
        tk.Button(btns, text="Cancel", command=self.destroy,
                  bg=C["accent"], fg=C["dim"],
                  font=(FONT_BODY, 9), relief="flat",
                  padx=12, pady=6, cursor="hand2").pack(side="right", padx=4)
        tk.Button(btns, text="Save", command=self._save,
                  bg=C["primary"], fg="white",
                  font=(FONT_BODY, 10, "bold"), relief="flat",
                  padx=16, pady=6, cursor="hand2").pack(side="right")

        self.bind("<Return>", lambda _: self._save())
        self.bind("<Escape>", lambda _: self.destroy())

    def _save(self):
        token = self.token_var.get().strip()
        set_setting("MONDAY_API_TOKEN", token or None)
        # Hot-reload the client so changes take effect without restart
        effective = get_setting("MONDAY_API_TOKEN")
        self.monday_api.set_token(effective)
        self.destroy()

    def _clear(self):
        set_setting("MONDAY_API_TOKEN", None)
        self.monday_api.set_token(os.getenv("MONDAY_API_TOKEN"))
        self.destroy()


# -- Edit entry dialog ---------------------------------------------------------
class EditEntryDialog(tk.Toplevel):
    """Edit a single log entry (task, project, category, notes, start/end).

    Duration is recomputed from start/end times on save.
    """

    TIME_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M")

    def __init__(self, app, entry_id):
        super().__init__(app.root)
        self.app = app
        self.entry_id = entry_id

        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
        if row is None:
            messagebox.showerror("Edit entry", "That entry no longer exists.")
            self.destroy()
            return

        self.title("Edit Entry")
        self.configure(bg=C["bg"])
        self.resizable(False, False)
        self.attributes("-topmost", True)
        w, h = 500, 760
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")
        self.minsize(500, 760)
        self.grab_set()
        theme_titlebar(self)
        self.after(60, lambda: theme_titlebar(self))

        hdr = tk.Frame(self, bg=C["primary"], pady=12)
        hdr.pack(fill="x")
        tk.Label(hdr, text="  Edit Entry", font=(FONT_HEAD, 15, "bold"),
                 bg=C["primary"], fg="white").pack(side="left")

        body = tk.Frame(self, bg=C["bg"], padx=22, pady=10)
        body.pack(fill="both", expand=True)

        def label(text, size=10):
            tk.Label(body, text=text, font=(FONT_BODY, size, "bold"),
                     bg=C["bg"], fg=C["text"]).pack(anchor="w", pady=(8, 2))

        label("Task")
        self.task_var = tk.StringVar(value=row["task"] or "")
        tk.Entry(body, textvariable=self.task_var,
                 font=(FONT_BODY, 10)).pack(fill="x")

        label("Project")
        self.project_var = tk.StringVar(value=row["project"] or "")
        ttk.Combobox(body, textvariable=self.project_var,
                     values=app.projects, font=(FONT_BODY, 10)).pack(fill="x")

        label("Category")
        self.category_var = tk.StringVar(value=row["category"] or "")
        ttk.Combobox(body, textvariable=self.category_var,
                     values=app.categories, font=(FONT_BODY, 10)).pack(fill="x")

        times = tk.Frame(body, bg=C["bg"])
        times.pack(fill="x", pady=(8, 0))
        startf = tk.Frame(times, bg=C["bg"])
        startf.pack(side="left", expand=True, fill="x", padx=(0, 6))
        endf = tk.Frame(times, bg=C["bg"])
        endf.pack(side="left", expand=True, fill="x", padx=(6, 0))
        tk.Label(startf, text="Start  (YYYY-MM-DD HH:MM:SS)",
                 font=(FONT_BODY, 9, "bold"), bg=C["bg"],
                 fg=C["text"]).pack(anchor="w")
        self.start_var = tk.StringVar(value=self._fmt_time(row["start_time"]))
        tk.Entry(startf, textvariable=self.start_var,
                 font=(FONT_MONO, 10)).pack(fill="x")
        tk.Label(endf, text="End  (blank = still open)",
                 font=(FONT_BODY, 9, "bold"), bg=C["bg"],
                 fg=C["text"]).pack(anchor="w")
        self.end_var = tk.StringVar(value=self._fmt_time(row["end_time"]))
        tk.Entry(endf, textvariable=self.end_var,
                 font=(FONT_MONO, 10)).pack(fill="x")

        label("Notes")
        self.notes_var = tk.StringVar(value=row["notes"] or "")
        tk.Entry(body, textvariable=self.notes_var,
                 font=(FONT_BODY, 10)).pack(fill="x")

        label("Netsuite Customer : Project")
        self.ns_project_var = tk.StringVar(value=row["ns_project"] or "")
        ns_proj_cb = ttk.Combobox(body, textvariable=self.ns_project_var,
                                  values=NS_PROJECT_NAMES, font=(FONT_BODY, 10))
        ns_proj_cb.pack(fill="x")

        label("Netsuite Task")
        self.ns_task_var = tk.StringVar(value=row["ns_task"] or "")
        self._edit_ns_task_cb = ttk.Combobox(body, textvariable=self.ns_task_var,
                                             values=[], font=(FONT_BODY, 10),
                                             state="disabled")
        self._edit_ns_task_cb.pack(fill="x")

        label("Netsuite Service Item")
        self.ns_service_var = tk.StringVar(value=row["ns_service_item"] or "")
        ttk.Combobox(body, textvariable=self.ns_service_var,
                     values=NS_DATA["service_items"], font=(FONT_BODY, 10)).pack(fill="x")

        def _ns_proj_changed(*_):
            val = self.ns_project_var.get()
            code = val.split(" — ")[0].strip() if " — " in val else val.strip()
            if code == "1778":
                tasks = NS_DATA["tasks_1778"]
            elif code == "1779":
                tasks = NS_DATA["tasks_1779"]
            else:
                tasks = []
            self._edit_ns_task_cb["values"] = tasks
            self._edit_ns_task_cb["state"] = "normal" if tasks else "disabled"
            if not tasks:
                self.ns_task_var.set("")

        self.ns_project_var.trace_add("write", _ns_proj_changed)
        _ns_proj_changed()  # set initial state

        def _make_searchable(combo, full_list):
            def _filter(event=None):
                if event and event.keysym in ("Return", "Escape", "Tab", "Down", "Up"):
                    return
                typed = combo.get().lower()
                combo["values"] = [v for v in full_list if typed in v.lower()] if typed else full_list
            combo.bind("<KeyRelease>", _filter)

        _make_searchable(ns_proj_cb, NS_PROJECT_NAMES)
        _make_searchable(self._edit_ns_task_cb, NS_DATA["tasks_1778"] + NS_DATA["tasks_1779"])

        btns = tk.Frame(body, bg=C["bg"])
        btns.pack(fill="x", pady=(18, 0))
        tk.Button(btns, text="Cancel", command=self.destroy,
                  bg=C["accent"], fg=C["dim"], font=(FONT_BODY, 9),
                  relief="flat", padx=12, pady=6,
                  cursor="hand2").pack(side="right", padx=4)
        tk.Button(btns, text="Save", command=self._save,
                  bg=C["primary"], fg="white", font=(FONT_BODY, 10, "bold"),
                  relief="flat", padx=16, pady=6,
                  cursor="hand2").pack(side="right")

        self.bind("<Return>", lambda _: self._save())
        self.bind("<Escape>", lambda _: self.destroy())

    @staticmethod
    def _fmt_time(iso):
        if not iso:
            return ""
        try:
            return datetime.fromisoformat(iso).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            return iso

    def _parse_time(self, text):
        text = (text or "").strip()
        for fmt in self.TIME_FORMATS:
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
        return None

    def _save(self):
        task = self.task_var.get().strip()
        if not task:
            messagebox.showwarning("Required", "Task can't be empty.")
            return
        start = self._parse_time(self.start_var.get())
        if start is None:
            messagebox.showwarning(
                "Invalid start", "Use format YYYY-MM-DD HH:MM:SS")
            return
        end_raw = self.end_var.get().strip()
        end = self._parse_time(end_raw) if end_raw else None
        if end_raw and end is None:
            messagebox.showwarning(
                "Invalid end", "Use YYYY-MM-DD HH:MM:SS, or clear it.")
            return
        if end is not None and end < start:
            messagebox.showwarning(
                "Invalid range", "End time can't be before start time.")
            return
        duration = int((end - start).total_seconds()) if end else None

        project = self.project_var.get().strip() or "General"
        category = self.category_var.get().strip()
        notes = self.notes_var.get().strip()
        ns_project = self.ns_project_var.get().strip() or None
        ns_task = self.ns_task_var.get().strip() or None
        ns_service_item = self.ns_service_var.get().strip() or None
        with get_db() as conn:
            conn.execute("INSERT OR IGNORE INTO projects (name) VALUES (?)",
                         (project,))
            if category:
                conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)",
                             (category,))
            conn.execute("""
                UPDATE entries SET
                    task = ?, project = ?, category = ?, notes = ?,
                    start_time = ?, end_time = ?, duration_seconds = ?,
                    ns_project = ?, ns_task = ?, ns_service_item = ?
                WHERE id = ?
            """, (task, project, category, notes,
                  start.isoformat(),
                  end.isoformat() if end else None,
                  duration, ns_project, ns_task, ns_service_item,
                  self.entry_id))

        self.app._load_projects()
        self.app._load_categories()
        if getattr(self.app, "_log_category_combo", None):
            self.app._log_category_combo["values"] = self.app.categories
        if getattr(self.app, "_log_project_combo", None):
            self.app._log_project_combo["values"] = self.app.projects
        self.app.refresh_log()
        self.app.refresh_summary()
        if hasattr(self.app, "refresh_report"):
            self.app.refresh_report()
        self.destroy()


# -- Bulk NetSuite dialog ------------------------------------------------------
class BulkNetSuiteDialog(tk.Toplevel):
    """Apply NetSuite Project / Task / Service Item to many log rows at once.

    Only the fields that are filled in are written. A filled field overwrites
    any existing value on every selected row; a blank field is left untouched.
    """

    def __init__(self, app, entry_ids):
        super().__init__(app.root)
        self.app = app
        self.entry_ids = list(entry_ids)

        self.title("Bulk NetSuite")
        self.configure(bg=C["bg"])
        self.resizable(False, False)
        self.attributes("-topmost", True)
        w, h = 500, 440
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")
        self.minsize(500, 440)
        self.grab_set()
        theme_titlebar(self)
        self.after(60, lambda: theme_titlebar(self))

        hdr = tk.Frame(self, bg=C["primary"], pady=12)
        hdr.pack(fill="x")
        tk.Label(hdr,
                 text=f"  Bulk NetSuite  ·  {len(self.entry_ids)} row(s)",
                 font=(FONT_HEAD, 15, "bold"),
                 bg=C["primary"], fg="white").pack(side="left")

        body = tk.Frame(self, bg=C["bg"], padx=22, pady=10)
        body.pack(fill="both", expand=True)

        def label(text, size=10):
            tk.Label(body, text=text, font=(FONT_BODY, size, "bold"),
                     bg=C["bg"], fg=C["text"]).pack(anchor="w", pady=(8, 2))

        tk.Label(body,
                 text="Filled fields overwrite the selected rows. "
                      "Leave a field blank to keep it unchanged.",
                 font=(FONT_BODY, 9), bg=C["bg"], fg=C["dim"],
                 wraplength=440, justify="left").pack(anchor="w", pady=(2, 2))

        label("Netsuite Customer : Project")
        self.ns_project_var = tk.StringVar(value="")
        ns_proj_cb = ttk.Combobox(body, textvariable=self.ns_project_var,
                                  values=NS_PROJECT_NAMES, font=(FONT_BODY, 10))
        ns_proj_cb.pack(fill="x")

        label("Netsuite Task")
        self.ns_task_var = tk.StringVar(value="")
        self._ns_task_cb = ttk.Combobox(body, textvariable=self.ns_task_var,
                                        values=[], font=(FONT_BODY, 10),
                                        state="disabled")
        self._ns_task_cb.pack(fill="x")

        label("Netsuite Service Item")
        self.ns_service_var = tk.StringVar(value="")
        ttk.Combobox(body, textvariable=self.ns_service_var,
                     values=NS_DATA["service_items"],
                     font=(FONT_BODY, 10)).pack(fill="x")

        def _ns_proj_changed(*_):
            val = self.ns_project_var.get()
            code = val.split(" — ")[0].strip() if " — " in val else val.strip()
            if code == "1778":
                tasks = NS_DATA["tasks_1778"]
            elif code == "1779":
                tasks = NS_DATA["tasks_1779"]
            else:
                tasks = []
            self._ns_task_cb["values"] = tasks
            self._ns_task_cb["state"] = "normal" if tasks else "disabled"
            if not tasks:
                self.ns_task_var.set("")

        self.ns_project_var.trace_add("write", _ns_proj_changed)
        _ns_proj_changed()  # set initial state

        def _make_searchable(combo, full_list):
            def _filter(event=None):
                if event and event.keysym in ("Return", "Escape", "Tab", "Down", "Up"):
                    return
                typed = combo.get().lower()
                combo["values"] = [v for v in full_list if typed in v.lower()] if typed else full_list
            combo.bind("<KeyRelease>", _filter)

        _make_searchable(ns_proj_cb, NS_PROJECT_NAMES)
        _make_searchable(self._ns_task_cb,
                         NS_DATA["tasks_1778"] + NS_DATA["tasks_1779"])

        btns = tk.Frame(body, bg=C["bg"])
        btns.pack(fill="x", pady=(18, 0))
        tk.Button(btns, text="Cancel", command=self.destroy,
                  bg=C["accent"], fg=C["dim"], font=(FONT_BODY, 9),
                  relief="flat", padx=12, pady=6,
                  cursor="hand2").pack(side="right", padx=4)
        tk.Button(btns, text="Apply", command=self._apply,
                  bg=C["primary"], fg="white", font=(FONT_BODY, 10, "bold"),
                  relief="flat", padx=16, pady=6,
                  cursor="hand2").pack(side="right")

        self.bind("<Return>", lambda _: self._apply())
        self.bind("<Escape>", lambda _: self.destroy())

    def _apply(self):
        ns_project = self.ns_project_var.get().strip()
        ns_task = self.ns_task_var.get().strip()
        ns_service_item = self.ns_service_var.get().strip()

        sets, params = [], []
        if ns_project:
            sets.append("ns_project = ?")
            params.append(ns_project)
        if ns_task:
            sets.append("ns_task = ?")
            params.append(ns_task)
        if ns_service_item:
            sets.append("ns_service_item = ?")
            params.append(ns_service_item)

        if not sets:
            messagebox.showwarning(
                "Required", "Fill in at least one NetSuite field before applying.")
            return
        if not self.entry_ids:
            messagebox.showwarning("Required", "No rows selected.")
            return

        sql = f"UPDATE entries SET {', '.join(sets)} WHERE id = ?"
        with get_db() as conn:
            for eid in self.entry_ids:
                conn.execute(sql, params + [eid])

        self.app.refresh_log()
        self.app.refresh_summary()
        if hasattr(self.app, "refresh_report"):
            self.app.refresh_report()
        messagebox.showinfo(
            "Bulk NetSuite", f"Applied to {len(self.entry_ids)} row(s).")
        self.destroy()


# -- Main application ----------------------------------------------------------
class TimeTrackerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Tally")
        try:
            icon_path = resource_path("tt_badge.ico")
            if icon_path.exists():
                self.root.iconbitmap(str(icon_path))
        except tk.TclError:
            pass
        self.root.configure(bg=C["bg"])
        self.root.minsize(980, 760)

        # Navy title bar to match the design (overrides the OS accent colour).
        theme_titlebar(self.root)
        self.root.after(60, lambda: theme_titlebar(self.root))

        sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
        w, h = 1050, 820
        root.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")

        self.is_tracking   = False
        self.current_entry = None
        self.start_time    = None
        self.last_key      = None

        # Debounce / switch-confirmation state
        self._pending_key   = None   # key candidate currently being debounced
        self._pending_since = None   # time.time() when candidate was first seen
        self._pending_fn    = None   # handler callable waiting to be confirmed
        self._pending_label = None   # human-readable label for the confirm dialog
        self._confirm_open  = False  # True while SwitchConfirmDialog is on screen

        init_db()
        self.monday_api = MondayAPIClient(get_setting("MONDAY_API_TOKEN"))
        self._load_projects()
        self._load_categories()
        self._build_styles()
        self._build_ui()
        self.refresh_log()
        self.refresh_summary()
        self.refresh_associations()
        self._start_http_server()

        if WIN32_OK or MAC_OK:
            self._start_monitor()
        elif sys.platform == "darwin":
            self._set_status("warn", "Install pyobjc for activity monitoring")
        else:
            self._set_status("warn", "Install pywin32 for activity monitoring")

        root.protocol("WM_DELETE_WINDOW", self._on_close)

        self._tray_icon = None
        self._tray_notified = False
        self._review_after_id = None
        self._schedule_daily_review()
        self._setup_tray()

    # -- Data ------------------------------------------------------------------
    def _load_projects(self):
        with get_db() as conn:
            rows = conn.execute("SELECT name FROM projects ORDER BY name").fetchall()
        self.projects = [r["name"] for r in rows]
        if not self.projects:
            defaults = ["Client A", "Client B", "Admin", "Internal", "Personal"]
            with get_db() as conn:
                for p in defaults:
                    conn.execute("INSERT OR IGNORE INTO projects (name) VALUES (?)", (p,))
            self.projects = defaults[:]

    def _load_categories(self):
        with get_db() as conn:
            rows = conn.execute("SELECT name FROM categories ORDER BY name").fetchall()
        self.categories = [r["name"] for r in rows]
        if not self.categories:
            with get_db() as conn:
                for category in DEFAULT_CATEGORIES:
                    conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (category,))
            self.categories = DEFAULT_CATEGORIES[:]

    def _get_app_assoc(self, app_name):
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM app_associations WHERE app_name = ?",
                (app_name.lower(),)
            ).fetchone()

    def _get_monday_assoc(self, board_id):
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM monday_boards WHERE board_id = ?",
                (board_id,)
            ).fetchone()

    def _save_app_assoc(self, app_name, project, category, task_hint,
                        ns_project="", ns_task="", ns_service_item=""):
        with get_db() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO app_associations
                    (app_name, project, category, task_hint, auto_track,
                     ns_project, ns_task, ns_service_item)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?)
            """, (app_name.lower(), project, category, task_hint,
                  ns_project or None, ns_task or None, ns_service_item or None))

    def _save_monday_assoc(self, board_id, project, category, board_name=None):
        display_name = board_name or f"Board {board_id}"
        with get_db() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO monday_boards
                    (board_id, board_name, project, category, auto_track)
                VALUES (?, ?, ?, ?, 1)
            """, (board_id, display_name, project, category))

    # -- Styles ----------------------------------------------------------------
    def _build_styles(self):
        s = ttk.Style()
        s.theme_use("clam")
        s.configure("TEntry", fieldbackground=C["bg"], foreground=C["text"],
                    borderwidth=0, insertcolor=C["text"], padding=4)
        s.configure("TCombobox", fieldbackground=C["bg"], foreground=C["text"],
                    borderwidth=0, arrowcolor=C["dim"], padding=4)
        s.map("TCombobox",
              fieldbackground=[("readonly", C["bg"])],
              foreground=[("readonly", C["text"])])
        s.configure("White.TCombobox", fieldbackground="#FFFFFF", foreground=C["text"],
                    borderwidth=0, arrowcolor=C["dim"], padding=4)
        s.map("White.TCombobox",
              fieldbackground=[("readonly", "#FFFFFF")],
              foreground=[("readonly", C["text"])])
        s.configure("Search.TCombobox", fieldbackground="#FFF8E7", foreground=C["text"],
                    borderwidth=1, arrowcolor="#C77D1B", padding=4)
        s.map("Search.TCombobox",
              fieldbackground=[("readonly", "#FFF8E7")],
              foreground=[("readonly", C["text"])],
              bordercolor=[("focus", "#C77D1B"), ("!focus", "#C77D1B")])
        s.configure("Treeview", background=C["card"], foreground=C["text"],
                    fieldbackground=C["card"], borderwidth=0, rowheight=34)
        s.configure("Treeview.Heading", background=C["surface"], foreground="#ffffff",
                    font=(FONT_MONO, 9), relief="flat", padding=8)
        s.map("Treeview.Heading", background=[("active", C["surface"])])
        s.map("Treeview",
              background=[("selected", C["primary"])],
              foreground=[("selected", "#ffffff")])
        for orient in ("Vertical", "Horizontal"):
            s.configure(f"{orient}.TScrollbar", background=C["surface"],
                        troughcolor=C["bg"], borderwidth=0, arrowcolor=C["on_dark"])
        s.configure("TProgressbar", background=C["primary"],
                    troughcolor=C["accent"], borderwidth=0)

    # -- UI --------------------------------------------------------------------
    def _build_ui(self):
        # Navy masthead
        mast = tk.Frame(self.root, bg=C["surface"])
        mast.pack(fill="x")
        mast_inner = tk.Frame(mast, bg=C["surface"], padx=26, pady=16)
        mast_inner.pack(fill="x")

        logo = tk.Frame(mast_inner, bg=C["surface"])
        logo.pack(side="left")
        tk.Label(logo, text="TALLY",
                 font=(FONT_BLACK, 30),
                 bg=C["surface"], fg="white").pack(side="left")
        tk.Label(logo, text="  TIME TRACKER",
                 font=(FONT_MONO, 9),
                 bg=C["surface"], fg="#AEBFE0").pack(side="left", pady=(8, 0))

        status_box = tk.Frame(mast_inner, bg=C["surface"])
        status_box.pack(side="right")
        self._status_canvas = tk.Canvas(status_box, width=12, height=12,
                                         bg=C["surface"], highlightthickness=0)
        self._status_canvas.pack(side="left", padx=(0, 7))
        self._status_canvas.create_oval(1, 1, 11, 11,
                                         fill=C["dim"], outline="", tags="dot")
        self._status_lbl = tk.Label(status_box, text="IDLE",
                                     font=(FONT_MONO, 10),
                                     bg=C["surface"], fg="white")
        self._status_lbl.pack(side="left")

        # Tab strip on navy
        tab_strip = tk.Frame(self.root, bg=C["surface"], padx=26)
        tab_strip.pack(fill="x")

        self._tab_btns  = {}
        self._tab_pages = {}
        self._active_tab = None
        for name in ("Timer", "Log", "Summary", "Reports", "Associations"):
            btn = tk.Label(tab_strip,
                           text=name.upper(),
                           font=(FONT_HEAD, 11, "bold"),
                           bg=C["surface"], fg=C["dim_dark"],
                           padx=18, pady=11, cursor="hand2")
            btn.pack(side="left")
            btn.bind("<Button-1>", lambda e, n=name: self._switch_tab(n))
            self._tab_btns[name] = btn

        # Content area
        content = tk.Frame(self.root, bg=C["bg"])
        content.pack(fill="both", expand=True)
        for name in ("Timer", "Log", "Summary", "Reports", "Associations"):
            self._tab_pages[name] = tk.Frame(content, bg=C["bg"])

        self._build_timer_tab(self._tab_pages["Timer"])
        self._build_log_tab(self._tab_pages["Log"])
        self._build_summary_tab(self._tab_pages["Summary"])
        self._build_reports_tab(self._tab_pages["Reports"])
        self._build_associations_tab(self._tab_pages["Associations"])

        self._switch_tab("Timer")

        menubar = tk.Menu(self.root)
        filem = tk.Menu(menubar, tearoff=0)
        filem.add_command(label="Settings...", command=self._open_settings)
        filem.add_separator()
        filem.add_command(label="Open Dashboard in Browser",
                           command=lambda: webbrowser.open(
                               f"http://{HTTP_HOST}:{HTTP_PORT}/"))
        filem.add_separator()
        filem.add_command(label="Quit", command=self._quit_app)
        menubar.add_cascade(label="File", menu=filem)
        self.root.config(menu=menubar)

    def _switch_tab(self, name):
        if self._active_tab:
            self._tab_pages[self._active_tab].pack_forget()
            self._tab_btns[self._active_tab].config(
                bg=C["surface"], fg=C["dim_dark"])
        self._active_tab = name
        self._tab_pages[name].pack(fill="both", expand=True)
        self._tab_btns[name].config(bg=C["primary"], fg="white")

    def _make_scrollable(self, parent):
        """Return an inner Frame inside a Canvas+Scrollbar scroll region."""
        vsb = ttk.Scrollbar(parent, orient="vertical")
        vsb.pack(side="right", fill="y")
        canvas = tk.Canvas(parent, bg=C["bg"], highlightthickness=0,
                           yscrollcommand=vsb.set)
        canvas.pack(side="left", fill="both", expand=True)
        vsb.config(command=canvas.yview)
        inner = tk.Frame(canvas, bg=C["bg"])
        win_id = canvas.create_window((0, 0), window=inner, anchor="nw")
        def _resize(e):
            canvas.itemconfig(win_id, width=e.width)
        def _scroll_region(e):
            canvas.configure(scrollregion=canvas.bbox("all"))
        canvas.bind("<Configure>", _resize)
        inner.bind("<Configure>", _scroll_region)
        def _mw(e):
            canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")
        canvas.bind("<Enter>", lambda e: canvas.bind_all("<MouseWheel>", _mw))
        canvas.bind("<Leave>", lambda e: canvas.unbind_all("<MouseWheel>"))
        return inner

    def _set_status(self, mode, text=None):
        colors = {
            "idle":     C["dim"],
            "tracking": C["primary"],
            "monday":   C["secondary"],
            "warn":     C["warn"],
        }
        color = colors.get(mode, C["dim"])
        self._status_canvas.delete("dot")
        self._status_canvas.create_oval(1, 1, 11, 11,
                                         fill=color, outline="", tags="dot")
        if text:
            self._status_lbl.config(text=text.upper(), fg="white")

    # -- Timer tab -------------------------------------------------------------
    def _build_timer_tab(self, parent):
        scroll_root = self._make_scrollable(parent)
        inner = tk.Frame(scroll_root, bg=C["bg"])
        inner.pack(fill="x", padx=26, pady=26)

        # Timer card
        card_outer = tk.Frame(inner, bg=C["surface"])
        card_outer.pack(fill="x", pady=(0, 18))
        card = tk.Frame(card_outer, bg="white", padx=30, pady=10)
        card.pack(fill="x", padx=2, pady=2)

        card_top = tk.Frame(card, bg="white")
        card_top.pack(fill="x", pady=(0, 2))
        self._now_tracking_lbl = tk.Label(
            card_top, text="",
            font=(FONT_MONO, 11),
            bg="white", fg=C["primary"])
        self._now_tracking_lbl.pack(side="left")
        self._task_proj_lbl = tk.Label(
            card_top, text="",
            font=(FONT_MONO, 11),
            bg="white", fg=C["text"])
        self._task_proj_lbl.pack(side="right")

        timer_row = tk.Frame(card, bg="white")
        timer_row.pack(fill="x", pady=(0, 4))
        self._timer_hm = tk.Label(
            timer_row, text="00:00",
            font=(FONT_BLACK, 52),
            bg="white", fg=C["text"])
        self._timer_hm.pack(side="left")
        self._timer_s = tk.Label(
            timer_row, text=":00",
            font=(FONT_BLACK, 52),
            bg="white", fg=C["primary"])
        self._timer_s.pack(side="left", padx=(0, 20))
        self._start_btn = tk.Button(
            timer_row, text="▶  START TIMER",
            command=self._toggle,
            bg=C["primary"], fg="white",
            font=(FONT_HEAD, 13, "bold"),
            relief="flat", padx=20, pady=10, cursor="hand2")
        self._start_btn.pack(side="left", fill="y")

        # Form grid (2×2 with 2px navy borders)
        self._task_var       = tk.StringVar()
        self._project_var    = tk.StringVar()
        self._category_var   = tk.StringVar()
        self._notes_var      = tk.StringVar()
        self._ns_project_var = tk.StringVar()
        self._ns_task_var    = tk.StringVar()
        self._ns_service_var = tk.StringVar()
        self._project_combo  = None
        self._category_combo = None
        self._ns_task_combo  = None
        self._project_var.trace_add("write",  self._sync_active_entry)
        self._category_var.trace_add("write", self._sync_active_entry)

        grid_outer = tk.Frame(inner, bg=C["surface"])
        grid_outer.pack(fill="x", pady=(0, 18))
        grid_inner = tk.Frame(grid_outer, bg=C["surface"])
        grid_inner.pack(fill="x", padx=2, pady=2)
        grid_inner.grid_columnconfigure(0, weight=1)
        grid_inner.grid_columnconfigure(1, weight=1)

        def cell(row, col, padx, pady):
            f = tk.Frame(grid_inner, bg="white", padx=16, pady=14)
            f.grid(row=row, column=col, padx=padx, pady=pady, sticky="nsew")
            return f

        tc = cell(0, 0, (0, 1), (0, 1))
        tk.Label(tc, text="TASK", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(anchor="w", pady=(0, 4))
        tk.Entry(tc, textvariable=self._task_var,
                 font=(FONT_HEAD, 14, "bold"),
                 bg="white", fg=C["text"],
                 relief="flat", bd=0,
                 insertbackground=C["text"]).pack(anchor="w", fill="x")

        pc = cell(0, 1, (1, 0), (0, 1))
        tk.Label(pc, text="PROJECT", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(anchor="w", pady=(0, 4))
        self._project_combo = ttk.Combobox(
            pc, textvariable=self._project_var,
            values=self.projects,
            font=(FONT_HEAD, 14, "bold"),
            style="White.TCombobox")
        self._project_combo.pack(anchor="w", fill="x")

        cc = cell(1, 0, (0, 1), (1, 0))
        tk.Label(cc, text="CATEGORY", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(anchor="w", pady=(0, 4))
        self._category_combo = ttk.Combobox(
            cc, textvariable=self._category_var,
            values=self.categories,
            font=(FONT_HEAD, 14, "bold"),
            style="White.TCombobox")
        self._category_combo.pack(anchor="w", fill="x")

        nc = cell(1, 1, (1, 0), (1, 0))
        tk.Label(nc, text="NOTES", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(anchor="w", pady=(0, 4))
        tk.Entry(nc, textvariable=self._notes_var,
                 font=(FONT_HEAD, 14),
                 bg="white", fg=C["dim"],
                 relief="flat", bd=0,
                 insertbackground=C["text"]).pack(anchor="w", fill="x")

        def _make_searchable(combo, full_list):
            """Add live filtering + amber indicator when a search is active."""
            parent = combo.master
            clear_btn = tk.Label(parent, text="✕", font=(FONT_BODY, 10, "bold"),
                                 bg="white", fg="#C77D1B", cursor="hand2")

            def _apply_indicator():
                typed = combo.get()
                is_filtered = bool(typed) and typed not in full_list
                if is_filtered:
                    combo.configure(style="Search.TCombobox")
                    clear_btn.place(relx=1.0, rely=0.5, anchor="e", x=-28, y=0)
                else:
                    combo.configure(style="White.TCombobox")
                    clear_btn.place_forget()

            def _clear(_=None):
                combo.set("")
                combo["values"] = full_list
                combo.configure(style="White.TCombobox")
                clear_btn.place_forget()

            clear_btn.bind("<Button-1>", _clear)

            def _filter(event=None):
                if event and event.keysym in ("Return", "Escape", "Tab", "Down", "Up"):
                    return
                typed = combo.get().lower()
                combo["values"] = [v for v in full_list if typed in v.lower()] if typed else full_list
                self.root.after_idle(_apply_indicator)

            combo.bind("<KeyRelease>", _filter)
            combo.bind("<<ComboboxSelected>>", lambda _: self.root.after_idle(_apply_indicator))

        # Netsuite section header
        ns_hdr_outer = tk.Frame(grid_outer, bg=C["surface"])
        ns_hdr_outer.pack(fill="x", pady=(2, 0))
        ns_hdr = tk.Frame(ns_hdr_outer, bg=C["text"], padx=16, pady=6)
        ns_hdr.pack(fill="x", padx=2, pady=(0, 0))
        ns_hdr.grid_columnconfigure(1, weight=1)
        tk.Label(ns_hdr, text="NETSUITE", font=(FONT_MONO, 9, "bold"),
                 bg=C["text"], fg="white").grid(row=0, column=0, sticky="w")
        tk.Frame(ns_hdr, bg="#4A5568", height=1).grid(
            row=0, column=1, sticky="ew", padx=(12, 0))

        ns_grid_outer = tk.Frame(grid_outer, bg=C["surface"])
        ns_grid_outer.pack(fill="x")
        ns_grid = tk.Frame(ns_grid_outer, bg=C["surface"])
        ns_grid.pack(fill="x", padx=2, pady=2)
        ns_grid.grid_columnconfigure(0, weight=1)
        ns_grid.grid_columnconfigure(1, weight=1)

        def ns_cell(row, col, padx, pady):
            f = tk.Frame(ns_grid, bg="white", padx=16, pady=14)
            f.grid(row=row, column=col, padx=padx, pady=pady, sticky="nsew")
            return f

        nsp_c = ns_cell(0, 0, (0, 1), (0, 1))
        tk.Label(nsp_c, text="CUSTOMER : PROJECT", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(anchor="w", pady=(0, 4))
        ns_proj_combo = ttk.Combobox(nsp_c, textvariable=self._ns_project_var,
                                     values=NS_PROJECT_NAMES,
                                     font=(FONT_BODY, 11),
                                     style="White.TCombobox")
        ns_proj_combo.pack(anchor="w", fill="x")
        _make_searchable(ns_proj_combo, NS_PROJECT_NAMES)
        self._ns_project_var.trace_add("write", self._on_ns_project_change)

        nst_c = ns_cell(0, 1, (1, 0), (0, 1))
        tk.Label(nst_c, text="TASK", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(anchor="w", pady=(0, 4))
        self._ns_task_combo = ttk.Combobox(nst_c, textvariable=self._ns_task_var,
                                           values=[],
                                           font=(FONT_BODY, 11),
                                           style="White.TCombobox",
                                           state="disabled")
        self._ns_task_combo.pack(anchor="w", fill="x")

        nss_c = ns_cell(1, 0, (0, 1), (1, 0))
        tk.Label(nss_c, text="SERVICE ITEM", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(anchor="w", pady=(0, 4))
        ns_svc_combo = ttk.Combobox(nss_c, textvariable=self._ns_service_var,
                                    values=NS_DATA["service_items"],
                                    font=(FONT_BODY, 11),
                                    style="White.TCombobox")
        ns_svc_combo.pack(anchor="w", fill="x")
        _make_searchable(ns_svc_combo, NS_DATA["service_items"])

        # + PROJECT / + CATEGORY buttons
        btns = tk.Frame(inner, bg=C["bg"])
        btns.pack(fill="x", pady=(0, 18))

        tk.Button(btns, text="+ PROJECT",
                  command=self._add_project_dialog,
                  bg=C["card"], fg=C["text"],
                  font=(FONT_HEAD, 11, "bold"),
                  relief="flat", pady=10, padx=20,
                  cursor="hand2",
                  highlightthickness=2,
                  highlightbackground=C["text"]).pack(side="left", padx=(0, 10))

        tk.Button(btns, text="+ CATEGORY",
                  command=self._add_category_dialog,
                  bg=C["card"], fg=C["text"],
                  font=(FONT_HEAD, 11, "bold"),
                  relief="flat", pady=10, padx=20,
                  cursor="hand2",
                  highlightthickness=2,
                  highlightbackground=C["text"]).pack(side="left")

        # Recent entries
        rec_outer = tk.Frame(inner, bg=C["bg"])
        rec_outer.pack(fill="x")

        hdr_row = tk.Frame(rec_outer, bg=C["bg"])
        hdr_row.pack(fill="x", pady=(0, 10))
        tk.Label(hdr_row, text="RECENT ENTRIES",
                 font=(FONT_HEAD, 10, "bold"),
                 bg=C["bg"], fg=C["text"]).pack(side="left")
        tk.Frame(hdr_row, bg=C["text"], height=2).pack(
            side="left", fill="x", expand=True, padx=(12, 0), pady=(5, 0))

        self._recent_frame = tk.Frame(rec_outer, bg=C["bg"])
        self._recent_frame.pack(fill="x")

    # -- Log tab ---------------------------------------------------------------
    def _build_log_tab(self, parent):
        # White bordered filter card
        card_outer = tk.Frame(parent, bg=C["surface"])
        card_outer.pack(fill="x", padx=26, pady=(16, 0))
        card = tk.Frame(card_outer, bg="white", padx=16, pady=14)
        card.pack(fill="x", padx=2, pady=2)

        # SHOW filter buttons + export
        ctrl = tk.Frame(card, bg="white")
        ctrl.pack(fill="x", pady=(0, 10))
        self._log_ctrl_row = ctrl

        tk.Label(ctrl, text="SHOW",
                 font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(side="left", padx=(0, 12))

        self._filter_var = tk.StringVar(value="Today")
        self._log_filter_btns = {}
        for lbl in ("Today", "This Week", "All", "Custom"):
            is_first = (lbl == "Today")
            btn = tk.Label(ctrl,
                           text=lbl.upper(),
                           font=(FONT_HEAD, 9, "bold"),
                           bg=C["primary"] if is_first else "white",
                           fg="white" if is_first else C["surface"],
                           padx=12, pady=6, cursor="hand2",
                           highlightthickness=2,
                           highlightbackground=C["surface"])
            btn.pack(side="left", padx=(0, 4))
            btn.bind("<Button-1>", lambda e, v=lbl: self._set_log_filter(v))
            self._log_filter_btns[lbl] = btn

        tk.Button(ctrl, text="EXPORT CSV",
                  command=self._export_csv,
                  bg="white", fg=C["surface"],
                  font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=12, pady=6,
                  cursor="hand2",
                  highlightthickness=2,
                  highlightbackground=C["surface"]).pack(side="right")

        # Custom date pickers — inside the card, hidden by default
        self._date_wrapper = tk.Frame(card, bg="white")
        date_row = tk.Frame(self._date_wrapper, bg="white")
        date_row.pack(fill="x", pady=(10, 4))
        tk.Label(date_row, text="FROM", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(side="left", padx=(0, 8))
        if TKCAL_OK:
            self._log_range_from = DateEntry(date_row, width=11,
                                             font=(FONT_MONO, 9),
                                             date_pattern="yyyy-mm-dd")
            self._log_range_to   = DateEntry(date_row, width=11,
                                             font=(FONT_MONO, 9),
                                             date_pattern="yyyy-mm-dd")
        else:
            self._log_range_from = tk.Entry(date_row, width=12, font=(FONT_MONO, 9))
            self._log_range_from.insert(0, str(date.today()))
            self._log_range_to   = tk.Entry(date_row, width=12, font=(FONT_MONO, 9))
            self._log_range_to.insert(0, str(date.today()))
        self._log_range_from.pack(side="left")
        tk.Label(date_row, text="TO", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(side="left", padx=6)
        self._log_range_to.pack(side="left", padx=(0, 12))
        tk.Button(date_row, text="APPLY", command=self.refresh_log,
                  bg=C["primary"], fg="white", font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=10, pady=4, cursor="hand2").pack(side="left")

        # Category + Project + Apply row (always visible)
        tk.Frame(card, bg="#E6DFD0", height=1).pack(fill="x", pady=(10, 0))
        flt = tk.Frame(card, bg="white")
        flt.pack(fill="x", pady=(10, 0))

        tk.Label(flt, text="CATEGORY", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(side="left")
        self._log_category_var = tk.StringVar(value="All")
        self._log_category_combo = ttk.Combobox(
            flt, textvariable=self._log_category_var,
            values=["All"] + self.categories,
            font=(FONT_BODY, 10), width=16, state="readonly")
        self._log_category_combo.pack(side="left", padx=(6, 20))

        tk.Label(flt, text="PROJECT", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(side="left")
        self._log_project_var = tk.StringVar(value="All")
        self._log_project_combo = ttk.Combobox(
            flt, textvariable=self._log_project_var,
            values=["All"] + self.projects,
            font=(FONT_BODY, 10), width=16, state="readonly")
        self._log_project_combo.pack(side="left", padx=(6, 20))

        tk.Button(flt, text="APPLY TO SELECTED",
                  command=self._apply_category_to_selected,
                  bg=C["primary"], fg="white",
                  font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=14, pady=6,
                  cursor="hand2").pack(side="left")

        tk.Button(flt, text="BULK NETSUITE",
                  command=self._bulk_netsuite_selected,
                  bg=C["text"], fg="white",
                  font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=14, pady=6,
                  cursor="hand2").pack(side="left", padx=(10, 0))

        # Treeview with horizontal scroll
        tree_outer = tk.Frame(parent, bg=C["bg"])
        tree_outer.pack(fill="both", expand=True, padx=26, pady=(12, 8))

        cols   = ("date", "task", "project", "category", "notes", "ns_project", "ns_task", "ns_service", "duration", "source")
        widths = (115, 200, 120, 100, 140, 160, 160, 140, 80, 110)
        heads  = ("DATE", "TASK", "PROJECT", "CATEGORY", "NOTES", "NS PROJECT", "NS TASK", "NS SERVICE ITEM", "DURATION", "SOURCE")
        sb_v = ttk.Scrollbar(tree_outer, orient="vertical")
        sb_h = ttk.Scrollbar(tree_outer, orient="horizontal")
        self._tree = ttk.Treeview(tree_outer, columns=cols, show="headings",
                                  height=14, selectmode="extended",
                                  yscrollcommand=sb_v.set,
                                  xscrollcommand=sb_h.set)
        sb_v.config(command=self._tree.yview)
        sb_h.config(command=self._tree.xview)
        for col, w, h in zip(cols, widths, heads):
            self._tree.heading(
                col, text=h,
                command=lambda c=col: self._sort_tree(self._tree, c, False))
            self._tree.column(col, width=w, anchor="w")
        sb_v.pack(side="right", fill="y")
        sb_h.pack(side="bottom", fill="x")
        self._tree.pack(fill="both", expand=True)
        self._tree.bind("<Delete>", self._delete_selected)
        self._tree.bind("<Double-1>", self._edit_selected_entry)
        self._tree.tag_configure("src_colored", foreground=C["primary"])
        self._tree.tag_configure("stripe", background="#F4EFE3")

    def _set_log_filter(self, value):
        self._filter_var.set(value)
        for lbl, btn in self._log_filter_btns.items():
            if lbl == value:
                btn.config(bg=C["primary"], fg="white",
                           highlightbackground=C["primary"])
            else:
                btn.config(bg="white", fg=C["surface"],
                           highlightbackground=C["surface"])
        if value == "Custom":
            self._date_wrapper.pack(fill="x", after=self._log_ctrl_row)
        else:
            self._date_wrapper.pack_forget()
        self.refresh_log()

    # -- Summary tab -----------------------------------------------------------
    def _build_summary_tab(self, parent):
        ctrl = tk.Frame(parent, bg=C["bg"], padx=26, pady=16)
        ctrl.pack(fill="x")
        tk.Label(ctrl, text="PERIOD",
                 font=(FONT_MONO, 9),
                 bg=C["bg"], fg=C["dim"]).pack(side="left", padx=(0, 12))
        self._summary_period = tk.StringVar(value="Today")
        self._sum_period_btns = {}
        for lbl in ("Today", "This Week", "This Month", "Custom"):
            is_first = (lbl == "Today")
            btn = tk.Label(ctrl,
                           text=lbl.upper(),
                           font=(FONT_HEAD, 9, "bold"),
                           bg=C["primary"] if is_first else C["bg"],
                           fg="white" if is_first else C["surface"],
                           padx=12, pady=6, cursor="hand2",
                           highlightthickness=2,
                           highlightbackground=C["surface"])
            btn.pack(side="left", padx=(0, 4))
            btn.bind("<Button-1>", lambda e, v=lbl: self._set_summary_period(v))
            self._sum_period_btns[lbl] = btn

        # Custom date row
        self._sum_date_wrapper = tk.Frame(parent, bg=C["bg"])
        sum_date_row = tk.Frame(self._sum_date_wrapper, bg=C["bg"], padx=26, pady=4)
        sum_date_row.pack(fill="x")
        tk.Label(sum_date_row, text="From:", font=(FONT_BODY, 9),
                 bg=C["bg"], fg=C["dim"]).pack(side="left")
        if TKCAL_OK:
            self._sum_range_from = DateEntry(sum_date_row, width=11,
                                             font=(FONT_MONO, 9),
                                             date_pattern="yyyy-mm-dd")
            self._sum_range_to   = DateEntry(sum_date_row, width=11,
                                             font=(FONT_MONO, 9),
                                             date_pattern="yyyy-mm-dd")
        else:
            self._sum_range_from  = tk.Entry(sum_date_row, width=12, font=(FONT_MONO, 9))
            self._sum_range_from.insert(0, str(date.today()))
            self._sum_range_to    = tk.Entry(sum_date_row, width=12, font=(FONT_MONO, 9))
            self._sum_range_to.insert(0, str(date.today()))
        self._sum_range_from.pack(side="left", padx=(4, 0))
        tk.Label(sum_date_row, text="to", font=(FONT_BODY, 9),
                 bg=C["bg"], fg=C["dim"]).pack(side="left", padx=4)
        self._sum_range_to.pack(side="left", padx=(0, 8))
        tk.Button(sum_date_row, text="Apply", command=self.refresh_summary,
                  bg=C["primary"], fg="white", font=(FONT_BODY, 9),
                  relief="flat", padx=10, pady=3, cursor="hand2").pack(side="left")

        # Scrollable summary content
        self._sum_scroll_host = tk.Frame(parent, bg=C["bg"])
        self._sum_scroll_host.pack(fill="both", expand=True)
        sum_scroll_host = self._sum_scroll_host
        sum_scroll_inner = self._make_scrollable(sum_scroll_host)
        self._summary_frame = tk.Frame(sum_scroll_inner, bg=C["bg"])
        self._summary_frame.pack(fill="x", padx=26, pady=6)

    def _set_summary_period(self, value):
        self._summary_period.set(value)
        for lbl, btn in self._sum_period_btns.items():
            if lbl == value:
                btn.config(bg=C["primary"], fg="white",
                           highlightbackground=C["primary"])
            else:
                btn.config(bg=C["bg"], fg=C["surface"],
                           highlightbackground=C["surface"])
        if value == "Custom":
            self._sum_date_wrapper.pack(fill="x",
                                         before=self._sum_scroll_host)
        else:
            self._sum_date_wrapper.pack_forget()
        self.refresh_summary()

    # -- Associations tab ------------------------------------------------------
    def _build_associations_tab(self, parent):
        inner = self._make_scrollable(parent)

        hdr = tk.Frame(inner, bg=C["bg"], padx=26)
        hdr.pack(fill="x", pady=(20, 8))
        tk.Label(hdr, text="AUTO-ASSIGN RULES",
                 font=(FONT_HEAD, 16, "bold"),
                 bg=C["bg"], fg=C["text"]).pack(side="left")

        tk.Label(inner,
                 text="When a tracked window matches a source or keyword, Tally files it to the right project and category automatically.",
                 font=(FONT_BODY, 10), bg=C["bg"], fg=C["dim"],
                 wraplength=820, justify="left").pack(anchor="w", padx=26, pady=(0, 14))

        # App associations table
        a_cols   = ("source", "project", "category", "ns_project", "ns_task", "ns_service", "on")
        a_heads  = ("WHEN SOURCE MATCHES", "PROJECT", "CATEGORY", "NS CUSTOMER:PROJECT", "NS TASK", "NS SERVICE ITEM", "ON")
        a_widths = (180, 160, 120, 220, 150, 160, 60)
        app_outer = tk.Frame(inner, bg=C["bg"])
        app_outer.pack(fill="x", padx=26, pady=(0, 4))
        app_vsb = ttk.Scrollbar(app_outer, orient="vertical")
        app_hsb = ttk.Scrollbar(app_outer, orient="horizontal")
        self._app_tree = ttk.Treeview(app_outer, columns=a_cols,
                                       show="headings", height=8,
                                       yscrollcommand=app_vsb.set,
                                       xscrollcommand=app_hsb.set)
        app_vsb.config(command=self._app_tree.yview)
        app_hsb.config(command=self._app_tree.xview)
        for col, head, w in zip(a_cols, a_heads, a_widths):
            self._app_tree.heading(col, text=head)
            self._app_tree.column(col, width=w, anchor="w")
        self._app_tree.tag_configure("stripe", background="#F4EFE3")
        app_vsb.pack(side="right", fill="y")
        app_hsb.pack(side="bottom", fill="x")
        self._app_tree.pack(fill="both", expand=True)
        self._app_tree.bind("<Delete>", lambda _: self._delete_assoc("app"))
        self._app_tree.bind("<Double-1>", lambda _: self._edit_assoc())

        hint_row = tk.Frame(inner, bg=C["bg"])
        hint_row.pack(fill="x", padx=26, pady=(4, 0))
        tk.Label(hint_row, text="Double-click to edit · Delete key to remove",
                 font=(FONT_BODY, 8), bg=C["bg"], fg=C["dim"]).pack(side="left")
        tk.Button(hint_row, text="+ ADD RULE",
                  command=self._add_assoc_dialog,
                  bg=C["primary"], fg="white",
                  font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=12, pady=4, cursor="hand2").pack(side="right")

        # Monday boards (secondary)
        tk.Label(inner, text="MONDAY.COM BOARDS",
                 font=(FONT_HEAD, 11, "bold"),
                 bg=C["bg"], fg=C["text"]).pack(anchor="w", padx=26, pady=(18, 4))

        mon_outer = tk.Frame(inner, bg=C["bg"])
        mon_outer.pack(fill="x", padx=26, pady=(0, 4))
        mon_vsb = ttk.Scrollbar(mon_outer, orient="vertical")
        mon_hsb = ttk.Scrollbar(mon_outer, orient="horizontal")
        m_cols = ("board_id", "project", "category", "auto_track")
        self._monday_tree = ttk.Treeview(mon_outer, columns=m_cols,
                                          show="headings", height=4,
                                          yscrollcommand=mon_vsb.set,
                                          xscrollcommand=mon_hsb.set)
        mon_vsb.config(command=self._monday_tree.yview)
        mon_hsb.config(command=self._monday_tree.xview)
        for col, w in zip(m_cols, (160, 200, 160, 80)):
            self._monday_tree.heading(col, text=col.replace("_", " ").upper())
            self._monday_tree.column(col, width=w, anchor="w")
        mon_vsb.pack(side="right", fill="y")
        mon_hsb.pack(side="bottom", fill="x")
        self._monday_tree.pack(fill="both", expand=True)
        self._monday_tree.bind("<Delete>", lambda _: self._delete_assoc("monday"))

        tk.Label(inner,
                 text="Press Delete to remove a selected board association.",
                 font=(FONT_BODY, 8), bg=C["bg"], fg=C["dim"]).pack(anchor="w", padx=26, pady=(0, 20))

        # -- Daily Review -------------------------------------------------------
        tk.Label(inner, text="DAILY REVIEW TO MONDAY",
                 font=(FONT_HEAD, 11, "bold"),
                 bg=C["bg"], fg=C["text"]).pack(anchor="w", padx=26, pady=(6, 4))

        rev_outer = tk.Frame(inner, bg=C["surface"])
        rev_outer.pack(fill="x", padx=26, pady=(0, 20))
        rev = tk.Frame(rev_outer, bg="white", padx=16, pady=14)
        rev.pack(fill="x", padx=2, pady=2)

        row1 = tk.Frame(rev, bg="white")
        row1.pack(fill="x", pady=(0, 10))
        tk.Label(row1, text="BOARD ID", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(side="left")
        self._review_board_var = tk.StringVar(
            value=get_setting("REVIEW_BOARD_ID") or "18418713154")
        tk.Entry(row1, textvariable=self._review_board_var,
                 font=(FONT_BODY, 11), bg=C["bg"], fg=C["text"],
                 relief="flat", bd=0, width=18,
                 insertbackground=C["text"]).pack(side="left", padx=(8, 28))

        tk.Label(row1, text="RUN AT HOUR", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(side="left")
        self._review_hour_var = tk.StringVar(
            value=get_setting("REVIEW_HOUR") or "18")
        tk.Spinbox(row1, from_=0, to=23,
                   textvariable=self._review_hour_var,
                   font=(FONT_BODY, 11), bg=C["bg"], fg=C["text"],
                   relief="flat", bd=0, width=4,
                   buttonbackground=C["bg"]).pack(side="left", padx=(8, 28))

        tk.Label(row1, text="POST DATE", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(side="left")
        if TKCAL_OK:
            self._review_date_entry = DateEntry(row1, width=13,
                                                font=(FONT_MONO, 10),
                                                date_pattern="yyyy-mm-dd",
                                                background=C["primary"],
                                                foreground="white",
                                                borderwidth=0)
            self._review_date_entry.pack(side="left", padx=(8, 0))
        else:
            self._review_date_var = tk.StringVar(value=str(date.today()))
            self._review_date_entry = tk.Entry(row1, textvariable=self._review_date_var,
                                               width=13, font=(FONT_MONO, 10),
                                               bg=C["bg"], fg=C["text"], relief="flat")
            self._review_date_entry.pack(side="left", padx=(8, 0))
        # Keep _review_period_var for scheduled background runs (legacy)
        self._review_period_var = tk.StringVar(value="today")

        row2 = tk.Frame(rev, bg="white")
        row2.pack(fill="x")
        tk.Button(row2, text="SAVE SETTINGS",
                  command=self._save_review_settings,
                  bg="white", fg=C["surface"],
                  font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=14, pady=6,
                  cursor="hand2",
                  highlightthickness=2,
                  highlightbackground=C["surface"]).pack(side="left", padx=(0, 8))
        tk.Button(row2, text="RUN NOW",
                  command=lambda: threading.Thread(
                      target=self._run_daily_review, daemon=True).start(),
                  bg=C["primary"], fg="white",
                  font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=14, pady=6,
                  cursor="hand2").pack(side="left")
        self._review_status_lbl = tk.Label(
            row2, text="",
            font=(FONT_MONO, 9),
            bg="white", fg=C["dim"])
        self._review_status_lbl.pack(side="left", padx=(14, 0))

    def refresh_associations(self):
        for item in self._monday_tree.get_children():
            self._monday_tree.delete(item)
        for item in self._app_tree.get_children():
            self._app_tree.delete(item)
        with get_db() as conn:
            for r in conn.execute(
                    "SELECT * FROM monday_boards ORDER BY board_id").fetchall():
                self._monday_tree.insert("", "end",
                                          iid=f"m_{r['board_id']}", values=(
                    r["board_id"], r["project"], r["category"] or "",
                    "ON" if r["auto_track"] else "OFF",
                ))
            for i, r in enumerate(conn.execute(
                    "SELECT * FROM app_associations ORDER BY app_name").fetchall()):
                tags = ("stripe",) if i % 2 == 1 else ()
                self._app_tree.insert("", "end",
                                       iid=f"a_{r['app_name']}", tags=tags, values=(
                    r["app_name"].upper(), r["project"], r["category"] or "",
                    r["ns_project"] or "", r["ns_task"] or "", r["ns_service_item"] or "",
                    "ON" if r["auto_track"] else "OFF",
                ))

    def _delete_assoc(self, kind):
        tree = self._monday_tree if kind == "monday" else self._app_tree
        sel  = tree.selection()
        if not sel:
            return
        if not messagebox.askyesno("Delete", "Remove this association?"):
            return
        with get_db() as conn:
            for iid in sel:
                if kind == "monday":
                    conn.execute("DELETE FROM monday_boards WHERE board_id = ?",
                                 (iid.replace("m_",""),))
                else:
                    conn.execute("DELETE FROM app_associations WHERE app_name = ?",
                                 (iid.replace("a_",""),))
        self.refresh_associations()

    def _assoc_dialog(self, title, app_name="", project="", category="",
                      ns_project="", ns_task="", ns_service_item=""):
        """Shared add/edit dialog for app associations. Returns dict or None."""
        dlg = tk.Toplevel(self.root)
        dlg.title(title)
        dlg.resizable(False, True)
        dlg.grab_set()
        w, h = 560, 580
        dlg.geometry(f"{w}x{h}+{self.root.winfo_rootx()+80}+{self.root.winfo_rooty()+60}")
        dlg.configure(bg=C["bg"])
        dlg.minsize(w, 400)

        result = {}

        # Scrollable canvas so Save button is always reachable regardless of
        # screen resolution or number of NS fields visible.
        _canvas = tk.Canvas(dlg, bg=C["bg"], highlightthickness=0)
        _sb = ttk.Scrollbar(dlg, orient="vertical", command=_canvas.yview)
        _canvas.configure(yscrollcommand=_sb.set)
        _sb.pack(side="right", fill="y")
        _canvas.pack(side="left", fill="both", expand=True)
        body = tk.Frame(_canvas, bg=C["bg"], padx=24, pady=20)
        _canvas_win = _canvas.create_window((0, 0), window=body, anchor="nw")

        def _on_body_configure(_e):
            _canvas.configure(scrollregion=_canvas.bbox("all"))
        def _on_canvas_configure(e):
            _canvas.itemconfig(_canvas_win, width=e.width)
        body.bind("<Configure>", _on_body_configure)
        _canvas.bind("<Configure>", _on_canvas_configure)
        _canvas.bind("<MouseWheel>",
                     lambda e: _canvas.yview_scroll(int(-1*(e.delta/120)), "units"))
        body.bind("<MouseWheel>",
                  lambda e: _canvas.yview_scroll(int(-1*(e.delta/120)), "units"))

        def lbl(text):
            tk.Label(body, text=text, font=(FONT_MONO, 9),
                     bg=C["bg"], fg=C["dim"]).pack(anchor="w", pady=(10, 2))

        def entry_field(var):
            e = tk.Entry(body, textvariable=var, font=(FONT_BODY, 11),
                         bg="white", fg=C["text"], relief="flat", bd=1,
                         insertbackground=C["text"])
            e.pack(fill="x")
            return e

        def combo_field(var, values, state="normal"):
            c = ttk.Combobox(body, textvariable=var, values=values,
                             font=(FONT_BODY, 10), state=state)
            c.pack(fill="x")
            return c

        lbl("WHEN SOURCE MATCHES (app name or keyword)")
        app_var = tk.StringVar(value=app_name)
        entry_field(app_var)

        lbl("ASSIGN PROJECT")
        proj_var = tk.StringVar(value=project)
        combo_field(proj_var, self.projects)

        lbl("ASSIGN CATEGORY")
        cat_var = tk.StringVar(value=category)
        combo_field(cat_var, self.categories)

        # NS section header
        ns_hdr = tk.Frame(body, bg=C["text"], padx=10, pady=5)
        ns_hdr.pack(fill="x", pady=(16, 0))
        tk.Label(ns_hdr, text="NETSUITE", font=(FONT_MONO, 9, "bold"),
                 bg=C["text"], fg="white").pack(side="left")

        lbl("NS CUSTOMER : PROJECT")
        ns_proj_var = tk.StringVar(value=ns_project)
        ns_proj_cb = combo_field(ns_proj_var, NS_PROJECT_NAMES)

        lbl("NS TASK")
        ns_task_var = tk.StringVar(value=ns_task)
        ns_task_cb = combo_field(ns_task_var, [])

        def _update_ns_task(*_):
            val = ns_proj_var.get()
            code = val.split(" — ")[0].strip() if " — " in val else val.strip()
            if code == "1778":
                tasks = NS_DATA["tasks_1778"]
            elif code == "1779":
                tasks = NS_DATA["tasks_1779"]
            else:
                tasks = []
            ns_task_cb["values"] = tasks
            ns_task_cb["state"] = "normal" if tasks else "disabled"
            if not tasks:
                ns_task_var.set("")

        ns_proj_var.trace_add("write", _update_ns_task)
        _update_ns_task()

        lbl("NS SERVICE ITEM")
        ns_svc_var = tk.StringVar(value=ns_service_item)
        ns_svc_cb = combo_field(ns_svc_var, NS_DATA["service_items"])

        def _make_searchable(combo, full_list):
            def _filter(event=None):
                if event and event.keysym in ("Return", "Escape", "Tab", "Down", "Up"):
                    return
                typed = combo.get().lower()
                combo["values"] = [v for v in full_list if typed in v.lower()] if typed else full_list
            combo.bind("<KeyRelease>", _filter)

        _make_searchable(ns_proj_cb, NS_PROJECT_NAMES)
        _make_searchable(ns_svc_cb, NS_DATA["service_items"])

        def _save():
            if not app_var.get().strip():
                messagebox.showwarning("Required", "Source name is required.", parent=dlg)
                return
            result["app_name"]      = app_var.get().strip()
            result["project"]       = proj_var.get().strip() or "No Project"
            result["category"]      = cat_var.get().strip()
            result["ns_project"]    = ns_proj_var.get().strip()
            result["ns_task"]       = ns_task_var.get().strip()
            result["ns_service_item"] = ns_svc_var.get().strip()
            dlg.destroy()

        btns = tk.Frame(body, bg=C["bg"])
        btns.pack(fill="x", pady=(20, 0))
        tk.Button(btns, text="SAVE", command=_save,
                  bg=C["primary"], fg="white", font=(FONT_HEAD, 10, "bold"),
                  relief="flat", padx=20, pady=8, cursor="hand2").pack(side="left")
        tk.Button(btns, text="Cancel", command=dlg.destroy,
                  bg=C["bg"], fg=C["dim"], font=(FONT_BODY, 10),
                  relief="flat", padx=12, pady=8, cursor="hand2").pack(side="left", padx=8)

        dlg.wait_window()
        return result if result else None

    def _add_assoc_dialog(self):
        r = self._assoc_dialog("Add Association")
        if r:
            self._save_app_assoc(r["app_name"], r["project"], r["category"], "",
                                 r["ns_project"], r["ns_task"], r["ns_service_item"])
            self.refresh_associations()

    def _edit_assoc(self):
        sel = self._app_tree.selection()
        if not sel:
            return
        app_name = sel[0].replace("a_", "")
        with get_db() as conn:
            row = conn.execute("SELECT * FROM app_associations WHERE app_name=?",
                               (app_name,)).fetchone()
        if not row:
            return
        r = self._assoc_dialog("Edit Association",
                               app_name=row["app_name"],
                               project=row["project"],
                               category=row["category"] or "",
                               ns_project=row["ns_project"] or "",
                               ns_task=row["ns_task"] or "",
                               ns_service_item=row["ns_service_item"] or "")
        if r:
            # Delete old (app_name may have changed) then re-insert
            with get_db() as conn:
                conn.execute("DELETE FROM app_associations WHERE app_name=?", (app_name,))
            self._save_app_assoc(r["app_name"], r["project"], r["category"],
                                 row["task_hint"] or "",
                                 r["ns_project"], r["ns_task"], r["ns_service_item"])
            self.refresh_associations()

    # -- Timer control ---------------------------------------------------------
    def _toggle(self):
        if self.is_tracking:
            self._stop()
        else:
            self._start_manual()

    def _start_manual(self):
        task = self._task_var.get().strip()
        if not task:
            messagebox.showwarning("Required", "Please enter a task description.")
            return
        self._start_tracking(
            task,
            self._project_var.get().strip() or "No Project",
            self._category_var.get().strip(),
            self._notes_var.get().strip(),
            ns_project=self._ns_project_var.get().strip(),
            ns_task=self._ns_task_var.get().strip(),
            ns_service_item=self._ns_service_var.get().strip(),
        )

    def _start_tracking(self, task, project, category="", notes="",
                         app_name="", url_context="", monday_meta=None,
                         ns_project="", ns_task="", ns_service_item=""):
        if self.is_tracking:
            self._stop(silent=True)

        self.is_tracking = True
        self.start_time  = datetime.now()
        meta = monday_meta or {}

        with get_db() as conn:
            cur = conn.execute("""
                INSERT INTO entries
                    (project, category, task, notes, start_time, app_name, url_context,
                     monday_board_id, monday_item_id, task_name, board_name,
                     status, assignee, due_date,
                     ns_project, ns_task, ns_service_item)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (project, category, task, notes,
                  self.start_time.isoformat(), app_name, url_context,
                  meta.get("board_id"), meta.get("task_id"),
                  meta.get("task_name"), meta.get("board_name"),
                  meta.get("status"), meta.get("assignee"), meta.get("due_date"),
                  ns_project or None, ns_task or None, ns_service_item or None))
            self.current_entry = {"id": cur.lastrowid}
            conn.execute("INSERT OR IGNORE INTO projects (name) VALUES (?)",
                         (project,))
            if category:
                conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)",
                             (category,))
            # Backfill board_name into monday_boards when we learn it
            if meta.get("board_id") and meta.get("board_name"):
                conn.execute("""
                    UPDATE monday_boards SET board_name = ?
                    WHERE board_id = ? AND (board_name IS NULL OR board_name LIKE 'Board %')
                """, (meta["board_name"], meta["board_id"]))

        self._load_projects()
        self._load_categories()
        if self._project_combo:
            self._project_combo["values"] = self.projects
        if self._category_combo:
            self._category_combo["values"] = self.categories
        if getattr(self, "_log_category_combo", None):
            self._log_category_combo["values"] = self.categories
        if getattr(self, "_log_project_combo", None):
            self._log_project_combo["values"] = self.projects

        self._task_var.set(task)
        self._project_var.set(project)
        self._category_var.set(category)
        self._notes_var.set(notes)
        self._ns_project_var.set(ns_project or "")
        self._ns_task_var.set(ns_task or "")
        self._ns_service_var.set(ns_service_item or "")
        self._on_ns_project_change()
        self._now_tracking_lbl.config(text="NOW TRACKING")
        self._task_proj_lbl.config(text=f"YOUR ACCOUNT  ·  {project.upper()}")
        self._start_btn.config(text="■  STOP TIMER",
                                bg=C["primary"], fg="white")

        mode = "monday" if "monday.com" in url_context else "tracking"
        self._set_status(mode, f"Live  ·  {project}")
        self._tick()

    def _stop(self, silent=False):
        if not self.is_tracking:
            return
        end  = datetime.now()
        secs = int((end - self.start_time).total_seconds())
        if self.current_entry:
            with get_db() as conn:
                conn.execute("""
                    UPDATE entries SET end_time=?, duration_seconds=? WHERE id=?
                """, (end.isoformat(), secs, self.current_entry["id"]))
        self.is_tracking   = False
        self.current_entry = None
        self.start_time    = None
        self._timer_hm.config(text="00:00")
        self._timer_s.config(text=":00")
        self._now_tracking_lbl.config(text="")
        self._task_proj_lbl.config(text="")
        self._start_btn.config(text="▶  START TIMER",
                                bg=C["primary"], fg="white")
        self._set_status("idle", "Idle")
        if not silent:
            self.refresh_log()
            self.refresh_summary()

    def _on_ns_project_change(self, *_):
        val = self._ns_project_var.get().strip()
        code = val.split(" — ")[0].strip() if " — " in val else val.strip()
        if code == "1778":
            tasks = NS_DATA["tasks_1778"]
        elif code == "1779":
            tasks = NS_DATA["tasks_1779"]
        else:
            tasks = []
        if self._ns_task_combo:
            self._ns_task_combo["values"] = tasks
            self._ns_task_combo["state"] = "normal" if tasks else "disabled"
            if tasks:
                def _filter_task(event=None, _tasks=tasks):
                    if event and event.keysym in ("Return", "Escape", "Tab", "Down", "Up"):
                        return
                    typed = self._ns_task_combo.get().lower()
                    self._ns_task_combo["values"] = [v for v in _tasks if typed in v.lower()] if typed else _tasks
                self._ns_task_combo.bind("<KeyRelease>", _filter_task)
            else:
                self._ns_task_var.set("")

    def _sync_active_entry(self, *_):
        """Write project/category changes to the active entry immediately."""
        if not self.is_tracking or not self.current_entry:
            return
        project  = self._project_var.get().strip() or "No Project"
        category = self._category_var.get().strip()
        with get_db() as conn:
            conn.execute("UPDATE entries SET project=?, category=? WHERE id=?",
                         (project, category, self.current_entry["id"]))
        self._task_proj_lbl.config(text=f"YOUR ACCOUNT  ·  {project.upper()}")

    def _tick(self):
        if not self.is_tracking:
            return
        e = int((datetime.now() - self.start_time).total_seconds())
        self._timer_hm.config(text=f"{e//3600:02d}:{(e%3600)//60:02d}")
        self._timer_s.config(text=f":{e%60:02d}")
        self.root.after(1000, self._tick)

    # -- Activity monitor ------------------------------------------------------
    def _start_monitor(self):
        def _loop():
            # COM must be initialised on the thread that uses UIAutomation.
            try:
                import pythoncom
                pythoncom.CoInitialize()
            except Exception:
                pass
            while True:
                try:
                    self._check_active_window()
                except Exception:
                    pass
                time.sleep(15)
        threading.Thread(target=_loop, daemon=True).start()

    def _check_active_window(self):
        if sys.platform == "darwin":
            app_name, title = mac_activity.get_foreground_window()
            if not app_name:
                return
        else:
            hwnd = win32gui.GetForegroundWindow()
            if not hwnd:
                return
            title = win32gui.GetWindowText(hwnd)
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            try:
                app_name = psutil.Process(pid).name().replace(".exe","").lower()
            except Exception:
                app_name = "unknown"

        if app_name in SKIP_APPS:
            return

        # Browser: check URL
        if app_name in BROWSER_APPS:
            url = get_chrome_url()
            if url and "monday.com" in url:
                board_id, item_id = parse_monday_url(url)
                if board_id:
                    key   = f"monday:{board_id}:{item_id or ''}"
                    label = ("monday.com / board " + board_id
                             + (f" item {item_id}" if item_id else ""))
                    fn    = lambda b=board_id, i=item_id, u=url: (
                        self._handle_monday(b, i, u))
                    self._debounce(key, label, fn)
                    return
            # Non-Monday browser - segment by hostname so tab/site switches
            # produce distinct log entries instead of one giant "Chrome" blob.
            host  = hostname_from_url(url)
            key   = (f"browser:{app_name}:{host}" if host
                     else f"browser:{app_name}:{title}")
            label = host or title or app_name
            fn    = lambda a=app_name, t=title, u=url: (
                self._handle_app(a, t, url_context=u or ""))
            self._debounce(key, label, fn)
            return

        # Non-browser app
        key   = f"app:{app_name}"
        label = app_name.title()
        fn    = lambda a=app_name, t=title: self._handle_app(a, t)
        self._debounce(key, label, fn)

    # -- Debounce / switch-confirmation ----------------------------------------

    DEBOUNCE_SECS = 20  # seconds of continuous focus required before prompting

    def _debounce(self, key: str, label: str, handler_fn):
        # Absorb brief focus changes; only prompt after DEBOUNCE_SECS.
        if key == self.last_key:
            # Returned to the already-tracked window; clear pending state.
            self._pending_key   = None
            self._pending_since = None
            self._pending_fn    = None
            self._pending_label = None
            return

        if self._pending_key != key:
            # New candidate window; start the dwell clock.
            self._pending_key   = key
            self._pending_since = time.time()
            self._pending_fn    = handler_fn
            self._pending_label = label
            return

        # Same candidate, still different from last_key; check elapsed time.
        if (time.time() - self._pending_since) < self.DEBOUNCE_SECS:
            return  # still within the grace period

        # Threshold reached: capture, clear, then prompt.
        p_key, p_label, p_fn = (
            self._pending_key, self._pending_label, self._pending_fn)
        self._pending_key   = None
        self._pending_since = None
        self._pending_fn    = None
        self._pending_label = None
        self._prompt_switch(p_key, p_label, p_fn)

    def _prompt_switch(self, key: str, label: str, handler_fn):
        # Schedule SwitchConfirmDialog on the Tk main thread.
        if self._confirm_open:
            return  # don't stack dialogs
        self._confirm_open = True

        def on_yes():
            self._confirm_open = False
            self.last_key = key
            handler_fn()

        def on_no():
            self._confirm_open = False
            # Reset pending so re-focus doesn't immediately re-trigger.
            self._pending_key   = None
            self._pending_since = None

        self.root.after(
            0,
            lambda lbl=label, y=on_yes, n=on_no:
                SwitchConfirmDialog(self.root, lbl, y, n),
        )

    def _handle_monday(self, board_id, item_id, url):
        # Enrich via Monday API if we have an item_id and a token configured
        meta = self._enrich_monday(board_id, item_id)
        assoc = self._get_monday_assoc(board_id)
        task = (meta.get("task_name")
                or (f"Item #{item_id}" if item_id else None)
                or meta.get("board_name")
                or f"Board {board_id}")
        if assoc and assoc["auto_track"]:
            self.root.after(0, lambda t=task, a=assoc, u=url, m=meta: (
                self._start_tracking(t, a["project"], a["category"] or "",
                                      url_context=u, app_name="monday.com",
                                      monday_meta=m),
                Toast(self.root,
                      f"Auto-tracking\n{a['project']}  {t}",
                      C["monday"]),
                self.refresh_log(),
            ))
        else:
            self.root.after(0, lambda t=task, u=url, m=meta: (
                self._save_monday_assoc(board_id, "No Project", "",
                                         m.get("board_name")),
                self._start_tracking(t, "No Project", "",
                                      url_context=u, app_name="monday.com",
                                      monday_meta=m),
                Toast(self.root,
                      f"Tracking\nNo Project  {t}",
                      C["monday"]),
                self.refresh_log(),
                self.refresh_associations(),
            ))

    def _enrich_monday(self, board_id, item_id):
        """Fetch and flatten Monday item metadata. Always returns a dict."""
        meta = {"board_id": board_id, "task_id": item_id}
        assoc = self._get_monday_assoc(board_id) if board_id else None
        if assoc and assoc["board_name"] and not str(assoc["board_name"]).startswith("Board "):
            meta["board_name"] = assoc["board_name"]
        if not self.monday_api.is_available():
            return meta
        try:
            if item_id:
                data = self.monday_api.get_item(item_id)
                meta.update(MondayAPIClient.extract_metadata(data))
            if board_id and not meta.get("board_name"):
                board = self.monday_api.get_board(board_id) or {}
                if board.get("name"):
                    meta["board_id"] = str(board.get("id") or board_id)
                    meta["board_name"] = board["name"]
        except Exception as e:
            logger.debug("Monday enrichment failed: %s", e)
        return meta

    def _handle_app(self, app_name, window_title, url_context=""):
        is_browser = app_name in BROWSER_APPS

        # For browsers, look up by domain first (e.g. "github.com"), then fall
        # back to the broad app name ("chrome") so old catch-all associations
        # still work until the user creates a domain-specific one.
        domain = hostname_from_url(url_context) if is_browser else ""
        assoc = (self._get_app_assoc(domain) if domain else None) or self._get_app_assoc(app_name)
        assoc_key = domain if (domain and self._get_app_assoc(domain)) else app_name

        if is_browser:
            live_task = browser_task_label(url_context, window_title)
            task = live_task or (window_title or app_name.title())
        else:
            task = (assoc["task_hint"] if assoc else None) or window_title or app_name.title()

        if assoc and assoc["auto_track"]:
            self.root.after(0, lambda t=task, a=assoc, u=url_context: (
                self._start_tracking(t, a["project"], a["category"] or "",
                                      app_name=app_name, url_context=u,
                                      ns_project=a["ns_project"] or "",
                                      ns_task=a["ns_task"] or "",
                                      ns_service_item=a["ns_service_item"] or ""),
                Toast(self.root,
                      f"Auto-tracking\n{a['project']}  {t}",
                      C["success"]),
                self.refresh_log(),
            ))
        else:
            # Save under the domain when available so the new entry is
            # domain-specific rather than a broad "chrome" catch-all.
            hint = "" if is_browser else app_name.title()
            save_key = assoc_key
            self.root.after(0, lambda t=task, u=url_context, h=hint, k=save_key: (
                self._save_app_assoc(k, "No Project", "", h),
                self._start_tracking(t, "No Project", "",
                                      app_name=app_name, url_context=u),
                Toast(self.root,
                      f"Tracking\nNo Project  {t}",
                      C["success"]),
                self.refresh_log(),
                self.refresh_associations(),
            ))

    def refresh_recent_entries(self):
        """Rebuild the last-5 entries list on the Timer tab."""
        if not hasattr(self, "_recent_frame"):
            return
        for w in self._recent_frame.winfo_children():
            w.destroy()
        with get_db() as conn:
            rows = conn.execute("""
                SELECT * FROM entries WHERE end_time IS NOT NULL
                ORDER BY start_time DESC LIMIT 5
            """).fetchall()
        if not rows:
            tk.Label(self._recent_frame, text="No entries yet.",
                     font=(FONT_BODY, 9), bg=C["bg"], fg=C["dim"]).pack(anchor="w")
            return
        # Navy-bordered container: container bg = navy, entries = white with navy gaps
        container = tk.Frame(self._recent_frame, bg=C["surface"])
        container.pack(fill="x")
        for i, r in enumerate(rows):
            is_first = (i == 0)
            is_last = (i == len(rows) - 1)
            row_f = tk.Frame(container, bg="white", padx=16, pady=13)
            row_f.pack(fill="x", padx=2,
                       pady=(2 if is_first else 0, 2 if is_last else 0))
            if not is_last:
                tk.Frame(container, bg=C["surface"], height=2).pack(fill="x", padx=2)
            info = tk.Frame(row_f, bg="white")
            info.pack(side="left", fill="x", expand=True)
            tk.Label(info, text=(r["task"] or "")[:50],
                     font=(FONT_BODY, 11, "bold"), bg="white",
                     fg=C["text"], anchor="w").pack(anchor="w")
            meta = f"{r['project'] or '—'}  ·  {self._fmt(r['duration_seconds'] or 0)}"
            tk.Label(info, text=meta, font=(FONT_MONO, 10), bg="white",
                     fg=C["dim"], anchor="w").pack(anchor="w", pady=(3, 0))
            tk.Button(row_f, text="▶ RESUME",
                      command=lambda row=dict(r): self._resume_entry(row),
                      bg="white", fg=C["primary"],
                      font=(FONT_HEAD, 10, "bold"), relief="flat",
                      cursor="hand2").pack(side="right")

    def _resume_entry(self, row):
        """Pre-fill timer form from a past entry and start tracking."""
        self._task_var.set(row.get("task") or "")
        self._project_var.set(row.get("project") or "")
        self._category_var.set(row.get("category") or "")
        self._notes_var.set(row.get("notes") or "")
        self._start_tracking(
            row.get("task") or "",
            row.get("project") or "No Project",
            row.get("category") or "",
            row.get("notes") or "",
        )

    def _on_filter_change(self):
        self.refresh_log()

    def _log_date_filter(self):
        """Return (sql_fragment, params_list) for the current log filter."""
        period = self._filter_var.get()
        today  = date.today()
        if period == "Today":
            return "date(start_time) = ?", [str(today)]
        elif period == "This Week":
            ws = today - timedelta(days=today.weekday())
            return "date(start_time) >= ?", [str(ws)]
        elif period == "Custom":
            try:
                if TKCAL_OK:
                    d_from = self._log_range_from.get_date()
                    d_to   = self._log_range_to.get_date()
                else:
                    d_from = date.fromisoformat(self._log_range_from.get().strip())
                    d_to   = date.fromisoformat(self._log_range_to.get().strip())
                return ("date(start_time) >= ? AND date(start_time) <= ?",
                        [str(d_from), str(d_to)])
            except Exception:
                return "1=1", []
        else:
            return "1=1", []

    # -- Log -------------------------------------------------------------------
    def refresh_log(self):
        for item in self._tree.get_children():
            self._tree.delete(item)
        df, params = self._log_date_filter()
        with get_db() as conn:
            rows = conn.execute(f"""
                SELECT * FROM entries
                WHERE {df} AND end_time IS NOT NULL
                ORDER BY start_time DESC LIMIT 300
            """, params).fetchall()
        for i, r in enumerate(rows):
            dt  = datetime.fromisoformat(r["start_time"])
            ctx = r["url_context"] or ""
            src = ("Monday.com" if "monday.com" in ctx
                   else (r["app_name"] or ""))
            tags = ("stripe",) if i % 2 == 1 else ()
            self._tree.insert("", "end", iid=str(r["id"]), tags=tags, values=(
                dt.strftime("%m/%d %H:%M"),
                r["task"] or "",
                r["project"] or "",
                r["category"] or "",
                r["notes"] or "",
                r["ns_project"] or "",
                r["ns_task"] or "",
                r["ns_service_item"] or "",
                self._fmt(r["duration_seconds"] or 0),
                src,
            ))
        self.refresh_recent_entries()

    def _summary_date_filter(self):
        """Return (sql_where, params, title_str) for the summary period."""
        period = self._summary_period.get()
        today  = date.today()
        if period == "Today":
            return ("date(start_time) = ?", [str(today)],
                    f"Today  -  {today.strftime('%B %d, %Y')}")
        elif period == "This Week":
            ws = today - timedelta(days=today.weekday())
            return ("date(start_time) >= ?", [str(ws)],
                    f"This Week  -  {ws.strftime('%b %d')} to {today.strftime('%b %d')}")
        elif period == "This Month":
            ms = today.replace(day=1)
            return ("date(start_time) >= ?", [str(ms)],
                    f"This Month  -  {today.strftime('%B %Y')}")
        else:  # Custom
            try:
                if TKCAL_OK:
                    d_from = self._sum_range_from.get_date()
                    d_to   = self._sum_range_to.get_date()
                else:
                    d_from = date.fromisoformat(self._sum_range_from.get().strip())
                    d_to   = date.fromisoformat(self._sum_range_to.get().strip())
                return ("date(start_time) >= ? AND date(start_time) <= ?",
                        [str(d_from), str(d_to)],
                        f"Custom  -  {d_from.strftime('%b %d')} to {d_to.strftime('%b %d, %Y')}")
            except Exception:
                return "1=1", [], "Custom Range"

    # -- Summary ---------------------------------------------------------------
    def refresh_summary(self):
        for w in self._summary_frame.winfo_children():
            w.destroy()
        df, params, title = self._summary_date_filter()

        with get_db() as conn:
            total = (conn.execute(f"""
                SELECT SUM(duration_seconds) AS t FROM entries
                WHERE {df} AND end_time IS NOT NULL
            """, params).fetchone()["t"] or 0)
            by_proj = conn.execute(f"""
                SELECT project, SUM(duration_seconds) AS secs FROM entries
                WHERE {df} AND end_time IS NOT NULL
                GROUP BY project ORDER BY secs DESC
            """, params).fetchall()
            by_cat = conn.execute(f"""
                SELECT category, SUM(duration_seconds) AS secs FROM entries
                WHERE {df} AND end_time IS NOT NULL AND category != ''
                GROUP BY category ORDER BY secs DESC
            """, params).fetchall()

        # Total banner (red)
        tot = tk.Frame(self._summary_frame, bg=C["primary"], padx=22, pady=18)
        tot.pack(fill="x", pady=(0, 18))
        lbl_col = tk.Frame(tot, bg=C["primary"])
        lbl_col.pack(side="left")
        period_label = title.split("  -  ")[-1].upper() if "  -  " in title else title.upper()
        tk.Label(lbl_col,
                 text=period_label,
                 font=(FONT_MONO, 10),
                 bg=C["primary"], fg="#FFAAAA").pack(anchor="w")
        tk.Label(lbl_col, text="TOTAL TRACKED",
                 font=(FONT_HEAD, 15, "bold"),
                 bg=C["primary"], fg="white").pack(anchor="w", pady=(4, 0))
        tk.Label(tot,
                 text=self._fmt(total),
                 font=(FONT_HEAD, 36, "bold"),
                 bg=C["primary"], fg="white").pack(side="right")

        if total == 0:
            tk.Label(self._summary_frame, text="No entries for this period.",
                     font=(FONT_BODY, 11), bg=C["bg"], fg=C["dim"]).pack(pady=20)
            return

        cols_frame = tk.Frame(self._summary_frame, bg=C["bg"])
        cols_frame.pack(fill="x")
        cols_frame.grid_columnconfigure(0, weight=1)
        cols_frame.grid_columnconfigure(1, weight=1)

        BAR_COLORS = [C["primary"], C["surface"], "#2F6BFF", "#C77D1B", "#7A8AAE"]

        def panel(parent, heading, rows, key, col_idx):
            # Navy-border outer, white body
            pnl_outer = tk.Frame(parent, bg=C["surface"])
            pnl_outer.grid(row=0, column=col_idx, padx=(0 if col_idx else 0, 10 if col_idx == 0 else 0),
                           sticky="nsew")
            # Navy header bar
            tk.Label(pnl_outer, text=heading,
                     font=(FONT_HEAD, 11, "bold"),
                     bg=C["surface"], fg="white",
                     anchor="w", padx=16, pady=11
                     ).pack(fill="x", padx=2, pady=(2, 0))
            # White body
            body = tk.Frame(pnl_outer, bg="white", padx=16)
            body.pack(fill="both", expand=True, padx=2, pady=(0, 2))

            if not rows:
                tk.Label(body, text="No data for this period.",
                         font=(FONT_BODY, 10), bg="white", fg=C["dim"]).pack(pady=16)
                return
            tk.Frame(body, bg="white", height=12).pack()
            for ri, r in enumerate(rows):
                secs = r["secs"] or 0
                pct  = secs / total if total else 0
                name = (r[key] or "Uncategorized")[:32]
                bar_color = BAR_COLORS[ri % len(BAR_COLORS)]
                row_bg = "#F4EFE3" if ri % 2 == 1 else "white"

                itm = tk.Frame(body, bg=row_bg, padx=8, pady=4)
                itm.pack(fill="x")

                top_row = tk.Frame(itm, bg=row_bg)
                top_row.pack(fill="x")
                tk.Label(top_row, text=name,
                         font=(FONT_BODY, 12, "bold"),
                         bg=row_bg, fg=C["text"],
                         anchor="w").pack(side="left")
                tk.Label(top_row,
                         text=f"{self._fmt(secs)}  ·  {pct*100:.0f}%",
                         font=(FONT_MONO, 11),
                         bg=row_bg, fg=C["text"]).pack(side="right")

                # Track, colored fill via place
                track = tk.Frame(itm, bg="#EFE9DD", height=10)
                track.pack(fill="x", pady=(6, 0))
                track.pack_propagate(False)
                fill_f = tk.Frame(track, bg=bar_color, height=10)
                fill_f.place(x=0, y=0, relwidth=max(0.01, pct), relheight=1.0)

            tk.Frame(body, bg="white", height=4).pack()

        panel(cols_frame, "BY PROJECT",  by_proj, "project",  0)
        panel(cols_frame, "BY CATEGORY", by_cat,  "category", 1)

    # -- Export ----------------------------------------------------------------
    def _export_csv(self):
        fp = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv")],
            initialfile=f"timetracker_{date.today()}.csv",
        )
        if not fp:
            return
        df, params = self._log_date_filter()
        with get_db() as conn:
            rows = conn.execute(f"""
                SELECT * FROM entries
                WHERE {df} AND end_time IS NOT NULL
                ORDER BY start_time
            """, params).fetchall()
        with open(fp, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["Project", "Category", "Task", "Notes",
                        "Start Time", "End Time", "Duration (min)",
                        "App", "URL"])
            for r in rows:
                w.writerow([
                    r["project"]  or "",
                    r["category"] or "",
                    r["task"]     or "",
                    r["notes"]    or "",
                    r["start_time"] or "",
                    r["end_time"]   or "",
                    round((r["duration_seconds"] or 0) / 60, 1),
                    r["app_name"]    or "",
                    r["url_context"] or "",
                ])
        messagebox.showinfo(
            "Export complete",
            f"Saved {len(rows)} entr{'y' if len(rows) == 1 else 'ies'}"
            f"  ->  {fp}",
        )

    @staticmethod
    def _fmt(seconds):
        seconds = int(seconds or 0)
        h, rem = divmod(seconds, 3600)
        m, s   = divmod(rem, 60)
        return f"{h}h {m:02d}m" if h else f"{m}m {s:02d}s"

    # -- Reports tab -----------------------------------------------------------
    def _build_reports_tab(self, parent):
        # Bordered white filter card
        card_outer = tk.Frame(parent, bg=C["surface"])
        card_outer.pack(fill="x", padx=26, pady=(16, 0))
        card = tk.Frame(card_outer, bg="white", padx=16, pady=14)
        card.pack(fill="x", padx=2, pady=2)

        # Mode toggle — DAYS BACK vs DATE RANGE
        self._report_mode = tk.StringVar(value="days")

        row1 = tk.Frame(card, bg="white")
        row1.pack(fill="x", pady=(0, 8))

        # -- DAYS BACK side --
        days_frame = tk.Frame(row1, bg="white")
        days_frame.pack(side="left", padx=(0, 24))
        tk.Radiobutton(days_frame, text="DAYS BACK", variable=self._report_mode,
                       value="days", font=(FONT_MONO, 9),
                       bg="white", fg=C["dim"], activebackground="white",
                       selectcolor="white",
                       command=self._report_mode_changed).pack(side="left")
        self._report_days = tk.StringVar(value="7")
        ttk.Combobox(days_frame, textvariable=self._report_days,
                     values=("1", "7", "14", "30", "90"),
                     width=6, font=(FONT_BODY, 10)).pack(side="left", padx=(6, 0))

        # -- DATE RANGE side --
        range_frame = tk.Frame(row1, bg="white")
        range_frame.pack(side="left")
        tk.Radiobutton(range_frame, text="DATE RANGE", variable=self._report_mode,
                       value="range", font=(FONT_MONO, 9),
                       bg="white", fg=C["dim"], activebackground="white",
                       selectcolor="white",
                       command=self._report_mode_changed).pack(side="left")
        if TKCAL_OK:
            self._report_range_from = DateEntry(range_frame, width=11,
                                                font=(FONT_MONO, 9),
                                                date_pattern="yyyy-mm-dd",
                                                background=C["accent"],
                                                foreground=C["text"],
                                                borderwidth=0)
            self._report_range_to   = DateEntry(range_frame, width=11,
                                                font=(FONT_MONO, 9),
                                                date_pattern="yyyy-mm-dd",
                                                background=C["accent"],
                                                foreground=C["text"],
                                                borderwidth=0)
        else:
            self._report_range_from = tk.Entry(range_frame, width=12, font=(FONT_MONO, 9))
            self._report_range_from.insert(0, str(date.today()))
            self._report_range_to   = tk.Entry(range_frame, width=12, font=(FONT_MONO, 9))
            self._report_range_to.insert(0, str(date.today()))
        self._report_range_from.pack(side="left", padx=(6, 0))
        tk.Label(range_frame, text="to", font=(FONT_BODY, 9),
                 bg="white", fg=C["dim"]).pack(side="left", padx=4)
        self._report_range_to.pack(side="left")
        self._report_date_entry = None  # no longer used; kept for compat

        # Row 2 — group by + actions
        row2 = tk.Frame(card, bg="white")
        row2.pack(fill="x")
        tk.Label(row2, text="GROUP BY", font=(FONT_MONO, 9),
                 bg="white", fg=C["dim"]).pack(side="left")
        self._report_group = tk.StringVar(value="Task")
        ttk.Combobox(row2, textvariable=self._report_group,
                     values=("Task", "Board", "Project", "Day"),
                     width=10, font=(FONT_BODY, 10), state="readonly"
                     ).pack(side="left", padx=(6, 20))
        tk.Button(row2, text="REFRESH", command=self.refresh_report,
                  bg=C["primary"], fg="white", font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=12, pady=6, cursor="hand2"
                  ).pack(side="left", padx=(0, 4))
        tk.Button(row2, text="EXPORT CSV",
                  command=lambda: self._export_report("csv"),
                  bg="white", fg=C["text"], font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=12, pady=6, cursor="hand2",
                  highlightthickness=2, highlightbackground=C["surface"]
                  ).pack(side="left", padx=(0, 4))
        tk.Button(row2, text="EXPORT JSON",
                  command=lambda: self._export_report("json"),
                  bg="white", fg=C["text"], font=(FONT_HEAD, 9, "bold"),
                  relief="flat", padx=12, pady=6, cursor="hand2",
                  highlightthickness=2, highlightbackground=C["surface"]
                  ).pack(side="left")

        tree_outer = tk.Frame(parent, bg=C["bg"])
        tree_outer.pack(fill="both", expand=True, padx=26, pady=(12, 8))

        cols = ("group", "entries", "duration", "extra")
        headings = {"group": "GROUP", "entries": "# ENTRIES",
                    "duration": "DURATION", "extra": "DETAIL"}
        widths   = {"group": 260, "entries": 80, "duration": 110, "extra": 320}
        sb_v = ttk.Scrollbar(tree_outer, orient="vertical")
        sb_h = ttk.Scrollbar(tree_outer, orient="horizontal")
        self._report_tree = ttk.Treeview(tree_outer, columns=cols,
                                          show="headings", height=15,
                                          yscrollcommand=sb_v.set,
                                          xscrollcommand=sb_h.set)
        sb_v.config(command=self._report_tree.yview)
        sb_h.config(command=self._report_tree.xview)
        for c in cols:
            self._report_tree.heading(
                c, text=headings[c],
                command=lambda col=c: self._sort_tree(self._report_tree, col, False),
            )
            self._report_tree.column(c, width=widths[c], anchor="w")
        self._report_tree.tag_configure("stripe", background="#F4EFE3")
        sb_v.pack(side="right", fill="y")
        sb_h.pack(side="bottom", fill="x")
        self._report_tree.pack(fill="both", expand=True)
        self.refresh_report()

    def _report_mode_changed(self):
        """Called when the user toggles between DAYS BACK and DATE RANGE."""
        pass  # radio buttons update self._report_mode; refresh is manual via REFRESH

    def _report_on_date(self):
        """Return (mode, value) — mode is 'range' or 'days'."""
        if self._report_mode.get() == "range":
            try:
                if TKCAL_OK:
                    d_from = self._report_range_from.get_date()
                    d_to   = self._report_range_to.get_date()
                else:
                    d_from = date.fromisoformat(self._report_range_from.get().strip())
                    d_to   = date.fromisoformat(self._report_range_to.get().strip())
                return "range", (d_from, d_to)
            except Exception:
                return "days", None
        return "days", None

    def _aggregate_for_report(self, group_by, days_back=7, on_date=None, date_range=None):
        group_by = (group_by or "Task").lower()
        if date_range:
            date_filter = "date(start_time) >= ? AND date(start_time) <= ?"
            params = [str(date_range[0]), str(date_range[1])]
        elif on_date:
            date_filter = "date(start_time) = ?"
            params = [str(on_date)]
        else:
            date_filter = "start_time >= ?"
            params = [(datetime.now() - timedelta(days=days_back)).isoformat()]
        with get_db() as conn:
            if group_by == "task":
                sql = f"""
                  SELECT COALESCE(task_name, task) AS grp,
                         COUNT(*) AS n,
                         SUM(duration_seconds) AS secs,
                         COALESCE(board_name, monday_board_id, project, '') AS extra
                  FROM entries WHERE {date_filter} AND end_time IS NOT NULL
                  GROUP BY COALESCE(task_name, task), COALESCE(board_name, monday_board_id, project, '')
                  ORDER BY secs DESC
                """
            elif group_by == "board":
                sql = f"""
                  SELECT COALESCE(board_name, monday_board_id) AS grp,
                         COUNT(*) AS n,
                         SUM(duration_seconds) AS secs,
                         GROUP_CONCAT(DISTINCT project) AS extra
                  FROM entries WHERE {date_filter} AND end_time IS NOT NULL
                    AND (monday_board_id IS NOT NULL OR board_name IS NOT NULL)
                  GROUP BY COALESCE(board_name, monday_board_id)
                  ORDER BY secs DESC
                """
            elif group_by == "project":
                sql = f"""
                  SELECT project AS grp,
                         COUNT(*) AS n,
                         SUM(duration_seconds) AS secs,
                         GROUP_CONCAT(DISTINCT category) AS extra
                  FROM entries WHERE {date_filter} AND end_time IS NOT NULL
                  GROUP BY project ORDER BY secs DESC
                """
            else:  # day
                sql = f"""
                  SELECT date(start_time) AS grp,
                         COUNT(*) AS n,
                         SUM(duration_seconds) AS secs,
                         GROUP_CONCAT(DISTINCT project) AS extra
                  FROM entries WHERE {date_filter} AND end_time IS NOT NULL
                  GROUP BY date(start_time) ORDER BY grp DESC
                """
            return conn.execute(sql, params).fetchall()

    def _report_kwargs(self):
        """Resolve current report date selection into kwargs for _aggregate_for_report."""
        mode, val = self._report_on_date()
        try:
            days = int(self._report_days.get() or "7")
        except ValueError:
            days = 7
        if mode == "range":
            return dict(days_back=days, date_range=val)
        return dict(days_back=days)

    def refresh_report(self):
        for item in self._report_tree.get_children():
            self._report_tree.delete(item)
        kwargs = self._report_kwargs()
        rows = self._aggregate_for_report(self._report_group.get(), **kwargs)
        for i, r in enumerate(rows):
            tags = ("stripe",) if i % 2 == 1 else ()
            self._report_tree.insert("", "end", tags=tags, values=(
                (r["grp"] or "-")[:60],
                r["n"] or 0,
                self._fmt(r["secs"] or 0),
                (r["extra"] or "")[:80],
            ))

    def _export_report(self, fmt):
        kwargs   = self._report_kwargs()
        days     = kwargs.get("days_back", 7)
        group_by = self._report_group.get() or "Task"
        rows = self._aggregate_for_report(group_by, **kwargs)
        if not rows:
            messagebox.showinfo("Export", "No data for the selected range.")
            return
        ext = ".csv" if fmt == "csv" else ".json"
        stamp = date.today()
        fp = filedialog.asksaveasfilename(
            defaultextension=ext,
            filetypes=[(f"{fmt.upper()} files", f"*{ext}")],
            initialfile=f"timetracker_report_{stamp}_{group_by.lower()}{ext}",
        )
        if not fp:
            return
        if fmt == "csv":
            with open(fp, "w", newline="", encoding="utf-8") as fh:
                w = csv.writer(fh)
                w.writerow([group_by, "Entries", "Duration (min)", "Detail"])
                for r in rows:
                    w.writerow([
                        r["grp"] or "",
                        r["n"]   or 0,
                        round((r["secs"] or 0) / 60, 1),
                        r["extra"] or "",
                    ])
        else:
            payload = [{
                "group":         r["grp"],
                "entries":       r["n"],
                "duration_secs": r["secs"],
                "detail":        r["extra"],
            } for r in rows]
            with open(fp, "w", encoding="utf-8") as fh:
                json.dump({"group_by": group_by, "days_back": days,
                           "rows": payload}, fh, indent=2, default=str)
        messagebox.showinfo("Export complete",
                             f"Saved {len(rows)} rows  ->  {fp}")

    # -- Settings --------------------------------------------------------------
    def _open_settings(self):
        SettingsDialog(self.root, self.monday_api)

    # -- Misc UI helpers -------------------------------------------------------
    def _add_project_dialog(self):
        """Open the Add Project popup, refresh project lists on save."""
        def on_save(name):
            self._load_projects()
            if self._project_combo:
                self._project_combo["values"] = self.projects
            if getattr(self, "_log_project_combo", None):
                self._log_project_combo["values"] = self.projects
                self._log_project_var.set(name)
        AddProjectDialog(self.root, on_save)

    def _add_category_dialog(self):
        """Open the Add Category popup, refresh category lists on save."""
        def on_save(name):
            self._load_categories()
            self._category_var.set(name)
            if self._category_combo:
                self._category_combo["values"] = self.categories
            if getattr(self, "_log_category_combo", None):
                self._log_category_combo["values"] = self.categories
                self._log_category_var.set(name)
        AddCategoryDialog(self.root, on_save)

    def _add_log_category_from_field(self):
        """Save the category typed in the Log tab without opening a popup."""
        category = self._log_category_var.get().strip()
        if not category:
            messagebox.showwarning("Required", "Type a category name first.")
            return
        with get_db() as conn:
            conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)",
                         (category,))
        self._load_categories()
        if self._category_combo:
            self._category_combo["values"] = self.categories
        if self._log_category_combo:
            self._log_category_combo["values"] = self.categories
        self._log_category_var.set(category)

    def _apply_category_to_selected(self):
        """Apply the chosen project and/or category to all selected log rows."""
        category = self._log_category_var.get().strip()
        project  = self._log_project_var.get().strip()
        apply_cat = category and category != "All"
        apply_proj = project and project != "All"
        if not apply_cat and not apply_proj:
            messagebox.showwarning("Required",
                "Set a project or category (not 'All') before applying.")
            return
        sel = self._tree.selection()
        if not sel:
            messagebox.showwarning("Required", "Select one or more log rows first.")
            return
        with get_db() as conn:
            if apply_cat:
                conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)",
                             (category,))
            if apply_proj:
                conn.execute("INSERT OR IGNORE INTO projects (name) VALUES (?)",
                             (project,))
            for iid in sel:
                try:
                    eid = int(iid)
                except (ValueError, TypeError):
                    continue
                if apply_cat and apply_proj:
                    conn.execute(
                        "UPDATE entries SET category=?, project=? WHERE id=?",
                        (category, project, eid))
                elif apply_cat:
                    conn.execute("UPDATE entries SET category=? WHERE id=?",
                                 (category, eid))
                else:
                    conn.execute("UPDATE entries SET project=? WHERE id=?",
                                 (project, eid))
        self._load_categories()
        self._load_projects()
        for combo, vals in [
            (self._category_combo, self.categories),
            (getattr(self, "_log_category_combo", None), self.categories),
            (self._project_combo, self.projects),
            (getattr(self, "_log_project_combo", None), self.projects),
        ]:
            if combo:
                combo["values"] = vals
        self.refresh_log()
        self.refresh_summary()

    def _add_log_project_from_field(self):
        """Save the project typed in the Log tab without opening a popup."""
        project = self._log_project_var.get().strip()
        if not project:
            messagebox.showwarning("Required", "Type a project name first.")
            return
        with get_db() as conn:
            conn.execute("INSERT OR IGNORE INTO projects (name) VALUES (?)",
                         (project,))
        self._load_projects()
        if self._project_combo:
            self._project_combo["values"] = self.projects
        if self._log_project_combo:
            self._log_project_combo["values"] = self.projects
        self._log_project_var.set(project)

    def _apply_project_to_selected(self):
        """Apply the chosen project to selected log rows."""
        project = self._log_project_var.get().strip()
        if not project:
            messagebox.showwarning("Required", "Choose or type a project.")
            return
        sel = self._tree.selection()
        if not sel:
            messagebox.showwarning("Required", "Select one or more log rows first.")
            return
        with get_db() as conn:
            conn.execute("INSERT OR IGNORE INTO projects (name) VALUES (?)",
                         (project,))
            for iid in sel:
                try:
                    conn.execute("UPDATE entries SET project = ? WHERE id = ?",
                                 (project, int(iid)))
                except (ValueError, TypeError):
                    continue
        self._load_projects()
        if self._project_combo:
            self._project_combo["values"] = self.projects
        if self._log_project_combo:
            self._log_project_combo["values"] = self.projects
        self.refresh_log()
        self.refresh_summary()

    def _bulk_netsuite_selected(self):
        """Open the bulk NetSuite dialog for the selected log rows."""
        sel = self._tree.selection()
        if not sel:
            messagebox.showwarning("Required", "Select one or more log rows first.")
            return
        ids = []
        for iid in sel:
            try:
                ids.append(int(iid))
            except (ValueError, TypeError):
                continue
        if not ids:
            messagebox.showwarning("Required", "Select one or more log rows first.")
            return
        BulkNetSuiteDialog(self, ids)

    def _sort_tree(self, tree, col, reverse):
        """Sort a Treeview by a clicked column."""
        def key_for(iid):
            value = tree.set(iid, col)
            if col == "duration":
                m = re.match(r"(?:(\d+)h\s*)?(\d+)m\s*(\d+)s", value)
                if m:
                    hours = int(m.group(1) or 0)
                    return hours * 3600 + int(m.group(2)) * 60 + int(m.group(3))
            if col == "date":
                try:
                    return datetime.strptime(value, "%m/%d %H:%M")
                except ValueError:
                    return value.lower()
            if col in ("entries",):
                try:
                    return int(value)
                except ValueError:
                    return 0
            return value.lower()

        rows = [(key_for(iid), iid) for iid in tree.get_children("")]
        rows.sort(reverse=reverse)
        for index, (_, iid) in enumerate(rows):
            tree.move(iid, "", index)
        tree.heading(col, command=lambda: self._sort_tree(tree, col, not reverse))

    def _edit_selected_entry(self, _event=None):
        """Open the edit dialog for the selected (or double-clicked) log row."""
        sel = self._tree.selection()
        if not sel:
            messagebox.showinfo("Edit", "Select a log row to edit first.")
            return
        try:
            entry_id = int(sel[0])
        except (ValueError, TypeError):
            return

        EditEntryDialog(self, entry_id)

    def _delete_selected(self, _event=None):
        """Delete selected rows from the Log tree (bound to <Delete> key)."""
        sel = self._tree.selection()
        if not sel:
            return
        if not messagebox.askyesno(
                "Delete",
                f"Delete {len(sel)} log entr{'y' if len(sel) == 1 else 'ies'}?"):
            return
        with get_db() as conn:
            for iid in sel:
                try:
                    conn.execute("DELETE FROM entries WHERE id = ?", (int(iid),))
                except (ValueError, TypeError):
                    continue
        self.refresh_log()
        self.refresh_summary()

    # -- Lifecycle -------------------------------------------------------------
    def _on_close(self):
        """Handle the window's X button.

        With a tray icon available, closing the window hides it and keeps
        tracking in the background (the behaviour the install guide always
        promised). Without pystray installed, X quits as before.
        """
        if TRAY_OK and self._tray_icon is not None:
            self._hide_to_tray()
        else:
            self._quit_app()

    def _quit_app(self):
        """Fully shut down: stop tracking, the HTTP server and the tray icon."""
        try:
            if self.is_tracking:
                self._stop(silent=True)
            srv = getattr(self, "_http_server", None)
            if srv is not None:
                srv.shutdown()
                srv.server_close()
        except Exception:
            pass
        try:
            if self._tray_icon is not None:
                self._tray_icon.stop()
                self._tray_icon = None
        except Exception:
            pass
        self.root.destroy()

    # -- System tray -----------------------------------------------------------
    def _setup_tray(self):
        """Create the system-tray icon and its menu (v1.2.0).

        No-op (and the window keeps its quit-on-close behaviour) when pystray
        or Pillow aren't installed.
        """
        if not TRAY_OK:
            return
        try:
            icon_path = resource_path("tt_tray.ico")
            if not icon_path.exists():
                icon_path = resource_path("tt_badge.ico")
            image = Image.open(str(icon_path))
        except Exception:
            logger.debug("Tray icon image failed to load; tray disabled")
            return

        menu = pystray.Menu(
            pystray.MenuItem("Open Tally", self._tray_show, default=True),
            pystray.MenuItem("Start / Stop tracking", self._tray_toggle),
            pystray.MenuItem(
                "Open Dashboard in Browser", self._tray_dashboard),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", self._tray_quit),
        )
        try:
            self._tray_icon = pystray.Icon(
                "timetracker", image, "Tally", menu)
            # run_detached spins the icon up on its own thread (non-blocking).
            self._tray_icon.run_detached()
        except Exception as e:
            logger.debug("Tray icon failed to start: %s", e)
            self._tray_icon = None

    def _hide_to_tray(self):
        """Hide the main window; keep tracking. Show a one-time hint."""
        self.root.withdraw()
        if not self._tray_notified:
            self._tray_notified = True
            try:
                Toast(self.root,
                      "Tally is still running in the tray.\n"
                      "Right-click the tray icon to quit.",
                      C["success"])
            except Exception:
                pass

    def _show_window(self):
        """Restore and focus the main window."""
        self.root.deiconify()
        self.root.lift()
        try:
            self.root.focus_force()
        except Exception:
            pass

    # Tray callbacks run on pystray's thread; marshal onto the Tk main thread
    # via root.after, the same pattern the HTTP/monitor threads already use.
    def _tray_show(self, _icon=None, _item=None):
        self.root.after(0, self._show_window)

    def _tray_dashboard(self, _icon=None, _item=None):
        self.root.after(
            0, lambda: webbrowser.open(f"http://{HTTP_HOST}:{HTTP_PORT}/"))

    def _tray_toggle(self, _icon=None, _item=None):
        self.root.after(0, self._toggle)

    def _tray_quit(self, _icon=None, _item=None):
        self.root.after(0, self._quit_app)

    # -- Embedded HTTP server --------------------------------------------------
    def _start_http_server(self):
        """Spin up the loopback HTTP server in a daemon thread."""
        # Bind handler -> app so POST /task can update the running entry
        _Handler.app_callback = self._handle_browser_task
        try:
            self._http_server = ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), _Handler)
        except OSError as e:
            logger.error("Failed to start HTTP server on %s:%s - %s",
                         HTTP_HOST, HTTP_PORT, e)
            self._http_server = None
            return
        t = threading.Thread(
            target=self._http_server.serve_forever,
            name="timetracker-http", daemon=True)
        t.start()
        logger.info("HTTP server listening on http://%s:%s",
                    HTTP_HOST, HTTP_PORT)

    def _handle_browser_task(self, payload):
        """Called from POST /task. payload = {board_id, task_id}.

        Enriches via Monday API and patches the currently tracking entry
        with the resolved task_name / board_name / status / assignee.
        Runs on an HTTP worker thread, so all Tk/DB writes are scheduled
        onto the main thread via root.after.
        """
        task_id  = str(payload.get("task_id") or "").strip()
        board_id = str(payload.get("board_id") or "").strip() or None

        # No task open — update url_context / app_name from the page the user landed on
        if not task_id:
            page_title = str(payload.get("page_title") or "").strip() or None
            page_url   = str(payload.get("page_url")   or "").strip() or None
            if (page_title or page_url) and self.is_tracking and self.current_entry:
                entry_id = self.current_entry["id"]
                self.root.after(0, lambda t=page_title, u=page_url, eid=entry_id:
                                self._update_entry_context(eid, t, u))
            return

        meta = self._enrich_monday(board_id, task_id)
        # If we're already tracking, patch the active entry in-place.
        if self.is_tracking and self.current_entry:
            entry_id = self.current_entry["id"]
            self.root.after(0, lambda m=meta, eid=entry_id:
                            self._patch_entry_metadata(eid, m))
        else:
            # Not tracking yet - log it, the next URL poll will pick it up.
            logger.info("Browser ping for task %s but no active entry", task_id)

    def _patch_entry_metadata(self, entry_id, meta):
        """Update an entry row with newly resolved Monday metadata."""
        with get_db() as conn:
            conn.execute("""
                UPDATE entries SET
                    monday_board_id = COALESCE(?, monday_board_id),
                    monday_item_id  = COALESCE(?, monday_item_id),
                    task_name       = COALESCE(?, task_name),
                    board_name      = COALESCE(?, board_name),
                    status          = COALESCE(?, status),
                    assignee        = COALESCE(?, assignee),
                    due_date        = COALESCE(?, due_date)
                WHERE id = ?
            """, (meta.get("board_id"), meta.get("task_id"),
                  meta.get("task_name"), meta.get("board_name"),
                  meta.get("status"), meta.get("assignee"),
                  meta.get("due_date"), entry_id))
            if meta.get("board_id") and meta.get("board_name"):
                conn.execute("""
                    UPDATE monday_boards SET board_name = ?
                    WHERE board_id = ? AND (board_name IS NULL OR board_name LIKE 'Board %')
                """, (meta["board_name"], meta["board_id"]))
        # Surface the resolved task name in the UI
        if meta.get("task_name") and self.is_tracking:
            self._task_var.set(meta["task_name"])

    # -- Daily review ----------------------------------------------------------

    def _save_review_settings(self):
        set_setting("REVIEW_BOARD_ID", self._review_board_var.get().strip())
        set_setting("REVIEW_HOUR",     self._review_hour_var.get().strip())
        set_setting("REVIEW_PERIOD",   self._review_period_var.get().strip())
        self._review_status_lbl.config(text="Settings saved.", fg=C["dim"])
        self._schedule_daily_review()

    def _schedule_daily_review(self):
        """Schedule the daily review to fire at the configured hour."""
        if hasattr(self, "_review_after_id") and self._review_after_id:
            try:
                self.root.after_cancel(self._review_after_id)
            except Exception:
                pass
        try:
            hour_str = getattr(self, "_review_hour_var", None)
            target_hour = int(hour_str.get().strip() if hour_str else
                              get_setting("REVIEW_HOUR") or "18")
        except (ValueError, AttributeError):
            return
        now = datetime.now()
        run_at = now.replace(hour=target_hour, minute=0, second=0, microsecond=0)
        if run_at <= now:
            run_at = run_at.replace(day=run_at.day + 1)
        delay_ms = int((run_at - now).total_seconds() * 1000)
        self._review_after_id = self.root.after(
            delay_ms,
            lambda: threading.Thread(target=self._run_daily_review, daemon=True).start())
        logger.info("Daily review scheduled for %s", run_at.strftime("%H:%M on %Y-%m-%d"))

    def _query_daily_summary(self, for_date: date):
        """Return list of task rows for the given date, sorted by duration desc.
        Each row: {task, project, category, secs, entries}"""
        d_str = for_date.isoformat()
        with get_db() as conn:
            rows = conn.execute("""
                SELECT COALESCE(task_name, task)  AS task,
                       SUM(duration_seconds)      AS secs,
                       COUNT(*)                   AS entries,
                       (SELECT project  FROM entries e2
                        WHERE date(e2.start_time) = ? AND e2.duration_seconds > 0
                          AND COALESCE(e2.task_name, e2.task) = COALESCE(e1.task_name, e1.task)
                        ORDER BY e2.duration_seconds DESC LIMIT 1) AS project,
                       (SELECT category FROM entries e2
                        WHERE date(e2.start_time) = ? AND e2.duration_seconds > 0
                          AND COALESCE(e2.task_name, e2.task) = COALESCE(e1.task_name, e1.task)
                        ORDER BY e2.duration_seconds DESC LIMIT 1) AS category,
                       (SELECT notes FROM entries e2
                        WHERE date(e2.start_time) = ? AND e2.duration_seconds > 0
                          AND COALESCE(e2.task_name, e2.task) = COALESCE(e1.task_name, e1.task)
                          AND e2.notes IS NOT NULL AND e2.notes != ''
                        ORDER BY e2.duration_seconds DESC LIMIT 1) AS notes,
                       (SELECT ns_project FROM entries e2
                        WHERE date(e2.start_time) = ? AND e2.duration_seconds > 0
                          AND COALESCE(e2.task_name, e2.task) = COALESCE(e1.task_name, e1.task)
                          AND e2.ns_project IS NOT NULL
                        ORDER BY e2.duration_seconds DESC LIMIT 1) AS ns_project,
                       (SELECT ns_task FROM entries e2
                        WHERE date(e2.start_time) = ? AND e2.duration_seconds > 0
                          AND COALESCE(e2.task_name, e2.task) = COALESCE(e1.task_name, e1.task)
                          AND e2.ns_task IS NOT NULL
                        ORDER BY e2.duration_seconds DESC LIMIT 1) AS ns_task,
                       (SELECT ns_service_item FROM entries e2
                        WHERE date(e2.start_time) = ? AND e2.duration_seconds > 0
                          AND COALESCE(e2.task_name, e2.task) = COALESCE(e1.task_name, e1.task)
                          AND e2.ns_service_item IS NOT NULL
                        ORDER BY e2.duration_seconds DESC LIMIT 1) AS ns_service_item
                FROM entries e1
                WHERE date(start_time) = ? AND duration_seconds > 0
                GROUP BY COALESCE(task_name, task)
                ORDER BY secs DESC
            """, (d_str, d_str, d_str, d_str, d_str, d_str, d_str,)).fetchall()
        return [dict(r) for r in rows]

    def _fmt_secs(self, secs):
        h, m = divmod(int(secs) // 60, 60)
        return f"{h}h {m:02d}m" if h else f"{m}m"

    def _run_daily_review(self):
        """Build a daily summary and post it as a Monday item. Runs on a worker thread."""
        if not self.monday_api.is_available():
            self.root.after(0, lambda: self._review_status_lbl.config(
                text="Monday API token not configured.", fg=C["primary"]))
            return

        # Prefer the value currently typed in the field (so RUN NOW honours an
        # un-saved board id), falling back to the saved setting / default for
        # scheduled background runs.
        board_var = getattr(self, "_review_board_var", None)
        board_id  = (board_var.get().strip() if board_var else "") \
                    or get_setting("REVIEW_BOARD_ID") or "18418713154"

        # Prefer the date picker; fall back to period setting for scheduled runs
        de = getattr(self, "_review_date_entry", None)
        if de is not None and TKCAL_OK and hasattr(de, "get_date"):
            for_date = de.get_date()
        elif de is not None and not TKCAL_OK:
            try:
                from datetime import date as _date
                for_date = _date.fromisoformat(de.get().strip())
            except Exception:
                for_date = date.today()
        else:
            period = self._review_period_var.get() or get_setting("REVIEW_PERIOD") or "today"
            for_date = date.today() if period == "today" else date.today() - timedelta(days=1)

        self.root.after(0, lambda: self._review_status_lbl.config(
            text=f"Running review for {for_date}…", fg=C["dim"]))

        task_rows = self._query_daily_summary(for_date)

        if not task_rows:
            self.root.after(0, lambda: self._review_status_lbl.config(
                text=f"No entries found for {for_date}.", fg=C["dim"]))
            return

        # Ensure columns exist — one item per task row, so columns are per-task fields
        wanted_cols = [
            ("Date",             "date"),
            ("Duration",         "numbers"),
            ("Project",          "text"),
            ("Category",         "text"),
            ("Notes",            "text"),
            ("NS Project",       "text"),
            ("NS Task",          "text"),
            ("NS Service Item",  "text"),
            ("Entries",          "numbers"),
            ("Status",           "status"),
            ("Logged By",        "people"),
        ]
        monday_user_id = self.monday_api.get_me()
        col_ids, col_err = self.monday_api.get_or_create_columns(board_id, wanted_cols)
        if col_err and not col_ids:
            self.root.after(0, lambda e=col_err: self._review_status_lbl.config(
                text=f"Board error: {e}", fg=C["primary"]))
            return

        # Create / find group named after the date e.g. "Monday 29 June"
        group_name = f"{for_date.strftime('%A')} {for_date.day} {for_date.strftime('%B')}"
        group_id, _gerr = self.monday_api.get_or_create_group(board_id, group_name)

        # Fetch existing items in the group so we can upsert instead of duplicate
        existing_items = {}
        if group_id:
            existing_items = self.monday_api.get_items_in_group(board_id, group_id)

        posted = 0
        updated = 0
        last_err = None
        for row in task_rows:
            task_name = (row.get("task") or "Unknown task")[:255]
            hours     = round((row.get("secs") or 0) / 3600, 2)
            col_vals  = {}
            if "date"     in col_ids:
                col_vals[col_ids["date"]]     = {"date": for_date.isoformat()}
            if "duration" in col_ids:
                col_vals[col_ids["duration"]] = hours
            if "project"  in col_ids:
                col_vals[col_ids["project"]]  = row.get("project") or ""
            if "category" in col_ids:
                col_vals[col_ids["category"]] = row.get("category") or ""
            if "notes"           in col_ids:
                col_vals[col_ids["notes"]]           = row.get("notes") or ""
            if "ns project"      in col_ids:
                col_vals[col_ids["ns project"]]      = row.get("ns_project") or ""
            if "ns task"         in col_ids:
                col_vals[col_ids["ns task"]]         = row.get("ns_task") or ""
            if "ns service item" in col_ids:
                col_vals[col_ids["ns service item"]] = row.get("ns_service_item") or ""
            if "entries"  in col_ids:
                col_vals[col_ids["entries"]]  = row.get("entries") or 1
            if "status"   in col_ids:
                col_vals[col_ids["status"]]   = {"label": "Done"}
            if "logged by" in col_ids and monday_user_id:
                col_vals[col_ids["logged by"]] = {"personsAndTeams": [{"id": int(monday_user_id), "kind": "person"}]}

            existing_id = existing_items.get(task_name.strip().lower())
            if existing_id:
                item_id, post_err = self.monday_api.update_item(board_id, existing_id, col_vals)
                if item_id:
                    updated += 1
                else:
                    last_err = post_err
            else:
                item_id, post_err = self.monday_api.create_item(board_id, task_name, col_vals, group_id=group_id)
                if item_id:
                    posted += 1
                else:
                    last_err = post_err

        total_written = posted + updated
        if total_written:
            parts = []
            if posted:
                parts.append(f"{posted} new")
            if updated:
                parts.append(f"{updated} updated")
            msg = f"Posted {', '.join(parts)} task{'s' if total_written > 1 else ''} to Monday ({for_date})"
            if last_err:
                msg += " — some skipped"
            logger.info(msg)
            self.root.after(0, lambda m=msg: self._review_status_lbl.config(
                text=m, fg=C["dim"]))
        else:
            err_msg = last_err or "unknown error"
            logger.warning("Daily review post failed: %s", err_msg)
            self.root.after(0, lambda e=err_msg: self._review_status_lbl.config(
                text=f"Post failed: {e}", fg=C["primary"]))
            return

        # Re-arm for the next day
        self.root.after(0, self._schedule_daily_review)

    def _update_entry_context(self, entry_id, page_title, page_url):
        """Update url_context and app_name when the user leaves a Monday task.

        Monday metadata is left intact — only the context fields are refreshed
        so the log shows what the user switched to without losing task linkage.
        """
        with get_db() as conn:
            conn.execute("""
                UPDATE entries SET
                    app_name    = COALESCE(?, app_name),
                    url_context = COALESCE(?, url_context)
                WHERE id = ?
            """, (page_title, page_url, entry_id))


# -- Entry point ---------------------------------------------------------------
__version__ = "1.2.6"


def main():
    register_fonts()
    init_db()
    root = tk.Tk()
    TimeTrackerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()

# Tally v1.2.5 — fonts: Archivo / Manrope / Spline Sans Mono
