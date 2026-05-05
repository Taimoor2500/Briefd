import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { parseUpdates, renumberUpdates } from "@/lib/parser";
import { generateDigest, PROMPT_VERSION } from "@/lib/claude";
import { computeDiff } from "@/lib/diff";
import { hashText } from "@/lib/hash";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { Digest, GenerateRequest, GenerateResponse } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Pro allows up to 300s; 60 is safe

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();

  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Rate limit: 10 generations per IP per minute
  const ip = getClientIp(req);
  const rl = rateLimit(`generate:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.resetInMs / 1000);
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { rawText, previousDigestId, label } = body;

  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return NextResponse.json(
      { error: "rawText is required and must be non-empty" },
      { status: 400 }
    );
  }

  // Input length guard — prevent abuse / runaway costs
  if (rawText.length > 50_000) {
    return NextResponse.json(
      { error: "Input too large (max 50,000 characters)" },
      { status: 400 }
    );
  }

  // Parse raw text into structured updates
  let updates = parseUpdates(rawText);
  if (updates.length === 0) {
    return NextResponse.json(
      {
        error:
          "Could not parse any updates from the input. Please use the format: 'Name · Day\\nUpdate text'",
      },
      { status: 422 }
    );
  }
  updates = renumberUpdates(updates);

  // Optionally receive a previous digest for diff mode
  // (passed as part of the request body — no DB needed)
  let previousDigest: Digest | undefined;
  if (body && "previousDigest" in body) {
    previousDigest = (body as GenerateRequest & { previousDigest?: Digest })
      .previousDigest;
  }

  try {
    const { output, inputTokens, outputTokens, model } = await generateDigest(
      updates,
      previousDigest
    );

    const digest: Digest = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      label: label?.trim() || undefined,
      items: output.items,
      rawUpdates: updates,
      model,
      promptVersion: PROMPT_VERSION,
      generationMs: Date.now() - t0,
      inputTokens,
      outputTokens,
      inputHash: hashText(rawText.trim()),
    };

    // Compute diff if we have a previous digest
    let diff = undefined;
    if (previousDigest) {
      diff = computeDiff(previousDigest, digest);
    }

    const response: GenerateResponse = {
      digest,
      diff,
      warnings: output.warnings,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate] Error:", message);

    // Don't leak internal errors to clients in production
    if (message.includes("ANTHROPIC_API_KEY")) {
      return NextResponse.json(
        { error: "API key not configured on server" },
        { status: 503 }
      );
    }
    if (message.includes("Schema validation failed") || message.includes("non-JSON")) {
      return NextResponse.json(
        { error: "AI returned an unexpected response format. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Generation failed. Please try again." },
      { status: 500 }
    );
  }
}
