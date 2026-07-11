"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Ticket } from "@prisma/client";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { TICKET_CATEGORIES, TICKET_STATUSES, URGENCY_LEVELS } from "@/lib/types";
import { differenceInCalendarDays, formatDistanceToNow } from "date-fns";

type TicketRow = Ticket & {
  assignee?: { id: string; name: string | null; username: string | null } | null;
  _count?: { messages: number };
};

type UserOpt = { id: string; name: string | null; username: string | null };

export default function TicketsListPage() {
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [urgency, setUrgency] = useState(searchParams.get("urgency") ?? "");
  const [category, setCategory] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [stale, setStale] = useState(searchParams.get("stale") === "1");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"created" | "age" | "urgency">("urgency");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status && status !== "open") params.set("status", status);
    if (urgency) params.set("urgency", urgency);
    if (category) params.set("category", category);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (stale) params.set("stale", "1");

    const res = await fetch(`/api/tickets?${params}`);
    if (res.ok) {
      const data = await res.json();
      let list: TicketRow[] = data.tickets;
      if (status === "open") {
        list = list.filter((t) => t.status !== "COMPLETE");
      }
      setTickets(list);
    }
    setLoading(false);
  }, [q, status, urgency, category, assigneeId, stale]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  }, []);

  const sorted = useMemo(() => {
    const list = [...tickets];
    if (sort === "age") {
      list.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    } else if (sort === "created") {
      list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    } else {
      const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>;
      list.sort(
        (a, b) =>
          (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9) ||
          +new Date(b.createdAt) - +new Date(a.createdAt)
      );
    }
    return list;
  }, [tickets, sort]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--primary)]">Tickets</h1>
        <p className="text-sm text-[var(--muted)]">Searchable queue view</p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search title, requester, summary..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.username}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={stale} onChange={(e) => setStale(e.target.checked)} />
            Stale 7d+
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="urgency">Sort: urgency</option>
            <option value="created">Sort: newest</option>
            <option value="age">Sort: oldest</option>
          </select>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="text-[var(--muted)]">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                  <th className="pb-2 pr-3 font-medium">Title</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Urgency</th>
                  <th className="pb-2 pr-3 font-medium">Requester</th>
                  <th className="pb-2 pr-3 font-medium">Assignee</th>
                  <th className="pb-2 pr-3 font-medium">Age</th>
                  <th className="pb-2 font-medium">AI summary</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/ticket/${t.id}`}
                        className="font-medium text-[var(--primary)] hover:underline"
                      >
                        {t.title}
                      </Link>
                      {t._count && t._count.messages > 0 && (
                        <span className="ml-2 text-xs text-[var(--muted)]">
                          {t._count.messages} msgs
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge>
                        {TICKET_STATUSES.find((s) => s.value === t.status)?.label ?? t.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      {t.urgency === "HIGH" ? <Badge variant="urgent">High</Badge> : t.urgency}
                    </td>
                    <td className="py-2.5 pr-3">{t.requesterName ?? t.requesterEmail}</td>
                    <td className="py-2.5 pr-3">
                      {t.assignee?.name ?? t.assignee?.username ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-[var(--muted)]">
                      {differenceInCalendarDays(new Date(), new Date(t.createdAt))}d ·{" "}
                      {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                    </td>
                    <td className="py-2.5 max-w-xs truncate text-[var(--muted)]">
                      {t.aiSummary ?? "—"}
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[var(--muted)]">
                      No tickets match
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
