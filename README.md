<div align="center">
  <img src="src-tauri/icons/128x128.png" width="96" alt="Eyes of Odin" />
  <h1>Eyes of Odin</h1>
  <p><strong>Lokalne studio wizualizacji danych, limitów i scenariuszy „co, jeśli…”.</strong></p>
  <p>
    <img alt="Wersja 0.1.0" src="https://img.shields.io/badge/version-0.1.0-39d8c2" />
    <img alt="Windows" src="https://img.shields.io/badge/platform-Windows-2d7dff" />
    <img alt="13 formatów danych" src="https://img.shields.io/badge/data-13%20formats-d7ff45" />
    <img alt="Local first" src="https://img.shields.io/badge/privacy-local--first-9aa6b8" />
  </p>
</div>

<div align="center">
  <a href="https://github.com/Kitori2137/EyesOfOdin/releases/latest"><img alt="Pobierz najnowszą wersję" src="https://img.shields.io/badge/Pobierz-najnowszy%20build-39d8c2?style=for-the-badge" /></a>
  <a href="#aktualizacja-do-najnowszego-builda"><img alt="Aktualizuj Eyes of Odin" src="https://img.shields.io/badge/Aktualizuj-instrukcja-5f8cff?style=for-the-badge" /></a>
</div>

Eyes of Odin pozwala wczytać własny plik, wybrać osie X i Y, ograniczyć analizę do wskazanego czasu, zbudować kilka wykresów obok siebie oraz sprawdzić, kiedy wartości przekroczyły ustalone granice. Wszystkie dane pozostają na komputerze użytkownika.

## Pobieranie i instalacja

