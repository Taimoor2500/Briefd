"use client";
import { EvalResult } from "@/types";

interface Props {
  result: EvalResult;
  loading?: boolean;
}

export function EvalPanel({ result, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-16 rounded-xl bg-slate-100" />
        <div className="h-32 rounded-xl bg-slate-100" />
        <div className="h-24 rounded-xl bg-slate-100" />
      </div>
    );
  }

  const structural = result.checks.filter((c) => !c.name.startsWith("golden_"));
  const golden = result.checks.filter((c) => c.name.startsWith("golden_"));

  return (
    <div className="space-y-4">

      {/* LLM judge */}
      {result.llmJudge && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            LLM Judge
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["Faithfulness", result.llmJudge.faithfulness],
                ["Coverage", result.llmJudge.coverage],
                ["Signal/Noise", result.llmJudge.signalToNoise],
                ["Cross-update", result.llmJudge.crossUpdateReasoning],
              ] as [string, number][]
            ).map(([lbl, score]) => (
              <div key={lbl} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{lbl}</span>
                  <span className="text-xs font-bold text-slate-700 tabular-nums">
                    {score}/5
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-slate-700 transition-all duration-500"
                    style={{ width: `${(score / 5) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed italic border-t border-slate-100 pt-3">
            {result.llmJudge.rationale}
          </p>
        </div>
      )}

      {/* Structural checks */}
      <CheckGroup title="Structural checks" checks={structural} />

      {/* Golden assertions */}
      {golden.length > 0 && (
        <CheckGroup title="Golden assertions (sample data)" checks={golden} />
      )}
    </div>
  );
}

function CheckGroup({
  title,
  checks,
}: {
  title: string;
  checks: EvalResult["checks"];
}) {
  const passed = checks.filter((c) => c.passed).length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
          {title}
        </p>
        <span className="text-xs font-semibold text-slate-500 tabular-nums">
          {passed}/{checks.length}
        </span>
      </div>
      {checks.map((check) => (
        <div key={check.name} className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 shrink-0 text-xs font-bold w-4 text-center ${
              check.passed ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {check.passed ? "✓" : "✗"}
          </span>
          <span
            className={`text-xs leading-relaxed ${
              check.passed ? "text-slate-600" : "text-red-600"
            }`}
          >
            {check.message}
          </span>
        </div>
      ))}
    </div>
  );
}

