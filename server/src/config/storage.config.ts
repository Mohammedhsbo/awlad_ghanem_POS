import { isLocalDesktopMode } from "./env.js";

export function getStorageConfig() {
  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || "development";
  const bucketName = process.env.S3_BUCKET_NAME || `motorcycle-system-${appEnv}`;
  const bucketPrefix = process.env.S3_BUCKET_PREFIX || appEnv;
  const region = process.env.S3_REGION || 'us-east-1';
  const accessKeyId = process.env.S3_ACCESS_KEY || 'minioadmin';
  const secretAccessKey = process.env.S3_SECRET_KEY || 'minioadmin';
  const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  const privatePrefix = process.env.S3_PRIVATE_PREFIX || "private";
  const publicPrefix = process.env.S3_PUBLIC_PREFIX || "public";
  const maxFileSizeMb = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 5);

  if (process.env.NODE_ENV === "production" && !isLocalDesktopMode()) {
    if (!process.env.S3_BUCKET_NAME) throw new Error("S3_BUCKET_NAME is required in production");
    if (!process.env.S3_ACCESS_KEY) throw new Error("S3_ACCESS_KEY is required in production");
    if (!process.env.S3_SECRET_KEY) throw new Error("S3_SECRET_KEY is required in production");
  }

  return {
    bucketName,
    bucketPrefix,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint,
    publicBaseUrl,
    privatePrefix,
    publicPrefix,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}
