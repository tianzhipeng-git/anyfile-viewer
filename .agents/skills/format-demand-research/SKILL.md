---
name: format-demand-research
description: Discover, score, and recommend file-format candidates for Anyfile Viewer with a user-approved candidate scope and DataForSEO keyword, SERP, and trend evidence. Use when deciding which new formats merit support; do not use for implementing viewers or general SEO copywriting.
---

# Format Demand Research

Produce a reproducible market-demand ranking for potential Anyfile Viewer formats. This skill uses DataForSEO only. Do not add Reddit, manual SERP review, product telemetry, or post-launch feedback stages.

## Workflow

1. Inspect viewer registrations, plugin Manifests, support matrices, and relevant roadmaps so the proposed pool does not silently include existing support. Do not infer actual support from SEO content or a format catalog alone because this project has historically tracked those separately.
2. Propose an initial candidate table with format family, canonical extension, aliases, search subject, ambiguity context, and market. Discuss scope with the user and obtain agreement before making paid API calls. Do not treat a broad topic such as “CAD” as one format.
3. Read [references/candidate-schema.md](references/candidate-schema.md), then create a run-specific directory at `.agents/artifacts/format-demand-research/<run-id>/` from the project root. Store the candidate JSON and all generated outputs there. Use a descriptive run ID such as `2026-09-02-design-cad`. Do not write format-demand research outputs to the project-root `artifacts/` directory or inside the skill directory.
4. Run the script with `--dry-run` first. Report market, candidates, endpoint call bounds, and configuration. A dry run requires no credentials, makes no network calls, and writes `dry-run-plan.json` to the output directory.
5. Before a paid run, read [references/methodology.md](references/methodology.md). Run only after the user has approved the candidate scope and market. Credentials must come from `DATAFORSEO_USERNAME` and `DATAFORSEO_PASSWORD`; never request that credentials be pasted into chat or store them in files.
6. Never reuse a completed or failed run directory for a fresh live run. After the user explicitly approves resuming a failed paid run, add `--resume`; the request checkpoint reuses successful responses and sends only missing requests.
7. Keep JSON field names and enum values machine-readable in English, but generate `report.md` in Chinese. Use the Markdown report to explain the ranking, score components, weak evidence, and recommendation. Describe it as a demand recommendation, not proof of implementation feasibility.

## Commands

```bash
python3 .agents/skills/format-demand-research/scripts/research_formats.py \
  --input .agents/artifacts/format-demand-research/<run-id>/candidates.json \
  --output .agents/artifacts/format-demand-research/<run-id> \
  --dry-run

python3 .agents/skills/format-demand-research/scripts/research_formats.py \
  --input .agents/artifacts/format-demand-research/<run-id>/candidates.json \
  --output .agents/artifacts/format-demand-research/<run-id>
```

Resume a failed paid run only after explicit user approval:

```bash
python3 .agents/skills/format-demand-research/scripts/research_formats.py \
  --input .agents/artifacts/format-demand-research/<run-id>/candidates.json \
  --output .agents/artifacts/format-demand-research/<run-id> \
  --resume
```

The live command executes the four stages in order: Keyword Suggestions, Keyword Overview, SERP Advanced, and DataForSEO Trends Explore. It does not automatically retry paid POST requests; surface failures and let the user decide whether to rerun.

## Boundaries

- Keep the candidate pool user-approved. Adding new candidates requires another scope confirmation.
- Keep locations and languages separate. Never merge search volumes from different markets.
- Do not sum raw keyword volumes. Use the script's capped effective-volume calculation.
- Do not replace missing data with zero without preserving a missing-data flag.
- Do not change score thresholds during one run. Baseline changes require a methodology version change and a fresh full run.
- Treat ambiguous SERPs as a machine-detected confidence problem. Revise query subjects and rerun only with user approval; do not add an informal human-validation stage.
- Treat `checkpoint.json` and `evidence.json` as run evidence. Do not edit them to change a result or bypass a failed request.
- DataForSEO scores demand and search opportunity. Technical feasibility remains a separate project decision.
