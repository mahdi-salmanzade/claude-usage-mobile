#!/usr/bin/env python3
"""
Companion server bridge — serves the mobile app from an *unpatched* Mac app.

The phone talks to `LocalServerService.swift` inside Claude Usage Tracker, but
that server only exists in the local-companion branch. The released app (3.3.0)
has no server — it just keeps its usage snapshot in UserDefaults like it always
has. This script reads that same snapshot and speaks the identical wire
contract, so the app can pair with a stock Mac install.

It is a faithful stand-in, not an approximation:

  • same two routes, `/v1/ping` and `/v1/usage`, GET only
  • same order of checks — method, then auth, then route, so a bad token is 401
    on any path and a good token on a bad path is 404
  • same encoder rules as Swift's `JSONEncoder` with `.iso8601`: absent keys for
    nil (never `null`), UTC `Z` timestamps with no fractional seconds, and
    `userTimezone` as an object, not a string
  • same token, read from the app's own `localServerToken` default, so pairing
    survives a switch to a patched build

Read-only, and nothing but the already-computed usage numbers leaves the Mac —
the Claude session key stays in the Keychain, untouched by this process.

    python3 scripts/companion-server.py [--port 47600] [--host 0.0.0.0]
"""

from __future__ import annotations

import argparse
import hmac
import json
import plistlib
import secrets
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlsplit

DOMAIN = "HamedElfayome.Claude-Usage"
API_VERSION = "v1"
DEFAULT_PORT = 47600

# Swift encodes `Date` in stored profiles with the default strategy: seconds
# since the Apple reference date (2001-01-01), not the Unix epoch.
APPLE_EPOCH_OFFSET = 978_307_200

DATE_FIELDS = (
    "sessionResetTime",
    "weeklyResetTime",
    "sonnetWeeklyResetTime",
    "designWeeklyResetTime",
    "fableWeeklyResetTime",
    "lastUpdated",
)

# Mirrors `ClaudeUsage` field-for-field. Computed properties
# (`effectiveSessionPercentage`, `remainingPercentage`, …) are not Codable
# members and must not appear on the wire.
REQUIRED_FIELDS = (
    "sessionTokensUsed",
    "sessionLimit",
    "sessionPercentage",
    "sessionResetTime",
    "weeklyTokensUsed",
    "weeklyLimit",
    "weeklyPercentage",
    "weeklyResetTime",
    "opusWeeklyTokensUsed",
    "opusWeeklyPercentage",
    "sonnetWeeklyTokensUsed",
    "sonnetWeeklyPercentage",
    "designWeeklyTokensUsed",
    "designWeeklyPercentage",
    "fableWeeklyTokensUsed",
    "fableWeeklyPercentage",
    "lastUpdated",
    "userTimezone",
)

OPTIONAL_FIELDS = (
    "sonnetWeeklyResetTime",
    "designWeeklyResetTime",
    "fableWeeklyResetTime",
    "costUsed",
    "costLimit",
    "costCurrency",
    "overageBalance",
    "overageBalanceCurrency",
    "planType",
    "creditsBalance",
    "creditsUnlimited",
)


# ── reading the Mac app's state ─────────────────────────────────────────────


def read_defaults() -> dict[str, Any]:
    """Current UserDefaults for the tracker, via cfprefsd (not the raw file, so
    values the running app wrote moments ago are visible)."""
    out = subprocess.run(
        ["defaults", "export", DOMAIN, "-"],
        capture_output=True,
        check=True,
    ).stdout
    return plistlib.loads(out)


def _json_blob(value: Any) -> Any:
    """`profiles_v3` and `claudeUsageData` are JSON stored as plist data."""
    if isinstance(value, (bytes, bytearray)):
        return json.loads(value)
    if isinstance(value, str):
        return json.loads(value)
    return None


def active_snapshot(defaults: dict[str, Any]) -> tuple[dict | None, str | None, str | None]:
    """The active profile's usage, its name and its provider.

    Usage lives inside the profile record (`ProfileManager.saveClaudeUsage`);
    the app-wide `claudeUsageData` key is only a leftover from older installs,
    which is exactly how the Swift server treats it too.
    """
    profiles = _json_blob(defaults.get("profiles_v3")) or []
    active_id = defaults.get("activeProfileId")
    profile = next((p for p in profiles if p.get("id") == active_id), None)
    if profile is None and profiles:
        profile = profiles[0]

    usage = (profile or {}).get("claudeUsage")
    if usage is None:
        usage = _json_blob(defaults.get("claudeUsageData"))

    name = (profile or {}).get("name")
    provider = (profile or {}).get("provider")
    return usage, name, provider


# ── encoding ────────────────────────────────────────────────────────────────


def iso(epoch_seconds: float) -> str:
    """Swift's `.iso8601`: UTC, `Z`, and no fractional seconds. The client
    parses with `Date.parse`, which is fine either way, but the history
    recorder dedupes on the exact `lastUpdated` string — so it has to be
    byte-identical to what the Mac would send."""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch_seconds))


