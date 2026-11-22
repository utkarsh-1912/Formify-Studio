import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import FormFieldRenderer from "./FormFieldRenderer";
import { ThemeSettings, getThemeClasses } from "../utils/codeGenerators";
import { AppThemeTokens } from "../utils/appTheme";
import { Check } from "lucide-react";
import {
  FormSchema,
  collectSubmission,
  computeValues,
  defaultValueFor,
  getSteps,
  isFieldRequired,
  isInputField
} from "../engine/logic";
import { formifyResolver, validateValues } from "../engine/validate";
import { decodeValues, fieldNameCodec, toFieldName } from "../engine/names";

interface FormGeneratorProps {
  schema: any;
  theme: ThemeSettings;
  themeTokens: AppThemeTokens;
  fontFamily?: "sans" | "mono" | "serif";
  fontScale?: number;
  onSubmitSubmission: (data: Record<string, any>) => void;
  fillMode?: "single" | "multi";
}

const formatValue = (v: unknown): string => {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" && "name" in (x as any) ? (x as any).name : String(x))).join(", ") || "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v === "" || v === undefined || v === null) return "—";
  return String(v);
};

const FormGenerator: React.FC<FormGeneratorProps> = ({
  schema,
  theme,
  themeTokens,
  fontFamily = "sans",
  fontScale = 1.0,
  onSubmitSubmission,
  fillMode = "multi"
}) => {
  const formId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const typedSchema = (schema || { formTitle: "", fields: [] }) as FormSchema;
  const fields = useMemo(() => typedSchema.fields || [], [typedSchema.fields]);

  const defaults = useMemo(() => {
    const d: Record<string, unknown> = {};
    fields.forEach((f) => {
      if (f && f.id && f.type !== "section" && f.type !== "pagebreak") d[toFieldName(f.id)] = defaultValueFor(f);
    });
    return d;
  }, [fields]);

  const { control, handleSubmit, trigger, reset, setFocus, formState } = useForm<Record<string, any>>({
    defaultValues: defaults,
    resolver: formifyResolver(typedSchema, fieldNameCodec),
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: true
  });

  const watched = useWatch({ control });
  const values = useMemo(() => computeValues(typedSchema, decodeValues(watched || {})), [typedSchema, watched]);

  const [stepIndex, setStepIndex] = useState(0);
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);
  const [submittedData, setSubmittedData] = useState<Record<string, any> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const didMountStep = useRef(false);

  const steps = getSteps(typedSchema, values);
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];
  const isLast = safeIndex === steps.length - 1;
  const multiStep = steps.length > 1;

  // Move focus to the step heading when the step changes (not on first paint) for keyboard / SR users.
  useEffect(() => {
    if (!didMountStep.current) {
      didMountStep.current = true;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [safeIndex]);

  const themeClasses = getThemeClasses(theme);
  const fontFamClass =
    fontFamily === "mono" ? "font-mono" : fontFamily === "serif" ? "font-serif" : "font-sans";

  const announceErrors = (count: number) =>
    setAnnouncement(count > 0 ? `Please fix ${count} error${count === 1 ? "" : "s"} before continuing.` : "");

  const goNext = async () => {
    const ids = step.fields.filter(isInputField).map((f) => toFieldName(f.id));
    const ok = ids.length === 0 ? true : await trigger(ids);
    if (!ok) {
      const errs = validateValues(typedSchema, values, step.fields.map((f) => f.id));
      announceErrors(Object.keys(errs).length);
      return;
    }
    setAnnouncement("");
    setStepIndex(safeIndex + 1);
  };

  const goBack = () => {
    setAnnouncement("");
    setStepIndex(Math.max(0, safeIndex - 1));
  };

  const onValid = (data: Record<string, any>) => {
    const result = collectSubmission(typedSchema, decodeValues(data));
    setAnnouncement("");
    setSubmittedData(result);
    setIsSubmitSuccess(true);
    onSubmitSubmission(result);
    reset(defaults);
    setStepIndex(0);
  };

  const onInvalid = (errors: Record<string, any>) => {
    const failing = Object.keys(errors);
    announceErrors(failing.length);
    // Jump to the first step that contains a failing field, then focus it once it has mounted.
    const target = steps.findIndex((s) => s.fields.some((f) => failing.includes(toFieldName(f.id))));
    if (target >= 0 && target !== safeIndex) {
      setStepIndex(target);
      const first = steps[target].fields.find((f) => failing.includes(toFieldName(f.id)));
      if (first) setTimeout(() => setFocus(toFieldName(first.id)), 0);
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isLast) {
      void goNext(); // Enter on a middle step advances instead of submitting
      return;
    }
    void handleSubmit(onValid, onInvalid)(e);
  };

  const handleDismissSuccess = () => {
    setIsSubmitSuccess(false);
    setSubmittedData(null);
  };

  if (!schema || !schema.fields || schema.fields.length === 0) {
    return (
      <div className={`p-6 h-full flex flex-col items-center justify-center ${themeTokens.previewBg}`}>
        <div className={`max-w-md w-full p-8 rounded-2xl border ${themeTokens.border} ${themeTokens.card} text-center`}>
          <h3 className={`text-lg font-bold ${themeTokens.text} ${fontFamClass}`}>Form Preview</h3>
          <p className={`text-xs mt-2 leading-relaxed ${themeTokens.textSecondary} ${fontFamClass}`}>
            No fields defined yet. Go to the Visual Builder or JSON Editor on the left and add fields to preview the live rendering.
          </p>
        </div>
      </div>
    );
  }

  const layoutClass = theme.layout === "2-col"
    ? "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 space-y-0"
    : "space-y-5";

  const cardClasses = `${themeClasses.card.replace("bg-white", "").replace("border-gray-100", "")} ${themeTokens.card}`;

  const titleStyle = {
    fontSize: `calc(1.5rem * ${fontScale})`,
    lineHeight: `calc(2rem * ${fontScale})`
  };

  const descStyle = {
    fontSize: `calc(0.875rem * ${fontScale})`,
    lineHeight: `calc(1.25rem * ${fontScale})`
  };

  const submitBtnStyle = {
    fontSize: `calc(0.875rem * ${fontScale})`,
    paddingTop: `calc(0.75rem * ${fontScale})`,
    paddingBottom: `calc(0.75rem * ${fontScale})`
  };

  const isCustomColor = theme.primaryColor && theme.primaryColor.startsWith("#");
  const accentColorHex = isCustomColor
    ? theme.primaryColor
    : ({
        indigo: "#4f46e5",
        blue: "#2563eb",
        emerald: "#059669",
        violet: "#7c3aed",
        rose: "#e11d48",
        amber: "#f59e0b",
        slate: "#334155"
      }[theme.primaryColor] || "#4f46e5");

  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  return (
    <div className={`p-6 h-full overflow-y-auto flex flex-col justify-start ${themeTokens.previewBg}`}>
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --primary-accent: ${accentColorHex};
        }
        .custom-accent-bg {
          background-color: var(--primary-accent) !important;
        }
        .custom-accent-bg-hover:hover {
          background-color: var(--primary-accent) !important;
          filter: brightness(0.95);
        }
        .custom-accent-text {
          color: var(--primary-accent) !important;
        }
        .custom-accent-border {
          border-color: var(--primary-accent) !important;
        }
        .custom-accent-ring:focus {
          --tw-ring-color: var(--primary-accent) !important;
          ring-color: var(--primary-accent) !important;
          border-color: var(--primary-accent) !important;
        }
      ` }} />
      <div className="max-w-2xl w-full mx-auto">
        <div className={`${cardClasses} transition-all duration-300 relative`}>

          {/* Submission Success Alert Panel */}
          {isSubmitSuccess && (
            <div role="status" className={`absolute inset-0 rounded-2xl z-10 p-8 flex flex-col items-center justify-center text-center animate-fade-in ${themeTokens.card.split(" border-")[0]}`}>
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 animate-scale-up">
                <Check className="h-6 w-6" />
              </div>
              <h4 className={`text-lg font-bold ${themeTokens.text} ${fontFamClass}`}>Submission Successful!</h4>
              <p className={`text-xs mt-1 max-w-sm ${themeTokens.textSecondary} ${fontFamClass}`}>
                Your entry has been validated and logged. You can view the details in the **Submissions** dashboard tab.
              </p>

              <div className={`mt-5 w-full max-w-xs text-left border rounded-xl p-3 text-xs font-mono max-h-36 overflow-y-auto ${themeTokens.inputBg} ${themeTokens.inputText} ${themeTokens.border}`}>
                {submittedData && Object.entries(submittedData).map(([k, v]) => {
                  const field = fields.find((f) => f.id === k);
                  const displayName = field?.label || k;
                  return (
                    <div key={k} className="truncate">
                      <span className="opacity-55">{displayName}:</span> {formatValue(v)}
                    </div>
                  );
                })}
              </div>

              {fillMode !== "single" ? (
                <button
                  onClick={handleDismissSuccess}
                  className={`mt-6 px-6 py-2.5 text-xs font-bold ${themeClasses.button}`}
                >
                  Fill Form Again
                </button>
              ) : (
                <p className={`mt-6 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20`}>
                  Response submitted. Single fill constraint active.
                </p>
              )}
            </div>
          )}

          {/* Form Header */}
          <div className="mb-6">
            <h2 className={`font-bold leading-snug ${themeTokens.text} ${fontFamClass}`} style={titleStyle}>
              {typedSchema.formTitle || "Untitled Form"}
            </h2>
            {typedSchema.formDescription && (
              <p className={`mt-1.5 leading-relaxed ${themeTokens.textSecondary} ${fontFamClass}`} style={descStyle}>
                {typedSchema.formDescription}
              </p>
            )}
          </div>

          {/* Multi-step progress */}
          {multiStep && (
            <div className="mb-6">
              <div
                role="progressbar"
                aria-label="Form progress"
                aria-valuemin={1}
                aria-valuemax={steps.length}
                aria-valuenow={safeIndex + 1}
                aria-valuetext={`Step ${safeIndex + 1} of ${steps.length}${step.title ? `: ${step.title}` : ""}`}
                className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
              >
                <div
                  className="h-full custom-accent-bg transition-all duration-300"
                  style={{ width: `${((safeIndex + 1) / steps.length) * 100}%` }}
                />
              </div>
              <h3
                ref={stepHeadingRef}
                tabIndex={-1}
                className={`mt-3 text-sm font-semibold outline-none ${themeTokens.text} ${fontFamClass}`}
              >
                Step {safeIndex + 1} of {steps.length}{step.title ? ` — ${step.title}` : ""}
              </h3>
              {step.description && (
                <p className={`text-xs mt-0.5 ${themeTokens.textSecondary} ${fontFamClass}`}>{step.description}</p>
              )}
            </div>
          )}

          {/* Form body */}
          <form onSubmit={handleFormSubmit} className="space-y-6" noValidate aria-label={typedSchema.formTitle || "Form"}>
            <div className="sr-only" role="alert" aria-live="assertive" data-testid="form-announcer">{announcement}</div>
            <div className={layoutClass}>
              {step.fields.map((field) => (
                <div key={field.id} className={field.type === "section" ? "md:col-span-2" : undefined}>
                  <FormFieldRenderer
                    field={field}
                    control={control}
                    name={toFieldName(field.id)}
                    theme={theme}
                    themeTokens={themeTokens}
                    required={isFieldRequired(field, values)}
                    error={errors[toFieldName(field.id)]?.message}
                    computedValue={values[field.id]}
                    idPrefix={`ff-${formId}`}
                    fontFamily={fontFamily}
                    fontScale={fontScale}
                  />
                </div>
              ))}
            </div>

            <div className={`pt-2 ${multiStep ? "flex gap-3" : ""}`}>
              {multiStep && safeIndex > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  style={submitBtnStyle}
                  className={`px-5 border ${themeTokens.border} ${themeTokens.text} rounded-lg font-medium ${fontFamClass}`}
                >
                  Back
                </button>
              )}
              {isLast ? (
                <button
                  type="submit"
                  style={submitBtnStyle}
                  className={`w-full text-center cursor-pointer ${themeClasses.button} ${fontFamClass}`}
                >
                  Submit Form
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void goNext()}
                  style={submitBtnStyle}
                  className={`w-full text-center cursor-pointer ${themeClasses.button} ${fontFamClass}`}
                >
                  Next
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FormGenerator;
