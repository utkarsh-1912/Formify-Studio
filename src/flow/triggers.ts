import { TriggerEvent, Workflow } from "./types";

/** Returns ids of trigger nodes that should fire for an event. */
export function matchTriggers(workflow: Workflow, event: TriggerEvent): string[] {
  return workflow.nodes
    .filter((n) => {
      if (n.type !== "trigger" || n.config.type !== event.type) return false;
      if (event.type === "field_changed" && n.config.field && n.config.field !== event.payload.field) return false;
      if (event.type === "webhook" && n.config.path && n.config.path !== event.payload.path) return false;
      return true;
    })
    .map((n) => n.id);
}

// ---- Minimal 5-field cron (minute hour day-of-month month day-of-week), evaluated in UTC ----

interface CronField {
  values: boolean[];
  star: boolean;
}

const RANGES: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6]
];

function parseField(src: string, [min, max]: [number, number], isDow: boolean): CronField {
  const values: boolean[] = [];
  for (let i = 0; i <= max; i++) values.push(false);
  let star = false;
  src.split(",").forEach((part) => {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!isFinite(step) || step < 1 || Math.floor(step) !== step) throw new Error(`Invalid cron step '${part}'`);
    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = min;
      hi = max;
      if (stepPart === undefined) star = true;
    } else if (rangePart.indexOf("-") !== -1) {
      const [a, b] = rangePart.split("-").map(Number);
      lo = a;
      hi = b;
    } else {
      lo = Number(rangePart);
      hi = stepPart === undefined ? lo : max;
    }
    if (isDow) {
      if (lo === 7) lo = 0;
      if (hi === 7 && lo !== 0) hi = 6;
    }
    if (!isFinite(lo) || !isFinite(hi) || Math.floor(lo) !== lo || Math.floor(hi) !== hi || lo < min || hi > max || lo > hi) {
      throw new Error(`Invalid cron field '${part}'`);
    }
    for (let v = lo; v <= hi; v += step) values[v] = true;
  });
  return { values, star };
}

export function parseCron(expr: string): CronField[] {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Cron must have 5 fields: minute hour day-of-month month day-of-week");
  return parts.map((p, i) => parseField(p, RANGES[i], i === 4));
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

function matchesParsed(fields: CronField[], date: Date): boolean {
  const [mi, h, dom, mo, dow] = fields;
  if (!mi.values[date.getUTCMinutes()] || !h.values[date.getUTCHours()] || !mo.values[date.getUTCMonth() + 1]) return false;
  const domOk = !!dom.values[date.getUTCDate()];
  const dowOk = !!dow.values[date.getUTCDay()];
  // Standard cron: if both day fields are restricted, either may match.
  if (!dom.star && !dow.star) return domOk || dowOk;
  return domOk && dowOk;
}

export function cronMatches(expr: string, date: Date): boolean {
  return matchesParsed(parseCron(expr), date);
}

/** Next matching minute strictly after `afterMs` (UTC), or null within ~2 years. */
export function nextCronRun(expr: string, afterMs: number): number | null {
  const fields = parseCron(expr);
  const start = Math.floor(afterMs / 60000) * 60000 + 60000;
  const limit = 2 * 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    const t = start + i * 60000;
    if (matchesParsed(fields, new Date(t))) return t;
  }
  return null;
}
