"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/board", label: "Board" },
  { href: "/tickets", label: "Tickets" },
  { href: "/tickets/archived", label: "Archived" },
  { href: "/reports", label: "Reports" },
];

const adminNav = [
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/users", label: "Users" },
];

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isAdmin = session?.user?.role === "admin";
  const links = isAdmin ? [...nav, ...adminNav] : nav;
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const runGmailSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/admin/gmail-sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(data.error ?? "Sync failed");
        return;
      }
      const processed = data.processed ?? 0;
      const skipped = data.skipped ?? 0;
      setSyncMsg(
        processed > 0
          ? `Synced — ${processed} new ticket${processed === 1 ? "" : "s"}`
          : `Inbox up to date (${skipped} skipped)`
      );
    } catch {
      setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
              LQ
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-[var(--primary)]">LegalQ</h1>
              <p className="text-xs text-[var(--muted)]">Pratham Legal Requests</p>
            </div>
          </Link>
          {session?.user && (
            <nav className="flex flex-wrap items-center gap-1">
              {links.map((link) => {
                const active =
                  link.href === "/tickets"
                    ? pathname === "/tickets"
                    : pathname === link.href || pathname.startsWith(link.href + "/");
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--foreground)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
        {session?.user && (
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <div className="flex flex-col items-end gap-0.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={syncing}
                  onClick={runGmailSync}
                >
                  {syncing ? "Syncing…" : "Sync inbox"}
                </Button>
                {syncMsg && (
                  <span className="max-w-[200px] truncate text-xs text-[var(--muted)]">{syncMsg}</span>
                )}
              </div>
            )}
            <span className="hidden text-sm text-[var(--muted)] sm:inline">
              {session.user.name ?? session.user.email}
              <span className="ml-2 rounded-full bg-[color-mix(in_srgb,var(--accent)_25%,white)] px-2 py-0.5 text-xs capitalize text-[var(--primary)]">
                {session.user.role}
              </span>
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
