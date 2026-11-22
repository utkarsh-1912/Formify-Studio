"""Programmatic (rule-based) edit instructions with exactly-known JSON Patches.

High precision by construction: every produced (instruction, patch) is checked by applying the patch and
validating the result, and anything that fails is discarded. Complements teacher-written edits, which are
more varied but noisier.
"""

from __future__ import annotations

import random
import re
from typing import Callable

from .patch import PatchError, apply_patch
from .schema import is_valid

Edit = tuple[str, list[dict]]  # (instruction, patch)

_NEW_FIELDS: list[tuple[str, str, str, list[str]]] = [
    ("phone", "text", "Phone Number", []),
    ("email", "email", "Email Address", []),
    ("dateOfBirth", "date", "Date of Birth", []),
    ("comments", "textarea", "Additional Comments", []),
    ("age", "number", "Age", []),
    ("company", "text", "Company Name", []),
    ("contactMethod", "radio", "Preferred Contact Method", ["Email", "Phone"]),
    ("referral", "select", "How did you hear about us?", ["Search", "Friend", "Social media", "Other"]),
    ("newsletter", "checkbox", "Subscribe to our newsletter", []),
]

_OPTION_ADDS = ["Other", "Not sure", "None of the above", "Prefer not to say"]
_RENAMES = ["Please tell us", "Your details", "Required information", "More information"]
_TITLES = ["Customer Questionnaire", "Quick Form", "Registration", "Request Form", "Intake Form"]


def _slug_id(label: str) -> str:
    words = re.sub(r"[^A-Za-z0-9 ]+", "", label).split()
    return (words[0].lower() + "".join(w.capitalize() for w in words[1:])) if words else "field"


def _pick(rng: random.Random, form: dict, pred: Callable[[dict], bool] = lambda f: True) -> int | None:
    idx = [i for i, f in enumerate(form["fields"]) if pred(f)]
    return rng.choice(idx) if idx else None


def _say(rng: random.Random, options: list[str]) -> str:
    return rng.choice(options)


def _make_required(rng: random.Random, form: dict) -> Edit | None:
    i = _pick(rng, form, lambda f: not f.get("required"))
    if i is None:
        return None
    f = form["fields"][i]
    op = "replace" if "required" in f else "add"
    ins = _say(rng, [f"Make the {f['label']} field required.", f"{f['label']} should be mandatory.", f"Require users to fill in {f['label']}."])
    return ins, [{"op": op, "path": f"/fields/{i}/required", "value": True}]


def _make_optional(rng: random.Random, form: dict) -> Edit | None:
    i = _pick(rng, form, lambda f: f.get("required") is True)
    if i is None:
        return None
    f = form["fields"][i]
    ins = _say(rng, [f"Make {f['label']} optional.", f"{f['label']} should not be required anymore."])
    return ins, [{"op": "replace", "path": f"/fields/{i}/required", "value": False}]


def _rename_label(rng: random.Random, form: dict) -> Edit | None:
    i = _pick(rng, form)
    if i is None:
        return None
    f = form["fields"][i]
    new = f"{f['label']} (updated)" if rng.random() < 0.3 else rng.choice(_RENAMES)
    if new == f["label"]:
        return None
    return f'Rename the label "{f["label"]}" to "{new}".', [{"op": "replace", "path": f"/fields/{i}/label", "value": new}]


def _add_field(rng: random.Random, form: dict) -> Edit | None:
    existing = {f["id"] for f in form["fields"]}
    choices = [c for c in _NEW_FIELDS if c[0] not in existing]
    if not choices:
        return None
    fid, ftype, label, opts = rng.choice(choices)
    field: dict = {"id": fid, "type": ftype, "label": label}
    if opts:
        field["options"] = [{"value": o.lower().replace(" ", "-"), "label": o} for o in opts]
    ins = _say(rng, [f"Add a {label} field at the end.", f"Add a field for {label.lower()}.", f"Include {label} as a new question."])
    return ins, [{"op": "add", "path": "/fields/-", "value": field}]


def _remove_field(rng: random.Random, form: dict) -> Edit | None:
    if len(form["fields"]) <= 2:
        return None
    i = _pick(rng, form)
    f = form["fields"][i]
    return _say(rng, [f"Remove the {f['label']} field.", f"Delete {f['label']} from the form."]), [{"op": "remove", "path": f"/fields/{i}"}]


def _change_type(rng: random.Random, form: dict) -> Edit | None:
    i = _pick(rng, form, lambda f: f.get("type") == "text")
    if i is None:
        return None
    f = form["fields"][i]
    return f"Change {f['label']} to a multi-line text area.", [{"op": "replace", "path": f"/fields/{i}/type", "value": "textarea"}]


def _add_option(rng: random.Random, form: dict) -> Edit | None:
    i = _pick(rng, form, lambda f: f.get("type") in ("select", "radio"))
    if i is None:
        return None
    f = form["fields"][i]
    have = {o["label"] for o in f["options"]}
    avail = [o for o in _OPTION_ADDS if o not in have]
    if not avail:
        return None
    o = rng.choice(avail)
    return (
        f'Add an option "{o}" to {f["label"]}.',
        [{"op": "add", "path": f"/fields/{i}/options/-", "value": {"value": o.lower().replace(" ", "-"), "label": o}}],
    )


def _set_placeholder(rng: random.Random, form: dict) -> Edit | None:
    i = _pick(rng, form, lambda f: f.get("type") in ("text", "email", "textarea", "number"))
    if i is None:
        return None
    f = form["fields"][i]
    ph = f"Enter {f['label'].lower()}"
    op = "replace" if "placeholder" in f else "add"
    return f'Set the placeholder of {f["label"]} to "{ph}".', [{"op": op, "path": f"/fields/{i}/placeholder", "value": ph}]


def _retitle(rng: random.Random, form: dict) -> Edit | None:
    new = rng.choice([t for t in _TITLES if t != form["formTitle"]])
    return f'Change the form title to "{new}".', [{"op": "replace", "path": "/formTitle", "value": new}]


def _add_description(rng: random.Random, form: dict) -> Edit | None:
    text = "Please complete all required fields."
    op = "replace" if "formDescription" in form else "add"
    return f'Add the description "{text}" to the form.', [{"op": op, "path": "/formDescription", "value": text}]


EDIT_FUNCS: list[Callable[[random.Random, dict], Edit | None]] = [
    _make_required, _make_optional, _rename_label, _add_field, _remove_field,
    _change_type, _add_option, _set_placeholder, _retitle, _add_description,
]


def make_edit(rng: random.Random, form: dict, attempts: int = 12) -> tuple[str, list[dict], dict] | None:
    """Return (instruction, patch, patched_form), verified valid, or None if no edit could be made."""
    for _ in range(attempts):
        got = rng.choice(EDIT_FUNCS)(rng, form)
        if got is None:
            continue
        instruction, patch = got
        try:
            after = apply_patch(form, patch)
        except PatchError:
            continue
        if after != form and is_valid(after):
            return instruction, patch, after
    return None
