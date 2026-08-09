# Changelog

Wszystkie istotne zmiany w Eyes of Odin są dokumentowane w tym pliku. Format jest zgodny z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), a wersje używają [Semantic Versioning](https://semver.org/).

## [0.1.1] — 2026-08-09

### Dodano

- pełny jasny motyw Aurora obejmujący stronę główną, dane, model, wykresy, porównania, ścieżki i okna dialogowe,
- przesuwanie pustego obszaru modelu lewym przyciskiem myszy bez blokowania przeciągania węzłów,
- ręczne zmienianie szerokości Eksploratora i Inspektora oraz wysokości panelu wyników,
- lokalne zapamiętywanie rozmiarów paneli,
- osobny tryb „Pusty projekt” bez przykładowych danych, wykresów i bloków,
- pełny zapis sesji w IndexedDB razem z danymi, wykresami, modelem, scenariuszami, aktywnym widokiem i położeniem płótna.

### Zmieniono

- uproszczono stronę startową i usunięto dolną sekcję szybkiego startu,
- powiększono obszar wykresów; cztery wykresy wykorzystują układ 2 × 2 w obrębie jednego ekranu,
- zmniejszono nagłówki i paski narzędzi pulpitu, aby przeznaczyć więcej miejsca na dane,
- przycisk „Kontynuuj pracę” pojawia się tylko wtedy, gdy istnieje rzeczywista zapisana praca,
- import ze strony startowej rozpoczyna nowy projekt, a nie modyfikuje po cichu poprzedniej sesji,
- wspólny numer wersji interfejsu jest utrzymywany w jednym module.

### Naprawiono

- automatyczne pokazywanie `sprzedaz_2026.csv` w nowym projekcie,
- nadpisywanie zapisu projektu demonstracyjnym stanem podczas samego uruchamiania aplikacji,
- niepełne przywracanie sesji, które wcześniej pomijało wiersze i metadane wczytanego pliku,
- ciemne kafle i kontrolki pozostające w jasnym motywie,
- zbyt małą wysokość wykresów i konieczność przewijania pulpitu z czterema wykresami,
- brak możliwości przesuwania rozbudowanego grafu lewym przyciskiem myszy.

## [0.1.0] — 2026-08-09

### Dodano

- centrum ustawień podzielone na wygląd, język, przestrzeń roboczą i informacje o aplikacji,
- motywy Odin Dark, Midnight i Graphite oraz cztery dostępne kolory akcentu,
- język polski i angielski z lokalnym zapamiętywaniem wyboru,
- wygodną i kompaktową gęstość interfejsu oraz opcję ograniczenia animacji,
- przyciąganie bloków modelu do siatki z możliwością wyłączenia,
- automatyczne, deterministyczne rozmieszczanie modelu i dopasowanie grafu do ekranu,
- przycisk sprawdzania najnowszych wydań GitHub bezpośrednio w ustawieniach,
- automatyczny workflow GitHub Release tworzący instalator, wersję portable i sumy SHA-256,
- skrypt `package-release.ps1` przygotowujący kompletny zestaw plików wydania,
- uproszczoną stronę główną z szybkim importem, kontynuacją pracy i przykładowym pulpitem,
- przyciski pobierania oraz aktualizacji w README,
- instalowanie najnowszego builda wydania przez skrypt `install.ps1`, również gdy numer nadal wynosi 0.1.0,
- podsumowanie ostatniej wartości, średniej i zakresu na kafelkach wykresów,
- lokalną aplikację desktopową dla Windows opartą na Tauri,
- import i profilowanie 13 formatów: CSV, TSV, TXT, JSON, JSONL, NDJSON, XLS, XLSX, XLSM, XLSB, ODS, FODS i Parquet,
- strumieniowe odczytywanie dużych plików tekstowych, JSON Lines i Parquet,
- obsługę popularnych kompresji Parquet,
- wybór arkusza w skoroszytach zawierających wiele zakładek,
- fragmentowe przetwarzanie dużych plików oraz lokalny magazyn IndexedDB,
- wykresy liniowe, słupkowe, obszarowe, punktowe i histogramy,
- dowolne mapowanie pól X i Y oraz obsługę kilku wartości Y,
- filtrowanie, agregowanie, dzielenie na serie i porównywanie różnic,
- wybór zakresu czasu od–do dla każdego wykresu,
- synchronizowanie punktu czasu między wykresami,
- dolne i górne limity kontrolne,
- raportowanie dokładnych zdarzeń poniżej i powyżej limitu,
- eksport raportu przekroczeń do CSV,
- pulpity 1, 4, 9 i układ własny,
- zapisywanie, eksportowanie oraz importowanie szablonów pulpitu,
- dopasowanie nazw kolumn podczas używania szablonu z innym plikiem,
- wizualny graf źródeł, transformacji, decyzji i wyników,
- warianty scenariuszy oraz porównanie z wariantem bazowym,
- lokalny zapis przestrzeni roboczej i paletę poleceń `Ctrl+K`,
- zestawy demonstracyjne 5-, 10- i 15-minutowe w CSV oraz XLSX,
- skrypt instalacji Windows jedną komendą,
- automatyczne kontrole TypeScript, ESLint, Rust fmt/clippy oraz warunkowe Ruff/mypy.

### Zmieniono

- zaktualizowano wszystkie odnośniki pobierania i aktualizacji do docelowego repozytorium `Kitori777/EOD`,
- przebudowano ustawienia z małego okna trzech przełączników na czytelne centrum konfiguracji,
- nowe bloki są umieszczane w pierwszym wolnym miejscu zamiast przy stałej prawej krawędzi płótna,
- płótno modelu dynamicznie dopasowuje rozmiar do zawartości,
- README prowadzi użytkownika osobno przez instalator, jedną komendę i wersję portable,
- najważniejsze elementy strony głównej i przestrzeni roboczej reagują na wybrany język,
- import CSV, TSV i TXT korzysta z kontrolowanego workera zgodnego z aplikacją desktopową,
- po wczytaniu danych o innym schemacie aplikacja tworzy zgodne wykresy początkowe zamiast zachowywać nieistniejące pola,
- Eksplorator, Inspektor i panel wyników można niezależnie ukrywać, przywracać i zapamiętywać,
- dolne skróty otwierają rzeczywiste ustawienia widoku oraz pomoc aplikacji,
- przycisk eksportu porównania zapisuje rzeczywisty raport CSV,
- Visual Lab otwiera się w trybie skupienia bez eksploratora, inspektora i dolnego panelu,
- kreator wykresu został przeniesiony do wysuwanego panelu z dużym podglądem na żywo,
- poprawiono czytelność osi, legend, podpowiedzi, punktów, limitów i obszarów bezpiecznych,
- działania kafelka wykresu zebrano w krótkim menu kontekstowym,
- README nie zawiera już dużego, szybko dezaktualizującego się zrzutu aplikacji,
- status wersji 0.1.0 opisuje rozwój przed pierwszą publikacją,
- uporządkowano kod w modułach `app`, `charts`, `data` i `modeling`,
- przeniesiono właściwe repozytorium Eyes of Odin do katalogu głównego projektu,
- wydzielono obliczenia scenariuszy z głównego komponentu interfejsu,
- uproszczono zależności do stosu faktycznie wymaganego przez aplikację desktopową,
- ujednolicono wszystkie elementy produktu pod numerem wersji 0.1.0.

### Naprawiono

- kolejność kontroli CI na czystym komputerze GitHub: interfejs jest teraz budowany przed testami sprawdzającymi `desktop-dist`,
- ostrzeżenie GitHub Actions o przestarzałym środowisku Node.js 20 przez aktualizację oficjalnych akcji do wersji opartych na Node.js 24,
- nakładanie się kolejnych źródeł, transformacji i decyzji po prawej stronie modelu,
- przywracanie zapisanej przestrzeni z blokami znajdującymi się w tym samym miejscu,
- brak szybkiego sposobu uporządkowania i dopasowania rozbudowanego grafu,
- niekompletną ścieżkę publikacji, w której README wskazywał GitHub Releases bez procesu tworzącego wydanie,
- zawieszanie importu CSV na 0% w desktopowym WebView,
- niedziałające anulowanie przed otrzymaniem pierwszej porcji danych oraz podczas sprawdzania arkusza,
- brak informacji o importowanym pliku i stanie anulowania,
- możliwość pozostawienia częściowych danych po błędzie albo anulowaniu importu,
- brak limitu czasu i komunikatu dla zablokowanego magazynu IndexedDB,
- pustą czarną przestrzeń pod pulpitem wykresów,
- niedziałające zamykanie Inspektora oraz zamykanie i maksymalizowanie panelu wyników,
- widoczne kontrolki kart i paska narzędzi, które sugerowały niezaimplementowane działanie.

### Usunięto

- stale widoczny konfigurator z głównego pulpitu wykresów,
- nieużywany szablon Next.js/Vinext,
- konfigurację Cloudflare, Wrangler i OpenAI Sites,
- nieużywaną bazę Drizzle i przykładowe endpointy D1,
- zależności Tailwind niewykorzystywane przez interfejs,
- wewnętrzne, błędnie oznaczone wydania 0.2.0 i 0.3.0,
- lokalne pozostałości niepowiązanego repozytorium SklepInternetowy, stare środowisko Python, cache pnpm i ustawienia IDE.

### Bezpieczeństwo i prywatność

- importowane dane są przetwarzane lokalnie,
- instalator pobierany skryptem jest weryfikowany sumą SHA-256,
- aplikacja używa wyłącznie podstawowych uprawnień okna Tauri.
