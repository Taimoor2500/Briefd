import { Digest, EvalResult, EvalCheck } from "@/types";
import { SAMPLE_UPDATES } from "@/data/sample-updates";

// ─── Programmatic eval harness ────────────────────────────────────────────────
// Three layers:
//   1. Structural checks (always run, no AI needed)
//   2. Golden assertions against the sample data (deterministic)
//   3. LLM-as-judge (optional, called from API layer)

export function runStructuralChecks(digest: Digest): EvalCheck[] {
  const checks: EvalCheck[] = [];
  const validUpdateIds = new Set(digest.rawUpdates.map((u) => u.id));

  // C1: All sourceIds reference real updates
  const allSourceIds = digest.items.flatMap((i) => i.sourceIds);
  const invalidIds = allSourceIds.filter((id) => !validUpdateIds.has(id));
  checks.push({
    name: "sourceIds_exist",
    passed: invalidIds.length === 0,
    message:
      invalidIds.length === 0
        ? "All sourceIds reference real updates"
        : `Invalid sourceIds: ${invalidIds.join(", ")} — possible hallucination`,
  });

  // C2: Every item has at least one sourceId
  const itemsMissingSource = digest.items.filter(
    (i) => !i.sourceIds || i.sourceIds.length === 0
  );
  checks.push({
    name: "every_item_has_source",
    passed: itemsMissingSource.length === 0,
    message:
      itemsMissingSource.length === 0
        ? "Every digest item has at least one sourceId"
        : `${itemsMissingSource.length} items have no sourceId`,
  });

  // C3: No empty summaries
  const emptySummaries = digest.items.filter((i) => !i.summary?.trim());
  checks.push({
    name: "no_empty_summaries",
    passed: emptySummaries.length === 0,
    message:
      emptySummaries.length === 0
        ? "All summaries are non-empty"
        : `${emptySummaries.length} items have empty summaries`,
  });

  // C4: Category values are valid
  const validCategories = new Set([
    "shipped",
    "blocked",
    "at_risk",
    "needs_decision",
    "changed",
  ]);
  const badCategories = digest.items.filter(
    (i) => !validCategories.has(i.category)
  );
  checks.push({
    name: "valid_categories",
    passed: badCategories.length === 0,
    message:
      badCategories.length === 0
        ? "All categories are valid enum values"
        : `Invalid categories: ${badCategories.map((i) => i.category).join(", ")}`,
  });

  // C5: Not suspiciously short (fewer than 3 items for 10+ updates likely misses signal)
  const tooFew = digest.rawUpdates.length >= 10 && digest.items.length < 3;
  checks.push({
    name: "adequate_coverage",
    passed: !tooFew,
    message: !tooFew
      ? `Digest has ${digest.items.length} items (adequate for ${digest.rawUpdates.length} updates)`
      : `Only ${digest.items.length} items for ${digest.rawUpdates.length} updates — likely missing signal`,
  });

  return checks;
}

// ─── Golden assertions (sample data only) ────────────────────────────────────
// These run only when the digest was generated from the full 25-update sample.
// They encode known facts that a correct digest MUST capture.
export function runGoldenAssertions(digest: Digest): EvalCheck[] {
  const checks: EvalCheck[] = [];
  // Detect sample data by content fingerprint, not update count.
  // Avoids false-positives if someone happens to paste exactly 25 unrelated updates.
  const SAMPLE_FINGERPRINT = "shipped the payments retry logic finally";
  const isSampleData = digest.rawUpdates.some((u) =>
    u.text.includes(SAMPLE_FINGERPRINT)
  );

  if (!isSampleData) return checks; // Only run on sample data

  const allText = digest.items
    .map((i) => `${i.summary} ${i.detail ?? ""}`)
    .join(" ")
    .toLowerCase();

  const allItems = digest.items;

  // G1: Auth bug must surface (Faraz's silent 2-week block is a key signal)
  const authBugSurfaced =
    allText.includes("auth") ||
    allText.includes("token") ||
    allText.includes("faraz");
  checks.push({
    name: "golden_auth_bug_surfaced",
    passed: authBugSurfaced,
    message: authBugSurfaced
      ? "Faraz's auth migration bug correctly surfaced"
      : "MISS: Faraz's 2-week silent auth bug not mentioned — critical signal dropped",
  });

  // G2: OTP reversal handled (Sara said slip, then said no slip — needs current state)
  const otpItems = allItems.filter(
    (i) =>
      i.summary.toLowerCase().includes("otp") ||
      i.summary.toLowerCase().includes("onboarding") ||
      i.summary.toLowerCase().includes("twilio")
  );
  // Should NOT say "slip" without also noting it was closed
  const otpText = otpItems.map((i) => i.summary + (i.detail ?? "")).join(" ").toLowerCase();
  const slipMentioned = otpText.includes("slip");
  const slipClosed =
    otpText.includes("original date") ||
    otpText.includes("resolved") ||
    otpText.includes("closed") ||
    otpText.includes("back on");
  const otpCorrect = !slipMentioned || slipClosed;
  checks.push({
    name: "golden_otp_reversal",
    passed: otpCorrect,
    message: otpCorrect
      ? "OTP slip reversal handled correctly (no stale 'slip' without resolution)"
      : "FAIL: digest says onboarding is slipping but Sara closed the slip in update 21",
  });

  // G3: Arabic support ambiguity flagged
  const arabicAmbiguity =
    allText.includes("arabic") ||
    digest.items.some(
      (i) =>
        i.category === "needs_decision" &&
        (i.summary.toLowerCase().includes("arabic") ||
          (i.sourceIds.includes(25) || i.sourceIds.includes(20)))
    );
  checks.push({
    name: "golden_arabic_ambiguity",
    passed: arabicAmbiguity,
    message: arabicAmbiguity
      ? "Arabic support ambiguity captured"
      : "MISS: Arabic support scope disagreement between Anita (#25) and Ahmed (#20) not surfaced",
  });

  // G4: Demo / client deal must appear
  const dealSurfaced =
    allText.includes("tabasum") ||
    allText.includes("verbal") ||
    allText.includes("contract") ||
    allText.includes("demo");
  checks.push({
    name: "golden_client_deal",
    passed: dealSurfaced,
    message: dealSurfaced
      ? "Client deal / verbal yes captured"
      : "MISS: Tabasum's verbal yes and contract (update 25) not mentioned",
  });

  // G5: Data export scope conflict between Tayba and Omar
  const exportConflict =
    allText.includes("export") &&
    (allText.includes("scope") ||
      allText.includes("week") ||
      allText.includes("overlap") ||
      allText.includes("batch"));
  checks.push({
    name: "golden_export_scope",
    passed: exportConflict,
    message: exportConflict
      ? "Data export scope conflict (Omar vs Tayba) captured"
      : "MISS: Omar's estimate slip from 2 days → 1 week not mentioned",
  });

  return checks;
}

// ─── Aggregate result ─────────────────────────────────────────────────────────
export function aggregateEvalResult(checks: EvalCheck[]): EvalResult {
  const passed = checks.filter((c) => c.passed).length;
  const score = checks.length > 0 ? passed / checks.length : 1;
  return {
    passed: score >= 0.8,
    score: Math.round(score * 100) / 100,
    checks,
  };
}
