import prisma from "../lib/prismaClient";
import {
  uploadProfileImage,
  uploadUserFile,
  getSignedUrl,
  getDownloadUrl,
  deleteFromMinIO,
  PROFILE_BUCKET,
  USER_FILES_BUCKET,
} from "./minioService";
import { enqueueFileIngestion, FileIngestionJob } from "./queueService";
import { v4 as uuidv4 } from "uuid";

export async function saveProfilePicture(
  userId: string,
  file: Express.Multer.File,
) {
  const key = await uploadProfileImage(userId, file);
  await prisma.user.update({
    where: { id: userId },
    data: { profilePicture: key },
  });
  return key;
}

export async function saveUserFile(userId: string, file: Express.Multer.File) {
  // Upload file to MinIO
  const key = await uploadUserFile(userId, file);

  // Create file record in database
  const dbFile = await prisma.file.create({
    data: {
      userId,
      key,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      processingStatus: "PENDING",
    },
  });

  // Create processing job record
  const jobId = uuidv4();
  await prisma.fileProcessingJob.create({
    data: {
      id: jobId,
      fileId: dbFile.id,
      status: "PENDING",
    },
  });

  // Get user information for the job
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      full_name: true,
    },
  });

  // Prepare job data for the queue
  const jobData: FileIngestionJob = {
    jobId,
    fileId: dbFile.id,
    userId: userId,
    minioKey: key,
    filename: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    bucketName: USER_FILES_BUCKET,
    userEmail: user?.email || "",
    userFullName: user?.full_name || "",
    createdAt: dbFile.createdAt.toISOString(),
  };

  // Enqueue the job for processing
  await enqueueFileIngestion(jobData);

  console.log(`[FileService] File saved and job enqueued: ${dbFile.id}`);

  return dbFile;
}

export async function getProfilePictureUrl(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.profilePicture) return null;
  return getSignedUrl(PROFILE_BUCKET, user.profilePicture);
}

export async function getUserFileUrl(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId) return null;
  return getSignedUrl(USER_FILES_BUCKET, file.key);
}

export async function getUserFileDownloadUrl(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId) return null;
  return getDownloadUrl(USER_FILES_BUCKET, file.key);
}

export async function getUserFiles(
  userId: string,
  filters: {
    search?: string;
    sortBy?: "createdAt";
    sortOrder?: "asc" | "desc";
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    limit?: number;
  },
) {
  const {
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
    fromDate,
    toDate,
    page = 1,
    limit = 10,
  } = filters;
  const where: any = { userId };
  if (search) {
    where.filename = { contains: search, mode: "insensitive" };
  }
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = fromDate;
    if (toDate) where.createdAt.lte = toDate;
  }
  const files = await prisma.file.findMany({
    where,
    orderBy: { [sortBy]: sortOrder },
    skip: (page - 1) * limit,
    take: limit,
  });
  const total = await prisma.file.count({ where });
  return { files, total, page, limit };
}

export async function deleteUserFile(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId)
    throw new Error("File not found or not owned by user");
  // Delete from MinIO
  await deleteFromMinIO(USER_FILES_BUCKET, file.key);
  // Delete from DB
  await prisma.file.delete({ where: { id: fileId } });
}

export async function saveUserFiles(
  userId: string,
  files: Express.Multer.File[],
) {
  return Promise.all(files.map((file) => saveUserFile(userId, file)));
}
