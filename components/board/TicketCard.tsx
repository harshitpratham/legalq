"use client";

import Link from "next/link";
import type { Ticket, TicketCategory } from "@prisma/client";
import { Badge } from "@/components/ui/Badge";
import { formatDistanceToNow } from "date-fns";

const categoryLabels: Record<TicketCategory, string> = {
  AGREEMENT: "Agreement",
  DATA_PROTECTION: "Data Protection",
  OTHER: "Other",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TicketCard({
  ticket,
}: {
  ticket: Ticket & {
    _count?: { messages: number };
    assignee?: { name: string | null; username: string | null } | null;
  };
}) {
  const assigneeName = ticket.assignee?.name ?? ticket.assignee?.username;

  return (
    <Link
      href={`/ticket/${ticket.id}`}
      className="block rounded-lg border border-[var(--border)] bg-white p-3 shadow-sm transition hover:border-[var(--primary)] hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{ticket.title}</h3>
        {ticket.urgency === "HIGH" && <Badge variant="urgent">Urgent</Badge>}
      </div>
      {ticket.aiSummary && (
        <p className="mb-2 line-clamp-2 text-xs text-[var(--muted)]">{ticket.aiSummary}</p>
      )}
      <p className="mb-2 line-clamp-1 text-xs text-[var(--muted)]">
        {ticket.requesterName ?? ticket.requesterEmail}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="category">{categoryLabels[ticket.category]}</Badge>
        {ticket._count && ticket._count.messages > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-[var(--muted)]">
            {ticket._count.messages} msgs
          </span>
        )}
        {assigneeName && (
          <span
            title={assigneeName}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[9px] font-semibold text-white"
          >
            {initials(assigneeName)}
          </span>
        )}
        <span className="text-xs text-[var(--muted)]">
          {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
        </span>
      </div>
    </Link>
  );
}
