"use client";
import { DigestCategory, ItemStatus } from "@/types";

const CATEGORY_CONFIG: Record<
  DigestCategory,
  { label: string; dot: string; text: string; bg: string; border: string }
> = {
  needs_decision: {
    label: "Needs Decision",
    dot: "bg-violet-500",
    text: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  blocked: {
    label: "Blocked",
    dot: "bg-red-500",
    text: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
  },
  at_risk: {
    label: "At Risk",
    dot: "bg-amber-500",
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  shipped: {
    label: "Shipped",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  changed: {
    label: "Changed",
    dot: "bg-sky-500",
    text: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200",
  },
};

const DIFF_LABELS: Record<ItemStatus, { label: string; classes: string }> = {
  new: { label: "NEW", classes: "bg-emerald-500 text-white" },
  resolved: { label: "RESOLVED", classes: "bg-slate-400 text-white" },
  still_open: { label: "OPEN", classes: "bg-amber-500 text-white" },
  changed: { label: "CHANGED", classes: "bg-sky-500 text-white" },
};

export function CategoryBadge({
  category,
  diffStatus,
}: {
  category: DigestCategory;
  diffStatus?: ItemStatus;
}) {
  const cfg = CATEGORY_CONFIG[category];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
      {cfg.label}
      {diffStatus && (
        <span
          className={`ml-0.5 text-[9px] font-bold px-1 py-0.5 rounded ${DIFF_LABELS[diffStatus].classes}`}
        >
          {DIFF_LABELS[diffStatus].label}
        </span>
      )}
    </span>
  );
}

// Section header variant — larger, used above grouped items
export function CategoryHeading({ category, count }: { category: DigestCategory; count: number }) {
  const cfg = CATEGORY_CONFIG[category];
  const ICONS: Record<DigestCategory, string> = {
    needs_decision: "◆",
    blocked: "✕",
    at_risk: "▲",
    shipped: "✓",
    changed: "↻",
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-bold ${cfg.text}`}>{ICONS[category]}</span>
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
        {cfg.label}
      </span>
      <span className="text-xs text-slate-400 font-medium tabular-nums">{count}</span>
    </div>
  );
}
