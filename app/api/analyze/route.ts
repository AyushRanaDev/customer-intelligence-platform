import { NextResponse } from "next/server";
import { runAnalysis } from "@/lib/analysisPipeline";
import { FieldMapping, RawRow } from "@/lib/types";

function parseRetryAfterSeconds(message: string) {
  const match = message.match(/Please try again in ([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1])) : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rows?: RawRow[]; mapping?: FieldMapping };
    if (!body.rows?.length || !body.mapping?.textColumn) {
      return NextResponse.json({ error: "Rows and a feedback text column are required." }, { status: 400 });
    }
    return NextResponse.json(await runAnalysis(body.rows, body.mapping));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    const retryAfterSeconds = parseRetryAfterSeconds(message);
    return NextResponse.json(
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
