const db = require('../database');
const CDN_BASE_URL = 'https://cdn.biblecms.com/images/';
const { syncCollectionToS3 } = require('../lib/userS3Store');

class Catalog {
  async getAll() {
    try {
      const rows = await db.all("SELECT * FROM catalogs ORDER BY id ASC");
      return rows;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async create({ name, description, verticalImage, horizontalImage }) {
    try {
      let cleanVertical = verticalImage.trim();
      let cleanHorizontal = horizontalImage.trim();

      // Ensure extensions exist
      if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(cleanVertical)) {
        cleanVertical += '.jpg';
      }
      if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(cleanHorizontal)) {
        cleanHorizontal += '.jpg';
      }

      const thumbnailVertical = cleanVertical.startsWith('http') || cleanVertical.startsWith('/')
        ? cleanVertical
        : `${CDN_BASE_URL}${cleanVertical}`;
      
      const thumbnailHorizontal = cleanHorizontal.startsWith('http') || cleanHorizontal.startsWith('/')
        ? cleanHorizontal
        : `${CDN_BASE_URL}${cleanHorizontal}`;

      const createdAt = new Date().toISOString();

      const result = await db.run(
        "INSERT INTO catalogs (name, description, thumbnailVertical, thumbnailHorizontal, createdAt) VALUES (?, ?, ?, ?, ?)",
        [name, description, thumbnailVertical, thumbnailHorizontal, createdAt]
      );

      const createdCatalog = {
        id: result.lastID,
        name,
        description,
        thumbnailVertical,
        thumbnailHorizontal,
        createdAt
      };
      await syncCollectionToS3('catalogs', await this.getAll());
      return createdCatalog;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}

module.exports = new Catalog();
