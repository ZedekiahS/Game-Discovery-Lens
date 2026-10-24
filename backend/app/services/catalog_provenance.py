"""Conservative provenance mapping for the existing bundled catalog, without reseeding data.

Only exact matching fields inherit the bundled claim; IDs alone never establish a source.
An edited/unknown record has no source/date claim and no inferred numeric zero.
"""
import json
from functools import lru_cache
from pathlib import Path


@lru_cache
def catalog_records():
    path = Path(__file__).resolve().parents[3] / "catalog" / "demo-catalog.json"
    return {row["id"]: row for row in json.loads(path.read_text(encoding="utf-8"))}


def content_source(game):
    row = catalog_records().get(game.id)
    if row and all(getattr(game, key) == row[key] for key in ("name", "summary", "tags")):
        return row.get("contentSource")
    return None


def metrics_kind(game):
    row = catalog_records().get(game.id)
    fields = {"name": "name", "price": "price", "rating": "rating", "review_count": "reviewCount", "ownership": "ownership", "revenue": "revenue"}
    return "demo" if row and all(getattr(game, key) == row[value] for key, value in fields.items()) else "unknown"
