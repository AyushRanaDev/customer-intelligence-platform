import { FieldMapping, NormalizedFeedbackRecord, RawRow } from "./types";

const segmentHints = [/source/i, /platform/i, /os/i, /build/i, /version/i, /region/i, /language/i, /product/i, /channel/i, /segment/i];

function coerceText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function detectLanguage(text: string) {
  if (!text) return "";
  return /^[\x00-\x7F\s\p{P}]*$/u.test(text) ? "en" : "unknown";
}

function scoreSpam(text: string) {
  if (!text) return 1;
  const emojiOnly = /^[\p{Emoji}\p{P}\s]+$/u.test(text);
  const repeated = /(.)\1{6,}/.test(text);
  const links = (text.match(/https?:\/\//g) ?? []).length;
  let score = 0;
  if (emojiOnly) score += 0.8;
  if (repeated) score += 0.5;
  if (links > 2) score += 0.3;
  if (text.length < 4) score += 0.4;
  return Math.min(1, score);
}

function flattenRecord(value: unknown, prefix = ""): Record<string, unknown> {
  if (Array.isArray(value)) {
    return { [prefix || "items"]: value };
  }
  if (!value || typeof value !== "object") {
    return prefix ? { [prefix]: value } : {};
  }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) acc[path] = child;
    else if (child && typeof child === "object") Object.assign(acc, flattenRecord(child, path));
    else acc[path] = child;
    return acc;
  }, {});
}

function findTextArrays(row: RawRow) {
  return Object.entries(flattenRecord(row))
    .filter(([, value]) => Array.isArray(value))
    .flatMap(([path, value]) => {
      const items = value as unknown[];
      if (!items.some((item) => item && typeof item === "object")) return [];
      return [{ path, items }];
    });
}

function scoreTextField(name: string, values: unknown[]) {
  const texts = values.map(coerceText).filter(Boolean);
  const avgLength = texts.reduce((sum, text) => sum + text.length, 0) / Math.max(texts.length, 1);
  const sentenceLike = texts.filter((text) => /\s/.test(text) && /[a-z]/i.test(text)).length / Math.max(texts.length, 1);
  const nameBoost = /(feedback|body|verbatim|content|message|comment|review|description|text|subject)/i.test(name) ? 35 : 0;
  return avgLength + sentenceLike * 40 + nameBoost;
}

function scoreDateField(name: string, values: unknown[]) {
  const texts = values.map(coerceText).filter(Boolean);
  const parseable = texts.filter((text) => !Number.isNaN(Date.parse(text)) && /[-/T :]|\d{4}/.test(text)).length / Math.max(texts.length, 1);
  return parseable * 100 + (/(date|time|created|submitted|sent|updated|timestamp)/i.test(name) ? 30 : 0);
}

function scoreIdField(name: string, values: unknown[]) {
  const texts = values.map(coerceText).filter(Boolean);
  const uniqueRate = new Set(texts).size / Math.max(texts.length, 1);
  return uniqueRate * 50 + (/(^|[._-])record[_-]?id$|(^|[._-])id$|uuid|ticket|case|review|post/i.test(name) ? 60 : 0);
}

function scoreNumericField(name: string, values: unknown[]) {
  const texts = values.map(coerceText).filter(Boolean);
  const numericRate = texts.filter((text) => text !== "" && !Number.isNaN(Number(text))).length / Math.max(texts.length, 1);
  return numericRate * 80 + (/(rating|score|stars|nps|csat)/i.test(name) ? 35 : 0);
}

function inferColumns(rows: RawRow[], mapping?: Partial<FieldMapping>) {
  const flattened = rows.map((row) => flattenRecord(row));
  const columns = Array.from(new Set(flattened.flatMap((row) => Object.keys(row).filter((key) => !Array.isArray(row[key])))));
  const valuesFor = (column: string) => flattened.slice(0, 100).map((row) => row[column]);
  const bestByScore = (score: (column: string, values: unknown[]) => number) =>
    columns.map((column) => ({ column, score: score(column, valuesFor(column)) })).sort((a, b) => b.score - a.score)[0];

  const textColumn = mapping?.textColumn || bestByScore(scoreTextField)?.column || "";
  const datePick = bestByScore(scoreDateField);
  const idPick = bestByScore(scoreIdField);
  const ratingPick = bestByScore(scoreNumericField);

  return {
    textColumn,
    dateColumn: mapping?.dateColumn || (datePick && datePick.score > 60 ? datePick.column : undefined),
    idColumn: mapping?.idColumn || (idPick && idPick.score > 70 ? idPick.column : undefined),
    ratingColumn: mapping?.ratingColumn || (ratingPick && ratingPick.score > 70 ? ratingPick.column : undefined)
  };
}

