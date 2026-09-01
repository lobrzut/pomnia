# Connecting an agent to Pomnia over MCP

One server, one endpoint. If you are working from an older copy of this page
that told you to configure three servers against `/sse` and
`/servers/brain-vault/sse`, that was the Python hub, which is gone. Those paths
no longer answer, and a config built from them fails at the next client restart
with an error that names none of this.

## The endpoint

| | |
|---|---|
| Embedded brain (inside Pomnia Desktop) | `http://127.0.0.1:7862/mcp`, no token |
| Remote brain-core | `http://<host>:7865/mcp` + `Authorization: Bearer btk_…` |

The MCP client key is **`pomnia`**.

### The one mistake worth naming

The admin panel is served from the **same port** at `/admin`, so that is the URL
in your browser's address bar when you go looking for a token — and pasting it
into the URL field produces `…/admin/mcp`, which is a real route, gated on an
admin role, answering `403`. Pomnia strips `/admin`, `/mcp` and `/status` from
whatever you paste, and probes the endpoint before writing any config. If you
are writing the file by hand, strip it yourself.

## Let the app write it

**Connect** tab → mode **On your server** → URL and token → pick your client →
**Copy**. It writes the block into up to six client configs at once, and checks
the endpoint answers first. When the probe fails, yesterday's working config is
left alone rather than replaced with a broken one.

## Writing it by hand

Cursor reads `~/.cursor/mcp.json`. The whole file is this object:

```json
{
  "mcpServers": {
    "pomnia": {
      "url": "http://YOUR-HOST:7865/mcp",
      "headers": { "Authorization": "Bearer btk_…" }
    }
  }
}
```

VS Code (`%APPDATA%\Code\User\mcp.json`, or `~/.config/Code/User/mcp.json`) uses
`servers` instead of `mcpServers`, and each entry needs `"type": "http"`.

### Claude Desktop on Windows

Claude Desktop speaks stdio, so it reaches an HTTP endpoint through
`mcp-remote`. Two details are not optional on Windows, and both fail with an
error that names something else entirely:

```json
{
  "mcpServers": {
    "pomnia": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mcp-remote", "http://YOUR-HOST:7865/mcp",
               "--allow-http", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer btk_…" }
    }
  }
}
```

- `command: "npx"` resolves through `where` to `C:\Program Files\nodejs\npx`,
  which `cmd.exe` then splits on the space: `'C:\Program' is not recognized`.
  Going through `cmd /c` avoids handing it an unquoted path.
- `--header "Authorization: Bearer <token>"` is split by `cmd.exe` on **its**
  space, so the server receives an empty Authorization header, answers `401`,
  and `mcp-remote` falls into OAuth registration and dies with
  `Invalid OAuth error response … [object Response]`. The `${AUTH_HEADER}` form
  has no space in it.
- `--allow-http` is required for a plain-HTTP endpoint on your own network.

## Tokens

Mint one in the admin panel (`http://<host>:7865/admin` → Tokens) or from the
**Connect** tab. Agents need the `agent` role; an admin token is for
administration and is not what a client should carry.

Do not commit a real token. On macOS and Linux: `chmod 600 ~/.cursor/mcp.json`.

## Verifying

- The client lists **one** `pomnia` server, connected.
- The agent can call `get_user_profile` and `search_library`.
- `curl -s http://<host>:7865/healthz` reports `"status":"ok"`.

A `403` from `/mcp` means the URL still has `/admin` in it. A `401` means the
token is missing, empty or revoked — on Windows an empty Authorization header is
the usual cause; see above.
