import { Client } from "minio";

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: parseInt(process.env.MINIO_PORT || "9000"),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

const PROFILE_BUCKET = "profilepictures";
const USER_FILES_BUCKET = "files";

export async function ensureBuckets() {
  for (const bucket of [PROFILE_BUCKET, USER_FILES_BUCKET]) {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) await minioClient.makeBucket(bucket);
  }
}

export async function uploadProfileImage(
  userId: string,
  file: Express.Multer.File,
) {
  await ensureBuckets();
  const ext = file.originalname.split(".").pop();
  const objectName = `${userId}/profile.${ext}`;
  await minioClient.putObject(
    PROFILE_BUCKET,
    objectName,
    file.buffer,
    file.size,
    {
      "Content-Type": file.mimetype,
    },
  );
  return objectName;
}

export async function uploadUserFile(
  userId: string,
  file: Express.Multer.File,
) {
  await ensureBuckets();
  const objectName = `${userId}/${Date.now()}_${file.originalname}`;
  await minioClient.putObject(
    USER_FILES_BUCKET,
    objectName,
    file.buffer,
    file.size,
    {
      "Content-Type": file.mimetype,
    },
  );
  return objectName;
}

export function getSignedUrl(
  bucket: string,
  objectName: string,
  expirySeconds = 60 * 60,
) {
  return minioClient.presignedGetObject(bucket, objectName, expirySeconds);
}

export function getDownloadUrl(
  bucket: string,
  objectName: string,
  expirySeconds = 60 * 60,
) {
  return minioClient.presignedGetObject(bucket, objectName, expirySeconds, {
    responseContentDisposition: `attachment; filename="${objectName
      .split("/")
      .pop()}"`,
  });
}

export async function deleteFromMinIO(bucket: string, objectName: string) {
  await minioClient.removeObject(bucket, objectName);
}

export { minioClient, PROFILE_BUCKET, USER_FILES_BUCKET };
