import { FORMIFY_RUNTIME_JS, FORMIFY_RUNTIME_TS } from "../engine/runtimeSource.generated";
import { FORMIFY_DOM_RUNTIME_JS } from "../engine/domRuntime";
import { esc, renderFieldHtml, renderFormCard, safeJson, MarkupClasses } from "./exportMarkup";

export interface ThemeSettings {
  primaryColor: string;
  borderRadius: string;
  layout: "1-col" | "2-col";
  shadow: string;
}

export const getThemeClasses = (theme: ThemeSettings) => {
  const colorMap: Record<string, { bg: string; text: string; ring: string; border: string; hover: string }> = {
    indigo: {
      bg: "bg-indigo-600",
      text: "text-indigo-600",
      ring: "focus:ring-indigo-500",
      border: "border-indigo-600",
      hover: "hover:bg-indigo-700"
    },
    emerald: {
      bg: "bg-emerald-600",
      text: "text-emerald-600",
      ring: "focus:ring-emerald-500",
      border: "border-emerald-600",
      hover: "hover:bg-emerald-700"
    },
    violet: {
      bg: "bg-violet-600",
      text: "text-violet-600",
      ring: "focus:ring-violet-500",
      border: "border-violet-600",
      hover: "hover:bg-violet-700"
    },
    rose: {
      bg: "bg-rose-600",
      text: "text-rose-600",
      ring: "focus:ring-rose-500",
      border: "border-rose-600",
      hover: "hover:bg-rose-700"
    },
    amber: {
      bg: "bg-amber-600",
      text: "text-amber-600",
      ring: "focus:ring-amber-500",
      border: "border-amber-600",
      hover: "hover:bg-amber-700"
    },
    blue: {
      bg: "bg-blue-600",
      text: "text-blue-600",
      ring: "focus:ring-blue-500",
      border: "border-blue-600",
      hover: "hover:bg-blue-700"
    },
    slate: {
      bg: "bg-slate-700",
      text: "text-slate-700",
      ring: "focus:ring-slate-500",
      border: "border-slate-700",
      hover: "hover:bg-slate-800"
    }
  };

  const radiusMap: Record<string, string> = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-3xl"
  };

  const shadowMap: Record<string, string> = {
    none: "shadow-none",
    sm: "shadow-sm",
    md: "shadow-md",
    lg: "shadow-lg"
  };

  const selectedColor = colorMap[theme.primaryColor] || {
    bg: "custom-accent-bg",
    text: "custom-accent-text",
    ring: "custom-accent-ring focus:ring-2 focus:ring-offset-0",
    border: "custom-accent-border",
    hover: "custom-accent-bg-hover"
  };
  const selectedRadius = radiusMap[theme.borderRadius] || radiusMap.md;
  const selectedShadow = shadowMap[theme.shadow] || shadowMap.md;

  return {
    button: `${selectedColor.bg} ${selectedColor.hover} text-white font-medium ${selectedRadius} ${selectedShadow} transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${selectedColor.ring}`,
    input: `w-full p-2.5 border border-gray-300 ${selectedRadius} focus:border-transparent focus:outline-none focus:ring-2 focus:ring-offset-0 ${selectedColor.ring} transition-all duration-150 text-gray-900 bg-white`,
    checkbox: `${selectedRadius} ${selectedColor.text} border-gray-300 focus:ring-0 focus:ring-offset-0 transition-all duration-150 h-5 w-5`,
    radio: `h-5 w-5 ${selectedColor.text} border-gray-300 focus:ring-0 transition-all duration-150`,
    label: "block text-sm font-semibold text-gray-700 mb-1.5",
    card: `bg-white p-8 ${selectedRadius} ${selectedShadow} border border-gray-100`
  };
};

const colorMapHex: Record<string, string> = {
  indigo: "#4f46e5",
  blue: "#2563eb",
  emerald: "#059669",
  violet: "#7c3aed",
  rose: "#e11d48",
  amber: "#f59e0b",
  slate: "#334155"
};

