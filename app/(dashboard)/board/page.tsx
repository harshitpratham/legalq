import { BoardWithActions } from "@/components/board/BoardWithActions";

export default function BoardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--primary)]">Legal requests</h1>
        <p className="text-sm text-[var(--muted)]">
          Drag tickets between columns to update status. Requesters are notified automatically.
        </p>
      </div>
      <BoardWithActions />
    </div>
  );
}
