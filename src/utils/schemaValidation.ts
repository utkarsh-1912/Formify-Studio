import { collectSchemaIssues, FIELD_TYPES } from "./formifySchema";
import { formifyParse, formifyCheckRule } from "../engine/core";

/** Collect every field-id reference used by a rule or expression. */
const collectRuleRefs = (rule: any, out: Set<string>): void => {
  if (rule === null || rule === undefined || typeof rule === "boolean") return;
  if (typeof rule === "string") {
    const walk = (node: any): void => {
      if (!node) return;
      if (node.k === "ref") out.add(node.name);
      if (node.k === "un") walk(node.e);
      if (node.k === "bin") { walk(node.l); walk(node.r); }
      if (node.k === "tern") { walk(node.c); walk(node.a); walk(node.b); }
      if (node.k === "call") node.args.forEach(walk);
    };
    walk(formifyParse(rule));
    return;
  }
  if (typeof rule !== "object") return;
  if (Array.isArray(rule.all)) rule.all.forEach((r: any) => collectRuleRefs(r, out));
  else if (Array.isArray(rule.any)) rule.any.forEach((r: any) => collectRuleRefs(r, out));
  else if (rule.not !== undefined) collectRuleRefs(rule.not, out);
  else if (typeof rule.field === "string") out.add(rule.field);
};

const OPTION_TYPES = ["select", "radio", "multiselect"];

