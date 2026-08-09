export type ViewId = "model" | "data" | "charts" | "paths" | "compare";

export type BottomTab = "results" | "data" | "issues";

export type NodeKind = "source" | "transform" | "decision" | "metric" | "result";

export type ModelNode = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle: string;
  x: number;
  y: number;
};

export type ModelEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type Scenario = {
  id: string;
  name: string;
  priceChange: number;
  marketingChange: number;
  conversionChange: number;
  choices: {
    pricing: string;
    campaign: string;
    market: string;
  };
};

export type ScenarioMetrics = {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  customers: number;
  risk: number;
};
