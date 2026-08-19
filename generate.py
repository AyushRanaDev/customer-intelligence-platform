#!/usr/bin/env python3
"""
Customer Intelligence & Decision Platform - dataset generator v2.

Design change from v1: feedback is delivered as SEPARATE per-source files with
genuinely different shapes (flat CSV, nested ticket JSON, NPS/CSAT CSV, social
JSONL, email CSV). Normalising these into one view IS part of the challenge.

PUBLIC set  = 5 source files (given to participants).
PRIVATE set = same 5 shapes but with a few RENAMED/ADDED fields, PLUS one
              source shape participants have never seen (call-centre transcripts).

A single stable key `record_id` is present in every record of every file in both
sets, so objective grading (join on record_id) still works regardless of the
field renames.

Architecture: build canonical records once (all latent fields), then serialise
each into its source-specific shape for the target dataset.
"""

import csv, json, random, os
from datetime import datetime, timedelta
from collections import Counter, defaultdict

SEED = 42
random.seed(SEED)

NOW = datetime(2026, 8, 19, 9, 0, 0)
START = NOW - timedelta(weeks=24)

NEW_VERSION = "4.2.0"
NEW_VERSION_DATE = datetime(2026, 8, 1)
UI_REDESIGN_DATE = datetime(2026, 7, 10)
PHISHING_START = datetime(2026, 7, 25)
BASE_VERSIONS = ["4.0.1", "4.0.4", "4.1.0", "4.1.2", "4.1.3"]

PUB_DIR = "/home/claude/ci_datasets/v2/participant"
PRV_DIR = "/home/claude/ci_datasets/v2/evaluator"
os.makedirs(PUB_DIR, exist_ok=True)
os.makedirs(PRV_DIR, exist_ok=True)

REGIONS = ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Pune",
           "Kolkata", "Ahmedabad", "Jaipur", "Lucknow", "Kochi", "Indore",
           "Singapore", "Dubai", "London"]
PLANS = ["free", "plus", "premium"]
EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "rediffmail.com",
                 "proton.me", "hotmail.com"]

