import { KanbanBoard } from "@/components/board/KanbanBoard";

export default function BoardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--primary)]">Board</h1>
        <p className="text-sm text-[var(--muted)]">
          Drag cards to update status. Tickets arrive from the legal@ inbox.
        </p>
      </div>
      <KanbanBoard />
    </div>
  );
}