def apple_date_to_iso(value: Any) -> str | None:
    if not isinstance(value, (int, float)):
        return None
    return iso(value + APPLE_EPOCH_OFFSET)


def wire_usage(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Translate a stored `ClaudeUsage` into the shape the phone expects."""
    usage: dict[str, Any] = {}

    for key in REQUIRED_FIELDS + OPTIONAL_FIELDS:
        if key not in raw:
            continue
        value = raw[key]
        if key in DATE_FIELDS:
            value = apple_date_to_iso(value)
        if value is None:
            continue  # nil is an absent key, never JSON null
        usage[key] = value

    # `TimeZone: Codable` is keyed, so the client reads `.identifier`.
    tz = usage.get("userTimezone")
    if isinstance(tz, str):
        usage["userTimezone"] = {"identifier": tz}

    missing = [k for k in REQUIRED_FIELDS if k not in usage]
    if missing:
        log(f"snapshot is missing {', '.join(missing)} — reporting hasData:false")
        return None
    return usage


def usage_response(defaults: dict[str, Any]) -> dict[str, Any]:
    raw, name, provider = active_snapshot(defaults)
    usage = wire_usage(raw) if isinstance(raw, dict) else None

    body: dict[str, Any] = {
        "apiVersion": API_VERSION,
        "serverTime": iso(time.time()),
    }
    if name:
        body["profileName"] = name
    if provider:
        body["provider"] = provider
    body["hasData"] = usage is not None
    if usage is not None:
        body["usage"] = usage
    return body


# ── server ──────────────────────────────────────────────────────────────────


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')}  {message}", flush=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ClaudeUsageCompanion/1.0"
    token = ""

    def do_GET(self) -> None:  # noqa: N802
        path, query = self._split_target()

        if not self._authorized(query):
            log(f"401  {path}")
            self._send(401, {"error": "unauthorized"})
            return

        if path == f"/{API_VERSION}/ping":
            log(f"200  {path}")
            self._send(200, {"ok": True, "app": "claude-usage-tracker", "apiVersion": API_VERSION})
            return

        if path == f"/{API_VERSION}/usage":
            try:
                body = usage_response(read_defaults())
            except Exception as exc:  # the app is mid-write, or was removed
                log(f"500  {path}  ({exc})")
                self._send(500, {"error": "encode_failed"})
                return
            log(f"200  {path}  hasData={body['hasData']}")
            self._send(200, body)
            return

        log(f"404  {path}")
        self._send(404, {"error": "not_found"})

    def _method_not_allowed(self) -> None:
        # Method is rejected before auth, matching the Swift router.
        self._send(405, {"error": "method_not_allowed"})

    do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = _method_not_allowed

    def _split_target(self) -> tuple[str, dict[str, list[str]]]:
        parts = urlsplit(self.path)
        return parts.path, parse_qs(parts.query)

    def _authorized(self, query: dict[str, list[str]]) -> bool:
        presented = None
        header = self.headers.get("Authorization")
        if header and header.lower().startswith("bearer "):
            presented = header[len("bearer ") :].strip()
        if presented is None:
            presented = (query.get("token") or [None])[0]
        if not presented or not self.token:
            return False
        return hmac.compare_digest(presented, self.token)

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: Any) -> None:
        pass  # we log routes ourselves, one line each


def lan_address() -> str | None:
    for interface in ("en0", "en1"):
        result = subprocess.run(["ipconfig", "getifaddr", interface], capture_output=True, text=True)
        address = result.stdout.strip()
        if address:
            return address
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0", help="bind address (default: all interfaces)")
    parser.add_argument("--port", type=int, default=None, help=f"TCP port (default: {DEFAULT_PORT})")
    parser.add_argument("--token", default=None, help="override the pairing token")
    args = parser.parse_args()

    try:
        defaults = read_defaults()
    except subprocess.CalledProcessError:
        print(f"Claude Usage Tracker has no preferences under {DOMAIN}. Is it installed?", file=sys.stderr)
        return 1

    token = args.token or defaults.get("localServerToken") or secrets.token_urlsafe(24)
    port = args.port or int(defaults.get("localServerPort") or 0) or DEFAULT_PORT
    Handler.token = token

    usage, profile_name, provider = active_snapshot(defaults)
    host = lan_address() or "127.0.0.1"
    pairing = json.dumps({"v": 1, "host": host, "port": port, "token": token}, separators=(",", ":"))

    print()
    print("  Claude Usage companion server")
    print(f"  profile   {profile_name or '—'} ({provider or 'unknown provider'})")
    if isinstance(usage, dict) and isinstance(usage.get("lastUpdated"), (int, float)):
        print(f"  snapshot  last updated {apple_date_to_iso(usage['lastUpdated'])}")
    else:
        print("  snapshot  none yet — open the Mac app and let it refresh")
    print()
    print(f"  Host      {host}")
    print(f"  Port      {port}")
    print(f"  Token     {token}")
    print()
    print(f"  Pairing   {pairing}")
    print()

    server = ThreadingHTTPServer((args.host, port), Handler)
    log(f"listening on {args.host}:{port} — ctrl-C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("stopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
