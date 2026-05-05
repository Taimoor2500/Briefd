"use client";
import { useState } from "react";
import { Digest, DigestItem, DigestCategory } from "@/types";
import { CategoryBadge, CategoryHeading } from "./CategoryBadge";
import { SourceCitation } from "./SourceCitation";

const CATEGORY_ORDER: DigestCategory[] = [
  "needs_decision",
  "blocked",
  "at_risk",
  "shipped",
  "changed",
];

const CATEGORY_BORDER: Record<DigestCategory, string> = {
  needs_decision: "border-violet-200 bg-violet-50/30",
  blocked: "border-red-200 bg-red-50/20",
  at_risk: "border-amber-200 bg-amber-50/20",
  shipped: "border-emerald-200 bg-emerald-50/20",
  changed: "border-sky-200 bg-sky-50/20",
};

const DIFF_LEFT_BORDER: Record<string, string> = {
  new: "border-l-emerald-400",
  resolved: "border-l-slate-300 opacity-50",
  still_open: "border-l-amber-400",
  changed: "border-l-sky-400",
};

interface Props {
  digest: Digest;
  warnings?: string[];
  showDiff?: boolean;
}

export function DigestView({ digest, warnings = [], showDiff = false }: Props) {
  const grouped = CATEGORY_ORDER.reduce<Record<string, DigestItem[]>>(
    (acc, cat) => {
      acc[cat] = digest.items.filter((i) => i.category === cat);
      return acc;
    },
    {} as Record<string, DigestItem[]>
  );

  const metaCost = estimateCost(digest.inputTokens, digest.outputTokens);
  const totalItems = digest.items.length;

  return (
    <div className="space-y-5">
      {/* Digest header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 truncate">
            {digest.label || "Digest"}
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-slate-400">
              {new Date(digest.createdAt).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-400">
              {digest.rawUpdates.length} update{digest.rawUpdates.length !== 1 ? "s" : ""}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-400">{totalItems} items</span>
            {digest.generationMs && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-400">{digest.generationMs}ms</span>
              </>
            )}
            {metaCost && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-400">{metaCost}</span>
              </>
            )}
          </div>
        </div>
        <ExportButtons digest={digest} />
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">
            Ambiguities detected
          </p>
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 leading-relaxed">
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Sections */}
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        return (
          <section key={cat} className={`rounded-xl border p-4 space-y-3 ${CATEGORY_BORDER[cat]}`}>
            <CategoryHeading category={cat} count={items.length} />
            <div className="space-y-2">
              {items.map((item) => (
                <DigestItemCard
                  key={item.id}
                  item={item}
                  updates={digest.rawUpdates}
                  showDiff={showDiff}
                />
              ))}
            </div>
          </section>
        );
      })}

      {digest.items.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-slate-400">No items generated.</p>
        </div>
      )}
    </div>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────
