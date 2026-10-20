// Scoring adapted from the GrowthPro GEO methodology:
//  - distinct-intent queries (discovery, service, brand) across multiple LLMs
//  - score = position-weighted mention rate on NON-brand queries (brand queries inflate scores)
//  - answers with no live grounding are flagged as "training data only"
//  - factual claims are validated against Google Business Profile data

import { ENGINES, LOCATIONS, THIS_WEEK_RESULTS, type Engine, type Location, type QueryResult } from "./data.js";

const positionWeight = (pos: number | null) => (pos == null ? 0 : [1, 0.85, 0.7, 0.55][pos - 1] ?? 0.4);

function score(results: QueryResult[]): number {
  const scored = results.filter((r) => r.intent !== "brand");
  if (!scored.length) return 0;
  const total = scored.reduce((s, r) => s + (r.mentioned ? 0.6 + 0.4 * positionWeight(r.position) : 0), 0);
  return Math.round((total / scored.length) * 1000) / 10;
}

export interface EntityIssue {
  engine: Engine;
  field: string;
  aiSaid: string;
  gbpSays: string;
}

function validate(loc: Location, results: QueryResult[]): EntityIssue[] {
  const issues: EntityIssue[] = [];
  for (const r of results) {
    for (const c of r.claims ?? []) {
      const truth = loc.gbp[c.field];
      const ok =
        Array.isArray(truth) ? truth.includes(String(c.value)) :
        typeof truth === "boolean" ? truth === c.value :
        String(truth) === String(c.value);
      if (!ok) issues.push({ engine: r.engine, field: c.field, aiSaid: String(c.value), gbpSays: Array.isArray(truth) ? truth.join(", ") : String(truth) });
    }
  }
  return issues;
}

export interface VisibilityReport {
  locationId: string;
  location: string;
  shortName: string;
  score: number; // this week, computed from raw results
  previousScore: number;
  change: number;
  trend: "up" | "down" | "flat";
  byEngine: Record<Engine, number>;
  byIntent: { discovery: number; service: number };
  brandQueriesExcluded: number;
  trainingDataOnlyAnswers: number; // mentions with no live grounding
  entityIssues: EntityIssue[];
  auditRuns: number;
}

export function visibilityReport(loc: Location): VisibilityReport {
  const rs = THIS_WEEK_RESULTS.filter((r) => r.locationId === loc.id);
  const s = score(rs);
  const prev = loc.scoreHistory[loc.scoreHistory.length - 1];
  const change = Math.round((s - prev) * 10) / 10;
  const byEngine = Object.fromEntries(ENGINES.map((e) => [e, score(rs.filter((r) => r.engine === e))])) as Record<Engine, number>;
  return {
    locationId: loc.id,
    location: loc.name,
    shortName: loc.shortName,
    score: s,
    previousScore: prev,
    change,
    trend: change > 1 ? "up" : change < -1 ? "down" : "flat",
    byEngine,
    byIntent: {
      discovery: score(rs.filter((r) => r.intent === "discovery")),
      service: score(rs.filter((r) => r.intent === "service")),
    },
    brandQueriesExcluded: rs.filter((r) => r.intent === "brand").length,
    trainingDataOnlyAnswers: rs.filter((r) => r.mentioned && !r.grounded && r.intent !== "brand").length,
    entityIssues: validate(loc, rs),
    auditRuns: loc.scoreHistory.length + 1,
  };
}

export const allReports = () => LOCATIONS.map(visibilityReport);
