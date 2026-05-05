"use client";
import { useState, useRef, useEffect } from "react";
import { StandupUpdate } from "@/types";

interface Props {
  sourceIds: number[];
  updates: StandupUpdate[];
}

export function SourceCitation({ sourceIds, updates }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const sources = sourceIds
    .map((id) => updates.find((u) => u.id === id))
    .filter(Boolean) as StandupUpdate[];

  return (
    <div className="relative inline-flex items-center gap-0.5 ml-2 shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 group"
        title={`Sources: update${sourceIds.length > 1 ? "s" : ""} ${sourceIds.join(", ")}`}
        aria-expanded={open}
      >
        {sourceIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center justify-center w-4 h-4 rounded bg-slate-100 text-slate-400 text-[9px] font-mono font-bold group-hover:bg-slate-200 group-hover:text-slate-600 transition-colors"
          >
            {id}
          </span>
        ))}
      </button>

      {open && sources.length > 0 && (
        <div className="absolute z-50 bottom-full right-0 mb-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Source{sources.length > 1 ? "s" : ""}
            </p>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-300 hover:text-slate-500 text-lg leading-none"
            >
              ×
            </button>
          </div>
          {sources.map((src) => (
            <div key={src.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  #{src.id}
                </span>
                <span className="text-xs font-semibold text-slate-700">{src.author}</span>
                <span className="text-xs text-slate-400">
                  {src.week ? `Wk${src.week} ` : ""}{src.day}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-4 pl-1 border-l-2 border-slate-100">
                {src.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
