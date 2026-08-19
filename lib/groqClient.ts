import Groq from "groq-sdk";

export function getGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new Groq({ apiKey });
}

export const ANALYSIS_MODEL = "openai/gpt-oss-120b";
export const FAST_MODEL = "openai/gpt-oss-20b";

export async function createGroqCompletion(params: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  response_format?: { type: "json_object" };
  temperature?: number;
  preferredModel?: string;
}) {
  const groq = getGroq();
  if (!groq) return null;
  const models = [params.preferredModel ?? FAST_MODEL, ANALYSIS_MODEL].filter(Boolean);
  let lastError: unknown;
  for (const model of models) {
    try {
      return await groq.chat.completions.create({
        model,
        messages: params.messages,
        response_format: params.response_format,
        temperature: params.temperature ?? 0.2
      });
    } catch (error) {
      lastError = error;
    }
  }
  console.warn("Groq completion failed for all configured models.", lastError);
  return null;
}
