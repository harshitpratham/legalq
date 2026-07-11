"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AUDIT_EVENT_LABELS, TICKET_STATUSES } from "@/lib/types";
import { format } from "date-fns";

type Overview = {
  kpis: {
    openTickets: number;
    urgentOpen: number;
    newThisWeek: number;
    completedThisWeek: number;
    avgDaysToComplete: number | null;
    staleOpen: number;
    pastDue: number;
  };
  byStatus: Record<string, number>;
  aging: { d0_2: number; d3_7: number; d8_14: number; d15_plus: number };
  needsAttention: {
    id: string;
    title: string;
    urgency: string;
    status: string;
    ageDays: number;
    awaitingReply: boolean;
  }[];
  recentActivity: {
    id: string;
    type: keyof typeof AUDIT_EVENT_LABELS;
    createdAt: string;
    ticket?: { id: string; title: string } | null;
    user?: { name: string | null; username: string | null } | null;
  }[];
  workload: { id: string | null; name: string; openCount: number }[];
};

function Kpi({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--primary)]">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports/overview")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load dashboard");
        setData(await res.json());
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }
  if (!data) {
    return <p className="text-[var(--muted)]">Loading dashboard...</p>;
  }

  const { kpis, aging, byStatus, needsAttention, recentActivity, workload } = data;
  const agingTotal = aging.d0_2 + aging.d3_7 + aging.d8_14 + aging.d15_plus || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--primary)]">Dashboard</h1>
        <p className="text-sm text-[var(--muted)]">Legal operations overview</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Open" value={kpis.openTickets} href="/tickets?status=open" />
        <Kpi label="Urgent" value={kpis.urgentOpen} href="/tickets?urgency=HIGH" />
        <Kpi label="New this week" value={kpis.newThisWeek} />
        <Kpi label="Completed this week" value={kpis.completedThisWeek} />
        <Kpi label="Avg days to close" value={kpis.avgDaysToComplete ?? "—"} />
        <Kpi label="Stale (7d+)" value={kpis.staleOpen} href="/tickets?stale=1" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By status">
          <ul className="space-y-2">
            {TICKET_STATUSES.map(({ value, label }) => {
              const count = byStatus[value] ?? 0;
              return (
                <li key={value} className="flex items-center justify-between text-sm">
                  <Link href={`/tickets?status=${value}`} className="hover:underline">
                    {label}
                  </Link>
                  <span className="font-medium">{count}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Aging (open)">
          <div className="space-y-2">
            {(
              [
                ["0–2 days", aging.d0_2],
                ["3–7 days", aging.d3_7],
                ["8–14 days", aging.d8_14],
                ["15+ days", aging.d15_plus],
              ] as const
            ).map(([label, count]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[var(--primary)]"
                    style={{ width: `${(count / agingTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {kpis.pastDue > 0 && (
              <p className="pt-2 text-sm text-red-700">{kpis.pastDue} past due</p>
            )}
          </div>
        </Card>

        <Card
          title="Needs attention"
          action={
            <Link href="/tickets" className="text-xs text-[var(--primary)] hover:underline">
              View all
            </Link>
          }
        >
          {needsAttention.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nothing urgent right now.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {needsAttention.map((t) => (
                <li key={t.id} className="py-2">
                  <Link href={`/ticket/${t.id}`} className="text-sm font-medium hover:underline">
                    {t.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {t.urgency === "HIGH" && <Badge variant="urgent">Urgent</Badge>}
                    {t.awaitingReply && <Badge>Awaiting reply</Badge>}
                    <span className="text-xs text-[var(--muted)]">{t.ageDays}d open</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent activity"
          action={
            isAdmin ? (
              <Link href="/admin/audit" className="text-xs text-[var(--primary)] hover:underline">
                Audit log
              </Link>
            ) : undefined
          }
        >
          <ul className="space-y-2">
            {recentActivity.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-[var(--muted)]">
                  {format(new Date(e.createdAt), "MMM d, HH:mm")}
                </span>{" "}
                <Badge>{AUDIT_EVENT_LABELS[e.type] ?? e.type}</Badge>
                {e.ticket && (
                  <>
                    {" "}
                    <Link href={`/ticket/${e.ticket.id}`} className="hover:underline">
                      {e.ticket.title}
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Workload">
        <div className="flex flex-wrap gap-3">
          {workload.map((w) => (
            <div
              key={w.id ?? "unassigned"}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="text-[var(--muted)]">{w.name}</span>
              <span className="ml-2 font-semibold text-[var(--primary)]">{w.openCount}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
