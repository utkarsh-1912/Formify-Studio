"""Pure helpers shared by the training scripts (no torch/transformers imports, so they are unit-testable)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

REQUIRED_SFT_KEYS = {
    "model": ["name"],
    "data": ["train", "max_seq_length"],
    "quantization": ["load_in_4bit"],
    "lora": ["r", "alpha"],
    "training": ["output_dir", "learning_rate", "num_train_epochs"],
}


def load_config(path: str | Path) -> dict[str, Any]:
    cfg = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(cfg, dict):
        raise ValueError(f"{path}: config must be a YAML mapping")
    return cfg


def validate_sft_config(cfg: dict[str, Any]) -> list[str]:
    """Return problems found in an SFT config (empty = ok)."""
    problems: list[str] = []
    for section, keys in REQUIRED_SFT_KEYS.items():
        if not isinstance(cfg.get(section), dict):
            problems.append(f"missing section '{section}'")
            continue
        problems += [f"missing '{section}.{k}'" for k in keys if k not in cfg[section]]
    t = cfg.get("training", {})
    if isinstance(t, dict):
        if t.get("bf16") and t.get("fp16"):
            problems.append("training.bf16 and training.fp16 are mutually exclusive")
        if not isinstance(t.get("learning_rate", 0.0), (int, float)):
            problems.append("training.learning_rate must be a number (write 2.0e-4, not 2e-4: YAML 1.1 parses the latter as a string)")
    if not cfg.get("model", {}).get("revision"):
        problems.append("note: model.revision is unset; pin a commit SHA for reproducibility")
    return problems


def validate_grpo_config(cfg: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    t = cfg.get("training", {})
    n, b = t.get("num_generations"), t.get("per_device_train_batch_size")
    if not isinstance(n, int) or not isinstance(b, int):
        problems.append("training.num_generations and per_device_train_batch_size must be integers")
    elif b % n != 0:
        problems.append("per_device_train_batch_size must be divisible by num_generations")
    if not cfg.get("model", {}).get("sft_adapter"):
        problems.append("model.sft_adapter is required (run sft.py first)")
    return problems


def read_jsonl(path: str | Path) -> list[dict]:
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def to_prompt_completion(row: dict) -> dict:
    """Split a chat row into TRL conversational prompt/completion form so loss is computed on the answer only."""
    msgs = row["messages"]
    if not msgs or msgs[-1]["role"] != "assistant":
        raise ValueError(f"row {row.get('id')}: last message must be the assistant answer")
    return {"prompt": msgs[:-1], "completion": [msgs[-1]]}


def to_grpo_row(row: dict) -> dict:
    """Prompt messages plus the gold schema (JSON string) that rewards.grpo_reward reads via kwargs."""
    return {"prompt": row["messages"][:-1], "gold": row["gold"]}


def filter_tasks(rows: list[dict], tasks: list[str] | None) -> list[dict]:
    return [r for r in rows if not tasks or r.get("task") in tasks]


def quant_kwargs(q: dict[str, Any]) -> dict[str, Any]:
    """Map our YAML quantization block to BitsAndBytesConfig kwargs (dtype name left as a string)."""
    return {
        "load_in_4bit": bool(q.get("load_in_4bit", True)),
        "bnb_4bit_quant_type": q.get("quant_type", "nf4"),
        "bnb_4bit_use_double_quant": bool(q.get("double_quant", True)),
        "compute_dtype_name": q.get("compute_dtype", "bfloat16"),
    }
