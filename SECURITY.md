# Pomnia - zasady bezpieczenstwa i zaufania

**Dokument wewnetrzny** dla zespolu i przyszlego audytu. Opisuje model zaufania przy premierze (v1). Kod zrodlowy produktu (wlacznie z vault/crypto) jest publikowany na **AGPL-3.0-only** - ten plik nie jest specyfikacja kryptograficzna ani instrukcja ataku; streszcza gwarancje dla uzytkownika i audytu.

---

## 1. Vault jako chroniony rdzen

Sejf (vault) ma bezposredni dostep do wszystkich danych uzytkownika zgromadzonych w Pomnia - rozmow, snapshotow konfiguracji, metadanych importow. To **najbardziej chroniona warstwa** produktu pod wzgledem izolacji runtime i klucza.

- Implementacja vault/crypto jest w publicznym kodzie AGPL (`src/core/vault.ts`, `crypto` itd.) - przejrzystosc zrodla nie oznacza otwartego dostepu do danych uzytkownika.
- Sejf to lokalny, przenosny "safe": dane na dysku pozostaja zaszyfrowane; fraza dostepu nie opuszcza maszyny uzytkownika. Model zaufania opiera sie na kryptografii i izolacji IPC, nie na ukrywaniu kodu.

---

## 2. Gwarancje techniczne (poziom wysoki)

Ponizej streszczenie zachowania systemu - **bez odwolan do sciezek plikow kluczy ani wewnetrznego ukladu binarnego sejfu**.

| Obszar | Gwarancja |
|--------|-----------|
| **Fraza dostepu** | Nigdy nie jest zapisywana na dysku. Utrata frazy = brak odzyskania sejfu. |
| **Szyfrowanie** | AES-256-GCM (szyfrowanie uwierzytelnione). Klucz wyprowadzany przez scrypt (parametr N=2^17 - zgodnie z UI Ustawien). |
| **Blokada sejfu** | Po zamknieciu klucz jest usuwany z pamieci procesu glownego; dane na dysku pozostaja zaszyfrowane. |
| **Izolacja UI** | Proces renderera (React) **nie ma** bezposredniego dostepu do plikow sejfu. Wszystkie operacje przechodza przez IPC do procesu glownego. |
| **Import** | Wejscie kontrolowane - walidacja formatu i normalizacja przed zapisem. Brak "surowego" zapisu dowolnych plikow do sejfu. |
| **Eksport** | Brak cichego wycieku. Dane opuszczaja sejf wylacznie przy **jawnej akcji uzytkownika**: backup, eksport do Brain, deploy pipeline. |

---

## 3. Model publikacji przy premierze (v1)

| Kategoria | Co wchodzi |
|-----------|------------|
| **PUBLIC (AGPL)** | Kod zrodlowy klienta Pomnia (UI, adaptery, vault/crypto, brain-core bundle, pipeline importu), instalatory (exe/dmg), landing, dokumentacja MCP. |
| **SEPARATE** | Homelab Brain (serwer RAG/indeks na infrastrukturze uzytkownika) - **nie** jest czescia publikacji klienta Pomnia. |
| **NIE PUBLIC** | Prywatne vaulty uzytkownikow, klucze, dane produkcyjne, lokalne artefakty build (`landing/` robocze, vault/, sandbox/). |

Homelab Brain to osobny produkt/instancja; Pomnia dostarcza do niego dane tylko na zadanie uzytkownika (eksport/deploy), nie bundluje serwera Brain w instalatorze klienta.

---

## 4. Pitch zaufania

**PL:** Twoje rozmowy leza w lokalnym, zaszyfrowanym sejfie - klucz tylko w Twojej glowie, a aplikacja nie wysyla ich nigdzie bez Twojej wyraznej decyzji.

**EN:** Your conversations live in a local encrypted vault - the key stays in your head, and the app never moves them anywhere without your explicit choice.

---

## 5. Warstwy - dostep i postawa ochronna

| Warstwa | Poziom dostepu do danych uzytkownika | Postawa ochronna |
|---------|-------------------------------------|------------------|
| **Vault** | Pelny - odczyt/zapis calego archiwum po odblokowaniu | Najwyzsza izolacja; brak bezposredniego dostepu z renderera; klucz tylko w RAM procesu glownego; kod AGPL audytowalny |
| **Adapters** | Odczyt zrodel zewnetrznych (Claude Code, Cursor, profile itd.) przed zapisem do sejfu | Tylko odczyt z znanych lokalizacji OS; normalizacja do wspolnego modelu; brak zapisu poza vault |
| **Import** | Wejscie z plikow eksportu (ZIP/JSON/MD) uzytkownika | Bramkowany punkt wejscia; walidacja i parsowanie; brak arbitralnego zapisu; ten sam model co backup |
| **Brain-MCP** | Eksport wybranych rozmow / notatek na zadanie | Jednokierunkowy, jawny eksport; opcjonalny deploy do osobnego serwera Brain; brak domyslnej telemetrii |

---

## Zakres dokumentu

Ten plik nie zastepuje polityki bezpieczenstwa organizacji ani raportu audytu. Aktualizacje modelu publikacji lub gwarancji technicznych powinny byc odzwierciedlone tutaj przed kazda wieksza wersja produkcyjna.

*Ostatnia aktualizacja: 2026-07-27 - zgodnosc z AGPL (publiczne zrodlo vault/crypto).*
