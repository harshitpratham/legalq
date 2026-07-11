"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { format, subDays } from "date-fns";

type Detail = {
  volume: { date: string; created: number; completed: number }[];
  mix: {
    category: Record<string, number>;
    urgency: Record<string, number>;
    status: Record<string, number>;
  };
  throughput: {
    avgDaysCreatedToComplete: number | null;
    medianDaysCreatedToComplete: number | null;
    avgDaysStartedToComplete: number | null;
    completedCount: number;
  };
  workload: { id: string | null; name: string; openCount: number }[];
  topRequesters: { email: string; count: number }[];
  aging: { d0_2: number; d3_7: number; d8_14: number; d15_plus: number };
  pastDue: number;
};

function MixList({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <Card title={title}>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No data</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span>{k.replace(/_/g, " ")}</span>
              <span className="font-medium">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function ReportsPage() {
  const [from, setFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/reports/detail?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxVol = data
    ? Math.max(1, ...data.volume.map((v) => Math.max(v.created, v.completed)))
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--primary)]">Reports</h1>
          <p className="text-sm text-[var(--muted)]">Volume, throughput, and workload</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button type="button" onClick={load}>
            Apply
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              window.location.href = `/api/reports/export?from=${from}&to=${to}`;
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <p className="text-[var(--muted)]">Loading reports...</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-xs text-[var(--muted)]">Completed in range</p>
              <p className="text-2xl font-semibold">{data.throughput.completedCount}</p>
            </Card>
            <Card>
              <p className="text-xs text-[var(--muted)]">Avg days to complete</p>
              <p className="text-2xl font-semibold">
                {data.throughput.avgDaysCreatedToComplete ?? "—"}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-[var(--muted)]">Median days to complete</p>
              <p className="text-2xl font-semibold">
                {data.throughput.medianDaysCreatedToComplete ?? "—"}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-[var(--muted)]">Past due (open)</p>
              <p className="text-2xl font-semibold text-red-700">{data.pastDue}</p>
            </Card>
          </div>

          <Card title="Volume (created vs completed)">
            <div className="flex h-40 items-end gap-0.5 overflow-x-auto">
              {data.volume.map((v) => (
                <div key={v.date} className="flex min-w-[10px] flex-1 flex-col items-center gap-0.5">
                  <div className="flex w-full flex-1 items-end gap-px">
                    <div
                      className="w-1/2 rounded-t bg-[var(--primary)]"
                      style={{ height: `${(v.created / maxVol) * 100}%`, minHeight: v.created ? 2 : 0 }}
                      title={`${v.date} created: ${v.created}`}
                    />
                    <div
                      className="w-1/2 rounded-t bg-[var(--accent)]"
                      style={{
                        height: `${(v.completed / maxVol) * 100}%`,
                        minHeight: v.completed ? 2 : 0,
                      }}
                      title={`${v.date} completed: ${v.completed}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              <span className="inline-block h-2 w-2 rounded-sm bg-[var(--primary)]" /> Created{" "}
              <span className="ml-2 inline-block h-2 w-2 rounded-sm bg-[var(--accent)]" /> Completed
            </p>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <MixList title="By category" data={data.mix.category} />
            <MixList title="By urgency" data={data.mix.urgency} />
            <MixList title="By status" data={data.mix.status} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Workload (open)">
              <ul className="space-y-1.5 text-sm">
                {data.workload.map((w) => (
                  <li key={w.id ?? "u"} className="flex justify-between">
                    <span>{w.name}</span>
                    <span className="font-medium">{w.openCount}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Top requesters">
              <ul className="space-y-1.5 text-sm">
                {data.topRequesters.length === 0 && (
                  <li className="text-[var(--muted)]">No data in range</li>
                )}
                {data.topRequesters.map((r) => (
                  <li key={r.email} className="flex justify-between gap-2">
                    <span className="truncate">{r.email}</span>
                    <span className="font-medium">{r.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
