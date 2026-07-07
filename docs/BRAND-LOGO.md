# Pomnia — logo & branding (Slavic green rebrand)

> **Status:** koncepcje wygenerowane 2026-07-07 · refinements flat 2026-07-07 · **depth pass (anti-flat)** 2026-07-07 · **finaliści depth** 2026-07-07 · **nie** podmieniamy jeszcze `resources/icon.ico` — czekamy na wybór **jednego** finału.

## Finaliści (feedback użytkownika 2026-07-07, wieczór)

| Plik | Kierunek | Feedback |
|------|----------|----------|
| **`logo-depth-moss-vault-v2.png`** | Moss Vault depth | **„Fajne”** — ulubiony z depth batch |
| **`logo-depth-dew-sigil-v1.png`** | Dew Sigil depth | **„Fajne, ciekawe”** — ulubiony z depth batch |

**Preferencja użytkownika:** wersje **depth** (anti-flat) zamiast flat hybrid / Lory. Oba kierunki nadal w grze — decyzja: jeden finał **albo** hybrid depth.

**Final refinements (2026-07-07):** `logo-final-moss-vault-v1.png`, `v2` · `logo-final-dew-sigil-v1.png`, `v2` · opcjonalnie `logo-final-depth-hybrid.png` (pierścienie skarbca + geometria sigilu, carved depth).

Galeria: `assets/generated/preview.html` — sekcja **Finaliści** na górze.

---

## Shortlist historyczny (feedback użytkownika 2026-07-07, rano)

| Kierunek | Status | Uwagi |
|----------|--------|-------|
| **Dew Sigil** *(Sygnil rosy)* | **Finalista depth** | Pierwszy shortlist; flat refinements za generyczne (Lory) |
| **Moss Vault** *(Skarbiec mchu)* | **Finalista depth** | Pierwszy shortlist; depth v2 wybrany jako ulubiony |
| **Birch Thread** *(Nić brzozy)* | **Odrzucony** | „Za kontrowersyjne” — wycofany z shortlistu |
| **Amber Loom** *(Bursztynowy krosno)* | **Depriorytet** | Nie w shortlistcie; pierwsza generacja wpadła w żarówkę — tylko archiwum |

**Refinements (flat — za generyczne):** `assets/generated/logo-refine-dew-sigil-v2.png`, `v3`, `logo-refine-moss-vault-v2.png`, `v3`, `logo-refine-dew-vault-hybrid.png`. Użytkownik widzi w nich styl **Lory / flat-ui** — zbyt corporate, kopiowalne.

**Depth pass (anti-flat):** `assets/generated/logo-depth-dew-sigil-v1.png`, `v2`, `logo-depth-moss-vault-v1.png`, `v2`, `logo-depth-dew-vault-hybrid.png`.

Zastępujemy obecny fioletowo-cyanowy squircle z literą „R” (wygląda jak Reliqua / generyczny AI) własnym symbolem: **pamięć, sny, wiedza przodków** — słowiańsko, leśnie, w zieleniach — **z głębią i fakturą**, nie płaskim szablonem z Dribbble.

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

## Anti-flat — dyrektywy promptów (feedback 2026-07-07)

Refinements z `lora=flat-ui` wpadły w **generyczny flat corporate icon** (użytkownik: „wszystko wlatuje w styl Lory”). Kolejne generacje **bez** flat-ui LoRA.

### FORBID (negative / composition_lock)

`flat design, minimalist vector logo, corporate app icon, gradient squircle, generic tech logo, dribbble logo, behance flat icon, simple geometric mark, Lory style, flat-ui, material design icon, ios app icon template`

### SEEK (positive / style bible)

`dimensional depth, subtle emboss or engraving, organic texture moss bark amber resin, hand-crafted feel, Slavic folk art influence, carved wood or amber inlay, atmospheric rim lighting, tactile surface, symbolic object with depth — NOT illustration scene, NOT landscape`

### MCP dla depth pass

```
generate_image_smart
  lora: none
  lora_strength: (omit)
  asset_type: icon
  background: dark_navy
  project_style: false
  quality_tier: final
  composition_lock: forbid=flat design,minimalist vector,corporate app icon,gradient squircle,dribbble,behance flat,Lory style
```

---

## Trzy kierunki koncepcyjne (+ jeden bonus)

### 1. Moss Vault *(Skarbiec mchu)*

**Metafora:** Pamięć jako leśny skarbiec — podwójna mandorla (vesica) tworząca labirynt, w środku bursztynowe światło jak słońce uwięzione w mchu.

**Dlaczego oryginalne:**
- Vesica + labirynt to własna kompozycja, nie kopiowany kolowrat ani Futhark
- Bursztyn = „zatrzymana pamięć” (słowiański skarb), nie generyczna żarówka
- Koncentryczne pierścienie czytają się w 16×16 px (tray) lepiej niż litera

