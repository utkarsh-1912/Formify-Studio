#!/usr/bin/env python
"""QLoRA supervised fine-tuning with TRL + PEFT.

  python ml/train/sft.py --config ml/train/configs/sft_qwen3_4b.yaml --dry-run   # validate config + data, no GPU needed
  python ml/train/sft.py --config ml/train/configs/sft_qwen3_4b.yaml             # train (needs CUDA GPU + requirements-train.txt)

STATUS: the config/data handling is unit-tested; the training path below has NOT been run in this repository.
TRL/PEFT APIs change between releases. Pin the versions that work for you in requirements-train.txt after the
first successful run, and expect to adjust argument names if you use a different TRL version.
"""

from __future__ import annotations

import argparse
import dataclasses
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common import filter_tasks, load_config, quant_kwargs, read_jsonl, to_prompt_completion, validate_sft_config  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", required=True)
    ap.add_argument("--dry-run", action="store_true", help="validate config and data, print the plan, exit")
    ap.add_argument("--tasks", nargs="*", help="restrict to tasks, e.g. generate edit (default: all)")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    problems = validate_sft_config(cfg)
    errors = [p for p in problems if not p.startswith("note:")]
    for p in problems:
        print(("WARN " if p.startswith("note:") else "ERROR ") + p, file=sys.stderr)
    if errors:
        return 2

    train_rows = filter_tasks(read_jsonl(cfg["data"]["train"]), args.tasks)
    val_path = cfg["data"].get("val")
    val_rows = filter_tasks(read_jsonl(val_path), args.tasks) if val_path and Path(val_path).exists() else []
    train = [to_prompt_completion(r) for r in train_rows]
    val = [to_prompt_completion(r) for r in val_rows]
    t = cfg["training"]
    eff = t["per_device_train_batch_size"] * t.get("gradient_accumulation_steps", 1)
    print(f"model={cfg['model']['name']} train_rows={len(train)} val_rows={len(val)} effective_batch={eff}")
    if not train:
        print("ERROR no training rows", file=sys.stderr)
        return 2
    if args.dry_run:
        print("dry run ok")
        return 0

    # Heavy imports only on the real path.
    import torch
    from datasets import Dataset
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import SFTConfig, SFTTrainer

    q = quant_kwargs(cfg["quantization"])
    bnb = BitsAndBytesConfig(
        load_in_4bit=q["load_in_4bit"],
        bnb_4bit_quant_type=q["bnb_4bit_quant_type"],
        bnb_4bit_use_double_quant=q["bnb_4bit_use_double_quant"],
        bnb_4bit_compute_dtype=getattr(torch, q["compute_dtype_name"]),
    )
    m = cfg["model"]
    tok = AutoTokenizer.from_pretrained(m["name"], revision=m.get("revision"), trust_remote_code=m.get("trust_remote_code", False))
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        m["name"], revision=m.get("revision"), quantization_config=bnb, torch_dtype=getattr(torch, q["compute_dtype_name"]),
        device_map="auto", trust_remote_code=m.get("trust_remote_code", False),
    )
    l = cfg["lora"]
    peft_cfg = LoraConfig(
        r=l["r"], lora_alpha=l["alpha"], lora_dropout=l.get("dropout", 0.0), bias=l.get("bias", "none"),
        target_modules=l.get("target_modules", "all-linear"), task_type="CAUSAL_LM",
    )
    sft_kwargs = {k: v for k, v in t.items()}
    sft_kwargs["max_length"] = cfg["data"]["max_seq_length"]  # named max_seq_length in older TRL releases
    ctk = m.get("chat_template_kwargs")
    field_names = {f.name for f in dataclasses.fields(SFTConfig)}
    if ctk:
        if "chat_template_kwargs" in field_names:
            sft_kwargs["chat_template_kwargs"] = ctk
        else:
            print("WARN installed TRL has no SFTConfig.chat_template_kwargs; Qwen3 will use its default (thinking) template. "
                  "Upgrade TRL or pre-render the template yourself.", file=sys.stderr)
    if "max_length" not in field_names and "max_seq_length" in field_names:
        sft_kwargs["max_seq_length"] = sft_kwargs.pop("max_length")
    if not val:
        for k in ("eval_strategy", "eval_steps", "per_device_eval_batch_size"):
            sft_kwargs.pop(k, None)

    trainer = SFTTrainer(
        model=model,
        args=SFTConfig(**sft_kwargs),
        train_dataset=Dataset.from_list(train),
        eval_dataset=Dataset.from_list(val) if val else None,
        processing_class=tok,
        peft_config=peft_cfg,
    )
    trainer.train()
    trainer.save_model(t["output_dir"])
    tok.save_pretrained(t["output_dir"])
    print(f"saved LoRA adapter to {t['output_dir']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
