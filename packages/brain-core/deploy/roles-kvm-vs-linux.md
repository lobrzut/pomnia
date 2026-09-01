# Roles: KVM vs Linux vs Distill

**Werdykt produktowy (Helluk 2026-08-21):**  
**KVM** = always-on **search appliance** (bez destylacji w serwerze).  
**Linux** = **pełny SoT** — search + **distill** na lokalnym GPU Ollama.

Różnica to nie tylko „ONNX vs Ollama embed”. Linux **przejmuje destylację z Desktop** (worker w `brain-core`). KVM zostaje lekki.

## Podział ról

| | **Pomnia KVM** (`.150`) | **Pomnia Linux** (`.201`) |
|--|--|--|
| Rola | search appliance (mało RAM, always-on) | **pełny SoT** — search + **distill** |
| Embed | **fastembed ONNX** in-process — **bez Ollamy** | **Ollama** `nomic-embed-text` (HTTP) |
| Distill w serwerze | **NIE** — `BRAIN_DISTILL=0`, UI Destylacja ukryta | **TAK** — Ollama chat `qwen2.5:14b` (`BRAIN_DISTILL_MODEL`) |
| Vault | docelowo writer / Sejf | **writer** wymagany do zapisu `distilled/` |
| Deploy | Docker / Dockge | systemd `/opt/pomnia-brain-core` |
| UI | ten sam `packages/brain-core` | Destylacja widoczna gdy writable + feature on |

## Stan live (homelab) — uczciwie

```text
.150 /healthz → embed.backend=fastembed   # OK dla appliance; BRAIN_DISTILL=0
.201 /healthz → embed.backend=ollama      # OK
.201 Ollama   → :11434 embed (nomic) + generate (qwen2.5:14b)
.201 unit     → --read-only --vault-owner "Pomnia Desktop"  # dziś RO replica
.201 distill  → kod w core GOTOWY; produkcja NIE pisze dopóki RO
```

### Distill w `brain-core`

| | |
|--|--|
| **Kod** | `packages/brain-core/src/distill/` (port z Desktop `src/core/brain/distill.ts`) |
| **API** | `GET/POST /admin/distill`, `POST /admin/distill/cancel` |
| **CLI** | `brain-core --distill` · `--distill-dry-run` · `--file conversations.json` |
| **Inbox** | `vault/state/distill-inbox/*.json` (Desktop Connect→enqueue = TODO) |
| **Zapis** | `vault/distilled/` (+ `_review/` / `_weak/`), ledger `state/distill-ledger.json` |
| **Health** | `/healthz` → `distill.{enabled,runnable,phase}` (model redacted publicznie) |

Desktop nadal ma lokalną ścieżkę distill — nie kasujemy. Remote job z Desktop = osobny klient Connect (poza zakresem MVP).

## Jak odpalić distill na Linux (gdy writable)

```bash
# Dry-run przeciw Ollama (bez zapisu vault):
brain-core --distill-dry-run --ollama-url http://127.0.0.1:11434 \
  --distill-model qwen2.5:14b

# Inbox → distilled/ (wymaga writable SoT):
brain-core --distill --vault-root /var/lib/pomnia/vault \
  --ollama-url http://127.0.0.1:11434 --distill-model qwen2.5:14b

# Albo panel: /admin → Destylacja → Uruchom (inbox) / Dry-run
# Albo: POST /admin/distill  { "dryRun": true }
#       POST /admin/distill  { "conversations": [ ... ] }
```

Env: `BRAIN_DISTILL=1` (domyślnie on), `BRAIN_DISTILL_MODEL=qwen2.5:14b`, ten sam `BRAIN_OLLAMA_URL` co embed.

## Jak helluk zdejmuje `--read-only` (władza zapisu — NIE zrobione w tej sesji)

`--read-only` **pinuje** replikę: panel **nie** pozwoli Claim. Destylacja z zapisem wymaga **writable**.

1. Desktop: pełny sync / push na replikę.
2. Na `.201`: w `pomnia-brain-core.service` **usuń** `--read-only` (zostaw `--embed-backend ollama` + `--ollama-url`).
3. `sudo systemctl daemon-reload && sudo systemctl restart pomnia-brain-core`
4. `/admin` → Sejf → **Przejmij własność** (albo jawny owner w unicie) — **tylko po Twoim OK**.
5. Smoke na writable path (opcjonalnie osobny test vault, nie prod RO):

```bash
# Bezpieczny smoke bez claim prod:
mkdir -p /tmp/pomnia-distill-smoke/{vault/state/distill-inbox,data}
# wrzuć conversations.json do inbox albo --file
brain-core --distill --file /path/to/conversations.json \
  --data-dir /tmp/pomnia-distill-smoke/data \
  --vault-root /tmp/pomnia-distill-smoke/vault \
  --ollama-url http://127.0.0.1:11434
ls /tmp/pomnia-distill-smoke/vault/distilled/
```

**Nie** flipujemy claim/Sejf / produkcyjnego RO bez osobnej prośby Helluka.

## KVM

Compose: `BRAIN_DISTILL=0` — feature off, zakładka Destylacja niewidoczna. Distill zostaje na Desktop / Linux.

## Anti-confusion

- KVM **nie** dostaje distill „dla parytetu”.
- Linux Silnik: Ollama = embed + destylacja gdy writer + `BRAIN_DISTILL≠0`.
- Publiczne `/healthz` redaguje model distill; pełny status w `/admin/distill`.
