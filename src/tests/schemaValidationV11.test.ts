import validateSchema from "../utils/schemaValidation";
import { collectSchemaIssues, FIELD_TYPES, FORMIFY_SCHEMA_REVISION, FORMIFY_SCHEMA_VERSION, migrateSchema } from "../utils/formifySchema";

const S = (fields: any[]) => ({ formTitle: "T", fields });
const opts = [{ value: "a", label: "A" }];

describe("schema v1.1", () => {
  test("revision constants; major version unchanged so v1 documents stay valid", () => {
    expect(FORMIFY_SCHEMA_VERSION).toBe(1);
    expect(FORMIFY_SCHEMA_REVISION).toBe("1.1");
    const v1 = { schemaVersion: 1, formTitle: "Old", fields: [{ id: "a", type: "text", label: "A", required: true }] };
    expect(() => validateSchema(v1)).not.toThrow();
    expect(migrateSchema(v1)).toEqual(v1);
  });

  test("every field type is accepted when well-formed", () => {
    const fields = FIELD_TYPES.map((type) => {
      const f: any = { id: `f_${type}`, type, label: type };
      if (["select", "radio", "multiselect"].includes(type)) f.options = opts;
      if (type === "calculated") f.formula = "1 + 1";
      return f;
    });
    expect(() => validateSchema(S(fields))).not.toThrow();
  });

  test("hidden fields need no label; others still do", () => {
    expect(() => validateSchema(S([{ id: "h", type: "hidden", defaultValue: "x" }]))).not.toThrow();
    expect(() => validateSchema(S([{ id: "t", type: "text" }]))).toThrow("Field 't' is missing a required 'label'.");
  });

  test("multiselect requires options", () => {
    expect(() => validateSchema(S([{ id: "m", type: "multiselect", label: "M" }]))).toThrow(/must include an 'options' array/);
  });

  test("calculated requires a parsable formula referencing known fields", () => {
    expect(() => validateSchema(S([{ id: "c", type: "calculated", label: "C" }]))).toThrow(/must include a 'formula'/);
    expect(() => validateSchema(S([{ id: "c", type: "calculated", label: "C", formula: "1 +" }]))).toThrow(/invalid formula/);
    expect(() => validateSchema(S([{ id: "c", type: "calculated", label: "C", formula: "nope * 2" }]))).toThrow(/unknown field 'nope'/);
    expect(() => validateSchema(S([{ id: "c", type: "calculated", label: "C", formula: "c + 1" }]))).toThrow(/reference itself/);
  });

  test("visibleIf / requiredIf are syntax- and reference-checked", () => {
    const base = { id: "a", type: "text", label: "A" };
    expect(() => validateSchema(S([base, { id: "b", type: "text", label: "B", visibleIf: "a == 'x'" }]))).not.toThrow();
    expect(() => validateSchema(S([base, { id: "b", type: "text", label: "B", visibleIf: { field: "a", op: "eq", value: 1 } }]))).not.toThrow();
    expect(() => validateSchema(S([base, { id: "b", type: "text", label: "B", visibleIf: "a ==" }]))).toThrow(/invalid 'visibleIf'/);
    expect(() => validateSchema(S([base, { id: "b", type: "text", label: "B", requiredIf: { field: "zzz", value: 1 } }]))).toThrow(/unknown field 'zzz'/);
    expect(() => validateSchema(S([{ id: "b", type: "text", label: "B", visibleIf: "b == 1" }]))).toThrow(/cannot reference itself/);
    expect(() => validateSchema(S([base, { id: "b", type: "text", label: "B", visibleIf: { field: "a", op: "wat" } }]))).toThrow(/Unknown rule operator/);
  });

  test("numeric bounds", () => {
    expect(() => validateSchema(S([{ id: "n", type: "number", label: "N", min: 5, max: 1 }]))).toThrow(/'min' cannot be greater than 'max'/);
    expect(() => validateSchema(S([{ id: "n", type: "slider", label: "N", min: "x" }]))).toThrow(/must be numbers/);
    expect(() => validateSchema(S([{ id: "r", type: "rating", label: "R", max: 11 }]))).toThrow(/integer from 1 to 10/);
    expect(() => validateSchema(S([{ id: "r", type: "rating", label: "R", max: 10 }]))).not.toThrow();
  });

  test("JSON Schema backstop catches wrong-typed new props", () => {
    expect(() => validateSchema(S([{ id: "f", type: "file", label: "F", maxSizeKB: "big" }]))).toThrow(/maxSizeKB/);
    expect(() => validateSchema(S([{ id: "c", type: "calculated", label: "C", formula: "1", precision: 99 }]))).toThrow(/precision/);
  });

  test("collectSchemaIssues reports multiple problems at once", () => {
    const issues = collectSchemaIssues(S([{ id: "m", type: "multiselect" }, { id: "c", type: "calculated" }]));
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  test("migrateSchema stamps version and leaves new fields untouched", () => {
    const s = S([{ id: "x", type: "rating", label: "X", max: 7, visibleIf: "a == 1" }]);
    expect(migrateSchema(s).fields).toEqual(s.fields);
    expect(migrateSchema(s).schemaVersion).toBe(1);
  });
});
