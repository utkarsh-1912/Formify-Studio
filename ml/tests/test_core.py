import json

import pytest

from formify_ml.patch import PatchError, apply_patch
from formify_ml.prompts import GENERATE_USER_PREFIX, edit_messages, generate_messages, generate_system_prompt
from formify_ml.schema import FIELD_TYPES, canonical, is_valid, schema_hash, validate_form
from formify_ml.text import extract_json, token_jaccard

BASE = {"formTitle": "T", "fields": [{"id": "a", "type": "text", "label": "A"}]}


# ---- text ----
def test_extract_json_variants():
    assert extract_json('<think>{x}</think> hi ```json\n{"a": 1}\n``` bye') == {"a": 1}
    assert extract_json('pre {"a":"}{","b":{"c":2}} post') == {"a": "}{", "b": {"c": 2}}
    assert extract_json('noise [{"op":"add"}] tail', opener="[") == [{"op": "add"}]


@pytest.mark.parametrize("bad", ["nothing here", '{"a":'])
def test_extract_json_failures(bad):
    with pytest.raises(ValueError):
        extract_json(bad)


def test_token_jaccard():
    assert token_jaccard("Full Name", "full name") == 1.0
    assert token_jaccard("a b", "c d") == 0.0


# ---- schema ----
def test_all_seed_golds_validate_in_python(seeds):
    """Parity with the TS validator: every gold that passes AJV in TS must pass here."""
    assert len(seeds) >= 100
    for s in seeds:
        assert validate_form(s["gold"]) == [], s["id"]


def test_validate_form_catches_problems():
    assert is_valid(BASE)
    assert validate_form([]) == ["/ must be a JSON object"]
    assert any("formTitle" in i for i in validate_form({"fields": []}))
    dup = {"formTitle": "T", "fields": [BASE["fields"][0], BASE["fields"][0]]}
    assert any("duplicate" in i for i in validate_form(dup))
    assert validate_form({"formTitle": "T", "fields": [{"id": "s", "type": "select", "label": "S"}]})  # missing options
    assert validate_form({"formTitle": "T", "fields": [{"id": "a", "type": "nope", "label": "A"}]})
    bad_re = {"formTitle": "T", "fields": [{"id": "a", "type": "text", "label": "A", "validation": {"pattern": "("}}]}
    assert any("regex" in i for i in validate_form(bad_re))


def test_hashes_are_order_independent():
    assert schema_hash({"a": 1, "b": 2}) == schema_hash({"b": 2, "a": 1})
    assert canonical({"b": 1, "a": 2}) == '{"a":2,"b":1}'


# ---- patch ----
def test_patch_ops_and_immutability():
    before = json.loads(json.dumps(BASE))
    out = apply_patch(
        BASE,
        [
            {"op": "add", "path": "/fields/-", "value": {"id": "b", "type": "email", "label": "B"}},
            {"op": "replace", "path": "/fields/0/label", "value": "Z"},
            {"op": "add", "path": "/formDescription", "value": "d"},
        ],
    )
    assert BASE == before
    assert [f["label"] for f in out["fields"]] == ["Z", "B"] and out["formDescription"] == "d"
    assert apply_patch(out, [{"op": "remove", "path": "/fields/1"}])["fields"] == [out["fields"][0]]


@pytest.mark.parametrize(
    "ops",
    [
        {"op": "add"},  # not a list
        [{"op": "move", "path": "/a", "from": "/b"}],  # unsupported op
        [{"op": "replace", "path": "/nope", "value": 1}],  # missing target
        [{"op": "remove", "path": "/fields/9"}],  # out of range
        [{"op": "add", "path": "/fields/01", "value": {}}],  # leading zero
        [{"op": "add", "path": "/fields/-"}],  # no value
        [{"op": "remove", "path": ""}],  # root remove
    ],
)
def test_patch_errors(ops):
    with pytest.raises(PatchError):
        apply_patch(BASE, ops)


def test_patch_pointer_escapes():
    assert apply_patch({"a/b": 1}, [{"op": "replace", "path": "/a~1b", "value": 2}]) == {"a/b": 2}


# ---- prompts ----
def test_generate_prompt_matches_exported_ts_prompt():
    sys_prompt = generate_system_prompt()
    for t in FIELD_TYPES:
        assert t in sys_prompt
    msgs = generate_messages("a thing")
    assert msgs[0] == {"role": "system", "content": sys_prompt}
    # Must equal userPrompt() in ml/eval/prompt.ts (pinned by a vitest test there too).
    assert GENERATE_USER_PREFIX == "Create a form: "
    assert msgs[1]["content"] == "Create a form: a thing"


def test_edit_messages_embed_schema_and_instruction():
    m = edit_messages(BASE, "make A required")
    assert '"formTitle":"T"' in m[1]["content"] and "make A required" in m[1]["content"]
