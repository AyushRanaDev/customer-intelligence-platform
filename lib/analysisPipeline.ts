import { createGroqCompletion } from "./groqClient";
import { AnalysisResult, FieldMapping, RawRow, Recommendation, RowAnalysis, Sentiment, SourceSummary, ThemeSummary } from "./types";

const MAX_ROWS = 900;

const negativeWords = ["bad", "bug", "broken", "slow", "confusing", "expensive", "poor", "angry", "fail", "late", "hard", "issue", "problem"];
const positiveWords = ["great", "love", "easy", "fast", "helpful", "excellent", "good", "smooth", "improved", "happy", "best"];
const securityWords = ["fraud", "scam", "phish", "security", "locked", "unauthorized", "stolen", "breach"];
const bugWords = ["bug", "crash", "freeze", "broken", "slow", "loading", "error"];
const paymentWords = ["payment", "transfer", "card", "billing", "charge", "invoice", "refund"];
const supportWords = ["support", "ticket", "agent", "reply", "helpdesk"];

function textOf(row: RawRow, column: string) {
  return String(row[column] ?? "").slice(0, 800);
}

function fallbackAnalyze(rows: RawRow[], mapping: FieldMapping): RowAnalysis[] {
  return rows.map((row, rowIndex) => {
    const text = textOf(row, mapping.textColumn).toLowerCase();
    const neg = negativeWords.filter((word) => text.includes(word)).length;
    const pos = positiveWords.filter((word) => text.includes(word)).length;
    const sentiment: Sentiment = neg > pos ? "Negative" : pos > neg ? "Positive" : "Neutral";
    const theme =
      text.includes("price") || text.includes("cost") ? "Pricing and Fees" :
      securityWords.some((word) => text.includes(word)) ? "Security and Fraud" :
      supportWords.some((word) => text.includes(word)) ? "Support Experience" :
      paymentWords.some((word) => text.includes(word)) ? "Payments and Transfers" :
      bugWords.some((word) => text.includes(word)) ? "Reliability and Performance" :
      text.includes("feature") || text.includes("design") || text.includes("ui") ? "Product Experience" :
      "General Feedback";
    const urgency =
      securityWords.some((word) => text.includes(word)) ? "High" :
      sentiment === "Negative" && (text.includes("cannot") || text.includes("can't") || text.includes("unable")) ? "High" :
      sentiment === "Negative" ? "Medium" :
      "Low";
    return {
      rowIndex,
      recordId: String(row[mapping.idColumn ?? "record_id"] ?? rowIndex),
      source: String(row.source_type ?? row.source_file ?? "uploaded"),
      sentiment,
      theme,
      urgency,
      summary: textOf(row, mapping.textColumn).slice(0, 160)
    };
  });
}

function normalizeTheme(theme: string) {
  return theme.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60) || "General Feedback";
}

function periodKey(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function generateRecommendations(result: Omit<AnalysisResult, "recommendations">): Promise<Recommendation[]> {
  const fallback = (): Recommendation[] =>
    result.themes.slice(0, 4).map((theme, index) => ({
      title: `Address ${theme.theme}`,
      stakeholder: index === 0 ? "Product" : index === 1 ? "Support" : index === 2 ? "Engineering" : "Leadership",
      priority: theme.negativeRate > 0.45 ? "High" as const : "Medium" as const,
      action: `Review the highest-volume complaints in ${theme.theme} and assign a clear owner for follow-up.`,
      evidence: `${theme.count} mentions, ${Math.round(theme.negativeRate * 100)}% negative, examples from ${theme.recordIds.slice(0, 3).join(", ") || "available records"}.`,
      theme: theme.theme
    }));

  try {
    const completion = await createGroqCompletion({
      preferredModel: undefined,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Create prioritized recommendations from aggregated customer feedback. Return JSON only: {\"recommendations\":[{\"title\":\"...\",\"stakeholder\":\"Product|Engineering|Support|Leadership\",\"priority\":\"Low|Medium|High\",\"action\":\"concrete next step\",\"evidence\":\"data-backed reason including counts or record ids\",\"theme\":\"matching theme\"}]}." },
        { role: "user", content: JSON.stringify({ sentiment: result.sentiment, themes: result.themes.slice(0, 8), conflicts: result.conflicts.slice(0, 5), trends: result.trends.slice(-6), segments: result.segments.slice(0, 4), sources: result.sources }).slice(0, 12000) }
      ],
      temperature: 0.2
    });
    if (!completion) return fallback();
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{\"recommendations\":[]}") as { recommendations?: Recommendation[] };
    return (parsed.recommendations?.length ? parsed.recommendations : fallback()).slice(0, 8);
  } catch {
    return fallback();
  }
}

