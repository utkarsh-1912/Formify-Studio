import { validateValues, formifyResolver } from "../engine/validate";
import { formifyValidate } from "../engine/core";
import { FormSchema } from "../engine/logic";
import { fromFieldName, toFieldName } from "../engine/names";

const S = (fields: any[]): FormSchema => ({ formTitle: "T", fields });
const opts = [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: 3, label: "Three" }];

const kitchenSink = S([
  { id: "name", type: "text", label: "Name", required: true, validation: { minLength: 2, maxLength: 5 } },
  { id: "email", type: "email", label: "Email", required: true },
  { id: "phone", type: "phone", label: "Phone" },
  { id: "age", type: "number", label: "Age", min: 18, max: 99 },
  { id: "zip", type: "text", label: "Zip", validation: { pattern: "^[0-9]{5}$", message: "Zip must be 5 digits" } },
  { id: "dob", type: "date", label: "DOB", min: "1900-01-01", max: "2030-01-01" },
  { id: "plan", type: "select", label: "Plan", required: true, options: opts },
  { id: "pick", type: "radio", label: "Pick", options: opts },
  { id: "tags", type: "multiselect", label: "Tags", options: opts, min: 1, max: 2 },
  { id: "score", type: "rating", label: "Score", required: true },
  { id: "vol", type: "slider", label: "Vol", min: 0, max: 10 },
  { id: "doc", type: "file", label: "Doc", accept: "image/*,.pdf", maxSizeKB: 100, max: 2 },
  { id: "tos", type: "checkbox", label: "ToS", required: true },
  { id: "why", type: "textarea", label: "Why", visibleIf: "plan == 'b'", requiredIf: "plan == 'b'" },
  { id: "hid", type: "hidden", defaultValue: "x" }
]);

const goodValues = {
  name: "Ada", email: "ada@example.com", phone: "+1 (555) 123-4567", age: 30, zip: "12345", dob: "1990-05-17",
  plan: "a", pick: "b", tags: ["a"], score: 4, vol: 5, doc: [{ name: "x.pdf", size: 2048, type: "application/pdf" }], tos: true
};

describe("validateValues (AJV)", () => {
  test("valid submission has no errors", () => {
    expect(validateValues(kitchenSink, goodValues)).toEqual({});
  });

  test("required fields (empty, missing, whitespace, unchecked, zero rating)", () => {
    const e = validateValues(kitchenSink, { name: "  ", email: "", plan: "", score: 0, tos: false });
    expect(e.name).toBe("This field is required.");
    expect(e.email).toBe("This field is required.");
    expect(e.plan).toBe("Please choose an option.");
    expect(e.score).toBe("Please provide a rating.");
    expect(e.tos).toBe("You must select this checkbox.");
  });

  test("type-specific messages", () => {
    const e = validateValues(kitchenSink, { ...goodValues, email: "nope", phone: "12", age: "abc", dob: "2024-13-45", zip: "1" });
    expect(e.email).toBe("Enter a valid email address.");
    expect(e.phone).toBe("Enter a valid phone number.");
    expect(e.age).toBe("Enter a valid number.");
    expect(e.dob).toBe("Enter a valid date.");
    expect(e.zip).toBe("Zip must be 5 digits");
  });

  test("numeric bounds and text length", () => {
    expect(validateValues(kitchenSink, { ...goodValues, age: 17 }).age).toBe("Must be at least 18.");
    expect(validateValues(kitchenSink, { ...goodValues, age: 100 }).age).toBe("Must be at most 99.");
    expect(validateValues(kitchenSink, { ...goodValues, age: "42" }).age).toBeUndefined(); // numeric strings coerce
    expect(validateValues(kitchenSink, { ...goodValues, name: "A" }).name).toBe("Must be at least 2 characters.");
    expect(validateValues(kitchenSink, { ...goodValues, name: "Abcdefg" }).name).toBe("Must be at most 5 characters.");
  });

  test("date bounds", () => {
    expect(validateValues(kitchenSink, { ...goodValues, dob: "1800-01-01" }).dob).toBe("Date must be on or after 1900-01-01.");
    expect(validateValues(kitchenSink, { ...goodValues, dob: "2031-01-01" }).dob).toBe("Date must be on or before 2030-01-01.");
  });

  test("options: unknown values rejected, numeric option values matched by string", () => {
    expect(validateValues(kitchenSink, { ...goodValues, plan: "zzz" }).plan).toBe("Select a valid option.");
    expect(validateValues(kitchenSink, { ...goodValues, plan: "3" }).plan).toBeUndefined();
    expect(validateValues(kitchenSink, { ...goodValues, tags: ["a", "zzz"] }).tags).toBe("Select a valid option.");
  });

  test("multiselect / file counts", () => {
    expect(validateValues(kitchenSink, { ...goodValues, tags: ["a", "b", 3] }).tags).toBe("Select at most 2.");
    const one = { name: "x.pdf", size: 1, type: "application/pdf" };
    expect(validateValues(kitchenSink, { ...goodValues, doc: [one, one, one] }).doc).toBe("Attach at most 2 file(s).");
  });

  test("rating is an integer within 1..5 by default", () => {
    expect(validateValues(kitchenSink, { ...goodValues, score: 6 }).score).toBe("Must be at most 5.");
    expect(validateValues(kitchenSink, { ...goodValues, score: 2.5 }).score).toBe("Enter a valid number.");
  });

  test("file size and type", () => {
    const big = [{ name: "big.pdf", size: 500 * 1024, type: "application/pdf" }];
    const bad = [{ name: "x.exe", size: 10, type: "application/x-msdownload" }];
    const img = [{ name: "x.png", size: 10, type: "image/png" }];
    expect(validateValues(kitchenSink, { ...goodValues, doc: big }).doc).toBe("File is too large (max 100 KB).");
    expect(validateValues(kitchenSink, { ...goodValues, doc: bad }).doc).toBe("File type not allowed.");
    expect(validateValues(kitchenSink, { ...goodValues, doc: img }).doc).toBeUndefined(); // wildcard mime
  });

  test("hidden-by-logic fields are not validated; conditionally required fields are", () => {
    expect(validateValues(kitchenSink, goodValues).why).toBeUndefined(); // plan 'a' -> hidden
    expect(validateValues(kitchenSink, { ...goodValues, plan: "b" }).why).toBe("This field is required.");
    expect(validateValues(kitchenSink, { ...goodValues, plan: "b", why: "because" }).why).toBeUndefined();
  });

  test("a hidden required field with a bad value cannot block submit", () => {
    const s = S([
      { id: "a", type: "checkbox", label: "A" },
      { id: "b", type: "email", label: "B", required: true, visibleIf: "a == true" }
    ]);
    expect(validateValues(s, { a: false, b: "garbage" })).toEqual({});
    expect(validateValues(s, { a: true, b: "garbage" }).b).toBe("Enter a valid email address.");
  });

  test("onlyIds restricts reporting to a step", () => {
    const e = validateValues(kitchenSink, {}, ["name"]);
    expect(Object.keys(e)).toEqual(["name"]);
  });

  test("calculated values participate (e.g. requiredIf on a computed total)", () => {
    const s = S([
      { id: "qty", type: "number", label: "Qty" },
      { id: "total", type: "calculated", label: "Total", formula: "qty * 10" },
      { id: "approver", type: "text", label: "Approver", requiredIf: "total > 100" }
    ]);
    expect(validateValues(s, { qty: 5 }).approver).toBeUndefined();
    expect(validateValues(s, { qty: 20 }).approver).toBe("This field is required.");
  });

  test("an invalid user regex does not crash validation", () => {
    const s = S([{ id: "x", type: "text", label: "X", validation: { pattern: "([" } }]);
    expect(() => validateValues(s, { x: "abc" })).not.toThrow();
  });

  test("ids containing special characters work", () => {
    const s = S([{ id: "a/b~c.d", type: "text", label: "X", required: true }]);
    expect(validateValues(s, {})["a/b~c.d"]).toBe("This field is required.");
    expect(validateValues(s, { "a/b~c.d": "ok" })).toEqual({});
  });
});

