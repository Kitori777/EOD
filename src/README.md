# Mapa kodu źródłowego

Jeśli wchodzisz do projektu pierwszy raz, zacznij od obszaru odpowiadającego zadaniu:

| Obszar | Odpowiedzialność | Typowe miejsce startu |
| --- | --- | --- |
| `app/` | stan aplikacji, ekrany, ustawienia, pomoc i style | `app/EyesOfOdin.tsx` |
| `desktop/` | uruchomienie interfejsu w Vite i Tauri | `desktop/main.tsx` |
| `mechanics/data/` | rozpoznawanie, import i lokalne przechowywanie danych | `mechanics/data/importers/file-import.ts` |
| `mechanics/charts/` | budowanie wykresów, limity i raporty | `mechanics/charts/engine/chart-engine.ts` |
| `mechanics/modeling/` | graf modelu, formuły, wykonanie i układ bloków | `mechanics/modeling/engine/model-execution-engine.ts` |
| `mechanics/simulation/` | scenariusze what-if, prognozy i diagnostyka | `mechanics/simulation/engine/what-if-engine.ts` |
| `mechanics/econometrics/` | matematyka oraz dopasowanie modeli OLS i ARX | `mechanics/econometrics/README.md` |
| `mechanics/compare/` | porównywanie zbiorów i wyników | `mechanics/compare/comparison-engine.ts` |

Komponenty prezentują wynik, pliki `engine` wykonują czyste obliczenia, `types` opisują kontrakty, a `storage` odpowiada za trwały zapis. Szczegółowy opis całego projektu znajduje się w głównym pliku `GUIDE.md`.
