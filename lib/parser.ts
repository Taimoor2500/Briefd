import { StandupUpdate } from "@/types";

const AUTHOR_SEGMENT = String.raw`([\p{L}\p{M}][\p{L}\p{M}\s'.-]*?)`;

const AUTHOR_LINE_PATTERNS = [
  // Dot/dash headers: day tail can be Mon, Monday, 2025-05-05, 5 May, etc.
  new RegExp(`^(?:\\d+\\s+)?${AUTHOR_SEGMENT}\\s*[·\\-–—]\\s*([^\\n]+)`, "iu"),
  // "Ahmed (Mon):" or "Ahmed (Monday):"
  new RegExp(`^(?:\\d+\\s+)?${AUTHOR_SEGMENT}\\s*\\(([^)]+)\\)\\s*:`, "iu"),
];

const DAY_PATTERN = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;
const FULL_WEEKDAY_PATTERN =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const FULL_TO_SHORT: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};
const ISO_DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2})\b/;
const US_SLASH_DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const WEEK_PATTERN = /\bweek\s*(\d+)\b/i;

export function parseUpdates(rawText: string): StandupUpdate[] {
  if (!rawText.trim()) return [];

  // Split on double newlines or numbered entries
  const blocks = splitIntoBlocks(rawText);
  const updates: StandupUpdate[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const parsed = parseBlock(trimmed, updates.length + 1);
    if (parsed) updates.push(parsed);
  }

  return updates;
}

/**
 * Split a chunk when a line looks like a new author header (after content has started).
 * Handles mixed spacing: one double-newline between some updates but only single newlines
 * between others—so a "paragraph" can still contain multiple people.
 */
function splitChunkByHeaderLines(chunk: string): string[] {
  const lines = chunk.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeader =
      trimmed.length > 0 &&
      AUTHOR_LINE_PATTERNS.some((p) => p.test(trimmed));
    if (isHeader && current.length > 0) {
      const joined = current.join("\n").trim();
      if (joined) blocks.push(joined);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    const joined = current.join("\n").trim();
    if (joined) blocks.push(joined);
  }
  return blocks;
}

function splitIntoBlocks(text: string): string[] {
  const byDoubleNewline = text.split(/\n\s*\n/);

  if (byDoubleNewline.length >= 2) {
    const chunks = byDoubleNewline.map((c) => c.trim()).filter(Boolean);
    return chunks.flatMap((chunk) => splitChunkByHeaderLines(chunk));
  }

  return splitChunkByHeaderLines(text.trim());
}

function parseBlock(block: string, fallbackId: number): StandupUpdate | null {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const firstLine = lines[0];
  let author = "Unknown";
  let day = "Unknown";
  let week: number | undefined;
  let bodyStartIndex = 0;

  for (const pattern of AUTHOR_LINE_PATTERNS) {
    const match = firstLine.match(pattern);
    if (match) {
      author = match[1].trim();
      const dayPart = match[2] || "";
      day = parseDayFromPart(dayPart);
      const weekMatch = dayPart.match(WEEK_PATTERN);
      if (weekMatch) week = parseInt(weekMatch[1], 10);
      bodyStartIndex = 1;
      break;
    }
  }

  // Body is everything after the header line
  const bodyLines = lines.slice(bodyStartIndex);

  // Strip [VOICE NOTE] tags and similar annotations
  const text = bodyLines
    .join(" ")
    .replace(/\[VOICE\s*NOTE\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  return {
    id: fallbackId,
    author,
    day,
    week,
    text,
    raw: block,
  };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const dayNum = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}

/** Strip week annotations so date parsing sees only the day/date fragment */
function dayPartForDateParsing(dayPart: string): string {
  return dayPart
    .replace(/\(\s*week\s*\d+\s*\)/gi, " ")
    .replace(/\bweek\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalise header day/date to a display string: short weekday (Mon…), ISO date, or Unknown.
 */
function parseDayFromPart(dayPart: string): string {
  const trimmed = dayPartForDateParsing(dayPart);
  if (!trimmed) return "Unknown";

  const short = trimmed.match(DAY_PATTERN);
  if (short) return capitalise(short[1]);

  const full = trimmed.match(FULL_WEEKDAY_PATTERN);
  if (full) {
    const key = full[1].toLowerCase();
    return FULL_TO_SHORT[key] ?? "Unknown";
  }

  const iso = trimmed.match(ISO_DATE_PATTERN);
  if (iso) return iso[1];

  const slash = trimmed.match(US_SLASH_DATE_PATTERN);
  if (slash) {
    const month = parseInt(slash[1], 10);
    const dayNum = parseInt(slash[2], 10);
    const year = parseInt(slash[3], 10);
    const dt = new Date(year, month - 1, dayNum);
    if (
      !Number.isNaN(dt.getTime()) &&
      dt.getFullYear() === year &&
      dt.getMonth() === month - 1 &&
      dt.getDate() === dayNum
    ) {
      return `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    }
  }

  let ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) {
    ts = Date.parse(`${trimmed} ${new Date().getFullYear()}`);
  }
  if (!Number.isNaN(ts)) {
    const dt = new Date(ts);
    if (!Number.isNaN(dt.getTime())) return formatLocalIsoDate(dt);
  }

  return "Unknown";
}

// ─── Re-number updates to be 1-indexed and stable ────────────────────────────
export function renumberUpdates(updates: StandupUpdate[]): StandupUpdate[] {
  return updates.map((u, i) => ({ ...u, id: i + 1 }));
}

// ─── Validate that all sourceIds in a digest exist in the update set ──────────
export function validateSourceIds(
  sourceIds: number[],
  updates: StandupUpdate[]
): { valid: boolean; invalid: number[] } {
  const validIds = new Set(updates.map((u) => u.id));
  const invalid = sourceIds.filter((id) => !validIds.has(id));
  return { valid: invalid.length === 0, invalid };
}
