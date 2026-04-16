export {
  PROFILE_BUCKET,
  USER_FILES_BUCKET,
  deleteFromR2 as deleteFromMinIO,
  ensureBuckets,
  getDownloadUrl,
  getSignedUrl,
  r2Client as minioClient,
  uploadProfileImage,
  uploadUserFile,
} from "./r2Service";
