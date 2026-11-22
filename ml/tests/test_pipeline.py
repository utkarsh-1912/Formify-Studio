import copy
import json
import sys
from pathlib import Path

import pytest
import yaml

import export_gguf
import export_mlc
import filter_and_split as fs
import generate_synthetic as gs
import manifest
import common
import sft
import grpo
from formify_ml.schema import schema_hash
from formify_ml.teacher import MockTeacher

CONFIGS = Path(__file__).resolve().parent.parent / "train" / "configs"


@pytest.fixture(scope="module")
def raw():
    t = MockTeacher()
    gen, dropped = gs.build_generate_records(t, 80, seed=1, teacher_license="n/a", workers=2)
    edits = gs.build_edit_records(t, gen, per_form=2, seed=1, method="programmatic", teacher_license="n/a")
    assert dropped == 0 and len(gen) == 80 and len(edits) > 100
    return gen + edits


def test_generate_records_have_provenance(raw):
    r = raw[0]
    assert r["task"] == "generate" and r["provenance"]["method"] == "mock" and r["provenance"]["script_version"]


def test_teacher_edits_are_verified_and_bad_ones_dropped(raw):
    base = [r for r in raw if r["task"] == "generate"][:5]

    class Liar(MockTeacher):
        method = "teacher"

        def edit(self, schema):  # patch that targets a nonexistent field
            return json.dumps({"instruction": "do something", "patch": [{"op": "replace", "path": "/fields/99/label", "value": "x"}]})

    assert gs.build_edit_records(Liar(), base, 2, 0, "teacher", "MIT") == []
    ok = gs.build_edit_records(MockTeacher(), base, 1, 0, "teacher", "MIT")
    assert len(ok) == 5 and all(e["provenance"]["method"] == "mock" for e in ok)


def test_filter_and_split_core(raw, seeds):
    splits, report = fs.run(raw, seeds, seed=0)
    all_rows = [r for rows in splits.values() for r in rows]
    assert report["kept"] == len(all_rows) and len(all_rows) > 0
    assert report["splits"]["train"]["rows"] > report["splits"]["val"]["rows"]
    # chat format: system, user, assistant; assistant parses
    row = next(r for r in all_rows if r["task"] == "generate")
    assert [m["role"] for m in row["messages"]] == ["system", "user", "assistant"]
    assert json.loads(row["messages"][-1]["content"]) == json.loads(row["gold"])
    erow = next(r for r in all_rows if r["task"] == "edit")
    assert isinstance(json.loads(erow["messages"][-1]["content"]), list)


def test_splits_are_grouped_by_base_form(raw, seeds):
    splits, _ = fs.run(raw, seeds, seed=3, val_pct=20, test_pct=20)
    by_id = {r["id"]: r for r in raw}
    where: dict[str, set[str]] = {}
    for name, rows in splits.items():
        for row in rows:
            rec = by_id[row["id"]]
            h = fs.group_key(rec)
            where.setdefault(h, set()).add(name)
    assert all(len(v) == 1 for v in where.values()), "a base form leaked across splits"
    assert all(len(rows) > 0 for rows in splits.values())


def test_split_is_deterministic(raw, seeds):
    a, _ = fs.run(raw, seeds, seed=5)
    b, _ = fs.run(raw, seeds, seed=5)
    assert {k: [r["id"] for r in v] for k, v in a.items()} == {k: [r["id"] for r in v] for k, v in b.items()}


