"""Chat prompts shared by dataset building, training and eval.

The generation system prompt is READ FROM ml/schema/system_prompt.txt (exported from ml/eval/prompt.ts),
so training data uses exactly the text the eval harness sends. The user template must stay identical to
`userPrompt` in ml/eval/prompt.ts ("Create a form: <request>"); tests on both sides pin it.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from .schema import ML_DIR, target_text

SYSTEM_PROMPT_PATH: Path = ML_DIR / "schema" / "system_prompt.txt"
GENERATE_USER_PREFIX = "Create a form: "

EDIT_SYSTEM_PROMPT = (
    "You edit web forms defined in Formify schema v1. You are given the current form as JSON and an edit instruction. "
    "Reply with exactly one JSON array containing an RFC 6902 JSON Patch that applies the instruction, and nothing else. "
    'Use only the operations "add", "remove" and "replace". Append a field with path "/fields/-". '
    "Do not change anything the instruction does not mention. The patched form must remain valid Formify schema v1."
)


@lru_cache(maxsize=1)
def generate_system_prompt() -> str:
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").rstrip("\n")


def generate_messages(request: str) -> list[dict[str, str]]:
    """System + user messages for prompt -> schema."""
    return [
        {"role": "system", "content": generate_system_prompt()},
        {"role": "user", "content": f"{GENERATE_USER_PREFIX}{request}"},
    ]


def edit_messages(schema: dict, instruction: str) -> list[dict[str, str]]:
    """System + user messages for (schema, instruction) -> JSON Patch."""
    return [
        {"role": "system", "content": EDIT_SYSTEM_PROMPT},
        {"role": "user", "content": f"Current form:\n{target_text(schema)}\n\nInstruction: {instruction}"},
    ]
