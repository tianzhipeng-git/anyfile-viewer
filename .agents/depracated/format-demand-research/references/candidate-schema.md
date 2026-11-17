# Candidate input schema

Read this file when preparing or validating a candidate pool.

## Top-level object

```json
{
  "methodology_version": "1.1",
  "market": {
    "location_code": 2840,
    "language_code": "en"
  },
  "settings": {
    "suggestions_limit": 100,
    "minimum_suggestion_volume": 10,
    "max_keywords_per_candidate": 40,
    "serp_depth": 10,
    "trends_time_range": "past_12_months"
  },
  "candidates": []
}
```

`location_code` and `language_code` apply to the whole run. Create separate runs for separate markets. The defaults are intentionally small enough for a discovery run; increasing them changes cost and requires explicit user agreement.

## Candidate object

```json
{
  "id": "psd",
  "format_name": "Adobe Photoshop Document",
  "extensions": ["psd"],
  "aliases": ["photoshop document"],
  "suggestion_seeds": ["psd file"],
  "seed_keywords": [
    "psd viewer online",
    "open psd file",
    "how to open psd file",
    "psd file viewer"
  ],
  "serp_context_groups": [["psd"], ["photoshop", "document"]]
}
```

Rules:

- `id` is a stable lowercase identifier.
- `extensions` contains canonical lowercase extensions without dots.
- `aliases` contains unambiguous names, not generic category words.
- `suggestion_seeds` contains one or two compact phrases. Keyword Suggestions matches terms containing the seed, so include the extension plus `file` when the extension is ambiguous.
- `seed_keywords` are guaranteed to reach Keyword Overview even if Suggestions finds nothing. Include viewer/open/how-to-open variants that match the real user task.
- `serp_context_groups` is an OR-list of AND-groups. A SERP result is relevant when every term in at least one group appears. Prefer a precise extension phrase or a brand-plus-domain group; do not use generic terms such as `vector` or `drawing` alone.
- All string arrays must contain unique, non-empty values. Extensions must be lowercase and omit the leading dot.

Do not combine PSD and PSB, AI and EPS, or DWG and DXF merely because they may share a future renderer. They have separate search demand and receive separate candidate scores.

## Pilot input

The checked-in [design-cad-pilot.json](design-cad-pilot.json) is a development fixture for Photoshop, Illustrator, and CAD-related formats. It is not an approved production candidate pool and must not be run live without the user's scope confirmation.