const accentHex = (theme: ThemeSettings) =>
  theme.primaryColor.startsWith("#") ? theme.primaryColor : colorMapHex[theme.primaryColor] || "#4f46e5";

const accentCss = (hex: string, indent = "    ") =>
  [
    `:root { --primary-accent: ${hex}; }`,
    `.custom-accent-bg { background-color: var(--primary-accent) !important; }`,
    `.custom-accent-bg-hover:hover { background-color: var(--primary-accent) !important; filter: brightness(0.95); }`,
    `.custom-accent-text { color: var(--primary-accent) !important; }`,
    `.custom-accent-border { border-color: var(--primary-accent) !important; }`,
    `.custom-accent-ring:focus { --tw-ring-color: var(--primary-accent) !important; border-color: var(--primary-accent) !important; }`
  ]
    .map((l) => indent + l)
    .join("\n");

const layoutClassFor = (theme: ThemeSettings) =>
  theme.layout === "2-col" ? "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 space-y-0" : "space-y-6";

const buildMarkup = (schema: any, theme: ThemeSettings) => {
  const tc = getThemeClasses(theme) as MarkupClasses;
  const fieldsMarkup = (schema.fields || [])
    .map((f: any, i: number) => renderFieldHtml(f, i, tc))
    .filter(Boolean)
    .join("\n\n");
  return renderFormCard(tc, {
    title: schema.formTitle || "Untitled Form",
    description: schema.formDescription,
    layoutClass: layoutClassFor(theme),
    fieldsMarkup
  });
};

/** Schema with a version stamp, as embedded in exports. */
const exportSchema = (schema: any) => ({ schemaVersion: 1, ...schema });

/**
 * Standalone HTML page. Works without a build step: Tailwind via CDN, plus the Formify engine and DOM runtime
 * inlined so conditional logic, calculated fields, multi-step navigation and validation all work offline.
 * Submissions are emitted as a `formify:submit` DOM event (and logged to the console by default).
 */
export const generateHTMLCode = (schema: any, theme: ThemeSettings): string => {
  const hex = accentHex(theme);
  return `<!DOCTYPE html>
<html lang="en" class="h-full bg-gray-50">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(schema.formTitle || "Formify Dynamic Form")}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
${accentCss(hex)}
  </style>
</head>
<body class="h-full">
  <div class="max-w-2xl mx-auto py-12 px-4">
${buildMarkup(schema, theme)}
  </div>

  <script>
    // --- Formify engine (conditional logic, calculated fields, validation) ---
${FORMIFY_RUNTIME_JS}
    // --- DOM runtime ---
${FORMIFY_DOM_RUNTIME_JS}
    // --- Form definition ---
    var FORMIFY_SCHEMA = ${safeJson(exportSchema(schema), 2)};
    var form = document.querySelector("[data-formify-form]");
    formifyMount(form, FORMIFY_SCHEMA);
    // Listen for submissions: form.addEventListener("formify:submit", function (e) { fetch("/api", { method: "POST", body: JSON.stringify(e.detail) }) });
  </script>
</body>
</html>
`;
};

/**
 * Embeddable Web Component (`<formify-form>`): one self-contained script, no framework required.
 * Needs Tailwind CSS on the host page (play CDN or your own build). Emits a bubbling `formify-submit`
 * CustomEvent whose `detail` is the typed submission.
 */
