const audioItemModel = require('../models/AudioItem');

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
      const { title, slug, category, categoryId, duration, durationSeconds, image, audioUrl, badgeColor, isLocked, isPublished, orderIndex } = req.body;
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
      const { title, slug, category, categoryId, duration, durationSeconds, image, audioUrl, badgeColor, isLocked, isPublished, orderIndex } = req.body;
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
