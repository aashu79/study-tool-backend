import prisma from "../lib/prismaClient";
import axios from "axios";
import { USER_FILES_BUCKET } from "./r2Service";

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || "http://localhost:8000";

interface IngestPayload {
  jobId: string;
  fileId: string;
  bucketName: string;
  minioKey: string;
}

/**
 * Manually trigger file processing via worker API
 */
export async function triggerFileProcessing(fileId: string, userId: string) {
  // Get file details
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { processingJobs: true },
  });

  if (!file) {
    throw new Error("File not found");
  }

  if (file.userId !== userId) {
    throw new Error("Unauthorized access to file");
  }

  // Check if file is already processed
  if (file.processingStatus === "COMPLETED") {
    return {
      status: "already_completed",
      message: "File has already been processed",
      fileId: file.id,
    };
  }

  // Get or create processing job
  let job = file.processingJobs.find(
    (j) => j.status === "PENDING" || j.status === "PROCESSING",
  );

  if (!job) {
    job = await prisma.fileProcessingJob.create({
      data: {
        fileId: file.id,
        status: "PENDING",
      },
    });
  }

  // Update job status to processing
  await prisma.fileProcessingJob.update({
    where: { id: job.id },
    data: {
      status: "PROCESSING",
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  // Update file status
  await prisma.file.update({
    where: { id: file.id },
    data: {
      processingStatus: "PROCESSING",
      errorMessage: null,
    },
  });

  // Prepare payload for worker
  const payload: IngestPayload = {
    jobId: job.id,
    fileId: file.id,
    bucketName: USER_FILES_BUCKET,
    minioKey: file.key,
  };

  try {
    // Call worker API
    const response = await axios.post(`${WORKER_BASE_URL}/ingest`, payload, {
      timeout: 300000, // 5 minutes timeout
    });

    // Update job and file status to completed
    await prisma.fileProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    await prisma.file.update({
      where: { id: file.id },
      data: {
        processingStatus: "COMPLETED",
        errorMessage: null,
      },
    });

    console.log(`[ProcessingService] File ${fileId} processed successfully`);

    return {
      status: "success",
      message: "File processed successfully",
      fileId: file.id,
      jobId: job.id,
      data: response.data,
    };
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.detail || error.message || "Processing failed";

    // Update job and file status to failed
    await prisma.fileProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage,
      },
    });

    await prisma.file.update({
      where: { id: file.id },
      data: {
        processingStatus: "FAILED",
        errorMessage,
      },
    });

    console.error(
      `[ProcessingService] File ${fileId} processing failed:`,
      errorMessage,
    );

    throw new Error(`Processing failed: ${errorMessage}`);
  }
}

/**
 * Get processing status for a file
 */
export async function getProcessingStatus(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: {
      processingJobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
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

  const latestJob = file.processingJobs[0];

  return {
    fileId: file.id,
    filename: file.filename,
    processingStatus: file.processingStatus,
    errorMessage: file.errorMessage,
    chunkCount: file.chunks.length,
    latestJob: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          attempts: latestJob.attempts,
          startedAt: latestJob.startedAt,
          completedAt: latestJob.completedAt,
          errorMessage: latestJob.errorMessage,
        }
      : null,
    processingJobs: file.processingJobs.map((job) => ({
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
    })),
  };
}

/**
 * Check worker health status
 */
export async function checkWorkerHealth() {
  try {
    const response = await axios.get(`${WORKER_BASE_URL}/health`, {
      timeout: 5000,
    });
    return {
      available: true,
      status: response.data,
    };
  } catch (error) {
    return {
      available: false,
      error: "Worker service is not available",
    };
  }
}

/**
 * Get worker queue statistics
 */
export async function getQueueStats() {
  try {
    const response = await axios.get(`${WORKER_BASE_URL}/queue/stats`, {
      timeout: 5000,
    });
    return response.data;
  } catch (error: any) {
    throw new Error(
      `Failed to get queue stats: ${error.message || "Worker service unavailable"}`,
    );
  }
}
