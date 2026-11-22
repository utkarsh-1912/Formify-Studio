#!/usr/bin/env python
"""Generate raw synthetic training records (no filtering/splitting; see filter_and_split.py).

Tasks
  generate : prompt -> Formify schema          (teacher distillation)
  edit     : (schema, instruction) -> JSON Patch (programmatic and/or teacher-written, always verified by applying)

Examples
  # offline dry run with the deterministic mock teacher (placeholder data, NOT for training a release)
  python ml/data/generate_synthetic.py --mock --n 200 --out ml/data/out/raw.jsonl

  # real run against an OpenAI-compatible teacher (set TEACHER_API_KEY; verify the teacher's terms allow training)
  python ml/data/generate_synthetic.py --teacher-model <id> --teacher-base-url https://.../v1 \
      --teacher-license "<license/ToS you verified>" --n 20000 --edits-per-form 2 --out ml/data/out/raw.jsonl

Every record carries provenance (teacher, declared license, method, seed, script version, timestamp).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from formify_ml import SCRIPT_VERSION  # noqa: E402
from formify_ml.edits import make_edit  # noqa: E402
from formify_ml.patch import PatchError, apply_patch  # noqa: E402
from formify_ml.schema import SCHEMA_PATH, is_valid, schema_hash  # noqa: E402
from formify_ml.teacher import MockTeacher, Teacher, TeacherError  # noqa: E402
from formify_ml.text import extract_json  # noqa: E402

DOMAINS = [
    "healthcare clinic", "dentistry", "human resources", "recruiting", "university admissions", "K-12 school", "online courses",
    "e-commerce store", "wholesale", "restaurant", "catering", "events and conferences", "weddings", "SaaS product support",
    "software bug reporting", "banking and loans", "accounting", "insurance claims", "real estate rentals", "property management",
    "hotels", "travel agency", "car rental", "nonprofit donations", "volunteering", "legal services", "local government",
    "public utilities", "gym and fitness", "sports clubs", "veterinary clinic", "agriculture", "construction", "manufacturing quality",
    "logistics and shipping", "IT helpdesk", "cybersecurity incidents", "marketing campaigns", "market research surveys", "academic research",
    "libraries", "museums", "churches and community groups", "beauty salon", "photography studio", "music lessons", "coworking space",
    "telecom", "energy and solar", "pharmacy",
]
STYLES = [
    "short and casual",
    "detailed, naming several specific fields",
    "formal business wording",
    "mentions a constraint such as which fields are required or lists dropdown options",
    "very terse, 3 to 6 words",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def provenance(teacher: Teacher, method: str, seed: int, teacher_license: str) -> dict:
    return {
        "method": method,
        "teacher": teacher.model if method in ("teacher", "mock") else None,
        "teacher_license": teacher_license if method == "teacher" else None,
        "seed": seed,
        "script_version": SCRIPT_VERSION,
        "created_at": now_iso(),
    }


def rec_id(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def ideate_requests(teacher: Teacher, n: int, rng: random.Random, per_call: int = 10) -> list[tuple[str, str]]:
    """Return [(domain, request)] until n collected (duplicates removed case-insensitively)."""
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    guard = 0
    while len(out) < n and guard < n * 4:
        guard += 1
        domain, style = rng.choice(DOMAINS), rng.choice(STYLES)
        try:
            items = teacher.ideate(domain, style, per_call)
        except (TeacherError, ValueError, json.JSONDecodeError) as e:
            print(f"ideate failed ({domain}): {e}", file=sys.stderr)
            continue
        for req in items:
            key = req.lower()
            if key not in seen and len(out) < n:
                seen.add(key)
                out.append((domain, req))
    return out


def author_one(teacher: Teacher, domain: str, request: str, seed: int, teacher_license: str) -> dict | None:
    try:
        raw = teacher.author(request)
        form = extract_json(raw)
    except (TeacherError, ValueError, json.JSONDecodeError) as e:
        print(f"author failed: {e}", file=sys.stderr)
        return None
    if not isinstance(form, dict) or not is_valid(form):
        return None  # invalid teacher output is simply dropped (counted by the caller)
    return {
        "id": rec_id("generate", request),
        "task": "generate",
        "domain": domain,
        "prompt": request,
        "gold": form,
        "provenance": provenance(teacher, teacher.method, seed, teacher_license),
    }


def build_generate_records(teacher: Teacher, n: int, seed: int, teacher_license: str, workers: int) -> tuple[list[dict], int]:
    rng = random.Random(seed)
    requests = ideate_requests(teacher, n, rng)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(lambda dr: author_one(teacher, dr[0], dr[1], seed, teacher_license), requests))
    records = [r for r in results if r]
    return records, len(requests) - len(records)


def edit_from_teacher(teacher: Teacher, base: dict) -> tuple[str, list[dict], dict] | None:
    try:
        obj = extract_json(teacher.edit(base))
        instruction, patch = obj["instruction"], obj["patch"]
        if not isinstance(instruction, str) or not instruction.strip():
            return None
        after = apply_patch(base, patch)
    except (TeacherError, ValueError, KeyError, TypeError, PatchError, json.JSONDecodeError):
        return None
    return (instruction.strip(), patch, after) if after != base and is_valid(after) else None


def build_edit_records(
    teacher: Teacher, bases: list[dict], per_form: int, seed: int, method: str, teacher_license: str
) -> list[dict]:
    """method: 'programmatic' | 'teacher' | 'mixed' (alternate)."""
    rng = random.Random(seed + 1)
    out: list[dict] = []
    for base in bases:
        form = base["gold"]
        for k in range(per_form):
            use_teacher = method == "teacher" or (method == "mixed" and k % 2 == 1)
            got = edit_from_teacher(teacher, form) if use_teacher else make_edit(rng, form)
            if got is None:
                continue
            instruction, patch, after = got
            m = teacher.method if use_teacher else "programmatic"
            out.append(
                {
                    "id": rec_id("edit", schema_hash(form), instruction, json.dumps(patch, sort_keys=True)),
                    "task": "edit",
                    "domain": base["domain"],
                    "schema": form,
                    "instruction": instruction,
                    "patch": patch,
                    "gold": after,
                    "provenance": provenance(teacher, m, seed, teacher_license),
                }
            )
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, help="output JSONL (raw, unfiltered)")
    ap.add_argument("--n", type=int, default=1000, help="number of generate prompts to attempt")
    ap.add_argument("--task", choices=["generate", "edit", "both"], default="both")
    ap.add_argument("--edits-per-form", type=int, default=2)
    ap.add_argument("--edit-method", choices=["programmatic", "teacher", "mixed"], default="programmatic")
    ap.add_argument("--from-raw", help="existing raw JSONL of generate records to use as edit bases (with --task edit)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--mock", action="store_true", help="use the offline mock teacher (placeholder data)")
    ap.add_argument("--teacher-model")
    ap.add_argument("--teacher-base-url")
    ap.add_argument("--teacher-license", default="UNKNOWN", help="license/ToS you verified permits using outputs for training")
    ap.add_argument("--constrain-teacher", action="store_true", help="send the Formify JSON Schema to the teacher (if supported)")
    args = ap.parse_args(argv)

    if args.mock:
        teacher: Teacher = MockTeacher()
    else:
        if not args.teacher_model:
            ap.error("--teacher-model is required unless --mock")
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8")) if args.constrain_teacher else None
        teacher = Teacher(args.teacher_model, base_url=args.teacher_base_url, json_schema=schema)

    records: list[dict] = []
    dropped = 0
    if args.task in ("generate", "both"):
        gen, dropped = build_generate_records(teacher, args.n, args.seed, args.teacher_license, args.workers)
        records += gen
        print(f"generate: kept {len(gen)}, dropped {dropped} invalid/failed", file=sys.stderr)
    if args.task in ("edit", "both"):
        if args.task == "edit":
            if not args.from_raw:
                ap.error("--task edit requires --from-raw")
            bases = [json.loads(line) for line in Path(args.from_raw).read_text(encoding="utf-8").splitlines() if line.strip()]
            bases = [b for b in bases if b.get("task") == "generate"]
        else:
            bases = [r for r in records if r["task"] == "generate"]
        edits = build_edit_records(teacher, bases, args.edits_per_form, args.seed, args.edit_method, args.teacher_license)
        records += edits
        print(f"edit: produced {len(edits)} from {len(bases)} base forms", file=sys.stderr)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"wrote {len(records)} records to {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
