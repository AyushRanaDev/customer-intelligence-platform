import { createGroqCompletion } from "@/lib/groqClient";
import { AnalysisResult, ChatStructuredAnswer, FieldMapping, RawRow } from "@/lib/types";

function parseRetryAfterSeconds(message: string) {
  const match = message.match(/Please try again in ([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1])) : null;
}

function localAnswer(question: string, analysisContext: AnalysisResult, excerpts: Array<{ record_id: string; text: string; source: string; segments: string[] }>): ChatStructuredAnswer {
  const lowerQuestion = question.toLowerCase();
  const topThemes = analysisContext.themes.slice(0, 3);
  const negativeThemes = analysisContext.themes.filter((theme) => theme.negative > 0).sort((a, b) => b.negativeRate - a.negativeRate || b.count - a.count);
  const urgent = analysisContext.themes.find((theme) => theme.urgency === "High") ?? negativeThemes[0] ?? topThemes[0];
  const evidenceIds = (urgent?.recordIds ?? topThemes.flatMap((theme) => theme.recordIds)).slice(0, 5);
  const topSegment = analysisContext.segments
    .flatMap((segment) => segment.values.map((value) => ({ column: segment.column, ...value })))
    .sort((a, b) => b.negative - a.negative || b.total - a.total)[0];

  if (lowerQuestion.includes("source") || lowerQuestion.includes("ingest")) {
    return {
      headline: "Ingested source coverage",
      directAnswer: `The platform normalized ${analysisContext.totalRows} records across ${analysisContext.sourceCount} source group${analysisContext.sourceCount === 1 ? "" : "s"}. The largest source is ${analysisContext.sources[0]?.source ?? "not available"} with ${analysisContext.sources[0]?.count ?? 0} records.`,
      evidence: analysisContext.sources.slice(0, 4).map((source) => `${source.source}: ${source.count} records using ${source.textField} as the normalized text field.`),
      suggestedFollowUps: ["Which source has the most negative feedback?", "Show the top themes by source."]
    };
  }

  if (lowerQuestion.includes("urgent") || lowerQuestion.includes("emerging") || lowerQuestion.includes("recent")) {
    return {
      headline: urgent ? `Most urgent issue: ${urgent.theme}` : "No urgent issue found",
      directAnswer: urgent ? `${urgent.theme} is the strongest urgent signal in the current analysis. It has ${urgent.count} mentions, ${urgent.negative} negative records, and ${Math.round(urgent.negativeRate * 100)}% negative sentiment.` : "The current dataset does not contain enough analyzed feedback to identify an urgent issue.",
      evidence: [
        `Relevant record_ids: ${evidenceIds.join(", ") || "not available"}.`,
        `Recent trend periods available: ${analysisContext.trends.slice(-3).map((trend) => `${trend.period} (${trend.total})`).join(", ") || "none"}.`,
        ...excerpts.slice(0, 2).map((item) => `${item.record_id}: ${item.text.slice(0, 140)}`)
      ],
      suggestedFollowUps: ["Which platform is this concentrated on?", "Show both sides of any disagreement."]
    };
  }

  if (lowerQuestion.includes("platform") || lowerQuestion.includes("version") || lowerQuestion.includes("concentrated")) {
    return {
      headline: topSegment ? `Concentration: ${topSegment.column} = ${topSegment.value}` : "No concentration found",
      directAnswer: topSegment ? `The strongest concentration I can see is ${topSegment.column} = ${topSegment.value}. It has ${topSegment.total} records, including ${topSegment.negative} negative records, and its top theme is ${topSegment.topTheme}.` : "I could not find a strong platform/version/segment concentration in the normalized fields.",
      evidence: [
        topSegment ? `${topSegment.column}=${topSegment.value}: ${topSegment.total} total, ${topSegment.negative} negative.` : "No segment evidence available.",
        `Available segment fields: ${analysisContext.segments.map((segment) => segment.column).join(", ") || "none"}.`
      ],
      suggestedFollowUps: ["Which segment has the worst sentiment?", "What should product fix first?"]
    };
  }

  if (lowerQuestion.includes("security") || lowerQuestion.includes("fraud")) {
    const security = analysisContext.themes.find((theme) => /security|fraud/i.test(theme.theme));
    return {
      headline: security ? "Security/Fraud signal found" : "No separate security/fraud signal",
      directAnswer: security ? `There is a separate ${security.theme} signal with ${security.count} mentions and ${security.negative} negative records.` : "I do not see a distinct Security/Fraud theme in the current analysis.",
      evidence: security ? [`Record_ids: ${security.recordIds.slice(0, 5).join(", ") || "not available"}.`, `${Math.round(security.negativeRate * 100)}% negative sentiment.`] : ["No matching Security/Fraud theme was generated."],
      suggestedFollowUps: ["Show payment-related complaints.", "What is the most urgent product issue?"]
    };
  }

  return {
    headline: "Dataset answer",
    directAnswer: `The top pain points are ${topThemes.map((theme) => theme.theme).join(", ") || "not available"}. Overall sentiment is ${analysisContext.sentiment.positive} positive, ${analysisContext.sentiment.neutral} neutral, and ${analysisContext.sentiment.negative} negative across ${analysisContext.sampledRows} analyzed records.`,
    evidence: [
      ...topThemes.map((theme) => `${theme.theme}: ${theme.count} mentions, ${theme.negative} negative, record_ids ${theme.recordIds.slice(0, 3).join(", ") || "not available"}.`),
      ...excerpts.slice(0, 1).map((item) => `${item.record_id}: ${item.text.slice(0, 140)}`)
    ].slice(0, 4),
    suggestedFollowUps: ["What should we fix first?", "Which source is most negative?", "Show disagreement on a recent change."]
  };
}

