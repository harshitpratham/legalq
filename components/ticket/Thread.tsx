"use client";

import type { Message, User } from "@prisma/client";
import { format } from "date-fns";

type MessageWithAuthor = Message & {
  author?: Pick<User, "id" | "name" | "email"> | null;
};

const authorLabels = {
  SYSTEM: "System",
  AGENT: "Legal Team",
  STAKEHOLDER: "Requester",
};

export function Thread({ messages }: { messages: MessageWithAuthor[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No messages yet.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`rounded-lg border p-3 text-sm ${
            msg.direction === "INBOUND"
              ? "border-slate-200 bg-slate-50"
              : "border-[var(--primary)]/20 bg-white"
          }`}
        >
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted)]">
            <span>
              {authorLabels[msg.authorType]}
              {msg.author?.name ? ` · ${msg.author.name}` : ""}
            </span>
            <span>{format(new Date(msg.createdAt), "MMM d, yyyy h:mm a")}</span>
          </div>
          <p className="whitespace-pre-wrap">{msg.body}</p>
        </div>
      ))}
    </div>
  );
}
