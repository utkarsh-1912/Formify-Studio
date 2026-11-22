"""Reward functions for optional GRPO (and for offline filtering/scoring).

Pure Python, no ML dependencies. Reward shape (all in [0, 1]):
  - output is not a JSON object            -> 0.0
  - JSON object but fails schema v1        -> max(0, 0.3 - 0.05 * n_issues)   (always < 0.3)
  - valid schema                           -> 0.3 + 0.3 * rubric + 0.4 * field_f1   (field_f1 only when gold is known;
                                              otherwise 0.3 + 0.7 * rubric)
Every valid output scores at least 0.3 and every invalid one strictly less, so the policy is never rewarded
for breaking the schema in exchange for a better rubric score.
"""

from __future__ import annotations

import json
import re
from typing import Any, Iterable

from .schema import validate_form
from .text import extract_json, norm, token_jaccard

_ID_RE = re.compile(r"^[a-z][A-Za-z0-9]*$")
_FUZZY = 0.6


def parse_form(completion: str) -> dict | None:
    """Parse a model completion into a form object, or None."""
    try:
        obj = extract_json(completion)
    except (ValueError, json.JSONDecodeError):
        return None
    return obj if isinstance(obj, dict) else None


def match_fields(pred: list[Any], gold: list[Any]) -> list[tuple[int, int]]:
    """One-to-one field matching; same passes as ml/eval/metrics.ts (id, label, fuzzy label >= 0.6)."""
    used_p: set[int] = set()
    used_g: set[int] = set()
    pairs: list[tuple[int, int]] = []

    def take(p: int, g: int) -> None:
        used_p.add(p)
        used_g.add(g)
        pairs.append((p, g))

    def get(f: Any, k: str) -> Any:
        return f.get(k) if isinstance(f, dict) else None

    for p, pf in enumerate(pred):
        for g, gf in enumerate(gold):
            if g not in used_g and norm(get(gf, "id")) == norm(get(pf, "id")) and norm(get(pf, "id")):
                take(p, g)
                break
    for p, pf in enumerate(pred):
        if p in used_p:
            continue
        for g, gf in enumerate(gold):
            if g not in used_g and norm(get(gf, "label")) == norm(get(pf, "label")) and norm(get(pf, "label")):
                take(p, g)
                break
    cands = []
    for p, pf in enumerate(pred):
        if p in used_p:
            continue
        for g, gf in enumerate(gold):
            if g in used_g:
                continue
            s = token_jaccard(str(get(pf, "label") or ""), str(get(gf, "label") or ""))
            if s >= _FUZZY:
                cands.append((p, g, s))
    for p, g, _ in sorted(cands, key=lambda c: -c[2]):
        if p not in used_p and g not in used_g:
            take(p, g)
    return pairs


def field_f1(pred_form: dict, gold_form: dict) -> float:
    pred = pred_form.get("fields") if isinstance(pred_form.get("fields"), list) else []
    gold = gold_form.get("fields") if isinstance(gold_form.get("fields"), list) else []
    if not pred or not gold:
        return 0.0
    m = len(match_fields(pred, gold))
    p, r = m / len(pred), m / len(gold)
    return 0.0 if p + r == 0 else 2 * p * r / (p + r)


_EMAILISH = re.compile(r"e-?mail", re.IGNORECASE)
_DATEISH = re.compile(r"\b(date|dob|birthday|birth)\b|date of", re.IGNORECASE)


def rubric_score(form: dict) -> float:
    """Heuristic design-quality score in [0,1] for a (structurally valid) form. Cheap stand-in for a judge model."""
    fields = [f for f in form.get("fields", []) if isinstance(f, dict)]
    if not fields:
        return 0.0
    n = len(fields)
    checks: list[float] = []

    # 1. ids are unique camelCase identifiers
    checks.append(sum(1 for f in fields if isinstance(f.get("id"), str) and _ID_RE.match(f["id"])) / n)
    # 2. labels present and concise
    checks.append(sum(1 for f in fields if isinstance(f.get("label"), str) and 0 < len(f["label"]) <= 80) / n)
    # 3. sensible length: 1..30 fields; decays beyond
    checks.append(1.0 if n <= 30 else max(0.0, 1 - (n - 30) / 30))
    # 4. choice fields offer at least two options
    choice = [f for f in fields if f.get("type") in ("select", "radio")]
    if choice:
        checks.append(sum(1 for f in choice if isinstance(f.get("options"), list) and len(f["options"]) >= 2) / len(choice))
    # 5. semantic types: emailish labels use email, dateish labels use date
    typed = [f for f in fields if _EMAILISH.search(str(f.get("label", ""))) or _DATEISH.search(str(f.get("label", "")))]
    if typed:
        ok = sum(
            1
            for f in typed
            if (f.get("type") == "email" if _EMAILISH.search(str(f.get("label", ""))) else f.get("type") == "date")
        )
        checks.append(ok / len(typed))
    # 6. required is used selectively (not none-or-all) on multi-field forms
    if n >= 3:
        req = sum(1 for f in fields if f.get("required"))
        checks.append(1.0 if 0 < req < n else 0.5)
    # 7. declares the current schema version
    checks.append(1.0 if form.get("schemaVersion") == 1 else 0.0)

    return sum(checks) / len(checks)


def score_completion(completion: str, gold: dict | None = None) -> float:
    form = parse_form(completion)
    if form is None:
        return 0.0
    issues = validate_form(form)
    if issues:
        return max(0.0, 0.3 - 0.05 * len(issues))
    rub = rubric_score(form)
    if gold is None:
        return 0.3 + 0.7 * rub
    return 0.3 + 0.3 * rub + 0.4 * field_f1(form, gold)


def _text(completion: Any) -> str:
    """TRL passes either plain strings or conversational [{'role','content'}] lists."""
    if isinstance(completion, str):
        return completion
    if isinstance(completion, list) and completion and isinstance(completion[-1], dict):
        return str(completion[-1].get("content", ""))
    return str(completion)


def _gold(g: Any) -> dict | None:
    if isinstance(g, dict):
        return g
    if isinstance(g, str):
        try:
            v = json.loads(g)
            return v if isinstance(v, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def grpo_reward(completions: Iterable[Any], gold: Iterable[Any] | None = None, **_: Any) -> list[float]:
    """TRL GRPOTrainer reward function. Dataset columns arrive as kwargs; we use an optional `gold` column
    (JSON string or dict per row). Signature intentionally tolerant of extra kwargs (prompts, completion_ids, ...)."""
    comps = list(completions)
    golds = list(gold) if gold is not None else [None] * len(comps)
    return [score_completion(_text(c), _gold(g)) for c, g in zip(comps, golds)]
