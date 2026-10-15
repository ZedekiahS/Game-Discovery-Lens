from __future__ import annotations

import math
import re
from typing import Literal, TypedDict

SearchSortBy = Literal["name", "price", "rating", "review_count", "release_year", "revenue", "ownership"]
SearchSortDirection = Literal["asc", "desc"]

BUDGET_PRICE = 35
HIGH_RATING = 4.4
FREE_PRICE_PATTERN = r"(?<![a-z0-9])free(?:-to-play|\s+to\s+play)?(?![a-z0-9])|免费"

PRICE_PATTERNS = [
    r"(?<![a-z0-9])(?:under|below|less than)\s+\$?(\d+(?:\.\d+)?)(?![\d.])",
    r"(?<![\d.])(\d+(?:\.\d+)?)\s*美元\s*以下",
    r"低于\s*\$?(\d+(?:\.\d+)?)(?![\d.])\s*(?:美元)?",
]

TAG_ALIASES: dict[str, list[str]] = {
    "Racing": ["竞速", "赛车"], "Rhythm": ["节奏音乐", "音游"], "VR": ["虚拟现实"],
    "Building": ["自由建造"], "Auto Battler": ["自动战斗", "自走棋"], "Tower Defense": ["塔防"],
    "Turn-Based": ["回合制"], "Real-Time Strategy": ["即时战略"], "Visual Novel": ["视觉小说"], "Physics": ["物理互动"],
    "Action": ["动作"],
    "Adventure": ["冒险"],
    "Atmospheric": ["氛围", "沉浸"],
    "Card Battler": ["卡牌"],
    "Co-op": ["合作", "协作"],
    "Crafting": ["制作", "建造"],
    "Exploration": ["探索"],
    "FPS": ["第一人称射击"],
    "Management": ["管理"],
    "Multiplayer": ["多人", "联机"],
    "Open World": ["开放世界"],
    "Puzzle": ["解谜", "谜题"],
    "RPG": ["角色扮演"],
    "Roguelike": ["肉鸽"],
    "Shooter": ["射击", "枪战"],
    "Simulation": ["模拟"],
    "Singleplayer": ["单人"],
    "Space": ["太空"],
    "Story Rich": ["剧情", "故事"],
    "Strategy": ["策略"],
    "Survival": ["生存"],
    "Survival Horror": ["恐怖", "生存恐怖"],
}


class SearchIntent(TypedDict):
    title_query: str | None
    max_price: float | None
    min_rating: float
    has_reviews: bool
    tags: list[str]
    mode: Literal["player", "developer"]
    sort_by: SearchSortBy | None
    sort_direction: SearchSortDirection
    limit: int | None
    offset: int


def default_search_intent() -> SearchIntent:
    return {
        "title_query": None,
        "max_price": None,
        "min_rating": 0,
        "has_reviews": False,
        "tags": [],
        "mode": "player",
        "sort_by": None,
        "sort_direction": "asc",
        "limit": None,
        "offset": 0,
    }


def parse_search_intent(
    query: str, available_tags: list[str], available_titles: list[str] | None = None,
) -> SearchIntent:
    title, remainder = extract_title(query, available_titles or [])
    text = remainder.lower()
    intent = default_search_intent()

    apply_product_constraints(text, intent)
    for pattern in PRICE_PATTERNS:
        remainder = re.sub(pattern, " ", remainder, flags=re.IGNORECASE)

    if has_any(text, ["developer", "catalog", "revenue", "开发者"]):
        intent["mode"] = "developer"

    apply_ranking_intent(text, intent)

    matched_tags: set[str] = set()
    for tag in sorted(available_tags, key=len, reverse=True):
        pattern = phrase_pattern(tag, allow_game_suffix=True)
        if re.search(pattern, text, re.IGNORECASE):
            matched_tags.add(tag)
            remainder = re.sub(pattern, " ", remainder, flags=re.IGNORECASE)

    available_tag_lookup = {tag.lower(): tag for tag in available_tags}
    for word, canonical in (("story", "Story Rich"), ("horror", "Survival Horror")):
        if canonical.lower() in available_tag_lookup and has_any(text, [word]):
            matched_tags.add(available_tag_lookup[canonical.lower()])
            remainder = re.sub(phrase_pattern(word), " ", remainder, flags=re.IGNORECASE)

    for canonical, aliases in TAG_ALIASES.items():
        tag = available_tag_lookup.get(canonical.lower())
        if tag:
            for alias in sorted(aliases, key=len, reverse=True):
                if alias in text:
                    matched_tags.add(tag)
                    remainder = remainder.replace(alias, " ")

    intent["tags"] = prioritize_tags(sorted(matched_tags), text)
    remainder = remove_filter_words(remainder, intent)
    intent["title_query"] = normalize_title(f"{title or ''} {remainder}")
    return intent


