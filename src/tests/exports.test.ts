import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildRuntimeModule } from "../../scripts/engine-runtime.mjs";
import { FORMIFY_RUNTIME_JS, FORMIFY_RUNTIME_TS } from "../engine/runtimeSource.generated";
import { evaluateExpression, computeValues, getSteps, collectSubmission } from "../engine/logic";
import { formifyValidate } from "../engine/core";
import { generateHTMLCode, generateReactCode, generateWebComponentCode, ThemeSettings } from "../utils/codeGenerators";

const theme: ThemeSettings = { primaryColor: "indigo", borderRadius: "md", layout: "1-col", shadow: "md" };

const schema: any = {
  formTitle: "Order <b>form</b>",
  formDescription: "Tell us what you need",
  fields: [
    { id: "name", type: "text", label: "Name", required: true },
    { id: "pb", type: "pagebreak", label: "Details" },
    { id: "plan", type: "select", label: "Plan", options: [{ value: "free", label: "Free" }, { value: "pro", label: "Pro" }] },
    { id: "seats", type: "number", label: "Seats", min: 1, visibleIf: "plan == 'pro'", requiredIf: "plan == 'pro'" },
    { id: "price", type: "number", label: "Price" },
    { id: "qty", type: "number", label: "Qty" },
    { id: "total", type: "calculated", label: "Total", formula: "price * qty" },
    { id: "interests", type: "multiselect", label: "Interests", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    { id: "score", type: "rating", label: "Score" },
    { id: "vol", type: "slider", label: "Volume", min: 0, max: 10 },
    { id: "tos", type: "checkbox", label: "Accept terms", required: true }
  ]
};

describe("generated engine runtime", () => {
  test("runtimeSource.generated.ts is in sync with src/engine/core.ts (run `npm run gen:runtime`)", () => {
    const expected = buildRuntimeModule(readFileSync("src/engine/core.ts", "utf8"));
    const actual = readFileSync("src/engine/runtimeSource.generated.ts", "utf8");
    expect(actual.replace(/\r\n/g, "\n")).toBe(expected);
  });

  test("the JS flavour contains no TypeScript annotations and the TS flavour has no `export`", () => {
    expect(FORMIFY_RUNTIME_JS).not.toMatch(/:\s*any\b/);
    expect(FORMIFY_RUNTIME_JS).not.toMatch(/^export\s/m);
    expect(FORMIFY_RUNTIME_TS).toMatch(/: any/);
    expect(FORMIFY_RUNTIME_TS).not.toMatch(/^export\s/m);
  });

  test("the stripped JS runs standalone and agrees with the TS module", () => {
    const rt = new Function(`${FORMIFY_RUNTIME_JS}; return { formifyExpr, formifyCompute, formifySteps, formifyValidate, formifyCollect };`)();
    const exprs: Array<[string, any]> = [
      ["1 + 2 * 3", {}],
      ["a + b", { a: "2", b: 3 }],
      ["plan == 'pro' && seats > 5", { plan: "pro", seats: 8 }],
      ["round(price * qty * 1.2, 2)", { price: 9.99, qty: 3 }],
      ["contains(tags, 'x') ? 'yes' : 'no'", { tags: ["x"] }],
      ["sum(a, b, c) / 3", { a: 1, b: 2, c: 3 }],
      ["{odd-id} + 1", { "odd-id": 1 }]
    ];
    exprs.forEach(([e, v]) => expect(rt.formifyExpr(e, v)).toEqual(evaluateExpression(e, v)));
    const values = { name: "A", plan: "pro", seats: "2", price: "10", qty: "3", tos: true };
    expect(rt.formifyCompute(schema, values)).toEqual(computeValues(schema, values));
    expect(rt.formifySteps(schema, values)).toEqual(getSteps(schema, values));
    expect(rt.formifyCollect(schema, values)).toEqual(collectSubmission(schema, values));
    expect(rt.formifyValidate(schema, {}, null)).toEqual(formifyValidate(schema, {}, null));
  });
});

/** Boot a generated page's markup + inline script inside jsdom. */
function bootHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const script = Array.from(doc.querySelectorAll("script")).find((s) => !s.getAttribute("src"))!.textContent!;
  document.body.innerHTML = doc.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, "");
  new Function(script)();
  return document.querySelector("form[data-formify-form]") as HTMLFormElement;
}

