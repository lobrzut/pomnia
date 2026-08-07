# Pomnia — security and trust

Public trust summary for users and auditors (premiere v1). Product source (including vault/crypto) is published under **AGPL-3.0-only**. This file is not a cryptographic specification or attack guide; it states guarantees and honesty boundaries.

---

## 1. Vault as the protected core

The vault has direct access to user data collected by Pomnia — conversations, config snapshots, import metadata. It is the **most protected product layer** for runtime isolation and key handling.

- Vault/crypto lives in public AGPL code (`src/core/vault.ts`, etc.) — open source does not mean open access to user data.
- The vault is a local, portable safe: **conversation/document blobs** on disk stay encrypted; the passphrase does not leave the user's machine. Trust rests on cryptography and IPC isolation, not on hiding the code.

**Honesty boundary:** vault folder sidecars used as a knowledge surface (`skills/`, `USER.md`, `sessions/`, distilled notes) and Brain's on-disk index (`library.db` under `%AppData%/Pomnia/brain-core-data/`) are **plaintext on disk**. Protect the folder. See [docs/START-HERE.md](docs/START-HERE.md).

---

## 2. Technical guarantees (high level)

Summary of system behaviour — **without** key-file paths or internal vault binary layout.

| Area | Guarantee |
|------|-----------|
| **Passphrase** | Never written to disk. Lost passphrase = vault unrecoverable. |
| **Encryption** | AES-256-GCM (authenticated). Key derived with scrypt (N=2^17 — matches Settings UI). Applies to vault **blobs**. |
| **Lock** | On lock, the key is cleared from main-process memory; encrypted blobs stay encrypted on disk. |
| **UI isolation** | The renderer (React) has **no** direct vault filesystem access. All operations go through IPC to the main process. |
| **Import** | Gated entry — format validation and normalization before write. No raw dump of arbitrary files into the vault. |
| **Export** | No silent exfiltration. Data leaves the vault only on **explicit user action**: backup, Brain export, deploy pipeline. |

---

## 3. Publication model at premiere (v1)

| Category | What ships |
|----------|------------|
| **PUBLIC (AGPL)** | Pomnia client source (UI, adapters, vault/crypto, embedded `packages/brain-core`, import pipeline), installers (exe/dmg), MCP docs. |
| **SEPARATE** | Marketing site [pomnia.ai](https://pomnia.ai) (deployed outside this tree) and optional Homelab Brain Hub (user's own RAG server) — **not** required in the client repo. |
| **NOT PUBLIC** | Users' private vaults, keys, production data, local build artifacts (`out/`, `dist/`, sandboxes). |

The client bundles **embedded Brain** (`brain-core` / MCP `:7862`) in Desktop. A separate Homelab Brain Hub (Python / remote) stays optional — Pomnia sends data there only on explicit export/deploy.

**Ship posture (Windows):** installers may be **unsigned** at premiere. SmartScreen / AV warnings on a new hash are expected reputation noise — not a reason to disable antivirus. Authenticode is the long-term fix ([docs/CODE-SIGNING.md](docs/CODE-SIGNING.md)).

---

## 4. Trust pitch

**EN:** Conversation and document **blobs** live in a local encrypted vault — the key stays in your head, and the app never moves them anywhere without your explicit choice. Knowledge sidecars and the Brain search index on disk are plaintext; protect those folders.

**PL:** Bloby rozmów i dokumentów leżą w lokalnym, zaszyfrowanym sejfie — klucz tylko w Twojej głowie, a aplikacja nie wysyła ich nigdzie bez Twojej wyraźnej decyzji. Sidecary wiedzy i indeks Brain na dysku są plaintext — chroń te foldery.

---

## 5. Layers — access and posture

| Layer | Access to user data | Protective posture |
|-------|---------------------|--------------------|
| **Vault** | Full — read/write of the archive after unlock | Highest isolation; no direct renderer access; key only in main-process RAM; AGPL-auditable code |
| **Adapters** | Read external sources (Claude Code, Cursor, profiles, etc.) before vault write | Read-only from known OS locations; normalize to a common model; no write outside vault |
| **Import** | User export files (ZIP/JSON/MD) | Gated entry; validate and parse; no arbitrary write; same model as backup |
| **Brain-MCP** | Export of selected conversations / notes on demand | One-way, explicit export; optional deploy to a separate Brain server; **no telemetry by default** |

---

## Scope

This file does not replace an organisational security policy or an audit report. Updates to the publication model or technical guarantees should be reflected here before each major production cut.

*Last updated: 2026-08-07 — public EN trust doc + plaintext sidecar honesty (aligned with START-HERE / landing privacy).*
