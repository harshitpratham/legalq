import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import type { TicketCategory, Urgency } from "@prisma/client";
import type { TriageResult } from "@/lib/types";

const TriageSchema = z.object({
  isLegalRequest: z.boolean(),
  category: z.enum(["AGREEMENT", "DATA_PROTECTION", "OTHER"]),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
  title: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
});

function getBedrockClient() {
  return new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        }
      : undefined,
  });
}

const TRIAGE_PROMPT = `You are a legal intake assistant for an international NGO legal team.
Analyze the email and return ONLY valid JSON (no markdown) with this shape:
{
  "isLegalRequest": boolean,
  "category": "AGREEMENT" | "DATA_PROTECTION" | "OTHER",
  "urgency": "LOW" | "MEDIUM" | "HIGH",
  "title": "short ticket title",
  "summary": "2-4 sentence summary of the request",
  "confidence": 0.0-1.0
}

Rules:
- isLegalRequest=true for agreements, contracts, NDAs, MOUs, vendor/partner legal reviews, data protection/privacy questions directed to legal.
- isLegalRequest=false for general HR, IT, finance (non-legal), newsletters, meeting invites unrelated to legal work.
- urgency HIGH if email mentions tomorrow, urgent, ASAP, deadline within 48h.
- category AGREEMENT for contracts/agreements; DATA_PROTECTION for privacy/GDPR/DPA; OTHER otherwise.`;

export async function triageEmail(input: {
  subject: string;
  body: string;
  from: string;
}): Promise<TriageResult> {
  const modelId =
    process.env.BEDROCK_MODEL_ID ??
    "anthropic.claude-3-5-sonnet-20241022-v2:0";

  if (!process.env.AWS_ACCESS_KEY_ID && process.env.NODE_ENV === "development") {
    return heuristicTriage(input);
  }

  try {
    const client = getBedrockClient();
    const userContent = `From: ${input.from}\nSubject: ${input.subject}\n\n${input.body.slice(0, 8000)}`;

    const body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      temperature: 0,
      system: TRIAGE_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    });

    const response = await client.send(command);
    const decoded = new TextDecoder().decode(response.body);
    const parsed = JSON.parse(decoded) as {
      content?: { type: string; text?: string }[];
    };
    const text = parsed.content?.[0]?.text ?? decoded;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in model response");

    const result = TriageSchema.parse(JSON.parse(jsonMatch[0]));
    return {
      isLegalRequest: result.isLegalRequest,
      category: result.category as TicketCategory,
      urgency: result.urgency as Urgency,
      title: result.title,
      summary: result.summary,
      confidence: result.confidence,
    };
  } catch (err) {
    console.error("Bedrock triage failed, using heuristic:", err);
    return heuristicTriage(input);
  }
}

function heuristicTriage(input: {
  subject: string;
  body: string;
  from: string;
}): TriageResult {
  const text = `${input.subject} ${input.body}`.toLowerCase();
  const legalKeywords = [
    "agreement",
    "contract",
    "nda",
    "mou",
    "legal",
    "review",
    "data protection",
    "privacy",
    "gdpr",
    "dpa",
  ];
  const isLegal = legalKeywords.some((k) => text.includes(k));
  const urgent =
    text.includes("urgent") ||
    text.includes("asap") ||
    text.includes("tomorrow") ||
    text.includes("by eod");

  let category: TicketCategory = "OTHER";
  if (text.includes("agreement") || text.includes("contract") || text.includes("nda")) {
    category = "AGREEMENT";
  } else if (
    text.includes("data protection") ||
    text.includes("privacy") ||
    text.includes("gdpr")
  ) {
    category = "DATA_PROTECTION";
  }

  return {
    isLegalRequest: isLegal,
    category,
    urgency: urgent ? "HIGH" : "MEDIUM",
    title: input.subject.slice(0, 120) || "Legal request",
    summary: input.body.slice(0, 500) || input.subject,
    confidence: 0.5,
  };
}
