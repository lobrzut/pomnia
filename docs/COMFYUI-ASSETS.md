# ComfyUI — pipeline grafik Pomnia

Generowanie unikalnych assetów (ikona, hero, tray, OG) przez **ComfyUI MCP** w Cursorze. ComfyUI działa na homelabie **ISKRA**; Brain MCP pozostaje osobno.

---

## Architektura

```
Cursor Agent
    → MCP stdio (comfyui)          ~/.cursor/mcp.json
    → comfyui-cursor-mcp/server.py  C:/Users/Alice/Projects/comfyui-cursor-mcp
    → ComfyUI HTTP API              http://brain.example.local:7821  (ISKRA)
    → PNG w assets/generated/       COMFY_WORKSPACE = ten repo
```

| Serwis | URL | Rola |
|--------|-----|------|
| **ComfyUI ISKRA** | `http://brain.example.local:7821` | GPU, FLUX/SDXL, LoRA |
| **Brain MCP** | `http://brain.example.local:7862/mcp` | RAG, vault — **nie ruszamy** |
| **Comfy lokalnie** | `http://127.0.0.1:8188` | Opcjonalnie — zmień `COMFYUI_URL` |

---

## Status (2026-07-07)

| Check | Wynik |
|-------|-------|
| ComfyUI `127.0.0.1:8188` | offline (brak lokalnej instancji) |
| ComfyUI ISKRA `:7821` | **online** (ComfyUI 0.14.1, Linux) |
| Brain MCP `:7862` | skonfigurowany w `mcp.json` |
| MCP `comfyui` | dodany do `~/.cursor/mcp.json` |

---

## Konfiguracja MCP (już zrobione)

Plik: `%USERPROFILE%\.cursor\mcp.json`

```json
{
  "mcpServers": {
    "brain-rag": {
      "url": "http://brain.example.local:7862/mcp",
      "headers": { "Authorization": "Bearer …" }
    },
    "comfyui": {
      "command": "C:\\Users\\Admin\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
      "args": ["C:/Users/Alice/Projects/comfyui-cursor-mcp/server.py"],
      "env": {
        "COMFYUI_URL": "http://brain.example.local:7821",
        "COMFY_WORKSPACE": "C:/Users/Alice/Projects/pomnia"
      }
    }
  }
}
```

### Reinstalacja / zmiana workspace

```powershell
git clone https://github.com/lobrzut/comfyui-cursor-mcp.git C:\Users\Alice\Projects\comfyui-cursor-mcp
$env:COMFYUI_URL = "http://brain.example.local:7821"
$env:COMFY_WORKSPACE = "C:\Users\Alice\Projects\pomnia"
cd C:\Users\Alice\Projects\comfyui-cursor-mcp
.\apply.ps1
```

Potem w Cursor: **Settings → MCP → Reload** (wyłącz/włącz `comfyui`).

### Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---------|-----------|------|
| `COMFYUI_URL` | `http://127.0.0.1:7821` | Base URL ComfyUI API |
| `COMFY_WORKSPACE` | cwd | Root projektu — tu lądują PNG |
| `COMFYUI_WORKFLOW` | `auto` | `flux`, `sdxl`, `qwen`, `zimage` |
| `COMFYUI_WORKFLOW_MAP` | preset map | np. `{"icon":"flux","photo":"qwen"}` |

---

## Uruchomienie ComfyUI

### ISKRA (zalecane — już działa)

ComfyUI na serwerze homelab. Sprawdzenie:

```powershell
Invoke-WebRequest http://brain.example.local:7821/system_stats -UseBasicParsing
```

Jeśli offline — uruchom usługę na ISKRA (Docker/systemd — zależnie od Twojego deployu). W Brain vault jest kontekst sesji `MCP_comfyui` (port 7821, FLUX LoRA).

### Lokalnie na Windows (opcjonalnie)

