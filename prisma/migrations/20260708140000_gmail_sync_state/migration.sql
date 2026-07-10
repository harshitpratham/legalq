-- CreateTable
CREATE TABLE "GmailSyncState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "historyId" TEXT,
    "watchExpiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailSyncState_pkey" PRIMARY KEY ("id")
);

-- Seed default row
INSERT INTO "GmailSyncState" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
