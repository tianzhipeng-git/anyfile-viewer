from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any
from urllib.parse import urlsplit


VIEW_ACTIONS = ("viewer", "view", "open", "opener", "reader", "preview", "player")
NON_VIEW_ACTIONS = (
    "convert", "converter", "editor", "edit", "template", "repair", "recovery",
    "download", "install", "software",
)
DEFAULT_SETTINGS = {
    "suggestions_limit": 100,
    "minimum_suggestion_volume": 10,
    "max_keywords_per_candidate": 40,
    "serp_depth": 10,
    "trends_time_range": "past_12_months",
}


class ResearchError(RuntimeError):
    pass


def normalize(value: str) -> str:
    return " ".join(value.lower().strip().split())


def contains_term(text: str, term: str) -> bool:
    text = normalize(text)
    term = normalize(term).lstrip(".")
    if " " in term:
        return term in text
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None


def _validate_string_list(value: Any, field: str, candidate_id: str, *, maximum: int | None = None) -> None:
    if not isinstance(value, list) or not value or not all(isinstance(item, str) and item.strip() for item in value):
        raise ResearchError(f"{candidate_id}: {field} must be a non-empty string array")
    normalized = [normalize(item) for item in value]
    if len(normalized) != len(set(normalized)):
        raise ResearchError(f"{candidate_id}: {field} must not contain duplicates")
    if maximum is not None and len(value) > maximum:
        raise ResearchError(f"{candidate_id}: {field} allows at most {maximum} values")


