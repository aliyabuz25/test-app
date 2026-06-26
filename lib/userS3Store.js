const crypto = require('crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getS3Client } = require('./s3');

function getUserStoreConfig() {
  const bucket = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME || '';
  const region = process.env.AWS_REGION || 'us-east-1';
  const keyPrefix = process.env.AWS_S3_PREFIX || 'kidsbible-content';
  const encryptionKey = process.env.USER_JSON_ENCRYPTION_KEY || '';

  return {
    bucket,
    region,
    keyPrefix,
    encryptionKey,
    objectKey: `${keyPrefix}/secure/users.json.enc`
  };
}

function getEncryptionKeyBuffer(encryptionKey) {
  if (!encryptionKey) return null;
  return crypto.createHash('sha256').update(encryptionKey).digest();
}

function encryptJsonPayload(payload, encryptionKey) {
  const key = getEncryptionKeyBuffer(encryptionKey);
  if (!key) {
    throw new Error('USER_JSON_ENCRYPTION_KEY is required to encrypt user JSON.');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.from(JSON.stringify({
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    data: encrypted.toString('base64'),
    createdAt: new Date().toISOString()
  }), 'utf8');
}

async function syncUsersToS3(users) {
  const { bucket, encryptionKey, objectKey } = getUserStoreConfig();
  if (!bucket || !encryptionKey) return false;

  const client = getS3Client();
  const body = encryptJsonPayload(users, encryptionKey);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: body,
    ContentType: 'application/json',
    ContentEncoding: 'utf-8',
    Metadata: {
      encrypted: 'true',
      format: 'json'
    }
  }));

  return true;
}

module.exports = {
  syncUsersToS3
};
