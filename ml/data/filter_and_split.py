#!/usr/bin/env python
"""Validate, filter, de-duplicate, decontaminate against the eval seeds, and split raw records.

  python ml/data/filter_and_split.py --in ml/data/out/raw.jsonl --out-dir ml/data/out/dataset

Splits are deterministic and *grouped*: all records derived from the same base form (a generate record and
the edit records built on it) land in the same split, so val/test never share a form with train.
Output rows hold chat `messages` built by formify_ml.prompts (the single formatting path used by training),
plus `gold` (JSON string, for GRPO rewards) and `provenance`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from formify_ml.patch import PatchError, apply_patch  # noqa: E402
from formify_ml.prompts import edit_messages, generate_messages  # noqa: E402
from formify_ml.schema import ML_DIR, is_valid, schema_hash, target_text, validate_form  # noqa: E402
from formify_ml.text import token_jaccard, tokens  # noqa: E402

DEFAULT_SEEDS = ML_DIR / "eval" / "seeds.json"


def load_jsonl(paths: list[Path]) -> list[dict]:
    rows: list[dict] = []
    for p in paths:
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))
    return rows


def check_record(rec: dict, min_fields: int, max_fields: int) -> str | None:
    """Return a drop-reason string, or None if the record is acceptable."""
    task = rec.get("task")
    gold = rec.get("gold")
    if task == "generate":
        prompt = rec.get("prompt")
        if not isinstance(prompt, str) or not 10 <= len(prompt.strip()) <= 400:
            return "bad_prompt_length"
    elif task == "edit":
        instr, patch, before = rec.get("instruction"), rec.get("patch"), rec.get("schema")
        if not isinstance(instr, str) or not 5 <= len(instr.strip()) <= 300:
            return "bad_instruction_length"
        if not isinstance(before, dict) or not is_valid(before):
            return "invalid_base_schema"
        try:
            after = apply_patch(before, patch)
        except PatchError:
            return "patch_does_not_apply"
        if after != gold:
            return "patch_result_mismatch"
        if after == before:
            return "noop_patch"
    else:
        return "unknown_task"
    if not isinstance(gold, dict) or validate_form(gold):
        return "invalid_gold_schema"
    if not min_fields <= len(gold["fields"]) <= max_fields:
        return "field_count_out_of_range"
    return None


def text_key(rec: dict) -> str:
    base = rec["prompt"] if rec["task"] == "generate" else rec["instruction"]
    return " ".join(sorted(tokens(base)))


def to_row(rec: dict) -> dict:
    if rec["task"] == "generate":
        msgs = generate_messages(rec["prompt"]) + [{"role": "assistant", "content": target_text(rec["gold"])}]
    else:
        msgs = edit_messages(rec["schema"], rec["instruction"]) + [{"role": "assistant", "content": target_text(rec["patch"])}]
    return {
        "id": rec["id"],
        "task": rec["task"],
        "domain": rec.get("domain"),
        "messages": msgs,
        "gold": target_text(rec["gold"]),
        "provenance": rec.get("provenance", {}),
    }


def group_key(rec: dict) -> str:
    return schema_hash(rec["gold"] if rec["task"] == "generate" else rec["schema"])


def split_of(group: str, seed: int, val_pct: int, test_pct: int) -> str:
    bucket = int(hashlib.sha256(f"{seed}:{group}".encode()).hexdigest(), 16) % 100
    if bucket < test_pct:
        return "test"
    if bucket < test_pct + val_pct:
        return "val"
    return "train"


def run(
    records: list[dict],
    seeds: list[dict],
    *,
    seed: int = 0,
    val_pct: int = 5,
    test_pct: int = 5,
    jaccard: float = 0.8,
    min_fields: int = 1,
    max_fields: int = 30,
) -> tuple[dict[str, list[dict]], dict]:
    """Pure core: returns ({split: rows}, report)."""
    drops: Counter[str] = Counter()
    seed_hashes = {schema_hash(s["gold"]) for s in seeds}
    seed_prompts = [s["prompt"] for s in seeds]

    seen_ids: set[str] = set()
    seen_text: set[tuple[str, str]] = set()
    seen_gen_schema: set[str] = set()
    kept: list[dict] = []

    for rec in records:
        reason = check_record(rec, min_fields, max_fields)
        if reason:
            drops[reason] += 1
            continue
        if rec["id"] in seen_ids:
            drops["duplicate_id"] += 1
            continue
        key = (rec["task"], text_key(rec) if rec["task"] == "generate" else group_key(rec) + "|" + text_key(rec))
        if key in seen_text:
            drops["duplicate_text"] += 1
            continue
        if rec["task"] == "generate":
            h = schema_hash(rec["gold"])
            if h in seen_gen_schema:
                drops["duplicate_schema"] += 1
                continue
        # decontamination against eval seeds
        base_hash = schema_hash(rec["gold"] if rec["task"] == "generate" else rec["schema"])
        if base_hash in seed_hashes:
            drops["contaminated_schema"] += 1
            continue
        if rec["task"] == "generate" and any(token_jaccard(rec["prompt"], sp) >= jaccard for sp in seed_prompts):
            drops["contaminated_prompt"] += 1
            continue
        seen_ids.add(rec["id"])
        seen_text.add(key)
        if rec["task"] == "generate":
            seen_gen_schema.add(schema_hash(rec["gold"]))
        kept.append(rec)

    splits: dict[str, list[dict]] = {"train": [], "val": [], "test": []}
    for rec in kept:
        splits[split_of(group_key(rec), seed, val_pct, test_pct)].append(to_row(rec))

    report = {
        "input_records": len(records),
        "kept": len(kept),
        "dropped": dict(drops),
        "splits": {k: {"rows": len(v), "by_task": dict(Counter(r["task"] for r in v))} for k, v in splits.items()},
        "params": {"seed": seed, "val_pct": val_pct, "test_pct": test_pct, "jaccard": jaccard, "min_fields": min_fields, "max_fields": max_fields},
        "decontaminated_against": {"eval_seeds": len(seeds)},
    }
    return splits, report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="inputs", nargs="+", required=True, type=Path)
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS, help="eval seeds JSON used for decontamination")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--val-pct", type=int, default=5)
    ap.add_argument("--test-pct", type=int, default=5)
    ap.add_argument("--jaccard", type=float, default=0.8)
    ap.add_argument("--min-fields", type=int, default=1)
    ap.add_argument("--max-fields", type=int, default=30)
    a = ap.parse_args(argv)

    seeds = json.loads(a.seeds.read_text(encoding="utf-8"))
    splits, report = run(
        load_jsonl(a.inputs), seeds, seed=a.seed, val_pct=a.val_pct, test_pct=a.test_pct,
        jaccard=a.jaccard, min_fields=a.min_fields, max_fields=a.max_fields,
    )
    a.out_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in splits.items():
        with (a.out_dir / f"{name}.jsonl").open("w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    (a.out_dir / "filter_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
