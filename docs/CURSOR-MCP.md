# Cursor ↔ Brain MCP (first-time)

Connecting Cursor to Brain on a **new machine** — especially a Mac without the Pomnia DMG.

## What has to be in `~/.cursor/mcp.json`

**Always three servers** against a remote Brain (`:7862` + Bearer):

| MCP key (client) | HTTP path on the server |
|--------------------|--------------------------|
| `pomnia` | `/sse` |
| `pomnia-vault` | `/servers/brain-vault/sse` |
| `pomnia-library` | `/servers/brain-library/sse` |

`pomnia` on its own is an **incomplete** configuration — no vault, no library. Status in the app still accepts the legacy keys `brain-rag` / `brain-vault` / `brain-library`.

The URL paths `/servers/brain-vault|library` are **paths on the Brain proxy** — do not change them. Only the key name in `mcp.json` changes.

## Mac / no Pomnia app (for now)

1. Open the generator in a browser:
   - marketing site (outside this repo, Cloudflare / pomnia.ai): `https://pomnia.ai/cursor-mcp.html` (if deployed)
2. Paste the Brain URL (`http://…:7862`) and the Bearer token.
3. **Copy mcp.json for Cursor** → save it as `~/.cursor/mcp.json`.
4. Cursor → `Cmd+Shift+P` → **Developer: Reload Window**.

Token: the Brain dashboard on **`:7860`** (same host as MCP, different port) → Settings / API tokens.

## Windows (when you have the Pomnia installer)

The **Connect** tab in the app:

1. Mode **On your server** → URL `:7862`
2. Token (paste one, or **New token** from the dashboard)
3. Pick **Cursor** → **Copy mcp.json for Cursor**
4. Reload Window in Cursor

Connect also detects a **Partial** config (rag only) and tells you vault/library are missing.

## Example (template — put in your own URL and token)

```json
{
  "mcpServers": {
    "pomnia": {
      "url": "http://YOUR-HOST:7862/sse",
      "headers": { "Authorization": "Bearer btk_…" }
    },
    "pomnia-vault": {
      "url": "http://YOUR-HOST:7862/servers/brain-vault/sse",
      "headers": { "Authorization": "Bearer btk_…" }
    },
    "pomnia-library": {
      "url": "http://YOUR-HOST:7862/servers/brain-library/sse",
      "headers": { "Authorization": "Bearer btk_…" }
    }
  }
}
```

Do not commit a real token. On macOS: `chmod 600 ~/.cursor/mcp.json`.

## Verifying

- Cursor → Settings → MCP: three servers Connected
- The agent calls `get_user_profile` / `search_library`

## Embedded (with the Pomnia app only)

The local brain inside Pomnia is **one** `pomnia` server at `http://127.0.0.1:7862/mcp`, no token. That does not apply to a Mac without the DMG — use remote plus the three servers above.
