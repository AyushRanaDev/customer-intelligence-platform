# Customer Intelligence & Decision Platform — Dataset (Participants)

You are building an AI-powered customer intelligence platform. It should ingest
raw customer feedback from multiple channels, understand what customers are
saying, surface emerging patterns and underlying issues, let a user explore the
feedback conversationally, and turn all of it into actionable recommendations.

## Important: the feedback is fragmented on purpose

Real feedback does not arrive as one tidy table. It comes from different systems,
each with its own shape and field names. Unifying these into a single view is a
core part of this challenge, not a pre-solved step. The public dataset is
therefore split into five source files with **different structures**:

| file | format | shape |
|------|--------|-------|
| `app_reviews.csv` | CSV, flat | one row per store review, has rating + OS/build |
| `support_tickets.json` | JSON array, **nested** | each ticket holds a `messages[]` conversation |
| `surveys.csv` | CSV, flat | NPS (0–10) and CSAT (1–5) with a free-text comment |
| `social.jsonl` | JSON lines | one post per line, has hashtags + language |
| `email_feedback.csv` | CSV, flat | subject + message body |

The same underlying concept is named differently across sources. The main
feedback text is `body` in reviews, `verbatim` in surveys, `content` in social,
`message` in email, and lives inside `messages[].text` in tickets. Timestamps,
ids and ratings vary too. Part of your job is to map all of these onto one
normalised record.

`public_sample_labels.csv` gives theme/sentiment labels for 70 records (across
sources) so you can sanity-check your pipeline.

## The hidden private dataset — read this carefully

At judging your solution is pointed at a **private** dataset you have not seen.
It is deliberately harder, and it is **not identical in schema**. Assume:

- **Additional and renamed fields.** Existing sources may rename fields (e.g. a
  review's `body` may appear as `feedback_body`, `submitted_at` as
  `review_date`) and add new ones. Do not hard-code column names blindly — map
  by meaning.
- **At least one source you have not seen** in the public files, in a new shape.
- **One stable key you can rely on:** every record in every file, public and
  private, carries a unique `record_id`. Nothing else is guaranteed to keep its
  name.

Build your ingestion so a new or renamed source is a small config/mapping
change, not a rewrite. A solution that only parses the exact public column names
will visibly break on the private set. That robustness is scored on its own.

## What the platform is expected to do (capabilities tested)

1. **Ingest & normalise** all sources — including unfamiliar shapes — into one view.
2. **Understand** each item: sentiment, and the theme/issue it belongs to.
3. **Cluster & trend**: detect what is *rising over time*, not just most common overall.
4. **Surface underlying issues**: tie a spike to a likely cause (version, platform, region, a recent change).
5. **Handle conflict**: represent disagreement on the same topic instead of averaging it away.
6. **Be robust**: don't be fooled by spam, emoji-only, or non-English records.
7. **Conversational exploration**: answer free-form questions, grounded, citing `record_id`s.
8. **Recommend**: a short, prioritised action list for the product team, each backed by evidence.

## Example questions your platform should answer

Representative of the *kind* asked at judging (exact questions held back):

- "What is the most urgent emerging issue in the last few weeks, and why?"
- "Which app version or platform is a problem concentrated on?"
- "How many sources did you ingest — did you catch all of them?"
- "Is there a security/fraud signal, separate from product bugs?"
- "Is there a recent change users disagree about? Show both sides."
- "Top 3 pain points, and what to fix first?"

The product is a fictional consumer digital banking + payments app called
**Nova**. All companies, versions and events are invented. See
`DATA_DICTIONARY.md` for the exact public field list per file.
