# Pomnia — logo & branding (Slavic green rebrand)

> **Status:** koncepcje wygenerowane 2026-07-07 · **nie** podmieniamy jeszcze `resources/icon.ico` — czekamy na wybór kierunku.

Zastępujemy obecny fioletowo-cyanowy squircle z literą „R” (wygląda jak Reliqua / generyczny AI) własnym symbolem: **pamięć, sny, wiedza przodków** — słowiańsko, leśnie, w zieleniach.

---

## Obecny branding (do wymiany)

| Element | Problem |
|---------|---------|
| Gradient violet → cyan | Skojarzenie z Reliquą, „startup AI 2024” |
| Litera „R” w squircle | Nie nawiązuje do „Pomni” (pamiętaj), zero unikalności |
| Brak motywu słowiańskiego | Nie oddaje tożsamości produktu |

Referencje UI: zrzuty w `assets/` (Command center z fioletowymi akcentami).

---

## Paleta kolorów (nowa)

| Nazwa | Hex | Użycie |
|-------|-----|--------|
| **Void** | `#0a120e` | Tło appki, tło ikony (dark mode) |
| **Forest** | `#1a5c3a` | Główny zielony, obrys symbolu |
| **Moss** | `#3d6b4f` | Wypełnienia, drugi plan |
| **Birch** | `#a8c4b0` | Highlighty, nitki, kora |
| **Amber** | `#c9a227` | Akcent „zachowanej pamięci”, światło w środku |
| **Dew** | `#7ec8a4` | Delikatny glow, kropelki rosy |

**Zakazane:** `#8b5cf6`, `#6366f1`, `#22d3ee` (stara paleta Reliqua/Pomnia).

---

## Trzy kierunki koncepcyjne (+ jeden bonus)

### 1. Moss Vault *(Skarbiec mchu)*

**Metafora:** Pamięć jako leśny skarbiec — podwójna mandorla (vesica) tworząca labirynt, w środku bursztynowe światło jak słońce uwięzione w mchu.

**Dlaczego oryginalne:**
- Vesica + labirynt to własna kompozycja, nie kopiowany kolowrat ani Futhark
- Bursztyn = „zatrzymana pamięć” (słowiański skarb), nie generyczna żarówka
- Koncentryczne pierścienie czytają się w 16×16 px (tray) lepiej niż litera

**ComfyUI prompt (txt2img):**
```
App icon logo mark, Moss Vault concept: nested vesica piscis forming a memory labyrinth vault, inner amber glow like trapped sunlight in forest moss, emerald and moss green palette, subtle Slavic woven border geometry original not Elder Futhark, flat vector UI icon, centered symbol generous padding, dark forest void background #0a120e, birch silver-green highlights, minimal geometric, no text no letters
```

**Negative / forbidden:** `text, watermark, photorealistic, 3d render, light bulb, human, face, hands, purple, cyan, letter R, kolovrat, swastika`

**Pierwsza generacja:** `assets/generated/logo-concept-moss-vault.png` — **najsilniejszy kandydat** (zielenie + bursztyn, czytelny symbol).

---

### 2. Birch Thread *(Nić brzozy)*

**Metafora:** Trzy splątane nici pamięci — haft, kora brzozy, węzły jak w snopom snów (bez dosłownego dreamcatchera).

**Dlaczego oryginalne:**
- Inspiracja haftem (haft) zamiast kopiowania kolowratu
- Abstrakcyjny węzeł, nie litera „P”
- Srebrno-zielona brzoza = charakterystyczny dla Europy Środkowej

**ComfyUI prompt:**
```
App icon logo mark, Birch Thread concept: three interwoven memory threads forming abstract knot not a letter, inspired by Slavic haft embroidery and birch bark texture, silver-green birch and deep forest green only, delicate cross-stitch geometry, thread nodes at intersections, flat vector UI icon, centered, dark void background, minimal, no text, no magenta no teal no purple
```

**Uwaga po 1. passie:** FLUX dodał magenta/teal — w kolejnej iteracji podnieść `lora_strength` flat-ui, dodać `forbid=magenta,teal,purple,cyan` w composition_lock lub refine z seedem 42012.

**Pierwsza generacja:** `assets/generated/logo-concept-birch-thread.png` — wymaga iteracji (złe kolory).

---

### 3. Dew Sigil *(Sygnil rosy)*

**Metafora:** Poranna rosa na geometrycznej kratce — oryginalna runiczna geometria (nie Elder Futhark), brama pamięci w centrum.

**Dlaczego oryginalne:**
- Własna siatka kątów + kropelki, nie alfabet runiczny
- Rosa = świeża pamięć, przebudzenie
- Vesica jako „brama snu”

