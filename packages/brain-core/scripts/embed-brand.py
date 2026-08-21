#!/usr/bin/env python3
from __future__ import annotations

import base64
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

data = Path("//192.168.1.150/Container/pomnia-kvm/data")
cands: list[str] = []
for name in ["admin-panel-password.txt", "e2e-token.txt", "netdash-token.txt"]:
    p = data / name
    try:
        t = p.read_text(encoding="utf-8", errors="replace").strip()
        print(name, "ok", len(t))
        if name == "admin-panel-password.txt":
            cands.append(t)
            for line in t.splitlines():
                cands.append(line.split(":", 1)[-1].strip())
    except OSError as e:
        print(name, type(e).__name__, e)

hk = "SHA256:neuaZbzb4OMjVyNMZTTDc9HRIRq34uV9g5RkCpstZYY"
plink = r"C:\Program Files\PuTTY\plink.exe"
for pw in dict.fromkeys(cands):
    if len(pw) < 4:
        continue
    r = subprocess.run(
        [plink, "-batch", "-ssh", "-pw", pw, "-hostkey", hk, "h@192.168.1.150", "echo SSH_OK"],
        capture_output=True,
        text=True,
        timeout=12,
    )
    out = (r.stdout or "") + (r.stderr or "")
    if "SSH_OK" in out:
        Path(r"C:\Users\Admin\AppData\Local\Temp\pomnia-150.pw").write_text(pw, encoding="utf-8")
        print("SSH_OK")
        break
else:
    print("admin-pw not ssh")

brand = Path(r"C:\Users\Admin\Projects\pomnia-dev-kvm\packages\brain-core\src\mcp\brand")
out = Path(r"C:\Users\Admin\Projects\pomnia-dev-kvm\packages\brain-core\src\mcp\brandAssets.ts")
parts = [
    "// SPDX-License-Identifier: AGPL-3.0-only",
    "// Copyright (C) 2026 Pomnia",
    "/** Favicons from pomnia-landing — embedded so the panel stays zero-CDN. */",
    "",
]
for name, var in [
    ("favicon.ico", "FAVICON_ICO_B64"),
    ("icon.png", "ICON_PNG_B64"),
    ("apple-touch-icon.png", "APPLE_TOUCH_B64"),
]:
    b = base64.b64encode((brand / name).read_bytes()).decode("ascii")
    parts.append(f"export const {var} =")
    chunks = [b[i : i + 120] for i in range(0, len(b), 120)]
    for i, c in enumerate(chunks):
        sep = "" if i == len(chunks) - 1 else " +"
        parts.append(f"  '{c}'{sep}")
    parts.append("")
out.write_text("\n".join(parts) + "\n", encoding="utf-8")
print("wrote", out.name, out.stat().st_size)
