from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import format_demand_core as core
import research_formats as runner


def candidate(candidate_id: str = "psd") -> dict:
    return {
        "id": candidate_id,
        "format_name": "Adobe Photoshop Document",
        "extensions": [candidate_id],
        "aliases": ["photoshop document"],
        "suggestion_seeds": [f"{candidate_id} file"],
        "seed_keywords": [f"{candidate_id} viewer online", f"open {candidate_id} file"],
        "serp_context_groups": [[candidate_id], ["photoshop", "document"]],
    }


def config(*candidates: dict) -> dict:
    return {
        "methodology_version": "1.1",
        "market": {"location_code": 2840, "language_code": "en"},
        "settings": dict(core.DEFAULT_SETTINGS),
        "candidates": list(candidates) or [candidate()],
    }


def keyword_record(keyword: str, volume: int, difficulty: int = 20) -> dict:
    return {
        "keyword": keyword,
        "search_volume": volume,
        "monthly_searches": [],
        "keyword_difficulty": difficulty,
        "intent": "informational",
    }


def api_payload(items: list[dict], cost: float = 0.1) -> dict:
    return {
        "version": "test-version",
        "status_code": 20000,
        "status_message": "Ok",
        "cost": cost,
        "tasks": [{
            "status_code": 20000,
            "status_message": "Ok",
            "cost": cost,
            "result": [{"items": items}],
        }],
    }


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode()


class FakeClient:
    def __init__(self, payloads: list[dict]) -> None:
        self.payloads = iter(payloads)
        self.tasks: list[dict] = []

    def post(self, _endpoint: str, task: dict, _stage: str) -> dict:
        self.tasks.append(task)
        return next(self.payloads)