**ComfyUI prompt:**
```
App icon logo mark, Dew Sigil concept: single centered sigil symbol only, original angular lattice geometry not Elder Futhark, three dew droplets, vesica memory gate at center, emerald green glow with amber dew highlights, flat vector UI icon, square format, dark forest background, crisp edges, no text no rune alphabet, no landscape no trees no scene
```

**Uwaga po 1. passie:** model wygenerował pejzaż zamiast ikony — w kolejnej iteracji: `asset_type=icon`, `composition_lock=forbid=landscape,scene,trees`, krótszy prompt skupiony na jednym symbole.

**Pierwsza generacja:** `assets/generated/logo-concept-dew-sigil.png` — wymaga iteracji (za dużo sceny).

---

### Bonus: Amber Loom *(Bursztynowy krosno)*

**Metafora:** Koło pamięci — przodkowie tkaą wątki wiedzy; bursztyt w centrum jak skamieniała wspomnienie.

**ComfyUI prompt:**
```
App icon logo mark, Amber Loom concept: circular memory loom weaving threads, amber resin glow at center, moss green and emerald outer ring, loom spokes not kolovrat not sun wheel, flat vector UI icon, centered, dark void background, minimal geometric, no text, no light bulb no lamp
```

**Uwaga:** pierwsza generacja wpadła w żarówkę (zakazana metafora) — dodać `forbid=lightbulb,lamp,bulb` i refine.

**Pierwsza generacja:** `assets/generated/logo-concept-amber-loom.png` — wymaga iteracji.

---

## ComfyUI — jak generować

### Status serwera (2026-07-07)

| Endpoint | Status |
|----------|--------|
| `http://127.0.0.1:8188` | **offline** (brak lokalnej instancji) |
| `http://brain.example.local:7821` (ISKRA) | **online** — ComfyUI 0.14.1, RTX 3060, FLUX |
| MCP `comfyui` w Cursor | skonfigurowany, `COMFYUI_URL` → ISKRA |

### Ważne: `COMFY_WORKSPACE`

W `~/.cursor/mcp.json` jest `COMFY_WORKSPACE=//fileserver.example.local/Projekty` — MCP zapisuje tam PNG, **nie** do repo Pomnia. Dla generacji do tego repo:

```powershell
$env:COMFYUI_URL = "http://brain.example.local:7821"
$env:COMFY_WORKSPACE = "C:\Users\Alice\Projects\pomnia"
python scripts/gen-logo-concepts.py
```

Albo zmień `COMFY_WORKSPACE` w `mcp.json` na ścieżkę do `pomnia` i przeładuj MCP.

### Uruchomienie ComfyUI (gdy offline)

**ISKRA (zalecane):** już działa na `:7821` — nic nie trzeba.

**Lokalnie (Windows):**
```powershell
cd C:\path\to\ComfyUI
python main.py --listen 127.0.0.1 --port 8188
```
Potem w `mcp.json`: `"COMFYUI_URL": "http://127.0.0.1:8188"`.

### MCP — jedna koncepcja

```
generate_image_smart
  prompt: <prompt z tabeli powyżej>
  style: icon
  size: 512x512
  workflow: flux
  lora: flat-ui
  lora_strength: 0.55
  background: dark_navy
  project_style: false
  quality_tier: final
  seed: 42001
  filename: assets/generated/logo-concept-moss-vault-v2.png
```

(Upewnij się, że `COMFY_WORKSPACE` wskazuje na repo Pomnia.)

### Workflow JSON

Patrz: [`assets/comfyui/logo-concept.json`](../assets/comfyui/logo-concept.json)

---

## Po wyborze kierunku

1. Użytkownik wybiera koncept (np. **Moss Vault**)
2. 2–3 iteracje ComfyUI (refine, inne seedy) aż symbol jest czysty
3. Eksport wektorowy (Figma / Inkscape) lub ręczna wektoryzacja
4. `resources/icon.png` + `node scripts/gen-icon.mjs` → `resources/icon.ico`
5. Aktualizacja `.cursor/comfy-project.json` (paleta zielona)
6. Landing + UI: zamiana akcentów violet/cyan na forest/moss/amber

**Nie rób kroku 4 bez explicit „wybieram X” od użytkownika.**

---

## Pliki

| Plik | Opis |
|------|------|
| `assets/generated/logo-concept-*.png` | Pierwsze generacje (4 kierunki) |
| `assets/comfyui/logo-concept.json` | Referencja workflow + prompty |
| `scripts/gen-logo-concepts.py` | Batch generator (ISKRA, poprawny workspace) |
| `docs/COMFYUI-ASSETS.md` | Pełny pipeline assetów |
