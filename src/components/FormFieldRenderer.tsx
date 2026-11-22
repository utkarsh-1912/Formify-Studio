import React, { useEffect, useRef } from "react";
import { Control, Controller } from "react-hook-form";
import { ThemeSettings, getThemeClasses } from "../utils/codeGenerators";
import { AppThemeTokens } from "../utils/appTheme";
import { FieldDef, defaultValueFor } from "../engine/logic";

interface FormFieldRendererProps {
  field: FieldDef;
  /** react-hook-form control + the (encoded) RHF field name for this field */
  control: Control<any>;
  name: string;
  theme: ThemeSettings;
  themeTokens: AppThemeTokens;
  /** resolved (conditional) required flag */
  required: boolean;
  error?: string;
  /** current computed value, used by `calculated` fields */
  computedValue?: unknown;
  /** unique prefix so several forms on one page never collide on DOM ids */
  idPrefix?: string;
  fontFamily?: "sans" | "mono" | "serif";
  fontScale?: number;
}

const optId = (v: string | number) => String(v).replace(/[^A-Za-z0-9_-]/g, "_");

const FormFieldRenderer: React.FC<FormFieldRendererProps> = ({
  field,
  control,
  name,
  theme,
  themeTokens,
  required,
  error,
  computedValue,
  idPrefix = "ff",
  fontFamily = "sans",
  fontScale = 1.0
}) => {
  const themeClasses = getThemeClasses(theme);
  const fontFamClass = fontFamily === "mono" ? "font-mono" : fontFamily === "serif" ? "font-serif" : "font-sans";
  const inputStyle = `${themeClasses.input.replace("bg-white", "").replace("text-gray-900", "")} ${themeTokens.inputBg} ${themeTokens.inputText} border ${themeTokens.border} ${fontFamClass}`;
  const errorRing = error ? "border-red-500 ring-2 ring-red-500/10 focus:ring-red-500 focus:border-red-500" : "";

  const labelStyle = { fontSize: `calc(0.875rem * ${fontScale})`, lineHeight: `calc(1.25rem * ${fontScale})` };
  const inputSizeStyle = labelStyle;
  const helperSizeStyle = { fontSize: `calc(0.75rem * ${fontScale})`, lineHeight: `calc(1rem * ${fontScale})` };

  const fid = `${idPrefix}-${optId(field.id)}`;
  const descId = `${fid}-desc`;
  const errId = `${fid}-err`;
  const hint = field.description || (!error && field.validation?.message && ["text", "email", "number", "phone"].includes(field.type) ? field.validation.message : "");
  const describedBy = [hint ? descId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;
  const a11y = {
    "aria-required": required || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy
  } as const;

  const labelText = (
    <>
      {field.label}
      {required && (
        <span className="text-red-500 ml-1" aria-hidden="true">*</span>
      )}
      {required && <span className="sr-only"> (required)</span>}
    </>
  );
  const labelClass = `${themeClasses.label} ${themeTokens.text} ${fontFamClass}`;

  const footer = (
    <>
      {hint && (
        <p id={descId} className="mt-1 text-gray-400 font-medium" style={helperSizeStyle}>{hint}</p>
      )}
      {error && (
        <p id={errId} role="alert" className="mt-1 text-red-600 font-semibold" style={helperSizeStyle}>{error}</p>
      )}
    </>
  );

  // ---- non-input types -------------------------------------------------------------------------
  if (field.type === "hidden" || field.type === "pagebreak") return null;

  if (field.type === "section") {
    return (
      <div className="pt-2">
        <h3 className={`font-bold ${themeTokens.text} ${fontFamClass}`} style={{ fontSize: `calc(1.125rem * ${fontScale})` }}>
          {field.label}
        </h3>
        {field.description && (
          <p className={`mt-1 ${themeTokens.textSecondary} ${fontFamClass}`} style={helperSizeStyle}>{field.description}</p>
        )}
      </div>
    );
  }

  if (field.type === "calculated") {
    const shown = computedValue === "" || computedValue === undefined || computedValue === null ? "—" : String(computedValue);
    return (
      <div>
        <span id={`${fid}-label`} className={labelClass} style={labelStyle}>{field.label}</span>
        <output
         
          aria-labelledby={`${fid}-label`}
          aria-live="polite"
          className={`block font-semibold ${themeTokens.text} ${fontFamClass}`}
          style={{ ...inputSizeStyle, fontSize: `calc(1.125rem * ${fontScale})` }}
          data-testid={`calc-${field.id}`}
        >
          {shown}
        </output>
        {field.description && (
          <p className="mt-1 text-gray-400 font-medium" style={helperSizeStyle}>{field.description}</p>
        )}
      </div>
    );
  }

  const options = field.options || [];

  return (
    <div className="transition-all duration-150">
      <Controller
        control={control}
        name={name}
        defaultValue={defaultValueFor(field)}
        render={({ field: rhf }) => {
          const value = rhf.value;

          switch (field.type) {
            case "text":
            case "email":
            case "number":
            case "phone":
            case "date": {
              const htmlType = field.type === "phone" ? "tel" : field.type;
              return (
                <div>
                  <label htmlFor={fid} className={labelClass} style={labelStyle}>{labelText}</label>
                  <input
                    {...a11y}
                    ref={rhf.ref}
                    id={fid}
                    name={rhf.name}
                    type={htmlType}
                    inputMode={field.type === "phone" ? "tel" : undefined}
                    autoComplete={field.type === "email" ? "email" : field.type === "phone" ? "tel" : undefined}
                    placeholder={field.placeholder || ""}
                    min={field.type === "number" || field.type === "date" ? (field.min as any) : undefined}
                    max={field.type === "number" || field.type === "date" ? (field.max as any) : undefined}
                    step={field.type === "number" ? field.step : undefined}
                    value={value ?? ""}
                    onChange={(e) => rhf.onChange(e.target.value)}
                    onBlur={rhf.onBlur}
                    style={inputSizeStyle}
                    className={`${inputStyle} ${errorRing}`}
                  />
                  {footer}
                </div>
              );
            }

            case "textarea":
              return (
                <div>
                  <label htmlFor={fid} className={labelClass} style={labelStyle}>{labelText}</label>
                  <textarea
                    {...a11y}
                    ref={rhf.ref}
                    id={fid}
                    name={rhf.name}
                    placeholder={field.placeholder || ""}
                    rows={4}
                    value={value ?? ""}
                    onChange={(e) => rhf.onChange(e.target.value)}
                    onBlur={rhf.onBlur}
                    style={inputSizeStyle}
                    className={`${inputStyle} ${errorRing}`}
                  />
                  {footer}
                </div>
              );

            case "select":
              return (
                <div>
                  <label htmlFor={fid} className={labelClass} style={labelStyle}>{labelText}</label>
                  <select
                    {...a11y}
                    ref={rhf.ref}
                    id={fid}
                    name={rhf.name}
                    value={value === undefined || value === null ? "" : String(value)}
                    onChange={(e) => rhf.onChange(e.target.value)}
                    onBlur={rhf.onBlur}
                    style={inputSizeStyle}
                    className={`${inputStyle} ${errorRing}`}
                  >
                    <option value="" className={`${themeTokens.inputBg} ${themeTokens.inputText}`}>Select option...</option>
                    {options.map((o) => (
                      <option key={String(o.value)} value={String(o.value)} className={`${themeTokens.inputBg} ${themeTokens.inputText}`}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {footer}
                </div>
              );

            case "radio":
              return (
                <fieldset {...a11y} role="radiogroup" aria-labelledby={`${fid}-legend`} className="border-0 p-0 m-0 min-w-0">
                  <legend id={`${fid}-legend`} className={labelClass} style={labelStyle}>{labelText}</legend>
                  <div className="mt-2 space-y-2">
                    {options.map((o, i) => (
                      <label key={String(o.value)} className="flex items-center space-x-3 cursor-pointer select-none">
                        <input
                          type="radio"
                          ref={i === 0 ? rhf.ref : undefined}
                          id={`${fid}-${optId(o.value)}`}
                          name={rhf.name}
                          value={String(o.value)}
                          checked={String(value ?? "") === String(o.value)}
                          onChange={() => rhf.onChange(o.value)}
                          onBlur={rhf.onBlur}
                          className={themeClasses.radio}
                        />
                        <span className={`font-medium ${themeTokens.textSecondary} ${fontFamClass}`} style={inputSizeStyle}>{o.label}</span>
                      </label>
                    ))}
                  </div>
                  {footer}
                </fieldset>
              );

            case "multiselect": {
              const selected: unknown[] = Array.isArray(value) ? value : [];
              const isOn = (v: string | number) => selected.some((s) => String(s) === String(v));
              return (
                <fieldset {...a11y} aria-labelledby={`${fid}-legend`} className="border-0 p-0 m-0 min-w-0">
                  <legend id={`${fid}-legend`} className={labelClass} style={labelStyle}>{labelText}</legend>
                  <div className="mt-2 space-y-2">
                    {options.map((o, i) => (
                      <label key={String(o.value)} className="flex items-center space-x-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          ref={i === 0 ? rhf.ref : undefined}
                          id={`${fid}-${optId(o.value)}`}
                          name={`${rhf.name}[]`}
                          value={String(o.value)}
                          checked={isOn(o.value)}
                          onChange={(e) =>
                            rhf.onChange(
                              e.target.checked
                                ? [...selected, o.value]
                                : selected.filter((s) => String(s) !== String(o.value))
                            )
                          }
                          onBlur={rhf.onBlur}
                          className={themeClasses.checkbox}
                        />
                        <span className={`font-medium ${themeTokens.textSecondary} ${fontFamClass}`} style={inputSizeStyle}>{o.label}</span>
                      </label>
                    ))}
                  </div>
                  {footer}
                </fieldset>
              );
            }

            case "checkbox":
              return (
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      {...a11y}
                      type="checkbox"
                      ref={rhf.ref}
                      id={fid}
                      name={rhf.name}
                      checked={value === true || value === "true"}
                      onChange={(e) => rhf.onChange(e.target.checked)}
                      onBlur={rhf.onBlur}
                      className={themeClasses.checkbox}
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label
                      htmlFor={fid}
                      className={`font-semibold cursor-pointer select-none ${themeTokens.text} ${fontFamClass}`}
                      style={labelStyle}
                    >
                      {labelText}
                    </label>
                    {footer}
                  </div>
                </div>
              );

            case "slider": {
              const lo = field.min !== undefined ? Number(field.min) : 0;
              const hi = field.max !== undefined ? Number(field.max) : 100;
              const num = value === "" || value === undefined || value === null || isNaN(Number(value)) ? lo : Number(value);
              return (
                <div>
                  <label htmlFor={fid} className={labelClass} style={labelStyle}>
                    {labelText}
                    <output htmlFor={fid} className={`ml-2 font-bold ${themeTokens.textSecondary}`} data-testid={`slider-value-${field.id}`}>{num}</output>
                  </label>
                  <input
                    {...a11y}
                    ref={rhf.ref}
                    id={fid}
                    name={rhf.name}
                    type="range"
                    min={lo}
                    max={hi}
                    step={field.step ?? 1}
                    value={num}
                    aria-valuetext={String(num)}
                    onChange={(e) => rhf.onChange(Number(e.target.value))}
                    onBlur={rhf.onBlur}
                    className="w-full cursor-pointer"
                  />
                  <div className={`flex justify-between ${themeTokens.textSecondary}`} style={helperSizeStyle} aria-hidden="true">
                    <span>{lo}</span>
                    <span>{hi}</span>
                  </div>
                  {footer}
                </div>
              );
            }

            case "rating": {
              const max = field.max !== undefined ? Math.max(1, Math.min(10, Number(field.max))) : 5;
              const current = Number(value) || 0;
              return (
                <RatingInput
                  fid={fid}
                  label={labelText}
                  labelClass={labelClass}
                  labelStyle={labelStyle}
                  max={max}
                  value={current}
                  onChange={rhf.onChange}
                  onBlur={rhf.onBlur}
                  inputRef={rhf.ref}
                  a11y={a11y}
                  accentClass={theme.primaryColor && !theme.primaryColor.startsWith("#") ? "text-amber-500" : "custom-accent-text"}
                  footer={footer}
                />
              );
            }

            case "file":
              return (
                <FileInput
                  fid={fid}
                  label={labelText}
                  labelClass={labelClass}
                  labelStyle={labelStyle}
                  field={field}
                  value={Array.isArray(value) ? value : []}
                  onChange={rhf.onChange}
                  onBlur={rhf.onBlur}
                  inputRef={rhf.ref}
                  a11y={a11y}
                  inputClass={`${inputStyle} ${errorRing}`}
                  textClass={`${themeTokens.textSecondary} ${fontFamClass}`}
                  sizeStyle={helperSizeStyle}
                  footer={footer}
                />
              );

            default:
              return <div />;
          }
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
interface RatingProps {
  fid: string;
  label: React.ReactNode;
  labelClass: string;
  labelStyle: React.CSSProperties;
  max: number;
  value: number;
  onChange: (v: number) => void;
  onBlur: () => void;
  inputRef: React.Ref<any>;
  a11y: Record<string, unknown>;
  accentClass: string;
  footer: React.ReactNode;
}

/** Accessible star rating: a radiogroup with roving tabindex and arrow-key navigation. */
const RatingInput: React.FC<RatingProps> = ({ fid, label, labelClass, labelStyle, max, value, onChange, onBlur, inputRef, a11y, accentClass, footer }) => {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusIdx = value > 0 ? value - 1 : 0;

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(max - 1, idx + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, idx - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = max - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(next + 1);
      refs.current[next]?.focus();
    }
  };

  return (
    <div role="radiogroup" aria-labelledby={`${fid}-legend`} {...a11y}>
      <span id={`${fid}-legend`} className={labelClass} style={labelStyle}>{label}</span>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => {
          const n = i + 1;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} of ${max}`}
              tabIndex={i === focusIdx ? 0 : -1}
              ref={(el) => {
                refs.current[i] = el;
                if (i === 0 && typeof inputRef === "function") inputRef(el);
              }}
              onClick={() => onChange(n)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onBlur={onBlur}
              className={`text-2xl leading-none focus:outline-none focus:ring-2 rounded ${n <= value ? accentClass : "text-gray-300"}`}
            >
              {n <= value ? "★" : "☆"}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
};

interface FileProps {
  fid: string;
  label: React.ReactNode;
  labelClass: string;
  labelStyle: React.CSSProperties;
  field: FieldDef;
  value: Array<{ name: string; size: number; type: string }>;
  onChange: (v: unknown) => void;
  onBlur: () => void;
  inputRef: React.Ref<any>;
  a11y: Record<string, unknown>;
  inputClass: string;
  textClass: string;
  sizeStyle: React.CSSProperties;
  footer: React.ReactNode;
}

/**
 * File picker. Only file metadata ({name,size,type}) is stored in form state — submissions are JSON and
 * live in localStorage, so file *contents* are intentionally never retained by the renderer.
 */
const FileInput: React.FC<FileProps> = ({ fid, label, labelClass, labelStyle, field, value, onChange, onBlur, inputRef, a11y, inputClass, textClass, sizeStyle, footer }) => {
  const el = useRef<HTMLInputElement | null>(null);
  const multiple = Number(field.max) > 1;

  useEffect(() => {
    if (value.length === 0 && el.current && el.current.value !== "") el.current.value = "";
  }, [value.length]);

  return (
    <div>
      <label htmlFor={fid} className={labelClass} style={labelStyle}>{label}</label>
      <input
        {...a11y}
        ref={(node) => {
          el.current = node;
          if (typeof inputRef === "function") inputRef(node);
        }}
        id={fid}
        type="file"
        multiple={multiple}
        accept={field.accept}
        onChange={(e) =>
          onChange(Array.from(e.target.files || []).map((f) => ({ name: f.name, size: f.size, type: f.type })))
        }
        onBlur={onBlur}
        className={inputClass}
      />
      {value.length > 0 && (
        <ul className={`mt-1 ${textClass}`} style={sizeStyle}>
          {value.map((f, i) => (
            <li key={`${f.name}-${i}`}>{f.name} ({Math.max(1, Math.round(f.size / 1024))} KB)</li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  );
};

export default FormFieldRenderer;
