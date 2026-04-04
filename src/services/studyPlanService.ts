import { Prisma, ProcessingStatus } from "@prisma/client";
import prisma from "../lib/prismaClient";
import {
  countWords,
  estimateTokenCount,
  generateStudyPlan,
  StudyPlanStructure,
  synthesizeChunks,
} from "./aiService";

const GROQ_MODEL = process.env.GROQ_MODEL_ID || "qwen/qwen3-32b";
const MAX_DIRECT_SOURCE_CHARS = 45000;
const MAX_SYNTHESIS_BATCH_CHARS = 18000;
const MAX_TITLE_LENGTH = 120;

interface AuthUser {
  id?: string;
  user_id?: string;
}

export interface CreateStudyPlanInput {
  customTitle?: string;
  objective?: string;
  currentKnowledgeLevel?: string;
  targetTimelineDays?: number;
  studyHoursPerWeek?: number;
  dailyStudyMinutes?: number;
  specialInstruction?: string;
}

interface ListStudyPlanOptions {
  page?: number;
  limit?: number;
  fileId?: string;
}

type FileChunkRecord = {
  id: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
};

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

function sanitizeTitle(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(String(value || ""));
  if (!normalized) return null;
  return normalized.slice(0, MAX_TITLE_LENGTH);
}

function parseOptionalPositiveInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error("Numeric study plan options must be positive integers");
  }

  return parsed;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function formatChunk(chunk: FileChunkRecord): string {
  const pageLabel =
    chunk.pageStart !== null
      ? chunk.pageEnd !== null && chunk.pageEnd !== chunk.pageStart
        ? `Pages ${chunk.pageStart}-${chunk.pageEnd}`
        : `Page ${chunk.pageStart}`
      : "Unnumbered page";

  return `[${pageLabel}]\n${normalizeWhitespace(chunk.content)}`;
}

function chunkIntoBatches(chunks: FileChunkRecord[], maxChars: number) {
  const batches: Array<Array<{ content: string; page?: number }>> = [];
  let currentBatch: Array<{ content: string; page?: number }> = [];
  let currentChars = 0;

  for (const chunk of chunks) {
    const formatted = formatChunk(chunk);
    const length = formatted.length;

    if (currentBatch.length > 0 && currentChars + length > maxChars) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push({
      content: formatted,
      ...(chunk.pageStart !== null ? { page: chunk.pageStart } : {}),
    });
    currentChars += length;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function buildStudyPlanSourceContent(
  fileName: string,
  chunks: FileChunkRecord[],
): Promise<string> {
  const directContent = chunks.map((chunk) => formatChunk(chunk)).join("\n\n");
  if (directContent.length <= MAX_DIRECT_SOURCE_CHARS) {
    return directContent;
  }

  const batches = chunkIntoBatches(chunks, MAX_SYNTHESIS_BATCH_CHARS);
  const batchSummaries: string[] = [];

  for (let index = 0; index < batches.length; index += 1) {
    const summary = await synthesizeChunks(
      `${fileName} (study-plan batch ${index + 1})`,
      batches[index],
    );
    batchSummaries.push(summary);
  }

  const combinedBatchSummary = batchSummaries
    .map((summary, index) => `[Section Summary ${index + 1}]\n${summary}`)
    .join("\n\n");

  if (combinedBatchSummary.length <= MAX_DIRECT_SOURCE_CHARS) {
    return `This is a compressed full-document synthesis built from every document chunk.\n\n${combinedBatchSummary}`;
  }

  const masterSummary = await synthesizeChunks(
    `${fileName} (full study-plan synthesis)`,
    batchSummaries.map((summary, index) => ({
      content: `[Section Summary ${index + 1}]\n${summary}`,
    })),
  );

  return `This is a compressed full-document synthesis built from every document chunk.\n\n${masterSummary}`;
}

async function ensureOwnedFile(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: {
      chunks: {
        select: { id: true },
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

async function ensureOwnedStudyPlan(planId: string, userId: string) {
  const plan = await prisma.studyPlan.findUnique({
    where: { id: planId },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
        },
      },
    },
  });

  if (!plan) {
    throw new Error("Study plan not found");
  }

  if (plan.userId !== userId) {
    throw new Error("Unauthorized access to study plan");
  }

  return plan;
}

async function getAllFileChunks(fileId: string): Promise<FileChunkRecord[]> {
  return prisma.documentChunk.findMany({
    where: { fileId },
    orderBy: { chunkIndex: "asc" },
    select: {
      id: true,
      content: true,
      pageStart: true,
      pageEnd: true,
    },
  });
}

function formatStudyPlanRecord(plan: {
  id: string;
  fileId: string;
  userId: string;
  title: string;
  objective: string | null;
  currentKnowledgeLevel: string | null;
  targetTimelineDays: number | null;
  studyHoursPerWeek: number | null;
  dailyStudyMinutes: number | null;
  specialInstruction: string | null;
  overview: string;
  plan: Prisma.JsonValue;
  estimatedTotalHours: number | null;
  estimatedWeeks: number | null;
  modelUsed: string;
  sourceWordCount: number;
  sourceTokensUsed: number;
  createdAt: Date;
  updatedAt: Date;
  file?: {
    id: string;
    filename: string;
    mimetype?: string;
  };
}): {
  id: string;
  fileId: string;
  fileName: string | null;
  title: string;
  objective: string | null;
  currentKnowledgeLevel: string | null;
  targetTimelineDays: number | null;
  studyHoursPerWeek: number | null;
  dailyStudyMinutes: number | null;
  specialInstruction: string | null;
  overview: string;
  estimatedTotalHours: number | null;
  estimatedWeeks: number | null;
  modelUsed: string;
  sourceWordCount: number;
  sourceTokensUsed: number;
  plan: StudyPlanStructure;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: plan.id,
    fileId: plan.fileId,
    fileName: plan.file?.filename || null,
    title: plan.title,
    objective: plan.objective,
    currentKnowledgeLevel: plan.currentKnowledgeLevel,
    targetTimelineDays: plan.targetTimelineDays,
    studyHoursPerWeek: plan.studyHoursPerWeek,
    dailyStudyMinutes: plan.dailyStudyMinutes,
    specialInstruction: plan.specialInstruction,
    overview: plan.overview,
    estimatedTotalHours: plan.estimatedTotalHours,
    estimatedWeeks: plan.estimatedWeeks,
    modelUsed: plan.modelUsed,
    sourceWordCount: plan.sourceWordCount,
    sourceTokensUsed: plan.sourceTokensUsed,
    plan: plan.plan as unknown as StudyPlanStructure,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export async function createStudyPlanFromFile(
  fileId: string,
  authUser: AuthUser,
  input: CreateStudyPlanInput,
) {
  const userId = getUserId(authUser);
  const file = await ensureOwnedFile(fileId, userId);

  if (file.processingStatus !== ProcessingStatus.COMPLETED) {
    throw new Error(
      `File must be fully processed before generating a study plan. Current status: ${file.processingStatus}`,
    );
  }

  if (file.chunks.length === 0) {
    throw new Error("No chunks found for this file. Please process the file first.");
  }

  const targetTimelineDays = parseOptionalPositiveInteger(
    input.targetTimelineDays,
  );
  const studyHoursPerWeek = parseOptionalPositiveInteger(
    input.studyHoursPerWeek,
  );
  const dailyStudyMinutes = parseOptionalPositiveInteger(
    input.dailyStudyMinutes,
  );

  const chunks = await getAllFileChunks(fileId);
  const sourceContent = await buildStudyPlanSourceContent(file.filename, chunks);
  const generatedPlan = await generateStudyPlan({
    fileName: file.filename,
    sourceContent,
    objective: input.objective,
    currentKnowledgeLevel: input.currentKnowledgeLevel,
    targetTimelineDays,
    studyHoursPerWeek,
    dailyStudyMinutes,
    specialInstruction: input.specialInstruction,
  });

  const title =
    sanitizeTitle(input.customTitle) ||
    sanitizeTitle(generatedPlan.title) ||
    `Study plan for ${file.filename}`;

  const sourceWordCount = countWords(sourceContent);
  const sourceTokensUsed = estimateTokenCount(sourceContent);

  const plan = await prisma.studyPlan.create({
    data: {
      fileId,
      userId,
      title,
      objective: input.objective?.trim() || null,
      currentKnowledgeLevel: input.currentKnowledgeLevel?.trim() || null,
      targetTimelineDays: targetTimelineDays ?? null,
      studyHoursPerWeek: studyHoursPerWeek ?? null,
      dailyStudyMinutes: dailyStudyMinutes ?? null,
      specialInstruction: input.specialInstruction?.trim() || null,
      overview: generatedPlan.overview,
      plan: toJsonValue(generatedPlan),
      estimatedTotalHours: generatedPlan.estimatedTotalHours,
      estimatedWeeks: generatedPlan.estimatedWeeks,
      modelUsed: GROQ_MODEL,
      sourceWordCount,
      sourceTokensUsed,
    },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
        },
      },
    },
  });

  return formatStudyPlanRecord(plan);
}