1. Sklonuj [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
2. Zainstaluj zależności + modele FLUX (patrz `comfyui-cursor-mcp/README.md`)
3. Uruchom: `python main.py --listen 127.0.0.1 --port 8188`
4. W `mcp.json` ustaw `"COMFYUI_URL": "http://127.0.0.1:8188"`

---

## Narzędzia MCP (comfyui)

| Tool | Użycie |
|------|--------|
| `comfy_status` | Health check GPU + liczba LoRA |
| `generate_image_smart` | Naturalny opis → PNG (najczęściej) |
| `generate_image_intelligent` | Multi-pass draft→master |
| `plan_image_generation` | Plan bez GPU |
| `list_workflows` | flux, sdxl, zimage, qwen, flux2 |
| `list_loras` / `suggest_lora` | Curated manifest FLUX |
| `preview_comfy_prompt` | Podgląd positive/negative |
| `evaluate_generation` | Checklist po generacji |

Repo MCP: [lobrzut/comfyui-cursor-mcp](https://github.com/lobrzut/comfyui-cursor-mcp)

Alternatywa (npm, bez Twoich LoRA): `npx -y comfyui-mcp@latest` — [artokun/comfyui-mcp](https://github.com/artokun/comfyui-mcp)

---

## Assety Pomnia — co generować

Brand (Slavic green): void `#0a0a0f`, forest emerald `#1B4332`, moss `#40916C`, birch `#D8F3DC`, amber accent `#D4A574` (opcjonalnie).  
Konfig projektu: `.cursor/comfy-project.json` · koncepcje logo: `docs/BRAND-LOGO.md`

### 1. App icon (512×512)

- **Docelowy plik:** `resources/icon.png`, `resources/icon.ico`
- **Electron:** `electron-builder.yml` → `win.icon: resources/icon.ico`
- **Obecnie:** placeholder z `scripts/gen-icon.mjs` (fioletowa litera „R” — **do wymiany** na Slavic green)
- **MCP przykład:**

  ```
  generate_image_smart style=icon size=512x512 workflow=flux lora=flat-ui
  prompt: abstract Slavic memory vault sigil, flat vector, forest emerald and moss green on dark void, birch silver-green highlights, optional amber glow, woven thread motif, minimal, no text, no letter
  ```

- Po akceptacji: zapisz do `resources/icon.png`, uruchom `node scripts/gen-icon.mjs` dla `.ico`

### 2. Tray icon (256×256)

- Ten sam `resources/icon.ico` (Windows tray: `src/main/tray.ts`)
- Generuj 512×512, skaluj w dół przy konwersji ICO

### 3. Landing hero (1920×1080)

- **Docelowy plik:** `landing/assets/hero.png` (do dodania w HTML)
- **Landing:** `landing/index.html` — sekcja `.hero` (obecnie CSS aurora, bez obrazu)
- **MCP:** `style=banner size=1920x1080 workflow=flux lora=none background=dark_navy`
- Prompt: forest mist, encrypted vault metaphor, woven memory threads, Slavic green palette, wide cinematic, no text

### 4. OG image pomnia.ai (1200×630)

- **Docelowy plik:** `landing/assets/og.png`
- **HTML:** dodać `<meta property="og:image" content="…">` w `landing/index.html`
- **MCP:** `size=1200x630 workflow=flux lora=none`

### 5. Favicon

- **Docelowy:** `landing/favicon.ico` lub PNG 32×32 z ikony app

---

## Workflow JSON w repo

| Plik | Opis |
|------|------|
| `assets/comfyui/pomnia-flux-icon.json` | Brief + placeholder API export |
| `assets/comfyui/README.md` | Jak eksportować z ComfyUI |

MCP domyślnie używa **wbudowanego** workflow FLUX w Pythonie — JSON opcjonalny.

---

## Workflow w Cursorze (krok po kroku)

1. Upewnij się, że ISKRA ComfyUI odpowiada (`comfy_status`)
2. W czacie: *„Wygeneruj ikonę Pomnia według BRAND-LOGO.md — wybierz koncepcję, flat vector, paleta Slavic green”*
3. Agent woła `generate_image_smart` → PNG w `assets/generated/`
4. Otwórz PNG, oceń (`evaluate_generation`)
5. Po akceptacji — skopiuj do `resources/` lub `landing/assets/`
6. **Nie commituj** dużych PNG bez review — `assets/generated/` jest w `.gitignore`

---

## Pliki do podmiany (checklist)

| Po generacji | Commit? |
|--------------|---------|
| `resources/icon.png`, `resources/icon.ico` | tak (małe) |
| `landing/assets/hero.png`, `og.png` | tak po optymalizacji |
| `assets/generated/*.png` | **nie** (gitignore) |

---

## Troubleshooting

| Problem | Rozwiązanie |
|---------|-------------|
| MCP `comfyui` czerwony | Reload MCP; sprawdź Python 3.12 + `pip install -r requirements.txt` w comfyui-cursor-mcp |
| ComfyUI timeout | Kolejka zajęta na ISKRA — poczekaj lub sprawdź `http://brain.example.local:7821/queue` |
| Brak LoRA `flat-ui` | Skopiuj na ISKRA: `models/loras/cursor-approved/` — patrz `comfyui-cursor-mcp/loras/README.md` |
| Brain MCP padł | Nie dotykaj wpisu `brain-rag` w mcp.json — osobny serwis |

---

## Następny krok

**Pierwszy asset: ikona app 512×512** — największy wpływ (installer, tray, branding).  
Po reload MCP w Cursorze napisz: *„Wygeneruj ikonę Pomnia według comfy-project.json”*.
