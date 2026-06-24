const db = require('../database');

async function ensureSubtitleUrlColumn() {
  try {
    await db.run("ALTER TABLE videos ADD COLUMN subtitleUrl TEXT DEFAULT ''");
  } catch (err) {
    if (!err || !String(err.message || '').includes('duplicate column name')) {
      throw err;
    }
  }
}

function isMissingSubtitleColumnError(err) {
  return err && err.code === 'SQLITE_ERROR' && String(err.message || '').includes('no column named subtitleUrl');
}

class Video {
  async getAll(filters = {}) {
    try {
      let query = "SELECT * FROM videos WHERE 1=1";
      const params = [];

      if (filters.categoryId) {
        query += " AND categoryId = ?";
        params.push(parseInt(filters.categoryId));
      }
      if (filters.isPublished !== undefined) {
        query += " AND isPublished = ?";
        params.push(filters.isPublished ? 1 : 0);
      }

      query += " ORDER BY orderIndex ASC, id ASC";
      const rows = await db.all(query, params);
      return rows;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async findById(id) {
    try {
      const row = await db.get("SELECT * FROM videos WHERE id = ?", [parseInt(id)]);
      return row || null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async findBySlug(slug) {
    try {
      const row = await db.get("SELECT * FROM videos WHERE slug = ?", [slug]);
      return row || null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async create({ title, slug, categoryId, category, videoUrl, verticalBannerUrl, subtitleUrl, isLocked, isPublished, orderIndex }) {
    const insertVideo = async () => {
      const createdAt = new Date().toISOString();
      const result = await db.run(
        "INSERT INTO videos (title, slug, categoryId, category, videoUrl, verticalBannerUrl, subtitleUrl, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          title,
          slug,
          categoryId ? parseInt(categoryId) : null,
          category,
          videoUrl,
          verticalBannerUrl || '',
          subtitleUrl,
          isLocked ? 1 : 0,
          isPublished ? 1 : 0,
          orderIndex ? parseInt(orderIndex) : 0,
          createdAt
        ]
      );
      return {
        id: result.lastID,
        title,
        slug,
        categoryId: categoryId ? parseInt(categoryId) : null,
        category,
        videoUrl,
        verticalBannerUrl,
        subtitleUrl,
        isLocked: isLocked ? 1 : 0,
        isPublished: isPublished ? 1 : 0,
        orderIndex: orderIndex ? parseInt(orderIndex) : 0,
        createdAt
      };
    };

    try {
      return await insertVideo();
    } catch (err) {
      if (isMissingSubtitleColumnError(err)) {
        await ensureSubtitleUrlColumn();
        return insertVideo();
      }
      console.error(err);
      throw err;
    }
  }

  async update(id, { title, slug, categoryId, category, videoUrl, verticalBannerUrl, subtitleUrl, isLocked, isPublished, orderIndex }) {
    try {
      const existing = await this.findById(id);
      if (!existing) return null;

      const updatedTitle = title !== undefined ? title : existing.title;
      const updatedSlug = slug !== undefined ? slug : existing.slug;
      const updatedCategoryId = categoryId !== undefined ? (categoryId ? parseInt(categoryId) : null) : existing.categoryId;
      const updatedCategory = category !== undefined ? category : existing.category;
      const updatedVideoUrl = videoUrl !== undefined ? videoUrl : existing.videoUrl;
      const updatedVerticalBannerUrl = verticalBannerUrl !== undefined ? verticalBannerUrl : existing.verticalBannerUrl;
      const updatedSubtitleUrl = subtitleUrl !== undefined ? subtitleUrl : existing.subtitleUrl;
      const updatedIsLocked = isLocked !== undefined ? (isLocked ? 1 : 0) : existing.isLocked;
      const updatedIsPublished = isPublished !== undefined ? (isPublished ? 1 : 0) : existing.isPublished;
      const updatedOrderIndex = orderIndex !== undefined ? parseInt(orderIndex) : existing.orderIndex;

      const updateVideo = async () => {
        await db.run(
          "UPDATE videos SET title = ?, slug = ?, categoryId = ?, category = ?, videoUrl = ?, verticalBannerUrl = ?, subtitleUrl = ?, isLocked = ?, isPublished = ?, orderIndex = ? WHERE id = ?",
          [
            updatedTitle,
            updatedSlug,
            updatedCategoryId,
            updatedCategory,
            updatedVideoUrl,
            updatedVerticalBannerUrl,
            updatedSubtitleUrl,
            updatedIsLocked,
            updatedIsPublished,
            updatedOrderIndex,
            parseInt(id)
          ]
        );
      };

      try {
        await updateVideo();
      } catch (err) {
        if (!isMissingSubtitleColumnError(err)) throw err;
        await ensureSubtitleUrlColumn();
        await updateVideo();
      }

      return {
        id: parseInt(id),
        title: updatedTitle,
        slug: updatedSlug,
        categoryId: updatedCategoryId,
        category: updatedCategory,
        videoUrl: updatedVideoUrl,
        verticalBannerUrl: updatedVerticalBannerUrl,
        subtitleUrl: updatedSubtitleUrl,
        isLocked: updatedIsLocked,
        isPublished: updatedIsPublished,
        orderIndex: updatedOrderIndex
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async delete(id) {
    try {
      const result = await db.run("DELETE FROM videos WHERE id = ?", [parseInt(id)]);
      return result.changes > 0;
    } catch (err) {
      console.error(err);
      return false;
    }
  }
}

module.exports = new Video();
