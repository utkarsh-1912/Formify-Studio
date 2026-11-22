import type { FieldDef } from "../engine/logic";

/** Escape text/attribute content for safe embedding in generated HTML. */
export const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** JSON that is safe inside a <script> block or JS string. */
export const safeJson = (value: unknown, space?: number): string =>
  JSON.stringify(value, null, space)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");

export interface MarkupClasses {
  label: string;
  input: string;
  checkbox: string;
  radio: string;
  button: string;
  card: string;
}

const sanitizeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");

/** Markup for one field. The `data-*` hooks are the contract with engine/domRuntime.ts. */
export function renderFieldHtml(field: FieldDef, index: number, tc: MarkupClasses): string {
  if (field.type === "pagebreak" || field.type === "hidden") return "";
  const id = esc(field.id);
  const fid = `ff${index}-${sanitizeId(field.id)}`;
  const star = `<span data-req="${id}" class="text-red-500 ml-1" aria-hidden="true"${field.required ? "" : " hidden"}>*</span>`;
  const hasDesc = !!field.description;
  const describedBy = `${hasDesc ? `${fid}-desc ` : ""}${fid}-err`;
  const desc = hasDesc ? `<p id="${fid}-desc" class="mt-1 text-xs text-gray-500">${esc(field.description)}</p>` : "";
  const err = `<p id="${fid}-err" data-error="${id}" role="alert" class="mt-1 text-sm font-medium text-red-600" hidden></p>`;
  const common = `data-input="${id}" name="${id}" aria-describedby="${describedBy}"${field.required ? ' aria-required="true"' : ""}`;
  const wrap = (inner: string, cls = "") =>
    `        <!-- Field: ${esc(field.id)} -->\n        <div data-field="${id}"${cls ? ` class="${cls}"` : ""}>\n${inner}\n        </div>`;
  const label = (forId: string) =>
    `          <label for="${forId}" class="${tc.label}">${esc(field.label)}${star}</label>`;
  const options = field.options || [];

  switch (field.type) {
    case "section":
      return wrap(
        `          <h3 class="text-lg font-bold text-gray-900">${esc(field.label)}</h3>\n          ${desc}`,
        "md:col-span-2 pt-2"
      );

    case "calculated":
      return wrap(
        `          <span id="${fid}-label" class="${tc.label}">${esc(field.label)}</span>\n          <output aria-labelledby="${fid}-label" aria-live="polite" data-calc="${id}" class="block text-lg font-semibold text-gray-900">—</output>\n          ${desc}`
      );

    case "text":
    case "email":
    case "number":
    case "phone":
    case "date": {
      const t = field.type === "phone" ? "tel" : field.type;
      const attrs = [
        field.placeholder ? `placeholder="${esc(field.placeholder)}"` : "",
        field.type === "phone" ? 'inputmode="tel" autocomplete="tel"' : "",
        field.type === "email" ? 'autocomplete="email"' : "",
        (field.type === "number" || field.type === "date") && field.min !== undefined ? `min="${esc(field.min)}"` : "",
        (field.type === "number" || field.type === "date") && field.max !== undefined ? `max="${esc(field.max)}"` : "",
        field.type === "number" && field.step ? `step="${esc(field.step)}"` : ""
      ].filter(Boolean).join(" ");
      return wrap(
        `${label(fid)}\n          <input id="${fid}" type="${t}" ${common} ${attrs} class="${tc.input}" />\n          ${desc}\n          ${err}`
      );
    }

    case "textarea":
      return wrap(
        `${label(fid)}\n          <textarea id="${fid}" rows="4" ${common}${field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : ""} class="${tc.input}"></textarea>\n          ${desc}\n          ${err}`
      );

    case "select":
      return wrap(
        `${label(fid)}\n          <select id="${fid}" ${common} class="${tc.input}">\n            <option value="">Select option...</option>\n${options
          .map((o) => `            <option value="${esc(o.value)}">${esc(o.label)}</option>`)
          .join("\n")}\n          </select>\n          ${desc}\n          ${err}`
      );

    case "radio":
    case "multiselect": {
      const isRadio = field.type === "radio";
      const items = options
        .map(
          (o, i) =>
            `            <label class="flex items-center space-x-3 cursor-pointer">\n              <input type="${isRadio ? "radio" : "checkbox"}" id="${fid}-${i}" value="${esc(o.value)}" ${common} class="${isRadio ? tc.radio : tc.checkbox}" />\n              <span class="text-sm font-medium text-gray-700">${esc(o.label)}</span>\n            </label>`
        )
        .join("\n");
      return wrap(
        `          <fieldset${isRadio ? ' role="radiogroup"' : ""} aria-describedby="${describedBy}" class="border-0 p-0 m-0 min-w-0">\n            <legend class="${tc.label}">${esc(field.label)}${star}</legend>\n            <div class="mt-2 space-y-2">\n${items}\n            </div>\n          </fieldset>\n          ${desc}\n          ${err}`
      );
    }

    case "checkbox":
      return wrap(
        `          <div class="flex items-start">\n            <div class="flex items-center h-5">\n              <input id="${fid}" type="checkbox" ${common} class="${tc.checkbox}" />\n            </div>\n            <div class="ml-3 text-sm">\n              <label for="${fid}" class="font-medium text-gray-700 cursor-pointer">${esc(field.label)}${star}</label>\n              ${err}\n            </div>\n          </div>`
      );

    case "slider": {
      const lo = field.min !== undefined ? Number(field.min) : 0;
      const hi = field.max !== undefined ? Number(field.max) : 100;
      return wrap(
        `          <label for="${fid}" class="${tc.label}">${esc(field.label)}${star} <output data-slider-value="${id}" for="${fid}" class="ml-2 font-bold">${lo}</output></label>\n          <input id="${fid}" type="range" min="${lo}" max="${hi}" step="${field.step ?? 1}" value="${lo}" ${common} class="w-full cursor-pointer" />\n          <div class="flex justify-between text-xs text-gray-500" aria-hidden="true"><span>${lo}</span><span>${hi}</span></div>\n          ${desc}\n          ${err}`
      );
    }

    case "rating": {
      const max = field.max !== undefined ? Math.max(1, Math.min(10, Number(field.max))) : 5;
      const stars = Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        return `              <input type="radio" id="${fid}-${n}" value="${n}" aria-label="${n} of ${max}" ${common} class="sr-only peer" />\n              <label for="${fid}-${n}" data-star="${id}" data-n="${n}" class="cursor-pointer text-2xl leading-none rounded peer-focus-visible:ring-2" aria-hidden="true">☆</label>`;
      }).join("\n");
      return wrap(
        `          <fieldset role="radiogroup" aria-describedby="${describedBy}" class="border-0 p-0 m-0 min-w-0">\n            <legend class="${tc.label}">${esc(field.label)}${star}</legend>\n            <div class="flex gap-1">\n${stars}\n            </div>\n          </fieldset>\n          ${desc}\n          ${err}`
      );
    }

    case "file":
      return wrap(
        `${label(fid)}\n          <input id="${fid}" type="file" ${common}${Number(field.max) > 1 ? " multiple" : ""}${field.accept ? ` accept="${esc(field.accept)}"` : ""} class="${tc.input}" />\n          ${desc}\n          ${err}`
      );

    default:
      return "";
  }
}

