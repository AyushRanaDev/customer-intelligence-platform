# START HERE — Customer Intelligence hackathon dataset

Two folders. **`public/` you share. `private/` you never share.**

Product is a fictional banking/payments app "Nova". Feedback comes from several
sources, each in its own format. The only field guaranteed across every file and
both sets is `record_id` — that is the join key for grading.

## The 3-step flow

1. **Now:** give participants the whole `public/` folder. They build on it.
2. **At judging:** point each team's app at `private/dataset/` (6 files) and ask
   the probe questions. Their app must run on it with no code changes.
3. **Score:** join their per-record output to `private/private_labels_FULL.csv`
   on `record_id`, and check their answers against `private/private_ground_truth.json`
   using the rubric in `private/EVALUATION_GUIDE.md`.

## What every file is

### `public/` — SHARE WITH PARTICIPANTS
| file | format | what it is |
|------|--------|------------|
| `app_reviews.csv` | CSV | app store reviews (1-5 rating) |
| `support_tickets.json` | JSON | tickets with nested `messages[]`, no rating |
| `surveys.csv` | CSV | NPS (0-10) + CSAT (1-5), mixed scales |
| `social.jsonl` | JSONL | X / Reddit posts |
| `email_feedback.csv` | CSV | email feedback |
| `README_PARTICIPANTS.md` | doc | brief + rules + what the private set will do |
| `DATA_DICTIONARY.md` | doc | field-by-field schema of each public file |
| `public_sample_labels.csv` | CSV | labels for 60 rows so teams self-check |

### `private/` — INTERNAL ONLY
| file | who | what it is |
|------|-----|------------|
| `dataset/` (6 files) | released to judges at judging | the real test set: same 5 sources **reshaped** (renamed/added fields) + 1 unseen source `call_center_transcripts.json` |
| `private_ground_truth.json` | you | answer key: planted signals, probe Q&A, expected recommendations |
| `private_labels_FULL.csv` | you | per-record theme/sentiment/priority/signal, keyed by `record_id` |
| `EVALUATION_GUIDE.md` | you | what is planted and why, plus the 100-pt scoring rubric |

### root
| file | what it is |
|------|------------|
| `generate.py` | seeded generator, re-run to regenerate or tweak everything |

## Public vs private in one line

- **Public** = clean-ish, 5 sources, one mild recent trend. Enough to build a working solution.
- **Private** = same schema *family* but harder: reshaped fields, an unseen call-centre source, non-English + noise + conflicting opinions, and one strong recent emerging issue the solution must catch. This is what proves completeness.

Full detail on the planted signals is in `private/EVALUATION_GUIDE.md`. Do not open that in front of participants.
