#!/usr/bin/env python3
"""Loopback → LAN Ollama relay for macOS.

Pomnia.app (Electron fetch / Node sockets) often cannot reach LAN Ollama even
when Terminal curl works — Local Network privacy, Little Snitch, or both.
launchd starts this python3 process so LAN traffic is not attributed to Pomnia;
the app only talks to 127.0.0.1.
"""
from __future__ import annotations

import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

TARGET = os.environ.get("POMNIA_OLLAMA_TARGET", "http://127.0.0.1:11434").rstrip("/")
PORT = int(os.environ.get("POMNIA_OLLAMA_RELAY_PORT", "18765"))
# GET probes should fail fast; POST pull/generate can run for a long time.
PROBE_TIMEOUT = float(os.environ.get("POMNIA_OLLAMA_RELAY_PROBE_TIMEOUT", "15"))
LONG_TIMEOUT = float(os.environ.get("POMNIA_OLLAMA_RELAY_TIMEOUT", "3600"))
HOP = {"host", "content-length", "transfer-encoding", "connection", "keep-alive"}
CHUNK = 65536


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _timeout(self) -> float:
        if self.command in ("POST", "PUT"):
            return LONG_TIMEOUT
        return PROBE_TIMEOUT

    def _health(self) -> None:
        body = b'{"ok":true,"target":"' + TARGET.encode("utf-8", "replace") + b'"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _proxy(self) -> None:
        url = f"{TARGET}{self.path}"
        length = int(self.headers.get("Content-Length") or 0)
        data = self.rfile.read(length) if length else None
        req = Request(url, data=data, method=self.command)
        for key, value in self.headers.items():
            if key.lower() not in HOP:
                req.add_header(key, value)
        try:
            with urlopen(req, timeout=self._timeout()) as resp:
                self.send_response(resp.status)
                clen = resp.headers.get("Content-Length")
                for key, value in resp.headers.items():
                    if key.lower() not in HOP:
                        self.send_header(key, value)
                if clen is None:
                    self.send_header("Transfer-Encoding", "chunked")
                    self.end_headers()
                    if self.command != "HEAD":
                        while True:
                            chunk = resp.read(CHUNK)
                            if not chunk:
                                break
                            self.wfile.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n")
                        self.wfile.write(b"0\r\n\r\n")
                else:
                    self.end_headers()
                    if self.command != "HEAD":
                        remaining = int(clen)
                        while remaining > 0:
                            chunk = resp.read(min(CHUNK, remaining))
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            self.wfile.write(chunk)
        except HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except URLError as e:
            msg = str(e.reason if hasattr(e, "reason") else e).encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
        except Exception as e:  # noqa: BLE001 — surface to client
            msg = str(e).encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] in ("/healthz", "/health"):
            self._health()
            return
        self._proxy()

    def do_POST(self) -> None:  # noqa: N802
        self._proxy()

    def do_HEAD(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] in ("/healthz", "/health"):
            self._health()
            return
        self._proxy()

    def do_PUT(self) -> None:  # noqa: N802
        self._proxy()

    def do_DELETE(self) -> None:  # noqa: N802
        self._proxy()

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        sys.stderr.write(f"[pomnia-ollama-relay] {self.address_string()} {fmt % args}\n")


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    sys.stderr.write(
        f"[pomnia-ollama-relay] {TARGET} ← 127.0.0.1:{PORT} "
        f"(probe {PROBE_TIMEOUT}s / long {LONG_TIMEOUT}s)\n"
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