export async function POST(request: Request) {
  try {
    const { messages, analysisContext, rows, mapping } = (await request.json()) as {
      messages: { role: "user" | "assistant"; content: string }[];
      analysisContext: AnalysisResult;
      rows: RawRow[];
      mapping: FieldMapping;
    };
    const lastQuestion = messages.at(-1)?.content ?? "";
    const terms = lastQuestion.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
    const excerpts = rows
      .filter((row) => terms.some((term) => JSON.stringify(row).toLowerCase().includes(term)))
      .slice(0, 6)
      .map((row) => ({
        record_id: String(row[mapping.idColumn ?? "record_id"] ?? ""),
        text: String(row[mapping.textColumn] ?? ""),
        source: String(row.source_type ?? row.source_file ?? "uploaded"),
        segments: mapping.segmentColumns.map((column) => `${column}: ${row[column] ?? "Unknown"}`)
      }));

    const completion = await createGroqCompletion({
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a customer intelligence analyst. Return JSON only with this shape: {\"headline\":\"short title\",\"directAnswer\":\"2-4 sentence grounded answer\",\"evidence\":[\"fact with counts, segments, trends, or record_ids\",\"fact with record_ids\",\"optional quote or example\"],\"suggestedFollowUps\":[\"question\",\"question\"]}. Use only the provided dataset context. Cite record_ids when examples are mentioned. If data is insufficient, say so clearly."
        },
        {
          role: "user",
          content: `Aggregated analysis:\n${JSON.stringify({ sourceCount: analysisContext.sourceCount, sources: analysisContext.sources, sentiment: analysisContext.sentiment, themes: analysisContext.themes.slice(0, 8), conflicts: analysisContext.conflicts.slice(0, 5), trends: analysisContext.trends.slice(-6), segments: analysisContext.segments.slice(0, 4), recommendations: analysisContext.recommendations.slice(0, 5) }).slice(0, 12000)}\n\nRelevant excerpts:\n${JSON.stringify(excerpts).slice(0, 5000)}\n\nQuestion:\n${lastQuestion}`
        }
      ],
      temperature: 0.2
    });

    if (!completion) {
      return Response.json(localAnswer(lastQuestion, analysisContext, excerpts));
    }

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Partial<ChatStructuredAnswer>;
    return Response.json({
      headline: parsed.headline ?? "Answer",
      directAnswer: parsed.directAnswer ?? "I could not generate a grounded answer from the current context.",
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 4) : [],
      suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps) ? parsed.suggestedFollowUps.slice(0, 3) : []
    } satisfies ChatStructuredAnswer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed.";
    const retryAfterSeconds = parseRetryAfterSeconds(message);
    return Response.json(
      {
        error: retryAfterSeconds
          ? `Groq rate limit reached. Please try again in about ${retryAfterSeconds} seconds.`
          : message,
        retryAfterSeconds
      },
      { status: retryAfterSeconds ? 429 : 500 }
    );
  }
}
