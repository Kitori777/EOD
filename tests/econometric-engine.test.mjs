import assert from "node:assert/strict";
import test from "node:test";

import { fitEconometricResponse } from "../src/mechanics/econometrics/engine/econometric-engine.ts";
import { calculateOlsChange, fitOlsModel } from "../src/mechanics/econometrics/engine/multivariate-ols-engine.ts";
import { fSurvivalProbability } from "../src/mechanics/econometrics/math/statistics.ts";

test("econometric fit finds a delayed response and validates it on later observations", () => {
  const delayedRows = Array.from({ length: 180 }, (_, index) => {
    const source = Math.sin(index / 4) * 4 + Math.cos(index / 11) * 2 + (index % 7) * .05;
    const delayedIndex = Math.max(0, index - 2);
    const delayedSource = Math.sin(delayedIndex / 4) * 4 + Math.cos(delayedIndex / 11) * 2 + (delayedIndex % 7) * .05;
    return { source: String(source), target: String(20 + delayedSource * 1.8 + Math.sin(index * 2.1) * .03) };
  });
  const fit = fitEconometricResponse(delayedRows, "source", "target", 6);
  assert.ok(fit);
  assert.equal(fit.lagSteps, 2);
  assert.ok(Math.abs(fit.coefficient - 1.8) < .1);
  assert.ok(fit.pValue < .05);
  assert.ok(fit.validationRows >= 20);
  assert.ok((fit.validationRSquared ?? 0) > .95);
  assert.ok(fit.testedSpecifications > 1);
  assert.ok(fit.specificationAdjustedPValue >= fit.pValue);
});

test("maximum econometric delay is a real scenario constraint", () => {
  const delayedRows = Array.from({ length: 160 }, (_, index) => {
    const source = Math.sin(index / 3) * 4 + Math.cos(index / 9);
    const delayedIndex = Math.max(0, index - 3);
    const delayed = Math.sin(delayedIndex / 3) * 4 + Math.cos(delayedIndex / 9);
    return { source: String(source), target: String(12 + delayed * 1.5) };
  });
  assert.equal(fitEconometricResponse(delayedRows, "source", "target", 0)?.lagSteps, 0);
  assert.equal(fitEconometricResponse(delayedRows, "source", "target", 6)?.lagSteps, 3);
});

test("econometric validation does not learn a relationship introduced only in the final period", () => {
  const shifted = Array.from({ length: 100 }, (_, index) => {
    const source = Math.sin(index / 3) * 5;
    const target = index < 80 ? Math.cos(index / 5) : source * 8;
    return { source: String(source), target: String(target) };
  });
  const fit = fitEconometricResponse(shifted, "source", "target", 0);
  assert.ok(fit);
  assert.ok(Math.abs(fit.coefficient) < 1);
  assert.ok(fit.relativeValidationError > .25 || (fit.validationRSquared ?? 0) < 0);
});

test("econometric model selection is respected instead of silently using another method", () => {
  const dynamicRows = Array.from({ length: 180 }, (_, index) => {
    const source = Math.sin(index / 5) * 3 + Math.cos(index / 13);
    const previousTarget = index ? Number((20 + Math.sin((index - 1) / 5) * 3).toFixed(8)) : 20;
    return { source: String(source), target: String(8 + source * 1.4 + previousTarget * .25 + index * .002) };
  });
  const ols = fitEconometricResponse(dynamicRows, "source", "target", 4, "ols");
  const arx = fitEconometricResponse(dynamicRows, "source", "target", 4, "arx");
  const trend = fitEconometricResponse(dynamicRows, "source", "target", 4, "arx-trend");
  assert.equal(ols?.model, "ols");
  assert.equal(arx?.model, "arx");
  assert.equal(trend?.model, "arx-trend");
});

