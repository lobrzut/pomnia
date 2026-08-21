# Brain Server — bundled embed model (~250–500 MB)

> Technical plan (2026-07-13). **This does not implement the full image** — only the contract, the options and the order.
> Related: `docs/BRAIN-KVM-ARCHITECTURE.md`, `docs/BRAIN-INTEGRATION.md` (internal/historical), hub `Projects/brain` (Docker edge).

## Where things stand (research)

| Layer | Embedding today | Model | Needs Ollama? |
|---------|------------|-------|----------------|
| **brain-core** (`packages/brain-core`, Node) | `BRAIN_EMBED_BACKEND=fastembed` **or** `ollama` | `nomic-ai/nomic-embed-text-v1.5` / Ollama `nomic-embed-text` → **dim 768** | KVM/Docker: **no**; desktop default: Ollama |
| **Pomnia desktop, embedded** | forked child → the same `EmbedClient` (default ollama) | as above | **Yes** for MVP search/index — URL from Settings / `127.0.0.1:11434` |
| **Pomnia distill** | `qwen2.5:14b` (chat) | ~9 GB | Yes, on the **client PC** (GPU) |
| **Brain hub, Python** (`Projects/brain`) | `BRAIN_EMBED_BACKEND=fastembed` **or** `ollama` | `nomic-ai/nomic-embed-text-v1.5` / Ollama `nomic-embed-text` | Docker edge: **no**; live homelab KVM: Ollama with many models |
| **Docker edge** (`brain/docker-compose.yml` + `Dockerfile`) | fastembed ONNX, model **prefetched at build** | v1.5 | **No** — "no Ollama, no GPU" |

The key point: vectors from Ollama `nomic-embed-text` and Python fastembed v1.5 are **directionally compatible** (dim 768) — an existing `library.db` can be queried after a backend swap without a reindex (verified in Phase 0; see the comments in `embed.ts` and `rag.py`).

---

## A. What exactly to bundle

### Bundle

- **Model:** `nomic-embed-text` / `nomic-ai/nomic-embed-text-v1.5` (137M, Apache 2.0).
- **Size:** roughly **274 MB** (Ollama F16), or the fastembed ONNX cache (~**0.5 GB** on first load / in the Docker layer — the Dockerfile already prefetches it).
- **Job:** embeddings only, for `search_library` / reindex / document index. **That alone is enough for the server to "just work" after boot.**

### Do not bundle

- **`qwen2.5:14b` (~9 GB) or any other chat/LLM** — distillation stays on the client PC with its GPU. A Brain server is memory to ask questions of, not a note factory.
- The full 32-model catalogue from the live homelab KVM — that is a homelab power user, not the "Brain Server" product.

### Footprint (expectations)

| | Disk (image/layer) | Runtime RAM (CPU embed) |
|--|----------------------|-------------------------|
| nomic only (Ollama sidecar) | ~274 MB + the Ollama runtime | ~0.5–1 GB with the model warm |
| fastembed ONNX (Docker edge) | ~0.5 GB in the image layer | ~0.5–1 GB after lazy load |
| + qwen 14b (NO) | +~9 GB | +~10–16 GB VRAM/RAM |

A small KVM (2–4 GB RAM, no GPU) → **embedding only**. Distillation optional, or offboard.

---

## B. Options compared, and the recommendation

| # | Option | Pros | Cons | Homelab KVM | Brain Server product |
|---|-------|------|------|-------------|----------------------|
| **1** | Ollama sidecar in compose, pre-pulling `nomic-embed-text` | Same contract as the desktop (`/api/embed`); swapping the model is a tag change | Heavier image (Ollama + model); another process; the GPU is unnecessary but invites "let's add an LLM" | Fine as a bridge to the live homelab | Fine, but redundant |
| **2** | **ONNX / fastembed for embedding only** (no Ollama) | Already done in Node brain-core KVM image + Python hub Docker; `docker up` → search; small RAM; no manual `ollama pull` | First cold load ~0.5 GB; prefixes must stay exact | Ideal for a light VM / QNAP | **Best** |
| **3** | Bake the model into the brain-core binary/data | One Electron/daemon package | Enormous Electron updates; bumping the model gets harder; mixes the app with the server | Weak | Weak |

### Recommendation

