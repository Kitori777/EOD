import { useMemo, useState } from "react";

import { useI18n } from "../../../app/i18n/translations.ts";
import type { ChartColumn, DataRow } from "../../charts/types/chart-types.ts";
import { calculateOlsChange, fitOlsModel } from "../engine/multivariate-ols-engine.ts";
import type { OlsChangeScenario, OlsDiagnosticPoint, OlsModelResult, OlsModelSpecification } from "../types/ols-types.ts";

type Props = {
  rows: DataRow[];
  columns: ChartColumn[];
  sampled: boolean;
  specification: OlsModelSpecification;
  scenario: OlsChangeScenario;
  onSpecificationChange: (specification: OlsModelSpecification) => void;
  onScenarioChange: (scenario: OlsChangeScenario) => void;
};

const operationIds: OlsChangeScenario["operation"][] = ["percent", "add", "multiply", "set"];

function quotedPythonField(field: string): string {
  return `Q("${field.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/'/g, "\\'")}")`;
}

function pythonExample(specification: OlsModelSpecification): string {
  const target = quotedPythonField(specification.targetField);
  const predictors = specification.predictorFields.map(quotedPythonField).join(" + ");
  const right = `${specification.includeIntercept ? "" : "0 + "}${predictors}`;
  return `import statsmodels.formula.api as smf\n\nmodel = smf.ols('${target} ~ ${right}', data=df).fit()\nprint(model.summary())`;
}

function equation(result: OlsModelResult, format: (value: number) => string): string {
  const terms = result.coefficients.map((item, index) => {
    const absolute = format(Math.abs(item.coefficient));
    const value = item.field ? `${absolute} · ${item.field}` : absolute;
    if (index === 0) return item.coefficient < 0 ? `−${value}` : value;
    return `${item.coefficient < 0 ? "−" : "+"} ${value}`;
  });
  return `ŷ(${result.targetField}) = ${terms.join(" ")}`;
}

function chartRange(values: number[]): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * .08, Math.abs(maximum || 1) * .02, 1e-9);
  return [minimum - padding, maximum + padding];
}

function OlsDiagnosticChart({ points, kind, title, xLabel, yLabel }: { points: OlsDiagnosticPoint[]; kind: "fit" | "residual"; title: string; xLabel: string; yLabel: string }) {
  const width = 520;
  const height = 205;
  const padding = 32;
  const xValues = points.map((point) => kind === "fit" ? point.actual : point.fitted);
  const yValues = points.map((point) => kind === "fit" ? point.fitted : point.residual);
  const shared = kind === "fit" ? chartRange([...xValues, ...yValues]) : null;
  const [xMinimum, xMaximum] = shared ?? chartRange(xValues);
  const [yMinimum, yMaximum] = shared ?? chartRange([...yValues, 0]);
  const x = (value: number) => padding + (value - xMinimum) / (xMaximum - xMinimum) * (width - padding * 2);
  const y = (value: number) => height - padding - (value - yMinimum) / (yMaximum - yMinimum) * (height - padding * 2);
  return <article className="ols-diagnostic-chart"><strong>{title}</strong><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
    <line className="axis" x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
    <line className="axis" x1={padding} y1={padding} x2={padding} y2={height - padding} />
    {kind === "fit"
      ? <line className="reference" x1={x(xMinimum)} y1={y(xMinimum)} x2={x(xMaximum)} y2={y(xMaximum)} />
      : <line className="reference" x1={padding} y1={y(0)} x2={width - padding} y2={y(0)} />}
    {points.map((point, index) => <circle key={index} cx={x(kind === "fit" ? point.actual : point.fitted)} cy={y(kind === "fit" ? point.fitted : point.residual)} r="2.4" />)}
    <text x={width / 2} y={height - 5} textAnchor="middle">{xLabel}</text>
    <text x="10" y={height / 2} textAnchor="middle" transform={`rotate(-90 10 ${height / 2})`}>{yLabel}</text>
  </svg></article>;
}