export async function runAnalysis(rows: RawRow[], mapping: FieldMapping): Promise<AnalysisResult> {
  const sampled = rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows;
  const notices = rows.length > MAX_ROWS ? [`Analyzed the first ${MAX_ROWS} rows out of ${rows.length} normalized records to stay within the free-tier budget.`] : [];
  const filtered = sampled.filter((row) => !Boolean(row.isLikelySpam) && !Boolean(row.isNonEnglish));
  if (filtered.length !== sampled.length) notices.push(`Ignored ${sampled.length - filtered.length} likely spam or non-English records during the main analysis view.`);
  const batches = fallbackAnalyze(filtered, mapping);

  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  batches.forEach((item) => sentiment[item.sentiment.toLowerCase() as keyof typeof sentiment]++);

  const byTheme = new Map<string, ThemeSummary>();
  batches.forEach((item) => {
    const themeName = normalizeTheme(item.theme);
    const current = byTheme.get(themeName) ?? { theme: themeName, count: 0, positive: 0, neutral: 0, negative: 0, negativeRate: 0, urgency: "Low", examples: [], recordIds: [] };
    current.count++;
    current[item.sentiment.toLowerCase() as "positive" | "neutral" | "negative"]++;
    current.urgency = item.urgency === "High" ? "High" : current.urgency === "High" ? "High" : item.urgency;
    if (current.examples.length < 3) current.examples.push(textOf(filtered[item.rowIndex], mapping.textColumn));
    if (item.recordId && current.recordIds.length < 6) current.recordIds.push(item.recordId);
    byTheme.set(themeName, current);
  });
  const themes = Array.from(byTheme.values()).map((theme) => ({ ...theme, negativeRate: theme.negative / Math.max(theme.count, 1) })).sort((a, b) => b.count - a.count);
  const conflicts = themes.filter((theme) => theme.positive / theme.count > 0.25 && theme.negative / theme.count > 0.25);

  const trends = Array.from(filtered.reduce((map, row, index) => {
    const key = mapping.dateColumn ? periodKey(row[mapping.dateColumn]) : "";
    if (!key) return map;
    const item = batches.find((analysis) => analysis.rowIndex === index);
    const point = map.get(key) ?? { period: key, positive: 0, neutral: 0, negative: 0, total: 0 };
    if (item) point[item.sentiment.toLowerCase() as "positive" | "neutral" | "negative"]++;
    point.total++;
    map.set(key, point);
    return map;
  }, new Map<string, { period: string; positive: number; neutral: number; negative: number; total: number }>()).values()).sort((a, b) => a.period.localeCompare(b.period));

  const sourceMap = new Map<string, SourceSummary>();
  filtered.forEach((row) => {
    const source = String(row.source_type ?? row.source_file ?? "uploaded");
    const current = sourceMap.get(source) ?? { source, count: 0, textField: mapping.textColumn };
    current.count++;
    sourceMap.set(source, current);
  });
  const sources = Array.from(sourceMap.values()).sort((a, b) => b.count - a.count);

  const segments = mapping.segmentColumns.map((column) => {
    const values = new Map<string, { value: string; positive: number; neutral: number; negative: number; total: number; themes: Record<string, number> }>();
    filtered.forEach((row, index) => {
      const value = String(row[column] ?? "Unknown").slice(0, 48) || "Unknown";
      const item = batches.find((analysis) => analysis.rowIndex === index);
      if (!item) return;
      const current = values.get(value) ?? { value, positive: 0, neutral: 0, negative: 0, total: 0, themes: {} };
      current[item.sentiment.toLowerCase() as "positive" | "neutral" | "negative"]++;
      current.total++;
      current.themes[normalizeTheme(item.theme)] = (current.themes[normalizeTheme(item.theme)] ?? 0) + 1;
      values.set(value, current);
    });
    return { column, values: Array.from(values.values()).sort((a, b) => b.total - a.total).slice(0, 8).map(({ themes: t, ...value }) => ({ ...value, topTheme: Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "General Feedback" })) };
  });

  notices.push(`Ingested ${sources.length} source group${sources.length === 1 ? "" : "s"} in the unified view.`);
  const partial = { totalRows: rows.length, sampledRows: filtered.length, sourceCount: sources.length, sources, sentiment, themes, conflicts, trends, segments, rowAnalyses: batches, notices };
  const recommendations = await generateRecommendations(partial);
  return { ...partial, recommendations };
}
