"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Ticket, TicketStatus, Message, User, Attachment, AuditEvent } from "@prisma/client";
import { TICKET_CATEGORIES, TICKET_STATUSES, URGENCY_LEVELS } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Thread } from "./Thread";
import { CommentBox } from "./CommentBox";
import { format } from "date-fns";

type TicketFull = Ticket & {
  assignee?: Pick<User, "id" | "name" | "email"> | null;
  messages: (Message & { author?: Pick<User, "id" | "name" | "email"> | null })[];
  attachments: Attachment[];
  auditEvents: AuditEvent[];
};

export function TicketDetail({ id }: { id: string }) {
  const [ticket, setTicket] = useState<TicketFull | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTicket = useCallback(async () => {
    const res = await fetch(`/api/tickets/${id}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTicket(data.ticket);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  const changeStatus = async (status: TicketStatus) => {
    let comment: string | undefined;
    if (status === "IN_REVIEW") {
      comment = window.prompt("Questions for the requester (optional):") ?? undefined;
    }

    const res = await fetch(`/api/tickets/${id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, comment }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to update status");
      return;
    }
    const data = await res.json();
    setTicket((prev) => (prev ? { ...prev, ...data.ticket } : prev));
    fetchTicket();
  };

  if (loading) {
    return <p className="text-[var(--muted)]">Loading...</p>;
  }

  if (!ticket) {
    return (
      <div>
        <p>Ticket not found.</p>
        <Link href="/board" className="text-[var(--primary)] underline">
          Back to board
        </Link>
      </div>
    );
  }

  const categoryLabel = TICKET_CATEGORIES.find((c) => c.value === ticket.category)?.label;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/board" className="text-sm text-[var(--primary)] hover:underline">
          ← Back to board
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--primary)]">{ticket.title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          #{ticket.id.slice(-8)} · {ticket.requesterName ?? ticket.requesterEmail}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ticket.urgency === "HIGH" && <Badge variant="urgent">Urgent</Badge>}
        <Badge variant="category">{categoryLabel}</Badge>
        <Badge>
          {TICKET_STATUSES.find((s) => s.value === ticket.status)?.label ?? ticket.status}
        </Badge>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <h2 className="mb-2 font-medium">Description</h2>
        <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-[var(--muted)] sm:grid-cols-4">
          <div>
            <dt>Created</dt>
            <dd className="text-[var(--foreground)]">
              {format(new Date(ticket.createdAt), "MMM d, yyyy")}
            </dd>
          </div>
          {ticket.startedAt && (
            <div>
              <dt>Started</dt>
              <dd className="text-[var(--foreground)]">
                {format(new Date(ticket.startedAt), "MMM d, yyyy")}
              </dd>
            </div>
          )}
          <div>
            <dt>Urgency</dt>
            <dd className="text-[var(--foreground)]">
              {URGENCY_LEVELS.find((u) => u.value === ticket.urgency)?.label}
            </dd>
          </div>
          <div>
            <dt>Requester</dt>
            <dd className="text-[var(--foreground)]">{ticket.requesterEmail}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <h2 className="mb-3 font-medium">Move status</h2>
        <div className="flex flex-wrap gap-2">
          {TICKET_STATUSES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              disabled={ticket.status === value}
              onClick={() => changeStatus(value)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                ticket.status === value
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] hover:bg-slate-50"
              } disabled:cursor-default`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <h2 className="mb-3 font-medium">Conversation</h2>
          <Thread messages={ticket.messages} />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <h2 className="mb-3 font-medium">Add comment</h2>
          <CommentBox ticketId={id} onSent={fetchTicket} />
        </div>
      </div>
    </div>
  );
}
