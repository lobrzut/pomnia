# Reliqua × Brain — architektura KVM (split client / server)

## Podział ról

| Warstwa | Gdzie | Ollama / RAM | Co robi |
|---------|-------|--------------|---------|
| **Reliqua Vault** | NAS / lokalny dysk (`*.reliqua`) | — | Zaszyfrowane snapshoty surowych czatów |
| **Distill** | PC klienta (GPU) | `qwen2.5:14b` (~9 GB) | Czat → notatka markdown (JSON-mode) |
| **Staging** | `%AppData%/reliqua/brain-notes` | — | Notatki + lokalny indeks (opcjonalny) |
| **Brain KVM** | homelab / mały VM | `nomic-embed-text` (~274 MB) | Embed + `library.db` + MCP `:7862` |

## Przepływ (Remote master)

```
PC klienta                         KVM Brain (brain.example.local)
────────────                       ───────────────────────────
backup → Vault (NAS)
distill (qwen, Ollama LAN)
  ↓
brain-notes/*.md  ──auto-deploy──►  vault/distilled/
  (staging)          SMB lub         ↓
                     save-note API   library/reindex (nomic)
                                    ↓
Cursor / Claude ──MCP :7862──────► search_library
```

## Reliqua — auto-deploy (od 2026-07-06)

Gdy **Connect → Remote master** i **Brain → Auto-deploy after distill**:

1. Po distill + lokalnym pre-index (opcjonalnie)
2. Kopia `.md` do `brainDeployTarget` (SMB, np. `\\brain.example.local\brain\vault\distilled`) **lub** HTTP `POST /api/vault/save-note`
3. `POST /api/library/reindex` na dashboard `:7860`

Ustawienia w `localStorage`: `reliqua.brain.autoDeploy`, `reliqua.brain.deployUrl`, `reliqua.brain.deployTarget`.

## Wymagania KVM

- Ollama z **samym** `nomic-embed-text` wystarczy do search (distill nie musi być na VM)
- Brain dashboard `:7860`, MCP proxy `:7862`
- Opcjonalnie: udostępniony folder `distilled` (SMB/NFS) — najpewniejszy deploy bez nowego API

## Brain-side TODO

- `POST /api/vault/save-note` — przyjęcie gotowej notatki md (fallback gdy brak SMB)
- `POST /api/library/merge-index` — precomputed wektory z hosta (zero re-embed na VM)
