#!/usr/bin/env python
"""Write MANIFEST.json (license + provenance) for a split dataset and optionally render the HF dataset card.

  python ml/data/manifest.py --dir ml/data/out/dataset --dataset-license apache-2.0 --render-card

Refuses (exit 2) to produce a manifest when:
  * the data contains mock-teacher rows (placeholder data) unless --allow-mock, or
  * any teacher-generated row lacks a verified teacher license (declared as UNKNOWN/empty at generation time).
This does NOT verify licenses for you: it forces a human to have declared them. Check each teacher's terms.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from formify_ml import SCRIPT_VERSION  # noqa: E402
from formify_ml.prompts import SYSTEM_PROMPT_PATH  # noqa: E402
from formify_ml.schema import ML_DIR, SCHEMA_PATH  # noqa: E402

SPLITS = ("train", "val", "test")
TEMPLATE = Path(__file__).resolve().parent / "DATASET_CARD.template.md"


class ManifestError(Exception):
    pass


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def build_manifest(directory: Path, dataset_license: str, allow_mock: bool = False) -> dict:
    files: dict[str, dict] = {}
    methods: Counter[str] = Counter()
    tasks: Counter[str] = Counter()
    teachers: Counter[tuple[str, str]] = Counter()
    for split in SPLITS:
        p = directory / f"{split}.jsonl"
        if not p.exists():
            raise ManifestError(f"missing {p}")
        rows = [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]
        files[f"{split}.jsonl"] = {"rows": len(rows), "sha256": sha256_file(p)}
        for r in rows:
            prov = r.get("provenance") or {}
            m = prov.get("method", "unknown")
            methods[m] += 1
            tasks[r.get("task", "unknown")] += 1
            if m == "mock" and not allow_mock:
                raise ManifestError("dataset contains mock-teacher rows (placeholder data); regenerate with a real teacher")
            if m == "teacher":
                lic = prov.get("teacher_license")
                if not lic or lic.upper() == "UNKNOWN":
                    raise ManifestError("teacher-generated rows have no declared teacher license; re-run generation with --teacher-license")
                teachers[(str(prov.get("teacher")), lic)] += 1
    if not dataset_license:
        raise ManifestError("--dataset-license is required")

    report_path = directory / "filter_report.json"
    seeds_path = ML_DIR / "eval" / "seeds.json"
    return {
        "name": directory.name,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "script_version": SCRIPT_VERSION,
        "dataset_license": dataset_license,
        "files": files,
        "rows_by_task": dict(tasks),
        "rows_by_method": dict(methods),
        "teachers": [{"model": m, "declared_license": lic, "rows": n} for (m, lic), n in sorted(teachers.items())],
        "schema_sha256": sha256_file(SCHEMA_PATH),
        "system_prompt_sha256": sha256_file(SYSTEM_PROMPT_PATH),
        "decontamination_seeds_sha256": sha256_file(seeds_path) if seeds_path.exists() else None,
        "filter_report": json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else None,
        "notes": "Declared licenses are what the generator operator asserted; they are not verified by this tool.",
    }


def render_card(manifest: dict) -> str:
    tpl = TEMPLATE.read_text(encoding="utf-8")
    teachers = ", ".join(f"{t['model']} ({t['declared_license']})" for t in manifest["teachers"]) or "none (programmatic only)"
    values = {
        "name": manifest["name"],
        "license": manifest["dataset_license"],
        "train_rows": manifest["files"]["train.jsonl"]["rows"],
        "val_rows": manifest["files"]["val.jsonl"]["rows"],
        "test_rows": manifest["files"]["test.jsonl"]["rows"],
        "rows_by_task": json.dumps(manifest["rows_by_task"]),
        "rows_by_method": json.dumps(manifest["rows_by_method"]),
        "teachers": teachers,
        "created_at": manifest["created_at"],
        "schema_sha256": manifest["schema_sha256"],
    }
    for k, v in values.items():
        tpl = tpl.replace("{{" + k + "}}", str(v))
    return tpl


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True, type=Path)
    ap.add_argument("--dataset-license", required=True)
    ap.add_argument("--allow-mock", action="store_true", help="permit mock rows (dry runs only)")
    ap.add_argument("--render-card", action="store_true", help="also write README.md (HF dataset card) from the template")
    a = ap.parse_args(argv)
    try:
        manifest = build_manifest(a.dir, a.dataset_license, a.allow_mock)
    except ManifestError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    (a.dir / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    if a.render_card:
        (a.dir / "README.md").write_text(render_card(manifest), encoding="utf-8")
    print(f"wrote {a.dir / 'MANIFEST.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
