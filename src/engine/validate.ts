/**
 * AJV-backed value validation for Formify forms + a react-hook-form resolver.
 *
 * A JSON Schema is built per validation from the *currently visible* input fields (so hidden fields are
 * never validated), AJV does the type/range/pattern work, and keyword errors are mapped to the same friendly
 * messages as the dependency-free validator that ships in exports (core.formifyValidate) — tests assert parity.
 */
import Ajv, { ErrorObject, ValidateFunction } from "ajv";
import type { FieldValues, Resolver, ResolverResult } from "react-hook-form";
import {
  formifyExtraCheck,
  formifyHasOption,
  formifyIsEmpty,
  formifyRequiredMessage
} from "./core";
import { computeValues, isFieldRequired, isFieldVisible, isInputField, FieldDef, FormSchema, FormValues } from "./logic";

const EMAIL_RE = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
const PHONE_RE = "^(?=(?:\\D*\\d){7,15}\\D*$)[+]?[0-9()\\-.\\s]+$";
const DATE_RE = "^\\d{4}-\\d{2}-\\d{2}$";

const ajv = new Ajv({ allErrors: true, strict: false, unicodeRegExp: false });
const cache = new Map<string, ValidateFunction>();

const isNumeric = (v: unknown) =>
  (typeof v === "number" && isFinite(v)) || (typeof v === "string" && v.trim() !== "" && isFinite(Number(v)));

/** Normalise a raw form value into what the JSON Schema expects; `undefined` means "absent". */
function toInstanceValue(field: FieldDef, raw: unknown): unknown {
  switch (field.type) {
    case "checkbox":
      return raw === true || raw === "true";
    case "number":
    case "slider":
      return formifyIsEmpty(raw) ? undefined : isNumeric(raw) ? Number(raw) : raw;
    case "rating":
      return formifyIsEmpty(raw) || Number(raw) <= 0 ? undefined : isNumeric(raw) ? Number(raw) : raw;
    case "select":
    case "radio": {
      if (formifyIsEmpty(raw)) return undefined;
      const hit = (field.options || []).find((o) => String(o.value) === String(raw));
      return hit ? hit.value : raw;
    }
    case "multiselect": {
      if (formifyIsEmpty(raw)) return undefined;
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.map((x) => (field.options || []).find((o) => String(o.value) === String(x))?.value ?? x);
    }
    case "file":
      return formifyIsEmpty(raw) ? undefined : Array.isArray(raw) ? raw : [raw];
    default:
      return formifyIsEmpty(raw) ? undefined : String(raw);
  }
}

function fieldJsonSchema(field: FieldDef, required: boolean): Record<string, unknown> {
  const v = field.validation || {};
  const withBounds = (base: Record<string, unknown>) => {
    if (field.min !== undefined && !isNaN(Number(field.min))) base.minimum = Number(field.min);
    const max = field.type === "rating" && field.max === undefined ? 5 : field.max;
    if (max !== undefined && !isNaN(Number(max))) base.maximum = Number(max);
    return base;
  };
  const userPattern = typeof v.pattern === "string" && v.pattern ? { allOf: [{ pattern: v.pattern }] } : {};

  switch (field.type) {
    case "checkbox":
      return required ? { type: "boolean", const: true } : { type: "boolean" };
    case "email":
      return { type: "string", pattern: EMAIL_RE, ...userPattern };
    case "phone":
      return { type: "string", pattern: PHONE_RE, ...userPattern };
    case "date":
      return { type: "string", pattern: DATE_RE };
    case "number":
    case "slider":
      return withBounds({ type: "number" });
    case "rating":
      return withBounds({ type: "integer" });
    case "select":
    case "radio":
      return { enum: (field.options || []).map((o) => o.value) };
    case "multiselect": {
      const s: Record<string, unknown> = { type: "array", items: { enum: (field.options || []).map((o) => o.value) } };
      if (field.min !== undefined) s.minItems = Number(field.min);
      if (field.max !== undefined) s.maxItems = Number(field.max);
      return s;
    }
    case "file": {
      const s: Record<string, unknown> = { type: "array", items: { type: "object" } };
      if (field.min !== undefined) s.minItems = Number(field.min);
      if (field.max !== undefined) s.maxItems = Number(field.max);
      return s;
    }
    default: {
      const s: Record<string, unknown> = { type: "string" };
      if (typeof v.minLength === "number") s.minLength = v.minLength;
      if (typeof v.maxLength === "number") s.maxLength = v.maxLength;
      if (typeof v.pattern === "string" && v.pattern) s.pattern = v.pattern;
      return s;
    }
  }
}

const RANK: Record<string, number> = {
  required: 0, const: 0, type: 1, enum: 2, minimum: 3, maximum: 4,
  minItems: 3, maxItems: 4, minLength: 3, maxLength: 4, pattern: 5
};

