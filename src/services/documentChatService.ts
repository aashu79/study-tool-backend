import axios from "axios";
import {
  DocumentChatRole,
  Prisma,
  ProcessingStatus,
} from "@prisma/client";
import prisma from "../lib/prismaClient";
import {
  DocumentChatSource,
  generateDocumentChatAnswer,
} from "./aiService";

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || "http://localhost:8000";
const CHAT_MODEL = process.env.GROQ_MODEL_ID || "qwen/qwen3-32b";
const MAX_THREAD_TITLE_LENGTH = 80;
const MAX_USER_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_MESSAGE_CHARS = 700;
const MAX_OVERVIEW_CHARS = 2200;
const MAX_SOURCE_EXCERPT_CHARS = 1400;
const MAX_TOTAL_SOURCE_CHARS = 9000;
const MAX_RETRIEVAL_RESULTS = 8;

interface AuthUser {
  id?: string;
  user_id?: string;
}

interface CreateDocumentChatThreadInput {
  title?: string;
}

interface SendDocumentChatMessageInput {
  threadId?: string;
  message: string;
  title?: string;
}

interface PaginationInput {
  page?: number;
  limit?: number;
}

interface RetrievedChunk {
  chunkId: string;
  content: string;
  pageStart: number | null;
  similarity?: number;
}

function getUserId(authUser: AuthUser | null | undefined): string {
  const userId = authUser?.id || authUser?.user_id;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function createPreview(value: string, maxLength = 140): string {
  return truncateText(value, maxLength);
}

function sanitizeTitle(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(String(value || ""));
  if (!normalized) return null;

  return normalized.slice(0, MAX_THREAD_TITLE_LENGTH);
}

function sanitizeMessage(value: unknown): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("message is required");
  }

  if (normalized.length > MAX_USER_MESSAGE_LENGTH) {
    throw new Error(
      `message must be ${MAX_USER_MESSAGE_LENGTH} characters or fewer`,
    );
  }

  return normalized;
}

function deriveThreadTitle(message: string): string {
  const cleaned = normalizeWhitespace(
    message.replace(/^[#>*-\s]+/, "").replace(/[?!.]+$/, ""),
  );
  if (!cleaned) return "New document chat";

  const words = cleaned.split(" ");
  const compact = words.slice(0, 10).join(" ");
  return truncateText(compact, MAX_THREAD_TITLE_LENGTH) || "New document chat";
}

function parseStringList(value: Prisma.JsonValue | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;|]/g)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function parseStoredSources(
  value: Prisma.JsonValue | null | undefined,
): DocumentChatSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sources: DocumentChatSource[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const refId = String(record.refId || "").trim();
    const excerpt = String(record.excerpt || "").trim();
    const chunkId =
      typeof record.chunkId === "string" ? record.chunkId.trim() : undefined;
    const pageStart =
      typeof record.pageStart === "number" ? Math.floor(record.pageStart) : null;

    if (!refId || !excerpt) {
      continue;
    }

    sources.push({
      refId,
      ...(chunkId ? { chunkId } : {}),
      pageStart,
      excerpt,
    });
  }

  return sources;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function ensureOwnedFile(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      userId: true,
      filename: true,
      processingStatus: true,
      _count: {
        select: {
          chunks: true,
        },
      },
    },
  });

  if (!file) {
    throw new Error("File not found");
  }

  if (file.userId !== userId) {
    throw new Error("Unauthorized access to file");
  }

  return file;
}

async function ensureOwnedThread(threadId: string, userId: string) {
  const thread = await prisma.documentChatThread.findUnique({
    where: { id: threadId },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          processingStatus: true,
          _count: {
            select: {
              chunks: true,
            },
          },
        },
      },
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  if (!thread) {
    throw new Error("Document chat thread not found");
  }

  if (thread.userId !== userId) {
    throw new Error("Unauthorized access to document chat thread");
  }

  return thread;
}

function isDocumentReady(file: {
  processingStatus: ProcessingStatus;
  _count: { chunks: number };
}): boolean {
  return (
    file.processingStatus === ProcessingStatus.COMPLETED &&
    file._count.chunks > 0
  );
}

