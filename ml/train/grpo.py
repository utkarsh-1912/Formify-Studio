#!/usr/bin/env python
"""OPTIONAL GRPO stage using the verifiable reward in formify_ml.rewards (AJV-equivalent validity + rubric + field F1).

  python ml/train/grpo.py --config ml/train/configs/grpo_qwen3_4b.yaml --dry-run
  python ml/train/grpo.py --config ml/train/configs/grpo_qwen3_4b.yaml

STATUS: UNTESTED beyond config validation and the reward function's unit tests. TRL's GRPOTrainer interface
evolves quickly; treat this as a starting point. Run it only after SFT, and only if the eval harness shows
remaining failures that a reward can fix.
"""

from __future__ import annotations

import argparse
import dataclasses
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common import filter_tasks, load_config, quant_kwargs, read_jsonl, to_grpo_row, validate_grpo_config  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    problems = validate_grpo_config(cfg)
    for p in problems:
        print(f"ERROR {p}", file=sys.stderr)
    if problems:
        return 2
    rows = [to_grpo_row(r) for r in filter_tasks(read_jsonl(cfg["data"]["train"]), cfg["data"].get("tasks", ["generate"]))]
    print(f"model={cfg['model']['name']} adapter={cfg['model']['sft_adapter']} grpo_rows={len(rows)}")
    if not rows:
        print("ERROR no rows", file=sys.stderr)
        return 2
    if args.dry_run:
        print("dry run ok")
        return 0

    import torch
    from datasets import Dataset
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import GRPOConfig, GRPOTrainer

    from formify_ml.rewards import grpo_reward

    q = quant_kwargs(cfg["quantization"])
    bnb = BitsAndBytesConfig(
        load_in_4bit=q["load_in_4bit"], bnb_4bit_quant_type=q["bnb_4bit_quant_type"],
        bnb_4bit_use_double_quant=q["bnb_4bit_use_double_quant"], bnb_4bit_compute_dtype=getattr(torch, q["compute_dtype_name"]),
    )
    m = cfg["model"]
    tok = AutoTokenizer.from_pretrained(m["name"], revision=m.get("revision"))
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    base = AutoModelForCausalLM.from_pretrained(m["name"], revision=m.get("revision"), quantization_config=bnb, device_map="auto")
    model = PeftModel.from_pretrained(base, m["sft_adapter"], is_trainable=True)

    kwargs = dict(cfg["training"])
    kwargs["max_prompt_length"] = cfg["data"].get("max_prompt_length", 1024)
    fields = {f.name for f in dataclasses.fields(GRPOConfig)}
    if "max_prompt_length" not in fields:
        kwargs.pop("max_prompt_length")
    ctk = m.get("chat_template_kwargs")
    if ctk and "chat_template_kwargs" in fields:
        kwargs["chat_template_kwargs"] = ctk

    trainer = GRPOTrainer(
        model=model, reward_funcs=[grpo_reward], args=GRPOConfig(**kwargs),
        train_dataset=Dataset.from_list(rows), processing_class=tok,
    )
    trainer.train()
    trainer.save_model(cfg["training"]["output_dir"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
