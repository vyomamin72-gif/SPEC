"""Write the golden fixture JSON files into frontend/src/physics/__fixtures__/."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.physics.fixtures import FIXTURE_DIR, build_fixtures

if __name__ == "__main__":
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    for name, fixture in build_fixtures().items():
        path = FIXTURE_DIR / f"{name}.json"
        path.write_text(json.dumps(fixture, indent=1) + "\n")
        print(f"wrote {path}")
