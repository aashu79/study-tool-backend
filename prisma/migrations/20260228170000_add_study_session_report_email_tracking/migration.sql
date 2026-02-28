ALTER TABLE "study_sessions"
ADD COLUMN "reportEmailSentAt" TIMESTAMP(3),
ADD COLUMN "reportEmailLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "reportEmailLastError" TEXT,
ADD COLUMN "reportEmailSendCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "study_sessions_status_reportEmailSentAt_idx"
ON "study_sessions"("status", "reportEmailSentAt");
