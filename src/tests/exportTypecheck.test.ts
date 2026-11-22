import path from "node:path";
import ts from "typescript";
import { generateReactCode, ThemeSettings } from "../utils/codeGenerators";

const theme: ThemeSettings = { primaryColor: "indigo", borderRadius: "md", layout: "2-col", shadow: "md" };

const schema: any = {
  formTitle: "Everything",
  fields: [
    { id: "name", type: "text", label: "Name", required: true },
    { id: "sec", type: "section", label: "Details" },
    { id: "pb", type: "pagebreak", label: "Step 2" },
    { id: "email", type: "email", label: "Email" },
    { id: "phone", type: "phone", label: "Phone" },
    { id: "n", type: "number", label: "N", min: 1, max: 5 },
    { id: "d", type: "date", label: "D" },
    { id: "t", type: "textarea", label: "T" },
    { id: "s", type: "select", label: "S", options: [{ value: "a", label: "A" }] },
    { id: "r", type: "radio", label: "R", options: [{ value: "a", label: "A" }] },
    { id: "m", type: "multiselect", label: "M", options: [{ value: "a", label: "A" }] },
    { id: "star", type: "rating", label: "Star" },
    { id: "sl", type: "slider", label: "Sl", min: 0, max: 10 },
    { id: "f", type: "file", label: "F", accept: ".pdf", max: 2 },
    { id: "c", type: "checkbox", label: "C" },
    { id: "h", type: "hidden", defaultValue: "x" },
    { id: "calc", type: "calculated", label: "Calc", formula: "n * 2", visibleIf: "n > 0" }
  ]
};

describe("React export type-checks under strict mode", () => {
  test("generated GeneratedForm.tsx has zero TypeScript errors", () => {
    const file = path.resolve(process.cwd(), "__generated__", "GeneratedForm.tsx");
    const source = generateReactCode(schema, theme);
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      skipLibCheck: true,
      lib: ["lib.dom.d.ts", "lib.dom.iterable.d.ts", "lib.es2020.d.ts"],
      types: []
    };
    const host = ts.createCompilerHost(options);
    const origGet = host.getSourceFile.bind(host);
    const origRead = host.readFile.bind(host);
    const origExists = host.fileExists.bind(host);
    host.fileExists = (f) => path.resolve(f) === file || origExists(f);
    host.readFile = (f) => (path.resolve(f) === file ? source : origRead(f));
    host.getSourceFile = (f, lang, ...rest) =>
      path.resolve(f) === file ? ts.createSourceFile(f, source, lang, true, ts.ScriptKind.TSX) : origGet(f, lang, ...rest);
    const program = ts.createProgram([file], options, host);
    const diags = ts.getPreEmitDiagnostics(program).filter((d) => !d.file || path.resolve(d.file.fileName) === file);
    expect(diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  }, 120_000);
});
