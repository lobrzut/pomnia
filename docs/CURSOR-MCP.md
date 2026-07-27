# Cursor ↔ Brain MCP (first-time)

Podłączenie Cursora do Brain na **nowej maszynie** (zwłaszcza Mac bez DMG Pomni).

## Co musi być w `~/.cursor/mcp.json`

**Zawsze trzy serwery** na remote Brain (`:7862` + Bearer):

| Serwer | Ścieżka |
|--------|---------|
| `brain-rag` | `/sse` |
| `brain-vault` | `/servers/brain-vault/sse` |
| `brain-library` | `/servers/brain-library/sse` |

Sam `brain-rag` = **niepełna** konfiguracja (brak vault/library).

## Mac / bez aplikacji Pomnia (teraz)

1. Otwórz generator w przeglądarce:
   - strona marketingowa (poza tym repo, Cloudflare / pomnia.ai): `https://pomnia.ai/cursor-mcp.html` (jeśli wdrożona)
2. Wklej URL Brain (`http://…:7862`) i token Bearer.
3. **Kopiuj mcp.json dla Cursora** → zapisz jako `~/.cursor/mcp.json`.
4. Cursor → `Cmd+Shift+P` → **Developer: Reload Window**.

Token: dashboard Brain na **`:7860`** (ten sam host co MCP, inny port) → Settings / API tokens.

## Windows (gdy masz instalator Pomni)

Zakładka **Connect** w aplikacji:

1. Tryb **Na serwerze** → URL `:7862`
2. Token (wklej albo **New token** z dashboardu)
3. Wybierz **Cursor** → **Kopiuj mcp.json dla Cursora**
4. Reload Window w Cursorze

Connect wykrywa też config **Partial** (tylko rag) i podpowiada brak vault/library.

## Przykład (szablon — wstaw swój URL i token)

```json
{
  "mcpServers": {
    "brain-rag": {
      "url": "http://TWOJ-HOST:7862/sse",
      "headers": { "Authorization": "Bearer btk_…" }
    },
    "brain-vault": {
      "url": "http://TWOJ-HOST:7862/servers/brain-vault/sse",
      "headers": { "Authorization": "Bearer btk_…" }
    },
    "brain-library": {
      "url": "http://TWOJ-HOST:7862/servers/brain-library/sse",
      "headers": { "Authorization": "Bearer btk_…" }
    }
  }
}
```

Nie commituj prawdziwego tokena. Na macOS: `chmod 600 ~/.cursor/mcp.json`.

## Weryfikacja

- Cursor → Settings → MCP: trzy serwery Connected
- Agent woła `get_user_profile` / `search_library`

## Embedded (tylko z aplikacją Pomnia)

Lokalny brain w Pomni = **jeden** serwer `brain-rag` na `http://127.0.0.1:7862/mcp`, bez tokena. To nie dotyczy Mac bez DMG — użyj remote + trzech serwerów powyżej.