async function getLatestDocumentOverview(fileId: string): Promise<string | null> {
  const summary = await prisma.summary.findFirst({
    where: { fileId },
    orderBy: { createdAt: "desc" },
    select: {
      content: true,
    },
  });

  if (!summary?.content) {
    return null;
  }

  return truncateText(summary.content, MAX_OVERVIEW_CHARS);
}

async function retrieveChunksFromWorker(
  fileId: string,
  query: string,
  topK: number,
): Promise<RetrievedChunk[]> {
  const response: any = await axios.post(
    `${WORKER_BASE_URL}/retrieve`,
    { query, fileId, top_k: topK },
    { timeout: 30000 },
  );

  const hits = Array.isArray(response?.data?.hits) ? response.data.hits : [];
  return hits
    .map((hit: any) => ({
      chunkId: String(hit.chunkId || "").trim(),
      content: String(hit.content || "").trim(),
      pageStart:
        typeof hit.pageStart === "number" ? Math.floor(hit.pageStart) : null,
      similarity:
        typeof hit.similarity === "number" ? hit.similarity : undefined,
    }))
    .filter((chunk: RetrievedChunk) => Boolean(chunk.chunkId && chunk.content));
}

function extractKeywordTokens(text: string): string[] {
  return Array.from(
    new Set(
      normalizeWhitespace(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/g)
        .filter((token) => token.length >= 4)
        .slice(0, 12),
    ),
  );
}

async function fallbackChunkSearch(
  fileId: string,
  query: string,
): Promise<RetrievedChunk[]> {
  const keywords = extractKeywordTokens(query);
  if (keywords.length === 0) {
    return [];
  }

  const chunks = await prisma.documentChunk.findMany({
    where: {
      fileId,
      OR: keywords.map((keyword) => ({
        content: {
          contains: keyword,
          mode: "insensitive",
        },
      })),
    },
    select: {
      id: true,
      content: true,
      pageStart: true,
    },
    take: 24,
  });

  return chunks
    .map((chunk) => {
      const content = normalizeWhitespace(chunk.content);
      const lower = content.toLowerCase();
      const score = keywords.reduce((total, keyword) => {
        return total + (lower.includes(keyword) ? 1 : 0);
      }, 0);

      return {
        chunkId: chunk.id,
        content,
        pageStart: chunk.pageStart,
        similarity: score,
      } satisfies RetrievedChunk;
    })
    .filter((chunk) => Boolean(chunk.content))
    .sort(
      (left, right) =>
        (right.similarity || 0) - (left.similarity || 0) ||
        (left.pageStart ?? 999999) - (right.pageStart ?? 999999),
    )
    .slice(0, MAX_RETRIEVAL_RESULTS);
}

function buildRetrievalQuery(
  userQuestion: string,
  recentMessages: Array<{ role: DocumentChatRole; content: string }>,
): string {
  const recentContext = recentMessages
    .slice(-4)
    .map((message) => `${message.role}: ${truncateText(message.content, 220)}`)
    .join("\n");

  return recentContext
    ? `${recentContext}\nUSER: ${userQuestion}`
    : userQuestion;
}

function buildPromptHistory(
  messages: Array<{ role: DocumentChatRole; content: string }>,
) {
  return messages.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content: truncateText(message.content, MAX_HISTORY_MESSAGE_CHARS),
  }));
}

function selectPromptSources(chunks: RetrievedChunk[]): DocumentChatSource[] {
  const selected: DocumentChatSource[] = [];
  const seenChunkIds = new Set<string>();
  let totalChars = 0;

  for (const chunk of chunks) {
    if (!chunk.chunkId || !chunk.content || seenChunkIds.has(chunk.chunkId)) {
      continue;
    }

    const excerpt = truncateText(chunk.content, MAX_SOURCE_EXCERPT_CHARS);
    if (!excerpt) continue;

    const nextTotal = totalChars + excerpt.length;
    if (selected.length > 0 && nextTotal > MAX_TOTAL_SOURCE_CHARS) {
      break;
    }

    const refId = `D${selected.length + 1}`;
    selected.push({
      refId,
      chunkId: chunk.chunkId,
      pageStart: chunk.pageStart,
      excerpt,
    });
    seenChunkIds.add(chunk.chunkId);
    totalChars = nextTotal;
  }

  return selected;
}

