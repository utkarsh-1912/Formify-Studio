import { collectSchemaIssues, migrateSchema, FORMIFY_SCHEMA_VERSION } from "../utils/formifySchema";
import validateSchema from "../utils/schemaValidation";

const base = { formTitle: "T", fields: [{ id: "a", type: "text", label: "A" }] };

describe("formifySchema v1", () => {
  test("valid schema has no issues", () => {
    expect(collectSchemaIssues(base)).toEqual([]);
  });

  test("reports every structural issue", () => {
    const issues = collectSchemaIssues({ fields: [{ id: "", type: "nope" }] });
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  test("select without options is rejected", () => {
    const s = { formTitle: "T", fields: [{ id: "a", type: "select", label: "A" }] };
    expect(collectSchemaIssues(s).length).toBeGreaterThan(0);
  });

  test("validateSchema accepts valid and rejects wrong-typed required flag", () => {
    expect(() => validateSchema(base)).not.toThrow();
    const bad = { formTitle: "T", fields: [{ id: "a", type: "text", label: "A", required: "yes" }] };
    expect(() => validateSchema(bad)).toThrow(/required/);
  });
});

describe("migrateSchema", () => {
  test("stamps current version without mutating input", () => {
    const out = migrateSchema(base);
    expect(out.schemaVersion).toBe(FORMIFY_SCHEMA_VERSION);
    expect("schemaVersion" in base).toBe(false);
  });

  test("rejects schemas from the future", () => {
    expect(() => migrateSchema({ ...base, schemaVersion: 99 })).toThrow(/newer/);
  });
});