1. **Brain Server / KVM image (product + light homelab):** **option 2** — keep and harden the existing edge path in `Projects/brain` (`BRAIN_EMBED_BACKEND=fastembed`, model in the Docker layer). Acceptance criterion: `docker compose … up` → `search_library` works **without** a manual `ollama pull`.
2. **Live homelab KVM:** keep Ollama on the GPU for distillation and experiments; search can go through fastembed **or** Ollama — but do not mix backends inside one `library.db` without deciding to. Both nomic 768 variants are fine; pick one backend per deployment.
3. **brain-core, Node (shipped for KVM):** `BRAIN_EMBED_BACKEND=fastembed` (alias `EMBED_PROVIDER=local` / `onnx`) via `@huggingface/transformers` + `nomic-ai/nomic-embed-text-v1.5`. Desktop default remains `ollama`. Do not bake a model into Electron.

---

## C. Product contract and UI naming

| Role | What it means to a user |
|------|---------------------|
| **Brain server** | Memory to ask questions of (MCP `search_library`, vault notes, index) |
| **Pomnia app** | Collection (backup/import) + the `.pomnia` vault + distillation on the local GPU |

### Settings labels / navigation (direction)

| Term | Meaning |
|--------|-----------|
| **Archive** | The `.pomnia` vault — encrypted snapshots, not a search engine |
| **Memory** | The index / Brain — what the agent queries |
| **Connect Cursor** | Connect MCP (`:7862`) |

### "Works on its own" after boot, minimally

- ✅ `search_library` and MCP health without installing models by hand
- ✅ Reindex of notes already in the vault
- ❌ An LLM for distillation is **not** required on the server (optional, and usually on the desktop)

---

## D. Rollout order

### Milestone 0 — desktop first (agreed)

- Embedded brain-core plus the **user's Ollama** with `nomic-embed-text` (pull from the UI when missing).
- Distillation is a local `qwen2.5:14b` (or another chat model), outside the scope of the server bundle.
- UI: a clear split between "Ollama + nomic" health and "search works".

### Milestone 1 — KVM / Brain Server image with a bundled embedder

- Build on `brain/Dockerfile` plus the edge compose (fastembed prefetch).
- Smoke: `docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build` → Bearer token → MCP search against a sample note.
- **Acceptance:** a fresh host **without** Ollama gets working search in under N minutes after `up`.

### Milestone 2 — brain-core (Node) ONNX — **done (TOR C)**

- `BRAIN_EMBED_BACKEND=fastembed|ollama` in `@pomnia/brain-core`.
- KVM `install.sh` / unit / Dockerfile default to fastembed; prefetch ~0.5 GB
  nomic ONNX; no chat model; no mandatory `ollama pull`.
- `/healthz` reports `embed.backend` + `embed.ready` (and keeps `checks.ollama`
  as the embedder readiness alias for older probes).

### Milestone 3 — "works on its own" in the copy

- Landing page and START-HERE: the server is memory; the app is archive plus collection.
- Remove any impression that a KVM needs 32 models.

---

## E. Risks

| Risk | Mitigation |
|--------|-----------|
| **GPU vs CPU embedding** | The product is CPU ONNX; GPU Ollama only when the user already runs that stack |
| **Model updates** | Pin the tag (`v1.5`); a bump means a new image layer and an optional reindex; never mix dimensions |
| **Licence** | Nomic Embed is **Apache 2.0** — fine commercially; cite it in the image's NOTICE |
| **Dual path on desktop** | Embedded still uses **the user's Ollama** — do not promise "zero Ollama" in Electron until Node has ONNX |
| **nomic is English-centric** | Hybrid search / Polish queries — already noted in `brain-core` search; do not confuse it with "the model is missing" |
| **query vs document prefix** | Ollama's template vs the explicit prefix in fastembed — do not break this when porting to Node |

---

## Decision, in short

- **Bundle:** nomic-embed only (~274 MB Ollama / ~0.5 GB ONNX), not qwen.
- **Server path:** fastembed inside the Docker image (already in the hub) = "works on its own".
- **Desktop:** still the user's Ollama for the MVP; the server is a separate story.
- **Next concrete implementation step:** a smoke test plus acceptance documentation for Milestone 1 on the edge image — with no Electron rebuild.