def apply_product_constraints(text: str, intent: SearchIntent) -> None:
    """Apply recognized product conditions to text with quoted/known titles removed."""
    explicit_price = next((match for pattern in PRICE_PATTERNS if (match := re.search(pattern, text))), None)
    if re.search(FREE_PRICE_PATTERN, text, re.IGNORECASE):
        intent["max_price"] = 0
    elif explicit_price:
        intent["max_price"] = float(explicit_price.group(1))
    elif is_budget_price_query(text):
        intent["max_price"] = BUDGET_PRICE

    if has_any(text, ["highly rated", "top rated", "高评分"]):
        intent["min_rating"] = HIGH_RATING
        intent["has_reviews"] = True
    elif has_any(text, ["good reviews", "review", "reviews", "rated", "有评价"]):
        intent["has_reviews"] = True


def phrase_pattern(phrase: str, *, allow_game_suffix: bool = False) -> str:
    suffix = r"(?=$|[^a-z0-9]|games?(?![a-z0-9]))" if allow_game_suffix else r"(?![a-z0-9])"
    return rf"(?<![a-z0-9]){re.escape(phrase)}{suffix}"


def extract_title(query: str, available_titles: list[str]) -> tuple[str | None, str]:
    # Protect titles before interpreting words such as Space, First, or Survival.
    quoted = re.search(r'"([^"\n]+)"|“([^”\n]+)”|(?<![a-zA-Z0-9])\x27([^\x27\n]+)\x27(?![a-zA-Z0-9])', query)
    if quoted:
        title = normalize_title(next(group for group in quoted.groups() if group is not None))
        return title, query[:quoted.start()] + " " + query[quoted.end():]
    for title in sorted(available_titles, key=lambda value: (-len(value), value.lower())):
        if not title.strip():
            continue
        match = re.search(phrase_pattern(title), query, flags=re.IGNORECASE)
        if match:
            # "most expensive FPS" is a ranking even if a title is "Expensive FPS".
            if re.search(r"\b(?:most|least|highest|lowest)\s+$", query[:match.start()], re.IGNORECASE):
                continue
            return normalize_title(match.group()), query[:match.start()] + " " + query[match.end():]
    return None, query


def normalize_title(value: object | None) -> str | None:
    if not isinstance(value, str):
        return None
    return " ".join(value.lower().split()) or None


def remove_filter_words(text: str, intent: SearchIntent) -> str:
    text = re.sub(FREE_PRICE_PATTERN, " ", text, flags=re.IGNORECASE)
    phrases = [
        "most expensive", "highest price", "priciest", "cheapest", "lowest price", "least expensive",
        "cheap", "deal", "highest rated", "top rated", "best rated", "highly rated", "best",
        "most reviewed", "review volume", "most reviews", "newest", "latest", "most recent", "oldest",
        "highest revenue", "most revenue", "top revenue", "most owned", "highest ownership",
        "good reviews", "reviews", "review", "rated",
    ]
    for phrase in sorted(phrases, key=len, reverse=True):
        text = re.sub(phrase_pattern(phrase), " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\btop\s+\d{1,2}\b|\b(?:show|find|give me|list)\s+(?:the\s+)?\d{1,2}\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\b", " ", text, flags=re.IGNORECASE)
    if intent["mode"] == "developer":
        text = re.sub(r"\b(?:developer|catalog|revenue|market|analysis)\b|开发者|分析", " ", text, flags=re.IGNORECASE)
    if intent["has_reviews"]:
        text = re.sub(r"高评分|有评价", " ", text)
    text = re.sub(r"第[一二三四五]\s*贵|最便宜|最贵|便宜|第[一二三四五]", " ", text)
    text = re.sub(r"\b(?:show|find|give\s+me|list|all|the|a|an|me|games?|please|with|and|for|of|dollars?|usd|premium)\b", " ", text, flags=re.IGNORECASE)
    if intent["tags"] or intent["sort_by"] is not None or intent["max_price"] is not None or intent["has_reviews"] or intent["mode"] == "developer":
        # Only consume connector segments separated by recognized conditions, preserving unknown words.
        text = re.sub(r"(^|\s)(?:找|为|且|的|类|游戏)+(?=\s|$)", " ", text)
    return text.strip(" \t\r\n,;:!?，；：！？")


