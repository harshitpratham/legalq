import { prisma } from "@/lib/db/prisma";

const MATCH_CONFIDENCE_THRESHOLD = 0.7;
const MAX_CANDIDATES = 20;
const DEFAULT_MODEL = "gpt-5.4-mini";

export type ThreadMatchResult = {
  matchedTicketId: string | null;
  confidence: number;
  reason?: string;
};

type OpenAIMatchResponse = {
  matchedTicketId: string | null;
  confidence: number;
  reason: string;
};

export async function findMatchingTicket(params: {
  title: string;
  description: string;
  requesterEmail: string;
}): Promise<ThreadMatchResult> {
  const candidates = await prisma.ticket.findMany({
    where: {
      requesterEmail: { equals: params.requesterEmail, mode: "insensitive" },
      status: { not: "COMPLETE" },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_CANDIDATES,
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
    },
  });

  if (candidates.length === 0) {
    return { matchedTicketId: null, confidence: 0 };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { matchedTicketId: null, confidence: 0, reason: "OPENAI_API_KEY not set" };
  }

  try {
    const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    const candidateList = candidates
      .map(
        (t, i) =>
          `${i + 1}. id=${t.id}\n   title: ${t.title}\n   description: ${t.description.slice(0, 300)}${t.description.length > 300 ? "..." : ""}\n   status: ${t.status}`
      )
      .join("\n\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_completion_tokens: 256,
        reasoning_effort: "none",
        messages: [
          {
            role: "system",
            content:
              "You are a legal intake assistant. Decide if a new request is a continuation of an existing open ticket (same email thread, follow-up, reply with more info) or a separate new request. Match only when clearly the same conversation. Do not match unrelated topics from the same person.",
          },
          {
            role: "user",
            content: `NEW REQUEST:
title: ${params.title}
description: ${params.description.slice(0, 800)}

OPEN TICKETS FROM SAME REQUESTER:
${candidateList}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "thread_match",
            strict: true,
            schema: {
              type: "object",
              properties: {
                matchedTicketId: { type: ["string", "null"] },
                confidence: { type: "number" },
                reason: { type: "string" },
              },
              required: ["matchedTicketId", "confidence", "reason"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenAI thread match API error:", res.status, errText);
      return { matchedTicketId: null, confidence: 0, reason: "API error" };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { matchedTicketId: null, confidence: 0, reason: "No response content" };
    }

    const parsed = JSON.parse(content) as OpenAIMatchResponse;
    const candidateIds = new Set(candidates.map((c) => c.id));

    if (
      parsed.matchedTicketId &&
      candidateIds.has(parsed.matchedTicketId) &&
      parsed.confidence >= MATCH_CONFIDENCE_THRESHOLD
    ) {
      return {
        matchedTicketId: parsed.matchedTicketId,
        confidence: parsed.confidence,
        reason: parsed.reason,
      };
    }

    return {
      matchedTicketId: null,
      confidence: parsed.confidence ?? 0,
      reason: parsed.reason,
    };
  } catch (err) {
    console.error("OpenAI thread match failed:", err);
    return { matchedTicketId: null, confidence: 0, reason: "Exception" };
  }
}