describe("AJV validator and dependency-free export validator agree", () => {
  const cases: Array<[string, any]> = [
    ["valid", goodValues],
    ["all empty", {}],
    ["bad scalars", { ...goodValues, email: "x", phone: "1", age: 5, dob: "nope", zip: "abc", name: "A" }],
    ["bad choices", { ...goodValues, plan: "q", tags: ["a", "b", "c"], pick: "zzz", score: 9 }],
    ["files", { ...goodValues, doc: [{ name: "a.exe", size: 999999, type: "x/y" }] }],
    ["conditional", { ...goodValues, plan: "b" }],
    ["conditional ok", { ...goodValues, plan: "b", why: "ok" }],
    ["strings for numbers", { ...goodValues, age: "42", vol: "3", score: "2" }],
    ["checkbox string", { ...goodValues, tos: "true" }]
  ];
  test.each(cases)("%s", (_name, values) => {
    expect(formifyValidate(kitchenSink, values, null)).toEqual(validateValues(kitchenSink, values));
  });
});

describe("react-hook-form resolver", () => {
  const schema = S([
    { id: "a.b", type: "text", label: "AB", required: true },
    { id: "n", type: "number", label: "N", min: 1 }
  ]);
  const codec = { encode: toFieldName, decode: fromFieldName };

  test("name codec round-trips ids RHF would treat as paths", () => {
    ["a.b", "x[0]", "plain", "a.b[1].c"].forEach((id) => expect(fromFieldName(toFieldName(id))).toBe(id));
    expect(toFieldName("a.b[1]")).not.toMatch(/[.[\]]/);
  });

  test("returns encoded errors and empty values when invalid", async () => {
    const resolver = formifyResolver(schema, codec);
    const res: any = await resolver({ [toFieldName("a.b")]: "", n: 0 }, undefined, {} as any);
    expect(res.values).toEqual({});
    expect(res.errors[toFieldName("a.b")]).toEqual({ type: "validate", message: "This field is required." });
    expect(res.errors.n.message).toBe("Must be at least 1.");
  });

  test("returns values when valid", async () => {
    const resolver = formifyResolver(schema, codec);
    const input = { [toFieldName("a.b")]: "hi", n: 2 };
    const res: any = await resolver(input, undefined, {} as any);
    expect(res.errors).toEqual({});
    expect(res.values).toEqual(input);
  });
});