def normalize_search_intent(raw_intent: dict[str, object], available_tags: list[str]) -> SearchIntent:
    intent = default_search_intent()
    available_tag_lookup = {tag.lower(): tag for tag in available_tags}

    intent["title_query"] = normalize_title(get_first(raw_intent, "titleQuery", "title_query"))
    raw_price = get_first(raw_intent, "maxPrice", "max_price")
    intent["max_price"] = None if raw_price is None else clamp_number(raw_price, default=None, minimum=0, maximum=500)
    intent["min_rating"] = clamp_number(get_first(raw_intent, "minRating", "min_rating"), default=0, minimum=0, maximum=5)
    intent["has_reviews"] = coerce_bool(get_first(raw_intent, "hasReviews", "has_reviews"), default=False)

    raw_mode = str(raw_intent.get("mode", "player")).lower()
    intent["mode"] = "developer" if raw_mode == "developer" else "player"

    sort_by = normalize_sort_by(get_first(raw_intent, "sortBy", "sort_by"))
    if sort_by is not None:
        intent["sort_by"] = sort_by

    raw_sort_direction = str(get_first(raw_intent, "sortDirection", "sort_direction") or "").strip().lower()
    if raw_sort_direction in {"desc", "descending"}:
        intent["sort_direction"] = "desc"
    elif raw_sort_direction in {"asc", "ascending"}:
        intent["sort_direction"] = "asc"

    intent["limit"] = clamp_integer(get_first(raw_intent, "limit"), default=None, minimum=1, maximum=50)
    intent["offset"] = clamp_integer(get_first(raw_intent, "offset"), default=0, minimum=0, maximum=100) or 0

    raw_tags = raw_intent.get("tags", [])
    if isinstance(raw_tags, list):
        tags: list[str] = []
        for raw_tag in raw_tags:
            normalized_tag = str(raw_tag).strip().lower()
            tag = available_tag_lookup.get(normalized_tag)
            if tag and tag not in tags:
                tags.append(tag)
        intent["tags"] = tags[:3]

    return intent


def apply_ranking_intent(text: str, intent: SearchIntent) -> None:
    if has_any(text, ["most expensive", "highest price", "priciest"]) or "最贵" in text or re.search(r"第[一二三四五]\s*贵", text):
        intent["sort_by"] = "price"
        intent["sort_direction"] = "desc"
        if should_limit_superlative(text):
            intent["limit"] = 1
    elif has_any(text, ["cheapest", "lowest price", "least expensive"]) or "最便宜" in text:
        intent["sort_by"] = "price"
        intent["sort_direction"] = "asc"
        if should_limit_superlative(text):
            intent["limit"] = 1
    elif has_any(text, ["cheap", "deal"]) or "便宜" in text:
        intent["sort_by"] = "price"
        intent["sort_direction"] = "asc"
    elif has_any(text, ["highest rated", "top rated", "best rated", "highly rated", "高评分"]) or re.search(r"\bbest\b", text):
        intent["sort_by"] = "rating"
        intent["sort_direction"] = "desc"
    elif has_any(text, ["most reviewed", "review volume", "most reviews"]):
        intent["sort_by"] = "review_count"
        intent["sort_direction"] = "desc"
    elif has_any(text, ["newest", "latest", "most recent"]):
        intent["sort_by"] = "release_year"
        intent["sort_direction"] = "desc"
    elif has_any(text, ["oldest"]):
        intent["sort_by"] = "release_year"
        intent["sort_direction"] = "asc"
    elif has_any(text, ["highest revenue", "most revenue", "top revenue"]):
        intent["sort_by"] = "revenue"
        intent["sort_direction"] = "desc"
    elif has_any(text, ["most owned", "highest ownership"]):
        intent["sort_by"] = "ownership"
        intent["sort_direction"] = "desc"

    limit = parse_requested_limit(text)
    if limit is not None:
        intent["limit"] = limit
        if intent["sort_by"] is None:
            intent["sort_by"] = "rating"
            intent["sort_direction"] = "desc"

    ordinal_rank = parse_ordinal_rank(text)
    if ordinal_rank is not None:
        intent["offset"] = ordinal_rank - 1
        intent["limit"] = 1


