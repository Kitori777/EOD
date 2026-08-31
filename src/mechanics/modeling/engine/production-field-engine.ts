import type { ProductionFieldIdentity, ProductionSignalRole } from "../types/model-types";

const ROLE_SUFFIXES: Array<{ role: ProductionSignalRole; patterns: RegExp[] }> = [
  { role: "time", patterns: [/(?:^|_)(?:timestamp|datetime|date|time|ts)$/] },
  { role: "correction", patterns: [/(?:^|_)(?:draw_?temp_?)?(?:correction|compensation|adjustment)$/] },
  { role: "setting", patterns: [/(?:^|_)(?:set_?point|setpoint|target|reference|nominal|sp)$/] },
  { role: "measurement", patterns: [/(?:^|_)(?:process_?value|processvalue|measurement|measured|reading|sensor_?value|pv)$/] },
  { role: "output", patterns: [/(?:^|_)(?:output|result|out)$/] },
  { role: "offset", patterns: [/(?:^|_)(?:position_?|speed_?|sensor_?)?(?:offset|deviation)$/] },
];

function canonicalName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/processvalue$/g, "process_value")
    .replace(/setpoint$/g, "setpoint");
}

function roleFor(canonical: string): ProductionSignalRole {
  for (const candidate of ROLE_SUFFIXES) {
    if (candidate.patterns.some((pattern) => pattern.test(canonical))) return candidate.role;
  }
  return "other";
}

function componentFor(canonical: string, role: ProductionSignalRole): string {
  if (role === "time") return "time";
  let component = canonical;
  if (role === "correction") component = component.replace(/_?(?:draw_?temp_?)?(?:correction|compensation|adjustment)$/, "");
  else if (role === "setting") component = component.replace(/_?(?:set_?point|setpoint|target|reference|nominal|sp)$/, "");
  else if (role === "measurement") component = component.replace(/_?(?:process_?value|processvalue|measurement|measured|reading|sensor_?value|pv)$/, "");
  else if (role === "output") component = component.replace(/_?(?:output|result|out)$/, "");
  else if (role === "offset") component = component.replace(/_?(?:position_?|speed_?|sensor_?)?(?:offset|deviation)$/, "");
  return component.replace(/^_+|_+$/g, "") || canonical;
}

function componentLabel(component: string): string {
  return component.split("_").filter(Boolean).map((token) => token.replace(/^(seal|heat|sensor)(\d+)$/, (_, prefix: string, number: string) => `${prefix[0].toUpperCase()}${prefix.slice(1)} ${number}`)).join(" · ");
}

export function parseProductionField(field: string): ProductionFieldIdentity {
  const canonical = canonicalName(field);
  const role = roleFor(canonical);
  const component = componentFor(canonical, role);
  return { field, canonical, component, componentLabel: componentLabel(component), role };
}

export function sameProductionComponent(left: string, right: string): boolean {
  const a = parseProductionField(left);
  const b = parseProductionField(right);
  return a.component.length > 0 && a.component === b.component;
}

export function describeProductionField(field: string, language: "pl" | "en" = "pl"): string {
  const identity = parseProductionField(field);
  const component = language === "en"
    ? (identity.componentLabel || field)
      .replace(/\bwynik\b/gi, "result")
      .replace(/\bformuly\b/gi, "formula")
      .replace(/\bformular?\b/gi, "formula")
      .replace(/\bsredni\b/gi, "average")
    : (identity.componentLabel || field);
  const roles: Record<ProductionSignalRole, string> = {
    time: language === "en" ? "time" : "czas",
    setting: language === "en" ? "setpoint" : "nastawa",
    measurement: language === "en" ? "process value" : "wartość procesu",
    output: language === "en" ? "output" : "wyjście",
    correction: language === "en" ? "correction" : "korekta",
    offset: language === "en" ? "offset" : "odchylenie",
    other: language === "en" ? "signal" : "sygnał",
  };
  return `${component} · ${roles[identity.role]}`;
}