# ---------------------------------------------------------------------------
# Content banks (same as v1)
# ---------------------------------------------------------------------------
THEMES = {
    "payments_transactions": {
        "neg": ["Payment failed but the amount got debited. No refund even after {d} days.",
                "UPI transaction stuck on 'processing' forever, had to force close.",
                "Sent money to the wrong contact and there is no way to raise a dispute in the app.",
                "Every second transfer fails and then succeeds on retry, so annoying.",
                "Bill payment shows success but the biller says they never received it.",
                "Auto-pay for my rent silently failed and I got a late fee."],
        "pos": ["UPI transfers are instant and I have never had one fail. Solid.",
                "Splitting bills with friends is smooth, love the request money feature.",
                "Scheduled payments just work, set and forget."],
        "neu": ["How long does an IMPS transfer usually take on Nova?",
                "Is there a daily limit on UPI payments here?"]},
    "app_performance": {
        "neg": ["App crashes every time I open the payment screen. Unusable.",
                "So slow to load, spinning wheel for 30 seconds on the home tab.",
                "Freezes on the transaction history page and I have to restart.",
                "Latest update drains my battery and heats up the phone.",
                "White screen on launch after the update, tried reinstalling twice."],
        "pos": ["Snappy and smooth, one of the faster banking apps I use.",
                "Runs great even on my old phone, no complaints on speed."],
        "neu": ["Does the app work on Android 11 still?",
                "Any plans for a lighter version of the app?"]},
    "onboarding_kyc": {
        "neg": ["KYC has been 'under review' for {d} days, still cannot use my account.",
                "Document upload keeps failing at the last step during onboarding.",
                "Video KYC agent never connected after three scheduled attempts.",
                "Signup rejected my valid PAN twice with no explanation."],
        "pos": ["Onboarding took five minutes, KYC approved same day. Impressive.",
                "Account setup was the easiest I have seen, fully digital."],
        "neu": ["What documents do I need for full KYC?",
                "Can I open an account without Aadhaar?"]},
    "customer_support": {
        "neg": ["Raised a ticket {d} days ago and still no response from support.",
                "Chat support just sends canned replies and never resolves anything.",
                "Got transferred four times and had to repeat my issue each time.",
                "Support closed my ticket without solving the problem."],
        "pos": ["Support sorted my refund in under an hour, really helpful agent.",
                "Chat team was patient and actually fixed my issue first try."],
        "neu": ["What are the support hours for phone assistance?",
                "Is there a way to escalate a ticket?"]},
    "ui_ux": {
        "neg": ["The navigation is confusing, I can never find my statements.",
                "Too many taps to do a simple transfer now.",
                "Font is tiny and there is no dark mode option."],
        "pos": ["Clean interface, everything is where you expect it to be.",
                "Love how simple it is to check my balance at a glance."],
        "neu": ["Where did the rewards tab move to?",
                "Can I customise the home screen widgets?"]},
    "fees_pricing": {
        "neg": ["Charged a convenience fee that was never disclosed upfront.",
                "Hidden forex markup on my international card spend, not transparent.",
                "Started charging for what used to be a free feature."],
        "pos": ["Zero forex markup is a genuine reason I switched to Nova.",
                "No hidden charges, what you see is what you pay."],
        "neu": ["Is there an annual fee on the premium plan?",
                "What is the charge for an instant transfer?"]},
    "security_fraud": {
        "neg": ["Saw an unauthorised transaction on my account this morning.",
                "2FA codes arrive five minutes late so I keep getting locked out.",
                "My card was cloned and blocking it in-app did not work."],
        "pos": ["Instant card freeze feature saved me when I lost my wallet.",
                "Love the real-time fraud alerts, caught a bad charge fast."],
        "neu": ["How do I set up biometric login?",
                "Does Nova support virtual cards for online shopping?"]},
    "rewards_cashback": {
        "neg": ["Cashback from last month still not credited to my account.",
                "The reward offer disappeared before it was supposed to expire.",
                "Points I earned vanished after the update."],
        "pos": ["Cashback credited instantly, better than my old bank.",
                "The rewards on groceries are actually worth it."],
        "neu": ["When does monthly cashback usually get credited?",
                "How do I redeem my reward points?"]},
    "card_issues": {
        "neg": ["Physical card has not arrived after {d} days of 'shipped'.",
                "My card gets declined at petrol pumps every single time.",
                "Cannot increase my card limit, the option is greyed out."],
        "pos": ["Virtual card was ready instantly, used it the same minute.",
                "Metal card feels premium and works everywhere."],
        "neu": ["How long does card delivery take to a metro city?",
                "Can I have both a virtual and physical card?"]},
    "feature_request": {
        "neg": [], "pos": [],
        "neu": ["Please add support for recurring SIP investments.",
                "Would love a joint account feature for couples.",
                "Add Apple Watch support for quick balance checks.",
                "Can you integrate with Google Pay for tap to pay?",
                "A spending analytics dashboard would be great."]},
}
POL2SENT = {"neg": "negative", "pos": "positive", "neu": "neutral"}

SIGNAL_PAYMENT_CRASH = [
    "Ever since the 4.2.0 update the app crashes the moment I hit pay. Cannot send money at all.",
    "Payment screen force closes after update to 4.2.0. Money stuck, super frustrated.",
    "New version bricked payments for me, crashes at the confirm step every time.",
    "4.2.0 is broken, every UPI payment crashes the app and then shows pending.",
    "Updated today and now checkout crashes, had to pay cash at the store. Fix this.",
    "App dies on the payment confirmation screen since the latest update. Android.",
    "Cannot complete a single transaction after 4.2.0, instant crash on pay.",
    "Paid for groceries, app crashed, got charged twice. This started after the update."]
SIGNAL_PHISHING = [
    "Got an SMS claiming to be Nova asking me to verify my KYC on a weird link. Is this you?",
    "Someone is sending fake Nova texts saying my account is blocked, link looks dodgy.",
    "Received a call pretending to be Nova support asking for my OTP. Scam alert.",
    "Fake Nova KYC link circulating on WhatsApp, please warn your users.",
    "Almost fell for a phishing message that looked exactly like your alerts."]