export async function listFileStudyPlans(fileId: string, authUser: AuthUser) {
  const userId = getUserId(authUser);
  await ensureOwnedFile(fileId, userId);

  const plans = await prisma.studyPlan.findMany({
    where: {
      fileId,
      userId,
    },
    orderBy: { createdAt: "desc" },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
        },
      },
    },
  });

  return plans.map((plan) => formatStudyPlanRecord(plan));
}

export async function getStudyPlanById(planId: string, authUser: AuthUser) {
  const userId = getUserId(authUser);
  const plan = await ensureOwnedStudyPlan(planId, userId);
  return formatStudyPlanRecord(plan);
}

export async function listUserStudyPlans(
  authUser: AuthUser,
  options?: ListStudyPlanOptions,
) {
  const userId = getUserId(authUser);
  const page = clamp(Number(options?.page ?? 1), 1, 1000);
  const limit = clamp(Number(options?.limit ?? 10), 1, 50);

  if (options?.fileId) {
    await ensureOwnedFile(options.fileId, userId);
  }

  const where: Prisma.StudyPlanWhereInput = {
    userId,
    ...(options?.fileId ? { fileId: options.fileId } : {}),
  };

  const [plans, total] = await Promise.all([
    prisma.studyPlan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        file: {
          select: {
            id: true,
            filename: true,
            mimetype: true,
          },
        },
      },
    }),
    prisma.studyPlan.count({ where }),
  ]);

  return {
    plans: plans.map((plan) => formatStudyPlanRecord(plan)),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateStudyPlanTitle(
  planId: string,
  authUser: AuthUser,
  title: string,
) {
  const userId = getUserId(authUser);
  await ensureOwnedStudyPlan(planId, userId);

  const sanitizedTitle = sanitizeTitle(title);
  if (!sanitizedTitle) {
    throw new Error("title is required");
  }

  const updated = await prisma.studyPlan.update({
    where: { id: planId },
    data: { title: sanitizedTitle },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
        },
      },
    },
  });

  return formatStudyPlanRecord(updated);
}

export async function deleteStudyPlan(planId: string, authUser: AuthUser) {
  const userId = getUserId(authUser);
  await ensureOwnedStudyPlan(planId, userId);

  await prisma.studyPlan.delete({
    where: { id: planId },
  });

  return {
    id: planId,
    deleted: true,
  };
}
