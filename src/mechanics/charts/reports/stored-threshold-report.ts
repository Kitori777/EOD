import { iterateDatasetRows } from "../../data/storage/dataset-store";
import { parseNumber, passesFilter, passesTimeRange } from "../engine/chart-engine";
import type { ChartDefinition, ThresholdEvent, ThresholdReport, ThresholdRule, ThresholdStatus, ThresholdViolation } from "../types/chart-types";

type ActiveEvent = { rule: ThresholdRule; status: ThresholdStatus; violations: ThresholdViolation[] };

function finalize(active: ActiveEvent, index: number): ThresholdEvent {
  const { rule, status, violations } = active;
  return {
    id: `${rule.id}-stored-${index}`,
    ruleId: rule.id,
    field: rule.field,
    status,
    startX: violations[0].x,
    endX: violations.at(-1)?.x ?? violations[0].x,
    pointCount: violations.length,
    minimum: Math.min(...violations.map((item) => item.value)),
    maximum: Math.max(...violations.map((item) => item.value)),
    largestDeviation: violations.reduce((largest, item) => Math.abs(item.deviation) > Math.abs(largest) ? item.deviation : largest, 0),
    violations,
  };
}

export async function buildStoredRawThresholdReport(datasetId: string, definition: ChartDefinition): Promise<ThresholdReport> {
  const rules = (definition.thresholds ?? []).filter((rule) => rule.enabled && rule.evaluation === "raw" && (rule.lower != null || rule.upper != null));
  if (!rules.length) return { events: [], violationCount: 0, evaluatedPoints: 0 };
  const active = new Map<string, ActiveEvent>();
  const events: ThresholdEvent[] = [];
  let evaluatedPoints = 0;
  const flush = (ruleId: string) => {
    const event = active.get(ruleId);
    if (!event?.violations.length) return;
    events.push(finalize(event, events.length + 1));
    active.delete(ruleId);
  };

  await iterateDatasetRows(datasetId, (rows) => {
    rows.forEach((row) => {
      if (!passesTimeRange(row, definition.timeRange) || !definition.filters.every((filter) => passesFilter(row, filter))) return;
      const x = row[definition.xField]?.trim();
      rules.forEach((rule) => {
        const value = parseNumber(row[rule.field]);
        if (!x || value == null) {
          flush(rule.id);
          return;
        }
        evaluatedPoints += 1;
        let violation: ThresholdViolation | null = null;
        if (rule.lower != null && value < rule.lower) violation = { x, value, status: "below", boundary: rule.lower, deviation: value - rule.lower };
        else if (rule.upper != null && value > rule.upper) violation = { x, value, status: "above", boundary: rule.upper, deviation: value - rule.upper };
        if (!violation) {
          flush(rule.id);
          return;
        }
        const current = active.get(rule.id);
        if (current && current.status !== violation.status) flush(rule.id);
        const next = active.get(rule.id) ?? { rule, status: violation.status, violations: [] };
        next.violations.push(violation);
        active.set(rule.id, next);
      });
    });
  });
  rules.forEach((rule) => flush(rule.id));
  return { events, violationCount: events.reduce((sum, event) => sum + event.pointCount, 0), evaluatedPoints };
}
