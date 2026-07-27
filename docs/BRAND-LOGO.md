# Pomnia — logo & branding (Slavic green rebrand)

> **Status:** koncepcje 2026-07-07 · depth pass (anti-flat) · bold series (anti-mild) · **tymczasowa ikona app (2026-07-09):** `logo-bold-vault-v1.png` → `resources/icon.png` + `icon.ico` — do czasu wyboru **jednego** finału.
>
> **Pipeline:** prywatny pipeline ComfyUI (skrypty `gen-logo-*.py`, workflowi, `docs/COMFYUI-ASSETS.md`) został **usunięty z tego publicznego repo**. Gotowe assety logo/ikony żyją pod `assets/` oraz `resources/` — regeneracja nie jest częścią tego drzewa.

## Gdzie są pliki

| Lokalizacja | Opis |
|-------------|------|
| `assets/generated/` | Koncepcje, refinements, depth, final, bold series (PNG) + `preview.html` |
| `resources/icon.png` / `resources/icon.ico` | Aktualna ikona aplikacji (placeholder bold-vault-v1) |
| `assets/` | Zrzuty UI / referencje brandingowe (jeśli obecne) |

---

## Bold series — feedback „za miękkie” (2026-07-07, wieczór)

Użytkownik: poprzednie depth/final batch **za miękkie, mało unikalne** — chce BOLD, memorable, zero kopiowalności (nie Lory, nie corporate flat).

| Seria | Pliki | Kierunek |
|-------|-------|----------|
| **A: Ostry sigil** | `logo-bold-sigil-v1.png` … `v5.png` | Ostre kąty, agresywna geometria folk-art, rosa jako fasetki kryształu, wysoki kontrast emerald + amber |
| **B: Rytuał skarbca** | `logo-bold-vault-v1.png` … `v5.png` | Monumentalna brama rytualna, labirynt pierścieni, pęknięta kora + patyna żelaza, bursztynowe serce |

**Kierunek stylu (historycznie):** FLUX 512×512, bez soft/mild/generic/corporate/rounded/pastel/dribbble.

Galeria: `assets/generated/preview.html` — **Seria A + B na górze** (slajdy 1–10).

---

## Finaliści (feedback użytkownika 2026-07-07, wieczór — archiwum)

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

## Anti-flat — dyrektywy stylu (feedback 2026-07-07)

Refinements flat-ui wpadły w **generyczny flat corporate icon** (użytkownik: „wszystko wlatuje w styl Lory”). Kolejne iteracje: **bez** flat-ui / soft corporate look.

### FORBID

`flat design, minimalist vector logo, corporate app icon, gradient squircle, generic tech logo, dribbble logo, behance flat icon, simple geometric mark, Lory style, flat-ui, material design icon, ios app icon template, soft, mild, generic, rounded friendly app icon, pastel, subtle, bland, soft glow, cute, game UI`

### SEEK

`dimensional depth, subtle emboss or engraving, organic texture moss bark amber resin, hand-crafted feel, Slavic folk art influence, carved wood or amber inlay, atmospheric rim lighting, tactile surface, symbolic object with depth — NOT illustration scene, NOT landscape`

**Bold pass:** dodatkowo `sharp angular geometry, high contrast chiaroscuro, crystal facets, iron patina, cracked bark, ritual threshold, monumental artifact, aggressive folk-art angles`

---

## Trzy kierunki koncepcyjne (+ jeden bonus)

### 1. Moss Vault *(Skarbiec mchu)*

**Metafora:** Pamięć jako leśny skarbiec — podwójna mandorla (vesica) tworząca labirynt, w środku bursztynowe światło jak słońce uwięzione w mchu.

**Dlaczego oryginalne:**
- Vesica + labirynt to własna kompozycja, nie kopiowany kolowrat ani Futhark
- Bursztyn = „zatrzymana pamięć” (słowiański skarb), nie generyczna żarówka
- Koncentryczne pierścienie czytają się w 16×16 px (tray) lepiej niż litera

**Opis depth (anti-flat):** concentric rings carved into dark forest stone like a memory tunnel vault, volumetric amber glow from center like trapped sunlight in resin, moss texture on ring edges, embossed Slavic woven border (original, not Elder Futhark), carved wood / amber inlay feel, emerald–moss on void `#0a120e`, symbolic object only — no scene/landscape/text.

