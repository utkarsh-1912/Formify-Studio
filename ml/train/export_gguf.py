#!/usr/bin/env python
"""Merge a LoRA adapter into its base model and convert to GGUF for llama.cpp / Ollama.

  python ml/train/export_gguf.py --base Qwen/Qwen3-4B --adapter ml/train/outputs/formify-schema-4b-sft \
      --llama-cpp-dir C:/src/llama.cpp --out-dir ml/train/outputs/gguf --quant Q4_K_M [--dry-run]

Steps: (1) merge adapter into the *unquantized* base and save an HF checkpoint, (2) llama.cpp convert_hf_to_gguf.py
to f16, (3) llama-quantize to --quant, (4) write an Ollama Modelfile.
STATUS: command construction is unit-tested; the full flow has NOT been run here. llama.cpp script/binary names and
flags change over time; check your llama.cpp checkout. Evaluate the quantized file with the eval harness
(ollama adapter) before trusting it, since quantization can hurt structured output.
"""

from __future__ import annotations

import argparse
import shlex
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def build_commands(merged_dir: Path, llama_cpp_dir: Path, out_dir: Path, quant: str, name: str) -> list[list[str]]:
    f16 = out_dir / f"{name}-f16.gguf"
    quantized = out_dir / f"{name}-{quant}.gguf"
    convert = llama_cpp_dir / "convert_hf_to_gguf.py"
    quantize = llama_cpp_dir / "build" / "bin" / "llama-quantize"  # adjust for your build layout (Windows: .exe, Release/)
    return [
        [sys.executable, str(convert), str(merged_dir), "--outfile", str(f16), "--outtype", "f16"],
        [str(quantize), str(f16), str(quantized), quant],
    ]


def modelfile(gguf_name: str, system_prompt: str) -> str:
    # NOTE: no TEMPLATE line. Whether Ollama picks the chat template up from GGUF metadata depends on version;
    # verify with `ollama show --modelfile` and add a TEMPLATE matching the base model if outputs look wrong.
    return f'FROM ./{gguf_name}\nPARAMETER temperature 0\nSYSTEM """{system_prompt}"""\n'


def merge_adapter(base: str, adapter: str, merged_dir: Path, revision: str | None) -> None:
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    model = AutoModelForCausalLM.from_pretrained(base, revision=revision, torch_dtype=torch.bfloat16)
    merged = PeftModel.from_pretrained(model, adapter).merge_and_unload()
    merged_dir.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(merged_dir, safe_serialization=True)
    AutoTokenizer.from_pretrained(base, revision=revision).save_pretrained(merged_dir)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True)
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--revision")
    ap.add_argument("--llama-cpp-dir", required=True, type=Path)
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--quant", default="Q4_K_M")
    ap.add_argument("--name", default="formify-schema")
    ap.add_argument("--dry-run", action="store_true", help="print commands without running anything")
    a = ap.parse_args(argv)

    merged_dir = a.out_dir / "merged"
    cmds = build_commands(merged_dir, a.llama_cpp_dir, a.out_dir, a.quant, a.name)
    print(f"# 1. merge {a.adapter} into {a.base} -> {merged_dir}")
    for c in cmds:
        print(shlex.join(c))
    if a.dry_run:
        return 0

    from formify_ml.prompts import generate_system_prompt

    a.out_dir.mkdir(parents=True, exist_ok=True)
    merge_adapter(a.base, a.adapter, merged_dir, a.revision)
    for c in cmds:
        subprocess.run(c, check=True)
    (a.out_dir / "Modelfile").write_text(modelfile(f"{a.name}-{a.quant}.gguf", generate_system_prompt()), encoding="utf-8")
    print(f"done: {a.out_dir}. Next: ollama create {a.name} -f {a.out_dir / 'Modelfile'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
