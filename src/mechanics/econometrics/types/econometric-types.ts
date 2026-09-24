import type { ModelEconometricDiagnostics } from "../../modeling/types/model-types.ts";

export type EconometricObservation = {
  y: number;
  x: number;
  yLag: number;
  trend: number;
};

export type EconometricFit = ModelEconometricDiagnostics & {
  lagSteps: number;
  intercept: number;
};

export type EconometricCandidate = EconometricFit & {
  score: number;
};
