import type { ChatMessage } from "./types";
import { FIELD_TYPES } from "../utils/formifySchema";
import { INJECTION_GUARD, wrapUntrusted } from "./sanitize";

/** Prompt builders for each agent. Pure functions, so they are trivially testable. */

const FORMAT_DOC = [
  "A Formify form is JSON: {formTitle: string, formDescription?: string, fields: Field[]}.",
  `Field = {id: unique string, type: one of ${FIELD_TYPES.join("|")}, label: string, required?: boolean, placeholder?: string,`,
  "options?: [{value, label}] (REQUIRED, non-empty, for select and radio), validation?: {pattern?: regex string, message?: string}}.",
  "Edits are RFC 6902 JSON Patch ops (add, replace, remove) against that document.",
  'Append a field with {"op":"add","path":"/fields/-","value":{...}}. Use /formTitle, /fields/0/label, etc. for edits.'
].join("\n");

export const PLANNER_JSON_SCHEMA = {
  type: "object",
  required: ["summary", "fields"],
  properties: {
    summary: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "label", "type"],
        properties: { id: { type: "string" }, label: { type: "string" }, type: { type: "string" } }
      }
    },
    notes: { type: "string" }
  }
} as const;

export const CRITIC_JSON_SCHEMA = {
  type: "object",
  required: ["issues"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "message"],
        properties: { severity: { enum: ["info", "warn", "error"] }, message: { type: "string" } }
      }
    },
    ops: { type: "array", items: { type: "object" } }
  }
} as const;

const sys = (role: string) => `${role}\n\n${FORMAT_DOC}\n\n${INJECTION_GUARD}`;

export function plannerMessages(request: string, schema: unknown): ChatMessage[] {
  return [
    {
      role: "system",
      content: sys(
        'You are the Intent Planner. Turn the request into a short brief. Reply ONLY with JSON: {"summary": string, "fields": [{"id","label","type"}], "notes": string}.'
      )
    },
    {
      role: "user",
      content: [wrapUntrusted("request", request), wrapUntrusted("current_form", JSON.stringify(schema))].join("\n")
    }
  ];
}

export function authorMessages(
  request: string,
  schema: unknown,
  brief: string | undefined,
  feedback: { previous: string; errors: string[] } | null
): ChatMessage[] {
  const msgs: ChatMessage[] = [
    {
      role: "system",
      content: sys(
        "You are the Schema Author. Reply ONLY with a JSON array of patch ops that makes the current form satisfy the request. Make the smallest change that works; keep existing ids unless asked."
      )
    },
    {
      role: "user",
      content: [
        wrapUntrusted("request", request),
        wrapUntrusted("current_form", JSON.stringify(schema)),
        brief ? wrapUntrusted("brief", brief) : ""
      ]
        .filter(Boolean)
        .join("\n")
    }
  ];
  if (feedback) {
    msgs.push({ role: "assistant", content: feedback.previous });
    msgs.push({
      role: "user",
      content: `Your patch was rejected by the validator:\n${feedback.errors.map((e) => `- ${e}`).join("\n")}\nReturn a corrected JSON array of patch ops.`
    });
  }
  return msgs;
}

export function logicMessages(request: string, schema: unknown): ChatMessage[] {
  return [
    {
      role: "system",
      content: sys(
        "You are the Logic Agent. Add or fix validation regexes (validation.pattern + message), required flags and option sets that the request implies. Reply ONLY with a JSON array of patch ops; reply [] if nothing is needed."
      )
    },
    {
      role: "user",
      content: [wrapUntrusted("request", request), wrapUntrusted("current_form", JSON.stringify(schema))].join("\n")
    }
  ];
}

export function criticMessages(request: string, schema: unknown): ChatMessage[] {
  return [
    {
      role: "system",
      content: sys(
        'You are the UX Critic. Review the form for clarity, length, ordering and accessibility (clear labels, sensible required fields). Reply ONLY with JSON {"issues": [{"severity": "info|warn|error", "message": string}], "ops": [optional patch ops that fix issues]}.'
      )
    },
    {
      role: "user",
      content: [wrapUntrusted("request", request), wrapUntrusted("current_form", JSON.stringify(schema))].join("\n")
    }
  ];
}
