const categoryModel = require('../models/Category');

class CategoryController {
  async getAll(req, res) {
    try {
      const categories = await categoryModel.getAll();
      res.status(200).json(categories);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async create(req, res) {
    try {
      const { title, subtitle, count, image, type, orderIndex, isPublished } = req.body;
      if (!title || !image || !type) {
        return res.status(400).json({ message: 'Lütfen tüm zorunlu alanları doldurun (title, image, type).' });
      }

      const newCategory = await categoryModel.create({
        title,
        subtitle,
        count,
        image,
        type,
        orderIndex,
        isPublished: isPublished === undefined ? true : isPublished
      });

      res.status(201).json({
        message: 'Kategori başarıyla eklendi.',
        category: newCategory
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async update(req, res) {
    try {
      const { title, subtitle, count, image, type, orderIndex, isPublished } = req.body;
      const updated = await categoryModel.update(req.params.id, {
        title,
        subtitle,
        count,
        image,
        type,
        orderIndex,
        isPublished
      });

      if (!updated) {
        return res.status(404).json({ message: 'Kategori bulunamadı.' });
      }

      res.json({
        message: 'Kategori başarıyla güncellendi.',
        category: updated
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async delete(req, res) {
    try {
      const success = await categoryModel.delete(req.params.id);
      if (!success) {
        return res.status(404).json({ message: 'Kategori bulunamadı.' });
      }
      res.json({ message: 'Kategori başarıyla silindi.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }
}

module.exports = new CategoryController();