def test_dedup_and_decontamination(raw, seeds):
    gen = next(r for r in raw if r["task"] == "generate")
    dup = copy.deepcopy(gen)
    dup["id"] = "different-id"
    # same prompt tokens -> duplicate_text
    leak_prompt = {**copy.deepcopy(gen), "id": "leak1", "prompt": seeds[0]["prompt"] + " please", "gold": copy.deepcopy(gen["gold"])}
    leak_prompt["gold"]["formTitle"] = "Unique Title One"
    leak_schema = {**copy.deepcopy(gen), "id": "leak2", "prompt": "A completely different request about llamas and tax", "gold": copy.deepcopy(seeds[1]["gold"])}
    invalid = {**copy.deepcopy(gen), "id": "bad", "prompt": "invalid gold example request", "gold": {"formTitle": "x", "fields": []}}
    invalid["gold"]["fields"] = [{"id": "q", "type": "nope", "label": "Q"}]
    _, report = fs.run([gen, dup, leak_prompt, leak_schema, invalid], seeds)
    d = report["dropped"]
    assert d.get("duplicate_text", 0) + d.get("duplicate_schema", 0) >= 1
    assert d.get("contaminated_prompt") == 1
    assert d.get("contaminated_schema") == 1
    assert d.get("invalid_gold_schema") == 1
    assert report["kept"] == 1


def test_check_record_rejects_bad_edits(raw):
    e = next(r for r in raw if r["task"] == "edit")
    assert fs.check_record(e, 1, 30) is None
    bad = copy.deepcopy(e)
    bad["patch"] = [{"op": "remove", "path": "/fields/99"}]
    assert fs.check_record(bad, 1, 30) == "patch_does_not_apply"
    mismatch = copy.deepcopy(e)
    mismatch["gold"]["formTitle"] = "changed"
    assert fs.check_record(mismatch, 1, 30) == "patch_result_mismatch"


def test_end_to_end_files_and_manifest_guards(raw, seeds, tmp_path):
    rawp = tmp_path / "raw.jsonl"
    rawp.write_text("\n".join(json.dumps(r) for r in raw), encoding="utf-8")
    out = tmp_path / "ds"
    assert fs.main(["--in", str(rawp), "--out-dir", str(out)]) == 0
    assert manifest.main(["--dir", str(out), "--dataset-license", "mit"]) == 2  # mock rows refused
    assert manifest.main(["--dir", str(out), "--dataset-license", "mit", "--allow-mock", "--render-card"]) == 0
    m = json.loads((out / "MANIFEST.json").read_text(encoding="utf-8"))
    assert m["rows_by_method"].get("mock", 0) > 0 and len(m["files"]["train.jsonl"]["sha256"]) == 64
    card = (out / "README.md").read_text(encoding="utf-8")
    assert "{{" not in card and "license: mit" in card


def test_manifest_requires_declared_teacher_license(tmp_path):
    row = {"id": "1", "task": "generate", "messages": [], "gold": "{}", "provenance": {"method": "teacher", "teacher": "t", "teacher_license": "UNKNOWN"}}
    for s in ("train", "val", "test"):
        (tmp_path / f"{s}.jsonl").write_text(json.dumps(row) + "\n", encoding="utf-8")
    assert manifest.main(["--dir", str(tmp_path), "--dataset-license", "mit"]) == 2
    row["provenance"]["teacher_license"] = "Apache-2.0"
    for s in ("train", "val", "test"):
        (tmp_path / f"{s}.jsonl").write_text(json.dumps(row) + "\n", encoding="utf-8")
    assert manifest.main(["--dir", str(tmp_path), "--dataset-license", "mit"]) == 0


def test_generate_cli_mock_end_to_end(tmp_path):
    out = tmp_path / "raw.jsonl"
    assert gs.main(["--mock", "--n", "20", "--out", str(out), "--workers", "1"]) == 0
    rows = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
    assert {r["task"] for r in rows} == {"generate", "edit"}


# ---- training helpers ----
@pytest.mark.parametrize("name", ["sft_qwen3_4b.yaml", "sft_qwen25_3b.yaml"])
def test_sft_configs_are_valid(name):
    cfg = common.load_config(CONFIGS / name)
    problems = [p for p in common.validate_sft_config(cfg) if not p.startswith("note:")]
    assert problems == []
    assert isinstance(cfg["training"]["learning_rate"], float)
    assert cfg["training"]["bf16"] is True and cfg["quantization"]["load_in_4bit"] is True


