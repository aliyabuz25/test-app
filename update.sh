#!/bin/bash

# Target Configuration
KEY_PATH="/Users/ali_new/Desktop/KidBibleServiceKey2.pem"
REMOTE_USER="ec2-user"
REMOTE_IP="16.171.22.191"
REMOTE_DIR="/var/www/KidBibleService"

echo "==========================================="
echo "🚀 KidBibleService AWS deployment / update"
echo "==========================================="

# 1. Check if the SSH key exists
if [ ! -f "$KEY_PATH" ]; then
    echo "❌ SSH Key not found at: $KEY_PATH"
    exit 1
fi

echo "📦 Uploading backend files and views..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no index.js "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/index.js"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no database.js "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/database.js"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no package.json "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/package.json"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no package-lock.json "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/package-lock.json"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no -r lib "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no -r controllers "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no -r models "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no -r middlewares "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no -r data "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no -r views "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no .env.example "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/.env.example"
if [ -f ".env" ]; then
    echo "🔐 Uploading .env file..."
    scp -i "$KEY_PATH" -o StrictHostKeyChecking=no .env "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/.env"
else
    echo "🧩 Local .env not found, creating a minimal one..."
    touch .env
    scp -i "$KEY_PATH" -o StrictHostKeyChecking=no .env "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/.env"
fi

echo "🔧 Ensuring required AWS S3 env vars are present..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_IP" "bash -lc '
cd \"$REMOTE_DIR\" || exit 1
touch .env
sed -i \"/^AWS_S3_BUCKET=/d\" .env
sed -i \"/^AWS_BUCKET_NAME=/d\" .env
sed -i \"/^AWS_REGION=/d\" .env
sed -i \"/^AWS_S3_PREFIX=/d\" .env
sed -i \"/^AWS_ACCESS_KEY_ID=/d\" .env
sed -i \"/^AWS_SECRET_ACCESS_KEY=/d\" .env
sed -i \"/^AWS_SESSION_TOKEN=/d\" .env
echo \"AWS_S3_BUCKET=biblecms\" >> .env
echo \"AWS_REGION=eu-north-1\" >> .env
echo \"AWS_S3_PREFIX=kidsbible-content\" >> .env
'"

echo "🔄 Restarting application on AWS via PM2..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_IP" "cd $REMOTE_DIR && npm install --omit=dev && AWS_ACCESS_KEY_ID= AWS_SECRET_ACCESS_KEY= AWS_SESSION_TOKEN= pm2 restart KidBibleService --update-env"

echo "✅ Update complete! Checking service health..."
curl -s -H "User-Agent: bible-appclient" -o /dev/null -w "HTTP Response Code: %{http_code}\n" "https://app.thekidsbiblestories.com/login"
echo "==========================================="
