# Ekonometria

Ten folder jest jednym miejscem dla matematyki wykorzystywanej do estymowania historycznej reakcji jednej kolumny na drugą. Kod nie odpowiada za interfejs ani za wybór scenariusza użytkownika.

## Gdzie wejść

- `engine/econometric-engine.ts` — publiczny punkt wejścia `fitEconometricResponse(...)`; buduje próbę, porównuje OLS, ARX i ARX z trendem oraz wybiera najlepsze dopasowanie.
- `engine/multivariate-ols-engine.ts` — klasyczny OLS dla jednej zmiennej Y i wielu zmiennych X, test F całego modelu, VIF, dane diagnostyczne reszt oraz symulacja zmiany predyktora.
- `components/OlsStudio.tsx` — pracownia równania, współczynników, interpretacji i scenariusza.
- `math/linear-algebra.ts` — operacje macierzowe używane przez estymator.
- `math/statistics.ts` — konwersja liczb, korelacja oraz funkcje rozkładów normalnego, t-Studenta i F.
- `types/econometric-types.ts` — wewnętrzne kontrakty obserwacji i wyniku.
- `types/ols-types.ts` — specyfikacja, wynik i scenariusz wielowymiarowego OLS.

Komponent `components/OlsStudio.tsx` tłumaczy wynik na dwa poziomy: przewodnik bez żargonu dla początkujących oraz zwijany przebieg matematyczny od macierzy `X` i wektora `y` do współczynników, reszt i niepewności.

## Przepływ

```text
wiersze danych
  -> obserwacje dla kolejnych opóźnień
  -> macierz projektu
  -> estymacja parametrów
  -> błędy HAC i statystyki
  -> walidacja na późniejszych rekordach
  -> najlepszy wynik EconometricFit
```

Korzystającym modułem jest `../simulation/engine/production-dependency-engine.ts`. Testy samej estymacji znajdują się w `tests/econometric-engine.test.mjs`, a testy integracji ze scenariuszem w `tests/what-if-engine.test.mjs`.
