# Eyes of Odin — Scenario Studio

Interaktywne laboratorium danych i scenariuszy „co się stanie, jeśli…”. Aplikacja pozwala wczytać CSV, budować wizualny model zależności, tworzyć rozgałęzione ścieżki decyzji i porównywać wyniki wariantów.

## Pierwsza wersja

- import i profilowanie plików CSV,
- wizualny graf danych, transformacji, decyzji i metryk,
- edytowalne parametry scenariusza,
- ścieżki decyzji, np. `1 → 4 → 9`,
- wyniki przeliczane na żywo,
- porównanie wariantu ze scenariuszem bazowym,
- lokalny zapis przestrzeni roboczej,
- paleta poleceń pod `Ctrl+K`.

## Uruchomienie lokalne

```bash
pnpm install
pnpm dev
```

Następnie otwórz `http://localhost:3000`.

## Aplikacja Windows

```bash
pnpm desktop:dev
pnpm desktop:build
```

Druga komenda tworzy instalator Windows w katalogu `src-tauri/target/release/bundle/nsis`.

Pierwsza kompilacja wymaga Microsoft Visual Studio Build Tools z modułem „Desktop development with C++”.

Gotowe pliki przeznaczone dla użytkownika znajdują się w `releases/0.1.0`:

- `Eyes of Odin Setup 0.1.0.exe` — rekomendowany instalator,
- `Eyes of Odin Portable 0.1.0.exe` — wersja uruchamiana bez instalacji.

## Kontrola jakości

```bash
pnpm test
```
