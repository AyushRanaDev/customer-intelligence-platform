# Public Data Dictionary

Five source files, five shapes. Same concept, different field names. Every record
has a unique `record_id` (the one field guaranteed stable into the private set).

Concept mapping across public sources:

| concept    | app_reviews | support_tickets | surveys | social | email |
|------------|-------------|-----------------|---------|--------|-------|
| id         | record_id | record_id | record_id | record_id | record_id |
| feedback text | body | messages[].text | verbatim | content | message |
| timestamp  | submitted_at | opened_at / messages[].at | submitted_at | posted_at | received_at |
| rating     | rating (1–5) | — | score (nps 0–10 / csat 1–5) | — | — |
| platform   | os_version | — | — | — | — |
| app build  | app_build | — | — | — | — |
| author     | — | customer_id | — | handle | from_domain |
| location   | country | region | region | — | region |
| language   | (en, in text) | — | — | lang | — |
| category hint | — | tags[] | — | hashtags[] | — |

## app_reviews.csv
`record_id, store, rating, title, body, os_version, app_build, submitted_at, country`
- store: "App Store" | "Play Store"; rating 1–5.

## support_tickets.json  (JSON array, nested)
`record_id, subject, channel, priority, status, opened_at, customer_id, region, tags[], messages[]`
- messages[] = `{from, at, text}`, customer + agent turns.

## surveys.csv
`record_id, survey_type, score, verbatim, submitted_at, plan, region`
- survey_type: "nps" (score 0–10) | "csat" (score 1–5). verbatim = free text.

## social.jsonl  (one JSON object per line)
`record_id, network, handle, posted_at, content, likes, hashtags[], lang`

## email_feedback.csv
`record_id, received_at, from_domain, subject, message, region`

## public_sample_labels.csv
`record_id, source, theme, sentiment, priority, signal_tags, is_noise` — 70 rows for self-check.

## Reminder about the private set
Field names above are the PUBLIC names. The private set renames/adds some fields
and adds one source shape not listed here. Map by meaning; join on record_id.
