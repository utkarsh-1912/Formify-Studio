import json
import random

from formify_ml.edits import make_edit
from formify_ml.patch import apply_patch
from formify_ml.rewards import field_f1, grpo_reward, match_fields, rubric_score, score_completion
from formify_ml.schema import is_valid

GOOD = {
    "schemaVersion": 1,
    "formTitle": "Signup",
    "fields": [
        {"id": "fullName", "type": "text", "label": "Full Name", "required": True},
        {"id": "email", "type": "email", "label": "Email Address", "required": True},
        {"id": "plan", "type": "select", "label": "Plan", "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]},
    ],
}


def j(o):
    return json.dumps(o)


def test_reward_ordering_invalid_below_valid():
    broken = {**GOOD, "fields": [{"id": "x", "type": "telepathy", "label": "X"}]}
    scores = {
        "garbage": score_completion("hello"),
        "invalid": score_completion(j(broken)),
        "valid_no_gold": score_completion(j(GOOD)),
        "valid_gold": score_completion(j(GOOD), GOOD),
    }
    assert scores["garbage"] == 0.0
    assert 0.0 < scores["invalid"] < 0.3
    assert scores["valid_no_gold"] >= 0.3 and scores["valid_gold"] >= 0.3
    assert scores["valid_gold"] > scores["invalid"] > scores["garbage"]
    assert abs(scores["valid_gold"] - 1.0) < 1e-9  # perfect rubric + perfect F1 -> 1.0


def test_reward_gold_drives_field_f1():
    other = {**GOOD, "fields": [{"id": "zzz", "type": "text", "label": "Unrelated Question"}]}
    assert score_completion(j(other), GOOD) < score_completion(j(GOOD), GOOD)
    assert field_f1(other, GOOD) == 0.0
    assert field_f1(GOOD, GOOD) == 1.0


def test_match_fields_is_one_to_one_and_fuzzy():
    gold = [{"id": "email", "label": "Email Address"}, {"id": "n", "label": "Full Name"}]
    assert match_fields([{"id": "email"}, {"id": "email"}], gold) == [(0, 0)]
    assert match_fields([{"id": "zzz", "label": "Your Full Name"}], gold) == [(0, 1)]


def test_rubric_penalises_bad_design():
    bad = {
        "formTitle": "T",
        "fields": [
            {"id": "Bad_ID", "type": "text", "label": "Email", "required": True},
            {"id": "b", "type": "select", "label": "Pick", "required": True, "options": [{"value": "x", "label": "X"}]},
            {"id": "c", "type": "text", "label": "Date of Birth", "required": True},
        ],
    }
    assert rubric_score(GOOD) > rubric_score(bad)
    assert 0.0 <= rubric_score(bad) <= 1.0
    assert rubric_score({"fields": []}) == 0.0


def test_grpo_reward_accepts_trl_shapes():
    convo = [[{"role": "assistant", "content": j(GOOD)}], [{"role": "assistant", "content": "nope"}]]
    r = grpo_reward(convo, gold=[j(GOOD), j(GOOD)], prompts=["x", "y"], extra=1)
    assert r[0] > 0.9 and r[1] == 0.0
    assert grpo_reward([j(GOOD)])[0] >= 0.3  # no gold column


def test_programmatic_edits_are_always_valid_and_exact(seeds):
    rng = random.Random(0)
    made = 0
    for s in seeds:
        for _ in range(5):
            got = make_edit(rng, s["gold"])
            if got is None:
                continue
            instruction, patch, after = got
            made += 1
            assert instruction.strip()
            assert apply_patch(s["gold"], patch) == after and after != s["gold"]
            assert is_valid(after)
            assert {op["op"] for op in patch} <= {"add", "remove", "replace"}
    assert made > 400  # nearly every attempt should succeed on realistic forms
