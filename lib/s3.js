const fs = require('fs');
const path = require('path');
const { S3Client, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let cachedClient = null;

function getS3Config() {
  const bucket = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME || 'biblecms-media-2026-app';
  const region = process.env.AWS_REGION || 'us-east-1';

  return {
    bucket,
    region,
    client: cachedClient || (cachedClient = new S3Client({ region }))
  };
}

function getS3Client() {
  return getS3Config().client;
}

function createS3ObjectKey({ keyPrefix = 'uploads', originalName = 'file' }) {
  const ext = path.extname(originalName);
  const safeBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${keyPrefix}/${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBase}${ext}`;
}

async function createPresignedPutUrl({ key, expiresIn = 900 }) {
  const { bucket, region, client } = getS3Config();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  return {
    bucket,
    region,
    key,
    uploadUrl,
    url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`
  };
}

async function uploadFileToS3({ filePath, originalName, mimeType, keyPrefix = 'uploads' }) {
  const { bucket, region, client } = getS3Config();
  const key = createS3ObjectKey({ keyPrefix, originalName: originalName || filePath });

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: mimeType || 'application/octet-stream'
  }));

  return {
    bucket,
    region,
    key,
    url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`
  };
}

async function listS3Objects({ prefix = '', maxKeys = 1000 }) {
  const { bucket, region, client } = getS3Config();
  const objects = [];
  let continuationToken;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken
    }));

    for (const item of response.Contents || []) {
      if (!item.Key || item.Key.endsWith('/')) continue;
      objects.push({
        bucket,
        region,
        key: item.Key,
        size: item.Size || 0,
        lastModified: item.LastModified,
        url: `https://${bucket}.s3.${region}.amazonaws.com/${item.Key}`
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

function getS3ObjectKeyFromUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/+/, '');
  } catch (_) {
    return url.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
  }
}

module.exports = {
  createPresignedPutUrl,
  createS3ObjectKey,
  getS3ObjectKeyFromUrl,
  getS3Client,
  listS3Objects,
  uploadFileToS3
};