test("multivariate OLS recovers an intercept and coefficients for several predictors", () => {
  const rows = Array.from({ length: 120 }, (_, index) => {
    const x1 = index / 5 + Math.sin(index * 1.7);
    const x2 = Math.cos(index / 4) * 8 + (index % 5);
    const noise = Math.sin(index * 2.3) * .01;
    return { y: String(7 + 2.5 * x1 - 1.2 * x2 + noise), x1: String(x1), x2: String(x2) };
  });
  const outcome = fitOlsModel(rows, { targetField: "y", predictorFields: ["x1", "x2"], includeIntercept: true, justification: "" });
  assert.equal(outcome.ready, true);
  if (!outcome.ready) return;
  assert.ok(Math.abs(outcome.result.coefficients.find((item) => item.term === "const").coefficient - 7) < .02);
  assert.ok(Math.abs(outcome.result.coefficients.find((item) => item.term === "x1").coefficient - 2.5) < .01);
  assert.ok(Math.abs(outcome.result.coefficients.find((item) => item.term === "x2").coefficient + 1.2) < .01);
  assert.ok(outcome.result.adjustedRSquared > .999);
  assert.ok(outcome.result.coefficients.every((item) => item.pValue < .001));
  assert.ok(outcome.result.fPValue < .001);
  assert.ok(outcome.result.fStatistic > 1000);
  assert.ok(Math.abs(outcome.result.residualMean) < 1e-10);
  assert.ok(outcome.result.diagnosticPoints.length > 0);
  assert.ok(outcome.result.coefficients.filter((item) => item.field).every((item) => item.vif >= 1 && item.vif < 2));
});

test("F survival probability and VIF expose whole-model and collinearity diagnostics", () => {
  assert.ok(Math.abs(fSurvivalProbability(4.9646027, 1, 10) - .05) < 1e-5);
  const rows = Array.from({ length: 160 }, (_, index) => {
    const x1 = index / 10 + Math.sin(index / 3);
    const x2 = x1 * .98 + Math.cos(index * 1.7) * .08;
    return { y: String(4 + x1 * 2 + Math.sin(index) * .1), x1: String(x1), x2: String(x2) };
  });
  const outcome = fitOlsModel(rows, { targetField: "y", predictorFields: ["x1", "x2"], includeIntercept: true, justification: "" });
  assert.equal(outcome.ready, true);
  if (!outcome.ready) return;
  assert.ok(outcome.result.coefficients.filter((item) => item.field).every((item) => item.vif > 10));
});

test("multivariate OLS omits incomplete rows and reports their count", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    y: index === 4 ? "" : String(3 + index * 2),
    x: index === 8 ? "bad" : String(index),
  }));
  const outcome = fitOlsModel(rows, { targetField: "y", predictorFields: ["x"], includeIntercept: true, justification: "" });
  assert.equal(outcome.ready, true);
  if (!outcome.ready) return;
  assert.equal(outcome.result.usedRows, 28);
  assert.equal(outcome.result.omittedRows, 2);
});

test("multivariate OLS rejects collinear predictors with a readable error", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ y: String(index * 3), x: String(index + 1), duplicate: String((index + 1) * 2) }));
  const outcome = fitOlsModel(rows, { targetField: "y", predictorFields: ["x", "duplicate"], includeIntercept: true, justification: "" });
  assert.equal(outcome.ready, false);
  if (outcome.ready) return;
  assert.match(outcome.issue, /współliniową/);
});

test("OLS change scenario varies one predictor and holds the others at their means", () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({ y: String(5 + index * 4), x: String(index) }));
  const outcome = fitOlsModel(rows, { targetField: "y", predictorFields: ["x"], includeIntercept: true, justification: "" });
  assert.equal(outcome.ready, true);
  if (!outcome.ready) return;
  const change = calculateOlsChange(outcome.result, { predictorField: "x", operation: "add", value: 2 });
  assert.ok(change);
  assert.ok(Math.abs(change.predictedDifference - 8) < 1e-8);
});