SIGNAL_UI_POS = [
    "The new redesign is gorgeous, finally a modern clean look. Well done.",
    "Loving the refreshed UI after the July update, so much easier on the eyes.",
    "New home screen layout is a big improvement, everything feels intuitive now."]
SIGNAL_UI_NEG = [
    "Hate the new redesign, please bring back the old layout. Everything moved.",
    "The July UI change buried the features I use daily, worse than before.",
    "New interface looks pretty but it takes twice as long to do anything now."]
MULTILINGUAL = [
    ("hinglish", "payments_transactions", "negative", "Payment fail ho gaya par paise cut gaye, refund kab milega?"),
    ("hinglish", "app_performance", "negative", "Update ke baad app baar baar crash ho raha hai pay karte time."),
    ("hinglish", "customer_support", "negative", "3 din se ticket raise kiya hai, koi reply nahi aaya support se."),
    ("hinglish", "rewards_cashback", "negative", "Pichle mahine ka cashback ab tak credit nahi hua bhai."),
    ("hi", "app_performance", "negative", "ऐप बार-बार क्रैश हो रहा है पेमेंट करते समय, कृपया ठीक करें।"),
    ("hi", "payments_transactions", "negative", "पैसे कट गए लेकिन ट्रांज़ैक्शन फेल हो गया, रिफंड नहीं आया।"),
    ("hi", "onboarding_kyc", "negative", "केवाईसी कई दिनों से रिव्यू में अटकी है, खाता इस्तेमाल नहीं कर पा रहा।"),
    ("ta", "app_performance", "negative", "செயலி பணம் செலுத்தும் போது கிராஷ் ஆகிறது, சரி செய்யவும்."),
    ("ta", "customer_support", "negative", "மூன்று நாட்களாக ஆதரவு குழுவிடமிருந்து பதில் இல்லை."),
    ("hinglish", "ui_ux", "positive", "Naya design bahut clean hai, ekdum smooth lagta hai.")]
NOISE = ["asdkjhasd", "first!!!", "👍👍👍", "🔥🔥🔥🔥", "test test test", "nice",
         "ok", "check out my channel for free recharge tricks link in bio",
         "WIN A FREE IPHONE click here now", ".", "🙂",
         "good app good app good app good app", "Follow for follow?",
         "buy cheap followers dm me"]

AGENT_REPLIES = [
    "Thanks for reaching out, I'm looking into this now.",
    "I'm sorry for the trouble. Could you share your registered number?",
    "I've raised this to the concerned team, you'll hear back shortly.",
    "Apologies for the inconvenience, I've noted the details.",
    "Let me check your account and get back to you."]

# ---------------------------------------------------------------------------
# Canonical record model
# ---------------------------------------------------------------------------
_counter = {"n": 0}
def new_id():
    _counter["n"] += 1
    return f"NOVA-{_counter['n']:06d}"

def rand_ts(a, b):
    return a + timedelta(seconds=random.uniform(0, (b - a).total_seconds()))

def default_priority(s):
    return {"negative": "medium", "neutral": "low", "positive": "low"}[s]

# source vocab. call_center exists only in PRIVATE.
PUB_SOURCES = {"app_review": 0.34, "support_ticket": 0.19, "survey": 0.16,
               "social": 0.19, "email": 0.12}
PRV_SOURCES = {"app_review": 0.28, "support_ticket": 0.17, "survey": 0.14,
               "social": 0.17, "email": 0.10, "call_center": 0.14}

def pick_source(dataset):
    w = PUB_SOURCES if dataset == "public" else PRV_SOURCES
    return random.choices(list(w), weights=list(w.values()))[0]

