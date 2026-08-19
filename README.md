# Customer Intelligence & Decision Platform

AI-powered feedback analytics built with Next.js, TypeScript, Tailwind, Chart.js, and Groq.

## Setup

```bash
npm install
cp .env.example .env.local
```

Add your Groq key:

```bash
GROQ_API_KEY=your_key_here
```

Get a key from the Groq console, then run:

```bash
npm run dev
```

Open `http://localhost:3000`.

## What It Does

- Parses CSV, XLSX, XLS, and JSON in the browser.
- Infers feedback text, date, categorical segment, rating, score, boolean, id, and unknown fields.
- Lets users override detected field types before analysis.
- Runs batched Groq JSON-mode analysis for sentiment, themes, urgency, conflicts, trends, segments, and recommendations.
- Renders KPI cards plus sentiment, trend, theme, and segment charts.
- Provides a streaming chat endpoint grounded in the uploaded dataset and aggregated analysis.

If `GROQ_API_KEY` is not set, the app uses a small deterministic fallback so the interface can still be explored locally.

## Deploy To Vercel

Import the repo in Vercel or use:

```bash
npm i -g vercel
vercel
vercel deploy --prod
```

Set `GROQ_API_KEY` in Vercel project environment variables. No other secret is required.
