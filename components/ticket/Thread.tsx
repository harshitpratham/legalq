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

function initials(label: string) {
  return label
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Thread({ messages }: { messages: MessageWithAuthor[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No messages yet.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const label = authorLabels[msg.authorType];
        const isInbound = msg.direction === "INBOUND";
        return (
          <div
            key={msg.id}
            className={`flex gap-3 ${isInbound ? "" : "flex-row-reverse"}`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isInbound
                  ? "bg-slate-200 text-slate-700"
                  : "bg-[var(--primary)] text-white"
              }`}
            >
              {initials(msg.author?.name ?? label)}
            </div>
            <div
              className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm ${
                isInbound
                  ? "rounded-tl-md border-slate-200 bg-slate-50"
                  : "rounded-tr-md border-[var(--primary)]/15 bg-[color-mix(in_srgb,var(--primary)_6%,white)]"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <span>
                  {label}
                  {msg.author?.name ? ` · ${msg.author.name}` : ""}
                </span>
                <span>{format(new Date(msg.createdAt), "MMM d, yyyy h:mm a")}</span>
              </div>
              <p className="whitespace-pre-wrap">{msg.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