def make_canon(dataset, ts, source, theme, sentiment, text,
               platform=None, version=None, language="en",
               priority=None, signal_tags=None, is_noise=False):
    is_app = source in ("app_review", "chat")
    if source == "app_review":
        sub = random.choice(["ios_appstore", "google_play"])
        platform = "iOS" if sub == "ios_appstore" else "Android"
    else:
        sub = source
    if platform is None:
        platform = random.choice(["Android", "iOS"]) if is_app else ""
    if version is None:
        if platform in ("Android", "iOS"):
            version = NEW_VERSION if (ts >= NEW_VERSION_DATE and random.random() < 0.6) \
                      else random.choice(BASE_VERSIONS)
        else:
            version = ""
    return {
        "record_id": new_id(),
        "dataset": dataset,
        "source": source,
        "sub_source": sub,
        "ts": ts,
        "text": text,
        "theme": theme,
        "sentiment": sentiment,
        "priority": priority or default_priority(sentiment),
        "platform": platform,
        "app_version": version,
        "rating": None,
        "language": language,
        "region": random.choice(REGIONS),
        "customer_id": (f"CUST-{random.randint(10000,99999)}" if random.random() < 0.8 else ""),
        "plan": random.choice(PLANS),
        "signal_tags": signal_tags or [],
        "is_noise": is_noise,
    }

# ---------------------------------------------------------------------------
# Canonical generators
# ---------------------------------------------------------------------------
def gen_baseline(dataset, n, multilingual_p, noise_p):
    out = []
    themes = list(THEMES)
    for _ in range(n):
        r = random.random()
        ts = rand_ts(START, NOW)
        source = pick_source(dataset)
        if r < noise_p:
            out.append(make_canon(dataset, ts, source, "other", "neutral",
                                   random.choice(NOISE), is_noise=True, priority="low"))
            continue
        if r < noise_p + multilingual_p:
            lang, theme, sent, txt = random.choice(MULTILINGUAL)
            out.append(make_canon(dataset, ts, source, theme, sent, txt, language=lang))
            continue
        theme = random.choice(themes)
        pols = [p for p in ("neg", "pos", "neu") if THEMES[theme][p]]
        pol = random.choices(pols, weights=[3 if p == "neg" else 1 for p in pols])[0]
        text = random.choice(THEMES[theme][pol]).format(d=random.randint(2, 21))
        out.append(make_canon(dataset, ts, source, theme, POL2SENT[pol], text))
    return out

def inject_payment_crash(dataset, count):
    out = []
    src_choices = ["app_review", "social", "support_ticket"]
    if dataset == "private":
        src_choices += ["call_center", "email"]
    for _ in range(count):
        ts = rand_ts(max(START, NEW_VERSION_DATE), NOW)
        source = random.choices(src_choices,
                    weights=[3, 3, 2] + ([2, 1] if dataset == "private" else []))[0]
        platform = random.choices(["Android", "iOS"], weights=[4, 1])[0]
        rec = make_canon(dataset, ts, source, "app_performance", "negative",
                         random.choice(SIGNAL_PAYMENT_CRASH),
                         platform=platform if source == "app_review" else "",
                         version=NEW_VERSION if source == "app_review" else "",
                         priority="urgent",
                         signal_tags=["emerging_payment_crash_v420"])
        out.append(rec)
    return out

def inject_phishing(dataset, count):
    out = []
    src_choices = ["social", "support_ticket", "email"]
    if dataset == "private":
        src_choices.append("call_center")
    for _ in range(count):
        ts = rand_ts(max(START, PHISHING_START), NOW)
        source = random.choice(src_choices)
        out.append(make_canon(dataset, ts, source, "security_fraud", "negative",
                              random.choice(SIGNAL_PHISHING), priority="high",
                              signal_tags=["emerging_phishing_security"]))
    return out

def inject_ui_conflict(dataset, pos_count, neg_count):
    out = []
    for txts, sent, cnt in [(SIGNAL_UI_POS, "positive", pos_count),
                            (SIGNAL_UI_NEG, "negative", neg_count)]:
        for _ in range(cnt):
            ts = rand_ts(max(START, UI_REDESIGN_DATE), NOW)
            out.append(make_canon(dataset, ts, pick_source(dataset), "ui_ux", sent,
                                  random.choice(txts),
                                  signal_tags=["conflict_ui_redesign"]))
    return out

