const productModel = require('../models/Product');

class ProductController {
  async getAll(req, res) {
    try {
      const filters = {};
      if (req.query.isPublished !== undefined) filters.isPublished = req.query.isPublished === 'true' || req.query.isPublished === '1';

      const products = await productModel.getAll(filters);
      res.status(200).json(products);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async create(req, res) {
    try {
      const { title, description, price, priceString, image, duration, durationSeconds, orderIndex, isPublished } = req.body;
      if (!title || price === undefined || !image) {
        return res.status(400).json({ message: 'Lütfen tüm zorunlu alanları doldurun (title, price, image).' });
      }

      const newProduct = await productModel.create({
        title,
        description,
        price: parseFloat(price),
        priceString,
        image,
        duration,
        durationSeconds,
        orderIndex,
        isPublished: isPublished === 'true' || isPublished === 1 || isPublished === true
      });

      res.status(201).json({
        message: 'Ürün başarıyla eklendi.',
        product: newProduct
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async update(req, res) {
    try {
      const { title, description, price, priceString, image, duration, durationSeconds, orderIndex, isPublished } = req.body;
      const updated = await productModel.update(req.params.id, {
        title,
        description,
        price: price !== undefined ? parseFloat(price) : undefined,
        priceString,
        image,
        duration,
        durationSeconds,
        orderIndex,
        isPublished: isPublished === undefined ? undefined : (isPublished === 'true' || isPublished === 1 || isPublished === true)
      });

      if (!updated) {
        return res.status(404).json({ message: 'Ürün bulunamadı.' });
      }

      res.json({
        message: 'Ürün başarıyla güncellendi.',
        product: updated
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async delete(req, res) {
    try {
      const success = await productModel.delete(req.params.id);
      if (!success) {
        return res.status(404).json({ message: 'Ürün bulunamadı.' });
      }
      res.json({ message: 'Ürün başarıyla silindi.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }
}

module.exports = new ProductController();
