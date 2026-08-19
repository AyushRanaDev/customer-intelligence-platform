import { NextResponse } from "next/server";
import { generateRecommendations } from "@/lib/analysisPipeline";
import { AnalysisResult } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const analysis = (await request.json()) as Omit<AnalysisResult, "recommendations">;
    return NextResponse.json({ recommendations: await generateRecommendations(analysis) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recommendation generation failed." }, { status: 500 });
  }
}
