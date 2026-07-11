"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { AUDIT_EVENT_LABELS } from "@/lib/types";
import type { AuditEventType } from "@prisma/client";
import { format } from "date-fns";

type EventRow = {
  id: string;
  type: AuditEventType;
  createdAt: string;
  payload: unknown;
  ticket?: { id: string; title: string } | null;
  user?: { id: string; name: string | null; username: string | null } | null;
};

function payloadSummary(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (p.from && p.to) return `${p.from} → ${p.to}`;
  if (p.comment) return String(p.comment).slice(0, 80);
  if (p.summary) return String(p.summary).slice(0, 80);
  if (p.username) return String(p.username);
  if (p.source) return `source: ${p.source}`;
  return JSON.stringify(p).slice(0, 80);
}

export default function AuditPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/audit?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events);
      setPages(data.pagination.pages || 1);
    }
    setLoading(false);
  }, [page, type, q, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/audit/export?${params}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--primary)]">Audit log</h1>
          <p className="text-sm text-[var(--muted)]">System and user activity trail</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => { window.location.href = exportUrl(); }}>
          Export CSV
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search ticket or actor..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <select
            value={type}
            onChange={(e) => {
              setPage(1);
              setType(e.target.value);
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            {Object.entries(AUDIT_EVENT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="max-w-[10rem]" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="max-w-[10rem]" />
          <Button
            type="button"
            onClick={() => {
              setPage(1);
              load();
            }}
          >
            Filter
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="text-[var(--muted)]">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                  <th className="pb-2 pr-3 font-medium">Time</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Actor</th>
                  <th className="pb-2 pr-3 font-medium">Ticket</th>
                  <th className="pb-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-[var(--muted)]">
                      {format(new Date(e.createdAt), "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge>{AUDIT_EVENT_LABELS[e.type] ?? e.type}</Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      {e.user?.name ?? e.user?.username ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {e.ticket ? (
                        <Link href={`/ticket/${e.ticket.id}`} className="text-[var(--primary)] hover:underline">
                          {e.ticket.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 text-[var(--muted)]">{payloadSummary(e.payload)}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--muted)]">
                      No events found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-[var(--muted)]">
            Page {page} of {pages}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}
