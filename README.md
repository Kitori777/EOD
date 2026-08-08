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

## Kontrola jakości

```bash
pnpm test
```