**ComfyUI prompt (txt2img, v1 flat — archiwum):**
```
App icon logo mark, Moss Vault concept: nested vesica piscis forming a memory labyrinth vault, inner amber glow like trapped sunlight in forest moss, emerald and moss green palette, subtle Slavic woven border geometry original not Elder Futhark, flat vector UI icon, centered symbol generous padding, dark forest void background #0a120e, birch silver-green highlights, minimal geometric, no text no letters
```

**ComfyUI prompt (depth pass — anti-flat):**
```
App icon logo mark, Moss Vault depth concept: concentric rings carved into dark forest stone like a memory tunnel vault, volumetric amber glow emanating from center like trapped sunlight in resin, moss texture on ring edges and crevices, subtle emboss and engraved Slavic woven border geometry original not Elder Futhark, hand-crafted carved wood and amber inlay feel, dimensional depth with atmospheric rim lighting, emerald moss green palette void background #0a120e, birch silver-green highlights, tactile organic surface, centered symbol generous padding, symbolic object only no scene no landscape, no text no letters
```

**Negative / forbidden:** `text, watermark, light bulb, human, face, hands, purple, cyan, letter R, kolovrat, swastika, flat design, minimalist vector logo, corporate app icon, gradient squircle, generic tech logo, dribbble logo, behance flat icon, Lory style`

**Pierwsza generacja:** `assets/generated/logo-concept-moss-vault.png` — **shortlist** (zielenie + bursztyn, czytelny symbol). Refinements: `logo-refine-moss-vault-v2.png`, `v3`.

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

**Pierwsza generacja:** `assets/generated/logo-concept-birch-thread.png` — **ODRZUCONY** (za kontrowersyjny). Archiwum tylko.

---

### 3. Dew Sigil *(Sygnil rosy)*

**Metafora:** Poranna rosa na geometrycznej kratce — oryginalna runiczna geometria (nie Elder Futhark), brama pamięci w centrum.

**Dlaczego oryginalne:**
- Własna siatka kątów + kropelki, nie alfabet runiczny
- Rosa = świeża pamięć, przebudzenie
- Vesica jako „brama snu”

**ComfyUI prompt (v1 flat — archiwum):**
```
App icon logo mark, Dew Sigil concept: single centered sigil symbol only, original angular lattice geometry not Elder Futhark, three dew droplets, vesica memory gate at center, emerald green glow with amber dew highlights, flat vector UI icon, square format, dark forest background, crisp edges, no text no rune alphabet, no landscape no trees no scene
```

**ComfyUI prompt (depth pass — anti-flat):**
```
App icon logo mark, Dew Sigil depth concept: original angular lattice sigil carved and engraved into dark stone or polished amber slab, three dew droplets as small 3D glass beads catching rim light, vesica memory gate recessed at center with subtle emboss, Slavic folk art geometric influence hand-crafted not rune alphabet, moss and bark micro-texture in grooves, dimensional depth atmospheric lighting, emerald green with amber resin highlights, void background #0a120e, symbolic carved object only no landscape no trees no scene, no text
```

**Uwaga po 1. passie:** model wygenerował pejzaż zamiast ikony — w kolejnej iteracji: `asset_type=icon`, `composition_lock=forbid=landscape,scene,trees`, krótszy prompt skupiony na jednym symbole.

**Pierwsza generacja:** `assets/generated/logo-concept-dew-sigil.png` — **shortlist** (wymaga iteracji: za dużo sceny w v1). Refinements: `logo-refine-dew-sigil-v2.png`, `v3`; hybrid: `logo-refine-dew-vault-hybrid.png`.

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

### MCP — depth pass (zalecane od 2026-07-07)

```
generate_image_smart
  prompt: <depth prompt z sekcji Moss Vault / Dew Sigil>
  style: icon
  size: 512x512
  workflow: flux
  lora: none
  background: dark_navy
  project_style: false
  quality_tier: final
  asset_type: icon
  composition_lock: forbid=flat design,minimalist vector,corporate app icon,gradient squircle,dribbble,behance flat,Lory style
  seed: 42051
  filename: assets/generated/logo-depth-moss-vault-v1.png
```

### MCP — pierwsza generacja flat (archiwum)

```
generate_image_smart
  prompt: <prompt z tabeli powyżej>
  style: icon
  size: 512x512
  workflow: flux
  lora: flat-ui
  lora_strength: 0.55
  ...
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
| `assets/generated/logo-refine-*.png` | Refinements shortlistu flat (Dew Sigil, Moss Vault, hybrid) — za generyczne |
| `assets/generated/logo-depth-*.png` | Depth pass anti-flat (Dew Sigil, Moss Vault, hybrid) |
| `assets/generated/logo-final-*.png` | Final depth refinements z wyborów użytkownika |
| `assets/generated/preview.html` | Galeria slideshow — sekcja Finaliści + archiwum |
| `assets/comfyui/logo-concept.json` | Referencja workflow + prompty |
| `scripts/gen-logo-concepts.py` | Batch generator (ISKRA, poprawny workspace) |
| `docs/COMFYUI-ASSETS.md` | Pełny pipeline assetów |
