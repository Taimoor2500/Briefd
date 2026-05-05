import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { DigestOutput, DigestOutputSchema, LLMJudgeSchema } from "./schemas";
import {
  SYSTEM_PROMPT,
  PROMPT_VERSION,
  buildUserPrompt,
  buildDiffPrompt,
  buildJudgePrompt,
} from "./prompts";
import { validateSourceIds } from "./parser";
import { Digest, StandupUpdate, LLMJudgeResult } from "@/types";

// ─── Client singleton ─────────────────────────────────────────────────────────
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

// Model — haiku for speed/cost; easy to swap to sonnet for quality
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
const MAX_TOKENS = 4096;

// ─── Core generation ──────────────────────────────────────────────────────────
export async function generateDigest(
  updates: StandupUpdate[],
  previousDigest?: Digest
): Promise<{
  output: DigestOutput;
  inputTokens: number;
  outputTokens: number;
  model: string;
}> {
  const client = getClient();
  const userPrompt = previousDigest
    ? buildDiffPrompt(previousDigest, updates)
    : buildUserPrompt(updates);

  const t0 = Date.now();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawContent = response.content[0];
  if (rawContent.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const rawText = rawContent.text.trim();

  // Extract JSON robustly — find the outermost { ... } block regardless of
  // any prose or markdown fences Claude may have added around it.
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `Claude returned non-JSON response. First 200 chars: ${rawText.slice(0, 200)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(
      `Claude returned non-JSON response. First 200 chars: ${rawText.slice(0, 200)}`
    );
  }

  // Zod validation — this is our faithfulness schema gate
  const result = DigestOutputSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `[${i.path.join(".")}] ${i.message}`)
      .join("; ");
    throw new Error(`Schema validation failed: ${detail}`);
  }

  const output = result.data;

  // Post-hoc sourceId validation — every cited ID must exist
  const allSourceIds = output.items.flatMap((item) => item.sourceIds);
  const { invalid } = validateSourceIds(allSourceIds, updates);
  if (invalid.length > 0) {
    output.warnings.push(
      `Faithfulness warning: cited update IDs that don't exist: ${invalid.join(", ")}. Those items may be hallucinated.`
    );
    // Remove items where ALL sourceIds are invalid (likely hallucinated)
    const validIds = new Set(updates.map((u) => u.id));
    output.items = output.items.filter((item) =>
      item.sourceIds.some((id) => validIds.has(id))
    );
  }

  // Ensure all items have stable UUIDs
  output.items = output.items.map((item) => ({
    ...item,
    id: item.id && item.id.length > 0 ? item.id : uuidv4(),
  }));

  console.log(
    `[claude] Generated digest in ${Date.now() - t0}ms | ${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens`
  );

  return {
    output,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model: MODEL,
  };
}

// ─── LLM-as-judge eval ────────────────────────────────────────────────────────
export async function judgeDigest(
  digest: Digest
): Promise<LLMJudgeResult> {
  const client = getClient();
  const judgePrompt = buildJudgePrompt(digest, digest.rawUpdates);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: judgePrompt }],
  });

  const rawContent = response.content[0];
  if (rawContent.type !== "text") throw new Error("Bad judge response");

  const judgeMatch = rawContent.text.match(/\{[\s\S]*\}/);
  if (!judgeMatch) throw new Error("Judge returned non-JSON");

  let parsed: unknown;
  try {
    parsed = JSON.parse(judgeMatch[0]);
  } catch {
    throw new Error("Judge returned non-JSON");
  }

  const result = LLMJudgeSchema.safeParse(parsed);
  if (!result.success) throw new Error("Judge schema validation failed");
  return result.data;
}

export { PROMPT_VERSION };
