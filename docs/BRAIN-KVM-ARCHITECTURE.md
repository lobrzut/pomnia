# Pomnia × Brain — KVM architecture (client / server split)

## Who does what

| Layer | Where | Ollama / RAM | Job |
|---------|-------|--------------|---------|
| **Pomnia Vault** | NAS / local disk (`*.pomnia`) | — | Encrypted snapshots of raw chats |
| **Distill** | client PC (GPU) | `qwen2.5:14b` (~9 GB) | Chat → markdown note (JSON mode) |
| **Staging** | `%AppData%/pomnia/brain-notes` | — | Notes + optional local index |
| **Brain KVM** | homelab / small VM | `nomic-embed-text` (~274 MB) | Embed + `library.db` + MCP `:7862` |

## Flow (Remote master)

```
client PC                          KVM Brain (192.168.x.x)
────────────                       ───────────────────────────
backup → Vault (NAS)
distill (qwen, Ollama over LAN)
  ↓
brain-notes/*.md  ──auto-deploy──►  vault/distilled/
  (staging)          SMB or          ↓
                     save-note API   library/reindex (nomic)
                                    ↓
Cursor / Claude ──MCP :7862──────► search_library
```

## Pomnia — auto-deploy (since 2026-07-06)

With **Connect → Remote master** and **Brain → Auto-deploy after distill**:

1. After distill and the optional local pre-index
2. Copy the `.md` to `brainDeployTarget` (SMB, e.g. `\\192.168.x.x\brain\vault\distilled`) **or** HTTP `POST /api/vault/save-note`
3. `POST /api/library/reindex` against the dashboard on `:7860`

Settings live in `localStorage`: `pomnia.brain.autoDeploy`, `pomnia.brain.deployUrl`, `pomnia.brain.deployTarget`.

## What the KVM needs

- Ollama with **only** `nomic-embed-text` is enough for search — distill does not have to run on the VM
- Brain dashboard `:7860`, MCP proxy `:7862`
- Optional: a shared `distilled` folder (SMB/NFS) — the most reliable deploy, and it needs no new API

## Brain-side TODO

- `POST /api/vault/save-note` — accept a finished markdown note (fallback when there is no SMB)
- `POST /api/library/merge-index` — precomputed vectors from the host, so the VM never re-embeds
