-- AlterEnum AuditEventType
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ASSIGNEE_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DUE_DATE_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SUMMARY_REFRESHED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'USER_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'USER_UPDATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'USER_DEACTIVATED';

-- CreateEnum UserRole
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- User auth fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

-- Migrate role string -> UserRole enum
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role_new" "UserRole" NOT NULL DEFAULT 'USER';
UPDATE "User" SET "role_new" = CASE
  WHEN UPPER("role") = 'ADMIN' THEN 'ADMIN'::"UserRole"
  ELSE 'USER'::"UserRole"
END;
ALTER TABLE "User" DROP COLUMN "role";
ALTER TABLE "User" RENAME COLUMN "role_new" TO "role";

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

-- Ticket fields
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "aiSummaryAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Ticket_dueAt_idx" ON "Ticket"("dueAt");

-- AuditEvent: optional ticketId
ALTER TABLE "AuditEvent" ALTER COLUMN "ticketId" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_type_idx" ON "AuditEvent"("type");
CREATE INDEX IF NOT EXISTS "AuditEvent_userId_idx" ON "AuditEvent"("userId");
