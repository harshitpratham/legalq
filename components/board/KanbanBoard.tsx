"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { Ticket, TicketStatus } from "@prisma/client";
import { TICKET_STATUSES } from "@/lib/types";
import { Column } from "./Column";

export function KanbanBoard() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleDrop = async (ticketId: string, newStatus: TicketStatus) => {
    if (!isAdmin) return;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === newStatus) return;

    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );

    const needsComment = newStatus === "IN_REVIEW";
    let comment: string | undefined;
    if (needsComment) {
      comment = window.prompt("Add questions or notes for the requester (optional):") ?? undefined;
    }

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
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? data.ticket : t))
      );
    } catch (e) {
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? ticket : t))
      );
      alert(e instanceof Error ? e.message : "Failed to update ticket");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--muted)]">
        Loading board...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        {error}
        <button
          type="button"
          onClick={fetchTickets}
          className="ml-4 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {TICKET_STATUSES.map(({ value, label }) => (
        <Column
          key={value}
          title={label}
          status={value}
          tickets={tickets.filter((t) => t.status === value)}
          onDrop={handleDrop}
          canEdit={isAdmin}
        />
      ))}
    </div>
  );
}
