-- CreateEnum
CREATE TYPE "DocumentChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "document_chat_threads" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chat_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "DocumentChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "groundedInDocument" BOOLEAN NOT NULL DEFAULT false,
    "usedGeneralKnowledge" BOOLEAN NOT NULL DEFAULT false,
    "citations" JSONB,
    "followUpQuestions" JSONB,
    "modelUsed" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "retrievalQuery" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_chat_threads_fileId_userId_updatedAt_idx" ON "document_chat_threads"("fileId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "document_chat_threads_userId_lastMessageAt_idx" ON "document_chat_threads"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "document_chat_messages_threadId_createdAt_idx" ON "document_chat_messages"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "document_chat_messages_role_idx" ON "document_chat_messages"("role");

-- AddForeignKey
ALTER TABLE "document_chat_threads" ADD CONSTRAINT "document_chat_threads_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chat_threads" ADD CONSTRAINT "document_chat_threads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chat_messages" ADD CONSTRAINT "document_chat_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "document_chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
