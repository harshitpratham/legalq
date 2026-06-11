"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-4 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link href="/board" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
            LQ
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--primary)]">LegalQ</h1>
            <p className="text-xs text-[var(--muted)]">Pratham Legal Requests</p>
          </div>
        </Link>
        {session?.user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--muted)]">
              {session.user.name ?? session.user.email}
            </span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
