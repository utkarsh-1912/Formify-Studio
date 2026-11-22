"""Teacher-model clients for synthetic data generation.

`Teacher` talks to any OpenAI-compatible chat endpoint using only the standard library.
`MockTeacher` is deterministic and offline: it exists to dry-run and unit-test the pipeline.
**Mock output is placeholder data and must never be used to train a released model.**
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import time
import urllib.error
import urllib.request
from typing import Any

from .prompts import EDIT_SYSTEM_PROMPT, generate_messages
from .schema import target_text
from .text import extract_json


class TeacherError(RuntimeError):
    pass


class Teacher:
    """Real teacher over an OpenAI-compatible /chat/completions endpoint."""

    method = "teacher"

    def __init__(
        self,
        model: str,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 120.0,
        retries: int = 3,
        temperature: float = 0.8,
        json_schema: dict | None = None,
    ) -> None:
        self.model = model
        self.base_url = (base_url or os.environ.get("TEACHER_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
        self.api_key = api_key or os.environ.get("TEACHER_API_KEY")
        self.timeout, self.retries, self.temperature = timeout, retries, temperature
        self.json_schema = json_schema  # optional constrained decoding for authoring; backend support varies

    def chat(self, messages: list[dict[str, str]], temperature: float | None = None, schema: dict | None = None) -> str:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature if temperature is None else temperature,
        }
        if schema is not None:
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": "formify_form", "schema": schema}}
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        req = urllib.request.Request(f"{self.base_url}/chat/completions", json.dumps(body).encode(), headers)
        last: Exception | None = None
        for attempt in range(self.retries):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    data = json.loads(resp.read())
                return data["choices"][0]["message"]["content"]
            except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError) as e:
                last = e
                time.sleep(2**attempt)
        raise TeacherError(f"teacher request failed after {self.retries} attempts: {last}")

    # --- tasks ---------------------------------------------------------------------------------------
    def ideate(self, domain: str, style: str, k: int) -> list[str]:
        """Ask for k distinct, realistic form requests in a domain and writing style."""
        text = self.chat(
            [
                {
                    "role": "system",
                    "content": "You write realistic requests that people type into a form builder. Reply with only a JSON array of strings.",
                },
                {
                    "role": "user",
                    "content": f"Write {k} different one-sentence requests for forms in the domain '{domain}'. "
                    f"Style: {style}. Each must describe a different kind of form. Do not number them.",
                },
            ],
            temperature=1.0,
        )
        items = extract_json(text, opener="[")
        return [s.strip() for s in items if isinstance(s, str) and s.strip()]

    def author(self, request: str) -> str:
        """Raw teacher output for the student's exact prompt (distillation)."""
        return self.chat(generate_messages(request), temperature=0.4, schema=self.json_schema)

    def edit(self, schema: dict) -> str:
        """Raw JSON object {"instruction": str, "patch": [...]} proposing a natural edit and its patch."""
        return self.chat(
            [
                {"role": "system", "content": EDIT_SYSTEM_PROMPT + ' Reply with {"instruction": "...", "patch": [...]} where instruction is a natural request a user might make.'},
                {"role": "user", "content": f"Current form:\n{target_text(schema)}\n\nInvent one realistic edit and give its patch."},
            ],
            temperature=0.9,
        )


# ------------------------------------------------------------------------------------------------------
_POOL: list[tuple[str, str, str, bool]] = [
    ("fullName", "text", "Full Name", True),
    ("email", "email", "Email Address", True),
    ("phone", "text", "Phone Number", False),
    ("date", "date", "Preferred Date", False),
    ("quantity", "number", "Quantity", False),
    ("details", "textarea", "Details", False),
    ("company", "text", "Company", False),
    ("agree", "checkbox", "I agree to the terms", True),
]


class MockTeacher(Teacher):
    """Deterministic offline stand-in. Produces valid but bland, templated data."""

    method = "mock"

    def __init__(self) -> None:
        super().__init__(model="mock-teacher")

    def ideate(self, domain: str, style: str, k: int) -> list[str]:
        kinds = ["registration", "feedback survey", "request", "application", "booking", "intake", "signup", "inquiry", "report", "order"]
        rng = random.Random(hashlib.sha256(f"{domain}|{style}".encode()).hexdigest())
        picks = rng.sample(kinds, min(k, len(kinds)))
        return [f"{kind} form for {domain} ({style}, #{rng.randint(1, 10**6)})" for kind in picks]

    def author(self, request: str) -> str:
        rng = random.Random(hashlib.sha256(request.encode()).hexdigest())
        fields = rng.sample(_POOL, rng.randint(3, 6))
        out = [{"id": i, "type": t, "label": lab, **({"required": True} if req else {})} for i, t, lab, req in fields]
        out.append({"id": "topic", "type": "select", "label": "Topic", "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]})
        title = request.split(" (")[0][:60].title()
        return json.dumps({"schemaVersion": 1, "formTitle": title, "fields": out})

    def edit(self, schema: dict) -> str:
        i = len(schema["fields"]) - 1
        return json.dumps(
            {
                "instruction": f"Make the {schema['fields'][i]['label']} field required.",
                "patch": [{"op": "add", "path": f"/fields/{i}/required", "value": True}],
            }
        )