**Forbidden metaphors:** light bulb, letter R, kolovrat, swastika, purple/cyan Reliqua palette, flat corporate icon.

**Assety:** `assets/generated/logo-concept-moss-vault.png` (shortlist) · refinements `logo-refine-moss-vault-v2/v3` · depth `logo-depth-moss-vault-v1/v2`.

---

### 2. Birch Thread *(Nić brzozy)*

**Metafora:** Trzy splątane nici pamięci — haft, kora brzozy, węzły jak w snopom snów (bez dosłownego dreamcatchera).

**Dlaczego oryginalne:**
- Inspiracja haftem zamiast kopiowania kolowratu
- Abstrakcyjny węzeł, nie litera „P”
- Srebrno-zielona brzoza = charakterystyczny dla Europy Środkowej

**Uwaga historyczna:** pierwsza generacja dociągnęła magenta/teal — unikać tych akcentów.

**Asset:** `assets/generated/logo-concept-birch-thread.png` — **ODRZUCONY** (za kontrowersyjny). Archiwum tylko.

---

### 3. Dew Sigil *(Sygnil rosy)*

**Metafora:** Poranna rosa na geometrycznej kratce — oryginalna runiczna geometria (nie Elder Futhark), brama pamięci w centrum.

**Dlaczego oryginalne:**
- Własna siatka kątów + kropelki, nie alfabet runiczny
- Rosa = świeża pamięć, przebudzenie
- Vesica jako „brama snu”

**Opis depth:** angular lattice sigil carved into dark stone / polished amber, three dew droplets as glass beads with rim light, recessed vesica memory gate, moss/bark micro-texture in grooves — symbolic carved object only, no landscape/trees/scene.

**Uwaga historyczna:** v1 czasem wychodził pejzaż zamiast ikony — trzymać się jednego symbolu, zakazać landscape/scene/trees.

**Assety:** `assets/generated/logo-concept-dew-sigil.png` · refinements `logo-refine-dew-sigil-v2/v3` · hybrid `logo-refine-dew-vault-hybrid.png` · depth `logo-depth-dew-sigil-v1/v2`.

---

### Bonus: Amber Loom *(Bursztynowy krosno)*

**Metafora:** Koło pamięci — przodkowie tkają wątki wiedzy; bursztyn w centrum jak skamieniałe wspomnienie.

**Uwaga:** pierwsza generacja wpadła w żarówkę (zakazana metafora).

**Asset:** `assets/generated/logo-concept-amber-loom.png` — depriorytet / archiwum.

---

## Po wyborze kierunku

1. Użytkownik wybiera koncept (np. **Moss Vault**)
2. Iteracje poza tym repo (prywatny pipeline / ręczna edycja) aż symbol jest czysty
3. Eksport wektorowy (Figma / Inkscape) lub ręczna wektoryzacja
4. `resources/icon.png` + `node scripts/gen-icon.mjs` → `resources/icon.ico` (jeśli skrypt nadal w repo)
5. Landing + UI: zamiana akcentów violet/cyan na forest/moss/amber

**Tymczasowo (2026-07-09):** wdrożono **bold-vault-v1** jako placeholder — finalny wybór nadal otwarty.

**Nie rób kroku 4 bez explicit „wybieram X” od użytkownika** (poza świadomym placeholderem jak powyżej).

---

## Pliki (w tym repo)

| Plik / wzorzec | Opis |
|----------------|------|
| `assets/generated/logo-concept-*.png` | Pierwsze generacje (4 kierunki) |
| `assets/generated/logo-refine-*.png` | Refinements shortlistu flat — za generyczne |
| `assets/generated/logo-depth-*.png` | Depth pass anti-flat |
| `assets/generated/logo-final-*.png` | Final depth refinements |
| `assets/generated/logo-bold-sigil-v*.png` | Seria A: Ostry sigil |
| `assets/generated/logo-bold-vault-v*.png` | Seria B: Rytuał skarbca |
| `assets/generated/preview.html` | Galeria slideshow |
| `resources/icon.png` / `icon.ico` | Ikona app (placeholder) |

**Usunięte z publicznego repo (nie linkować):** `assets/comfyui/`, `scripts/gen-logo-*.py`, `docs/COMFYUI-ASSETS.md`, `.cursor/comfy-project.json` — prywatny ComfyUI pipeline.