class ResearchFormatTests(unittest.TestCase):
    def test_view_query_filters_non_view_intent(self) -> None:
        item = candidate()
        self.assertTrue(core.is_view_query("open psd file online", item))
        self.assertTrue(core.is_view_query("psd file viewer", item))
        self.assertFalse(core.is_view_query("psd file converter", item))
        self.assertFalse(core.is_view_query("download psd viewer software", item))
        self.assertFalse(core.is_view_query("open png file", item))

    def test_trend_growth_sorts_points_by_timestamp(self) -> None:
        points = [
            {"timestamp": timestamp, "value": 20.0 if timestamp >= 10 else 10.0}
            for timestamp in range(1, 13)
        ]
        points.reverse()
        self.assertAlmostEqual(core.trend_growth(points), 1.0)
        self.assertIsNone(core.trend_growth([{"timestamp": index, "value": 0.0} for index in range(12)]))

    def test_direct_viewers_exclude_open_guides_and_deduplicate_hosts(self) -> None:
        item = candidate()
        organic = [
            {"title": "PSD Viewer Online", "description": "Preview PSD", "url": "https://viewer.example/a"},
            {"title": "PSD File Viewer", "description": "View online", "url": "https://viewer.example/b"},
            {"title": "How to open a PSD document", "description": "Use Photoshop", "url": "https://guide.example/psd"},
        ]
        metrics = core.analyze_serp(item, organic)
        self.assertEqual(metrics["direct_viewer_results"], 1)
        self.assertEqual(metrics["direct_viewer_domains"], ["viewer.example"])

    def test_context_groups_require_every_term_in_a_group(self) -> None:
        item = candidate("ai")
        item["aliases"] = ["adobe illustrator file"]
        item["serp_context_groups"] = [["ai file"], ["adobe", "illustrator"]]
        unrelated = [{"title": "Vector tools", "description": "Artificial intelligence", "url": "https://example.com"}]
        self.assertEqual(core.analyze_serp(item, unrelated)["serp_relevance"], 0)

    def test_score_caps_ambiguous_serp(self) -> None:
        item = candidate("ai")
        item["aliases"] = ["adobe illustrator file"]
        item["serp_context_groups"] = [["ai file"], ["adobe", "illustrator"]]
        selected = {"ai": ["ai file viewer", "open ai file", "ai file converter"]}
        overview = {
            "ai file viewer": keyword_record("ai file viewer", 5000),
            "open ai file": keyword_record("open ai file", 1000),
            "ai file converter": keyword_record("ai file converter", 1000),
        }
        unrelated_serp = [
            {"rank": rank, "title": "Artificial intelligence news", "description": "AI models", "url": f"https://example{rank}.com"}
            for rank in range(1, 11)
        ]
        trends = {"ai": [{"timestamp": index, "value": 10.0} for index in range(12)]}
        rows = core.score_candidates(
            {"candidates": [item]}, selected, overview, {"ai": "ai file viewer"}, {"ai": unrelated_serp}, trends
        )
        self.assertEqual(rows[0]["score"], 54)
        self.assertIn("ambiguous_query", rows[0]["flags"])

    def test_client_counts_response_cost_only_once_and_caches_success(self) -> None:
        checkpoint = {"api": {}, "responses": {}}
        persisted = []
        client = runner.DataForSEOClient("user", "pass", checkpoint, lambda: persisted.append(True))
        payload = api_payload([])
        with patch.object(runner, "urlopen", return_value=FakeResponse(payload)) as mocked:
            first = client.post("/endpoint", {"keyword": "psd"}, "suggestions")
            second = client.post("/endpoint", {"keyword": "psd"}, "suggestions")
        self.assertIs(first, second)
        self.assertEqual(client.cost, 0.1)
        self.assertEqual(client.calls["suggestions"], 1)
        self.assertEqual(mocked.call_count, 1)
        self.assertTrue(persisted)

    def test_collect_trends_uses_one_request_per_candidate_and_sorts(self) -> None:
        candidates = [candidate("psd"), candidate("psb")]
        points = [
            {"type": "dataforseo_trends_graph", "keywords": [keyword], "data": [
                {"timestamp": 2, "date_from": "b", "date_to": "b", "values": [20]},
                {"timestamp": 1, "date_from": "a", "date_to": "a", "values": [10]},
            ]}
            for keyword in ("psd viewer", "psb viewer")
        ]
        client = FakeClient([api_payload([points[0]]), api_payload([points[1]])])
        trends = runner.collect_trends(client, config(*candidates), {"psd": "psd viewer", "psb": "psb viewer"})
        self.assertEqual(len(client.tasks), 2)
        self.assertTrue(all(len(task["keywords"]) == 1 for task in client.tasks))
        self.assertEqual([point["timestamp"] for point in trends["psd"]], [1, 2])

    def test_dry_run_reports_one_trends_call_per_candidate(self) -> None:
        plan = core.dry_run(config(candidate("psd"), candidate("psb")))
        self.assertEqual(plan["planned_calls"]["trends_explore"], 2)

    def test_validation_rejects_old_methodology_and_uppercase_extension(self) -> None:
        old = config(candidate())
        old["methodology_version"] = "1.0"
        with self.assertRaises(core.ResearchError):
            core.validate_config(old)
        invalid = config(candidate())
        invalid["candidates"][0]["extensions"] = ["PSD"]
        with self.assertRaises(core.ResearchError):
            core.validate_config(invalid)

    def test_fresh_run_refuses_existing_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / "report.json").write_text("{}", encoding="utf-8")
            with self.assertRaises(core.ResearchError):
                runner.load_or_initialize_checkpoint(output, config(), "hash", False)

    def test_resume_validates_configuration_hash(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            runner.atomic_write_json(output / "checkpoint.json", {
                "methodology_version": "1.1", "config_sha256": "original", "responses": {}, "api": {},
            })
            with self.assertRaises(core.ResearchError):
                runner.load_or_initialize_checkpoint(output, config(), "changed", True)

    def test_full_fake_run_writes_checkpoint_evidence_and_enriched_report(self) -> None:
        keyword_item = {
            "keyword": "psd viewer online",
            "keyword_info": {"search_volume": 100, "monthly_searches": []},
            "keyword_properties": {"keyword_difficulty": 20},
        }
        serp_item = {
            "type": "organic", "rank_absolute": 1, "title": "PSD Viewer Online",
            "description": "Preview a PSD document", "url": "https://viewer.example/psd",
        }
        trend_item = {
            "type": "dataforseo_trends_graph", "keywords": ["psd viewer online"],
            "data": [
                {"timestamp": index, "date_from": str(index), "date_to": str(index), "values": [index + 1]}
                for index in range(12)
            ],
        }
        payloads = [
            api_payload([keyword_item]), api_payload([keyword_item]),
            api_payload([serp_item]), api_payload([trend_item]),
        ]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with patch.dict(runner.os.environ, {"DATAFORSEO_USERNAME": "user", "DATAFORSEO_PASSWORD": "pass"}):
                with patch.object(runner, "urlopen", side_effect=[FakeResponse(payload) for payload in payloads]):
                    report_path = runner.run_live(config(), output, False)
            report = json.loads((output / "report.json").read_text(encoding="utf-8"))
            checkpoint = json.loads((output / "checkpoint.json").read_text(encoding="utf-8"))
            self.assertEqual(report_path, output / "report.md")
            self.assertEqual(report["api"]["reported_cost"], 0.4)
            self.assertEqual(report["candidates"][0]["metrics"]["direct_viewer_results"], 1)
            self.assertEqual(checkpoint["completed_stages"][-1], "report")
            self.assertTrue((output / "evidence.json").exists())
            markdown = (output / "report.md").read_text(encoding="utf-8")
            self.assertIn("查看意图纯度", markdown)
            self.assertIn("评分组成", markdown)
            self.assertIn("值得开展技术可行性研究", markdown)


if __name__ == "__main__":
    unittest.main()
