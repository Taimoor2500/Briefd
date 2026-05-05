// ─── Core domain types ────────────────────────────────────────────────────────

export type DigestCategory =
  | "shipped"
  | "blocked"
  | "at_risk"
  | "needs_decision"
  | "changed";

export type ItemStatus = "new" | "resolved" | "still_open" | "changed";

export interface StandupUpdate {
  id: number;
  author: string;
  day: string; // e.g. "Mon", "Tue", "Wed" or full date string
  week?: number; // 1 or 2
  text: string;
  raw: string; // verbatim original
}

export interface DigestItem {
  id: string;
  category: DigestCategory;
  summary: string; // one crisp sentence for the COO
  detail?: string; // optional longer explanation
  owner?: string; // who owns this — "unclear" if ambiguous
  sourceIds: number[]; // update IDs this claim comes from
  decisionOwner?: string; // for needs_decision items
  // diff fields (populated when comparing against previous digest)
  diffStatus?: ItemStatus;
}

export interface Digest {
  id: string;
  createdAt: string; // ISO timestamp
  label?: string; // user-supplied name e.g. "Week 1 Thu"
  items: DigestItem[];
  rawUpdates: StandupUpdate[];
  // meta
  model: string;
  promptVersion: string;
  generationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  inputHash?: string; // fingerprint of raw input — used to detect duplicate submissions
}

// ─── Diff / changed-since-last ────────────────────────────────────────────────

export interface DigestDiff {
  previousDigestId: string;
  currentDigestId: string;
  newItems: DigestItem[];
  resolvedItems: DigestItem[];
  changedItems: Array<{ previous: DigestItem; current: DigestItem }>;
  stillOpenItems: DigestItem[];
}

// ─── Eval types ───────────────────────────────────────────────────────────────

export type EvalResult = {
  passed: boolean;
  score: number; // 0–1
  checks: EvalCheck[];
  llmJudge?: LLMJudgeResult;
};

export type EvalCheck = {
  name: string;
  passed: boolean;
  message: string;
};

export type LLMJudgeResult = {
  faithfulness: number; // 0–5
  coverage: number; // 0–5
  signalToNoise: number; // 0–5
  crossUpdateReasoning: number; // 0–5
  rationale: string;
};

// ─── API request/response shapes ─────────────────────────────────────────────

export interface GenerateRequest {
  rawText: string;
  previousDigestId?: string; // if set, run diff mode
  label?: string;
}

export interface GenerateResponse {
  digest: Digest;
  diff?: DigestDiff;
  warnings: string[]; // faithfulness violations caught post-hoc
}

export interface EvalRequest {
  digest: Digest;
}

export interface EvalResponse {
  result: EvalResult;
}

/** Client-only: digest + optional last eval, persisted in localStorage history */
export interface HistoryEntry {
  digest: Digest;
  evalResult?: EvalResult;
}
