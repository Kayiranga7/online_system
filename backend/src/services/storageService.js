const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../config/logger');

/**
 * Storage abstraction: writes go to S3-compatible object storage when
 * S3_BUCKET is configured (works with AWS S3 directly, or any
 * S3-compatible provider - DigitalOcean Spaces, Cloudflare R2, MinIO -
 * by also setting S3_ENDPOINT). Falls back to local disk under
 * UPLOAD_DIR when no bucket is configured, so the app runs zero-config
 * in local development.
 *
 * Callers only deal with this module's interface (save/delete/urlFor) -
 * nothing else in the codebase needs to know which backend is active.
 */

const USE_S3 = !!process.env.S3_BUCKET;

let s3Client = null;
if (USE_S3) {
  s3Client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined, // set for non-AWS providers (R2, Spaces, MinIO)
    forcePathStyle: !!process.env.S3_ENDPOINT, // most S3-compatible providers need path-style addressing
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
      : undefined, // falls back to default AWS credential chain (IAM role, env vars, etc.)
  });
  logger.info(`[storage] Using S3-compatible storage (bucket: ${process.env.S3_BUCKET})`);
} else {
  logger.info('[storage] Using local disk storage (set S3_BUCKET to switch to object storage)');
}

/**
 * Persists a file buffer under the given category/filename and returns
 * the public-facing URL to store in the database.
 */
async function saveFile({ category, filename, buffer, mimetype, isPrivate = false }) {
  const key = `${category}/${filename}`;

  if (USE_S3) {
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      ACL: isPrivate || process.env.S3_PUBLIC_READ === 'false' ? undefined : 'public-read',
    }));
    return urlFor(key);
  }

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const fullDir = path.join(uploadDir, category);
  fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(path.join(fullDir, filename), buffer);
  return `/uploads/${key}`;
}

function storageKey(urlOrKey) {
  return urlOrKey
    .replace(/^\/?uploads\//, '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\//, '');
}

async function readFile(urlOrKey) {
  const key = storageKey(urlOrKey);
  if (USE_S3) {
    const result = await s3Client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return {
      buffer: Buffer.from(await result.Body.transformToByteArray()),
      contentType: result.ContentType || 'application/octet-stream',
    };
  }

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const fullPath = path.resolve(uploadDir, key);
  const rootPath = path.resolve(uploadDir);
  if (!fullPath.startsWith(`${rootPath}${path.sep}`)) throw new Error('Invalid storage key.');
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = ({
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf',
  })[ext] || 'application/octet-stream';
  return { buffer: fs.readFileSync(fullPath), contentType };
}

async function deleteFile(urlOrKey) {
  const key = urlOrKey.replace(/^\/?uploads\//, '').replace(/^https?:\/\/[^/]+\//, '');

  if (USE_S3) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return;
  }

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const fullPath = path.join(uploadDir, key);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

function urlFor(key) {
  if (process.env.S3_PUBLIC_URL_BASE) {
    return `${process.env.S3_PUBLIC_URL_BASE.replace(/\/$/, '')}/${key}`;
  }
  if (process.env.S3_ENDPOINT) {
    return `${process.env.S3_ENDPOINT.replace(/\/$/, '')}/${process.env.S3_BUCKET}/${key}`;
  }
  return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

module.exports = { saveFile, deleteFile, readFile, isUsingS3: () => USE_S3 };
