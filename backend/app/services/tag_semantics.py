"""Shared, directional tag families; never infer unsupported modes from missing tags."""
import json
from pathlib import Path

TAG_FAMILIES = json.loads((Path(__file__).resolve().parents[3] / 'catalog' / 'tag-families.json').read_text(encoding='utf-8'))


def matching_tags(choice: str) -> list[str]:
    return TAG_FAMILIES.get(choice, [choice])


def available_tag_choices(tags) -> list[str]:
    known = set(tags)
    return sorted(known | {parent for parent, members in TAG_FAMILIES.items() if known.intersection(members)})


def conflicts_with_exclusions(required: str, excluded: list[str]) -> bool:
    return any(required in matching_tags(choice) for choice in excluded)
