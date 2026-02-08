import redisClient from "../lib/redisClient";

const INGESTION_QUEUE_KEY = "file:ingestion:queue";
const PROCESSING_SET_KEY = "file:processing:set";

export interface FileIngestionJob {
  jobId: string;
  fileId: string;
  userId: string;
  minioKey: string;
  filename: string;
  mimetype: string;
  size: number;
  bucketName: string;
  userEmail: string;
  userFullName: string;
  createdAt: string;
}

/**
 * Push a file ingestion job to the Redis queue
 */
export async function enqueueFileIngestion(
  job: FileIngestionJob,
): Promise<void> {
  const jobData = JSON.stringify(job);
  await redisClient.lPush(INGESTION_QUEUE_KEY, jobData);
  console.log(`[Queue] Enqueued file ingestion job: ${job.jobId}`);
}

/**
 * Pop a file ingestion job from the Redis queue (blocking)
 */
export async function dequeueFileIngestion(
  timeout: number = 0,
): Promise<FileIngestionJob | null> {
  const result = await redisClient.brPop(INGESTION_QUEUE_KEY, timeout);
  if (!result) return null;

  const job: FileIngestionJob = JSON.parse(result.element);
  console.log(`[Queue] Dequeued file ingestion job: ${job.jobId}`);
  return job;
}

/**
 * Mark a job as processing
 */
export async function markJobAsProcessing(jobId: string): Promise<void> {
  await redisClient.sAdd(PROCESSING_SET_KEY, jobId);
}

/**
 * Mark a job as completed
 */
export async function markJobAsCompleted(jobId: string): Promise<void> {
  await redisClient.sRem(PROCESSING_SET_KEY, jobId);
}

/**
 * Check if a job is currently being processed
 */
export async function isJobProcessing(jobId: string): Promise<number> {
  return await redisClient.sIsMember(PROCESSING_SET_KEY, jobId);
}

/**
 * Get queue length
 */
export async function getQueueLength(): Promise<number> {
  return await redisClient.lLen(INGESTION_QUEUE_KEY);
}

/**
 * Get number of jobs currently being processed
 */
export async function getProcessingCount(): Promise<number> {
  return await redisClient.sCard(PROCESSING_SET_KEY);
}

/**
 * Get queue stats
 */
export async function getQueueStats() {
  const queueLength = await getQueueLength();
  const processingCount = await getProcessingCount();

  return {
    pending: queueLength,
    processing: processingCount,
    total: queueLength + processingCount,
  };
}
