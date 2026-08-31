# Prezentacja Eyes of Odin na danych 5-minutowych

## Najprostszy gotowy przykład

Do krótkiej prezentacji użyj pliku `outputs/percentyl-demo-0.1.2/eyes_of_odin_demo_percentyle.csv`. Zawiera 288 rekordów z jednej doby i cztery celowo przygotowane zdarzenia, które aplikacja pokaże od razu po wczytaniu:

- spadek `Dancer_Process_Value` poniżej dolnej granicy P10 dla poziomu 90%,
- wzrost `Dancer_Output` powyżej górnej granicy P90,
- spadek `Nip_Process_Value` poniżej dolnej granicy P10,
- wzrost `Line_Speed` powyżej górnej granicy P90.

Kolumna `Demo_Event` opisuje momenty przygotowanych zdarzeń. Przy poziomie 90% aplikacja używa P90 dla alarmu górnego i P10 dla alarmu dolnego — dzięki temu oba kierunki dotyczą skrajnych 10% obserwacji.

Ten scenariusz korzysta z pliku `data/ready/5-minutes/eyes_of_odin_5_minutes.csv`. Zestaw zawiera 2 016 rekordów z siedmiu dni, zapisanych co pięć minut, oraz 44 kolumny procesowe.

## Szybka prezentacja — około 5 minut

1. Na stronie startowej wybierz **Wczytaj dane** i wskaż plik `eyes_of_odin_5_minutes.csv`.
2. Pokaż cztery automatycznie przygotowane wykresy:
   - śledzenie `Dancer_Setpoint` i `Dancer_Process_Value`,
   - `Dancer_Output` z linią P90 i alertami,
   - śledzenie `Nip_Setpoint` i `Nip_Process_Value`,
   - `Line_Speed` z linią P90.
3. Najedź na punkt wykresu, aby pokazać dokładny czas i wartość. Użyj dolnego suwaka, aby zawęzić okres.
4. Rozwiń **Raport limitów**. Zamiast pojedynczych wierszy raport pokazuje całe zdarzenia: początek, koniec, liczbę próbek, minimum, maksimum oraz największe przekroczenie.
5. Przejdź do **Model**, otwórz Inspektor i zaznacz blok `Kontrola P90 · Dancer_Output`.
6. Pokaż, że można zmienić P90 na P95/P99, wybrać inną kolumnę, kierunek przekroczenia oraz poziom alertu.
7. Kliknij **Uruchom**. Panel wyników pokaże obliczoną granicę, liczbę przekroczonych próbek, liczbę zdarzeń i największe odchylenie.

## Zweryfikowane wartości przykładowe

Dla pełnego pliku 5-minutowego i pola `Dancer_Output`:

| Miara | Wartość |
|---|---:|
| Średnia | 48,009 |
| Minimum | 44,445 |
| Maksimum | 51,559 |
| P90 | 50,835 |
| P95 | 51,113 |
| P99 | 51,415 |
| Punkty powyżej P90 | 202 z 2 016 |
| Kolejne okresy przekroczeń P90 | 97 |

Przykładowe zdarzenie zaczyna się `2026-07-01 01:50`, kończy `2026-07-01 02:25`, obejmuje osiem próbek, a jego maksimum wynosi `51,550`.

## Trzy gotowe historie do pokazania

### 1. Śledzenie wartości zadanej

Wykres `Dancer_Setpoint` oraz `Dancer_Process_Value` pokazuje, jak wartość procesu porusza się względem stałej wartości zadanej. Stała nastawa jest kontekstem, a nie automatycznie błędem jakości danych.

### 2. Nietypowo wysokie wartości

P90 odpowiada wartości, poniżej której znajduje się około 90% obserwacji. Kreskowana linia nie jest limitem bezpieczeństwa — pokazuje górną część rozkładu w wybranym okresie. P95 i P99 pozwalają skupić się na rzadszych zdarzeniach.

### 3. Model monitorowania

Domyślny przepływ `Źródło → Kontrola P90 → Raport przekroczeń` jest wykonywalny. Zmiana pola, percentyla albo kierunku powoduje ponowne obliczenie wyniku po kliknięciu **Uruchom**. Model nie pokazuje statusu „gotowy”, jeżeli brakuje źródła, pola czasu, analizowanej kolumny lub połączenia z wynikiem.

## Ważne zastrzeżenie

Percentyl opisuje rozkład danych, ale sam nie określa zagrożenia technologicznego ani limitu bezpieczeństwa. Poziom alertu i opis konsekwencji powinny zostać ustawione przez osobę znającą proces. Dla bardzo dużych plików, których wykres korzysta z próbki, percentyl jest w interfejsie oznaczany jako orientacyjny.