def inject_cashback(dataset, count):
    out = []
    for _ in range(count):
        ts = rand_ts(NOW - timedelta(weeks=3), NOW)
        out.append(make_canon(dataset, ts, pick_source(dataset), "rewards_cashback",
                              "negative", random.choice(THEMES["rewards_cashback"]["neg"]),
                              priority="high", signal_tags=["emerging_cashback_not_credited"]))
    return out

def inject_edge(dataset, count):
    out = []
    long_text = ("So I have been using Nova for about eight months now and overall it "
                 "has been fine but lately a few things pile up: the payment sometimes "
                 "lags, cashback took ages last month, support was slow once but great "
                 "another time, the card arrived late, however the interface is nice and "
                 "forex is genuinely zero markup which I appreciate, mixed feelings honestly.")
    edges = [("app_performance", "negative", "crashes"),
             ("ui_ux", "neutral", "🙂"),
             ("payments_transactions", "negative", "money gone"),
             ("customer_support", "negative", "worst"),
             ("payments_transactions", "neutral", long_text)]
    for i in range(count):
        theme, sent, text = edges[i % len(edges)]
        tags = ["edge_case_mixed_sentiment"] if text == long_text else ["edge_case"]
        out.append(make_canon(dataset, rand_ts(START, NOW), pick_source(dataset),
                              theme, sent, text, signal_tags=tags))
    return out

# ---------------------------------------------------------------------------
# Build canonical sets
# ---------------------------------------------------------------------------
def build_public():
    recs = gen_baseline("public", 760, multilingual_p=0.02, noise_p=0.008)
    recs += inject_cashback("public", 40)
    random.shuffle(recs)
    return recs

def build_private():
    recs = gen_baseline("private", 480, multilingual_p=0.05, noise_p=0.02)
    recs += inject_payment_crash("private", 55)
    recs += inject_phishing("private", 18)
    recs += inject_ui_conflict("private", 16, 18)
    recs += inject_edge("private", 20)
    random.shuffle(recs)
    return recs

# ---------------------------------------------------------------------------
# Serialisers: canonical -> source-specific shape for a dataset
# Field NAMES differ between public and private on purpose.
# ---------------------------------------------------------------------------
def score_from_sentiment(kind, sentiment):
    if kind == "nps":
        return {"positive": random.choice([9, 10]), "neutral": random.choice([7, 8]),
                "negative": random.choice([0, 2, 4, 5, 6])}[sentiment]
    return {"positive": random.choice([4, 5]), "neutral": 3,
            "negative": random.choice([1, 2])}[sentiment]

def title_from(text):
    return text.split(".")[0][:48]

def ser_app_review(r, private):
    store = "App Store" if r["sub_source"] == "ios_appstore" else "Play Store"
    rating = {"positive": random.choice([4, 5]), "neutral": 3,
              "negative": random.choice([1, 2])}[r["sentiment"]]
    if not private:
        return {"record_id": r["record_id"], "store": store, "rating": rating,
                "title": title_from(r["text"]), "body": r["text"],
                "os_version": r["platform"], "app_build": r["app_version"],
                "submitted_at": r["ts"].replace(microsecond=0).isoformat(),
                "country": r["region"]}
    # private: renamed body->feedback_body, submitted_at->review_date,
    # os_version->device_os, app_build->build, store->marketplace, +resolved_flag
    return {"record_id": r["record_id"], "marketplace": store, "rating": rating,
            "title": title_from(r["text"]), "feedback_body": r["text"],
            "device_os": r["platform"], "build": r["app_version"],
            "review_date": r["ts"].replace(microsecond=0).isoformat(),
            "country": r["region"], "resolved_flag": random.choice([True, False])}

def ser_survey(r, private):
    kind = "nps" if r["sub_source"] == "in_app_nps" else random.choice(["nps", "csat"])
    score = score_from_sentiment(kind, r["sentiment"])
    if not private:
        return {"record_id": r["record_id"], "survey_type": kind, "score": score,
                "verbatim": r["text"],
                "submitted_at": r["ts"].replace(microsecond=0).isoformat(),
                "plan": r["plan"], "region": r["region"]}
    # private: survey_type->type, verbatim->comment, +channel
    return {"record_id": r["record_id"], "type": kind, "score": score,
            "comment": r["text"],
            "submitted_at": r["ts"].replace(microsecond=0).isoformat(),
            "plan": r["plan"], "region": r["region"],
            "channel": random.choice(["in_app", "email_link"])}