function deriveSegments(flatRow: Record<string, unknown>, excluded: string[]) {
  return Object.fromEntries(
    Object.entries(flatRow)
      .filter(([key, value]) => !excluded.includes(key) && !Array.isArray(value) && value !== null && value !== "")
      .filter(([key, value]) => {
        const text = coerceText(value);
        return text.length > 0 && text.length <= 80 && (segmentHints.some((pattern) => pattern.test(key)) || Number.isNaN(Number(text)));
      })
      .slice(0, 8)
      .map(([key, value]) => [key, coerceText(value)])
  );
}

export function normalizeRows(rows: RawRow[], sourceFile: string, mapping?: Partial<FieldMapping>): NormalizedFeedbackRecord[] {
  const inferred = inferColumns(rows, mapping);
  const { textColumn, dateColumn, idColumn, ratingColumn } = inferred;
  const sourceType = sourceFile.replace(/\.(csv|json|jsonl|xlsx|xls)$/i, "");

  return rows
    .flatMap((row, index) => {
      const flatRow = flattenRecord(row);
      const textArrays = findTextArrays(row)
        .map((group) => ({
          ...group,
          textKey: Array.from(new Set(group.items.flatMap((item) => Object.keys(flattenRecord(item))))).sort((a, b) => {
            const bScore = scoreTextField(b, group.items.map((item) => flattenRecord(item)[b]));
            const aScore = scoreTextField(a, group.items.map((item) => flattenRecord(item)[a]));
            return bScore - aScore;
          })[0]
        }))
        .filter((group) => group.textKey);

      if (textArrays.length) {
        const group = textArrays[0];
        return group.items.map((item, messageIndex) => {
          const flatItem = flattenRecord(item);
          const itemDate = Object.keys(flatItem).sort((a, b) => scoreDateField(b, [flatItem[b]]) - scoreDateField(a, [flatItem[a]]))[0];
          const feedbackText = coerceText(flatItem[group.textKey]);
          const spamScore = scoreSpam(feedbackText);
          return {
          record_id: coerceText(flatRow[idColumn ?? "record_id"] ?? `${sourceType}-${index}-${messageIndex}`),
          source_file: sourceFile,
          source_type: sourceType,
          submitted_at: coerceText(flatItem[itemDate] ?? flatRow[dateColumn ?? ""] ?? ""),
          feedback_text: feedbackText,
          subject: coerceText(flatRow.subject ?? flatRow.topic ?? ""),
          rating: Number(flatRow[ratingColumn ?? ""]) || undefined,
          score: Number(flatRow.score ?? flatRow.nps ?? flatRow.csat) || undefined,
          language: coerceText(flatRow.language ?? detectLanguage(feedbackText)),
          spamScore,
          isLikelySpam: spamScore >= 0.7,
          isNonEnglish: detectLanguage(feedbackText) !== "en",
          segments: { ...deriveSegments(flatRow, [textColumn, dateColumn ?? "", idColumn ?? "", ratingColumn ?? ""]), ...deriveSegments(flatItem, [group.textKey, itemDate]) },
          raw: { ...row, nested_path: group.path, nested_text: feedbackText }
          };
        });
      }

      const feedbackText = coerceText(flatRow[textColumn]);
      const spamScore = scoreSpam(feedbackText);
      return [{
        record_id: coerceText(flatRow[idColumn ?? "record_id"] ?? `${sourceType}-${index}`),
        source_file: sourceFile,
        source_type: sourceType,
        submitted_at: coerceText(flatRow[dateColumn ?? ""] ?? ""),
        feedback_text: feedbackText,
        subject: coerceText(flatRow.subject ?? ""),
        rating: Number(flatRow[ratingColumn ?? ""]) || undefined,
        score: Number(flatRow.score ?? flatRow.nps ?? flatRow.csat) || undefined,
        language: coerceText(flatRow.language ?? detectLanguage(feedbackText)),
        spamScore,
        isLikelySpam: spamScore >= 0.7,
        isNonEnglish: detectLanguage(feedbackText) !== "en",
        segments: deriveSegments(flatRow, [textColumn, dateColumn ?? "", idColumn ?? "", ratingColumn ?? ""]),
        raw: flatRow as RawRow
      }];
    })
    .filter((row) => row.feedback_text.length > 0);
}

export function mergeNormalizedRecords(records: NormalizedFeedbackRecord[]) {
  const rows: RawRow[] = records.map((record) => ({
    record_id: record.record_id,
    source_file: record.source_file,
    source_type: record.source_type,
    submitted_at: record.submitted_at ?? null,
    feedback_text: record.feedback_text,
    subject: record.subject ?? null,
    rating: record.rating ?? null,
    score: record.score ?? null,
    language: record.language ?? null,
    isLikelySpam: record.isLikelySpam,
    isNonEnglish: record.isNonEnglish,
    ...record.segments
  }));
  const mapping: FieldMapping = {
    idColumn: "record_id",
    textColumn: "feedback_text",
    dateColumn: "submitted_at",
    ratingColumn: "rating",
    segmentColumns: Array.from(new Set(records.flatMap((record) => Object.keys(record.segments)).concat(["source_type", "source_file", "language"]))).slice(0, 8)
  };
  return { rows, mapping };
}
