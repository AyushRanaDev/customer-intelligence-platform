import { FieldInfo, FieldMapping, FieldType, RawRow } from "./types";

const nameHints: Record<FieldType, RegExp[]> = {
  date: [/date/i, /time/i, /created/i, /submitted/i, /month/i],
  free_text: [/feedback/i, /comment/i, /review/i, /message/i, /issue/i, /description/i, /text/i],
  categorical: [/source/i, /segment/i, /region/i, /channel/i, /plan/i, /product/i, /area/i, /type/i],
  numeric_rating: [/rating/i, /stars?/i, /nps/i, /csat/i],
  numeric_score: [/score/i, /amount/i, /value/i, /count/i],
  boolean: [/is_/i, /has_/i, /active/i, /resolved/i],
  id: [/(^|_)id$/i, /uuid/i, /ticket/i, /case/i],
  unknown: []
};

const toString = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

export function detectFields(rows: RawRow[]): FieldInfo[] {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const sampleRows = rows.slice(0, 200);

  return columns.map((name) => {
    const values = sampleRows.map((row) => row[name]).map(toString).filter(Boolean);
    const unique = new Set(values.map((value) => value.toLowerCase()));
    const avgLen = values.reduce((sum, value) => sum + value.length, 0) / Math.max(values.length, 1);
    const numeric = values.filter((value) => value !== "" && !Number.isNaN(Number(value)));
    const dates = values.filter((value) => !Number.isNaN(Date.parse(value)) && /[-/T ]|\d{4}/.test(value));
    const booleans = values.filter((value) => /^(true|false|yes|no|0|1)$/i.test(value));

    const hinted = (type: FieldType) => nameHints[type].some((pattern) => pattern.test(name));
    const scores: Partial<Record<FieldType, number>> = {};
    const add = (type: FieldType, amount: number) => (scores[type] = (scores[type] ?? 0) + amount);

    if (hinted("free_text")) add("free_text", 0.45);
    if (hinted("date")) add("date", 0.45);
    if (hinted("categorical")) add("categorical", 0.35);
    if (hinted("numeric_rating")) add("numeric_rating", 0.45);
    if (hinted("numeric_score")) add("numeric_score", 0.25);
    if (hinted("boolean")) add("boolean", 0.35);
    if (hinted("id")) add("id", 0.55);

    if (avgLen > 35) add("free_text", 0.45);
    if (dates.length / Math.max(values.length, 1) > 0.75) add("date", 0.5);
    if (numeric.length / Math.max(values.length, 1) > 0.85) {
      const nums = numeric.map(Number);
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      add(max <= 10 && min >= 0 ? "numeric_rating" : "numeric_score", 0.45);
    }
    if (booleans.length / Math.max(values.length, 1) > 0.85) add("boolean", 0.55);
    if (unique.size <= Math.max(12, values.length * 0.25) && avgLen <= 40) add("categorical", 0.35);
    if (unique.size / Math.max(values.length, 1) > 0.95 && avgLen < 50) add("id", 0.25);

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] as [FieldType, number] | undefined;
    const type = best?.[0] ?? "unknown";
    const confidence = Math.min(0.98, Math.max(0.25, best?.[1] ?? 0.25));
    return {
      name,
      type,
      confidence,
      reason: `Detected from ${hinted(type) ? "column name" : "value patterns"} and ${unique.size} unique sample values.`,
      samples: values.slice(0, 3)
    };
  });
}

export function defaultMapping(fields: FieldInfo[]): FieldMapping {
  const textColumn = fields.find((field) => field.type === "free_text")?.name ?? "";
  const dateColumn = fields.find((field) => field.type === "date")?.name;
  const ratingColumn = fields.find((field) => field.type === "numeric_rating")?.name;
  const segmentColumns = fields.filter((field) => field.type === "categorical").slice(0, 4).map((field) => field.name);
  return { textColumn, dateColumn, ratingColumn, segmentColumns };
}
