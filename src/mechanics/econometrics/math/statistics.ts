export function parseNumericValue(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export function correlation(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length < 2) return 0;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;

  left.forEach((value, index) => {
    covariance += (value - meanLeft) * (right[index] - meanRight);
    varianceLeft += (value - meanLeft) ** 2;
    varianceRight += (right[index] - meanRight) ** 2;
  });

  return varianceLeft && varianceRight
    ? covariance / Math.sqrt(varianceLeft * varianceRight)
    : 0;
}

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];
  if (value < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const shifted = value - 1;
  let series = .9999999999998099;
  coefficients.forEach((coefficient, index) => {
    series += coefficient / (shifted + index + 1);
  });
  const t = shifted + coefficients.length - .5;
  return .5 * Math.log(2 * Math.PI) + (shifted + .5) * Math.log(t) - t + Math.log(series);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const epsilon = 3e-12;
  const floor = 1e-30;
  const sum = a + b;
  let c = 1;
  let d = 1 - sum * x / (a + 1);
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let result = d;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const even = iteration * 2;
    let factor = iteration * (b - iteration) * x / ((a + even - 1) * (a + even));
    d = 1 + factor * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + factor / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    result *= d * c;

    factor = -(a + iteration) * (sum + iteration) * x / ((a + even) * (a + even + 1));
    d = 1 + factor * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + factor / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }

  return result;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const scale = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? scale * betaContinuedFraction(a, b, x) / a
    : 1 - scale * betaContinuedFraction(b, a, 1 - x) / b;
}

export function twoSidedStudentTPValue(tStatistic: number, degreesOfFreedom: number): number {
  if (!Number.isFinite(tStatistic)) return 0;
  if (degreesOfFreedom <= 0) return 1;
  const x = degreesOfFreedom / (degreesOfFreedom + tStatistic ** 2);
  return Math.max(0, Math.min(1, regularizedIncompleteBeta(x, degreesOfFreedom / 2, .5)));
}

export function studentTCriticalValue(confidence: number, degreesOfFreedom: number): number {
  const alpha = 1 - Math.max(0, Math.min(1, confidence));
  let lower = 0;
  let upper = 100;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (twoSidedStudentTPValue(middle, degreesOfFreedom) > alpha) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

export function fSurvivalProbability(fStatistic: number, numeratorDegrees: number, denominatorDegrees: number): number {
  if (fStatistic === Number.POSITIVE_INFINITY) return 0;
  if (!Number.isFinite(fStatistic) || fStatistic < 0 || numeratorDegrees <= 0 || denominatorDegrees <= 0) return 1;
  const scaled = numeratorDegrees * fStatistic;
  const x = scaled / (scaled + denominatorDegrees);
  const cdf = regularizedIncompleteBeta(x, numeratorDegrees / 2, denominatorDegrees / 2);
  return Math.max(0, Math.min(1, 1 - cdf));
}
