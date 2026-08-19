"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { detectFields, defaultMapping } from "@/lib/fieldDetection";
import { AnalysisResult, ChatStructuredAnswer, FieldInfo, FieldMapping, FieldType, RawRow } from "@/lib/types";
import { mergeNormalizedRecords, normalizeRows } from "@/lib/normalization";
import { SegmentChart, SentimentChart, ThemeChart, TrendChart } from "@/components/Charts";

const fieldTypes: FieldType[] = ["date", "free_text", "categorical", "numeric_rating", "numeric_score", "boolean", "id", "unknown"];
const stakeholders = ["Everything", "Product", "Engineering", "Support", "Leadership"] as const;
type StakeholderFilter = (typeof stakeholders)[number];
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  structured?: ChatStructuredAnswer;
};

function updateFieldType(fields: FieldInfo[], name: string, type: FieldType) {
  return fields.map((item) => item.name === name ? { ...item, type } : item);
}

async function parseFile(file: File): Promise<RawRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    return new Promise((resolve, reject) => Papa.parse<RawRow>(file, { header: true, skipEmptyLines: true, complete: (r) => resolve(r.data), error: reject }));
  }
  if (ext === "jsonl") {
    return (await file.text())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RawRow);
  }
  if (ext === "json") {
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.data) ? parsed.data : [];
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  return XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[workbook.SheetNames[0]], { defval: null });
}