export interface CardOptions {
  title: string;
  description?: string;
  layoutClass: string;
  fieldsMarkup: string;
}

/** The card + <form> chrome shared by the HTML page and the Web Component. */
export function renderFormCard(tc: MarkupClasses, o: CardOptions): string {
  return `    <div class="${tc.card}">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">${esc(o.title)}</h2>
        ${o.description ? `<p class="mt-1.5 text-sm text-gray-500">${esc(o.description)}</p>` : ""}
      </div>

      <form data-formify-form novalidate aria-label="${esc(o.title)}" class="space-y-6">
        <div class="sr-only" role="alert" aria-live="assertive" data-formify-announcer></div>
        <div data-formify-progress class="mb-2" hidden>
          <div data-formify-progressbar role="progressbar" aria-label="Form progress" aria-valuemin="1" aria-valuemax="1" aria-valuenow="1" class="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div data-formify-bar class="h-full custom-accent-bg" style="width:0%"></div>
          </div>
          <h3 data-formify-step tabindex="-1" class="mt-3 text-sm font-semibold text-gray-900 outline-none"></h3>
        </div>

        <div class="${o.layoutClass}">
${o.fieldsMarkup}
        </div>

        <p data-formify-success role="status" class="text-sm font-medium text-emerald-600" hidden>Thanks! Your response was recorded.</p>

        <div class="pt-2 flex gap-3">
          <button type="button" data-formify-back hidden class="px-5 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700">Back</button>
          <button type="button" data-formify-next hidden class="w-full py-3 px-4 text-center cursor-pointer ${tc.button}">Next</button>
          <button type="submit" data-formify-submit class="w-full py-3 px-4 text-center cursor-pointer ${tc.button}">Submit Form</button>
        </div>
      </form>
    </div>`;
}