def is_budget_price_query(text: str) -> bool:
    if has_any(text, ["cheapest", "lowest price", "least expensive"]) or "最便宜" in text:
        return False
    return has_any(text, ["cheap", "deal"]) or "便宜" in text


def should_limit_superlative(text: str) -> bool:
    if parse_requested_limit(text) is not None:
        return False
    if re.search(r"\b(?:all|list)\b", text):
        return False
    if re.search(r"\bgames\b", text) and not re.search(r"\bgame\b", text):
        return False
    return True


def parse_requested_limit(text: str) -> int | None:
    patterns = [
        r"\btop\s+(\d{1,2})\b",
        r"\b(?:show|find|give me|list)\s+(?:the\s+)?(\d{1,2})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return max(1, min(int(match.group(1)), 50))
    return None


def parse_ordinal_rank(text: str) -> int | None:
    ordinal_words = {
        "first": 1,
        "1st": 1,
        "second": 2,
        "2nd": 2,
        "third": 3,
        "3rd": 3,
        "fourth": 4,
        "4th": 4,
        "fifth": 5,
        "5th": 5,
    }
    chinese_ordinals = {
        "第一": 1,
        "第二": 2,
        "第三": 3,
        "第四": 4,
        "第五": 5,
    }
    for token, rank in chinese_ordinals.items():
        if token in text:
            return rank
    for token, rank in ordinal_words.items():
        if re.search(rf"\b{re.escape(token)}\b", text):
            return rank
    return None


def has_any(text: str, phrases: list[str]) -> bool:
    return any(re.search(phrase_pattern(phrase), text, re.IGNORECASE) for phrase in phrases)


def normalize_sort_by(value: object | None) -> SearchSortBy | None:
    if value is None:
        return None
    normalized = str(value).strip().lower().replace("-", "_")
    aliases: dict[str, SearchSortBy] = {
        "name": "name",
        "price": "price",
        "rating": "rating",
        "review_count": "review_count",
        "reviewcount": "review_count",
        "reviews": "review_count",
        "release_year": "release_year",
        "releaseyear": "release_year",
        "year": "release_year",
        "revenue": "revenue",
        "ownership": "ownership",
        "owners": "ownership",
    }
    return aliases.get(normalized)


def prioritize_tags(tags: list[str], text: str) -> list[str]:
    priority: list[str] = []

    def push(tag: str) -> None:
        if tag in tags and tag not in priority:
            priority.append(tag)

    if "multiplayer" in text:
        push("Multiplayer")
    if "survival" in text:
        push("Survival")
    if "story" in text:
        push("Story Rich")
    if "exploration" in text:
        push("Exploration")
    if "puzzle" in text:
        push("Puzzle")

    for tag in tags:
        push(tag)

    return priority[:3]


def get_first(values: dict[str, object], *keys: str) -> object | None:
    for key in keys:
        if key in values:
            return values[key]
    return None


def clamp_number(value: object | None, *, default: float | None, minimum: float, maximum: float) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default

    return min(max(number, minimum), maximum) if math.isfinite(number) else default


def clamp_integer(value: object | None, *, default: int | None, minimum: int, maximum: int) -> int | None:
    if value is None or value == "":
        return default
    try:
        number = int(float(value))
    except (TypeError, ValueError, OverflowError):
        return default

    return min(max(number, minimum), maximum)


def coerce_bool(value: object | None, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return default