export default function Home() {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({ textColumn: "", segmentColumns: [] });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState("Upload a feedback file to begin.");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<StakeholderFilter>("Everything");
  const [themeFilter, setThemeFilter] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [loadedFiles, setLoadedFiles] = useState<string[]>([]);
  const dropRef = useRef<HTMLInputElement>(null);

  const visibleRecommendations = useMemo(
    () => analysis?.recommendations.filter((rec) => filter === "Everything" || rec.stakeholder === filter) ?? [],
    [analysis, filter]
  );
  const visibleThemeNames = useMemo(
    () => new Set(filter === "Everything" ? analysis?.themes.map((theme) => theme.theme) ?? [] : visibleRecommendations.map((rec) => rec.theme)),
    [analysis, filter, visibleRecommendations]
  );
  const visibleThemes = useMemo(
    () => analysis?.themes.filter((theme) => visibleThemeNames.has(theme.theme)) ?? [],
    [analysis, visibleThemeNames]
  );
  const visibleConflicts = useMemo(
    () => analysis?.conflicts.filter((theme) => visibleThemeNames.has(theme.theme)) ?? [],
    [analysis, visibleThemeNames]
  );
  const visibleSegments = useMemo(
    () =>
      analysis?.segments.map((segment) => ({
        ...segment,
        values: segment.values.filter((value) => filter === "Everything" || visibleThemes.some((theme) => theme.theme === value.topTheme))
      })) ?? [],
    [analysis, filter, visibleThemes]
  );
  const excerpts = useMemo(() => {
    if (!analysis || !themeFilter) return [];
    const matching = analysis.rowAnalyses
      .filter((row) => row.theme.toLowerCase() === themeFilter.toLowerCase())
      .filter((row) => filter === "Everything" || visibleThemeNames.has(row.theme))
      .slice(0, 6);
    return matching.map((item) => rows[item.rowIndex]?.[mapping.textColumn]).filter(Boolean).map(String);
  }, [analysis, filter, mapping.textColumn, rows, themeFilter, visibleThemeNames]);

  async function loadFiles(inputFiles: FileList | File[]) {
    try {
      setError("");
      const files = Array.from(inputFiles);
      setStatus(`Parsing ${files.length} file${files.length === 1 ? "" : "s"} and normalizing records...`);
      const parsedGroups = await Promise.all(files.map(async (file) => ({ file, rows: await parseFile(file) })));
      const normalized = parsedGroups.flatMap(({ file, rows: parsedRows }) => normalizeRows(parsedRows, file.name));
      if (!normalized.length) throw new Error("No usable feedback rows were found in the uploaded files.");
      const merged = mergeNormalizedRecords(normalized);
      const detected = detectFields(merged.rows);
      setRows(merged.rows);
      setFields(detected);
      setMapping({ ...defaultMapping(detected), ...merged.mapping });
      setAnalysis(null);
      setMessages([]);
      setFilter("Everything");
      setThemeFilter("");
      setLoadedFiles(files.map((file) => file.name));
      setStatus(`Normalized ${normalized.length} records from ${files.length} file${files.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse that file.");
    }
  }

  async function trySample() {
    const blob = await fetch("/sample-feedback.csv").then((r) => r.blob());
    await loadFiles([new File([blob], "sample-feedback.csv", { type: "text/csv" })]);
  }

  async function analyze() {
    try {
      const finalMapping = {
        ...mapping,
        segmentColumns: mapping.segmentColumns.filter((column) => fields.some((field) => field.name === column && field.type === "categorical"))
      };
      if (!finalMapping.textColumn) throw new Error("Choose a free-text feedback column before running analysis.");
      setError("");
      setIsAnalyzing(true);
      setStatus("Running batched AI analysis. This can take a bit on the free Groq tier.");
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, mapping: finalMapping }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Analysis failed.");
      setAnalysis(json);
      setStatus(`Analysis complete across ${json.sourceCount} source group${json.sourceCount === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function sendMessage() {
    if (!question.trim() || !analysis) return;
    const next = [...messages, { role: "user" as const, content: question.trim() }];
    setMessages([...next, { role: "assistant", content: "Thinking..." }]);
    setQuestion("");
    setIsChatting(true);
      setStatus("Asking Groq 20B about your uploaded data, with local fallback if the free tier blocks the request...");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, analysisContext: analysis, rows, mapping }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Chat failed.");
      const structured = json as ChatStructuredAnswer;
      setMessages([...next, { role: "assistant", content: structured.directAnswer, structured }]);
      setStatus("Answer ready.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Chat failed.";
      setMessages([...next, { role: "assistant", content: message }]);
      setError(message);
    } finally {
      setIsChatting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0f1214] text-zinc-100">
      <section className="border-b border-white/10 bg-[#14181b]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Customer Intelligence & Decision Platform</h1>
            <p className="mt-1 text-sm text-zinc-400">{status}</p>
          </div>
          <button onClick={trySample} className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-ink">Try sample data</button>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <div onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void loadFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()} className="rounded-lg border border-dashed border-zinc-600 bg-[#171b1f] p-5">
            <input ref={dropRef} hidden multiple type="file" accept=".csv,.xlsx,.xls,.json,.jsonl" onChange={(e) => e.target.files?.length && void loadFiles(e.target.files)} />
            <p className="text-sm text-zinc-300">Drop one or many CSV, Excel, JSON, or JSONL feedback files here.</p>
            <button onClick={() => dropRef.current?.click()} className="mt-4 rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-ink">Choose file</button>
          </div>
          {loadedFiles.length > 0 && <div className="rounded-lg border border-white/10 bg-[#171b1f] p-4 text-sm text-zinc-300">
            <p className="font-semibold text-zinc-100">Loaded sources</p>
            <div className="mt-3 space-y-1">{loadedFiles.map((file) => <p key={file}>{file}</p>)}</div>
          </div>}

          {fields.length > 0 && <div className="rounded-lg border border-white/10 bg-[#171b1f] p-4">
            <h2 className="font-semibold">Detected Fields</h2>
            <div className="mt-3 space-y-3">
              {fields.map((field) => <label key={field.name} className="block rounded-md bg-black/20 p-3 text-sm">
                <span className="block font-medium">{field.name}</span>
                <span className="block text-xs text-zinc-400">{field.reason}</span>
                <select value={field.type} onChange={(e) => {
                  const type = e.target.value as FieldType;
                  setFields((current) => updateFieldType(current, field.name, type));
                  if (type === "free_text") setMapping((current) => ({ ...current, textColumn: field.name }));
                  if (type === "date") setMapping((current) => ({ ...current, dateColumn: field.name }));
                  if (type !== "categorical") setMapping((current) => ({ ...current, segmentColumns: current.segmentColumns.filter((column) => column !== field.name) }));
                }} className="mt-2 w-full rounded-md border border-white/10 bg-[#101418] p-2">
                  {fieldTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>)}
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <select value={mapping.textColumn} onChange={(e) => setMapping({ ...mapping, textColumn: e.target.value })} className="w-full rounded-md bg-[#101418] p-2"><option value="">Feedback text column</option>{fields.map((f) => <option key={f.name}>{f.name}</option>)}</select>
              <select value={mapping.dateColumn ?? ""} onChange={(e) => setMapping({ ...mapping, dateColumn: e.target.value || undefined })} className="w-full rounded-md bg-[#101418] p-2"><option value="">Date column optional</option>{fields.map((f) => <option key={f.name}>{f.name}</option>)}</select>
              <div className="rounded-md bg-black/20 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Segment columns</p>
                {fields.filter((field) => field.type === "categorical").map((field) => <label key={field.name} className="mb-2 flex items-center gap-2">
                  <input type="checkbox" checked={mapping.segmentColumns.includes(field.name)} onChange={(e) => setMapping((current) => ({ ...current, segmentColumns: e.target.checked ? [...current.segmentColumns, field.name] : current.segmentColumns.filter((column) => column !== field.name) }))} />
                  <span>{field.name}</span>
                </label>)}
                {fields.every((field) => field.type !== "categorical") && <p className="text-xs text-zinc-500">Mark a field as categorical to enable segment breakdowns.</p>}
              </div>
              <button onClick={analyze} disabled={!mapping.textColumn || isAnalyzing} className="w-full rounded-md bg-coral px-4 py-2 font-semibold text-white disabled:opacity-40">{isAnalyzing ? "Analyzing..." : "Run analysis"}</button>
            </div>
          </div>}
          {error && <p className="rounded-md border border-red-400/40 bg-red-950/50 p-3 text-sm text-red-100">{error}</p>}
        </aside>

        <section className="space-y-6">
          {!analysis && <div className="rounded-lg border border-white/10 bg-[#171b1f] p-10 text-center text-zinc-400">Upload data, confirm fields, then run analysis.</div>}
          {analysis && <>
            <div className="flex flex-wrap gap-2">{stakeholders.map((item) => <button key={item} onClick={() => { setFilter(item); setThemeFilter(""); }} className={`rounded-md px-3 py-2 text-sm ${filter === item ? "bg-mint text-ink" : "bg-[#20262b] text-zinc-300"}`}>{item}</button>)}</div>
            {analysis.notices.map((notice) => <p key={notice} className="rounded-md bg-amber/10 p-3 text-sm text-amber">{notice}</p>)}
            {isAnalyzing && <p className="rounded-md border border-sky-400/30 bg-sky-950/40 p-3 text-sm text-sky-100">Analysis is running on the backend. On the Groq free tier, batched requests can take a while.</p>}
            <div className="grid gap-4 md:grid-cols-4">
              {[["Rows", analysis.totalRows], ["Sources", analysis.sourceCount], ["Themes", visibleThemes.length], ["Urgent", visibleThemes.filter((t) => t.urgency === "High").length]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#171b1f] p-4"><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="Sentiment Distribution"><SentimentChart analysis={analysis} /></Panel>
              <Panel title="Top Themes"><ThemeChart analysis={{ ...analysis, themes: visibleThemes }} onPick={setThemeFilter} /></Panel>
              <Panel title="Sentiment Trend">{analysis.trends.length ? <TrendChart analysis={analysis} /> : <p className="text-sm text-zinc-400">No date column was selected, so time-series charts are skipped.</p>}</Panel>
              <Panel title="Segment Breakdown"><SegmentChart analysis={{ ...analysis, segments: visibleSegments }} /></Panel>
            </div>
            <Panel title="Conflicting Opinions">{visibleConflicts.length ? visibleConflicts.map((t) => <p key={t.theme} className="border-b border-white/10 py-2 text-sm">{t.theme}: {t.positive} positive vs {t.negative} negative mentions</p>) : <p className="text-sm text-zinc-400">No strongly split themes detected for this stakeholder view.</p>}</Panel>
            <Panel title="Recommendations">{visibleRecommendations.length ? visibleRecommendations.map((rec) => <div key={rec.title} className="mb-3 rounded-md bg-black/20 p-3"><p className="font-semibold">{rec.title} <span className="text-xs text-mint">{rec.stakeholder}</span></p><p className="text-sm text-zinc-300">{rec.action}</p><p className="mt-1 text-xs text-zinc-500">{rec.evidence}</p></div>) : <p className="text-sm text-zinc-400">No stakeholder-specific recommendations are available for this view yet.</p>}</Panel>
            <Panel title="Ingested Sources">{analysis.sources.map((source) => <p key={source.source} className="border-b border-white/10 py-2 text-sm text-zinc-300">{source.source}: {source.count} records</p>)}</Panel>
            {excerpts.length > 0 && <Panel title={`Feedback Excerpts: ${themeFilter}`}>{excerpts.map((text, i) => <p key={i} className="border-b border-white/10 py-2 text-sm text-zinc-300">{text}</p>)}</Panel>}
            <Panel title="Ask The Data">
              <div className="max-h-80 space-y-3 overflow-auto">{messages.map((message, i) => <div key={i} className={`rounded-md p-3 text-sm ${message.role === "user" ? "bg-mint/20" : "bg-black/25"}`}>
                {message.structured ? <>
                  <p className="font-semibold">{message.structured.headline}</p>
                  <p className="mt-2">{message.structured.directAnswer}</p>
                  {message.structured.evidence.length > 0 && <div className="mt-3 space-y-1 text-zinc-300">{message.structured.evidence.map((item, index) => <p key={index}>- {item}</p>)}</div>}
                  {message.structured.suggestedFollowUps.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{message.structured.suggestedFollowUps.map((item) => <button key={item} onClick={() => setQuestion(item)} className="rounded-md bg-white/10 px-2 py-1 text-xs text-zinc-200">{item}</button>)}</div>}
                </> : <p>{message.content}</p>}
              </div>)}</div>
              {isChatting && <p className="mt-3 text-sm text-zinc-400">Fetching a grounded answer with Groq 20B first. If Groq is unavailable or rate-limited, the assistant will still answer from the analyzed dataset.</p>}
              <div className="mt-3 flex gap-2"><input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void sendMessage()} placeholder="What are customers unhappy about?" className="min-w-0 flex-1 rounded-md bg-[#101418] p-3 text-sm outline-none" /><button disabled={isChatting || !question.trim()} onClick={sendMessage} className="rounded-md bg-zinc-100 px-4 text-sm font-semibold text-ink disabled:opacity-40">Send</button></div>
            </Panel>
          </>}
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-white/10 bg-[#171b1f] p-5"><h2 className="mb-4 font-semibold">{title}</h2>{children}</div>;
}