const validateSchema = (schema: any): void => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("Schema must be a valid JSON object.");
  }

  if (!schema.formTitle) {
    throw new Error("Schema must include a 'formTitle' string.");
  }

  if (typeof schema.formTitle !== "string") {
    throw new Error("'formTitle' must be a string.");
  }

  if (schema.formDescription && typeof schema.formDescription !== "string") {
    throw new Error("'formDescription' must be a string.");
  }

  if (!schema.fields) {
    throw new Error("Schema must include a 'fields' array.");
  }

  if (!Array.isArray(schema.fields)) {
    throw new Error("'fields' must be an array.");
  }

  const seenIds = new Set<string>();

  schema.fields.forEach((field: any, index: number) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      throw new Error(`Field at index ${index} must be a valid object.`);
    }

    if (!field.id) {
      throw new Error(`Field at index ${index} is missing a required 'id'.`);
    }

    if (typeof field.id !== "string" || field.id.trim() === "") {
      throw new Error(`Field id at index ${index} must be a non-empty string.`);
    }

    if (seenIds.has(field.id)) {
      throw new Error(`Duplicate field id detected: '${field.id}' at index ${index}.`);
    }
    seenIds.add(field.id);

    if (!field.type) {
      throw new Error(`Field '${field.id}' is missing a required 'type'.`);
    }

    const validTypes: readonly string[] = FIELD_TYPES;
    if (!validTypes.includes(field.type)) {
      throw new Error(
        `Field '${field.id}' has invalid type '${field.type}'. Must be one of: ${validTypes.join(", ")}.`
      );
    }

    // `hidden` fields carry a value but are never shown, so they need no label.
    if (field.type !== "hidden") {
      if (!field.label) {
        throw new Error(`Field '${field.id}' is missing a required 'label'.`);
      }

      if (typeof field.label !== "string") {
        throw new Error(`Field '${field.id}' 'label' must be a string.`);
      }
    }

    // Validation for options
    if (OPTION_TYPES.includes(field.type)) {
      if (!field.options) {
        throw new Error(`Field '${field.id}' of type '${field.type}' must include an 'options' array.`);
      }
      if (!Array.isArray(field.options)) {
        throw new Error(`Field '${field.id}' 'options' must be an array.`);
      }
      if (field.options.length === 0) {
        throw new Error(`Field '${field.id}' 'options' array cannot be empty.`);
      }
      field.options.forEach((opt: any, optIdx: number) => {
        if (!opt || typeof opt !== "object" || Array.isArray(opt)) {
          throw new Error(`Field '${field.id}' option at index ${optIdx} must be an object.`);
        }
        if (opt.value === undefined || opt.value === null) {
          throw new Error(`Field '${field.id}' option at index ${optIdx} is missing a 'value'.`);
        }
        if (!opt.label || typeof opt.label !== "string") {
          throw new Error(`Field '${field.id}' option at index ${optIdx} must have a 'label' string.`);
        }
      });
    }

    // Validation pattern regex syntax checking
    if (field.validation) {
      if (typeof field.validation !== "object" || Array.isArray(field.validation)) {
        throw new Error(`Field '${field.id}' 'validation' property must be an object.`);
      }
      if (field.validation.pattern) {
        if (typeof field.validation.pattern !== "string") {
          throw new Error(`Field '${field.id}' validation 'pattern' must be a regex string.`);
        }
        try {
          new RegExp(field.validation.pattern);
        } catch (e) {
          throw new Error(`Field '${field.id}' has an invalid validation regex pattern: ${(e as Error).message}`);
        }
      }
      if (field.validation.message && typeof field.validation.message !== "string") {
        throw new Error(`Field '${field.id}' validation 'message' must be a string.`);
      }
    }

    // Numeric / date bounds
    if (["number", "slider", "rating"].includes(field.type)) {
      const lo = field.min === undefined ? undefined : Number(field.min);
      const hi = field.max === undefined ? undefined : Number(field.max);
      if ((lo !== undefined && isNaN(lo)) || (hi !== undefined && isNaN(hi))) {
        throw new Error(`Field '${field.id}' 'min' and 'max' must be numbers.`);
      }
      if (lo !== undefined && hi !== undefined && lo > hi) {
        throw new Error(`Field '${field.id}' 'min' cannot be greater than 'max'.`);
      }
      if (field.type === "rating" && hi !== undefined && (!Number.isInteger(hi) || hi < 1 || hi > 10)) {
        throw new Error(`Field '${field.id}' rating 'max' must be an integer from 1 to 10.`);
      }
    }

    if (field.type === "calculated") {
      if (typeof field.formula !== "string" || field.formula.trim() === "") {
        throw new Error(`Field '${field.id}' of type 'calculated' must include a 'formula' string.`);
      }
    }
  });

  // Conditional logic & formulas: syntax first, then references (needs every id, so a second pass).
  schema.fields.forEach((field: any) => {
    (["visibleIf", "requiredIf"] as const).forEach((key) => {
      if (field[key] === undefined) return;
      const problem = formifyCheckRule(field[key]);
      if (problem) {
        throw new Error(`Field '${field.id}' has an invalid '${key}' rule: ${problem}`);
      }
      const refs = new Set<string>();
      collectRuleRefs(field[key], refs);
      refs.forEach((ref) => {
        if (ref === field.id) {
          throw new Error(`Field '${field.id}' '${key}' cannot reference itself.`);
        }
        if (!seenIds.has(ref)) {
          throw new Error(`Field '${field.id}' '${key}' references unknown field '${ref}'.`);
        }
      });
    });

    if (field.type === "calculated") {
      try {
        formifyParse(field.formula);
      } catch (e) {
        throw new Error(`Field '${field.id}' has an invalid formula: ${(e as Error).message}`);
      }
      const refs = new Set<string>();
      collectRuleRefs(field.formula, refs);
      refs.forEach((ref) => {
        if (ref === field.id) {
          throw new Error(`Field '${field.id}' formula cannot reference itself.`);
        }
        if (!seenIds.has(ref)) {
          throw new Error(`Field '${field.id}' formula references unknown field '${ref}'.`);
        }
      });
    }
  });

  // Backstop: formal JSON Schema check catches anything the friendly checks above missed.
  const issues = collectSchemaIssues(schema);
  if (issues.length > 0) {
    throw new Error(`Schema failed validation at ${issues[0].path}: ${issues[0].message}.`);
  }
};

export default validateSchema;
