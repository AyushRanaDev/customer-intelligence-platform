export type FieldType =
  | "date"
  | "free_text"
  | "categorical"
  | "numeric_rating"
  | "numeric_score"
  | "boolean"
  | "id"
  | "unknown";

export type RawValue = string | number | boolean | null | RawValue[] | { [key: string]: RawValue };
export type RawRow = Record<string, RawValue>;

export type NormalizedFeedbackRecord = {
  record_id: string;
  source_file: string;
  source_type: string;
  submitted_at?: string;
  feedback_text: string;
  subject?: string;
  rating?: number;
  score?: number;
  language?: string;
  spamScore?: number;
  isLikelySpam: boolean;
  isNonEnglish: boolean;
  segments: Record<string, string>;
  raw: RawRow;
};

export type FieldInfo = {
  name: string;
  type: FieldType;
  confidence: number;
  reason: string;
  samples: string[];
};

export type FieldMapping = {
  idColumn?: string;
  textColumn: string;
  dateColumn?: string;
  segmentColumns: string[];
  ratingColumn?: string;
};

export type Sentiment = "Positive" | "Neutral" | "Negative";

export type RowAnalysis = {
  rowIndex: number;
  recordId?: string;
  source?: string;
  sentiment: Sentiment;
  theme: string;
  urgency: "Low" | "Medium" | "High";
  summary: string;
};

export type ThemeSummary = {
  theme: string;
  count: number;
  positive: number;
  neutral: number;
  negative: number;
  negativeRate: number;
  urgency: "Low" | "Medium" | "High";
  examples: string[];
  recordIds: string[];
};

export type TrendPoint = {
  period: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
};

export type SegmentSummary = {
  column: string;
  values: {
    value: string;
    positive: number;
    neutral: number;
    negative: number;
    total: number;
    topTheme: string;
  }[];
};

export type SourceSummary = {
  source: string;
  count: number;
  textField: string;
};

export type Recommendation = {
  title: string;
  stakeholder: "Product" | "Engineering" | "Support" | "Leadership";
  priority: "Low" | "Medium" | "High";
  action: string;
  evidence: string;
  theme: string;
};

export type AnalysisResult = {
  totalRows: number;
  sampledRows: number;
  sourceCount: number;
  sources: SourceSummary[];
  sentiment: { positive: number; neutral: number; negative: number };
  themes: ThemeSummary[];
  conflicts: ThemeSummary[];
  trends: TrendPoint[];
  segments: SegmentSummary[];
  rowAnalyses: RowAnalysis[];
  recommendations: Recommendation[];
  notices: string[];
};

export type ChatStructuredAnswer = {
  headline: string;
  directAnswer: string;
  evidence: string[];
  suggestedFollowUps: string[];
};