export const generateWebComponentCode = (schema: any, theme: ThemeSettings): string => {
  const hex = accentHex(theme);
  return `/**
 * <formify-form> — generated by Formify Studio.
 * Usage:   <script src="formify-form.js"></script>   <formify-form></formify-form>
 * Events:  el.addEventListener("formify-submit", (e) => console.log(e.detail));
 * Styling: requires Tailwind CSS on the page (e.g. <script src="https://cdn.tailwindcss.com"></script>).
 */
(function () {
  // --- Formify engine ---
${FORMIFY_RUNTIME_JS}
  // --- DOM runtime ---
${FORMIFY_DOM_RUNTIME_JS}
  var FORMIFY_SCHEMA = ${safeJson(exportSchema(schema), 2)};
  var FORMIFY_ACCENT_CSS = ${safeJson(accentCss(hex, ""))};
  var FORMIFY_TEMPLATE = ${safeJson(buildMarkup(schema, theme))};

  class FormifyForm extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      this.innerHTML = '<style>' + FORMIFY_ACCENT_CSS + '</style>' + FORMIFY_TEMPLATE;
      this._api = formifyMount(this.querySelector("[data-formify-form]"), FORMIFY_SCHEMA, {
        onSubmit: (payload) => {
          this.dispatchEvent(new CustomEvent("formify-submit", { detail: payload, bubbles: true, composed: true }));
        }
      });
    }
    disconnectedCallback() {
      if (this._api) { this._api.destroy(); this._api = null; this._mounted = false; }
    }
    getValues() { return this._api ? this._api.getValues() : {}; }
  }

  if (!customElements.get("formify-form")) customElements.define("formify-form", FormifyForm);
})();
`;
};

/**
 * React + react-hook-form component. The Formify engine is inlined (so the file is self-contained) and a small
 * data-driven <Field/> renders every field type from the `schema` constant — edit the schema, not the markup.
 */
