import { z } from "zod";

// ─── Zod schema for Claude's structured output ───────────────────────────────
// Claude (especially Haiku) sometimes returns null for optional fields instead
// of omitting them. All string fields use .nullish() + transform to coerce
// null → undefined safely. Required fields (summary, category) fall back to
// safe defaults so one bad item doesn't drop the whole digest.

const nullableStr = (schema: z.ZodString) =>
  schema.nullish().transform((v) => v ?? undefined);

export const DigestItemSchema = z.object({
  id: z.string().nullish().transform((v) => v ?? ""),

  category: z
    .enum(["shipped", "blocked", "at_risk", "needs_decision", "changed"])
    .catch("changed"), // malformed category → "changed" rather than hard-fail

  summary: z
    .string()
    .min(1)
    .max(300)
    .nullish()
    .transform((v) => v ?? "")
    .describe("One crisp sentence a COO can scan in 3 seconds"),

  detail: nullableStr(z.string().max(600)).describe(
    "Additional context — only if genuinely needed"
  ),

  owner: nullableStr(z.string()).describe(
    'Person responsible. Use "unclear" if ambiguous.'
  ),

  sourceIds: z
    .array(z.number().int().positive())
    .min(1)
    .describe("Update IDs that directly support this claim — at least one"),

  decisionOwner: nullableStr(z.string()).describe(
    "Who needs to make this decision (needs_decision only)"
  ),
});

export const DigestOutputSchema = z.object({
  items: z
    .array(DigestItemSchema)
    .min(1)
    .describe("All digest items, ordered by importance"),

  warnings: z
    .array(z.string().nullable())
    .nullish()
    .transform((v) => (v ?? []).filter((s): s is string => s !== null))
    .describe("Ambiguities, contradictions, or missing owners"),
});

export type DigestOutput = z.infer<typeof DigestOutputSchema>;
export type DigestItemOutput = z.infer<typeof DigestItemSchema>;

// ─── LLM-as-judge schema ─────────────────────────────────────────────────────

export const LLMJudgeSchema = z.object({
  faithfulness: z.number().int().min(0).max(5),
  coverage: z.number().int().min(0).max(5),
  signalToNoise: z.number().int().min(0).max(5),
  crossUpdateReasoning: z.number().int().min(0).max(5),
  rationale: z.string().nullish().transform((v) => v ?? ""),
});
