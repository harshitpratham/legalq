"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Ticket, TicketStatus, Message, User, Attachment, AuditEvent } from "@prisma/client";
import { AUDIT_EVENT_LABELS, TICKET_CATEGORIES, TICKET_STATUSES, URGENCY_LEVELS } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Thread } from "./Thread";
import { CommentBox } from "./CommentBox";
import { format } from "date-fns";

type AuditRow = AuditEvent & {
  user?: Pick<User, "id" | "name" | "username"> | null;
};

type TicketFull = Ticket & {
  assignee?: Pick<User, "id" | "name" | "email" | "username"> | null;
  messages: (Message & { author?: Pick<User, "id" | "name" | "email"> | null })[];
  attachments: Attachment[];
  auditEvents: AuditRow[];
};

type UserOpt = { id: string; name: string | null; username: string | null };

export function TicketDetail({ id }: { id: string }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [ticket, setTicket] = useState<TicketFull | null>(null);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [dueAt, setDueAt] = useState("");

  const fetchTicket = useCallback(async () => {
    const res = await fetch(`/api/tickets/${id}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTicket(data.ticket);
    setAssigneeId(data.ticket.assigneeId ?? "");
    setDueAt(data.ticket.dueAt ? format(new Date(data.ticket.dueAt), "yyyy-MM-dd") : "");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  }, [isAdmin]);

  const runTransition = async (status: TicketStatus, comment?: string) => {
    setError(null);
    const res = await fetch(`/api/tickets/${id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, comment }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update status");
      return;
    }
    setReviewOpen(false);
    setReviewComment("");
    setPendingStatus(null);
    fetchTicket();
  };

  const changeStatus = (status: TicketStatus) => {
    if (status === "IN_REVIEW") {
      setPendingStatus(status);
      setReviewOpen(true);
      return;
    }
    runTransition(status);
  };

  const saveMeta = async () => {
    setError(null);
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigneeId: assigneeId || null,
        dueAt: dueAt || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      return;
    }
    fetchTicket();
  };

  const refreshSummary = async () => {
    setSummaryLoading(true);
    setError(null);
    const res = await fetch(`/api/tickets/${id}/summarize`, { method: "POST" });
    setSummaryLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Summary failed");
      return;
    }
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
        <p className="text-sm text-[var(--muted)]">
          <Link href="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          {" / "}
          <Link href="/board" className="hover:underline">
            Board
          </Link>
          {" / "}
          <span className="text-[var(--foreground)]">{ticket.title}</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--primary)]">{ticket.title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          #{ticket.id.slice(-8)} · {ticket.requesterName ?? ticket.requesterEmail}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ticket.urgency === "HIGH" && <Badge variant="urgent">Urgent</Badge>}
        <Badge variant="category">{categoryLabel}</Badge>
        <Badge>
          {TICKET_STATUSES.find((s) => s.value === ticket.status)?.label ?? ticket.status}
        </Badge>
        {ticket.dueAt && new Date(ticket.dueAt) < new Date() && ticket.status !== "COMPLETE" && (
          <Badge variant="urgent">Past due</Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card
            title="AI summary"
            action={
              isAdmin ? (
                <Button type="button" size="sm" variant="secondary" disabled={summaryLoading} onClick={refreshSummary}>
                  {summaryLoading ? "Refreshing..." : "Refresh"}
                </Button>
              ) : undefined
            }
          >
            <p className="text-sm leading-relaxed">
              {ticket.aiSummary ?? "No summary yet. Admins can generate one with Refresh."}
            </p>
          </Card>

          <Card title="Description">
            <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
          </Card>

          {ticket.attachments.length > 0 && (
            <Card title="Attachments">
              <ul className="space-y-1 text-sm">
                {ticket.attachments.map((a) => (
                  <li key={a.id} className="text-[var(--muted)]">
                    {a.filename}
                    {a.mimeType ? ` · ${a.mimeType}` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Conversation">
            <Thread messages={ticket.messages} />
            {isAdmin && (
              <CommentBox
                ticketId={id}
                requesterEmail={ticket.requesterEmail}
                onSent={fetchTicket}
              />
            )}
          </Card>

          <Card
            title="Activity"
            action={
              <button
                type="button"
                className="text-xs text-[var(--primary)] hover:underline"
                onClick={() => setActivityOpen((o) => !o)}
              >
                {activityOpen ? "Hide" : "Show"}
              </button>
            }
          >
            {activityOpen ? (
              <ul className="space-y-2 text-sm">
                {ticket.auditEvents.map((e) => (
                  <li key={e.id} className="border-b border-[var(--border)] pb-2 last:border-0">
                    <span className="text-[var(--muted)]">
                      {format(new Date(e.createdAt), "MMM d, HH:mm")}
                    </span>{" "}
                    <Badge>{AUDIT_EVENT_LABELS[e.type] ?? e.type}</Badge>
                    {e.user?.name && (
                      <span className="text-[var(--muted)]"> · {e.user.name}</span>
                    )}
                  </li>
                ))}
                {ticket.auditEvents.length === 0 && (
                  <li className="text-[var(--muted)]">No activity yet</li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                {ticket.auditEvents.length} recent events — expand to view
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card title="Details">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--muted)]">Created</dt>
                <dd>{format(new Date(ticket.createdAt), "MMM d, yyyy")}</dd>
              </div>
              {ticket.startedAt && (
                <div>
                  <dt className="text-xs text-[var(--muted)]">Started</dt>
                  <dd>{format(new Date(ticket.startedAt), "MMM d, yyyy")}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-[var(--muted)]">Urgency</dt>
                <dd>{URGENCY_LEVELS.find((u) => u.value === ticket.urgency)?.label}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Requester</dt>
                <dd className="break-all">{ticket.requesterEmail}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Assignee</dt>
                <dd>{ticket.assignee?.name ?? ticket.assignee?.username ?? "Unassigned"}</dd>
              </div>
              {ticket.dueAt && (
                <div>
                  <dt className="text-xs text-[var(--muted)]">Due</dt>
                  <dd>{format(new Date(ticket.dueAt), "MMM d, yyyy")}</dd>
                </div>
              )}
            </dl>
          </Card>

          {isAdmin ? (
            <>
              <Card title="Assignment">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--muted)]">Assignee</label>
                    <select
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name ?? u.username}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--muted)]">Due date</label>
                    <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                  </div>
                  <Button type="button" size="sm" onClick={saveMeta}>
                    Save
                  </Button>
                </div>
              </Card>

              <Card title="Move status">
                <div className="flex flex-col gap-2">
                  {TICKET_STATUSES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={ticket.status === value}
                      onClick={() => changeStatus(value)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${
                        ticket.status === value
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : "border-[var(--border)] hover:bg-slate-50"
                      } disabled:cursor-default`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <p className="text-sm text-[var(--muted)]">
                View-only access. Ask an admin to update status or reply.
              </p>
            </Card>
          )}
        </div>
      </div>

      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card title="Move to In Review" className="w-full max-w-md">
            <p className="mb-3 text-sm text-[var(--muted)]">
              Optional questions or notes for the requester (emailed on status change).
            </p>
            <Textarea
              rows={4}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="What do you need from the requester?"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setReviewOpen(false);
                  setPendingStatus(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => pendingStatus && runTransition(pendingStatus, reviewComment || undefined)}
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