Najprostsza opcja dla większości użytkowników: otwórz [najnowsze wydanie](https://github.com/Kitori2137/EyesOfOdin/releases/latest), rozwiń **Assets** i uruchom plik `Eyes of Odin Setup x.y.z.exe`. Instalacja odbywa się dla bieżącego użytkownika i nie wymaga konta administratora.

| Sposób | Dla kogo | Co zrobić |
|---|---|---|
| Instalator | zalecany dla większości osób | pobierz `Eyes of Odin Setup x.y.z.exe` |
| Jedna komenda | szybka instalacja lub aktualizacja | użyj poniższego polecenia PowerShell |
| Portable | bez instalowania | pobierz `Eyes of Odin Portable x.y.z.exe` |

### Instalacja jedną komendą

Uruchom PowerShell i wklej:

```powershell
irm https://raw.githubusercontent.com/Kitori2137/EyesOfOdin/main/scripts/install.ps1 | iex
```

Skrypt automatycznie rozpoznaje najnowsze wydanie, pobiera jego instalator, sprawdza sumę SHA-256 i instaluje aplikację dla bieżącego użytkownika. Ta sama komenda służy do pierwszej instalacji i aktualizacji.

Przed pierwszą publiczną wersją można również pobrać lokalnie przygotowany `Eyes of Odin Setup 0.1.0.exe` z katalogu [releases/0.1.0](releases/0.1.0). Po opublikowaniu taga `v0.1.0` GitHub automatycznie utworzy właściwą stronę wydania i doda zweryfikowane pliki.

## Aktualizacja do najnowszego builda

Zamknij Eyes of Odin, uruchom PowerShell i wklej tę samą komendę:

```powershell
irm https://raw.githubusercontent.com/Kitori2137/EyesOfOdin/main/scripts/install.ps1 | iex
```

Aktualizator pobiera zawartość najnowszego wydania nawet wtedy, gdy poprawiony build nadal ma numer `0.1.0`. Zapisana lokalnie przestrzeń robocza pozostaje bez zmian. Jeżeli wolisz zobaczyć zwykłe okno instalatora, pobierz skrypt i uruchom go z parametrem `-Interactive`.

## Najważniejsze możliwości

- 13 formatów wejściowych: CSV, TSV, TXT, JSON, JSONL, NDJSON, XLS, XLSX, XLSM, XLSB, ODS, FODS i Parquet,
- strumieniowy import plików tekstowych i JSON Lines do 500 MB oraz Parquet do 2 GB,
- wybór arkusza dla wszystkich obsługiwanych skoroszytów,
- przetwarzanie do 2 000 000 rekordów tekstowych, JSON Lines i Parquet oraz 250 000 rekordów arkuszy,
- wybór dowolnych zgodnych kolumn X i Y,
- zakres czasu od–do zapisywany razem z wykresem,
- wykres liniowy, słupkowy, obszarowy, punktowy i histogram,
- kilka wartości Y, serie, filtry, agregacje i porównanie różnic,
- pulpity 1, 4, 9 lub własny układ wykresów,
- eksport i import szablonów z dopasowaniem nazw kolumn,
- dolne i górne limity kontrolne, np. 90–110,
- raport dokładnych przekroczeń wraz z eksportem CSV,
- wizualny model zależności i ścieżki decyzji, np. `1 → 4 → 9`,
- lokalny zapis przestrzeni roboczej bez konta i chmury.

## Pierwsze użycie

1. Na stronie głównej wybierz **Wczytaj dane**.
2. Po imporcie aplikacja automatycznie otworzy **Visual Lab**.
3. Wybierz pole osi X, jedną lub kilka wartości Y oraz typ wykresu.
4. Jeśli dane zawierają czas, ustaw opcjonalnie **Zakres czasu → Od / Do**.
5. Dodaj limit, np. od `90` do `110`, i zapisz wykres.
6. Dodaj kolejne wykresy, wybierz układ 1/4/9 i zapisz pulpit jako szablon.
7. Otwórz raport limitów, aby zobaczyć dokładny początek i koniec każdego zdarzenia.

Pełny opis ekranów i mechanik znajduje się w [GUIDE.md](GUIDE.md).

## Gotowe dane demonstracyjne

W katalogu [data/ready](data/ready) znajdują się trzy spójne zestawy przemysłowych danych syntetycznych:

| Interwał | Okres | Rekordy | Formaty |
|---|---:|---:|---|
| 5 minut | 7 dni | 2 016 | CSV, XLSX |
| 10 minut | 7 dni | 1 008 | CSV, XLSX |
| 15 minut | 7 dni | 672 | CSV, XLSX |

Każdy zestaw ma te same 44 kolumny oraz kontrolowane przekroczenia wartości 90 i 110. Szczegóły opisuje [SCHEMA.md](data/ready/SCHEMA.md).

## Uruchomienie ze źródeł

Wymagane są Node.js 22+, pnpm oraz — wyłącznie do budowy instalatora — Rust i Microsoft Visual Studio Build Tools z modułem „Desktop development with C++”.

```powershell
pnpm install
pnpm dev
```

Budowanie instalatora Windows:

```powershell
pnpm desktop:build
```

## Kontrola jakości

```powershell
pnpm quality
```

Kontrola obejmuje TypeScript, ESLint, testy jednostkowe, produkcyjną kompilację Vite, Rust `fmt` i `clippy`. Ta sama komenda uruchamia Ruff oraz mypy, gdy w projekcie pojawią się pliki Pythona; obecna wersja nie zawiera kodu Python, więc oba narzędzia zgłaszają kontrolowane pominięcie.

## Architektura

```text
src/app                główny interfejs i style
src/mechanics/charts   wykresy, limity, raporty i szablony
src/mechanics/data     rejestr formatów, importery i lokalny magazyn danych
src/mechanics/modeling scenariusze oraz model zależności
src/desktop            punkt startowy aplikacji desktopowej
src-tauri              natywna obudowa i instalator Windows
data/ready             gotowe dane demonstracyjne
tests                  testy regresji i mechanik
```

Pełna mapa plików i przepływ danych są opisane w [GUIDE.md](GUIDE.md#architektura-i-foldery).

## Prywatność

Eyes of Odin 0.1.0 nie wysyła importowanych danych do serwera. Pliki są odczytywane lokalnie, a pulpit i szablony są zapisywane w pamięci aplikacji na danym komputerze.

## Status projektu

Wersja 0.1.0 jest obecnie rozwijana przed pierwszą publikacją. Historia wszystkich zmian znajduje się w [CHANGELOG.md](CHANGELOG.md).
