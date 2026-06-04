"use client";

import Link from "next/link";
import type { Ticket, TicketCategory, Urgency } from "@prisma/client";
import { Badge } from "@/components/ui/Badge";
import { formatDistanceToNow } from "date-fns";

const categoryLabels: Record<TicketCategory, string> = {
  AGREEMENT: "Agreement",
  DATA_PROTECTION: "Data Protection",
  OTHER: "Other",
};

export function TicketCard({
  ticket,
}: {
  ticket: Ticket & { _count?: { messages: number } };
}) {
  return (
    <Link
      href={`/ticket/${ticket.id}`}
      className="block rounded-lg border border-[var(--border)] bg-white p-3 shadow-sm transition hover:border-[var(--primary)] hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{ticket.title}</h3>
        {ticket.urgency === "HIGH" && <Badge variant="urgent">Urgent</Badge>}
      </div>
      <p className="mb-2 line-clamp-2 text-xs text-[var(--muted)]">
        {ticket.requesterName ?? ticket.requesterEmail}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="category">{categoryLabels[ticket.category]}</Badge>
        <span className="text-xs text-[var(--muted)]">
          {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
        </span>
      </div>
    </Link>
  );
}
