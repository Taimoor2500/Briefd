import { StandupUpdate, Digest } from "@/types";

export const PROMPT_VERSION = "v1.2";


export const SYSTEM_PROMPT = `You are a senior engineering operations analyst. Your job is to synthesise raw, unstructured team standup updates into a precise executive digest.

## Your reader
A busy COO who will spend 90 seconds on this digest. They want facts, not atmosphere.

## Output rules — READ CAREFULLY

1. **Only state what is in the source updates.** If a fact is not explicitly or clearly implied by at least one update, do not assert it.
2. **Cite every claim.** Each item must include sourceIds: the update number(s) that directly support it.
3. **Handle evolution correctly.** If a situation changed across multiple updates (e.g. a blocker that was later unblocked), reflect the current state and cite all relevant updates.
4. **Handle contradictions explicitly.** If two updates conflict, surface the conflict rather than silently picking one.
5. **Ambiguous ownership.** If you cannot confidently assign an owner from the source, set owner to "unclear" — never guess.
6. **Signal over noise.** A terse "all good" is not worth a digest item unless it follows a previous concern. A voice note full of filler should be summarised to its factual core.
7. **Category definitions:**
   - shipped: something completed and deployed or delivered
   - blocked: someone cannot progress without external action
   - at_risk: something may slip, degrade, or fail — not yet blocked but heading there
   - needs_decision: a choice or approval is required before work can continue, and it is not clear who will make it
   - changed: an earlier status has materially changed (resolved, reversed, or escalated)

## Faithfulness guardrail
Before including any claim, ask: "Which specific update number(s) contain this information?" If you cannot name one, drop the claim. You will be scored on this.

## Format
Return valid JSON only — no prose, no markdown fences, no explanation outside the JSON. Schema:
{
  "items": [
    {
      "id": "<uuid-v4>",
      "category": "shipped|blocked|at_risk|needs_decision|changed",
      "summary": "<one tight sentence>",
      "detail": "<optional, only if genuinely useful>",
      "owner": "<name or 'unclear'>",
      "sourceIds": [<int>, ...],
      "decisionOwner": "<name or 'unclear' — only for needs_decision>"
    }
  ],
  "warnings": ["<any contradictions, missing owners, or ambiguities worth flagging>"]
}`;

export function buildUserPrompt(updates: StandupUpdate[]): string {
  const weeks = new Set(updates.map((u) => u.week).filter((w) => w != null));
  const hasMultipleWeeks = weeks.size > 1;

  const formatted = updates
    .map(
      (u) =>
        `[${u.id}] ${u.author} · ${hasMultipleWeeks && u.week != null ? `Week ${u.week} ` : ""}${u.day}\n${u.text}`
    )
    .join("\n\n");

  return `Here are ${updates.length} standup updates. Generate the digest.\n\n${formatted}`;
}

export function buildDiffPrompt(
  previousDigest: Digest,
  newUpdates: StandupUpdate[]
): string {
  const prevItems = previousDigest.items
    .map(
      (item) =>
        `[PREV-${item.id.slice(0, 8)}] ${item.category.toUpperCase()}: ${item.summary} (sources: ${item.sourceIds.join(", ")})`
    )
    .join("\n");

  const newWeeks = new Set(newUpdates.map((u) => u.week).filter((w) => w != null));
  const newHasMultipleWeeks = newWeeks.size > 1;

  const newUpdatesFormatted = newUpdates
    .map(
      (u) =>
        `[${u.id}] ${u.author} · ${newHasMultipleWeeks && u.week != null ? `Week ${u.week} ` : ""}${u.day}\n${u.text}`
    )
    .join("\n\n");

  return `You are comparing a PREVIOUS digest against NEW standup updates.

PREVIOUS DIGEST ITEMS:
${prevItems}

NEW STANDUP UPDATES:
${newUpdatesFormatted}

Generate a digest from the NEW updates only, following the same rules as always.
Additionally, for each item you generate, consider whether it:
- Is completely new (not present in previous digest)
- Resolves something from the previous digest
- Changes (escalates or reverses) something from the previous digest
- Is still open from the previous digest

Include this assessment in the "detail" field where relevant, e.g. "Previously blocked on X — now resolved." or "Escalation from at_risk: now fully blocked."`;
}

export function buildJudgePrompt(
  digest: { items: Array<{ category: string; summary: string; sourceIds: number[] }> },
  sourceUpdates: StandupUpdate[]
): string {
  const digestFormatted = digest.items
    .map(
      (item) =>
        `[${item.category.toUpperCase()}] ${item.summary} (cites updates: ${item.sourceIds.join(", ")})`
    )
    .join("\n");

  const sourcesFormatted = sourceUpdates
    .map((u) => `[${u.id}] ${u.author} · ${u.day}: ${u.text}`)
    .join("\n\n");

  return `You are an evaluator assessing the quality of an AI-generated standup digest.

SOURCE UPDATES:
${sourcesFormatted}

GENERATED DIGEST:
${digestFormatted}

Score the digest on these dimensions (0–5 each):
- faithfulness: Does every claim trace to the source? (0=hallucinations, 5=fully grounded)
- coverage: Are all important signals captured? (0=key facts missing, 5=complete)
- signalToNoise: Is the digest tight? (0=padded, 5=every word earns its place)
- crossUpdateReasoning: Does it connect dots across updates? (0=treats each update in isolation, 5=surfaces cross-update patterns)

Return JSON only:
{
  "faithfulness": <0-5>,
  "coverage": <0-5>,
  "signalToNoise": <0-5>,
  "crossUpdateReasoning": <0-5>,
  "rationale": "<1-3 sentence explanation>"
}`;
}
