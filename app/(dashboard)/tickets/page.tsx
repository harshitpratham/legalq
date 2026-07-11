import { Suspense } from "react";
import TicketsListPage from "./TicketsListClient";

export default function TicketsPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading...</p>}>
      <TicketsListPage />
    </Suspense>
  );
}
