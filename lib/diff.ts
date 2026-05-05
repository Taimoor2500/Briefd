import { Digest, DigestDiff, DigestItem, ItemStatus } from "@/types";

// ─── Compute what changed between two digests ─────────────────────────────────
// Strategy: semantic similarity via keywords rather than exact text match.
// This is intentionally simple — the AI does the heavy reasoning.
// The diff here is primarily for the UI layer (colour-coding, badges).

export function computeDiff(
  previousDigest: Digest,
  currentDigest: Digest
): DigestDiff {
  const prevItems = previousDigest.items;
  const currItems = currentDigest.items;

  // Build keyword sets for matching
  const prevKeywords = prevItems.map((item) => ({
    item,
    keywords: extractKeywords(item.summary),
  }));

  const matched = new Set<string>(); // prev item IDs that were matched

  const resolvedItems: DigestItem[] = [];
  const changedItems: Array<{ previous: DigestItem; current: DigestItem }> = [];
  const stillOpenItems: DigestItem[] = [];
  const newItems: DigestItem[] = [];

  for (const currItem of currItems) {
    const currKeywords = extractKeywords(currItem.summary);
    const bestMatch = findBestMatch(currKeywords, prevKeywords);

    if (!bestMatch || bestMatch.score < 0.3) {
      // No match — this is new
      newItems.push({ ...currItem, diffStatus: "new" });
    } else {
      matched.add(bestMatch.item.id);
      if (bestMatch.item.category !== currItem.category) {
        // Category changed — something escalated or resolved
        changedItems.push({
          previous: bestMatch.item,
          current: { ...currItem, diffStatus: "changed" },
        });
      } else if (
        currItem.category === "blocked" ||
        currItem.category === "at_risk" ||
        currItem.category === "needs_decision"
      ) {
        // Concerning item that hasn't improved — flag it as still open
        stillOpenItems.push({ ...currItem, diffStatus: "still_open" });
      }
      // shipped / changed with same category = stable, no diff annotation needed
    }
  }

  // Previous items with no match in current = resolved
  for (const prev of prevItems) {
    if (!matched.has(prev.id)) {
      resolvedItems.push({ ...prev, diffStatus: "resolved" });
    }
  }

  return {
    previousDigestId: previousDigest.id,
    currentDigestId: currentDigest.id,
    newItems,
    resolvedItems,
    changedItems,
    stillOpenItems,
  };
}

// ─── Annotate digest items with their diff status ────────────────────────────
export function annotateDiffStatus(
  digest: Digest,
  diff: DigestDiff
): DigestItem[] {
  return digest.items.map((item) => {
    const isNew = diff.newItems.some((n) => n.id === item.id);
    if (isNew) return { ...item, diffStatus: "new" as ItemStatus };

    const changed = diff.changedItems.find((c) => c.current.id === item.id);
    if (changed) return { ...item, diffStatus: "changed" as ItemStatus };

    const stillOpen = diff.stillOpenItems.some((s) => s.id === item.id);
    if (stillOpen) return { ...item, diffStatus: "still_open" as ItemStatus };

    return item;
  });
}

// ─── Keyword extraction ───────────────────────────────────────────────────────
function extractKeywords(text: string): Set<string> {
  const stopwords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "has", "have", "had", "will", "would", "could", "should", "may",
    "might", "it", "its", "this", "that", "by", "from", "not", "no",
  ]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopwords.has(w))
  );
}

function findBestMatch(
  currKeywords: Set<string>,
  candidates: Array<{ item: DigestItem; keywords: Set<string> }>
): { item: DigestItem; score: number } | null {
  let best: { item: DigestItem; score: number } | null = null;

  for (const { item, keywords } of candidates) {
    const score = jaccardSimilarity(currKeywords, keywords);
    if (!best || score > best.score) {
      best = { item, score };
    }
  }

  return best;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}
