"""Minimal RFC 6902 JSON Patch (add / remove / replace) used for the edit task.

Deliberately small: small models do better with a restricted op set, and the app only needs these.
"""

from __future__ import annotations

import copy
from typing import Any

ALLOWED_OPS = ("add", "remove", "replace")


class PatchError(ValueError):
    pass


def _unescape(token: str) -> str:
    return token.replace("~1", "/").replace("~0", "~")


def _parse_pointer(ptr: str) -> list[str]:
    if ptr == "":
        return []
    if not ptr.startswith("/"):
        raise PatchError(f"invalid JSON pointer: {ptr!r}")
    return [_unescape(t) for t in ptr[1:].split("/")]


def _walk(doc: Any, tokens: list[str]) -> Any:
    cur = doc
    for t in tokens:
        if isinstance(cur, list):
            cur = cur[_index(t, len(cur), allow_end=False)]
        elif isinstance(cur, dict):
            if t not in cur:
                raise PatchError(f"path segment {t!r} not found")
            cur = cur[t]
        else:
            raise PatchError(f"cannot descend into scalar at {t!r}")
    return cur


def _index(token: str, length: int, allow_end: bool) -> int:
    if token == "-" and allow_end:
        return length
    if not token.isdigit() or (len(token) > 1 and token[0] == "0"):
        raise PatchError(f"invalid array index {token!r}")
    i = int(token)
    if i > length or (i == length and not allow_end):
        raise PatchError(f"array index {i} out of range (len {length})")
    return i


def apply_patch(doc: Any, ops: Any) -> Any:
    """Return a new document with `ops` applied; never mutates `doc`. Raises PatchError on any problem."""
    if not isinstance(ops, list):
        raise PatchError("patch must be a JSON array")
    out = copy.deepcopy(doc)
    for n, op in enumerate(ops):
        if not isinstance(op, dict) or op.get("op") not in ALLOWED_OPS or not isinstance(op.get("path"), str):
            raise PatchError(f"op {n}: must be an object with op in {ALLOWED_OPS} and a string path")
        kind, tokens = op["op"], _parse_pointer(op["path"])
        if kind in ("add", "replace") and "value" not in op:
            raise PatchError(f"op {n}: {kind} requires 'value'")
        if not tokens:
            if kind == "remove":
                raise PatchError(f"op {n}: cannot remove the document root")
            out = copy.deepcopy(op["value"])
            continue
        parent, last = _walk(out, tokens[:-1]), tokens[-1]
        if isinstance(parent, list):
            if kind == "add":
                parent.insert(_index(last, len(parent), allow_end=True), copy.deepcopy(op["value"]))
            else:
                i = _index(last, len(parent), allow_end=False)
                if kind == "remove":
                    del parent[i]
                else:
                    parent[i] = copy.deepcopy(op["value"])
        elif isinstance(parent, dict):
            if kind == "add":
                parent[last] = copy.deepcopy(op["value"])
            else:
                if last not in parent:
                    raise PatchError(f"op {n}: {kind} target {op['path']!r} does not exist")
                if kind == "remove":
                    del parent[last]
                else:
                    parent[last] = copy.deepcopy(op["value"])
        else:
            raise PatchError(f"op {n}: parent of {op['path']!r} is not a container")
    return out
