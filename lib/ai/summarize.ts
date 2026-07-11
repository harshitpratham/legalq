import { prisma } from "@/lib/db/prisma";

const DEFAULT_MODEL = "gpt-5.4-mini";

export async function summarizeTicket(ticketId: string, userId?: string | null): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { authorType: true, body: true, direction: true },
      },
    },
  });
  if (!ticket) return null;

  const recent = [...ticket.messages].reverse()
    .map((m) => `[${m.authorType}/${m.direction}] ${m.body.slice(0, 400)}`)
    .join("\n\n");

  try {
    const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: 200,
        reasoning_effort: "none",
        messages: [
          {
            role: "system",
            content:
              "You summarize legal intake tickets for a legal operations team. Write 1-2 concise sentences covering the request, current status of the conversation, and any open ask. No fluff.",
          },
          {
            role: "user",
            content: `Title: ${ticket.title}\nCategory: ${ticket.category}\nUrgency: ${ticket.urgency}\nStatus: ${ticket.status}\nDescription: ${ticket.description.slice(0, 1200)}\n\nRecent messages:\n${recent || "(none)"}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ticket_summary",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
              },
              required: ["summary"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!res.ok) {
      console.error("OpenAI summarize error:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { summary: string };
    const summary = parsed.summary?.trim();
    if (!summary) return null;

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { aiSummary: summary, aiSummaryAt: new Date() },
    });

    await prisma.auditEvent.create({
      data: {
        ticketId,
        type: "SUMMARY_REFRESHED",
        userId: userId ?? null,
        payload: { summary: summary.slice(0, 200) },
      },
    });

    return summary;
  } catch (err) {
    console.error("summarizeTicket failed:", err);
    return null;
  }
}

/** Fire-and-forget summary refresh — never blocks intake. */
export function queueTicketSummary(ticketId: string, userId?: string | null) {
  void summarizeTicket(ticketId, userId).catch((err) =>
    console.error("queueTicketSummary error:", err)
  );
}
