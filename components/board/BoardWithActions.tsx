"use client";

import { useState } from "react";
import { KanbanBoard } from "./KanbanBoard";
import { NewTicketForm } from "./NewTicketForm";

export function BoardWithActions() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <NewTicketForm onCreated={() => setRefreshKey((k) => k + 1)} />
      </div>
      <KanbanBoard key={refreshKey} />
    </>
  );
}