def ser_email(r, private):
    dom = random.choice(EMAIL_DOMAINS)
    if not private:
        return {"record_id": r["record_id"],
                "received_at": r["ts"].replace(microsecond=0).isoformat(),
                "from_domain": dom, "subject": title_from(r["text"]),
                "message": r["text"], "region": r["region"]}
    # private: from_domain->sender_domain, message->email_body, +resolved_flag
    return {"record_id": r["record_id"],
            "received_at": r["ts"].replace(microsecond=0).isoformat(),
            "sender_domain": dom, "subject": title_from(r["text"]),
            "email_body": r["text"], "region": r["region"],
            "resolved_flag": random.choice([True, False])}

def ser_social(r, private):
    net = random.choice(["twitter", "reddit"])
    handle = f"@{random.choice(['ravi','ananya','sam','deepak','priya','arjun'])}{random.randint(10,999)}"
    tags = []
    if net == "twitter" and random.random() < 0.5:
        tags = random.choice([["#Nova"], ["#NovaApp", "#fail"], ["#fintech"], []])
    if not private:
        return {"record_id": r["record_id"], "network": net, "handle": handle,
                "posted_at": r["ts"].replace(microsecond=0).isoformat(),
                "content": r["text"], "likes": random.randint(0, 240),
                "hashtags": tags, "lang": r["language"]}
    # private: network->platform, content->post_text, likes->reach(added meaning)
    return {"record_id": r["record_id"], "platform": net, "handle": handle,
            "posted_at": r["ts"].replace(microsecond=0).isoformat(),
            "post_text": r["text"], "reach": random.randint(50, 12000),
            "hashtags": tags, "lang": r["language"]}

def ser_ticket(r, private):
    opened = r["ts"]
    agent_at = opened + timedelta(minutes=random.randint(5, 300))
    if not private:
        return {"record_id": r["record_id"], "subject": title_from(r["text"]),
                "channel": "web", "priority": r["priority"], "status": "open",
                "opened_at": opened.replace(microsecond=0).isoformat(),
                "customer_id": r["customer_id"], "region": r["region"],
                "tags": [r["theme"]],
                "messages": [
                    {"from": "customer", "at": opened.replace(microsecond=0).isoformat(),
                     "text": r["text"]},
                    {"from": "agent", "at": agent_at.replace(microsecond=0).isoformat(),
                     "text": random.choice(AGENT_REPLIES)}]}
    # private: customer_id->requester_id, tags->labels, +sla_breached,
    # messages[].from->sender, messages[].text->body
    return {"record_id": r["record_id"], "subject": title_from(r["text"]),
            "channel": "web", "priority": r["priority"], "status": "open",
            "opened_at": opened.replace(microsecond=0).isoformat(),
            "requester_id": r["customer_id"], "region": r["region"],
            "labels": [r["theme"]], "sla_breached": random.choice([True, False]),
            "messages": [
                {"sender": "customer", "at": opened.replace(microsecond=0).isoformat(),
                 "body": r["text"]},
                {"sender": "agent", "at": agent_at.replace(microsecond=0).isoformat(),
                 "body": random.choice(AGENT_REPLIES)}]}

def ser_call_center(r):
    # PRIVATE-ONLY, previously-unseen shape: transcript array.
    started = r["ts"]
    return {"record_id": r["record_id"],
            "call_started_at": started.replace(microsecond=0).isoformat(),
            "agent_id": f"AG-{random.randint(100,999)}",
            "region": r["region"],
            "duration_sec": random.randint(45, 900),
            "disposition": random.choice(["resolved", "escalated", "follow_up", "dropped"]),
            "transcript": [
                {"speaker": "customer", "utterance": r["text"]},
                {"speaker": "agent", "utterance": random.choice(AGENT_REPLIES)}]}