def validate_config(config: dict[str, Any]) -> None:
    if config.get("methodology_version") != "1.1":
        raise ResearchError("methodology_version must be '1.1'")
    market = config.get("market")
    if not isinstance(market, dict):
        raise ResearchError("market must be an object")
    if not isinstance(market.get("location_code"), int) or market["location_code"] <= 0:
        raise ResearchError("market.location_code must be a positive integer")
    if not isinstance(market.get("language_code"), str) or not market["language_code"].strip():
        raise ResearchError("market.language_code must be a non-empty string")
    candidates = config.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ResearchError("candidates must be a non-empty array")
    ids: set[str] = set()
    required = (
        "id", "format_name", "extensions", "suggestion_seeds", "seed_keywords", "serp_context_groups",
    )
    for candidate in candidates:
        if not isinstance(candidate, dict):
            raise ResearchError("each candidate must be an object")
        missing = [key for key in required if not candidate.get(key)]
        if missing:
            raise ResearchError(f"Candidate is missing required fields: {', '.join(missing)}")
        candidate_id = candidate["id"]
        if not isinstance(candidate_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", candidate_id):
            raise ResearchError(f"Invalid candidate id: {candidate_id}")
        if candidate_id in ids:
            raise ResearchError(f"Duplicate candidate id: {candidate_id}")
        ids.add(candidate_id)
        if not isinstance(candidate["format_name"], str) or not candidate["format_name"].strip():
            raise ResearchError(f"{candidate_id}: format_name must be a non-empty string")
        for field in ("extensions", "suggestion_seeds", "seed_keywords"):
            _validate_string_list(candidate[field], field, candidate_id, maximum=2 if field == "suggestion_seeds" else None)
        aliases = candidate.get("aliases", [])
        if aliases:
            _validate_string_list(aliases, "aliases", candidate_id)
        for extension in candidate["extensions"]:
            if extension != extension.lower() or extension.startswith(".") or not re.fullmatch(r"[a-z0-9][a-z0-9._+-]*", extension):
                raise ResearchError(f"{candidate_id}: invalid extension {extension!r}")
        groups = candidate["serp_context_groups"]
        if not isinstance(groups, list) or not groups:
            raise ResearchError(f"{candidate_id}: serp_context_groups must be a non-empty array")
        seen_groups: set[tuple[str, ...]] = set()
        for group in groups:
            _validate_string_list(group, "serp_context_groups entry", candidate_id)
            normalized_group = tuple(normalize(term) for term in group)
            if normalized_group in seen_groups:
                raise ResearchError(f"{candidate_id}: serp_context_groups must not contain duplicates")
            seen_groups.add(normalized_group)
    settings = config.get("settings")
    if not isinstance(settings, dict):
        raise ResearchError("settings must be an object")
    integer_ranges = {
        "suggestions_limit": (1, 1000),
        "minimum_suggestion_volume": (1, 1_000_000),
        "max_keywords_per_candidate": (1, 200),
        "serp_depth": (1, 10),
    }
    for field, (minimum, maximum) in integer_ranges.items():
        value = settings.get(field)
        if not isinstance(value, int) or not minimum <= value <= maximum:
            raise ResearchError(f"settings.{field} must be an integer between {minimum} and {maximum}")
    if settings.get("trends_time_range") != "past_12_months":
        raise ResearchError("settings.trends_time_range must be 'past_12_months' for methodology 1.1")


def config_digest(config: dict[str, Any]) -> str:
    canonical = json.dumps(config, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def candidate_terms(candidate: dict[str, Any]) -> list[str]:
    return [*candidate["extensions"], *candidate.get("aliases", [])]


def mentions_candidate(keyword: str, candidate: dict[str, Any]) -> bool:
    return any(contains_term(keyword, term) for term in candidate_terms(candidate))


def is_view_query(keyword: str, candidate: dict[str, Any]) -> bool:
    text = normalize(keyword)
    return (
        mentions_candidate(text, candidate)
        and any(contains_term(text, token) for token in VIEW_ACTIONS)
        and not any(contains_term(text, token) for token in NON_VIEW_ACTIONS)
    )


def choose_candidate_keywords(
    config: dict[str, Any], suggestions: dict[str, list[dict[str, Any]]]
) -> dict[str, list[str]]:
    maximum = config["settings"]["max_keywords_per_candidate"]
    selected: dict[str, list[str]] = {}
    for candidate in config["candidates"]:
        seeds = [normalize(keyword) for keyword in candidate["seed_keywords"]]
        ranked = [row["keyword"] for row in suggestions[candidate["id"]]]
        selected[candidate["id"]] = list(dict.fromkeys([*seeds, *ranked]))[:maximum]
    return selected


def representative_keyword(
    candidate: dict[str, Any], requested: list[str], overview: dict[str, dict[str, Any]]
) -> str:
    eligible = [overview[keyword] for keyword in requested if keyword in overview and is_view_query(keyword, candidate)]
    if eligible:
        eligible.sort(key=lambda row: row.get("search_volume") or 0, reverse=True)
        return eligible[0]["keyword"]
    return normalize(candidate["seed_keywords"][0])


def volume_score(volume: float) -> float:
    if volume <= 0:
        return 0
    if volume < 10:
        return 10
    if volume < 50:
        return 25
    if volume < 200:
        return 45
    if volume < 1000:
        return 65
    if volume < 5000:
        return 82
    return 100


def breadth_score(count: int) -> float:
    return 0 if count == 0 else 30 if count == 1 else 60 if count <= 3 else 80 if count <= 7 else 100


def piecewise(value: float, anchors: list[tuple[float, float]]) -> float:
    if value <= anchors[0][0]:
        return anchors[0][1]
    for (left_x, left_y), (right_x, right_y) in zip(anchors, anchors[1:]):
        if value <= right_x:
            ratio = (value - left_x) / (right_x - left_x)
            return left_y + ratio * (right_y - left_y)
    return anchors[-1][1]


def trend_growth(points: list[dict[str, float | int]]) -> float | None:
    ordered = sorted(points, key=lambda point: int(point["timestamp"]))
    values = [float(point["value"]) for point in ordered]
    if len(values) < 6 or not any(values):
        return None
    quarter = max(3, len(values) // 4)
    recent = values[-quarter:]
    previous = values[-2 * quarter : -quarter]
    previous_average = sum(previous) / len(previous) if previous else 0
    if previous_average == 0:
        return None
    return (sum(recent) / len(recent)) / previous_average - 1


def _matches_context(text: str, groups: list[list[str]]) -> bool:
    return any(all(contains_term(text, term) for term in group) for group in groups)


def _is_direct_viewer(text: str) -> bool:
    normalized = normalize(text)
    if any(contains_term(normalized, term) for term in ("viewer", "previewer", "reader", "player")):
        return True
    return re.search(r"\b(?:view|preview)\b.{0,30}\bonline\b|\bonline\b.{0,30}\b(?:view|preview)\b", normalized) is not None


def _hostname(url: str) -> str | None:
    hostname = urlsplit(url).hostname
    if not hostname:
        return None
    return hostname.lower().removeprefix("www.")


def analyze_serp(candidate: dict[str, Any], organic: list[dict[str, Any]]) -> dict[str, Any]:
    relevant = []
    direct_hosts: set[str] = set()
    for result in organic:
        text = " ".join([result["title"], result["description"], result["url"]])
        if _matches_context(text, candidate["serp_context_groups"]):
            relevant.append(result)
            hostname = _hostname(result["url"])
            if hostname and _is_direct_viewer(text):
                direct_hosts.add(hostname)
    relevance = 100 * len(relevant) / len(organic) if organic else None
    direct = len(direct_hosts)
    gap = 100 if direct == 0 else 80 if direct <= 2 else 60 if direct <= 4 else 40 if direct <= 6 else 20
    return {
        "organic_results": len(organic),
        "serp_relevance": relevance,
        "direct_viewer_results": direct,
        "direct_viewer_domains": sorted(direct_hosts),
        "viewer_gap": gap,
    }


def score_candidates(
    config: dict[str, Any],
    selected: dict[str, list[str]],
    overview: dict[str, dict[str, Any]],
    representatives: dict[str, str],
    serps: dict[str, list[dict[str, Any]]],
    trends: dict[str, list[dict[str, float | int]]],
) -> list[dict[str, Any]]:
    rows = []
    trend_anchors = [(-0.5, 0), (-0.2, 25), (0, 50), (0.2, 70), (0.5, 85), (1.0, 100)]
    for candidate in config["candidates"]:
        candidate_id = candidate["id"]
        requested = selected[candidate_id]
        returned = [overview[keyword] for keyword in requested if keyword in overview]
        eligible = [row for row in returned if is_view_query(row["keyword"], candidate)]
        volumes = sorted([float(row.get("search_volume") or 0) for row in eligible], reverse=True)
        primary = volumes[0] if volumes else 0
        effective = primary + min(0.25 * sum(volumes[1:]), primary)
        all_volume = sum(float(row.get("search_volume") or 0) for row in returned)
        purity = sum(volumes) / all_volume if all_volume else 0
        breadth = sum(1 for volume in volumes if volume >= 10)
        coverage = len(returned) / len(requested) if requested else 0
        representative = representatives[candidate_id]
        difficulty = overview.get(representative, {}).get("keyword_difficulty")
        difficulty_opportunity = 50 if difficulty is None else max(0, 100 - float(difficulty))
        serp_metrics = analyze_serp(candidate, serps[candidate_id])
        growth = trend_growth(trends[candidate_id])
        momentum = piecewise(growth, trend_anchors) if growth is not None else 0
        components = {
            "effective_volume": 0.40 * volume_score(effective),
            "query_breadth": 0.10 * breadth_score(breadth),
            "viewer_intent_purity": 0.05 * (purity * 100),
            "viewer_gap": 0.15 * serp_metrics["viewer_gap"],
            "difficulty_opportunity": 0.05 * difficulty_opportunity,
            "serp_relevance": 0.05 * (serp_metrics["serp_relevance"] or 0),
            "trend_direction": 0.10 * momentum,
            "overview_coverage": 0.04 * (coverage * 100),
            "serp_evidence": 3 if serp_metrics["organic_results"] else 0,
            "trends_evidence": 3 if growth is not None else 0,
        }
        score = sum(components.values())
        flags = []
        if serp_metrics["serp_relevance"] is None or serp_metrics["serp_relevance"] < 40:
            score = min(score, 54)
            flags.append("ambiguous_query")
        if coverage < 0.5:
            score = min(score, 54)
            flags.append("insufficient_keyword_coverage")
        elif coverage < 1:
            flags.append("partial_keyword_coverage")
        if breadth == 0:
            score = min(score, 39)
            flags.append("no_keyword_at_volume_10")
        if growth is None:
            flags.append("missing_trends")
        if difficulty is None:
            flags.append("missing_keyword_difficulty")
        score = round(score, 1)
        recommendation = (
            "Strong demand candidate" if score >= 70 else
            "Worth technical feasibility research" if score >= 55 else
            "Watchlist" if score >= 40 else
            "Deprioritize on current demand evidence"
        )
        rows.append({
            "id": candidate_id,
            "format_name": candidate["format_name"],
            "extensions": candidate["extensions"],
            "representative_keyword": representative,
            "score": score,
            "recommendation": recommendation,
            "flags": flags,
            "metrics": {
                "effective_monthly_volume": round(effective, 1),
                "primary_keyword_volume": primary,
                "eligible_keyword_count_at_10": breadth,
                "viewer_intent_purity": round(purity, 3),
                "overview_coverage": round(coverage, 3),
                "evidence_confidence": round(components["overview_coverage"] + components["serp_evidence"] + components["trends_evidence"], 2),
                "keyword_difficulty": difficulty,
                "trend_growth": None if growth is None else round(growth, 3),
                **serp_metrics,
            },
            "score_components": {key: round(value, 2) for key, value in components.items()},
            "keywords": returned,
            "trend_points": trends[candidate_id],
            "serp_results": serps[candidate_id],
        })
    return sorted(rows, key=lambda row: (-row["score"], row["id"]))


def render_markdown(report: dict[str, Any]) -> str:
    recommendation_zh = {
        "Strong demand candidate": "强需求候选",
        "Worth technical feasibility research": "值得开展技术可行性研究",
        "Watchlist": "观察名单",
        "Deprioritize on current demand evidence": "根据当前需求证据降低优先级",
    }
    flag_zh = {
        "ambiguous_query": "查询歧义",
        "insufficient_keyword_coverage": "关键词覆盖不足",
        "partial_keyword_coverage": "关键词覆盖不完整",
        "no_keyword_at_volume_10": "缺少月搜索量≥10的关键词",
        "missing_trends": "趋势证据缺失",
        "missing_keyword_difficulty": "关键词难度缺失",
    }
    component_zh = {
        "effective_volume": "有效搜索量",
        "query_breadth": "查询广度",
        "viewer_intent_purity": "查看意图纯度",
        "viewer_gap": "查看器竞争空白",
        "difficulty_opportunity": "关键词难度机会",
        "serp_relevance": "SERP相关性",
        "trend_direction": "趋势方向",
        "overview_coverage": "Overview覆盖率",
        "serp_evidence": "SERP证据",
        "trends_evidence": "趋势证据",
    }
    lines = [
        "# 文件格式需求研究报告", "",
        f"方法论版本：{report['methodology_version']}",
        f"市场：地区代码 `{report['market']['location_code']}`，语言 `{report['market']['language_code']}`",
        f"生成时间：`{report['run']['generated_at']}`",
        f"配置 SHA-256：`{report['run']['config_sha256']}`",
        f"DataForSEO 报告成本：`{report['api']['reported_cost']:.4f}` 美元", "",
        "本报告衡量搜索需求与搜索机会，不代表技术实现可行性。", "",
        "| 排名 | 格式 | 得分 | 有效月搜索量 | 查看意图纯度 | 覆盖率 | 直接查看器域名数 | 趋势 | 证据置信度 | 建议 | 标记 |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|",
    ]
    for index, candidate in enumerate(report["candidates"], 1):
        metrics = candidate["metrics"]
        growth = metrics["trend_growth"]
        lines.append(
            f"| {index} | {candidate['format_name']} ({', '.join(candidate['extensions'])}) | {candidate['score']:.1f} "
            f"| {metrics['effective_monthly_volume']:.1f} | {metrics['viewer_intent_purity']:.0%} "
            f"| {metrics['overview_coverage']:.0%} | {metrics['direct_viewer_results']} "
            f"| {'无数据' if growth is None else f'{growth:+.0%}'} | {metrics['evidence_confidence']:.1f}/10 "
            f"| {recommendation_zh.get(candidate['recommendation'], candidate['recommendation'])} "
            f"| {', '.join(flag_zh.get(flag, flag) for flag in candidate['flags']) or '—'} |"
        )
    lines.extend(["", "## 证据明细", ""])
    for candidate in report["candidates"]:
        metrics = candidate["metrics"]
        components = ", ".join(
            f"{component_zh.get(name, name)}={value:g}" for name, value in candidate["score_components"].items()
        )
        relevance = "无数据" if metrics["serp_relevance"] is None else f"{metrics['serp_relevance']:.0f}%"
        lines.extend([
            f"### {candidate['format_name']}", "",
            f"- 代表查询：`{candidate['representative_keyword']}`",
            f"- 主要关键词月搜索量：`{metrics['primary_keyword_volume']}`",
            f"- 月搜索量≥10的有效查询数：`{metrics['eligible_keyword_count_at_10']}`",
            f"- SERP 相关性：`{relevance}`",
            f"- 直接查看器域名：`{', '.join(metrics['direct_viewer_domains']) or '无'}`",
            f"- 关键词难度：`{metrics['keyword_difficulty']}`",
            f"- 评分组成：`{components}`", "",
        ])
    return "\n".join(lines)


def dry_run(config: dict[str, Any]) -> dict[str, Any]:
    candidate_count = len(config["candidates"])
    suggestion_calls = sum(len(candidate["suggestion_seeds"]) for candidate in config["candidates"])
    seed_count = len({normalize(keyword) for candidate in config["candidates"] for keyword in candidate["seed_keywords"]})
    maximum_keywords = candidate_count * config["settings"]["max_keywords_per_candidate"]
    return {
        "network_calls_made": 0,
        "methodology_version": config["methodology_version"],
        "market": config["market"],
        "candidates": [candidate["id"] for candidate in config["candidates"]],
        "planned_calls": {
            "keyword_suggestions": suggestion_calls,
            "keyword_overview_min": math.ceil(seed_count / 700),
            "keyword_overview_max": math.ceil(maximum_keywords / 700),
            "serp_advanced": candidate_count,
            "trends_explore": candidate_count,
        },
        "settings": config["settings"],
    }
