/**
 * Typed public API of the Formify logic engine (conditional logic, calculated fields, steps).
 * Thin, typed wrappers over ./core — which is the single implementation shared with generated exports.
 *
 * Safety: expressions are tokenized and parsed by a hand-written parser and evaluated on an AST.
 * There is no eval / new Function, no property access, and only a whitelisted set of functions.
 */
import {
  formifyExpr,
  formifyParse,
  formifyRule,
  formifyCheckRule,
  formifyVisible,
  formifyRequired,
  formifyCompute,
  formifySteps,
  formifyIsInput,
  formifyIsEmpty,
  formifyInitialValues,
  formifyCollect,
  formifyDefault
} from "./core";

export type FieldType =
  | "text" | "email" | "number" | "select" | "radio" | "checkbox" | "textarea" | "date"
  | "multiselect" | "rating" | "slider" | "file" | "phone"
  | "section" | "pagebreak" | "hidden" | "calculated";

export type RuleOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "notContains" | "in" | "empty" | "notEmpty";

export type Rule =
  | boolean
  | string
  | { field: string; op?: RuleOperator; value?: unknown }
  | { all: Rule[] }
  | { any: Rule[] }
  | { not: Rule };

export interface FieldOption {
  value: string | number;
  label: string;
}

export interface FieldDef {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options?: FieldOption[];
  validation?: { pattern?: string; message?: string; minLength?: number; maxLength?: number };
  defaultValue?: unknown;
  /** number/slider/rating: numeric bounds; date: ISO bounds; multiselect/file: item counts. */
  min?: number | string;
  max?: number | string;
  step?: number;
  /** file */
  accept?: string;
  maxSizeKB?: number;
  /** show/hide + conditional required (rule object or expression string) */
  visibleIf?: Rule;
  requiredIf?: Rule;
  /** calculated */
  formula?: string;
  precision?: number;
}

export interface FormSchema {
  schemaVersion?: number;
  formTitle: string;
  formDescription?: string;
  fields: FieldDef[];
}

export type FormValues = Record<string, any>;

export interface FormStep {
  title: string;
  description: string;
  fields: FieldDef[];
}

/** Parse + evaluate. Throws Error on syntax errors / unknown functions. */
export const evaluateExpression = (src: string, values: FormValues = {}): unknown => formifyExpr(src, values);

/** Syntax-check an expression. Returns "" when valid, otherwise the error message. */
export const checkExpression = (src: string): string => {
  try {
    formifyParse(src);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

/** Evaluate a rule. Malformed rules fail open (true). */
export const evaluateRule = (rule: Rule | undefined, values: FormValues): boolean => !!formifyRule(rule, values);

/** "" when the rule is well-formed, else a human-readable problem. */
export const checkRule = (rule: unknown): string => formifyCheckRule(rule);

export const isFieldVisible = (field: FieldDef, values: FormValues): boolean => formifyVisible(field, values);
export const isFieldRequired = (field: FieldDef, values: FormValues): boolean => formifyRequired(field, values);
export const isInputField = (field: FieldDef): boolean => formifyIsInput(field);
export const isEmptyValue = (v: unknown): boolean => formifyIsEmpty(v);
export const defaultValueFor = (field: FieldDef): unknown => formifyDefault(field);

export const getVisibleFields = (schema: FormSchema, values: FormValues): FieldDef[] =>
  (schema.fields || []).filter((f) => isFieldVisible(f, values));

/** Adds computed values for `calculated` fields (never mutates `values`). */
export const computeValues = (schema: FormSchema, values: FormValues): FormValues => formifyCompute(schema, values);

export const getInitialValues = (schema: FormSchema): FormValues => formifyInitialValues(schema);

/** Steps (split at visible `pagebreak` fields). Always returns at least one step. */
export const getSteps = (schema: FormSchema, values: FormValues): FormStep[] => formifySteps(schema, values);

/** Typed submission payload: visible fields only; numbers as numbers, checkbox boolean, multiselect string[]. */
export const collectSubmission = (schema: FormSchema, values: FormValues): FormValues => formifyCollect(schema, values);
