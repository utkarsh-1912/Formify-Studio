import json
import sys
from pathlib import Path

ML = Path(__file__).resolve().parent.parent
for p in (ML, ML / "data", ML / "train"):
    sys.path.insert(0, str(p))

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def seeds() -> list[dict]:
    return json.loads((ML / "eval" / "seeds.json").read_text(encoding="utf-8"))
