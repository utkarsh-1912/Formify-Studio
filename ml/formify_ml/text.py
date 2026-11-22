"""Text helpers. extract_json mirrors ml/eval/json.ts; keep behaviour in sync."""

from __future__ import annotations

import json
import re
from typing import Any

_THINK = re.compile(r"<think>[\s\S]*?</think>")
_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def extract_json(text: str, opener: str = "{") -> Any:
    """Return the first top-level JSON value (object by default, or array with opener='[') in `text`.

    Handles <think> blocks, markdown fences and surrounding prose. Raises ValueError if none found.
    """
    closer = "}" if opener == "{" else "]"
    s = _THINK.sub("", text).strip()
    m = _FENCE.search(s)
    if m:
        s = m.group(1).strip()
    start = s.find(opener)
    if start == -1:
        raise ValueError("no JSON value found in output")
    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return json.loads(s[start : i + 1])
    raise ValueError("unterminated JSON value in output")


def norm(s: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(s if s is not None else "").lower())


def tokens(s: object) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", str(s if s is not None else "").lower()) if t}


def token_jaccard(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta and not tb:
        return 1.0
    return len(ta & tb) / len(ta | tb)
