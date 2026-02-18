-- CreateEnum
CREATE TYPE "StudySessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "StudyEventType" AS ENUM ('SESSION_STARTED', 'SESSION_ENDED', 'VIEW_SUMMARY', 'OPEN_FLASHCARD', 'START_QUIZ', 'SUBMIT_QUIZ', 'ANSWER_QUESTION', 'CUSTOM_ACTIVITY');

-- CreateEnum
CREATE TYPE "DistractionType" AS ENUM ('TAB_SWITCH', 'WINDOW_BLUR', 'INACTIVITY_TIMEOUT', 'APP_BACKGROUND', 'OTHER');

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "sessionStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionEnd" TIMESTAMP(3),
    "status" "StudySessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "focusTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "idleTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "distractionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" "StudyEventType" NOT NULL,
    "eventData" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distraction_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "distractionType" "DistractionType" NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distraction_events_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "quiz_attempts" ADD COLUMN "sessionId" TEXT;

-- CreateIndex
CREATE INDEX "study_sessions_userId_idx" ON "study_sessions"("userId");

-- CreateIndex
CREATE INDEX "study_sessions_fileId_idx" ON "study_sessions"("fileId");

-- CreateIndex
CREATE INDEX "study_sessions_status_idx" ON "study_sessions"("status");

-- CreateIndex
CREATE INDEX "study_events_sessionId_idx" ON "study_events"("sessionId");

-- CreateIndex
CREATE INDEX "study_events_eventType_idx" ON "study_events"("eventType");

-- CreateIndex
CREATE INDEX "study_events_timestamp_idx" ON "study_events"("timestamp");

-- CreateIndex
CREATE INDEX "distraction_events_sessionId_idx" ON "distraction_events"("sessionId");

-- CreateIndex
CREATE INDEX "distraction_events_distractionType_idx" ON "distraction_events"("distractionType");

-- CreateIndex
CREATE INDEX "distraction_events_timestamp_idx" ON "distraction_events"("timestamp");

-- CreateIndex
CREATE INDEX "quiz_attempts_sessionId_idx" ON "quiz_attempts"("sessionId");

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_events" ADD CONSTRAINT "study_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distraction_events" ADD CONSTRAINT "distraction_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "study_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