function DigestItemCard({
  item,
  updates,
  showDiff,
}: {
  item: DigestItem;
  updates: Digest["rawUpdates"];
  showDiff: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const leftBorder =
    showDiff && item.diffStatus
      ? DIFF_LEFT_BORDER[item.diffStatus] ?? "border-l-slate-200"
      : "border-l-transparent";

  return (
    <div
      className={`border-l-2 ${leftBorder} pl-3 py-1 rounded-r-md transition-all`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge
              category={item.category}
              diffStatus={showDiff ? item.diffStatus : undefined}
            />
            {item.owner && (
              <span
                className={`text-xs font-medium ${
                  item.owner === "unclear" ? "text-amber-500" : "text-slate-500"
                }`}
              >
                {item.owner === "unclear" ? "owner unclear" : item.owner}
              </span>
            )}
            {item.category === "needs_decision" && item.decisionOwner && (
              <span className="text-xs font-semibold text-violet-600">
                → {item.decisionOwner}
              </span>
            )}
          </div>
          {/* Summary */}
          <p className="text-sm text-slate-800 leading-snug font-medium">
            {item.summary}
          </p>
          {/* Detail (expandable) */}
          {item.detail && (
            <div>
              {expanded ? (
                <p className="text-xs text-slate-500 leading-relaxed">{item.detail}</p>
              ) : (
                <button
                  onClick={() => setExpanded(true)}
                  className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                >
                  more
                </button>
              )}
            </div>
          )}
        </div>
        {/* Source citation */}
        <div className="shrink-0 pt-0.5">
          <SourceCitation sourceIds={item.sourceIds} updates={updates} />
        </div>
      </div>
    </div>
  );
}

// ─── Export buttons ───────────────────────────────────────────────────────────
function ExportButtons({ digest }: { digest: Digest }) {
  const [copied, setCopied] = useState<"slack" | "email" | null>(null);

  const SECTION_LABELS: Record<DigestCategory, string> = {
    needs_decision: "Needs a Decision",
    blocked: "Blocked",
    at_risk: "At Risk",
    shipped: "Shipped",
    changed: "Changed",
  };

  const grouped = CATEGORY_ORDER.reduce<Record<string, DigestItem[]>>(
    (acc, cat) => {
      acc[cat] = digest.items.filter((i) => i.category === cat);
      return acc;
    },
    {} as Record<string, DigestItem[]>
  );

  // Strip markdown that Claude may have included in summaries
  const stripMd = (text: string) =>
    text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/_(.*?)_/g, "$1");

  const SLACK_EMOJI: Record<DigestCategory, string> = {
    needs_decision: "❓",
    blocked: "🚨",
    at_risk: "⚠️",
    shipped: "✅",
    changed: "🔄",
  };

  const formatForSlack = () => {
    const lines: string[] = [
      `BRIEFD${digest.label ? ` — ${digest.label}` : ""}`,
      `${digest.rawUpdates.length} updates · ${new Date(digest.createdAt).toLocaleDateString()}`,
      "",
    ];
    for (const cat of CATEGORY_ORDER) {
      const items = grouped[cat];
      if (!items?.length) continue;
      lines.push(`${SLACK_EMOJI[cat]}  ${SECTION_LABELS[cat].toUpperCase()}`);
      for (const item of items) {
        const owner = item.owner && item.owner !== "unclear" ? ` (${item.owner})` : "";
        lines.push(`• ${stripMd(item.summary)}${owner}`);
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  };

  const formatForEmail = () => {
    const lines: string[] = [
      `BRIEFD${digest.label ? ` — ${digest.label}` : ""}`,
      `${digest.rawUpdates.length} updates · ${new Date(digest.createdAt).toLocaleDateString()}`,
      "",
      "─".repeat(50),
      "",
    ];
    for (const cat of CATEGORY_ORDER) {
      const items = grouped[cat];
      if (!items?.length) continue;
      lines.push(SECTION_LABELS[cat].toUpperCase());
      for (const item of items) {
        const owner = item.owner && item.owner !== "unclear" ? ` (${item.owner})` : "";
        lines.push(`  • ${stripMd(item.summary)}${owner}`);
        if (item.detail) lines.push(`    ${stripMd(item.detail)}`);
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  };

  const copy = (text: string, type: "slack" | "email") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  return (
    <div className="flex gap-1.5 shrink-0">
      <button
        onClick={() => copy(formatForSlack(), "slack")}
        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
          copied === "slack"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
        }`}
      >
        {copied === "slack" ? "✓ Copied" : "Slack"}
      </button>
      <button
        onClick={() => copy(formatForEmail(), "email")}
        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
          copied === "email"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
        }`}
      >
        {copied === "email" ? "✓ Copied" : "Email"}
      </button>
    </div>
  );
}

// ─── Cost estimator ───────────────────────────────────────────────────────────
function estimateCost(inputTokens?: number, outputTokens?: number): string {
  if (!inputTokens && !outputTokens) return "";
  // claude-haiku-4-5: $1/M in, $5/M out
  const cost =
    ((inputTokens ?? 0) / 1_000_000) * 1 +
    ((outputTokens ?? 0) / 1_000_000) * 5;
  return cost < 0.001 ? "< $0.001" : `~$${cost.toFixed(4)}`;
}
