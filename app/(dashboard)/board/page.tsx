import { KanbanBoard } from "@/components/board/KanbanBoard";

export default function BoardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--primary)]">Legal requests</h1>
        <p className="text-sm text-[var(--muted)]">
          Tickets arrive from Zapier. Drag cards to update status — requesters are emailed via Resend.
        </p>
      </div>
      <KanbanBoard />
    </div>
  );
}