# ---------------------------------------------------------------------------
# Write files
# ---------------------------------------------------------------------------
def write_csv(path, rows):
    if not rows:
        open(path, "w").close(); return
    keys = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for row in rows:
            w.writerow(row)

def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

def emit(dataset, recs, outdir):
    private = dataset == "private"
    buckets = defaultdict(list)
    for r in recs:
        buckets[r["source"]].append(r)
    write_csv(f"{outdir}/app_reviews.csv",
              [ser_app_review(r, private) for r in buckets["app_review"]])
    write_json(f"{outdir}/support_tickets.json",
               [ser_ticket(r, private) for r in buckets["support_ticket"]])
    write_csv(f"{outdir}/surveys.csv",
              [ser_survey(r, private) for r in buckets["survey"]])
    write_jsonl(f"{outdir}/social.jsonl",
                [ser_social(r, private) for r in buckets["social"]])
    write_csv(f"{outdir}/email_feedback.csv",
              [ser_email(r, private) for r in buckets["email"]])
    if private:
        write_json(f"{outdir}/call_center_transcripts.json",
                   [ser_call_center(r) for r in buckets["call_center"]])
    return {k: len(v) for k, v in buckets.items()}

# ---------------------------------------------------------------------------
# Labels + ground truth
# ---------------------------------------------------------------------------
def write_labels(path, recs):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["record_id", "source", "theme", "sentiment", "priority",
                    "signal_tags", "is_noise"])
        for r in recs:
            w.writerow([r["record_id"], r["source"], r["theme"], r["sentiment"],
                        r["priority"], "|".join(r["signal_tags"]), r["is_noise"]])

def aggregate(recs):
    win = NOW - timedelta(weeks=3)
    theme_c = Counter(r["theme"] for r in recs)
    sent_c = Counter(r["sentiment"] for r in recs)
    tag_c = Counter(t for r in recs for t in r["signal_tags"])
    recent = Counter(r["theme"] for r in recs if r["ts"] >= win)
    crash = [r for r in recs if "emerging_payment_crash_v420" in r["signal_tags"]]
    crash_src = Counter(r["source"] for r in crash)
    crash_plat = Counter(r["platform"] for r in crash if r["platform"])
    return {"total": len(recs), "themes": dict(theme_c.most_common()),
            "sentiment": dict(sent_c), "signal_tags": dict(tag_c),
            "recent_3w_themes": dict(recent.most_common()),
            "crash_count": len(crash), "crash_by_source": dict(crash_src),
            "crash_by_platform_structured": dict(crash_plat)}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
pub = build_public()
prv = build_private()

pub_counts = emit("public", pub, PUB_DIR)
prv_counts = emit("private", prv, PRV_DIR)

# public self-check slice (across sources)
sample = pub[:70]
write_labels(f"{PUB_DIR}/public_sample_labels.csv", sample)

# private full labels + ground truth (evaluator only)
write_labels(f"{PRV_DIR}/private_labels_FULL.csv", prv)
agg = aggregate(prv)

