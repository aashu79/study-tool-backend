-- CreateTable
CREATE TABLE "study_plans" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "currentKnowledgeLevel" TEXT,
    "targetTimelineDays" INTEGER,
    "studyHoursPerWeek" INTEGER,
    "dailyStudyMinutes" INTEGER,
    "specialInstruction" TEXT,
    "overview" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "estimatedTotalHours" INTEGER,
    "estimatedWeeks" INTEGER,
    "modelUsed" TEXT NOT NULL DEFAULT 'qwen/qwen3-32b',
    "sourceWordCount" INTEGER NOT NULL DEFAULT 0,
    "sourceTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_plans_fileId_idx" ON "study_plans"("fileId");

-- CreateIndex
CREATE INDEX "study_plans_userId_idx" ON "study_plans"("userId");

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
