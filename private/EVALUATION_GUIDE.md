# Evaluation Guide (EVALUATORS ONLY — do not share with participants)

Private dataset, planted signals, and scoring. Full answer key:
`private_ground_truth.json`. Per-record labels: `private_labels_FULL.csv`
(includes a `source` column for per-source recall).

## Files

**Participant folder (public, already released):** `app_reviews.csv`,
`support_tickets.json`, `surveys.csv`, `social.jsonl`, `email_feedback.csv`,
`public_sample_labels.csv`, `README_PARTICIPANTS.md`, `DATA_DICTIONARY.md`.

**Evaluator folder (private, release at judging):** same five source files with
renamed/added fields, PLUS `call_center_transcripts.json` (unseen shape),
`private_labels_FULL.csv`, `private_ground_truth.json`, this guide.

## Schema differences public → private (the deliberate reshape)

Stable across everything: `record_id`. Everything else may move.

- **app_reviews:** body→`feedback_body`, submitted_at→`review_date`,
  os_version→`device_os`, app_build→`build`, store→`marketplace`, +`resolved_flag`.
- **support_tickets:** customer_id→`requester_id`, tags→`labels`,
  messages[].from→`sender`, messages[].text→`body`, +`sla_breached`.
- **surveys:** survey_type→`type`, verbatim→`comment`, +`channel`.
- **social:** network→`platform`, content→`post_text`, likes→`reach`.
- **email:** from_domain→`sender_domain`, message→`email_body`, +`resolved_flag`.
- **NEW source — `call_center_transcripts.json`:** nested `transcript[]` of
  `{speaker, utterance}`, plus `call_started_at, agent_id, region, duration_sec,
  disposition`. Not present in public at all.

A team whose ingestion hard-codes public column names will drop or mis-map these.
That is intended and is scored as its own rubric line.

## Planted signals (why each exists)

1. **Primary — payment crash after v4.2.0** (55 records, from 2026-08-01). Spread
   across ALL six sources including call-centre. Version 4.2.0 / Android is stated
   *structurally* only in app_reviews (`build`/`device_os`); in the other five
   sources the same evidence is **text-only**. So a complete answer requires
   reading text, not just columns, AND ingesting the unseen call-centre source.
   Overall theme volume is dominated by other themes — this signal only leads on a
   *recent-window, time-based* view. That gap is the main separator.
2. **Secondary — phishing wave** (18 records, from 2026-07-25). External fraud, not
   a bug. Tests separating a trust/security signal from product defects.
3. **Conflict — July UI redesign** (34 records, both polarities). Tests
   representing disagreement on one topic.
4. **Robustness** — multilingual (hi/hinglish/ta), spam/emoji/noise, one-word and
   long mixed-sentiment edge cases, AND the schema heterogeneity itself.

## Probe questions

Run the hidden probes in `private_ground_truth.json` (`probe_questions_hidden`)
live against the private data; expected answers are alongside. Note probe #3
explicitly checks whether they ingested all six sources / the call-centre file.

## Suggested rubric (100 pts)

| Capability | Pts | Full marks |
|------------|-----|-----------|
| Ingestion & normalisation across shapes | 12 | All 5 shapes unified into one view |
| **Adapts to unseen source + renamed fields** | **10** | Ingests call-centre + renamed fields with no code rewrite |
| Theme classification | 12 | Sensible themes; roughly matches `theme_distribution` |
| Sentiment | 8 | Correct on clear cases; not fooled by sarcasm/mixed |
| **Emerging-issue detection (time-based)** | **18** | Finds the v4.2.0 crash spike as top recent issue |
| Root-cause linkage | 10 | Ties spike to 4.2.0 + Android, including text-only evidence |
| Security/fraud separation | 7 | Flags phishing wave distinct from bugs |
| Conflict representation | 7 | Shows both sides of the UI redesign |
| Robustness (noise + multilingual) | 6 | Noise filtered; non-English kept and labelled |
| Conversational exploration | 6 | Grounded free-form answers citing record_ids |
| Actionable recommendations | 4 | Prioritised actions matching `expected_top_recommendations` |

Weight emerging-issue detection, root-cause, and unseen-source adaptation most —
they separate a working prototype from a complete platform.

## Automated scoring

Join a team's per-record output to `private_labels_FULL.csv` on `record_id`
(present in every file). Compute theme/sentiment accuracy and, importantly,
recall on `signal_tags` — did they catch the crash / phishing / conflict records,
and specifically the crash records whose source is `call_center`? Low call-centre
recall = they skipped the unseen source. Filter `is_noise=True` for spam handling.
