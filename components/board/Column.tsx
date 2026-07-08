"use client";

import type { Ticket, TicketStatus } from "@prisma/client";
import { TicketCard } from "./TicketCard";

export function Column({
  title,
  status,
  tickets,
  onDrop,
  canEdit = true,
}: {
  title: string;
  status: TicketStatus;
  tickets: (Ticket & { _count?: { messages: number } })[];
  onDrop: (ticketId: string, newStatus: TicketStatus) => void;
  canEdit?: boolean;
}) {
  return (
    <div
      className="flex min-h-[400px] flex-1 flex-col rounded-xl border border-[var(--border)] bg-slate-50/80"
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        e.currentTarget.classList.add("ring-2", "ring-[var(--primary)]");
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove("ring-2", "ring-[var(--primary)]");
      }}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        e.currentTarget.classList.remove("ring-2", "ring-[var(--primary)]");
        const ticketId = e.dataTransfer.getData("ticketId");
        if (ticketId) onDrop(ticketId, status);
      }}
    >
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="font-semibold text-[var(--primary)]">{title}</h2>
        <span className="text-xs text-[var(--muted)]">{tickets.length} items</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            draggable={canEdit}
            onDragStart={(e) => {
              if (!canEdit) return;
              e.dataTransfer.setData("ticketId", ticket.id);
            }}
            className={canEdit ? "cursor-grab active:cursor-grabbing" : ""}
          >
            <TicketCard ticket={ticket} />
          </div>
        ))}
        {tickets.length === 0 && (
          <p className="py-8 text-center text-xs text-[var(--muted)]">No tickets</p>
        )}
      </div>
    </div>
  );
}