function messageFor(field: FieldDef, err: ErrorObject): string {
  const v = field.validation || {};
  const isUser = err.schemaPath.includes("/allOf/");
  switch (err.keyword) {
    case "required":
    case "const":
      return formifyRequiredMessage(field);
    case "type":
      return field.type === "number" || field.type === "slider" || field.type === "rating"
        ? "Enter a valid number."
        : "Invalid value.";
    case "enum":
      return "Select a valid option.";
    case "minimum":
      return `Must be at least ${err.params.limit}.`;
    case "maximum":
      return `Must be at most ${err.params.limit}.`;
    case "minLength":
      return `Must be at least ${err.params.limit} characters.`;
    case "maxLength":
      return `Must be at most ${err.params.limit} characters.`;
    case "minItems":
      return field.type === "file" ? `Attach at least ${err.params.limit} file(s).` : `Select at least ${err.params.limit}.`;
    case "maxItems":
      return field.type === "file" ? `Attach at most ${err.params.limit} file(s).` : `Select at most ${err.params.limit}.`;
    case "pattern":
      if (isUser) return v.message || "Invalid format.";
      if (field.type === "email") return v.message || "Enter a valid email address.";
      if (field.type === "phone") return v.message || "Enter a valid phone number.";
      if (field.type === "date") return "Enter a valid date.";
      return v.message || "Invalid format.";
    default:
      return err.message || "Invalid value.";
  }
}

const unescapePointer = (s: string) => s.replace(/~1/g, "/").replace(/~0/g, "~");

/**
 * Validate form values. Returns `{ [fieldId]: message }` (empty object when valid).
 * `onlyIds` restricts reporting to those fields (used for per-step validation).
 */
export function validateValues(schema: FormSchema, rawValues: FormValues, onlyIds?: string[]): Record<string, string> {
  const values = computeValues(schema, rawValues || {});
  const inputs = (schema.fields || []).filter(
    (f) => f && f.id && isInputField(f) && isFieldVisible(f, values) && (!onlyIds || onlyIds.includes(f.id))
  );
  const byId = new Map(inputs.map((f) => [f.id, f] as const));

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const instance: Record<string, unknown> = {};
  inputs.forEach((f) => {
    const req = isFieldRequired(f, values);
    properties[f.id] = fieldJsonSchema(f, req);
    if (req) required.push(f.id);
    const inst = toInstanceValue(f, values[f.id]);
    if (inst !== undefined) instance[f.id] = inst;
  });

  const jsonSchema = { type: "object", properties, required };
  const key = JSON.stringify(jsonSchema);
  let validate = cache.get(key);
  if (!validate) {
    try {
      validate = ajv.compile(jsonSchema);
    } catch (e) {
      // A bad user regex must not take the whole form down; schema validation reports it separately.
      const safe = JSON.parse(key, (k, val) => (k === "pattern" && typeof val === "string" && !isRegexOk(val) ? undefined : val));
      validate = ajv.compile(safe);
    }
    if (cache.size > 100) cache.clear();
    cache.set(key, validate);
  }

  const best: Record<string, { rank: number; err: ErrorObject }> = {};
  if (!validate(instance)) {
    (validate.errors || []).forEach((err) => {
      const id = err.keyword === "required" ? String((err.params as any).missingProperty) : unescapePointer(err.instancePath.split("/")[1] ?? "");
      if (!byId.has(id)) return;
      const rank = (RANK[err.keyword] ?? 9) + (err.keyword === "pattern" && err.schemaPath.includes("/allOf/") ? 1 : 0);
      if (!best[id] || rank < best[id].rank) best[id] = { rank, err };
    });
  }

  const errors: Record<string, string> = {};
  Object.keys(best).forEach((id) => {
    errors[id] = messageFor(byId.get(id)!, best[id].err);
  });

  // Checks JSON Schema can't express: real calendar dates, file size / type, option membership for odd values.
  inputs.forEach((f) => {
    if (errors[f.id]) return;
    const raw = values[f.id];
    const msg = formifyExtraCheck(f, raw);
    if (msg) errors[f.id] = msg;
    else if ((f.type === "select" || f.type === "radio") && !formifyIsEmpty(raw) && !formifyHasOption(f, raw)) {
      errors[f.id] = "Select a valid option.";
    }
  });
  return errors;
}

function isRegexOk(src: string): boolean {
  try {
    new RegExp(src);
    return true;
  } catch {
    return false;
  }
}

/** react-hook-form resolver. Field names are the raw schema ids unless `decode` is supplied. */
export function formifyResolver<T extends FieldValues = FormValues>(
  schema: FormSchema,
  codec: { decode: (name: string) => string; encode: (id: string) => string } = { decode: (n) => n, encode: (i) => i }
): Resolver<T> {
  return async (values) => {
    const decoded: FormValues = {};
    Object.keys(values).forEach((k) => {
      decoded[codec.decode(k)] = (values as FormValues)[k];
    });
    const errors = validateValues(schema, decoded);
    const ids = Object.keys(errors);
    if (ids.length === 0) return { values: values as T, errors: {} } as ResolverResult<T>;
    const out: Record<string, { type: string; message: string }> = {};
    ids.forEach((id) => {
      out[codec.encode(id)] = { type: "validate", message: errors[id] };
    });
    return { values: {}, errors: out } as unknown as ResolverResult<T>;
  };
}
