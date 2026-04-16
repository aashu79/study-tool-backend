import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getAwsSignedUrl } from "@aws-sdk/s3-request-presigner";

function getRequiredStorageEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required storage environment variable: ${name}`);
  }
  return value;
}

function getR2Endpoint() {
  const explicitEndpoint = process.env.R2_ENDPOINT;
  if (explicitEndpoint) {
    return explicitEndpoint;
  }

  const accountId = getRequiredStorageEnv("R2_ACCOUNT_ID");
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

const r2Client = new S3Client({
  region: "auto",
  endpoint: getR2Endpoint(),
  credentials: {
    accessKeyId: getRequiredStorageEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredStorageEnv("R2_SECRET_ACCESS_KEY"),
  },
});

const PROFILE_BUCKET =
  process.env.R2_PROFILE_BUCKET?.trim() || "profilepictures";
const USER_FILES_BUCKET = process.env.R2_USER_FILES_BUCKET?.trim() || "files";

let ensuredBucketsPromise: Promise<void> | null = null;

function isBucketMissingError(error: any) {
  const statusCode = error?.$metadata?.httpStatusCode;
  const errorName = error?.name || error?.Code || error?.code;

  return (
    statusCode === 404 ||
    errorName === "NotFound" ||
    errorName === "NoSuchBucket"
  );
}

async function ensureBucket(bucket: string) {
  try {
    await r2Client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error: any) {
    if (!isBucketMissingError(error)) {
      throw error;
    }

    try {
      await r2Client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (createError: any) {
      const errorName =
        createError?.name || createError?.Code || createError?.code;

      if (errorName !== "BucketAlreadyOwnedByYou") {
        throw createError;
      }
    }
  }
}

export async function ensureBuckets() {
  if (!ensuredBucketsPromise) {
    ensuredBucketsPromise = Promise.all(
      [PROFILE_BUCKET, USER_FILES_BUCKET].map((bucket) => ensureBucket(bucket)),
    )
      .then(() => undefined)
      .catch((error) => {
        ensuredBucketsPromise = null;
        throw error;
      });
  }

  await ensuredBucketsPromise;
}

export async function uploadProfileImage(
  userId: string,
  file: Express.Multer.File,
) {
  await ensureBuckets();
  const ext = file.originalname.split(".").pop();
  const objectName = `${userId}/profile.${ext}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: PROFILE_BUCKET,
      Key: objectName,
      Body: file.buffer,
      ContentLength: file.size,
      ContentType: file.mimetype,
    }),
  );

  return objectName;
}

export async function uploadUserFile(
  userId: string,
  file: Express.Multer.File,
) {
  await ensureBuckets();
  const objectName = `${userId}/${Date.now()}_${file.originalname}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: USER_FILES_BUCKET,
      Key: objectName,
      Body: file.buffer,
      ContentLength: file.size,
      ContentType: file.mimetype,
    }),
  );

  return objectName;
}

export function getSignedUrl(
  bucket: string,
  objectName: string,
  expirySeconds = 60 * 60,
) {
  return getAwsSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectName,
    }),
    { expiresIn: expirySeconds },
  );
}

export function getDownloadUrl(
  bucket: string,
  objectName: string,
  expirySeconds = 60 * 60,
) {
  return getAwsSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectName,
      ResponseContentDisposition: `attachment; filename="${objectName
        .split("/")
        .pop()}"`,
    }),
    { expiresIn: expirySeconds },
  );
}

export async function deleteFromR2(bucket: string, objectName: string) {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectName,
    }),
  );
}

export { r2Client, PROFILE_BUCKET, USER_FILES_BUCKET };
