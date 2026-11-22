export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  data: Record<string, string | boolean>;
}

const MAX_TEXT = 10_000;
const MAX_PATTERN_INPUT = 2_000; // bounds worst-case regex cost
const MAX_PATTERN_LEN = 200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a respondent's payload against a stored form schema.
 * Unknown keys are rejected (never persisted), so respondents can't stuff arbitrary data.
 *
 * Known limit: `validation.pattern` is author-supplied regex. We cap pattern/input length,
 * but a pathological pattern can still be slow. Treat schema editors as semi-trusted.
 */
export function validateSubmission(schema: any, body: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  const data: Record<string, string | boolean> = {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: { _: "Body must be a JSON object." }, data };
  }
  const input = body as Record<string, unknown>;
  const fields: any[] = Array.isArray(schema?.fields) ? schema.fields : [];
  const known = new Set(fields.map((f) => f.id));

  for (const key of Object.keys(input)) {
    if (!known.has(key)) errors[key] = "Unknown field.";
  }

  for (const f of fields) {
    const raw = input[f.id];
    const empty = raw === undefined || raw === null || raw === "" || raw === false;

    if (f.type === "checkbox") {
      if (raw !== undefined && typeof raw !== "boolean") errors[f.id] = "Must be true or false.";
      else if (f.required && raw !== true) errors[f.id] = "This field is required.";
      else data[f.id] = raw === true;
      continue;
    }

    if (empty) {
      if (f.required) errors[f.id] = "This field is required.";
      else data[f.id] = "";
      continue;
    }

    if (typeof raw !== "string" && typeof raw !== "number") {
      errors[f.id] = "Must be a string.";
      continue;
    }
    const value = String(raw);
    if (value.length > MAX_TEXT) {
      errors[f.id] = `Too long (max ${MAX_TEXT} characters).`;
      continue;
    }

    if (f.type === "email" && !EMAIL.test(value)) errors[f.id] = "Invalid email address.";
    else if (f.type === "number" && (value.trim() === "" || !Number.isFinite(Number(value)))) errors[f.id] = "Must be a number.";
    else if (f.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) errors[f.id] = "Must be a date (YYYY-MM-DD).";
    else if ((f.type === "select" || f.type === "radio") && !(f.options ?? []).some((o: any) => String(o.value) === value)) errors[f.id] = "Not an allowed option.";
    else if (f.validation?.pattern) {
      const pattern = String(f.validation.pattern);
      if (pattern.length <= MAX_PATTERN_LEN && value.length <= MAX_PATTERN_INPUT) {
        try {
          if (!new RegExp(pattern).test(value)) errors[f.id] = f.validation.message || "Invalid format.";
        } catch {
          /* invalid author pattern: ignore rather than reject respondents */
        }
      } else if (value.length > MAX_PATTERN_INPUT) {
        errors[f.id] = "Value too long for pattern validation.";
      }
    }

    if (!errors[f.id]) data[f.id] = value;
  }

  return { ok: Object.keys(errors).length === 0, errors, data };
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** CSV cell with quoting and spreadsheet formula-injection neutralisation. */
export const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? "" : String(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
