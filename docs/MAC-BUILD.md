# Pomnia — build macOS (DMG)

Build **musi** iść na macOS. Na Windows `npm run pack:mac` się nie uda (brak narzędzi Apple + natywne moduły pod Darwin).

Aktualna wersja w repo: **0.1.2** (`package.json`). Skrypt pakowania:

```json
"pack:mac": "npm run build:brain-core && npm run stage:brain-core && electron-vite build && electron-builder --mac"
```

Konfiguracja `electron-builder.yml`:

- output: `release/`
- target: `dmg`
- artifact: `Pomnia-${version}.dmg` (np. `release/Pomnia-0.1.2.dmg`)
- dodatkowo: `release/mac/` (rozpakowana aplikacja `.app`)

---

## 1. Wymagania

| Narzędzie | Wersja / uwagi |
|-----------|----------------|
| **macOS** | 12+ (Monterey lub nowszy) |
| **Node.js** | 20 LTS lub 22 (zalecane LTS) |
| **npm** | 10+ (wbudowany w Node) |
| **Xcode Command Line Tools** | wymagane przez `electron-builder` i kompilację `better-sqlite3` |

Instalacja CLT (jednorazowo):

```bash
xcode-select --install
```

Sprawdzenie:

```bash
node -v
npm -v
xcode-select -p   # powinno wypisać ścieżkę, np. /Library/Developer/CommandLineTools
```

---

## 2. Przygotowanie repo

```bash
git clone <url-repozytorium> pomnia
cd pomnia
git checkout master
git pull
```

Czysta instalacja zależności (zalecane przed pierwszym buildem):

```bash
npm ci
```

Opcjonalnie — testy przed pakowaniem:

```bash
npm test
npm run typecheck
```

---

## 3. Ikona (opcjonalnie)

W `resources/` są `icon.png` i `icon.ico`. Dla macOS electron-builder preferuje **`resources/icon.icns`**.

Jeśli build narzeka na brak ikony, wygeneruj `.icns` z PNG (512×512 lub większy):

```bash
mkdir -p resources/icon.iconset
sips -z 512 512 resources/icon.png --out resources/icon.iconset/icon_512x512.png
# … pozostałe rozmiary iconset (1024, 256, 128, …) lub użyj narzędzia typu png2icns
iconutil -c icns resources/icon.iconset -o resources/icon.icns
```

Bez `icon.icns` builder często i tak buduje DMG z domyślną ikoną Electron — aplikacja działa, wygląd Dock/Finder może być generyczny.

---

## 4. Build DMG

```bash
npm run pack:mac
```

Kolejność wewnątrz skryptu:

1. `build:brain-core` — kompilacja `@pomnia/brain-core`
2. `stage:brain-core` — staging runtime + `electron-rebuild` dla `better-sqlite3` (ABI Electrona)
3. `electron-vite build` — bundle main/preload/renderer → `out/`
4. `electron-builder --mac` — DMG w `release/`

Oczekiwany wynik:

```
release/Pomnia-0.1.2.dmg
release/mac/Pomnia.app
```

Instalacja lokalna: otwórz DMG, przeciągnij `Pomnia.app` do Applications.

---

## 5. Apple Silicon vs Intel

Domyślnie **architektura maszyny, na której budujesz**:

| Maszyna buildu | DMG zawiera |
|----------------|-------------|
| Mac M1/M2/M3/M4 (arm64) | aplikacja **arm64** |
| Mac Intel (x64) | aplikacja **x64** |

Uniwersalny binarny (arm64 + x64 w jednym DMG) — **nie jest skonfigurowany**. Jeśli potrzebujesz obu architektur, dodaj w `electron-builder.yml` np.:

```yaml
mac:
  target:
    - target: dmg
      arch: [arm64, x64]
```

albo buduj na obu typach Maców / w CI (osobne artefakty).

---

## 6. Podpisywanie kodu i notaryzacja (opcjonalne)

Dla **dev / lokalnego użytku** podpis nie jest wymagany. Po zainstalowaniu macOS może pokazać:

> „Pomnia” cannot be opened because the developer cannot be verified.

Obejście (tylko zaufane buildy):

- System Settings → Privacy & Security → **Open Anyway**, albo
- klik prawy na aplikację → **Open** (pierwsze uruchomienie)

Dla **dystrybucji publicznej** potrzebujesz:

- konto **Apple Developer** (płatne)
- certyfikat **Developer ID Application**
- zmienne środowiskowe dla `electron-builder`, np.:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD='…'
export APPLE_ID='…'
export APPLE_APP_SPECIFIC_PASSWORD='…'
export APPLE_TEAM_ID='…'
npm run pack:mac
```

Notaryzacja (`@electron/notarize`) — osobny krok po podpisaniu; bez tego Gatekeeper nadal blokuje pobrania z internetu.

**Ten repo nie ma skonfigurowanych sekretów podpisu** — lokalny / CI build bez certyfikatów = unsigned DMG (OK do testów).

---

## 7. Typowe problemy

| Problem | Rozwiązanie |
|---------|-------------|
| `xcode-select: error: tool 'xcodebuild' requires Xcode` | `xcode-select --install` |
| błąd kompilacji `better-sqlite3` | upewnij się, że CLT są zainstalowane; usuń `build/brain-core-runtime` i uruchom `pack:mac` ponownie |
| brak miejsca na dysku | staging brain-core + `node_modules` ~1–2 GB |
| Gatekeeper blokuje app | patrz §6 — unsigned build |
| budujesz na Windows | **nie rób tego** — użyj Maca lub GitHub Actions (`release-mac.yml`) |

---

## 8. Build w CI (GitHub Actions)

Workflow `.github/workflows/release-mac.yml`:

- trigger: ręcznie (`workflow_dispatch`) lub tag `v*` (np. `v0.1.2`)
- runner: `macos-latest` (Apple Silicon)
- artefakt: `Pomnia-*.dmg` z `release/`

Bez sekretów Apple = unsigned DMG do pobrania z zakładki Actions → Artifacts.

---

## 9. Szybka ściąga (copy-paste)

```bash
git clone <url> pomnia && cd pomnia
xcode-select --install    # jeśli jeszcze nie
npm ci
npm run pack:mac
open release/Pomnia-*.dmg
```
