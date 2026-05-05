"use client";
import { useState, useEffect, useCallback } from "react";
import { Digest, GenerateResponse, EvalResult, HistoryEntry } from "@/types";
import { DigestView } from "@/components/DigestView";
import { EvalPanel } from "@/components/EvalPanel";
import { SAMPLE_UPDATES_TEXT } from "@/data/sample-updates";
import { hashText } from "@/lib/hash";

// ─── LocalStorage ─────────────────────────────────────────────────────────────
const STORAGE_KEY = "standup_digests";

function loadStoredHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: unknown): HistoryEntry => {
      if (
        item &&
        typeof item === "object" &&
        "digest" in item &&
        (item as HistoryEntry).digest &&
        typeof (item as HistoryEntry).digest === "object"
      ) {
        return item as HistoryEntry;
      }
      return { digest: item as Digest };
    });
  } catch {
    return [];
  }
}

function persistHistory(entries: HistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function saveNewDigest(digest: Digest, stored: HistoryEntry[]): HistoryEntry[] {
  const updated = [{ digest, evalResult: undefined }, ...stored].slice(0, 20);
  persistHistory(updated);
  return updated;
}

function mergeEvalIntoHistory(
  digestId: string,
  evalResult: EvalResult,
  stored: HistoryEntry[]
): HistoryEntry[] {
  const updated = stored.map((e) =>
    e.digest.id === digestId ? { ...e, evalResult } : e
  );
  persistHistory(updated);
  return updated;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type RightTab = "digest" | "eval" | "history";

export default function Home() {
  const [rawText, setRawText] = useState("");
  const [label, setLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [currentDigest, setCurrentDigest] = useState<Digest | null>(null);
  const [storedDigests, setStoredDigests] = useState<HistoryEntry[]>([]);
  const [compareDigestId, setCompareDigestId] = useState<string>("");

  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const [rightTab, setRightTab] = useState<RightTab>("digest");
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    setStoredDigests(loadStoredHistory());
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!rawText.trim()) return;
    setError(null);
    setWarnings([]);
    setEvalResult(null);
    setCacheHit(false);

    // ── Cache check: if we've already digested this exact input, reuse it ──
    const inputHash = hashText(rawText.trim());
    const cached = storedDigests.find((e) => e.digest.inputHash === inputHash);
    if (cached) {
      setCurrentDigest(cached.digest);
      setEvalResult(cached.evalResult ?? null);
      setShowDiff(false);
      setRightTab("digest");
      setCacheHit(true);
      return;
    }

    setGenerating(true);

    const previousDigest = compareDigestId
      ? storedDigests.find((e) => e.digest.id === compareDigestId)?.digest
      : undefined;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          label: label.trim() || undefined,
          previousDigest,
        }),
      });

      const data: GenerateResponse & { error?: string } = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
        return;
      }

      const digest = data.digest;

      if (data.diff && previousDigest) {
        const diff = data.diff;
        digest.items = digest.items.map((item) => {
          if (diff.newItems.some((n) => n.id === item.id))
            return { ...item, diffStatus: "new" as const };
          if (diff.changedItems.find((c) => c.current.id === item.id))
            return { ...item, diffStatus: "changed" as const };
          if (diff.stillOpenItems.some((s) => s.id === item.id))
            return { ...item, diffStatus: "still_open" as const };
          return item;
        });
        setShowDiff(true);
      } else {
        setShowDiff(false);
      }

      setCurrentDigest(digest);
      setWarnings(data.warnings ?? []);
      setRightTab("digest");
      setStoredDigests((prev) => saveNewDigest(digest, prev));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [rawText, label, compareDigestId, storedDigests]);

  const handleEval = useCallback(async () => {
    if (!currentDigest) return;
    setEvalLoading(true);
    setRightTab("eval");
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest: currentDigest }),
      });
      const data: { result: EvalResult; error?: string } = await res.json();
      if (res.ok) {
        setEvalResult(data.result);
        setStoredDigests((prev) =>
          mergeEvalIntoHistory(currentDigest.id, data.result, prev)
        );
      } else setError(data.error ?? "Eval failed");
    } catch {
      setError("Eval request failed");
    } finally {
      setEvalLoading(false);
    }
  }, [currentDigest]);

  const charCount = rawText.length;
  const [cacheHit, setCacheHit] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-base font-black tracking-tight text-slate-900">
              BRIEFD
            </span>
            <span className="hidden sm:block text-slate-200">|</span>
            <span className="hidden sm:block text-xs text-slate-400">
              Standup updates → executive digest
            </span>
          </div>
          <div className="flex items-center gap-2">
            {currentDigest && (
              <button
                onClick={handleEval}
                disabled={evalLoading}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 font-medium transition-all disabled:opacity-40"
              >
                {evalLoading ? "Evaluating…" : "Run Eval"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">

          {/* ── Left: Input panel ── */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Panel header */}
              <div className="px-5 pt-5 pb-4 border-b border-slate-100">
                <h1 className="text-sm font-bold text-slate-800">New Digest</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Paste any standup format — Slack, voice transcripts, free text
                </p>
              </div>

              <div className="p-5 space-y-4">
                {/* Label + Compare */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                      Label <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder='e.g. "Week 2 Thu"'
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 placeholder:text-slate-300 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                      Compare against <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <select
                      value={compareDigestId}
                      onChange={(e) => setCompareDigestId(e.target.value)}
                      disabled={storedDigests.length === 0}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <option value="">— none —</option>
                      {storedDigests.map((e) => (
                        <option key={e.digest.id} value={e.digest.id}>
                          {e.digest.label || new Date(e.digest.createdAt).toLocaleDateString()} (
                          {e.digest.items.length} items)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-500">Updates</label>
                    <button
                      onClick={() => {
                        setRawText(SAMPLE_UPDATES_TEXT);
                        setLabel("Week 1–2 Sample");
                      }}
                      className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-2 transition-colors"
                    >
                      Load 25 sample updates
                    </button>
                  </div>
                  <textarea
                    value={rawText}
                    onChange={(e) => { setRawText(e.target.value); setCacheHit(false); }}
                    placeholder={`Ahmed · Mon\nshipped the payments retry logic...\n\nSara · Mon\nWorking on the onboarding flow...`}
                    className="w-full h-64 text-sm font-mono border border-slate-200 rounded-xl px-4 py-3 resize-y focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 placeholder:text-slate-300 transition-all leading-relaxed"
                    spellCheck={false}
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    {charCount > 0
                      ? `${charCount.toLocaleString()} chars`
                      : "Name · Day · update text, one block per person"}
                  </p>
                </div>

                {/* Cache hit notice */}
                {cacheHit && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-2">
                    <span className="text-emerald-500 shrink-0">✓</span>
                    <p className="text-xs text-emerald-800">
                      Loaded from cache — this input was already digested. No API call made.
                    </p>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                    <p className="text-sm text-red-700 font-medium">{error}</p>
                  </div>
                )}

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || !rawText.trim()}
                  className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 active:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating digest…
                    </>
                  ) : (
                    <>
                      Generate digest
                      <span className="opacity-60">→</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Format card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Accepted formats
              </p>
              <div className="space-y-2 text-xs text-slate-500 font-mono leading-relaxed">
                <p className="text-slate-400">Standard (Author · Day)</p>
                <pre className="bg-slate-50 rounded-lg px-3 py-2 text-slate-600 whitespace-pre-wrap">{`Ahmed · Mon\nshipped payments retry...`}</pre>
                <p className="text-slate-400 mt-2">Voice note / transcript</p>
                <pre className="bg-slate-50 rounded-lg px-3 py-2 text-slate-600 whitespace-pre-wrap">{`Bilal · Wed [VOICE NOTE]\nhey so today i was uh...`}</pre>
              </div>
            </div>
          </div>

          {/* ── Right: Output panel ── */}
          <div className="space-y-0">
            {/* Tab bar */}
            <div className="bg-white rounded-t-2xl border border-b-0 border-slate-200 px-4 pt-4 flex items-center gap-1">
              {(
                [
                  ["digest", "Digest", currentDigest?.items.length],
                  ["eval", "Eval", null],
                  ["history", "History", storedDigests.length || null],
                ] as [RightTab, string, number | null][]
              ).map(([tab, tabLabel, count]) => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className={`px-3 py-2 text-sm font-semibold rounded-t-lg transition-all flex items-center gap-1.5 ${
                    rightTab === tab
                      ? "text-slate-900 bg-slate-50 border-b-2 border-slate-900 -mb-px"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {tabLabel}
                  {count != null && count > 0 && (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              ))}
              {showDiff && rightTab === "digest" && (
                <div className="ml-auto flex items-center gap-1.5 pb-2">
                  <span className="text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5 uppercase tracking-wide">
                    Diff mode
                  </span>
                </div>
              )}
            </div>

            {/* Panel body */}
            <div className="bg-white rounded-b-2xl border border-slate-200 shadow-sm p-5 min-h-[480px]">
              {rightTab === "digest" && (
                <>
                  {currentDigest ? (
                    <>
                      {showDiff && (
                        <div className="mb-4 flex items-center gap-3 text-xs bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                          <span className="font-semibold text-sky-700">Diff vs previous</span>
                          <span className="flex items-center gap-1 text-slate-600">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> New
                          </span>
                          <span className="flex items-center gap-1 text-slate-600">
                            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Still open
                          </span>
                          <span className="flex items-center gap-1 text-slate-600">
                            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> Changed
                          </span>
                        </div>
                      )}
                      <DigestView
                        digest={currentDigest}
                        warnings={warnings}
                        showDiff={showDiff}
                      />
                    </>
                  ) : (
                    <EmptyDigest onLoadSample={() => {
                      setRawText(SAMPLE_UPDATES_TEXT);
                      setLabel("Week 1–2 Sample");
                    }} />
                  )}
                </>
              )}

              {rightTab === "eval" && (
                <>
                  {evalResult || evalLoading ? (
                    <EvalPanel result={evalResult!} loading={evalLoading} />
                  ) : (
                    <EmptyState
                      icon="◎"
                      title="No eval yet"
                      sub={
                        currentDigest
                          ? 'Click "Run Eval" in the header to score this digest'
                          : "Generate a digest first, then run the eval"
                      }
                    />
                  )}
                </>
              )}

              {rightTab === "history" && (
                <div className="space-y-2">
                  {storedDigests.length === 0 ? (
                    <EmptyState
                      icon="⊡"
                      title="No history yet"
                      sub="Generated digests are saved locally in your browser"
                    />
                  ) : (
                    storedDigests.map((entry) => (
                      <HistoryCard
                        key={entry.digest.id}
                        digest={entry.digest}
                        evalResult={entry.evalResult}
                        isActive={currentDigest?.id === entry.digest.id}
                        onLoad={() => {
                          setCurrentDigest(entry.digest);
                          setEvalResult(entry.evalResult ?? null);
                          setWarnings([]);
                          setShowDiff(false);
                          setRightTab("digest");
                        }}
                        onDelete={() => {
                          const updated = storedDigests.filter(
                            (s) => s.digest.id !== entry.digest.id
                          );
                          setStoredDigests(updated);
                          persistHistory(updated);
                        }}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-10 flex items-center">
          <p className="text-xs text-slate-400">
            No auth · No tracking · Digests stored locally
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyDigest({ onLoadSample }: { onLoadSample: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl text-slate-300">
        ≡
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-500">No digest yet</p>
        <p className="text-xs text-slate-400 mt-1">
          Paste standup updates and click Generate, or{" "}
          <button
            onClick={onLoadSample}
            className="underline underline-offset-2 hover:text-slate-600 transition-colors"
          >
            load sample data
          </button>
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
      <span className="text-3xl text-slate-200">{icon}</span>
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 max-w-xs">{sub}</p>
    </div>
  );
}

function HistoryCard({
  digest,
  evalResult,
  isActive,
  onLoad,
  onDelete,
}: {
  digest: Digest;
  evalResult?: EvalResult;
  isActive: boolean;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const categoryColors: Record<string, string> = {
    needs_decision: "bg-violet-400",
    blocked: "bg-red-400",
    at_risk: "bg-amber-400",
    shipped: "bg-emerald-400",
    changed: "bg-sky-400",
  };

  // Count items per category for mini bar
  const catCounts: Record<string, number> = {};
  for (const item of digest.items) {
    catCounts[item.category] = (catCounts[item.category] ?? 0) + 1;
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 cursor-pointer transition-all ${
        isActive
          ? "border-slate-900 bg-slate-50"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      onClick={onLoad}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {digest.label || "Untitled digest"}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {new Date(digest.createdAt).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {digest.rawUpdates.length} updates
            </span>
            {evalResult && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200">
                Eval ✓
              </span>
            )}
          </p>
          {/* Mini category dots */}
          {digest.items.length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {Object.entries(catCounts).map(([cat, count]) => (
                <span
                  key={cat}
                  className={`inline-flex items-center gap-1 text-[10px] font-medium text-slate-500`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${categoryColors[cat] ?? "bg-slate-400"}`} />
                  {count}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-slate-300 hover:text-red-400 transition-colors text-lg leading-none shrink-0 pt-0.5"
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
}
