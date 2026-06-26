const audioItemModel = require('../models/AudioItem');
const fs = require('fs/promises');
const { uploadFileToS3 } = require('../lib/s3');

async function maybeUploadToS3(file, keyPrefix) {
  if (!file) return null;
  const hasS3Env = Boolean(process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME);
  if (!hasS3Env) {
    return `/uploads/${file.filename}`;
  }

  const rootPrefix = process.env.AWS_S3_PREFIX || 'kidsbible-content';
  const finalPrefix = `${rootPrefix}/${keyPrefix}`;

  const result = await uploadFileToS3({
    filePath: file.path,
    originalName: file.originalname,
    mimeType: file.mimetype,
    keyPrefix: finalPrefix
  });

  try {
    await fs.unlink(file.path);
  } catch (err) {
    console.error('Local file cleanup failed:', err);
  }

  return result.url;
}

class AudioItemController {
  async getAll(req, res) {
    try {
      const filters = {};
      if (req.query.categoryId) filters.categoryId = req.query.categoryId;
      if (req.query.category) filters.category = req.query.category;
      if (req.query.isPublished !== undefined) filters.isPublished = req.query.isPublished === 'true' || req.query.isPublished === '1';

      const items = await audioItemModel.getAll(filters);
      res.status(200).json(items);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async create(req, res) {
    try {
      let { title, slug, category, categoryId, duration, durationSeconds, image, audioUrl, badgeColor, isLocked, isPublished, orderIndex } = req.body;
      
      if (req.files) {
        if (req.files['image'] && req.files['image'][0]) {
          image = await maybeUploadToS3(req.files['image'][0], 'audio-item-images');
        }
        if (req.files['audio'] && req.files['audio'][0]) {
          audioUrl = await maybeUploadToS3(req.files['audio'][0], 'audio-item-audio');
        }
      }
      if (req.file) {
        image = await maybeUploadToS3(req.file, 'audio-item-images');
      }

      if (!title || !slug || !category || !image || !audioUrl) {
        return res.status(400).json({ message: 'Lütfen tüm zorunlu alanları doldurun (title, slug, category, image, audioUrl).' });
      }

      const newItem = await audioItemModel.create({
        title,
        slug,
        category,
        categoryId,
        duration,
        durationSeconds,
        image,
        audioUrl,
        badgeColor,
        isLocked: isLocked === 'true' || isLocked === 1 || isLocked === true,
        isPublished: isPublished === 'true' || isPublished === 1 || isPublished === true,
        orderIndex
      });

      res.status(201).json({
        message: 'Ses kaydı başarıyla eklendi.',
        audioItem: newItem
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async update(req, res) {
    try {
      let { title, slug, category, categoryId, duration, durationSeconds, image, audioUrl, badgeColor, isLocked, isPublished, orderIndex } = req.body;
      
      if (req.files) {
        if (req.files['image'] && req.files['image'][0]) {
          image = await maybeUploadToS3(req.files['image'][0], 'audio-item-images');
        }
        if (req.files['audio'] && req.files['audio'][0]) {
          audioUrl = await maybeUploadToS3(req.files['audio'][0], 'audio-item-audio');
        }
      }
      if (req.file) {
        image = await maybeUploadToS3(req.file, 'audio-item-images');
      }

      const updated = await audioItemModel.update(req.params.id, {
        title,
        slug,
        category,
        categoryId,
        duration,
        durationSeconds,
        image,
        audioUrl,
        badgeColor,
        isLocked: isLocked === undefined ? undefined : (isLocked === 'true' || isLocked === 1 || isLocked === true),
        isPublished: isPublished === undefined ? undefined : (isPublished === 'true' || isPublished === 1 || isPublished === true),
        orderIndex
      });

      if (!updated) {
        return res.status(404).json({ message: 'Ses kaydı bulunamadı.' });
      }

      res.json({
        message: 'Ses kaydı başarıyla güncellendi.',
        audioItem: updated
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async delete(req, res) {
    try {
      const success = await audioItemModel.delete(req.params.id);
      if (!success) {
        return res.status(404).json({ message: 'Ses kaydı bulunamadı.' });
      }
      res.json({ message: 'Ses kaydı başarıyla silindi.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }
}

module.exports = new AudioItemController();
