import Ajv, { ErrorObject } from "ajv";

/** Major version of the Formify JSON schema format. Bump ONLY on breaking changes and add a migration. */
export const FORMIFY_SCHEMA_VERSION = 1;

/**
 * Revision within the major version. 1.1 is purely additive (new field types, conditional logic,
 * calculated fields, multi-step via `pagebreak`), so existing v1 documents stay valid unchanged and
 * `schemaVersion` remains 1.
 */
export const FORMIFY_SCHEMA_REVISION = "1.1";

export const FIELD_TYPES = [
  "text",
  "email",
  "number",
  "select",
  "radio",
  "checkbox",
  "textarea",
  "date",
  // v1.1
  "multiselect",
  "rating",
  "slider",
  "file",
  "phone",
  "section",
  "pagebreak",
  "hidden",
  "calculated"
] as const;

/** Types that carry no user input (layout / derived). */
export const NON_INPUT_TYPES = ["section", "pagebreak", "hidden", "calculated"] as const;

const ruleSchema = {
  anyOf: [
    { type: "boolean" },
    { type: "string" },
    {
      type: "object",
      anyOf: [{ required: ["field"] }, { required: ["all"] }, { required: ["any"] }, { required: ["not"] }]
    }
  ]
} as const;

/** Formal JSON Schema (draft-07 compatible) describing a Formify form definition v1 (revision 1.1). */
export const formifySchemaV1 = {
  $id: "https://formify.dev/schema/v1.json",
  type: "object",
  required: ["formTitle", "fields"],
  properties: {
    schemaVersion: { type: "integer", minimum: 1 },
    formTitle: { type: "string", minLength: 1 },
    formDescription: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "type"],
        properties: {
          id: { type: "string", minLength: 1 },
          type: { enum: [...FIELD_TYPES] },
          label: { type: "string" },
          description: { type: "string" },
          required: { type: "boolean" },
          placeholder: { type: "string" },
          min: { type: ["number", "string"] },
          max: { type: ["number", "string"] },
          step: { type: "number", exclusiveMinimum: 0 },
          accept: { type: "string" },
          maxSizeKB: { type: "number", exclusiveMinimum: 0 },
          visibleIf: ruleSchema,
          requiredIf: ruleSchema,
          formula: { type: "string", minLength: 1 },
          precision: { type: "integer", minimum: 0, maximum: 10 },
          options: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["value", "label"],
              properties: { label: { type: "string" } }
            }
          },
          validation: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              message: { type: "string" },
              minLength: { type: "integer", minimum: 0 },
              maxLength: { type: "integer", minimum: 0 }
            }
          }
        },
        allOf: [
          {
            if: { properties: { type: { enum: ["select", "radio", "multiselect"] } }, required: ["type"] },
            then: { required: ["options"] }
          },
          {
            if: { properties: { type: { const: "calculated" } }, required: ["type"] },
            then: { required: ["formula"] }
          },
          {
            if: { properties: { type: { const: "hidden" } }, required: ["type"] },
            else: { required: ["label"] }
          }
        ]
      }
    }
  }
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
const compiled = ajv.compile(formifySchemaV1);

export interface SchemaIssue {
  path: string;
  message: string;
}

const toIssue = (e: ErrorObject): SchemaIssue => ({
  path: e.instancePath || "/",
  message: e.message ?? "invalid"
});

/** Structural validation via AJV. Returns every issue (empty array when valid). */
export function collectSchemaIssues(schema: unknown): SchemaIssue[] {
  return compiled(schema) ? [] : (compiled.errors ?? []).map(toIssue);
}

/**
 * Upgrade a schema of any known version to the current one.
 * Pure: never mutates the input. Unversioned schemas are treated as v1.
 * Revision 1.0 -> 1.1 needs no data migration (additive), so v1 documents pass through unchanged.
 */
export function migrateSchema<T extends Record<string, any>>(schema: T): T & { schemaVersion: number } {
  const version = typeof schema?.schemaVersion === "number" ? schema.schemaVersion : 1;
  if (version > FORMIFY_SCHEMA_VERSION) {
    throw new Error(
      `Schema version ${version} is newer than this app supports (${FORMIFY_SCHEMA_VERSION}). Please update Formify.`
    );
  }
  // Future: chain migrations here, e.g. if (version < 2) schema = v1ToV2(schema);
  return { ...schema, schemaVersion: FORMIFY_SCHEMA_VERSION };
}
