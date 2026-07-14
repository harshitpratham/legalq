-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ticket_archivedAt_idx" ON "Ticket"("archivedAt");
