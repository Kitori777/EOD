# Changelog

Wszystkie istotne zmiany w Eyes of Odin są dokumentowane w tym pliku. Format jest zgodny z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), a wersje używają [Semantic Versioning](https://semver.org/).

## [0.1.3] — 2026-09-15

### Dodano

- osobną pracownię regresji OLS z wyborem jednej zmiennej objaśnianej `Y` i wielu zmiennych objaśniających `X`,
- pełne równanie `ŷ = β₀ + β₁X₁ + β₂X₂`, tabelę współczynników, błędów standardowych, statystyk t, p-value i 95-procentowych przedziałów ufności,
- podsumowanie R², skorygowanego R², RMSE, MAE, statystyki Durbin–Watsona, liczebności próby i pominiętych obserwacji,
- generowaną interpretację wyniku, miejsce na własne uzasadnienie analityka oraz ostrzeżenie przed traktowaniem zależności jako dowodu przyczynowości,
- kod Python `statsmodels` odpowiadający aktualnej specyfikacji modelu, gotowy do skopiowania,
- symulację zmiany wybranego predyktora przy utrzymaniu pozostałych zmiennych na wartościach średnich,
- trwały zapis konfiguracji OLS i scenariusza w dziewiątej wersji przestrzeni roboczej,
- mapy wejścia do kodu w `src/README.md`, `src/app/README.md`, `src/mechanics/README.md` oraz dokumentację modułu ekonometrycznego.
- przewodnik OLS dla osób bez przygotowania ekonometrycznego, objaśniający role `Y`, `X`, `β`, p-value, reszt i VIF,
- zwijany przebieg estymacji od macierzy danych przez `β̂ = (XᵀX)⁻¹Xᵀy` do reszt i oceny niepewności,
- test F całego modelu, standardowy błąd reszt, diagnostykę VIF oraz wykresy wartości przewidywanych i reszt.

### Zmieniono

- wydzielono matematykę ekonometryczną do jednego modułu `src/mechanics/econometrics`, rozdzielając algebrę liniową, statystykę, typy i silniki estymacji,
- obszar Model ma teraz cztery etapy pracy: Budowa, Regresja OLS, Symulacja i Weryfikacja,
- uporządkowano opis architektury, aby rozróżniał modelowanie, symulację i ekonometrię.

### Naprawiono

- czytelne odrzucanie stałych, niekompletnych i współliniowych danych wejściowych przed uruchomieniem wielowymiarowego OLS.

## [0.1.2] — 2026-08-26

### Dodano

- edytowalne i lokalnie zapisywane nazwy projektu oraz modelu, widoczne również w nazwie zakładki `.odin`,
- kreskowane linie percentylowe P75/P90/P95/P99 z wyborem kierunku i poziomu alertu,
- raport całych zdarzeń przekroczeń z czasem, liczbą próbek, zakresem wartości i największym odchyleniem,
- wykonywalny model `Źródło → Reguła → Wynik` dla danych procesowych wraz z walidacją konfiguracji,
- cztery gotowe wykresy i scenariusz prezentacyjny dla pliku `eyes_of_odin_5_minutes.csv`,
- laboratorium „Co-jeśli” pozwalające zmieniać wartości, procenty, grupy i zakresy czasu bez modyfikowania danych źródłowych,
- wspólną przestrzeń **Model i symulacja** z trzema trybami: Budowa, Symulacja i Weryfikacja,
- przeliczenie każdego wariantu tym samym wykonywalnym grafem co wynik bazowy oraz porównanie końcowych metryk i alertów,
- techniczną weryfikację danych i grafu bez oceniania, czy wybrany wariant jest biznesowo dobry,
- automatyczną analizę wpływu zmiany na wszystkie kolumny liczbowe wraz z korelacją, R², MAE i liczebnością próby,
- tabelę wpływu `przed / po zmianie / różnica / różnica % / sposób obliczenia` z filtrowaniem kolumn zmienionych i niezmienionych,
- przełączanie porównywanej kolumny przez kliknięcie wiersza tabeli oraz przyciski poprzednia/następna,
- prognozy trendu liniowego, średniej kroczącej i wygładzania wykładniczego z horyzontem oraz granicami niepewności,
- diagnostykę braków, stałych pól, wartości odstających, korelacji i możliwych opóźnień między zmiennymi,
- prosty werdykt jakości pliku, opisane działania, kontrolę spójności czasu i szczegóły wybranego pola,
- wykresy pudełkowe, mapy cieplne, Pareto, waterfall, wykresy kontrolne i prognozy,
- interaktywne zaznaczanie fragmentów wykresu oraz porównanie wartości bazowych z wariantem po zmianie,
- lokalny zapis scenariuszy „Co-jeśli” oraz relacji wpływu w ósmej wersji przestrzeni roboczej z migracją wcześniejszych sesji.
- własne formuły w kreatorze wykresów, z wyborem kolumn i funkcjami matematycznymi,
- dokładne filtrowanie wykresu według dnia i godziny,
- zapis pojedynczego wykresu do pliku PNG albo JPG bezpośrednio z menu kafelka.
- semantyczne rozpoznawanie produkcyjnych nazw pól, urządzeń i ról sygnałów, w tym wariantów `Setpoint/SP`, `Process_Value/PV`, `Output`, `Correction` i `Offset`,
- kaskadowy silnik wpływu przeliczający kolejne etapy modelu wraz z opóźnieniem, źródłem relacji i śladem każdej zmiany,
- edytowalną mapę wpływu z ręcznym współczynnikiem oraz opóźnieniem dla relacji, których nie da się wiarygodnie wyznaczyć z historii,
- automatyczne wykrywanie dokładnych zależności `Correction = Setpoint - Process_Value` w danych produkcyjnych.
- nazwane stałe modelu z wartością, jednostką i opisem, dostępne w formułach przez składnię `{{Nazwa}}`,
- edytowalną listę kontrolną z wyborem obszarów i poziomów komunikatów oraz własnymi punktami i stanem wykonania,
- projektowy konfigurator diagnostyki z wyborem sekcji, kart podsumowania, rodzajów wniosków i monitorowanych kolumn.
- pełny tryb edycji grafu: łączenie bloków bezpośrednio na płótnie, zaznaczanie relacji, odwracanie kierunku, duplikowanie bloków i cofanie usunięcia.
- estymację zależności w symulacji metodami OLS/ARX z automatycznym doborem opóźnienia, kontrolą bezwładności procesu i opcjonalnym trendem czasu,
- panel kontroli ekonometrycznej pokazujący współczynnik β, odporny błąd standardowy, p-value, 95-procentowy przedział ufności, walidacyjne R²/MAE oraz statystykę Durbin–Watsona.
- zapisany w scenariuszu wybór modelu ekonometrycznego: automatyczny, OLS, ARX albo ARX z trendem, rzeczywiście używany przy estymacji każdej relacji.
- błędy standardowe HAC/Newey–West dla szeregów czasowych, odporne jednocześnie na zmienną wariancję i krótkookresową autokorelację reszt.
- jednoklikowe profile zachowania procesu oraz wybór maksymalnego opóźnienia od 0 do 24 rekordów w każdym scenariuszu.
- konserwatywną korektę istotności za automatyczne przeglądanie wielu modeli i opóźnień, wykonywaną przed korektą `q` dla wielu kolumn.

### Zmieniono

- diagnostyka prowadzi teraz użytkownika przez trzy czytelne widoki: Podsumowanie, Do sprawdzenia oraz Pola i zależności,
- na początku diagnostyki pojawia się jeden priorytetowy następny krok z bezpośrednim przejściem do właściwego pola, modelu albo symulacji,
- strona startowa otrzymała zwarty układ bento z większym trendem, listą alertów, histogramem i zdarzeniami widocznymi jednocześnie,
- poprawiono hierarchię działań na starcie: wczytanie pliku pozostaje główne, kontynuowanie pokazuje kontekst ostatniej sesji, a pusty projekt jest spokojną akcją dodatkową,
- zmniejszono nadmiar pustej przestrzeni oraz dopracowano tło, karty, typografię i układ responsywny strony startowej,
- status „Model gotowy” zależy teraz od rzeczywistych pól i połączeń, a przycisk „Uruchom” wykonuje skonfigurowane reguły danych,
- kreator pokazuje linie odniesienia i alerty jako osobną, zrozumiałą sekcję zamiast ukrytych pól minimum/maksimum,
- widok „Porównaj” został przebudowany z prostego zestawienia dwóch średnich w pełne laboratorium symulacji,
- osobna pozycja „Co-jeśli” została połączona z modelem, aby budowa, test wariantu i kontrola gotowości tworzyły jeden proces,
- bezużyteczny widok „Przepływ” został zastąpiony widokiem „Diagnostyka”,
- diagnostyka pokazuje teraz również problemy blokujące uruchomienie grafu, pokrycie transformacji, ekstrapolację i jakość przewidywań,
- kreator wykresów grupuje nowe formy analityczne i udostępnia ustawienia prognozy oraz granic kontrolnych,
- aplikacja wyraźnie odróżnia zmianę bezpośrednią, dokładne przeliczenie, ręcznie opisaną relację i estymację; nie przedstawia korelacji jako związku przyczynowego,
- lokalny format przestrzeni roboczej został rozszerzony do wersji ósmej i zapisuje ręczne relacje, stałe modelu, listę kontrolną oraz układ diagnostyki.
- symulacja nie wyświetla już punktowej oceny ani werdyktu „dobry/słaby wariant”; pozostawia użytkownikowi ocenę planu i pokazuje wyłącznie policzone skutki oraz techniczne ostrzeżenia,
- menu każdego wykresu udostępnia teraz edycję także w zagęszczonych układach pulpitu.
- pasek kontekstowy modelu pokazuje działania właściwe dla wybranego bloku lub relacji, a menu „Blok” pozwala wybrać konkretny rodzaj elementu.
- relacje historyczne są teraz uczone wyłącznie na wcześniejszych rekordach i sprawdzane na późniejszym fragmencie czasu; model dynamiczny przenosi również efekt opóźniony i wygasający.
- automatyczne relacje korzystają z najnowszego okna 360 obserwacji, zachowują chronologiczną walidację i korygują istotność statystyczną `q` przy jednoczesnym badaniu wielu kolumn,
- podglądy symulacji ograniczają liczbę rysowanych punktów bez zmiany obliczeń, a wynik niezmienionego scenariusza jest ponownie wykorzystywany przy przełączaniu widoków.

### Naprawiono

- fałszywe odrzucanie niemal idealnych relacji, gdy statystyka Durbin–Watsona była liczona z reszt mniejszych od precyzji numerycznej.

- dolny alert percentylowy: poziom 90% korzysta teraz z dolnej granicy P10, zamiast błędnie oznaczać prawie 90% danych znajdujących się poniżej P90,
- wyświetlanie kilku linii odniesienia dla tej samej serii na jednym wykresie,
- brak informacji o zachowaniu pozostałych wartości po zmianie danych wejściowych,
- brak oceny wiarygodności przewidywanych rezultatów,
- kosmetyczny widok przepływu niepowiązany z realną diagnostyką wczytanego pliku,
- błędne traktowanie każdej stałej nastawy jako problemu krytycznego; stałe pola są teraz informacją kontekstową,
- niezrozumiałą macierz korelacji jako główny widok; relacje są teraz objaśnione zwykłym językiem, a macierz znajduje się w analizie zaawansowanej.
- zmianę tylko jednej kolumny bez przekazywania jej efektu do następnych etapów modelu,
- możliwość wielokrotnego naliczania skutku w relacjach tworzących pętlę.
- niedziałający przycisk „Relacja”, brak możliwości zaznaczania linii oraz usuwania źródła i osieroconych bloków.
- zawyżoną jakość relacji wynikającą z oceniania modelu na tych samych rekordach, na których został dopasowany,
- mylenie wspólnego trendu dwóch sygnałów ze stabilną reakcją procesu.
- przesuwanie opóźnionej reakcji do niewłaściwego rekordu, gdy wiersze źródłowe nie były zapisane w kolejności czasu.

## [0.1.1] — 2026-08-09

### Dodano

- pełny jasny motyw Aurora obejmujący stronę główną, dane, model, wykresy, porównania, ścieżki i okna dialogowe,
- przesuwanie pustego obszaru modelu lewym przyciskiem myszy bez blokowania przeciągania węzłów,
- ręczne zmienianie szerokości Eksploratora i Inspektora oraz wysokości panelu wyników,
- lokalne zapamiętywanie rozmiarów paneli,
- osobny tryb „Pusty projekt” bez przykładowych danych, wykresów i bloków,
- pełny zapis sesji w IndexedDB razem z danymi, wykresami, modelem, scenariuszami, aktywnym widokiem i położeniem płótna.
- rozbudowane opcje wyglądu wykresów: palety i własne kolory, przebieg oraz grubość linii, etykiety, legenda, siatka, punkty, orientacja i kumulowanie słupków,
- porównywanie dwóch kolumn albo dwóch grup/okresów bezpośrednio z aktualnego pliku,
- widok rzeczywistego przepływu danych od pliku przez operacje do wykresów.

### Zmieniono

- uproszczono stronę startową i usunięto dolną sekcję szybkiego startu,
- powiększono obszar wykresów; cztery wykresy wykorzystują układ 2 × 2 w obrębie jednego ekranu,
- zmniejszono nagłówki i paski narzędzi pulpitu, aby przeznaczyć więcej miejsca na dane,
- przycisk „Kontynuuj pracę” pojawia się tylko wtedy, gdy istnieje rzeczywista zapisana praca,
- import ze strony startowej rozpoczyna nowy projekt, a nie modyfikuje po cichu poprzedniej sesji,
- wspólny numer wersji interfejsu jest utrzymywany w jednym module.
- widok „Porównaj” przelicza wynik natychmiast po zmianie pól, grupy lub agregacji,
- scenariusze sprzedażowe są pokazywane wyłącznie plikom zawierającym rzeczywiste pola przychodu i kosztu.

### Naprawiono

- automatyczne pokazywanie `sprzedaz_2026.csv` w nowym projekcie,
- nadpisywanie zapisu projektu demonstracyjnym stanem podczas samego uruchamiania aplikacji,
- niepełne przywracanie sesji, które wcześniej pomijało wiersze i metadane wczytanego pliku,
- ciemne kafle i kontrolki pozostające w jasnym motywie,
- zbyt małą wysokość wykresów i konieczność przewijania pulpitu z czterema wykresami,
- brak możliwości przesuwania rozbudowanego grafu lewym przyciskiem myszy.
- czarne przyciski wyboru kolumn pozostające w kreatorze wykresów w jasnym motywie,
- fikcyjne wartości sprzedaży, klientów i ścieżek DACH wyświetlane dla niezwiązanych plików przemysłowych.

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
