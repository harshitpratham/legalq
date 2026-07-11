"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { Ticket, TicketStatus } from "@prisma/client";
import { TICKET_CATEGORIES, TICKET_STATUSES, URGENCY_LEVELS } from "@/lib/types";
import { Column } from "./Column";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";

type BoardTicket = Ticket & {
  _count?: { messages: number };
  assignee?: { name: string | null; username: string | null } | null;
};

export function KanbanBoard() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [tickets, setTickets] = useState<BoardTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [urgency, setUrgency] = useState("");
  const [category, setCategory] = useState("");
  const [reviewTicketId, setReviewTicketId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets");
      if (!res.ok) throw new Error("Failed to load tickets");
      const data = await res.json();
      setTickets(data.tickets);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (urgency && t.urgency !== urgency) return false;
      if (category && t.category !== category) return false;
      if (q) {
        const hay = `${t.title} ${t.requesterEmail} ${t.requesterName ?? ""} ${t.aiSummary ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [tickets, q, urgency, category]);

  const openCount = tickets.filter((t) => t.status !== "COMPLETE").length;
  const urgentCount = tickets.filter((t) => t.status !== "COMPLETE" && t.urgency === "HIGH").length;

  const applyTransition = async (ticketId: string, newStatus: TicketStatus, comment?: string) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;

    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await fetch(`/api/tickets/${ticketId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, comment }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Transition failed");
      }
      const data = await res.json();
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? data.ticket : t)));
    } catch (e) {
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? ticket : t)));
      setError(e instanceof Error ? e.message : "Failed to update ticket");
    }
  };

  const handleDrop = async (ticketId: string, newStatus: TicketStatus) => {
    if (!isAdmin) return;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === newStatus) return;

    if (newStatus === "IN_REVIEW") {
      setReviewTicketId(ticketId);
      setPendingStatus(newStatus);
      setReviewComment("");
      return;
    }
    await applyTransition(ticketId, newStatus);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-slate-200/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          <span className="font-medium text-[var(--foreground)]">{openCount} open</span>
          {" · "}
          <span className="font-medium text-red-700">{urgentCount} urgent</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-[12rem]"
          />
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">All urgency</option>
            {URGENCY_LEVELS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button type="button" onClick={fetchTickets} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TICKET_STATUSES.map(({ value, label }) => (
          <Column
            key={value}
            title={label}
            status={value}
            tickets={filtered.filter((t) => t.status === value)}
            onDrop={handleDrop}
            canEdit={isAdmin}
          />
        ))}
      </div>

      {reviewTicketId && pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card title="Move to In Review" className="w-full max-w-md">
            <Textarea
              rows={4}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Questions for the requester (optional)"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setReviewTicketId(null);
                  setPendingStatus(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  const id = reviewTicketId;
                  const status = pendingStatus;
                  setReviewTicketId(null);
                  setPendingStatus(null);
                  await applyTransition(id, status, reviewComment || undefined);
                }}
              >
                Confirm
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
