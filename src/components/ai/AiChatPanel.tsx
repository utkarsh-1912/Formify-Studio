"use client";

import React, { useMemo, useRef, useState } from "react";
import { Sparkles, Check, X, Undo2, Loader2, ShieldAlert } from "lucide-react";
import type { AppThemeTokens } from "../../utils/appTheme";
import {
  AiProvider,
  PatchOp,
  PipelineResult,
  Router,
  describeOp,
  runPipeline,
  PipelineError,
  detectCapabilities,
  modelWarnings,
  recommendModel,
  WebLLMProvider,
  OllamaProvider,
  OpenAICompatibleProvider,
  keyStore,
  applyPatch
} from "../../ai";

interface AiChatPanelProps {
  schema: any;
  themeTokens: AppThemeTokens;
  /** Called ONLY after the user clicks Accept (or Undo). Receives the full next schema. */
  onApply: (nextSchema: any) => void;
  readOnly?: boolean;
  /** Inject providers (tests / custom setups). Defaults to on-device + Ollama (+ remote if configured). */
  providers?: AiProvider[];
}

const REMOTE_DEFAULT = { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" };

const AiChatPanel: React.FC<AiChatPanelProps> = ({ schema, themeTokens, onApply, readOnly = false, providers }) => {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PipelineResult | null>(null);
  const [undoStack, setUndoStack] = useState<{ inverse: PatchOp[] }[]>([]);
  const [allowRemote, setAllowRemote] = useState(false);
  const [remote, setRemote] = useState(REMOTE_DEFAULT);
  const [apiKey, setApiKey] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const caps = useMemo(() => detectCapabilities(), []);
  const recommended = useMemo(() => recommendModel(caps), [caps]);
  const warnings = useMemo(() => (recommended ? modelWarnings(recommended, caps) : []), [recommended, caps]);

  const buildRouter = () => {
    if (providers) return new Router(providers, { allowRemote: true });
    const list: AiProvider[] = [];
    if (recommended) list.push(new WebLLMProvider({ modelId: recommended.id }));
    list.push(new OllamaProvider({ model: "qwen3:4b" }));
    if (allowRemote && apiKey) {
      keyStore.set(remote.baseUrl, apiKey); // memory only
      list.push(new OpenAICompatibleProvider({ baseUrl: remote.baseUrl, model: remote.model }));
    }
    return new Router(list, { allowRemote });
  };

  const run = async () => {
    if (!request.trim() || busy || readOnly) return;
    setBusy(true);
    setError(null);
    setPending(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setPending(await runPipeline({ request, schema, router: buildRouter(), signal: ctrl.signal }));
    } catch (e) {
      setError(e instanceof PipelineError || e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!pending) return;
    onApply(pending.nextSchema);
    setUndoStack((s) => [...s, { inverse: pending.inverse }]);
    setPending(null);
    setRequest("");
  };

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    onApply(applyPatch(schema, last.inverse));
    setUndoStack((s) => s.slice(0, -1));
  };

  const inputClass = `w-full px-3 py-2 text-xs rounded-xl border ${themeTokens.border} ${themeTokens.inputBg} ${themeTokens.inputText} focus:outline-none focus:ring-2 focus:ring-blue-500/40`;
  const btn = `inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-xl border ${themeTokens.border} cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`;

  return (
    <div className={`flex flex-col space-y-4 ${themeTokens.text}`} data-testid="ai-chat-panel">
      <div className="flex items-center space-x-2">
        <Sparkles className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-bold">AI Assistant</h3>
        <span className={`text-[10px] ${themeTokens.textSecondary}`}>Suggestions only: you approve every change</span>
      </div>

      {!providers && warnings.length > 0 && (
        <ul className={`text-[11px] space-y-1 ${themeTokens.textSecondary}`}>
          {warnings.map((w, i) => (
            <li key={i} className={w.level === "block" ? "text-red-500" : w.level === "warn" ? "text-amber-500" : ""}>
              {w.message}
            </li>
          ))}
        </ul>
      )}

      <textarea
        aria-label="Describe your form or the change you want"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        rows={4}
        maxLength={4000}
        disabled={readOnly}
        placeholder="e.g. Add a required phone number field and make the budget a select with 3 ranges"
        className={inputClass}
      />

      <details className={`text-xs ${themeTokens.textSecondary}`}>
        <summary className="cursor-pointer">Model settings</summary>
        <div className="mt-2 space-y-2">
          <label className="flex items-start space-x-2">
            <input type="checkbox" checked={allowRemote} onChange={(e) => setAllowRemote(e.target.checked)} />
            <span>
              Allow a remote model (your form content is sent to that server)
            </span>
          </label>
          {allowRemote && (
            <>
              <input aria-label="Remote base URL" className={inputClass} value={remote.baseUrl} onChange={(e) => setRemote({ ...remote, baseUrl: e.target.value })} />
              <input aria-label="Remote model" className={inputClass} value={remote.model} onChange={(e) => setRemote({ ...remote, model: e.target.value })} />
              <input aria-label="API key" type="password" autoComplete="off" className={inputClass} placeholder="API key (kept in memory only)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </>
          )}
        </div>
      </details>

      <div className="flex items-center space-x-2">
        <button onClick={run} disabled={busy || readOnly || !request.trim()} className={`${btn} bg-blue-600 text-white border-blue-600`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>{busy ? "Working…" : "Suggest changes"}</span>
        </button>
        {busy && (
          <button onClick={() => abortRef.current?.abort()} className={btn}>
            Cancel
          </button>
        )}
        {undoStack.length > 0 && (
          <button onClick={undo} className={btn} title="Undo the last accepted AI change">
            <Undo2 className="h-3.5 w-3.5" />
            <span>Undo</span>
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start space-x-2">
          <ShieldAlert className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {pending && (
        <div className={`rounded-2xl border ${themeTokens.border} p-3 space-y-3`} data-testid="ai-proposal">
          <div className="text-xs font-bold">Proposed changes ({pending.ops.length})</div>
          {pending.ops.length === 0 ? (
            <p className={`text-xs ${themeTokens.textSecondary}`}>The assistant did not propose any change.</p>
          ) : (
            <ul className="space-y-1 font-mono text-[11px]">
              {pending.ops.map((op, i) => (
                <li key={i} className={op.op === "remove" ? "text-red-500" : op.op === "add" ? "text-emerald-600" : "text-amber-600"}>
                  {describeOp(op)}
                </li>
              ))}
            </ul>
          )}
          {pending.issues.length > 0 && (
            <ul className="text-[11px] space-y-1">
              {pending.issues.map((iss, i) => (
                <li key={i} className={iss.severity === "error" ? "text-red-500" : iss.severity === "warn" ? "text-amber-500" : themeTokens.textSecondary}>
                  {iss.severity.toUpperCase()}: {iss.message}
                </li>
              ))}
            </ul>
          )}
          <div className="flex space-x-2">
            <button onClick={accept} disabled={pending.ops.length === 0} className={`${btn} bg-emerald-600 text-white border-emerald-600`}>
              <Check className="h-3.5 w-3.5" />
              <span>Accept</span>
            </button>
            <button onClick={() => setPending(null)} className={btn}>
              <X className="h-3.5 w-3.5" />
              <span>Reject</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiChatPanel;