export const generateReactCode = (schema: any, theme: ThemeSettings): string => {
  const tc = getThemeClasses(theme);
  const hex = accentHex(theme);
  const layoutClass = layoutClassFor(theme);
  const ui = {
    label: tc.label,
    input: tc.input,
    checkbox: tc.checkbox,
    radio: tc.radio,
    button: tc.button
  };
  const css = accentCss(hex, "        ");

  return `import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";

// ─── Form definition (edit freely) ───────────────────────────────────────────────────────────────
// Field ids should not contain "." or "[" (react-hook-form treats them as nested paths).
const schema: any = ${safeJson(exportSchema(schema), 2)};

// ─── Tailwind classes from your theme ────────────────────────────────────────────────────────────
const UI: any = ${safeJson(ui, 2)};

// ─── Formify engine (generated — conditional logic, calculated fields, validation) ───────────────
${FORMIFY_RUNTIME_TS}
// ─── End engine ──────────────────────────────────────────────────────────────────────────────────

function Field({ field, control, values, error }: any) {
  const id = "f-" + String(field.id).replace(/[^A-Za-z0-9_-]/g, "_");
  const required = formifyRequired(field, values);
  const describedBy = (field.description ? id + "-desc " : "") + (error ? id + "-err" : "");
  const a11y: any = {
    "aria-required": required || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };
  const label = (
    <>
      {field.label}
      {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
    </>
  );
  const footer = (
    <>
      {field.description && <p id={id + "-desc"} className="mt-1 text-xs text-gray-500">{field.description}</p>}
      {error && <p id={id + "-err"} role="alert" className="mt-1 text-sm font-medium text-red-600">{error}</p>}
    </>
  );

  if (field.type === "pagebreak" || field.type === "hidden") return null;
  if (field.type === "section") {
    return (
      <div className="md:col-span-2 pt-2">
        <h3 className="text-lg font-bold text-gray-900">{field.label}</h3>
        {footer}
      </div>
    );
  }
  if (field.type === "calculated") {
    const v = values[field.id];
    return (
      <div>
        <span id={id + "-label"} className={UI.label}>{field.label}</span>
        <output aria-labelledby={id + "-label"} aria-live="polite" className="block text-lg font-semibold text-gray-900">
          {v === "" || v === undefined || v === null ? "—" : String(v)}
        </output>
        {footer}
      </div>
    );
  }

  const options: any[] = field.options || [];
  return (
    <Controller
      control={control}
      name={field.id}
      defaultValue={formifyDefault(field)}
      render={({ field: rhf }: any) => {
        const v = rhf.value;
        switch (field.type) {
          case "textarea":
            return (
              <div>
                <label htmlFor={id} className={UI.label}>{label}</label>
                <textarea {...a11y} ref={rhf.ref} id={id} rows={4} placeholder={field.placeholder} value={v ?? ""} onChange={(e) => rhf.onChange(e.target.value)} onBlur={rhf.onBlur} className={UI.input} />
                {footer}
              </div>
            );
          case "select":
            return (
              <div>
                <label htmlFor={id} className={UI.label}>{label}</label>
                <select {...a11y} ref={rhf.ref} id={id} value={v === undefined || v === null ? "" : String(v)} onChange={(e) => rhf.onChange(e.target.value)} onBlur={rhf.onBlur} className={UI.input}>
                  <option value="">Select option...</option>
                  {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                </select>
                {footer}
              </div>
            );
          case "radio":
            return (
              <fieldset {...a11y} role="radiogroup" className="border-0 p-0 m-0 min-w-0">
                <legend className={UI.label}>{label}</legend>
                <div className="mt-2 space-y-2">
                  {options.map((o, i) => (
                    <label key={String(o.value)} className="flex items-center space-x-3 cursor-pointer">
                      <input type="radio" ref={i === 0 ? rhf.ref : undefined} name={field.id} checked={String(v ?? "") === String(o.value)} onChange={() => rhf.onChange(o.value)} onBlur={rhf.onBlur} className={UI.radio} />
                      <span className="text-sm font-medium text-gray-700">{o.label}</span>
                    </label>
                  ))}
                </div>
                {footer}
              </fieldset>
            );
          case "multiselect": {
            const sel: any[] = Array.isArray(v) ? v : [];
            return (
              <fieldset {...a11y} className="border-0 p-0 m-0 min-w-0">
                <legend className={UI.label}>{label}</legend>
                <div className="mt-2 space-y-2">
                  {options.map((o, i) => {
                    const on = sel.some((s) => String(s) === String(o.value));
                    return (
                      <label key={String(o.value)} className="flex items-center space-x-3 cursor-pointer">
                        <input type="checkbox" ref={i === 0 ? rhf.ref : undefined} checked={on} onChange={(e) => rhf.onChange(e.target.checked ? [...sel, o.value] : sel.filter((s) => String(s) !== String(o.value)))} onBlur={rhf.onBlur} className={UI.checkbox} />
                        <span className="text-sm font-medium text-gray-700">{o.label}</span>
                      </label>
                    );
                  })}
                </div>
                {footer}
              </fieldset>
            );
          }
          case "checkbox":
            return (
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input {...a11y} type="checkbox" ref={rhf.ref} id={id} checked={v === true || v === "true"} onChange={(e) => rhf.onChange(e.target.checked)} onBlur={rhf.onBlur} className={UI.checkbox} />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor={id} className="font-medium text-gray-700 cursor-pointer">{label}</label>
                  {footer}
                </div>
              </div>
            );
          case "slider": {
            const lo = field.min !== undefined ? Number(field.min) : 0;
            const hi = field.max !== undefined ? Number(field.max) : 100;
            const n = v === "" || v === undefined || v === null || isNaN(Number(v)) ? lo : Number(v);
            return (
              <div>
                <label htmlFor={id} className={UI.label}>{label}<output className="ml-2 font-bold">{n}</output></label>
                <input {...a11y} ref={rhf.ref} id={id} type="range" min={lo} max={hi} step={field.step || 1} value={n} onChange={(e) => rhf.onChange(Number(e.target.value))} onBlur={rhf.onBlur} className="w-full cursor-pointer" />
                {footer}
              </div>
            );
          }
          case "rating": {
            const max = field.max !== undefined ? Math.max(1, Math.min(10, Number(field.max))) : 5;
            const cur = Number(v) || 0;
            return (
              <div role="radiogroup" {...a11y}>
                <span className={UI.label}>{label}</span>
                <div className="flex gap-1">
                  {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={cur === n} aria-label={n + " of " + max} onClick={() => rhf.onChange(n)} className={"text-2xl leading-none focus:outline-none focus:ring-2 rounded " + (n <= cur ? "text-amber-500" : "text-gray-300")}>
                      {n <= cur ? "★" : "☆"}
                    </button>
                  ))}
                </div>
                {footer}
              </div>
            );
          }
          case "file":
            return (
              <div>
                <label htmlFor={id} className={UI.label}>{label}</label>
                <input {...a11y} ref={rhf.ref} id={id} type="file" multiple={Number(field.max) > 1} accept={field.accept} onChange={(e) => rhf.onChange(Array.from(e.target.files || []).map((f: any) => ({ name: f.name, size: f.size, type: f.type })))} onBlur={rhf.onBlur} className={UI.input} />
                {footer}
              </div>
            );
          default: {
            // text, email, number, phone, date
            const type = field.type === "phone" ? "tel" : field.type;
            return (
              <div>
                <label htmlFor={id} className={UI.label}>{label}</label>
                <input {...a11y} ref={rhf.ref} id={id} type={type} placeholder={field.placeholder} min={field.min} max={field.max} step={field.step} value={v ?? ""} onChange={(e) => rhf.onChange(e.target.value)} onBlur={rhf.onBlur} className={UI.input} />
                {footer}
              </div>
            );
          }
        }
      }}
    />
  );
}

export default function GeneratedForm() {
  const [stepIndex, setStepIndex] = useState(0);
  const [submitted, setSubmitted] = useState<any>(null);
  const { control, handleSubmit, trigger, reset, watch, formState: { errors } } = useForm<any>({
    defaultValues: formifyInitialValues(schema),
    mode: "onTouched",
    resolver: async (values: any) => {
      const errs: any = formifyValidate(schema, values, null);
      const ids = Object.keys(errs);
      if (ids.length === 0) return { values, errors: {} };
      const out: any = {};
      ids.forEach((id) => { out[id] = { type: "validate", message: errs[id] }; });
      return { values: {}, errors: out };
    },
  });

  const values = formifyCompute(schema, watch());
  const steps = formifySteps(schema, values);
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const next = async () => {
    const ids = step.fields.filter((f: any) => formifyIsInput(f)).map((f: any) => f.id);
    if (ids.length === 0 || (await trigger(ids))) setStepIndex(index + 1);
  };

  const onSubmit = (data: any) => {
    const payload = formifyCollect(schema, data);
    console.log("Form submitted:", payload); // TODO: send to your API
    setSubmitted(payload);
    reset(formifyInitialValues(schema));
    setStepIndex(0);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <style>{\`
${css}
      \`}</style>
      <div className="${tc.card}">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{schema.formTitle}</h2>
          {schema.formDescription && <p className="mt-1.5 text-sm text-gray-500">{schema.formDescription}</p>}
        </div>

        {steps.length > 1 && (
          <div className="mb-6">
            <div role="progressbar" aria-label="Form progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-valuetext={"Step " + (index + 1) + " of " + steps.length} className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full custom-accent-bg" style={{ width: ((index + 1) / steps.length) * 100 + "%" }} />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-gray-900">
              Step {index + 1} of {steps.length}{step.title ? " — " + step.title : ""}
            </h3>
          </div>
        )}

        {submitted && <p role="status" className="mb-4 text-sm font-medium text-emerald-600">Thanks! Your response was recorded.</p>}

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!isLast) { void next(); return; }
            void handleSubmit(onSubmit)(e);
          }}
          className="space-y-6"
        >
          <div className="${layoutClass}">
            {step.fields.map((field: any) => (
              <Field key={field.id} field={field} control={control} values={values} error={(errors as any)[field.id]?.message} />
            ))}
          </div>
          <div className="pt-2 flex gap-3">
            {steps.length > 1 && index > 0 && (
              <button type="button" onClick={() => setStepIndex(index - 1)} className="px-5 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700">Back</button>
            )}
            {isLast ? (
              <button type="submit" className={"w-full py-3 px-4 " + UI.button}>Submit Form</button>
            ) : (
              <button type="button" onClick={() => void next()} className={"w-full py-3 px-4 " + UI.button}>Next</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
`;
};
