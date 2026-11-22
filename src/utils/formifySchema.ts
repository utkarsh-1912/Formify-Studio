import Ajv, { ErrorObject } from "ajv";

/** Current version of the Formify JSON schema format. Bump on breaking changes and add a migration. */
export const FORMIFY_SCHEMA_VERSION = 1;

export const FIELD_TYPES = [
  "text",
  "email",
  "number",
  "select",
  "radio",
  "checkbox",
  "textarea",
  "date"
] as const;

/** Formal JSON Schema (draft-07 compatible) describing a Formify form definition v1. */
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
        required: ["id", "type", "label"],
        properties: {
          id: { type: "string", minLength: 1 },
          type: { enum: [...FIELD_TYPES] },
          label: { type: "string" },
          required: { type: "boolean" },
          placeholder: { type: "string" },
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
              message: { type: "string" }
            }
          }
        },
        if: { properties: { type: { enum: ["select", "radio"] } }, required: ["type"] },
        then: { required: ["options"] }
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