ground_truth = {
    "dataset": "private",
    "product": "Nova (fictional consumer digital banking + payments app)",
    "as_of": "2026-08-19",
    "recent_window_weeks": 3,
    "total_records": agg["total"],
    "stable_join_key": "record_id (present in every file of every source, both sets)",
    "schema_note": ("Private files reuse the 5 public source shapes but RENAME/ADD "
                    "some fields, and add one source shape absent from the public set: "
                    "call_center_transcripts.json (nested 'transcript' array). Field "
                    "renames: app_reviews body->feedback_body, submitted_at->review_date, "
                    "os_version->device_os, app_build->build, store->marketplace, "
                    "+resolved_flag; support_tickets customer_id->requester_id, tags->labels, "
                    "messages[].from->sender, messages[].text->body, +sla_breached; "
                    "surveys survey_type->type, verbatim->comment, +channel; social "
                    "network->platform, content->post_text, likes->reach; email "
                    "from_domain->sender_domain, message->email_body, +resolved_flag."),
    "theme_distribution": agg["themes"],
    "sentiment_distribution": agg["sentiment"],
    "source_record_counts": prv_counts,
    "planted_signals": {
        "primary_emerging_issue": {
            "id": "emerging_payment_crash_v420",
            "summary": "App crashes on the payment/confirm screen after the v4.2.0 release (2026-08-01).",
            "theme": "app_performance", "record_count": agg["crash_count"],
            "time_window": "2026-08-01 to 2026-08-18", "app_version": "4.2.0",
            "by_source": agg["crash_by_source"],
            "structured_platform_in_reviews": agg["crash_by_platform_structured"],
            "note": ("Version 4.2.0 and Android are stated structurally only in app_reviews "
                     "(build/device_os). In social, tickets, email and CALL-CENTRE records the "
                     "same crash evidence is present in TEXT ONLY. A team that ignores the "
                     "unseen call_center source or only reads structured columns will "
                     "under-count this signal.")},
        "secondary_emerging_issue": {
            "id": "emerging_phishing_security",
            "summary": "Phishing wave: fake Nova SMS/calls requesting KYC verification / OTP (from 2026-07-25).",
            "theme": "security_fraud", "record_count": agg["signal_tags"].get("emerging_phishing_security", 0),
            "note": "External fraud, not an app bug. Good solutions separate it from product defects."},
        "conflicting_opinion_topic": {
            "id": "conflict_ui_redesign",
            "summary": "July UI redesign (2026-07-10) splits users: praised as modern vs. wanted-old-layout-back.",
            "theme": "ui_ux", "record_count": agg["signal_tags"].get("conflict_ui_redesign", 0),
            "note": "Tests representation of conflicting perspectives on the same change."},
        "robustness_cases": {
            "multilingual": "Hindi, Hinglish and Tamil present; must not be dropped or mislabeled.",
            "noise_spam": "Gibberish, emoji-only, promo/spam present; filter or down-weight.",
            "edge_cases": "One-word and long mixed-sentiment records present.",
            "schema_heterogeneity": ("5 differently shaped sources + 1 unseen source + renamed "
                                     "fields. Normalising all of these into one view is itself a graded capability.")}},
    "expected_top_recommendations": [
        "Hotfix the v4.2.0 payment-screen crash, prioritising Android; consider forced update or rollback.",
        "Issue a proactive fraud/phishing advisory and tighten official-communication verification.",
        "Revisit the July UI redesign: offer a classic-layout toggle or fix the navigation regressions.",
        "Clear the cashback-not-credited and KYC-delay backlogs and close the support-response-time gap."],
    "probe_questions_hidden": [
        {"q": "What is the single most urgent emerging issue in the last 3 weeks, and the likely cause?",
         "a": "Payment/confirm-screen crashes caused by the v4.2.0 release; concentrated on Android."},
        {"q": "Which app version and platform are most associated with the crash spike?",
         "a": "Version 4.2.0; predominantly Android. Structured evidence is in app_reviews; other sources state it in text."},
        {"q": "How many distinct feedback sources did you ingest, and did you include the call-centre transcripts?",
         "a": "Six sources in the private set. Missing call_center transcripts means missing part of the crash + phishing evidence."},
        {"q": "Is there a security/fraud signal distinct from product bugs? Describe it.",
         "a": "Yes: a phishing wave using fake Nova SMS/calls requesting KYC verification / OTP from late July."},
        {"q": "Name a recent change users disagree about, with both sides.",
         "a": "The July UI redesign: praised as modern/clean vs. criticised for moving features and slowing tasks."},
        {"q": "Give the 3 highest-priority actions for this week.",
         "a": "See expected_top_recommendations (crash hotfix, phishing advisory, UI redesign fix)."}],
}
write_json(f"{PRV_DIR}/private_ground_truth.json", ground_truth)

print("PUBLIC counts :", pub_counts, "total", len(pub))
print("PRIVATE counts:", prv_counts, "total", len(prv))
print("crash by source:", agg["crash_by_source"])
print("recent 3w themes:", agg["recent_3w_themes"])
print("signal tags:", agg["signal_tags"])
