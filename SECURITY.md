# Reliqua — zasady bezpieczeństwa i zaufania

**Dokument wewnętrzny** dla zespołu i przyszłego audytu. Opisuje model zaufania przy premierze (v1). Nie jest specyfikacją open-source ani dokumentacją publiczną implementacji kryptograficznej.

---

## 1. Vault jako chroniony rdzeń

Sejf (vault) ma bezpośredni dostęp do wszystkich danych użytkownika zgromadzonych w Reliqua — rozmów, snapshotów konfiguracji, metadanych importów. To **najbardziej chroniona warstwa** produktu.

- Kod vault, format plików sejfu oraz implementacja kryptografii **pozostają zamknięte** przy premierze — bez publikacji kodu, specyfikacji formatu ani szczegółów crypto.
- Reliqua **nie jest modelem „open core”**. Sejf to zamknięty, przenośny „safe” użytkownika; reszta produktu może ewoluować osobno, ale rdzeń danych nie podlega otwarciu w v1.

---

## 2. Gwarancje techniczne (poziom wysoki)

Poniżej streszczenie zachowania systemu — **bez odwołań do kodu, ścieżek plików kluczy ani wewnętrznego układu binarnego sejfu**.

| Obszar | Gwarancja |
|--------|-----------|
| **Fraza dostępu** | Nigdy nie jest zapisywana na dysku. Utrata frazy = brak odzyskania sejfu. |
| **Szyfrowanie** | AES-256-GCM (szyfrowanie uwierzytelnione). Klucz wyprowadzany przez scrypt (parametr N=2¹⁷ — zgodnie z UI Ustawień). |
| **Blokada sejfu** | Po zamknięciu klucz jest usuwany z pamięci procesu głównego; dane na dysku pozostają zaszyfrowane. |
| **Izolacja UI** | Proces renderera (React) **nie ma** bezpośredniego dostępu do plików sejfu. Wszystkie operacje przechodzą przez IPC do procesu głównego. |
| **Import** | Wejście kontrolowane — walidacja formatu i normalizacja przed zapisem. Brak „surowego” zapisu dowolnych plików do sejfu. |
| **Eksport** | Brak cichego wycieku. Dane opuszczają sejf wyłącznie przy **jawnej akcji użytkownika**: backup, eksport do Brain, deploy pipeline. |

---

## 3. Model publikacji przy premierze (v1)

| Kategoria | Co wchodzi |
|-----------|------------|
| **PUBLIC** | Instalatory (exe/dmg), strona landing, fragmenty dokumentacji MCP (integracja z zewnętrznymi klientami AI). |
| **CLOSED** | UI aplikacji, adaptery źródeł, bundle brain-core, vault, pipeline importu. |
| **SEPARATE** | Homelab Brain (serwer RAG/indeks na infrastrukturze użytkownika) — **nie** jest częścią publikacji klienta Reliqua. |

Homelab Brain to osobny produkt/instancja; Reliqua dostarcza do niego dane tylko na żądanie użytkownika (eksport/deploy), nie bundluje serwera Brain w instalatorze klienta.

---

## 4. Pitch zaufania

**PL:** Twoje rozmowy leżą w lokalnym, zaszyfrowanym sejfie — klucz tylko w Twojej głowie, a aplikacja nie wysyła ich nigdzie bez Twojej wyraźnej decyzji.

**EN:** Your conversations live in a local encrypted vault — the key stays in your head, and the app never moves them anywhere without your explicit choice.

---

## 5. Warstwy — dostęp i postawa ochronna

| Warstwa | Poziom dostępu do danych użytkownika | Postawa ochronna |
|---------|-------------------------------------|------------------|
| **Vault** | Pełny — odczyt/zapis całego archiwum po odblokowaniu | Zamknięty kod; najwyższa izolacja; brak bezpośredniego dostępu z renderera; klucz tylko w RAM procesu głównego |
| **Adapters** | Odczyt źródeł zewnętrznych (Claude Code, Cursor, profile itd.) przed zapisem do sejfu | Tylko odczyt z znanych lokalizacji OS; normalizacja do wspólnego modelu; brak zapisu poza vault |
| **Import** | Wejście z plików eksportu (ZIP/JSON/MD) użytkownika | Bramkowany punkt wejścia; walidacja i parsowanie; brak arbitralnego zapisu; ten sam model co backup |
| **Brain-MCP** | Eksport wybranych rozmów / notatek na żądanie | Jednokierunkowy, jawny eksport; opcjonalny deploy do osobnego serwera Brain; brak domyślnej telemetrii |

---

## Zakres dokumentu

Ten plik nie zastępuje polityki bezpieczeństwa organizacji ani raportu audytu. Aktualizacje modelu publikacji lub gwarancji technicznych powinny być odzwierciedlone tutaj przed każdą większą wersją produkcyjną.

*Ostatnia aktualizacja: premiera v1.*
