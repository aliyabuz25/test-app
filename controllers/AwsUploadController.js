const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

class AwsUploadController {
  async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Lütfen yüklenecek bir dosya seçin.' });
      }

      // Check if credentials are provided in body or environment
      const bucketName = req.body.bucketName || process.env.AWS_S3_BUCKET;
      const region = req.body.region || process.env.AWS_REGION || 'us-east-1';
      const accessKeyId = req.body.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = req.body.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;

      if (!bucketName) {
        return res.status(400).json({ message: 'AWS S3 Bucket ismi belirtilmelidir.' });
      }

      if (!accessKeyId || !secretAccessKey) {
        return res.status(400).json({ message: 'AWS Access Key ID ve Secret Access Key gereklidir.' });
      }

      const clientConfig = {
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      };

      // Create S3 Client
      const s3Client = new S3Client(clientConfig);

      const fileStream = fs.createReadStream(req.file.path);
      const key = `uploads/${Date.now()}_${req.file.originalname}`;

      const uploadParams = {
        Bucket: bucketName,
        Key: key,
        Body: fileStream,
        ContentType: req.file.mimetype,
      };

      await s3Client.send(new PutObjectCommand(uploadParams));

      // Build S3 URL
      const fileUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

      res.status(200).json({
        message: 'Dosya başarıyla AWS S3\'e yüklendi.',
        url: fileUrl,
        key: key,
        bucket: bucketName,
      });

      // Cleanup local file after upload
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Local file cleanup failed:', err);
      }

    } catch (error) {
      console.error('AWS S3 Upload Error:', error);
      res.status(500).json({
        message: 'AWS S3 yükleme hatası: ' + error.message,
      });
    }
  }
}

module.exports = new AwsUploadController();
