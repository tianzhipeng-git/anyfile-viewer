# DataForSEO pipeline and scoring methodology v1.1

Read this file before a live run or when interpreting a report.

Version 1.1 isolates Trends queries, narrows direct-viewer detection, and fixes response-cost accounting. Its scores and reported costs are not directly comparable with version 1.0 reports; rerun the full approved pool in a new directory when a v1.1 comparison is required.

## Four-stage data flow

The stages form a dependency graph; they are not four independent dashboards.

### 1. Keyword Suggestions: discover the query surface

Endpoint: `POST /v3/dataforseo_labs/google/keyword_suggestions/live` ([official reference](https://docs.dataforseo.com/v3/dataforseo_labs-google-keyword_suggestions-live/))

Run once per `suggestion_seed`, with the agreed location/language, a default limit of 100, and a server-side minimum search-volume filter of 10. Suggestions supply candidate long-tail queries. Their returned metrics are used only to rank which terms proceed to the next stage.

Retain a suggestion when it contains a candidate extension or alias, including adjacent converter/editor queries. The latter proceed to Overview so the script can measure what share of the format's demand is actually viewer/open intent. Only terms with a viewing action such as `viewer`, `view`, `open`, `opener`, `reader`, `preview`, or `player` contribute to viewer demand; terms dominated by `convert`, `editor`, `template`, `repair`, or `download software` remain only in the intent-purity denominator.

### 2. Keyword Overview: establish the numeric source of truth

Endpoint: `POST /v3/dataforseo_labs/google/keyword_overview/live` ([official reference](https://docs.dataforseo.com/v3/dataforseo_labs-google-keyword_overview-live/))

Send the union of retained suggestions and the fixed `seed_keywords`. Deduplicate normalized text and keep at most 40 terms per candidate. Batch at most 700 keywords per request.

Only Overview values enter search-volume, keyword-difficulty, intent, and coverage calculations. This prevents metrics from different stages or update times being mixed in one score.

Raw volumes are not summed because close variants frequently represent overlapping demand. For a candidate, sort eligible Overview volumes descending and calculate:

```text
primary_volume = largest keyword volume
secondary_credit = min(25% × sum(other volumes), primary_volume)
effective_monthly_volume = primary_volume + secondary_credit
```

The cap keeps the result between the largest single term and twice that term.

### 3. SERP Advanced: machine-score ambiguity and competitive gap

Endpoint: `POST /v3/serp/google/organic/live/advanced` ([official reference](https://docs.dataforseo.com/v3/serp-se-type-live-advanced/))

Choose one representative query per candidate: the eligible viewer/open query with the highest Overview volume. Fetch the top 10 organic results.

The script computes:

- `serp_relevance`: share of top-10 organic results matching at least one configured context group; every term in the selected group must match;
- `direct_viewer_results`: distinct relevant hostnames containing explicit viewer or online-preview product language; generic “how to open” guides do not count as direct viewers;
- `viewer_gap`: 100 for no direct viewer, 80 for 1–2, 60 for 3–4, 40 for 5–6, and 20 for 7 or more;
- `difficulty_opportunity`: `100 - keyword_difficulty` from Keyword Overview.

If `serp_relevance < 40`, the extension/query is considered ambiguous and the final score is capped at 54. This is an automated result, not a prompt for an informal human SERP review.

### 4. DataForSEO Trends Explore: adjust for direction, not magnitude

Endpoint: `POST /v3/keywords_data/dataforseo_trends/explore/live` ([official reference](https://docs.dataforseo.com/v3/keywords_data-dataforseo_trends-explore-live/))

Send each representative query in its own request with `past_12_months`. DataForSEO normalizes multi-keyword requests against the strongest series, which can round lower-volume formats to zero and make evidence depend on candidate batching. Search volume remains the magnitude measure; Trends is used only for direction.

Sort returned points by timestamp, then compare the latest quarter with the preceding quarter: `trend_growth = recent_average / previous_average - 1`.

Zero-only or missing series remain missing. They do not become a negative trend.

## Baseline functions

These are v1.1 discovery baselines for long-tail file formats. Keep them fixed for all candidates in a run.

### Effective monthly volume score

| Effective monthly volume | Score |
|---:|---:|
| 0 or missing | 0 |
| 1–9 | 10 |
| 10–49 | 25 |
| 50–199 | 45 |
| 200–999 | 65 |
| 1,000–4,999 | 82 |
| 5,000+ | 100 |

### Query breadth score

Count eligible queries with Overview volume of at least 10.

| Query count | Score |
|---:|---:|
| 0 | 0 |
| 1 | 30 |
| 2–3 | 60 |
| 4–7 | 80 |
| 8+ | 100 |

### Trend score

Map growth to a bounded score using linear interpolation between these anchors:

| Growth | Score |
|---:|---:|
| −50% or worse | 0 |
| −20% | 25 |
| 0% | 50 |
| +20% | 70 |
| +50% | 85 |
| +100% or more | 100 |

Missing trend data receives no trend points and lowers confidence; it is not treated as decline.

## Final score

```text
Demand (55 points)
  effective monthly volume       40
  query breadth                  10
  viewer-intent purity            5

Search opportunity (25 points)
  direct-viewer gap              15
  inverse keyword difficulty      5
  SERP format relevance           5

Momentum (10 points)
  12-month trend direction       10

Evidence confidence (10 points)
  Keyword Overview coverage       4
  usable SERP evidence             3
  usable Trends evidence           3
```

`viewer-intent purity` is the share of total Overview volume attached to eligible viewer/open terms among all candidate terms returned by Overview.

Recommendation bands:

| Score | Recommendation |
|---:|---|
| 70–100 | Strong demand candidate |
| 55–69 | Worth technical feasibility research |
| 40–54 | Watchlist |
| 0–39 | Deprioritize on current demand evidence |

Automatic caps apply:

- SERP relevance below 40: maximum 54, labeled ambiguous query;
- Overview coverage below 50%: maximum 54, labeled insufficient keyword coverage;
- no eligible keyword with volume at least 10: maximum 39.

The report ranks market demand. It must not claim that the top format is cheap, secure, or browser-feasible to implement.

## Cost and failure semantics

- The dry run reports request-count bounds but does not estimate currency because account pricing can vary.
- The live report sums only the response-level `cost`, which DataForSEO defines as the total task cost. It does not add task-level cost again.
- Paid POST requests are never retried automatically. An ambiguous HTTP or API failure stops the run so the user controls possible duplicate charges.
- Every successful paid response is written to `checkpoint.json` before the next request. A fresh live run refuses an existing checkpoint, partial result, or report.
- `--resume` is an explicit user-approved action. It validates the configuration hash, reuses successful checkpointed responses, and sends only missing requests.
- `partial.json` records the failure and points to the preserved checkpoint. `evidence.json` contains the normalized successful-stage evidence used by the final report.
