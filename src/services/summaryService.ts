import prisma from "../lib/prismaClient";
import axios from "axios";
import {
  generateSummary,
  synthesizeChunks,
  estimateTokenCount,
  countWords,
} from "./aiService";

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || "http://localhost:8000";

interface ChunkData {
  chunkId: string;
  fileId: string;
  pageStart: number | null;
  content: string;
  similarity: number;
}

/**
 * Retrieve document chunks from worker API using vector search
 */
export async function retrieveDocumentChunks(
  fileId: string,
  query: string = "summary",
  topK: number = 20,
): Promise<ChunkData[]> {
  try {
    const response: any = await axios.post(
      `${WORKER_BASE_URL}/retrieve`,
      {
        query,
        fileId,
        top_k: topK,
      },
      { timeout: 30000 },
    );
    console.log(response?.data?.hits);
    return response?.data?.hits || [];
  } catch (error: any) {
    console.error("[SummaryService] Failed to retrieve chunks:", error.message);
    throw new Error(`Failed to retrieve document chunks: ${error.message}`);
  }
}

/**
 * Get all chunks for a file from database
 */
export async function getAllFileChunks(fileId: string) {
  return await prisma.documentChunk.findMany({
    where: { fileId },
    orderBy: { chunkIndex: "asc" },
    select: {
      id: true,
      content: true,
      pageStart: true,
      pageEnd: true,
      chunkIndex: true,
      metadata: true,
    },
  });
}

/**
 * Create a summary for a file
 */
export async function createFileSummary(
  fileId: string,
  userId: string,
  options?: {
    customTitle?: string;
    chunkLimit?: number;
    useVectorSearch?: boolean;
    searchQuery?: string;
  },
) {
  // Verify file exists and belongs to user
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

  if (file.processingStatus !== "COMPLETED") {
    throw new Error(
      "File must be fully processed before generating a summary. Current status: " +
        file.processingStatus,
    );
  }

  if (file.chunks.length === 0) {
    throw new Error(
      "No chunks found for this file. Please process the file first.",
    );
  }

  console.log(
    `[SummaryService] Creating summary for file: ${file.filename} (${file.chunks.length} chunks)`,
  );

  // Get chunks - either via vector search or all chunks
  let chunks;
  const useVectorSearch = options?.useVectorSearch ?? true;
  const chunkLimit = options?.chunkLimit ?? 20;

  if (useVectorSearch) {
    // Use vector search to get most relevant chunks
    const query =
      options?.searchQuery || `comprehensive summary of ${file.filename}`;
    const workerChunks = await retrieveDocumentChunks(
      fileId,
      query,
      chunkLimit,
    );

    chunks = workerChunks.map((wc) => ({
      id: wc.chunkId,
      content: wc.content,
    }));

    console.log(
      `[SummaryService] Retrieved ${chunks.length} chunks via vector search`,
    );
  } else {
    // Get all chunks from database
    chunks = await getAllFileChunks(fileId);

    // Limit if needed
    if (chunks.length > chunkLimit) {
      chunks = chunks.slice(0, chunkLimit);
    }

    console.log(
      `[SummaryService] Retrieved ${chunks.length} chunks from database`,
    );
  }

  if (chunks.length === 0) {
    throw new Error("No chunks available for summary generation");
  }

  // Prepare content for AI
  const chunksForAI = chunks.map((chunk) => ({
    content: chunk.content,
  }));

  // Generate summary using AI
  console.log(`[SummaryService] Generating AI summary...`);
  const summaryContent = await synthesizeChunks(file.filename, chunksForAI);

  // Calculate statistics
  const wordCount = countWords(summaryContent);
  const tokensUsed = estimateTokenCount(summaryContent);

  // Create summary record
  const summary = await prisma.summary.create({
    data: {
      fileId: file.id,
      userId: userId,
      title: options?.customTitle || `Summary of ${file.filename}`,
      content: summaryContent,
      wordCount,
      tokensUsed,
      modelUsed: process.env.GROQ_MODEL_ID || "qwen/qwen3-32b",
      chunks: {
        create: chunks.map((chunk) => ({
          chunkId: chunk.id,
        })),
      },
    },
    include: {
      chunks: true,
    },
  });

  console.log(
    `[SummaryService] Summary created successfully (ID: ${summary.id}, ${wordCount} words, ${tokensUsed} tokens)`,
  );

  return summary;
}

/**
 * Get all summaries for a file
 */
export async function getFileSummaries(fileId: string, userId: string) {
  // Verify file access
  const file = await prisma.file.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    throw new Error("File not found");
  }

  if (file.userId !== userId) {
    throw new Error("Unauthorized access to file");
  }

  return await prisma.summary.findMany({
    where: { fileId },
    orderBy: { createdAt: "desc" },
    include: {
      chunks: {
        select: {
          chunkId: true,
        },
      },
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
        },
      },
    },
  });
}

/**
 * Get a specific summary by ID
 */
export async function getSummaryById(summaryId: string, userId: string) {
  const summary = await prisma.summary.findUnique({
    where: { id: summaryId },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
          size: true,
          createdAt: true,
        },
      },
      chunks: {
        select: {
          id: true,
          chunkId: true,
        },
      },
    },
  });

  if (!summary) {
    throw new Error("Summary not found");
  }

  if (summary.userId !== userId) {
    throw new Error("Unauthorized access to summary");
  }

  return summary;
}

/**
 * Get all summaries for a user
 */
export async function getUserSummaries(
  userId: string,
  options?: {
    page?: number;
    limit?: number;
    sortBy?: "createdAt" | "wordCount";
    sortOrder?: "asc" | "desc";
  },
) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 10;
  const sortBy = options?.sortBy ?? "createdAt";
  const sortOrder = options?.sortOrder ?? "desc";

  const [summaries, total] = await Promise.all([
    prisma.summary.findMany({
      where: { userId },
      orderBy: { [sortBy]: sortOrder },
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
        chunks: {
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.summary.count({ where: { userId } }),
  ]);

  return {
    summaries,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Delete a summary
 */
export async function deleteSummary(summaryId: string, userId: string) {
  const summary = await prisma.summary.findUnique({
    where: { id: summaryId },
  });

  if (!summary) {
    throw new Error("Summary not found");
  }

  if (summary.userId !== userId) {
    throw new Error("Unauthorized access to summary");
  }

  await prisma.summary.delete({
    where: { id: summaryId },
  });

  console.log(`[SummaryService] Summary ${summaryId} deleted`);
}

/**
 * Update summary title
 */
export async function updateSummaryTitle(
  summaryId: string,
  userId: string,
  newTitle: string,
) {
  const summary = await prisma.summary.findUnique({
    where: { id: summaryId },
  });

  if (!summary) {
    throw new Error("Summary not found");
  }

  if (summary.userId !== userId) {
    throw new Error("Unauthorized access to summary");
  }

  return await prisma.summary.update({
    where: { id: summaryId },
    data: { title: newTitle },
  });
}