function formatThread(thread: {
  id: string;
  fileId: string;
  title: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  file: {
    filename: string;
    processingStatus: ProcessingStatus;
  };
  _count?: {
    messages: number;
  };
  messages?: Array<{
    content: string;
  }>;
}) {
  return {
    id: thread.id,
    fileId: thread.fileId,
    fileName: thread.file.filename,
    title: thread.title,
    documentStatus: thread.file.processingStatus,
    messageCount: thread._count?.messages ?? 0,
    latestMessagePreview: thread.messages?.[0]
      ? createPreview(thread.messages[0].content)
      : null,
    lastMessageAt: thread.lastMessageAt,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

function formatMessage(message: {
  id: string;
  role: DocumentChatRole;
  content: string;
  groundedInDocument: boolean;
  usedGeneralKnowledge: boolean;
  citations: Prisma.JsonValue | null;
  followUpQuestions: Prisma.JsonValue | null;
  modelUsed: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  createdAt: Date;
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    groundedInDocument: message.groundedInDocument,
    usedGeneralKnowledge: message.usedGeneralKnowledge,
    citations: parseStoredSources(message.citations),
    followUpQuestions: parseStringList(message.followUpQuestions),
    modelUsed: message.modelUsed,
    usage:
      message.promptTokens !== null ||
      message.completionTokens !== null ||
      message.totalTokens !== null
        ? {
            promptTokens: message.promptTokens,
            completionTokens: message.completionTokens,
            totalTokens: message.totalTokens,
          }
        : null,
    createdAt: message.createdAt,
  };
}

export async function createDocumentChatThread(
  fileId: string,
  authUser: AuthUser,
  input?: CreateDocumentChatThreadInput,
) {
  const userId = getUserId(authUser);
  const file = await ensureOwnedFile(fileId, userId);
  const title = sanitizeTitle(input?.title) || "New document chat";

  const thread = await prisma.documentChatThread.create({
    data: {
      fileId,
      userId,
      title,
    },
    include: {
      file: {
        select: {
          filename: true,
          processingStatus: true,
        },
      },
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  return formatThread({
    ...thread,
    file: {
      filename: file.filename,
      processingStatus: file.processingStatus,
    },
  });
}

export async function listDocumentChatThreads(
  fileId: string,
  authUser: AuthUser,
  options?: PaginationInput,
) {
  const userId = getUserId(authUser);
  await ensureOwnedFile(fileId, userId);

  const page = clamp(Number(options?.page ?? 1), 1, 1000);
  const limit = clamp(Number(options?.limit ?? 10), 1, 50);

  const [threads, total] = await Promise.all([
    prisma.documentChatThread.findMany({
      where: {
        fileId,
        userId,
      },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        file: {
          select: {
            filename: true,
            processingStatus: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            content: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    }),
    prisma.documentChatThread.count({
      where: {
        fileId,
        userId,
      },
    }),
  ]);

  return {
    threads: threads.map((thread) => formatThread(thread)),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDocumentChatMessages(
  threadId: string,
  authUser: AuthUser,
  options?: PaginationInput,
) {
  const userId = getUserId(authUser);
  const thread = await ensureOwnedThread(threadId, userId);

  const page = clamp(Number(options?.page ?? 1), 1, 1000);
  const limit = clamp(Number(options?.limit ?? 30), 1, 100);

  const [messages, total] = await Promise.all([
    prisma.documentChatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.documentChatMessage.count({
      where: { threadId },
    }),
  ]);

  return {
    thread: formatThread(thread),
    messages: messages.map((message) => formatMessage(message)),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function renameDocumentChatThread(
  threadId: string,
  authUser: AuthUser,
  input: { title?: string },
) {
  const userId = getUserId(authUser);
  const thread = await ensureOwnedThread(threadId, userId);
  const title = sanitizeTitle(input.title);

  if (!title) {
    throw new Error("title is required");
  }

  const updated = await prisma.documentChatThread.update({
    where: { id: threadId },
    data: { title },
    include: {
      file: {
        select: {
          filename: true,
          processingStatus: true,
        },
      },
      _count: {
        select: {
          messages: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
        },
      },
    },
  });

  return formatThread({
    ...updated,
    file: {
      filename: thread.file.filename,
      processingStatus: thread.file.processingStatus,
    },
  });
}

export async function deleteDocumentChatThread(
  threadId: string,
  authUser: AuthUser,
) {
  const userId = getUserId(authUser);
  await ensureOwnedThread(threadId, userId);

  await prisma.documentChatThread.delete({
    where: { id: threadId },
  });

  return {
    threadId,
    deleted: true,
  };
}

export async function sendDocumentChatMessage(
  fileId: string,
  authUser: AuthUser,
  input: SendDocumentChatMessageInput,
) {
  const userId = getUserId(authUser);
  const message = sanitizeMessage(input.message);

  const file = await ensureOwnedFile(fileId, userId);
  const existingThread = input.threadId
    ? await ensureOwnedThread(input.threadId, userId)
    : null;

  if (existingThread && existingThread.fileId !== fileId) {
    throw new Error("threadId does not belong to the specified file");
  }

  const recentStoredMessages = existingThread
    ? await prisma.documentChatMessage.findMany({
        where: { threadId: existingThread.id },
        orderBy: { createdAt: "desc" },
        take: MAX_HISTORY_MESSAGES,
        select: {
          role: true,
          content: true,
        },
      })
    : [];

  const recentMessages = recentStoredMessages.reverse();
  const retrievalQuery = buildRetrievalQuery(message, recentMessages);
  const documentReady = isDocumentReady(file);

  let documentOverview: string | null = null;
  let retrievedChunks: RetrievedChunk[] = [];

  if (documentReady) {
    documentOverview = await getLatestDocumentOverview(fileId);

    try {
      retrievedChunks = await retrieveChunksFromWorker(
        fileId,
        retrievalQuery,
        MAX_RETRIEVAL_RESULTS,
      );
    } catch (error: any) {
      console.warn(
        "[DocumentChatService] Vector retrieval failed, using DB fallback:",
        error.message,
      );
    }

    if (retrievedChunks.length === 0) {
      retrievedChunks = await fallbackChunkSearch(fileId, retrievalQuery);
    }
  }

  const promptSources = selectPromptSources(retrievedChunks);
  const assistantReply = await generateDocumentChatAnswer({
    fileName: file.filename,
    userQuestion: message,
    documentReady,
    documentOverview,
    recentMessages: buildPromptHistory(recentMessages),
    retrievedSources: promptSources,
  });

  const saved = await prisma.$transaction(async (tx) => {
    const thread =
      existingThread ||
      (await tx.documentChatThread.create({
        data: {
          fileId,
          userId,
          title: sanitizeTitle(input.title) || deriveThreadTitle(message),
        },
      }));

    const userMessage = await tx.documentChatMessage.create({
      data: {
        threadId: thread.id,
        role: DocumentChatRole.USER,
        content: message,
        retrievalQuery,
      },
    });

    const assistantMessage = await tx.documentChatMessage.create({
      data: {
        threadId: thread.id,
        role: DocumentChatRole.ASSISTANT,
        content: assistantReply.answer,
        groundedInDocument: assistantReply.groundedInDocument,
        usedGeneralKnowledge: assistantReply.usedGeneralKnowledge,
        citations: toJsonValue(assistantReply.citations),
        followUpQuestions: toJsonValue(assistantReply.followUpQuestions),
        modelUsed: CHAT_MODEL,
        promptTokens: assistantReply.promptTokens ?? null,
        completionTokens: assistantReply.completionTokens ?? null,
        totalTokens: assistantReply.totalTokens ?? null,
        retrievalQuery,
      },
    });

    const refreshedThread = await tx.documentChatThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: assistantMessage.createdAt,
        ...(existingThread
          ? {}
          : {
              title: sanitizeTitle(input.title) || deriveThreadTitle(message),
            }),
      },
      include: {
        file: {
          select: {
            filename: true,
            processingStatus: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            content: true,
          },
        },
      },
    });

    return {
      thread: refreshedThread,
      userMessage,
      assistantMessage,
    };
  });

  return {
    thread: formatThread(saved.thread),
    userMessage: formatMessage({
      ...saved.userMessage,
      citations: null,
      followUpQuestions: null,
      modelUsed: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    }),
    assistantMessage: formatMessage(saved.assistantMessage),
    context: {
      documentReady,
      documentStatus: file.processingStatus,
      retrievalQuery,
      sourcesUsed: assistantReply.citations,
      sourceCount: promptSources.length,
    },
  };
}
