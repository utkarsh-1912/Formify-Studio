#!/usr/bin/env python
"""Build MLC-LLM artifacts (quantized weights, chat config, WebGPU wasm) for in-browser use with WebLLM.

  python ml/train/export_mlc.py --merged ml/train/outputs/gguf/merged --out-dir ml/train/outputs/mlc \
      --quant q4f16_1 --conv-template <template> [--dry-run]

Requires the merged HF checkpoint from export_gguf.py (merge step) and an installed `mlc_llm` with a WebGPU
toolchain (Emscripten). STATUS: command construction is unit-tested; the flow has NOT been run here.
UNVERIFIED: the right --conv-template for Qwen3 (and whether Qwen3 is supported by your MLC version) must be
checked in the MLC-LLM docs. Constrained JSON decoding in the browser relies on WebLLM's grammar engine, so
re-run the eval harness against the WebLLM build, not only the GGUF.

After building: upload weights + wasm to a Hugging Face repo and register the model in WebLLM's `appConfig.model_list`
(model, model_id, model_lib) so the app can load it.
"""

from __future__ import annotations

import argparse
import shlex
import subprocess
from pathlib import Path


def build_commands(merged: Path, out_dir: Path, quant: str, conv_template: str, device: str = "webgpu") -> list[list[str]]:
    cfg = out_dir / "mlc-chat-config.json"
    return [
        ["mlc_llm", "convert_weight", str(merged), "--quantization", quant, "-o", str(out_dir)],
        ["mlc_llm", "gen_config", str(merged), "--quantization", quant, "--conv-template", conv_template, "-o", str(out_dir)],
        ["mlc_llm", "compile", str(cfg), "--device", device, "-o", str(out_dir / f"model-{device}.wasm")],
    ]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--merged", required=True, type=Path)
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--quant", default="q4f16_1")
    ap.add_argument("--conv-template", required=True, help="MLC conversation template for the base model (verify in MLC docs)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    cmds = build_commands(a.merged, a.out_dir, a.quant, a.conv_template)
    for c in cmds:
        print(shlex.join(c))
    if a.dry_run:
        return 0
    a.out_dir.mkdir(parents=True, exist_ok=True)
    for c in cmds:
        subprocess.run(c, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
