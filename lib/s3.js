const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let cachedClient = null;

function getS3Config() {
  const bucket = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME || 'biblecms';
  const region = process.env.AWS_REGION || 'eu-north-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  const credentials = accessKeyId && secretAccessKey
    ? {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {})
      }
    : undefined;

  return {
    bucket,
    region,
    credentials,
    client: cachedClient || (cachedClient = new S3Client({
      region,
      ...(credentials ? { credentials } : {})
    }))
  };
}

function createS3ObjectKey({ keyPrefix = 'uploads', originalName = 'file' }) {
  const ext = path.extname(originalName);
  const safeBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${keyPrefix}/${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBase}${ext}`;
}

async function createPresignedPutUrl({ key, expiresIn = 900 }) {
  const { bucket, region, credentials, client } = getS3Config();
  const credentialsProvider = credentials || client.config.credentials;
  const resolvedCredentials = typeof credentialsProvider === 'function'
    ? await credentialsProvider()
    : credentialsProvider;
  if (!resolvedCredentials?.accessKeyId || !resolvedCredentials?.secretAccessKey) {
    throw new Error('AWS credentials are required. Attach an EC2 IAM role or provide fresh AWS credentials.');
  }
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

module.exports = {
  createPresignedPutUrl,
  createS3ObjectKey,
  uploadFileToS3
};
