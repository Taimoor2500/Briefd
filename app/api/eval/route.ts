import { NextRequest, NextResponse } from "next/server";
import {
  runStructuralChecks,
  runGoldenAssertions,
  aggregateEvalResult,
} from "@/lib/eval";
import { judgeDigest } from "@/lib/claude";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { Digest, EvalRequest, EvalResponse } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: EvalRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Rate limit: 20 eval runs per IP per minute
  const ip = getClientIp(req);
  const rl = rateLimit(`eval:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.resetInMs / 1000);
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const digest: Digest = body.digest;
  if (!digest || !digest.items || !digest.rawUpdates) {
    return NextResponse.json(
      { error: "digest is required with items and rawUpdates" },
      { status: 400 }
    );
  }

  // Layer 1: structural checks (fast, no AI)
  const structuralChecks = runStructuralChecks(digest);

  // Layer 2: golden assertions (fast, no AI)
  const goldenChecks = runGoldenAssertions(digest);

  const allChecks = [...structuralChecks, ...goldenChecks];
  const baseResult = aggregateEvalResult(allChecks);

  // Layer 3: LLM-as-judge (async, costs tokens — run best-effort)
  let llmJudge = undefined;
  try {
    llmJudge = await judgeDigest(digest);
  } catch (err) {
    console.warn("[eval] LLM judge failed:", err);
    // Non-fatal — return structural result without judge score
  }

  const response: EvalResponse = {
    result: {
      ...baseResult,
      checks: allChecks,
      llmJudge,
    },
  };

  return NextResponse.json(response);
}
