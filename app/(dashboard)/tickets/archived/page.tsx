import { Suspense } from "react";
import TicketsListPage from "../TicketsListClient";

export default function ArchivedTicketsPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading...</p>}>
      <TicketsListPage variant="archived" />
    </Suspense>
  );
}
