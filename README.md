# Standup Digest

Turn raw, messy team standup updates into a clean executive digest. Built for the Algorithm take-home assessment.

**Stack:** Next.js 14 · TypeScript · Tailwind CSS · Anthropic Claude API · Vercel

---

## Quick start

```bash
cp .env.local.example .env.local
# add your ANTHROPIC_API_KEY to .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste updates, click Generate. Or click "Load sample data" to try it immediately.

---

## The 9 README questions

### 1. What did you decide to build, and what did you cut?

**Built:** A single-page tool where you paste raw standup text (any format — Slack walls, voice-note transcripts, terse two-liners) and get a structured digest organised into five categories: Shipped, Blocked, At Risk, Needs Decision, Changed. Every claim cites the specific update number(s) it came from via clickable source badges. A "compare against previous" mode highlights what's new, resolved, changed, or still open. An eval harness (structural checks + sample data regression checks + LLM-as-judge) runs against any digest on demand. A "Copy for Slack" and "Copy for Email" export button on every digest. Input is fingerprinted on every generation — if the same raw text is submitted again, the existing digest is served instantly from local cache at zero API cost. Both API routes are rate-limited per IP (10 generations/min, 20 evals/min) to prevent runaway costs.

**Cut:**
- **Database / persistence layer.** Digests live in localStorage. A real deployment would want server-side storage (Postgres via Supabase would take ~30 minutes to wire up), but localStorage covers the demo perfectly and avoids auth entirely as required.
- **Per-person digest view (stretch goal).** Considered it; skipped because the core eval wasn't solid enough yet to justify adding surface area. The data model already supports filtering by `owner` — it's a one-tab addition.
- **Streaming responses.** The haiku model responds fast enough (~2–4s) that streaming isn't necessary. Sonnet would benefit from it.
- **Confidence scoring per item.** Interesting idea, but I couldn't find a principled way to compute it without a second AI call. It would also invite over-reliance on a number that isn't well-calibrated.

**Rejected approach:** I considered a multi-step pipeline (parse → extract entities → classify → summarise) rather than a single prompt. Rejected because a well-constrained single prompt is easier to debug, cheaper, and the classification step adds latency without meaningfully improving faithfulness. The Zod schema + post-hoc sourceId verification gives us most of the reliability benefit without the complexity.

---

### 2. Where is the AI in the system, and why there?

AI is in exactly one place: `lib/claude.ts → generateDigest()`. A single call with a structured output schema.

**Why one call, not a pipeline?** The brief is fundamentally a summarisation + reasoning task. Multi-step pipelines shine when you need to iteratively refine or when different steps have different latency/cost profiles. Here, the bottleneck is understanding *cross-update context* — which requires seeing all updates at once. Breaking it into parse → classify → summarise would fragment context and likely hurt the cross-update reasoning the brief explicitly tests.

**Faithfulness happens at the boundary, not inside the model.** The AI's output is immediately validated by Zod (schema enforcement) and then re-verified with `validateSourceIds()` (every cited ID must exist in the input set). Items citing non-existent updates are dropped before the response leaves the server.

**The eval call is a second AI use**, but deliberately optional and isolated — it's a judge, not a generator, and failing it gracefully doesn't break the core flow.

---

### 3. One thing the tool does worse than a careful human

**Context the model doesn't have.** A careful human analyst would know that "the OTP provider" refers to the same underlying vendor Sara mentioned three days ago, and would know that "the invoice ticket" is the same one Ahmed picked up after finishing payments. The model reasons entirely from the text it receives — if a reference is ambiguous, it says so (correctly), but a human would resolve it with 30 seconds of Jira context.

**Why I accepted this:** The brief says to build a digest from the updates themselves, not from external systems. The model's "owner unclear" and "decision pending" outputs are actually the correct, honest answer given limited information — better than a confident wrong answer.

---

### 4. Who is your reader?

**The reader is a COO or VP who has ~90 seconds and wants to know if anything is on fire, who is blocked, and what needs their decision.** They know the team names but not the ticket names. They don't want to decode jargon or read chronological play-by-plays.

**Assumptions:** They can recognise names but not system acronyms without context. They scan, they don't read. They want the current state, not the history.

**Specific output choice:** The "Needs a Decision" section appears first in the rendered digest, before Blocked or Shipped. An executive seeing this on their phone at 8am should see what requires their action before they see what shipped. I ordered sections by urgency (decision → blocked → at_risk → shipped → changed), not alphabetically.

---

### 5. One concrete thing the AI got wrong during development

**The OTP reversal (updates 9, 15, 21).** In early testing, the model correctly noted Sara's slip (update 15: "onboarding launch will slip by 2-3 days") and Sara's resolution (update 21: "back on the original date"). But when both were present, it sometimes generated *two* items: one `at_risk` about the OTP issues, and one `changed` about the resolution — with the `at_risk` item appearing higher and implying it was still happening.

**Diagnosis:** The model was being literal — both facts are true, and it was hedging rather than synthesising. The prompt said "reflect the current state" but didn't explicitly say "a resolved situation should not appear as an active risk."

**Fix:** Added a specific rule to the system prompt: *"If a situation changed across multiple updates (e.g. a blocker that was later unblocked), reflect the current state and cite all relevant updates."* Also added a sample data regression check (`golden_otp_reversal`) that specifically tests for this failure mode, making it visible in the eval harness rather than requiring manual review.

---

### 6. How did you measure whether the digest is good?

Three layers, in `lib/eval.ts`:

**Layer 1 — Structural checks (always run, no AI):**
- Every `sourceId` references a real input update
- Every item has at least one sourceId
- No empty summaries; all category values are valid
- Adequate item count for the update volume

**Layer 2 — Sample data regression checks:**
Five hard facts a correct digest *must* capture from the 25-update sample. These are regression checks against a known fixture — they only fire when the sample data is loaded (detected via content fingerprint, not update count), so they never produce false failures on fresh input.
1. Faraz's hidden auth bug (most buried, highest-signal update)
2. Sara's OTP reversal handled correctly (no stale "slip" claim)
3. Arabic support ambiguity flagged (cross-update: updates 20 + 25)
4. Client deal / Tabasum verbal yes mentioned
5. Data export scope conflict (Omar vs Tayba, estimate blown)

**Layer 3 — LLM-as-judge (optional):** Scores 0–5 on faithfulness, coverage, signal-to-noise, and cross-update reasoning. Advisory; structural checks are the gate. When fresh data is used, layers 1 and 3 both run — layer 2 stays silent because its assertions are specific to the sample fixture.

**What slips past it:** Subtle tone errors, incorrect prioritisation within a category, and any facts the regression checks don't cover (~15 of ~20 facts in the sample are not explicitly tested).

---

### 7. What does one digest cost?

With `claude-haiku-4-5` on the 25-update sample (~1,400 input tokens, ~400 output tokens):
- **Total: ~$0.003–0.004 per digest** (sub half a cent; Haiku 4.5 is $1/M in, $5/M out)
- **Latency:** 2–4 seconds
- **Duplicate submissions: $0.** The input is hashed before every API call. If the same raw text has been digested before, the existing result is returned from local cache instantly — no round-trip, no tokens consumed.
- **Abuse protection:** Both API routes enforce a sliding-window rate limit per IP (10 generate / 20 eval per minute). Requests over the limit receive a `429` with a `Retry-After` header.
- The UI shows token counts and estimated cost after every generation.

**At 10x team size (250 updates):** ~$0.025 per digest; latency may push 8–15s where streaming becomes important. Context window (14k tokens) is still fine for Haiku's 200k limit, but a pre-filter pass would help with noise.

**At 6 months of historical updates:** The current model sees all updates in one prompt; this breaks down. The right architecture: embed each update → store in vector DB → retrieve top-k by relevance → pass only those to the model. The diff mode already points this direction — the previous digest becomes a retrieval artifact.

---

### 8. Where did you use coding agents / AI assistants, and where did you override them?

**Used for:** Scaffolding boilerplate (Next.js setup, TypeScript config), first drafts of the Zod schemas, and the `diff.ts` Jaccard similarity logic.

**Overrode on:**
- **The system prompt.** The agent's initial prompt was fluent but too permissive — it described categories without specifying what to do when a situation evolved across updates. The agent's version would have passed a single-day test but failed the OTP reversal case. I rewrote the faithfulness section and the evolution rule by hand.
- **The regression checks.** The agent suggested assertions like "all team members are mentioned" — untestable and wrong (some members may not have updates worth surfacing). I replaced them with five specific factual claims derived from close reading of the sample data.
- **The parser.** The initial version used ASCII-only name matching (`[A-Za-z]`), which would silently drop updates from team members with non-Latin names. Replaced with Unicode character classes (`[\p{L}\p{M}]`) so the parser handles Arabic, accented, and hyphenated names without special-casing.
- **The week-prefix logic.** The initial version labelled every update "Week 1 Mon" when week metadata was present. Fixed to only emit the week prefix when a batch actually spans multiple weeks — for single-week batches it's redundant noise the model doesn't need.
- **JSON extraction.** The initial approach stripped markdown fences with a regex anchored to the start and end of the response. Claude Haiku occasionally adds a preamble sentence or trailing text around the JSON block, which broke the regex silently. Replaced with a `{[\s\S]*}` extraction that pulls the outermost JSON object regardless of what surrounds it.
- **UUID schema enforcement.** The Zod schema originally required `id: z.string().uuid()` on each digest item. The UUID normalization that assigns stable IDs ran *after* validation, so if Claude returned a non-UUID string the schema would reject the entire response before normalization ever ran. Loosened to `z.string()` at the schema layer and kept the UUID enforcement in the post-processing step where it belongs.

---

### 9. What would I build next with another six hours?

1. **Per-person digest view.** Filter by owner, show one card per person. The data model already supports it; ~45-minute UI addition.
2. **Streaming generation.** The API route is already `runtime = "nodejs"`. Add a streaming endpoint with `ReadableStream` — valuable when switching to Sonnet.
3. **Server-side storage.** Replace localStorage with Postgres (Supabase). Keeps digests across devices, enables richer diff queries, and bounds history with a `LIMIT 50` query so page load stays fast regardless of how many digests have been generated. The data model already maps cleanly to a `digests` table.
4. **Global rate limiting.** The current limiter is in-memory per serverless instance, which is intentional for the demo — it adds zero infrastructure and is sufficient to prevent accidental cost spikes from a single session. For a multi-user production deployment, replace with Upstash Redis (free tier, native Vercel integration) for a shared counter across all instances.
5. **Slack connector.** Fetch the last N messages from a standup channel automatically. The parser already handles Slack's format.
6. **Broader eval coverage.** Expand regression checks to 3 more datasets: one update only, all terse, fully contradictory ownership.

---

## Architecture

```
app/
  page.tsx              Main UI (client component, localStorage persistence)
  api/
    generate/route.ts   POST: parse → Claude → validate → diff → respond
    eval/route.ts       POST: structural checks + regression checks + LLM judge

lib/
  claude.ts             Anthropic SDK wrapper + schema validation
  prompts.ts            System prompt + user/diff/judge prompt builders
  parser.ts             Raw text → StandupUpdate[] (regex, no AI, Unicode-aware)
  schemas.ts            Zod schemas for all AI output
  diff.ts               Jaccard-based digest comparison
  eval.ts               Eval harness (structural + regression checks)

components/
  DigestView.tsx        Renders digest by category, with Slack/email export
  SourceCitation.tsx    Clickable citation badges → source popover
  CategoryBadge.tsx     Colour-coded category chips with diff status
  EvalPanel.tsx         Eval results display with score pips

data/
  sample-updates.ts     25 standup updates from the brief

types/
  index.ts              All shared TypeScript types
```

## Deployment

```bash
vercel deploy
# Set ANTHROPIC_API_KEY in Vercel dashboard
```

No database. No auth. No migrations.
