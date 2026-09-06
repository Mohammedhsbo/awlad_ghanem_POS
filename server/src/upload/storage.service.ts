import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageConfig } from '../config/storage.config.js';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import 'multer';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly bucketPrefix: string;
  private readonly endpoint: string;
  private readonly publicBaseUrl?: string;
  private readonly publicPrefix: string;
  private readonly privatePrefix: string;
  private readonly forcePathStyle: boolean;

  constructor() {
    const config = getStorageConfig();
    this.bucketName = config.bucketName;
    this.bucketPrefix = config.bucketPrefix;
    this.endpoint = config.endpoint;
    this.publicBaseUrl = config.publicBaseUrl;
    this.publicPrefix = config.publicPrefix;
    this.privatePrefix = config.privatePrefix;
    this.forcePathStyle = config.forcePathStyle ?? false;
    
    this.s3Client = new S3Client({
      region: config.region,
      credentials: config.credentials,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string = 'motorcycles', access: "public" | "private" = "public"): Promise<{ url: string; filename: string }> {
    const extension = path.extname(file.originalname);
    const filename = `${uuidv4()}${extension}`;
    const rootPrefix = access === "public" ? this.publicPrefix : this.privatePrefix;
    const key = `${this.bucketPrefix}/${rootPrefix}/${folder}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    try {
      await this.s3Client.send(command);
      const url = access === "public" ? this.buildUrl(key) : await this.createPresignedUrl(key);
      return { url, filename: key };
    } catch (error) {
      const err = error as any;
      this.logger.error(
        `S3 upload failed — name: ${err?.name}, message: ${err?.message}, ` +
        `httpStatus: ${err?.$metadata?.httpStatusCode}, requestId: ${err?.$metadata?.requestId}, ` +
        `cfRayId: ${err?.$metadata?.extendedRequestId ?? 'n/a'}`,
        err?.stack,
      );
      throw new Error('UPLOAD_FAILED');
    }
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${error}`);
      // Don't throw here, orphaned images are acceptable if deletion fails (per spec EC-004)
    }
  }

  async createPresignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  private buildUrl(key: string): string {
    if (this.publicBaseUrl) return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    if (this.forcePathStyle) {
      // e.g. MinIO: http://localhost:9000/bucket-name/key
      return `${this.endpoint}/${this.bucketName}/${key}`;
    }
    // e.g. AWS S3: https://bucket-name.s3.region.amazonaws.com/key
    // Not fully robust for all AWS domains but sufficient for this spec
    return `${this.endpoint.replace('https://', `https://${this.bucketName}.`)}/${key}`;
  }
}