const q = (form: Element, attr: string, id: string) =>
  Array.from(form.querySelectorAll(`[${attr}]`)).filter((e) => e.getAttribute(attr) === id) as HTMLElement[];
const input = (form: Element, id: string) => q(form, "data-input", id)[0] as HTMLInputElement;
const wrap = (form: Element, id: string) => q(form, "data-field", id)[0];
const setVal = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
const check = (el: HTMLInputElement, on = true) => {
  el.checked = on;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
const click = (form: Element, role: string) => (form.querySelector(`[data-formify-${role}]`) as HTMLElement).click();
const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
const text = (form: Element, attr: string, id: string) => q(form, attr, id)[0]?.textContent;

function exerciseForm(form: HTMLFormElement, onSubmit: ReturnType<typeof vi.fn>) {
  // step 1 only: name; progress + Next visible, Submit hidden
  expect(wrap(form, "name").hidden).toBe(false);
  expect(wrap(form, "plan").hidden).toBe(true);
  expect((form.querySelector("[data-formify-step]") as HTMLElement).textContent).toBe("Step 1 of 2");
  expect((form.querySelector("[data-formify-next]") as HTMLElement).hidden).toBe(false);
  expect((form.querySelector("[data-formify-submit]") as HTMLElement).hidden).toBe(true);

  // Next with an empty required field: error shown, step unchanged, announced
  click(form, "next");
  expect(text(form, "data-error", "name")).toBe("This field is required.");
  expect(input(form, "name").getAttribute("aria-invalid")).toBe("true");
  expect((form.querySelector("[data-formify-announcer]") as HTMLElement).textContent).toMatch(/Please fix 1 error/);
  expect(wrap(form, "plan").hidden).toBe(true);

  // fixing the field clears the error live; Next advances
  setVal(input(form, "name"), "Ada");
  expect(text(form, "data-error", "name")).toBe("");
  click(form, "next");
  expect(wrap(form, "name").hidden).toBe(true);
  expect(wrap(form, "plan").hidden).toBe(false);
  expect((form.querySelector("[data-formify-submit]") as HTMLElement).hidden).toBe(false);
  expect((form.querySelector("[data-formify-back]") as HTMLElement).hidden).toBe(false);

  // conditional field + conditional required marker
  expect(wrap(form, "seats").hidden).toBe(true);
  setVal(input(form, "plan"), "pro");
  expect(wrap(form, "seats").hidden).toBe(false);
  expect(q(form, "data-req", "seats")[0].hidden).toBe(false);
  expect(input(form, "seats").getAttribute("aria-required")).toBe("true");

  // calculated field
  setVal(input(form, "price"), "10");
  setVal(input(form, "qty"), "3");
  expect(text(form, "data-calc", "total")).toBe("30");

  // invalid submit jumps/stays, focuses first error and reports all
  submit(form);
  expect(text(form, "data-error", "seats")).toBe("This field is required.");
  expect(text(form, "data-error", "tos")).toBe("You must select this checkbox.");
  expect(onSubmit).not.toHaveBeenCalled();

  setVal(input(form, "seats"), "4");
  check(q(form, "data-input", "interests")[0] as HTMLInputElement);
  check(q(form, "data-input", "score")[3] as HTMLInputElement); // 4 stars
  setVal(input(form, "vol"), "7");
  check(input(form, "tos"));
  submit(form);

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: "Ada", plan: "pro", seats: 4, price: 10, qty: 3, total: 30, interests: ["a"], score: 4, vol: 7, tos: true
  });
  // form reset and back on step 1
  expect(wrap(form, "name").hidden).toBe(false);
  expect(input(form, "name").value).toBe("");
}

