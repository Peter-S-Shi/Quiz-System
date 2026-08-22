#!/usr/bin/env python3
"""Canonical Quiz Studio local development runtime."""

from __future__ import annotations

import argparse
import csv
import functools
import http.client
import json
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


CANONICAL_HOST = "localhost"
CANONICAL_PORT = 8000
CANONICAL_URL = f"http://{CANONICAL_HOST}:{CANONICAL_PORT}"
REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
RECOVERY_PATH = "/__runtime__/recover"
RECOVERY_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quiz Studio local runtime recovery</title>
</head>
<body>
  <p id="status">Preparing the current Quiz Studio working tree...</p>
  <script>
  (async () => {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const quizStudioRegistrations = registrations.filter((registration) => {
        const workers = [registration.installing, registration.waiting, registration.active].filter(Boolean);
        return new URL(registration.scope).origin === location.origin && workers.some((worker) => {
          const script = new URL(worker.scriptURL);
          return script.origin === location.origin && script.pathname === "/sw.js";
        });
      });
      await Promise.all(quizStudioRegistrations.map((registration) => registration.unregister()));
    }
    if ("caches" in globalThis) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.filter((name) => name.startsWith("quiz-studio-")).map((name) => caches.delete(name))
      );
    }
    location.replace("/?local-runtime=recovered=1");
  })().catch((error) => {
    document.getElementById("status").textContent =
      `Local runtime recovery failed: ${error.message}. Close this tab and run start-local.bat again.`;
  });
  </script>
</body>
</html>
"""


class LocalRuntimeHandler(SimpleHTTPRequestHandler):
    """Serve the working tree without browser or intermediary cache reuse."""

    def do_GET(self) -> None:
        request_path = self.path.split("?", 1)[0]
        if request_path == "/__runtime__/health":
            payload = json.dumps(
                {"status": "ok", "origin": CANONICAL_URL},
                separators=(",", ":"),
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if request_path == RECOVERY_PATH:
            payload = RECOVERY_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write(f"[runtime] {self.address_string()} {format % args}\n")


class IPv4RuntimeServer(ThreadingHTTPServer):
    address_family = socket.AF_INET
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self) -> None:
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class IPv6RuntimeServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self) -> None:
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        super().server_bind()


def localhost_families() -> set[int]:
    """Return the address families the operating system advertises for localhost."""

    return {
        family
        for family, _socktype, _proto, _canonname, _sockaddr in socket.getaddrinfo(
            CANONICAL_HOST,
            CANONICAL_PORT,
            type=socket.SOCK_STREAM,
        )
        if family in {socket.AF_INET, socket.AF_INET6}
    }


def create_servers() -> list[ThreadingHTTPServer]:
    handler = functools.partial(LocalRuntimeHandler, directory=str(REPOSITORY_ROOT))
    families = localhost_families()
    if socket.AF_INET not in families:
        raise OSError("localhost does not resolve to IPv4 loopback on this system")

    servers: list[ThreadingHTTPServer] = []
    try:
        servers.append(IPv4RuntimeServer(("127.0.0.1", CANONICAL_PORT), handler))
        if socket.AF_INET6 in families:
            servers.append(IPv6RuntimeServer(("::1", CANONICAL_PORT), handler))
    except OSError:
        for server in servers:
            server.server_close()
        raise
    return servers


def windows_port_owners() -> list[str]:
    """Return best-effort process evidence for listeners on the canonical Windows port."""

    if sys.platform != "win32":
        return []
    try:
        netstat = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            check=False,
            text=True,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []

    pids = set()
    for line in netstat.stdout.splitlines():
        fields = line.split()
        if len(fields) >= 5 and fields[0].upper() == "TCP" and fields[3].upper() == "LISTENING":
            local_address = fields[1]
            if local_address.rsplit(":", 1)[-1] == str(CANONICAL_PORT) and fields[4].isdigit():
                pids.add(fields[4])

    owners = []
    for pid in sorted(pids, key=int):
        process_name = "unknown process"
        try:
            tasklist = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True,
                check=False,
                text=True,
                timeout=3,
            )
            rows = list(csv.reader(tasklist.stdout.splitlines()))
            if rows and len(rows[0]) >= 2 and rows[0][1] == pid:
                process_name = rows[0][0]
        except (OSError, subprocess.TimeoutExpired, csv.Error):
            pass
        owners.append(f"{process_name} (PID {pid})")
    return owners


def verify_servers(servers: list[ThreadingHTTPServer], timeout: float = 3.0) -> None:
    """Verify every advertised localhost route through the browser-facing Host contract."""

    deadline = time.monotonic() + timeout
    pending = {server.server_address[0] for server in servers}
    last_errors: dict[str, str] = {}
    while pending and time.monotonic() < deadline:
        for address in list(pending):
            connection = http.client.HTTPConnection(address, CANONICAL_PORT, timeout=0.5)
            try:
                connection.request(
                    "GET",
                    "/__runtime__/health",
                    headers={"Host": f"{CANONICAL_HOST}:{CANONICAL_PORT}"},
                )
                response = connection.getresponse()
                payload = json.loads(response.read().decode("utf-8"))
                if response.status == 200 and payload == {
                    "status": "ok",
                    "origin": CANONICAL_URL,
                }:
                    pending.remove(address)
                    last_errors.pop(address, None)
                else:
                    last_errors[address] = f"unexpected health response {response.status}: {payload!r}"
            except (OSError, ValueError, json.JSONDecodeError) as error:
                last_errors[address] = str(error)
            finally:
                connection.close()
        if pending:
            time.sleep(0.05)
    if pending:
        details = "; ".join(f"{address}: {last_errors.get(address, 'not ready')}" for address in pending)
        raise RuntimeError(f"browser-facing health verification failed ({details})")


def run(*, open_browser: bool = True) -> int:
    try:
        servers = create_servers()
    except OSError as error:
        print(
            f"Error: cannot start the canonical Quiz Studio runtime at {CANONICAL_URL}/: {error}",
            file=sys.stderr,
            flush=True,
        )
        print(
            "Port 8000 must remain available because changing it would change the browser data origin.",
            file=sys.stderr,
            flush=True,
        )
        owners = windows_port_owners()
        if owners:
            print(f"Current port 8000 listener(s): {', '.join(owners)}", file=sys.stderr, flush=True)
            print("Close the existing listener, then run start-local.bat again.", file=sys.stderr, flush=True)
        return 1

    threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in servers]
    for thread in threads:
        thread.start()

    try:
        verify_servers(servers)
    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr, flush=True)
        for server in servers:
            server.shutdown()
            server.server_close()
        for thread in threads:
            thread.join(timeout=2)
        return 1

    family_names = "IPv4 + IPv6" if len(servers) == 2 else "IPv4 (system has no IPv6 localhost)"
    print(f"Local runtime ready: {CANONICAL_URL}/ [{family_names}]", flush=True)
    if open_browser:
        webbrowser.open(f"{CANONICAL_URL}{RECOVERY_PATH}")

    try:
        while all(thread.is_alive() for thread in threads):
            time.sleep(0.25)
    except KeyboardInterrupt:
        print("\nStopping Quiz Studio local runtime...", flush=True)
    finally:
        for server in servers:
            server.shutdown()
        for server in servers:
            server.server_close()
        for thread in threads:
            thread.join(timeout=2)
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="serve without opening a browser (for automated verification)",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    arguments = parse_args(sys.argv[1:])
    raise SystemExit(run(open_browser=not arguments.no_browser))
