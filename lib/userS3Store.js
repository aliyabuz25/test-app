const crypto = require('crypto');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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
    usersObjectKey: `${keyPrefix}/secure/users.json.enc`,
    adminsObjectKey: `${keyPrefix}/secure/admins.json.enc`
  };
}

function getCollectionObjectKey(collectionName) {
  const { keyPrefix } = getUserStoreConfig();
  return `${keyPrefix}/secure/${collectionName}.json.enc`;
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

function decryptJsonPayload(payloadBuffer, encryptionKey) {
  const key = getEncryptionKeyBuffer(encryptionKey);
  if (!key) {
    throw new Error('USER_JSON_ENCRYPTION_KEY is required to decrypt user JSON.');
  }

  const parsed = JSON.parse(Buffer.isBuffer(payloadBuffer) ? payloadBuffer.toString('utf8') : String(payloadBuffer || ''));
  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const data = Buffer.from(parsed.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function syncUsersToS3(users) {
  const { bucket, encryptionKey, usersObjectKey } = getUserStoreConfig();
  if (!bucket || !encryptionKey) return false;

  const client = getS3Client();
  const body = encryptJsonPayload(users, encryptionKey);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: usersObjectKey,
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

async function syncAdminsToS3(users) {
  const { bucket, encryptionKey, adminsObjectKey } = getUserStoreConfig();
  if (!bucket || !encryptionKey) return false;

  const adminUsers = Array.isArray(users) ? users.filter(user => String(user?.role || '').toLowerCase() === 'admin') : [];
  const client = getS3Client();
  const body = encryptJsonPayload(adminUsers, encryptionKey);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: adminsObjectKey,
    Body: body,
    ContentType: 'application/json',
    ContentEncoding: 'utf-8',
    Metadata: {
      encrypted: 'true',
      format: 'json',
      scope: 'admins'
    }
  }));

  return true;
}

async function syncCollectionToS3(collectionName, rows) {
  const { bucket, encryptionKey } = getUserStoreConfig();
  if (!bucket || !encryptionKey) return false;

  const client = getS3Client();
  const body = encryptJsonPayload(rows, encryptionKey);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: getCollectionObjectKey(collectionName),
    Body: body,
    ContentType: 'application/json',
    ContentEncoding: 'utf-8',
    Metadata: {
      encrypted: 'true',
      format: 'json',
      collection: collectionName
    }
  }));

  return true;
}

async function fetchCollectionFromS3(collectionName) {
  const { bucket, encryptionKey } = getUserStoreConfig();
  if (!bucket || !encryptionKey) return [];
  const client = getS3Client();
  const response = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: getCollectionObjectKey(collectionName)
  }));
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return decryptJsonPayload(Buffer.concat(chunks), encryptionKey);
}

async function fetchEncryptedJsonFromS3(objectKey) {
  const { bucket, encryptionKey } = getUserStoreConfig();
  if (!bucket || !encryptionKey) return [];

  const client = getS3Client();
  const response = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey
  }));

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  const parsed = decryptJsonPayload(buffer, encryptionKey);
  return Array.isArray(parsed) ? parsed : [];
}

module.exports = {
  fetchCollectionFromS3,
  fetchEncryptedJsonFromS3,
  getCollectionObjectKey,
  syncCollectionToS3,
  syncAdminsToS3,
  syncUsersToS3
};
