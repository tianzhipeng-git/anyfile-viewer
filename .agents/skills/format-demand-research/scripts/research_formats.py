#!/usr/bin/env python3
"""Run the DataForSEO file-format demand methodology."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from format_demand_core import (  # noqa: E402
    DEFAULT_SETTINGS,
    ResearchError,
    choose_candidate_keywords,
    config_digest,
    dry_run,
    mentions_candidate,
    normalize,
    render_markdown,
    representative_keyword,
    score_candidates,
    validate_config,
)


API_BASE = "https://api.dataforseo.com"
SUGGESTIONS = "/v3/dataforseo_labs/google/keyword_suggestions/live"
OVERVIEW = "/v3/dataforseo_labs/google/keyword_overview/live"
SERP = "/v3/serp/google/organic/live/advanced"
TRENDS = "/v3/keywords_data/dataforseo_trends/explore/live"
ARTIFACT_ROOT = SCRIPT_DIR.parents[2] / "artifacts" / "format-demand-research"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def chunks(values: list[Any], size: int) -> Iterable[list[Any]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def atomic_write_json(path: Path, value: Any) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    try:
        temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
        temporary.replace(path)
    except OSError as exc:
        raise ResearchError(f"Cannot write {path.name}: {exc}") from exc


def load_config(path: Path) -> dict[str, Any]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ResearchError(f"Cannot read candidate config: {exc}") from exc
    if not isinstance(config, dict):
        raise ResearchError("Candidate config must be a JSON object")
    settings = config.get("settings", {})
    if not isinstance(settings, dict):
        raise ResearchError("settings must be an object")
    config["settings"] = {**DEFAULT_SETTINGS, **settings}
    validate_config(config)
    return config


def validate_run_paths(input_path: Path, output_path: Path) -> tuple[Path, Path]:
    input_resolved = input_path.resolve()
    output_resolved = output_path.resolve()
    root = ARTIFACT_ROOT.resolve()
    if output_resolved.parent != root or output_resolved == root:
        raise ResearchError(f"Output must be one run directory directly under {root}")
    if not input_resolved.is_relative_to(output_resolved):
        raise ResearchError("Candidate input must be stored inside its run output directory")
    return input_resolved, output_resolved


def request_key(endpoint: str, task: dict[str, Any]) -> str:
    canonical = json.dumps({"endpoint": endpoint, "task": task}, sort_keys=True, separators=(",", ":"))
    return sha256(canonical.encode("utf-8")).hexdigest()


class DataForSEOClient:
    def __init__(
        self,
        username: str,
        password: str,
        checkpoint: dict[str, Any],
        persist: Callable[[], None],
    ) -> None:
        token = base64.b64encode(f"{username}:{password}".encode()).decode()
        self.headers = {"Authorization": f"Basic {token}", "Content-Type": "application/json"}
        api = checkpoint.setdefault("api", {})
        self.cost = float(api.get("reported_cost") or 0)
        self.calls = {
            name: int((api.get("calls") or {}).get(name, 0))
            for name in ("suggestions", "overview", "serp", "trends")
        }
        self.versions = set(api.get("versions") or [])
        self.responses = checkpoint.setdefault("responses", {})
        self.persist = persist

    def snapshot(self) -> dict[str, Any]:
        return {
            "reported_cost": round(self.cost, 6),
            "calls": self.calls,
            "versions": sorted(self.versions),
        }

    def post(self, endpoint: str, task: dict[str, Any], stage: str) -> dict[str, Any]:
        key = request_key(endpoint, task)
        cached = self.responses.get(key)
        if cached:
            return cached["payload"]
        request = Request(
            API_BASE + endpoint,
            data=json.dumps([task]).encode("utf-8"),
            headers=self.headers,
            method="POST",
        )
        self.calls[stage] += 1
        try:
            with urlopen(request, timeout=90) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            self.persist()
            detail = exc.read().decode("utf-8", errors="replace")
            raise ResearchError(f"{stage} HTTP {exc.code}: {detail[:500]}") from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            self.persist()
            raise ResearchError(f"{stage} request failed without retry: {exc}") from exc
        self.cost += float(payload.get("cost") or 0)
        if payload.get("version"):
            self.versions.add(str(payload["version"]))
        if payload.get("status_code") != 20000:
            self.persist()
            raise ResearchError(f"{stage} API error {payload.get('status_code')}: {payload.get('status_message')}")
        for api_task in payload.get("tasks") or []:
            if api_task.get("status_code") != 20000:
                self.persist()
                raise ResearchError(
                    f"{stage} task error {api_task.get('status_code')}: {api_task.get('status_message')}"
                )
        self.responses[key] = {"endpoint": endpoint, "task": task, "payload": payload}
        self.persist()
        return payload


def result_items(payload: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for task in payload.get("tasks") or []:
        for result in task.get("result") or []:
            for item in result.get("items") or []:
                yield item


def extract_keyword_record(item: dict[str, Any]) -> dict[str, Any] | None:
    data = item.get("keyword_data") or item
    keyword = data.get("keyword")
    if not keyword:
        return None
    keyword_info = data.get("keyword_info") or {}
    properties = data.get("keyword_properties") or {}
    serp_info = data.get("serp_info") or {}
    difficulty = properties.get("keyword_difficulty")
    if difficulty is None:
        difficulty = serp_info.get("keyword_difficulty")
    return {
        "keyword": normalize(keyword),
        "search_volume": keyword_info.get("search_volume"),
        "monthly_searches": keyword_info.get("monthly_searches") or [],
        "keyword_difficulty": difficulty,
        "intent": (data.get("search_intent_info") or {}).get("main_intent"),
    }


def collect_suggestions(client: DataForSEOClient, config: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    market, settings = config["market"], config["settings"]
    output: dict[str, list[dict[str, Any]]] = {}
    for candidate in config["candidates"]:
        records: dict[str, dict[str, Any]] = {}
        for seed in candidate["suggestion_seeds"]:
            task = {
                "keyword": seed,
                **market,
                "limit": settings["suggestions_limit"],
                "include_seed_keyword": True,
                "filters": [["keyword_info.search_volume", ">=", settings["minimum_suggestion_volume"]]],
                "order_by": ["keyword_info.search_volume,desc"],
                "tag": f"format-demand:{candidate['id']}",
            }
            for item in result_items(client.post(SUGGESTIONS, task, "suggestions")):
                record = extract_keyword_record(item)
                if record and mentions_candidate(record["keyword"], candidate):
                    records[record["keyword"]] = record
        output[candidate["id"]] = sorted(
            records.values(), key=lambda row: row.get("search_volume") or 0, reverse=True
        )
    return output


def collect_overview(
    client: DataForSEOClient, config: dict[str, Any], selected: dict[str, list[str]]
) -> dict[str, dict[str, Any]]:
    keywords = list(dict.fromkeys(keyword for values in selected.values() for keyword in values))
    records: dict[str, dict[str, Any]] = {}
    for batch in chunks(keywords, 700):
        payload = client.post(OVERVIEW, {"keywords": batch, **config["market"]}, "overview")
        for item in result_items(payload):
            record = extract_keyword_record(item)
            if record:
                records[record["keyword"]] = record
    return records


def collect_serps(
    client: DataForSEOClient, config: dict[str, Any], representatives: dict[str, str]
) -> dict[str, list[dict[str, Any]]]:
    output: dict[str, list[dict[str, Any]]] = {}
    for candidate in config["candidates"]:
        task = {
            "keyword": representatives[candidate["id"]],
            **config["market"],
            "depth": config["settings"]["serp_depth"],
            "device": "desktop",
            "tag": f"format-demand:{candidate['id']}",
        }
        organic = []
        for item in result_items(client.post(SERP, task, "serp")):
            if item.get("type") == "organic":
                organic.append({
                    "rank": item.get("rank_absolute"),
                    "title": item.get("title") or "",
                    "description": item.get("description") or "",
                    "url": item.get("url") or "",
                })
        output[candidate["id"]] = organic[: config["settings"]["serp_depth"]]
    return output


def collect_trends(
    client: DataForSEOClient, config: dict[str, Any], representatives: dict[str, str]
) -> dict[str, list[dict[str, Any]]]:
    output: dict[str, list[dict[str, Any]]] = {}
    for candidate in config["candidates"]:
        candidate_id = candidate["id"]
        keyword = representatives[candidate_id]
        task = {
            "keywords": [keyword],
            "location_code": config["market"]["location_code"],
            "type": "web",
            "time_range": config["settings"]["trends_time_range"],
            "tag": f"format-demand:{candidate_id}",
        }
        points = []
        for item in result_items(client.post(TRENDS, task, "trends")):
            if item.get("type") != "dataforseo_trends_graph":
                continue
            graph_keywords = item.get("keywords") or [keyword]
            try:
                keyword_index = [normalize(value) for value in graph_keywords].index(normalize(keyword))
            except ValueError:
                continue
            for point in item.get("data") or []:
                values = point.get("values") or []
                timestamp = point.get("timestamp")
                if timestamp is not None and keyword_index < len(values) and isinstance(values[keyword_index], (int, float)):
                    points.append({
                        "timestamp": int(timestamp),
                        "date_from": point.get("date_from"),
                        "date_to": point.get("date_to"),
                        "value": float(values[keyword_index]),
                    })
        output[candidate_id] = sorted(points, key=lambda point: point["timestamp"])
    return output


def load_or_initialize_checkpoint(
    output: Path, config: dict[str, Any], config_hash: str, resume: bool
) -> dict[str, Any]:
    checkpoint_path = output / "checkpoint.json"
    blocking = [output / name for name in ("report.json", "partial.json", "evidence.json", "checkpoint.json")]
    if not resume:
        existing = [path.name for path in blocking if path.exists()]
        if existing:
            raise ResearchError(f"Fresh live run refuses existing outputs: {', '.join(existing)}")
        return {
            "methodology_version": config["methodology_version"],
            "config_sha256": config_hash,
            "created_at": utc_now(),
            "updated_at": utc_now(),
            "completed_stages": [],
            "responses": {},
            "api": {"reported_cost": 0, "calls": {}, "versions": []},
        }
    if (output / "report.json").exists():
        raise ResearchError("Cannot resume a completed run")
    if not checkpoint_path.exists():
        raise ResearchError("--resume requires checkpoint.json from a failed run")
    try:
        checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ResearchError(f"Cannot read checkpoint: {exc}") from exc
    if checkpoint.get("methodology_version") != config["methodology_version"]:
        raise ResearchError("Checkpoint methodology version does not match candidate config")
    if checkpoint.get("config_sha256") != config_hash:
        raise ResearchError("Checkpoint candidate configuration hash does not match")
    return checkpoint


def run_live(config: dict[str, Any], output: Path, resume: bool) -> Path:
    username = os.environ.get("DATAFORSEO_USERNAME")
    password = os.environ.get("DATAFORSEO_PASSWORD")
    if not username or not password:
        raise ResearchError("DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD are required for a live run")
    config_hash = config_digest(config)
    checkpoint = load_or_initialize_checkpoint(output, config, config_hash, resume)
    checkpoint_path = output / "checkpoint.json"
    client: DataForSEOClient | None = None

    def persist() -> None:
        checkpoint["updated_at"] = utc_now()
        if client is not None:
            checkpoint["api"] = client.snapshot()
        atomic_write_json(checkpoint_path, checkpoint)

    client = DataForSEOClient(username, password, checkpoint, persist)
    persist()
    stage = "keyword_suggestions"
    try:
        suggestions = collect_suggestions(client, config)
        selected = choose_candidate_keywords(config, suggestions)
        checkpoint["completed_stages"] = ["keyword_suggestions"]
        checkpoint["evidence"] = {"suggestions": suggestions, "selected_keywords": selected}
        persist()

        stage = "keyword_overview"
        overview = collect_overview(client, config, selected)
        representatives = {
            candidate["id"]: representative_keyword(candidate, selected[candidate["id"]], overview)
            for candidate in config["candidates"]
        }
        checkpoint["completed_stages"].append("keyword_overview")
        checkpoint["evidence"].update({"overview": overview, "representative_keywords": representatives})
        persist()

        stage = "serp_advanced"
        serps = collect_serps(client, config, representatives)
        checkpoint["completed_stages"].append("serp_advanced")
        checkpoint["evidence"]["serps"] = serps
        persist()

        stage = "trends_explore"
        trends = collect_trends(client, config, representatives)
        checkpoint["completed_stages"].append("trends_explore")
        checkpoint["evidence"]["trends"] = trends
        persist()

        candidates = score_candidates(config, selected, overview, representatives, serps, trends)
    except Exception as exc:
        partial = {
            "failed_stage": stage,
            "error": str(exc),
            "checkpoint": "checkpoint.json",
            "api": client.snapshot(),
        }
        atomic_write_json(output / "partial.json", partial)
        if isinstance(exc, ResearchError):
            raise
        raise ResearchError(f"{stage} processing failed: {exc}") from exc

    generated_at = utc_now()
    evidence = {
        "methodology_version": config["methodology_version"],
        "config_sha256": config_hash,
        "generated_at": generated_at,
        **checkpoint["evidence"],
    }
    report = {
        "methodology_version": config["methodology_version"],
        "market": config["market"],
        "settings": config["settings"],
        "run": {"generated_at": generated_at, "config_sha256": config_hash},
        "api": client.snapshot(),
        "candidates": candidates,
    }
    atomic_write_json(output / "evidence.json", evidence)
    atomic_write_json(output / "report.json", report)
    (output / "report.md").write_text(render_markdown(report), encoding="utf-8")
    checkpoint["completed_stages"].append("report")
    persist()
    return output / "report.md"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Candidate JSON file")
    parser.add_argument("--output", type=Path, required=True, help="Run output directory")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print the paid-call plan")
    parser.add_argument("--resume", action="store_true", help="Resume a failed paid run from checkpoint")
    args = parser.parse_args()
    try:
        if args.dry_run and args.resume:
            raise ResearchError("--dry-run and --resume cannot be combined")
        input_path, output = validate_run_paths(args.input, args.output)
        config = load_config(input_path)
        output.mkdir(parents=True, exist_ok=True)
        if args.dry_run:
            if any((output / name).exists() for name in ("checkpoint.json", "partial.json", "report.json")):
                raise ResearchError("Dry run refuses a directory containing live-run outputs")
            plan = dry_run(config)
            atomic_write_json(output / "dry-run-plan.json", plan)
            print(json.dumps(plan, indent=2, ensure_ascii=False))
            print(f"plan: {output / 'dry-run-plan.json'}")
            return 0
        print(run_live(config, output, args.resume))
        return 0
    except ResearchError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
