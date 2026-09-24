# Mechaniki aplikacji

Każdy folder reprezentuje jeden obszar odpowiedzialności:

- `data/` — wejście: import, normalizacja i przechowywanie danych.
- `charts/` — prezentacja danych: serie, filtry, limity i raporty.
- `modeling/` — jawny model użytkownika: graf, formuły i wykonanie.
- `simulation/` — analiza wariantów: what-if, prognozy i diagnostyka.
- `econometrics/` — wydzielony blok matematyczny: estymacja OLS/ARX i jej statystyki.
- `compare/` — porównywanie danych i rezultatów.

Zależności powinny prowadzić od interfejsu do mechanik. Moduł ekonometryczny nie zna komponentów React i zwraca wyłącznie dane opisujące dopasowanie.