def test_grpo_config_and_validation():
    cfg = common.load_config(CONFIGS / "grpo_qwen3_4b.yaml")
    assert common.validate_grpo_config(cfg) == []
    cfg["training"]["per_device_train_batch_size"] = 6
    assert any("divisible" in p for p in common.validate_grpo_config(cfg))


def test_validate_sft_config_flags_problems():
    assert any("learning_rate" in p for p in common.validate_sft_config({"training": {"learning_rate": "2e-4"}}))
    cfg = common.load_config(CONFIGS / "sft_qwen3_4b.yaml")
    cfg["training"]["fp16"] = True
    assert any("mutually exclusive" in p for p in common.validate_sft_config(cfg))
    del cfg["lora"]
    assert any("lora" in p for p in common.validate_sft_config(cfg))


def test_row_conversion():
    row = {"id": "x", "messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "assistant", "content": "a"}], "gold": "{}"}
    pc = common.to_prompt_completion(row)
    assert len(pc["prompt"]) == 2 and pc["completion"] == [{"role": "assistant", "content": "a"}]
    assert common.to_grpo_row(row) == {"prompt": pc["prompt"], "gold": "{}"}
    with pytest.raises(ValueError):
        common.to_prompt_completion({"id": "y", "messages": [{"role": "user", "content": "u"}]})


def _dry_run_cfg(tmp_path, raw, seeds, base_cfg="sft_qwen3_4b.yaml"):
    splits, _ = fs.run(raw, seeds)
    d = tmp_path / "ds"
    d.mkdir()
    for k, rows in splits.items():
        (d / f"{k}.jsonl").write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
    cfg = common.load_config(CONFIGS / base_cfg)
    cfg["data"]["train"], cfg["data"]["val"] = str(d / "train.jsonl"), str(d / "val.jsonl")
    p = tmp_path / "cfg.yaml"
    p.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    return p


def test_sft_and_grpo_dry_runs(tmp_path, raw, seeds, capsys):
    p = _dry_run_cfg(tmp_path, raw, seeds)
    assert sft.main(["--config", str(p), "--dry-run"]) == 0
    assert "dry run ok" in capsys.readouterr().out
    assert sft.main(["--config", str(p), "--dry-run", "--tasks", "edit"]) == 0
    g = common.load_config(CONFIGS / "grpo_qwen3_4b.yaml")
    g["data"]["train"] = common.load_config(p)["data"]["train"]
    gp = tmp_path / "g.yaml"
    gp.write_text(yaml.safe_dump(g), encoding="utf-8")
    assert grpo.main(["--config", str(gp), "--dry-run"]) == 0


def test_sft_rejects_broken_config(tmp_path):
    p = tmp_path / "bad.yaml"
    p.write_text("model: {name: x}\n", encoding="utf-8")
    assert sft.main(["--config", str(p), "--dry-run"]) == 2


def test_export_command_builders(tmp_path):
    cmds = export_gguf.build_commands(tmp_path / "m", tmp_path / "llama.cpp", tmp_path / "o", "Q4_K_M", "n")
    assert cmds[0][1].endswith("convert_hf_to_gguf.py") and "f16" in cmds[0]
    assert cmds[1][-1] == "Q4_K_M" and cmds[1][2].endswith("n-Q4_K_M.gguf")
    assert 'SYSTEM """' in export_gguf.modelfile("a.gguf", "sys")
    mlc = export_mlc.build_commands(tmp_path / "m", tmp_path / "o", "q4f16_1", "tmpl")
    assert [c[1] for c in mlc] == ["convert_weight", "gen_config", "compile"]
    assert "webgpu" in mlc[2]
    assert export_gguf.main(["--base", "b", "--adapter", "a", "--llama-cpp-dir", str(tmp_path), "--out-dir", str(tmp_path / "o"), "--dry-run"]) == 0
    assert export_mlc.main(["--merged", str(tmp_path), "--out-dir", str(tmp_path / "o"), "--conv-template", "t", "--dry-run"]) == 0


def test_seed_schema_hashes_unique(seeds):
    assert len({schema_hash(s["gold"]) for s in seeds}) == len(seeds)
    assert "pytest" in sys.modules
