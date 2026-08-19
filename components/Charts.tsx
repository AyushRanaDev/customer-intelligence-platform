"use client";

import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import { AnalysisResult } from "@/lib/types";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend);

const colors = { positive: "#4fbf9f", neutral: "#f3b44e", negative: "#ef765f" };

export function SentimentChart({ analysis }: { analysis: AnalysisResult }) {
  return <Doughnut data={{ labels: ["Positive", "Neutral", "Negative"], datasets: [{ data: [analysis.sentiment.positive, analysis.sentiment.neutral, analysis.sentiment.negative], backgroundColor: [colors.positive, colors.neutral, colors.negative], borderWidth: 0 }] }} />;
}

export function TrendChart({ analysis }: { analysis: AnalysisResult }) {
  return <Line options={{ responsive: true, plugins: { legend: { labels: { color: "#d8e0dc" } } }, scales: { x: { ticks: { color: "#a8b3ad" }, stacked: true }, y: { ticks: { color: "#a8b3ad" }, stacked: true } } }} data={{ labels: analysis.trends.map((p) => p.period), datasets: [
    { label: "Positive", data: analysis.trends.map((p) => p.positive), borderColor: colors.positive, backgroundColor: colors.positive },
    { label: "Neutral", data: analysis.trends.map((p) => p.neutral), borderColor: colors.neutral, backgroundColor: colors.neutral },
    { label: "Negative", data: analysis.trends.map((p) => p.negative), borderColor: colors.negative, backgroundColor: colors.negative }
  ] }} />;
}

export function ThemeChart({ analysis, onPick }: { analysis: AnalysisResult; onPick: (theme: string) => void }) {
  return <Bar options={{ responsive: true, onClick: (_e, elements) => { const index = elements[0]?.index; if (index !== undefined) onPick(analysis.themes[index].theme); }, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#a8b3ad" } }, y: { ticks: { color: "#a8b3ad" } } } }} data={{ labels: analysis.themes.slice(0, 8).map((t) => t.theme), datasets: [{ label: "Mentions", data: analysis.themes.slice(0, 8).map((t) => t.count), backgroundColor: "#73a7f4" }] }} />;
}

export function SegmentChart({ analysis }: { analysis: AnalysisResult }) {
  const segment = analysis.segments[0];
  if (!segment) return <p className="text-sm text-zinc-400">No categorical segment columns were detected.</p>;
  return <Bar options={{ responsive: true, plugins: { legend: { labels: { color: "#d8e0dc" } } }, scales: { x: { ticks: { color: "#a8b3ad" }, stacked: true }, y: { ticks: { color: "#a8b3ad" }, stacked: true } } }} data={{ labels: segment.values.map((v) => v.value), datasets: [
    { label: "Positive", data: segment.values.map((v) => v.positive), backgroundColor: colors.positive },
    { label: "Neutral", data: segment.values.map((v) => v.neutral), backgroundColor: colors.neutral },
    { label: "Negative", data: segment.values.map((v) => v.negative), backgroundColor: colors.negative }
  ] }} />;
}