export function OlsStudio({ rows, columns, sampled, specification, scenario, onSpecificationChange, onScenarioChange }: Props) {
  const { language, locale } = useI18n();
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const format = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }), [locale]);
  const percent = useMemo(() => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }), [locale]);
  const numeric = columns.filter((column) => column.type === "number");
  const numericNames = numeric.map((column) => column.name);
  const fit = useMemo(() => fitOlsModel(rows, specification), [rows, specification]);
  const result = fit.ready ? fit.result : null;
  const failure = fit.ready ? null : fit;
  const activeScenario = result && result.predictorFields.includes(scenario.predictorField)
    ? scenario
    : { ...scenario, predictorField: result?.predictorFields[0] ?? "" };
  const change = result ? calculateOlsChange(result, activeScenario) : null;
  const [copied, setCopied] = useState(false);

  const togglePredictor = (field: string) => {
    const selected = specification.predictorFields.includes(field);
    onSpecificationChange({
      ...specification,
      predictorFields: selected
        ? specification.predictorFields.filter((item) => item !== field)
        : [...specification.predictorFields, field],
    });
  };
  const updateTarget = (targetField: string) => {
    const predictorFields = specification.predictorFields.filter((field) => field !== targetField);
    onSpecificationChange({ ...specification, targetField, predictorFields });
    if (!predictorFields.includes(scenario.predictorField)) {
      onScenarioChange({ ...scenario, predictorField: predictorFields[0] ?? "" });
    }
  };
  const copyPython = () => {
    if (!navigator.clipboard || !specification.targetField || !specification.predictorFields.length) return;
    void navigator.clipboard.writeText(pythonExample(specification)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };
  const significant = result?.coefficients.filter((item) => item.field && item.pValue < .05) ?? [];
  const uncertain = result?.coefficients.filter((item) => item.field && item.pValue >= .05) ?? [];
  const highVif = result?.coefficients.filter((item) => item.field && item.vif != null && item.vif >= 5) ?? [];
  const pText = (value: number) => value < .001 ? "< 0.001" : format.format(value);

  if (numeric.length < 2) return <div className="ols-empty">
    <span>β</span>
    <h2>{tr("Pracownia regresji OLS", "OLS regression studio")}</h2>
    <p>{tr("Do zbudowania modelu potrzebne są co najmniej dwie kolumny liczbowe: wynik Y i zmienna X.", "At least two numeric fields are required: an outcome Y and a predictor X.")}</p>
  </div>;

  return <div className="ols-view">
    <div className="view-heading compact-heading">
      <div><span className="eyebrow">OLS MODEL STUDIO</span><h2>{tr("Zbuduj i uzasadnij model liniowy", "Build and justify a linear model")}</h2><p>{tr("Wybierz wynik Y i zmienne X. Równanie, statystyki oraz interpretacja aktualizują się automatycznie.", "Choose an outcome Y and predictors X. The equation, statistics and interpretation update automatically.")}</p></div>
      <div className="ols-heading-badges"><span>β OLS</span><span>▦ {tr("lokalnie", "local")}</span>{sampled && <span>{tr("próba danych", "data sample")}</span>}</div>
    </div>

    {sampled && <div className="analysis-notice">{tr("Model korzysta z zapisanej próby analitycznej do 50 000 rekordów.", "The model uses the saved analytical sample of up to 50,000 records.")}</div>}

    <details className="ols-learning-guide" open>
      <summary><span>?</span><div><strong>{tr("Pierwszy raz z ekonometrią?", "New to econometrics?")}</strong><small>{tr("Najważniejsze pojęcia i ich praktyczne zastosowanie", "Core concepts and their practical purpose")}</small></div><b>{tr("Pokaż / ukryj", "Show / hide")}</b></summary>
      <div className="ols-learning-grid">
        <article><span>Y</span><div><strong>{tr("Wynik, który wyjaśniamy", "The outcome we explain")}</strong><p>{tr("To wartość, którą chcesz przewidzieć lub lepiej zrozumieć, np. sprzedaż, zużycie albo jakość.", "The value you want to predict or understand, such as sales, usage or quality.")}</p></div></article>
        <article><span>X</span><div><strong>{tr("Możliwe czynniki", "Possible drivers")}</strong><p>{tr("Zmienne, które mogą pomagać wyjaśnić Y. Model porównuje ich wpływ przy stałych pozostałych X.", "Variables that may help explain Y. The model compares their effects while holding other X variables fixed.")}</p></div></article>
        <article><span>β</span><div><strong>{tr("Siła i kierunek zależności", "Direction and size")}</strong><p>{tr("Dodatnia β oznacza wzrost przewidywanego Y, a ujemna spadek. Wielkość dotyczy zmiany X o jedną jednostkę.", "A positive β raises predicted Y and a negative β lowers it. Its size is for a one-unit change in X.")}</p></div></article>
        <article><span>p</span><div><strong>{tr("Niepewność wyniku", "Result uncertainty")}</strong><p>{tr("Małe p, zwykle poniżej 0,05, utrudnia wyjaśnienie wyniku samym przypadkiem. Nie dowodzi jednak przyczynowości.", "A small p, commonly below 0.05, makes a chance-only explanation less plausible. It does not prove causality.")}</p></div></article>
        <article><span>e</span><div><strong>{tr("Reszta, czyli błąd modelu", "Residual, the model error")}</strong><p>{tr("Różnica między wartością rzeczywistą i przewidywaną. Losowy rozrzut reszt jest lepszy niż widoczny wzór.", "The difference between actual and predicted values. Random residual scatter is better than a visible pattern.")}</p></div></article>
        <article><span>VIF</span><div><strong>{tr("Powtarzające się informacje", "Overlapping information")}</strong><p>{tr("Pokazuje, czy zmienne X mówią prawie to samo. VIF od 5 wymaga uwagi, a od 10 zwykle oznacza poważny problem.", "Shows whether predictors carry nearly the same information. VIF from 5 needs attention; 10 usually signals a serious issue.")}</p></div></article>
      </div>
    </details>

    <div className="ols-builder-grid">
      <section className="ols-specification-panel">
        <header><span>01 · {tr("SPECYFIKACJA", "SPECIFICATION")}</span><strong>{tr("Co model ma objaśnić?", "What should the model explain?")}</strong></header>
        <label>{tr("Zmienna objaśniana Y", "Outcome Y")}<select value={specification.targetField} onChange={(event) => updateTarget(event.target.value)}><option value="">{tr("Wybierz wynik…", "Choose an outcome…")}</option>{numeric.map((column) => <option key={column.name}>{column.name}</option>)}</select></label>
        <div className="ols-predictor-picker"><span>{tr("Zmienne objaśniające X", "Predictors X")}</span><small>{tr("Wybierz jedną lub kilka kolumn. Kolejność odpowiada β₁, β₂, …", "Choose one or more fields. Their order corresponds to β₁, β₂, …")}</small><div>{numericNames.filter((field) => field !== specification.targetField).map((field) => <button type="button" key={field} className={specification.predictorFields.includes(field) ? "active" : ""} onClick={() => togglePredictor(field)}>{specification.predictorFields.includes(field) ? "✓" : "+"} {field}</button>)}</div></div>
        <label className="ols-intercept-toggle"><input type="checkbox" checked={specification.includeIntercept} onChange={(event) => onSpecificationChange({ ...specification, includeIntercept: event.target.checked })} /><span><strong>{tr("Uwzględnij wyraz wolny β₀", "Include intercept β₀")}</strong><small>{tr("Zalecane dla zwykłego modelu OLS.", "Recommended for an ordinary OLS model.")}</small></span></label>
        <label>{tr("Notatka analityka / własne uzasadnienie", "Analyst note / custom rationale")}<textarea value={specification.justification} onChange={(event) => onSpecificationChange({ ...specification, justification: event.target.value })} placeholder={tr("Dlaczego te zmienne znalazły się w modelu? Jak wynik będzie używany?", "Why are these variables in the model? How will the result be used?")} /></label>
      </section>

      <section className={`ols-equation-panel ${result ? "ready" : "blocked"}`}>
        <header><span>02 · {tr("RÓWNANIE", "EQUATION")}</span><strong>{result ? tr("Model został policzony", "Model fitted") : tr("Model wymaga konfiguracji", "Model needs configuration")}</strong></header>
        {result ? <>
          <div className="ols-equation"><small>{tr("Postać oszacowana", "Estimated form")}</small><strong>{equation(result, (value) => format.format(value))}</strong><p>{tr("Każdy współczynnik pokazuje zmianę Y przy wzroście danej zmiennej X o 1, gdy pozostałe X są stałe.", "Each coefficient shows the change in Y for a one-unit increase in its X while the other predictors stay fixed.")}</p></div>
          <div className="ols-python"><div><span>Python · statsmodels</span><button type="button" onClick={copyPython}>{copied ? tr("Skopiowano ✓", "Copied ✓") : tr("Kopiuj kod", "Copy code")}</button></div><pre>{pythonExample(specification)}</pre></div>
        </> : <div className="ols-fit-error"><span>!</span><strong>{failure?.issue}</strong><small>{failure?.usedRows ? `${tr("Kompletne obserwacje", "Complete observations")}: ${failure.usedRows} · ${tr("pominięte", "omitted")}: ${failure.omittedRows}` : tr("Wybierz pola po lewej stronie.", "Choose fields on the left.")}</small></div>}
      </section>
    </div>

    {result && <>
      <details className="ols-math-walkthrough" open>
        <summary><div><span>03 · {tr("JAK POWSTAJE WYNIK", "HOW THE RESULT IS BUILT")}</span><strong>{tr("Od danych do równania — krok po kroku", "From data to equation, step by step")}</strong></div><b>{tr("Pokaż / ukryj matematykę", "Show / hide the math")}</b></summary>
        <div className="ols-math-flow">
          <article><span>1</span><div><strong>{tr("Budujemy y oraz macierz X", "Build y and the X matrix")}</strong><code>y: {result.usedRows} × 1 · X: {result.usedRows} × {result.predictorFields.length + Number(result.includeIntercept)}</code><p>{tr("Każdy kompletny wiersz staje się jedną obserwacją. X zawiera wybrane czynniki, a y obserwowany wynik.", "Each complete row becomes one observation. X contains the chosen predictors and y the observed outcome.")}</p></div></article>
          <i>→</i>
          <article><span>2</span><div><strong>{tr("Szukamy najlepszych współczynników", "Find the best coefficients")}</strong><code>β̂ = (XᵀX)⁻¹Xᵀy</code><p>{tr("OLS wybiera takie β, aby suma kwadratów błędów była możliwie najmniejsza.", "OLS chooses β values that minimize the sum of squared errors.")}</p></div></article>
          <i>→</i>
          <article><span>3</span><div><strong>{tr("Liczymy przewidywania i reszty", "Calculate predictions and residuals")}</strong><code>ŷ = Xβ̂ · e = y − ŷ</code><p>{tr("ŷ jest wynikiem przewidywanym, a e pokazuje, o ile model pomylił się dla obserwacji.", "ŷ is the prediction and e shows the model error for each observation.")}</p></div></article>
          <i>→</i>
          <article><span>4</span><div><strong>{tr("Oceniamy niepewność", "Assess uncertainty")}</strong><code>SE → t = β̂ / SE → p → 95% CI</code><p>{tr("Błąd standardowy i test t mówią, jak precyzyjnie oszacowano każdy współczynnik.", "The standard error and t test show how precisely each coefficient was estimated.")}</p></div></article>
        </div>
      </details>

      <section className="ols-metrics">
        <article><span>R²</span><strong>{format.format(result.rSquared)}</strong><small>{tr("dopasowanie w próbie", "in-sample fit")}</small></article>
        <article><span>{tr("Skorygowane R²", "Adjusted R²")}</span><strong>{format.format(result.adjustedRSquared)}</strong><small>{tr("z karą za liczbę X", "penalized for predictor count")}</small></article>
        <article><span>{tr("Test całego modelu", "Whole-model test")}</span><strong>F = {Number.isFinite(result.fStatistic) ? format.format(result.fStatistic) : "∞"}</strong><small>p {pText(result.fPValue)} · {result.fPValue < .05 ? tr("model istotny", "model significant") : tr("brak mocnego wyniku", "no strong result")}</small></article>
        <article><span>{tr("Błąd reszt", "Residual error")}</span><strong>{format.format(result.residualStandardError)}</strong><small>{tr("odchylenie błędów modelu", "spread of model errors")}</small></article>
        <article><span>RMSE</span><strong>{format.format(result.rmse)}</strong><small>{tr("typowy błąd modelu", "typical model error")}</small></article>
        <article><span>MAE</span><strong>{format.format(result.mae)}</strong><small>{tr("średni błąd bezwzględny", "mean absolute error")}</small></article>
        <article><span>Durbin–Watson</span><strong>{result.durbinWatson == null ? "—" : format.format(result.durbinWatson)}</strong><small>{tr("2 oznacza mniej autokorelacji", "2 indicates less autocorrelation")}</small></article>
        <article><span>n</span><strong>{result.usedRows.toLocaleString(locale)}</strong><small>{result.omittedRows ? `${result.omittedRows} ${tr("pominięto", "omitted")}` : tr("bez pominięć", "none omitted")}</small></article>
      </section>

      <section className="ols-coefficients">
        <header><div><span>04 · {tr("WSPÓŁCZYNNIKI", "COEFFICIENTS")}</span><strong>{tr("Tabela wyników jak w podsumowaniu OLS", "Results table like an OLS summary")}</strong></div><small>df = {result.degreesOfFreedom}</small></header>
        <div className="ols-coefficient-table"><div className="ols-coefficient-head"><span>{tr("Zmienna", "Term")}</span><span>β</span><span>SE</span><span>t</span><span>p</span><span>95% CI</span><span>VIF</span><span>{tr("Wniosek", "Finding")}</span></div>{result.coefficients.map((item) => <div className="ols-coefficient-row" key={item.term}><strong>{item.field ? `β${result.predictorFields.indexOf(item.field) + 1} · ${item.term}` : "β₀ · const"}</strong><span>{format.format(item.coefficient)}</span><span>{format.format(item.standardError)}</span><span>{format.format(item.tStatistic)}</span><span>{pText(item.pValue)}</span><span>{format.format(item.confidenceLower)} … {format.format(item.confidenceUpper)}</span><span>{item.vif == null ? "—" : Number.isFinite(item.vif) ? format.format(item.vif) : "∞"}</span><b className={item.pValue < .05 ? "significant" : "uncertain"}>{item.pValue < .05 ? tr("istotna", "significant") : tr("niepewna", "uncertain")}</b></div>)}</div>
      </section>

      <section className="ols-diagnostics">
        <header><div><span>05 · {tr("DIAGNOSTYKA MODELU", "MODEL DIAGNOSTICS")}</span><strong>{tr("Sprawdź, gdzie model się myli", "See where the model misses")}</strong></div><small>{result.diagnosticPoints.length} {tr("punktów podglądu", "preview points")}</small></header>
        <div className="ols-diagnostic-summary">
          <article className={result.fPValue < .05 ? "good" : "attention"}><span>F</span><div><strong>{tr("Czy model jako całość coś wyjaśnia?", "Does the model explain anything overall?")}</strong><p>{result.fPValue < .05 ? tr(`p ${pText(result.fPValue)}: zestaw zmiennych X wnosi informację o Y.`, `p ${pText(result.fPValue)}: the predictors jointly add information about Y.`) : tr(`p = ${pText(result.fPValue)}: cały zestaw X nie daje mocnego wyniku na poziomie 0,05.`, `p = ${pText(result.fPValue)}: the predictor set is not strong at the 0.05 level.`)}</p></div></article>
          <article className={highVif.length ? "attention" : "good"}><span>VIF</span><div><strong>{tr("Czy zmienne X się powtarzają?", "Do predictors overlap?")}</strong><p>{highVif.length ? tr(`Sprawdź: ${highVif.map((item) => item.field).join(", ")}. VIF ≥ 5 może destabilizować β.`, `Review: ${highVif.map((item) => item.field).join(", ")}. VIF ≥ 5 may destabilize β.`) : tr("Wszystkie VIF są poniżej 5 — nie widać silnej współliniowości.", "All VIF values are below 5 — no strong multicollinearity signal.")}</p></div></article>
          <article className={Math.abs(result.residualMean) <= Math.max(result.residualStandardError * .05, 1e-9) ? "good" : "attention"}><span>ē</span><div><strong>{tr("Czy błędy są wycentrowane?", "Are errors centered?")}</strong><p>{tr(`Średnia reszta wynosi ${format.format(result.residualMean)}. Przy wyrazie wolnym powinna być bliska zeru.`, `The mean residual is ${format.format(result.residualMean)}. With an intercept it should be near zero.`)}</p></div></article>
        </div>
        <div className="ols-diagnostic-plots">
          <OlsDiagnosticChart points={result.diagnosticPoints} kind="fit" title={tr("Rzeczywiste a przewidywane", "Actual vs predicted")} xLabel={tr("wartość rzeczywista", "actual value")} yLabel={tr("przewidywanie ŷ", "prediction ŷ")} />
          <OlsDiagnosticChart points={result.diagnosticPoints} kind="residual" title={tr("Reszty względem przewidywań", "Residuals vs predictions")} xLabel={tr("przewidywanie ŷ", "prediction ŷ")} yLabel={tr("reszta e", "residual e")} />
        </div>
        <p className="ols-diagnostic-help">{tr("Na pierwszym wykresie punkty blisko przekątnej oznaczają trafniejsze przewidywania. Na drugim szukaj losowej chmury wokół zera — łuk, lejek lub pasma mogą oznaczać, że model liniowy pomija ważny wzorzec.", "On the first chart, points near the diagonal indicate better predictions. On the second, look for a random cloud around zero — curves, funnels or bands may mean the linear model misses an important pattern.")}</p>
      </section>

      <section className="ols-interpretation">
        <header><span>06 · {tr("INTERPRETACJA I UZASADNIENIE", "INTERPRETATION AND RATIONALE")}</span><strong>{tr("Co można powiedzieć na podstawie tego wyniku", "What this result supports")}</strong></header>
        <div className="ols-interpretation-grid">
          <article><span>R²</span><p>{tr("Model opisuje", "The model accounts for")} <strong>{percent.format(Math.max(0, Math.min(1, result.rSquared)))}</strong> {tr("zróżnicowania Y w użytej próbie.", "of the variation in Y in the analyzed sample.")}</p></article>
          <article><span>β</span><p>{significant.length ? tr(`${significant.length} z ${result.predictorFields.length} zmiennych X ma p < 0,05 przy kontroli pozostałych zmiennych.`, `${significant.length} of ${result.predictorFields.length} predictors have p < 0.05 while controlling for the others.`) : tr("Żadna zmienna X nie ma p < 0,05. Wyniku nie należy używać jako mocnego uzasadnienia wpływu.", "No predictor has p < 0.05. Do not use the result as strong evidence of an effect.")}</p></article>
          <article><span>DW</span><p>{result.durbinWatson == null ? tr("Reszty są zbyt małe, aby policzyć statystykę Durbin–Watsona.", "Residuals are too small to calculate Durbin–Watson.") : result.durbinWatson >= 1.5 && result.durbinWatson <= 2.5 ? tr("Durbin–Watson jest blisko 2; nie widać silnego sygnału autokorelacji reszt.", "Durbin–Watson is near 2; there is no strong residual autocorrelation signal.") : tr("Durbin–Watson jest daleko od 2. Sprawdź zależność reszt w czasie.", "Durbin–Watson is far from 2. Inspect residual dependence over time.")}</p></article>
          <article className="caution"><span>!</span><p>{tr("Model pokazuje warunkową zależność w danych, a nie automatyczny dowód przyczynowości. Przed decyzją sprawdź jakość danych, reszty i sens domenowy zmiennych.", "The model shows a conditional association in the data, not automatic proof of causality. Check data quality, residuals and domain meaning before making a decision.")}</p></article>
        </div>
        {uncertain.length > 0 && <p className="ols-uncertain-note">{tr("Zmienne o niepewnym wyniku", "Predictors with uncertain estimates")}: {uncertain.map((item) => item.field).join(" · ")}</p>}
        {specification.justification && <div className="ols-analyst-note"><span>{tr("Twoje uzasadnienie", "Your rationale")}</span><p>{specification.justification}</p></div>}
      </section>

      <section className="ols-scenario">
        <header><div><span>07 · {tr("SYMULACJA WSPÓŁCZYNNIKA", "COEFFICIENT SCENARIO")}</span><strong>{tr("Wybierz, co chcesz zwiększyć lub ustawić", "Choose what to increase or set")}</strong><small>{tr("Pozostałe zmienne są utrzymywane na ich średnich wartościach.", "Other predictors are held at their mean values.")}</small></div></header>
        <div className="ols-scenario-controls">
          <label>{tr("Zmienna X", "Predictor X")}<select value={activeScenario.predictorField} onChange={(event) => onScenarioChange({ ...scenario, predictorField: event.target.value })}>{result.predictorFields.map((field) => <option key={field}>{field}</option>)}</select></label>
          <label>{tr("Operacja", "Operation")}<select value={activeScenario.operation} onChange={(event) => onScenarioChange({ ...scenario, operation: event.target.value as OlsChangeScenario["operation"] })}>{operationIds.map((operation) => <option key={operation} value={operation}>{operation === "percent" ? tr("Zwiększ/zmniejsz o %", "Increase/decrease by %") : operation === "add" ? tr("Dodaj wartość", "Add a value") : operation === "multiply" ? tr("Pomnóż przez", "Multiply by") : tr("Ustaw wartość", "Set value")}</option>)}</select></label>
          <label>{tr("Wartość zmiany", "Change value")}<input type="number" step="any" value={activeScenario.value} onChange={(event) => onScenarioChange({ ...scenario, value: Number(event.target.value) })} /></label>
        </div>
        {change && <div className="ols-scenario-result"><article><span>{change.predictorField}</span><strong>{format.format(change.baselineInput)} → {format.format(change.changedInput)}</strong><small>{tr("zmiana X", "change in X")} {change.inputDifference >= 0 ? "+" : ""}{format.format(change.inputDifference)}</small></article><i>→</i><article className="featured"><span>ŷ({result.targetField})</span><strong>{format.format(change.baselinePrediction)} → {format.format(change.changedPrediction)}</strong><small>{tr("przewidywana zmiana", "predicted change")} {change.predictedDifference >= 0 ? "+" : ""}{format.format(change.predictedDifference)}{change.predictedPercent == null ? "" : ` · ${change.predictedPercent >= 0 ? "+" : ""}${format.format(change.predictedPercent)}%`}</small></article></div>}
      </section>
    </>}
  </div>;
}
