# Schemat gotowych danych

Zestawy w tym katalogu są syntetycznymi danymi demonstracyjnymi odtworzonymi na podstawie nazw widocznych na dostarczonych zdjęciach. Nazwy zostały ujednolicone do czytelnego formatu `Pascal_Snake_Case`; nie należy traktować ich jako dokładnego eksportu konkretnej maszyny.

## Pliki

| Katalog | Interwał | Wiersze | Okres |
|---|---:|---:|---|
| `5-minutes` | 5 minut | 2 016 | 2026-07-01 – 2026-07-07 |
| `10-minutes` | 10 minut | 1 008 | 2026-07-01 – 2026-07-07 |
| `15-minutes` | 15 minut | 672 | 2026-07-01 – 2026-07-07 |

Każdy katalog zawiera identyczny zestaw w CSV i XLSX. Dane wspólnego znacznika czasu mają te same wartości.

## Kolumny

### Czas

- `Timestamp` — znacznik czasu ISO 8601.

### Dancer i Nip

- `Dancer_Setpoint`, `Dancer_Process_Value`, `Dancer_Output`,
- `Nip_Setpoint`, `Nip_Process_Value`, `Nip_Output`.

### Seal 1 i Seal 2

Dla każdego `Seal1` i `Seal2` oraz stref `Heat1`–`Heat4` występują:

- `{Seal}_Heat{N}_Setpoint`,
- `{Seal}_Heat{N}_Process_Value`,
- `{Seal}_Heat{N}_Draw_Temp_Correction`.

Dodatkowo:

- `Seal1_Temperature_Setpoint`, `Seal1_Temperature_Process_Value`,
- `Seal2_Temperature_Setpoint`, `Seal2_Temperature_Process_Value`.

### Produkcja i korekcje

- `Line_Speed`,
- `Production_Length`,
- `Extrusion_Output`,
- `Printmark_Sensor_1_Offset`,
- `Printmark_Sensor_2_Offset`,
- `Punch_Position_Offset`,
- `Punch_Speed_Offset`,
- `Seal1_Position_Offset`,
- `Seal2_Position_Offset`.

Łącznie każdy plik zawiera 44 kolumny.

## Zaplanowane przekroczenia

Kanały `Seal*_Heat*_Process_Value` pracują zwykle w okolicy 100. W danych celowo umieszczono zdarzenia poniżej 90 lub powyżej 110 w pobliżu:

- 2026-07-02 03:00 — spadek,
- 2026-07-04 14:00 — wzrost,
- 2026-07-06 08:00 — spadek,
- 2026-07-07 19:00 — wzrost.

Poszczególne kanały rozpoczynają zdarzenie z przesunięciem do 14 minut. Dzięki temu raport pokazuje różne czasy początku i zakończenia.

## Zalecany test

1. Wybierz `Timestamp` jako X.
2. Wybierz `Seal1_Heat1_Process_Value` jako Y.
3. Ustaw limit od 90 do 110.
4. Wybierz tryb sprawdzania każdego rekordu źródłowego.
5. Ogranicz czas do jednego z okresów opisanych powyżej.