describe("HTML export", () => {
  test("behaves like the app: logic, calculated fields, steps, validation, typed output", () => {
    const html = generateHTMLCode(schema, theme);
    const form = bootHtml(html);
    const onSubmit = vi.fn();
    form.addEventListener("formify:submit", (e) => onSubmit((e as CustomEvent).detail));
    exerciseForm(form, onSubmit);
  });

  test("escapes labels, titles and schema JSON (no markup/script injection)", () => {
    const evil = { formTitle: "<script>alert(1)</script>", fields: [{ id: "x", type: "text", label: "<img src=x onerror=alert(1)>" }] };
    const html = generateHTMLCode(evil, theme);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // only our own scripts remain: tailwind CDN + the inline runtime
    expect((html.match(/<script/g) || []).length).toBe(2);
    expect(html).toContain("\\u003cscript\\u003ealert(1)");
  });

  test("renders every new field type", () => {
    const html = generateHTMLCode(schema, theme);
    ["type=\"range\"", "role=\"radiogroup\"", "data-calc=\"total\"", "data-formify-progress", "aria-live=\"polite\""].forEach((s) => expect(html).toContain(s));
  });

  test("a11y wiring: labels, describedby, required marks", () => {
    const form = bootHtml(generateHTMLCode({ formTitle: "T", fields: [{ id: "e", type: "email", label: "Email", required: true, description: "Work address" }] }, theme));
    const el = input(form, "e");
    const label = form.querySelector(`label[for="${el.id}"]`)!;
    expect(label.textContent).toContain("Email");
    const described = el.getAttribute("aria-describedby")!.split(" ");
    described.forEach((id) => expect(document.getElementById(id)).not.toBeNull());
    expect(el.getAttribute("aria-required")).toBe("true");
  });
});

describe("Web Component export", () => {
  test("defines <formify-form>, mounts, and emits typed formify-submit events", () => {
    new Function(generateWebComponentCode(schema, theme))();
    expect(customElements.get("formify-form")).toBeDefined();
    const el = document.createElement("formify-form");
    document.body.innerHTML = "";
    document.body.appendChild(el);
    const form = el.querySelector("form[data-formify-form]") as HTMLFormElement;
    expect(form).not.toBeNull();
    const onSubmit = vi.fn();
    el.addEventListener("formify-submit", (e) => onSubmit((e as CustomEvent).detail));
    exerciseForm(form, onSubmit);
    expect(typeof (el as any).getValues).toBe("function");
  });

  test("ships a usage header and does not leak globals", () => {
    const code = generateWebComponentCode(schema, theme);
    expect(code).toContain("<formify-form>");
    expect(code.trimEnd().endsWith("})();")).toBe(true);
  });
});

describe("React export", () => {
  const code = generateReactCode(schema, theme);

  test("is syntactically valid TSX", () => {
    const out = ts.transpileModule(code, {
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }
    });
    expect(out.diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  });

  test("inlines the engine, handles every type and conditional logic", () => {
    ["formifyValidate", "formifyCompute", "formifySteps", "formifyCollect", "useForm", "Controller",
      "case \"multiselect\"", "case \"rating\"", "case \"slider\"", "case \"file\"", "role=\"progressbar\""].forEach((s) => expect(code).toContain(s));
    expect(code).not.toMatch(/\beval\s*\(/);
  });

  test("embeds the schema as data (including logic expressions) and keeps strict-friendly `any` annotations", () => {
    expect(code).toContain("plan == 'pro'");
    expect(code).toContain("price * qty");
    expect(code).toContain("function formifyEval(node: any, values: any): any");
  });

  test("escapes hostile labels inside the embedded schema", () => {
    const evil = generateReactCode({ formTitle: "T", fields: [{ id: "x", type: "text", label: "</script><script>alert(1)" }] }, theme);
    expect(evil).not.toContain("</script><script>");
  });

  test("custom accent colour is applied", () => {
    expect(generateReactCode(schema, { ...theme, primaryColor: "#ff0000" })).toContain("--primary-accent: #ff0000");
  });
});
