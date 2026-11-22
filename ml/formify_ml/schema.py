"""Formify schema v1 validation for the Python pipeline.

The JSON Schema itself lives in ml/schema/formify.v1.schema.json and is generated from
src/utils/formifySchema.ts (npx tsx ml/eval/export-artifacts.ts), so TS and Python share one definition.
"""

from __future__ import annotations

import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import jsonschema

ML_DIR = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ML_DIR / "schema" / "formify.v1.schema.json"
FIELD_TYPES = ("text", "email", "number", "select", "radio", "checkbox", "textarea", "date")


@lru_cache(maxsize=1)
def _validator() -> jsonschema.Draft7Validator:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return jsonschema.Draft7Validator(schema)


def validate_form(obj: Any) -> list[str]:
    """Return a list of human-readable issues (empty means valid).

    Structural checks come from the shared JSON Schema; semantic checks mirror
    src/utils/schemaValidation.ts (duplicate ids, regex patterns that must compile).
    """
    if not isinstance(obj, dict):
        return ["/ must be a JSON object"]
    issues = [f"/{'/'.join(str(p) for p in e.absolute_path)} {e.message}" for e in _validator().iter_errors(obj)]
    fields = obj.get("fields")
    if isinstance(fields, list):
        ids = [f.get("id") for f in fields if isinstance(f, dict) and isinstance(f.get("id"), str)]
        if len(set(ids)) != len(ids):
            issues.append("/fields duplicate field id")
        for f in fields:
            pat = f.get("validation", {}).get("pattern") if isinstance(f, dict) and isinstance(f.get("validation"), dict) else None
            if isinstance(pat, str):
                try:
                    re.compile(pat)
                except re.error as e:  # JS-only regex syntax can false-positive here; acceptable for filtering
                    issues.append(f"/fields/{f.get('id')}/validation/pattern invalid regex: {e}")
    return issues


def is_valid(obj: Any) -> bool:
    return not validate_form(obj)


def canonical(obj: Any) -> str:
    """Stable compact serialisation (sorted keys) used for hashing/dedup."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def target_text(obj: Any) -> str:
    """Compact, key-order-preserving serialisation used as the assistant target (fewer tokens than pretty JSON)."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def schema_hash(obj: Any) -> str:
    return hashlib.sha256(canonical(obj).encode("utf-8")).hexdigest()
