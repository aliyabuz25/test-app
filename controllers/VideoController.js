const videoModel = require('../models/Video');
const categoryModel = require('../models/Category');
const fs = require('fs/promises');
const { createPresignedPutUrl, createS3ObjectKey, deleteS3Object, getS3ObjectKeyFromUrl, listS3Objects, uploadFileToS3 } = require('../lib/s3');

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

function getRootPrefix() {
  return process.env.AWS_S3_PREFIX || 'kidsbible-content';
}

function makeVideoUrlKeyPrefix(subdir) {
  const prefixMap = {
    video: 'videos',
    verticalBanner: 'video-banners',
    subtitleFile: 'video-subtitles'
  };
  return `${getRootPrefix()}/${prefixMap[subdir] || subdir}`;
}

function hasManualOrderIndex(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function getObjectTimestamp(object) {
  const fileName = object.key.split('/').pop() || '';
  const match = fileName.match(/^(\d{10,})-/);
  return match ? Number(match[1]) : 0;
}

function makeTitleFromKey(key) {
  const fileName = key.split('/').pop() || 'S3 Video';
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/^\d{10,}-\d+-/, '').replace(/[-_]+/g, ' ').trim() || 'S3 Video';
}

function makeSlug(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function findNearestByTimestamp(target, items, maxDiffMs = 10000) {
  let selected = null;
  let selectedDiff = Infinity;

  for (const item of items) {
    const timestamp = getObjectTimestamp(item);
    if (!timestamp || !target) continue;
    const diff = Math.abs(timestamp - target);
    if (diff <= maxDiffMs && diff < selectedDiff) {
      selected = item;
      selectedDiff = diff;
    }
  }

  return selected;
}

function getNextOrderFromRows(rows) {
  const maxOrder = (Array.isArray(rows) ? rows : []).reduce((max, row) => {
    const order = Number(row && row.orderIndex);
    return Number.isFinite(order) && order > max ? order : max;
  }, 0);
  return maxOrder + 1;
}

function getVideoIdentity(video) {
  const videoUrl = String(video?.videoUrl || '').trim().toLowerCase();
  if (videoUrl) {
    return `videoUrl:${videoUrl}`;
  }

  return [
    String(video?.slug || ''),
    String(video?.title || ''),
    String(video?.s3Key || '')
  ].join('|').toLowerCase();
}

function mergeDbAndS3Videos(dbVideos, s3Rows) {
  const seen = new Set((Array.isArray(dbVideos) ? dbVideos : []).map(getVideoIdentity));
  const merged = Array.isArray(dbVideos) ? [...dbVideos] : [];

  for (const row of Array.isArray(s3Rows) ? s3Rows : []) {
    const identity = getVideoIdentity(row);
    if (seen.has(identity)) continue;
    seen.add(identity);
    merged.push(row);
  }

  return merged.sort((a, b) => {
    const orderA = Number(a?.orderIndex) || 0;
    const orderB = Number(b?.orderIndex) || 0;
    if (orderA !== orderB) return orderA - orderB;
    const timeA = new Date(a?.createdAt || 0).getTime();
    const timeB = new Date(b?.createdAt || 0).getTime();
    return timeA - timeB;
  });
}

async function getS3VideoFallbackRows() {
  const [videos, banners, subtitles] = await Promise.all([
    listS3Objects({ prefix: makeVideoUrlKeyPrefix('video') }),
    listS3Objects({ prefix: makeVideoUrlKeyPrefix('verticalBanner') }),
    listS3Objects({ prefix: makeVideoUrlKeyPrefix('subtitleFile') })
  ]);

  return videos
    .sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0))
    .map((video, index) => {
      const timestamp = getObjectTimestamp(video);
      const banner = findNearestByTimestamp(timestamp, banners);
      const subtitle = findNearestByTimestamp(timestamp, subtitles);
      const title = makeTitleFromKey(video.key);
      const slug = makeSlug(`${title}-${timestamp || index + 1}`, `s3-video-${index + 1}`);

      return {
        id: `s3-${timestamp || index + 1}`,
        isS3Only: true,
        s3Key: video.key,
        title,
        slug,
        category: 'S3 Uploaded',
        categoryId: null,
        verticalBannerKey: banner ? banner.key : '',
        subtitleKey: subtitle ? subtitle.key : '',
        verticalBannerUrl: banner ? banner.url : '',
        videoUrl: video.url,
        subtitleUrl: subtitle ? subtitle.url : '',
        videoSizeBytes: video.size || 0,
        isLocked: 0,
        isPublished: 1,
        orderIndex: index + 1,
        createdAt: video.lastModified
      };
    });
}

class VideoController {
  async getNextOrderIndex(req, res) {
    try {
      const dbVideos = await videoModel.getAll({});
      let nextOrderIndex = getNextOrderFromRows(dbVideos);

      try {
        const s3Rows = await getS3VideoFallbackRows();
        nextOrderIndex = Math.max(nextOrderIndex, getNextOrderFromRows(s3Rows));
      } catch (s3Error) {
        console.error('S3 next order fallback error:', s3Error);
      }

      res.json({ nextOrderIndex });
    } catch (error) {
      console.error('Video next order error:', error);
      res.status(500).json({ message: 'Could not calculate next video order.' });
    }
  }

  async createPresignedUrls(req, res) {
    try {
      const items = Array.isArray(req.body?.files) ? req.body.files : [];
      if (!items.length) {
        return res.status(400).json({ message: 'Presigned URL üretmek için en az bir dosya bilgisi gerekli.' });
      }

      const uploads = await Promise.all(items.map(async (item) => {
        if (!item?.name || !item?.originalName) {
          throw new Error('Her dosya için name ve originalName alanları gerekli.');
        }

        const keyPrefix = makeVideoUrlKeyPrefix(item.name);
        const key = createS3ObjectKey({
          keyPrefix,
          originalName: item.originalName
        });

        return {
          fieldName: item.name,
          originalName: item.originalName,
          contentType: item.contentType || 'application/octet-stream',
          ...(await createPresignedPutUrl({
            key,
            contentType: item.contentType || 'application/octet-stream',
            expiresIn: Number(item.expiresIn) > 0 ? Number(item.expiresIn) : 900
          }))
        };
      }));

      res.json({ uploads });
    } catch (error) {
      console.error('Video presign error:', error);
      res.status(500).json({ message: error.message || 'Presigned URL oluşturulamadı.' });
    }
  }

  async getAll(req, res) {
    try {
      const filters = {};
      if (req.query.categoryId) {
        filters.categoryId = req.query.categoryId;
      }
      if (req.query.isPublished !== undefined) {
        filters.isPublished = req.query.isPublished === 'true' || req.query.isPublished === '1';
      }
      const videos = await videoModel.getAll(filters);
      if (req.query.source === 'db') {
        return res.json(videos);
      }

      try {
        const s3Rows = await getS3VideoFallbackRows();
        if (!filters.categoryId && filters.isPublished === undefined && s3Rows.length) {
          return res.json(mergeDbAndS3Videos(videos, s3Rows));
        }
      } catch (s3Error) {
        console.error('S3 video fallback list error:', s3Error);
      }

      res.json(videos);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async getById(req, res) {
    try {
      const video = await videoModel.findById(req.params.id);
      if (!video) {
        return res.status(404).json({ message: 'Video bulunamadı.' });
      }
      res.json(video);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
  }

  async create(req, res) {
    try {
      let { title, slug, categoryId, category, videoUrl, verticalBannerUrl, subtitleUrl, videoSizeBytes, isLocked, isPublished, orderIndex } = req.body;
      videoUrl = videoUrl || req.body.video || '';
      verticalBannerUrl = verticalBannerUrl || req.body.verticalBanner || '';

      if (req.files) {
        if (req.files['video'] && req.files['video'][0]) {
          videoUrl = await maybeUploadToS3(req.files['video'][0], 'videos');
          videoSizeBytes = req.files['video'][0].size;
        }
        if (req.files['verticalBanner'] && req.files['verticalBanner'][0]) {
          verticalBannerUrl = await maybeUploadToS3(req.files['verticalBanner'][0], 'video-banners');
        }
        if (req.files['subtitleFile'] && req.files['subtitleFile'][0]) {
          subtitleUrl = await maybeUploadToS3(req.files['subtitleFile'][0], 'video-subtitles');
        }
      }

      if (!title || !slug) {
        console.error('Video create validation failed: missing title or slug', {
          body: req.body,
          hasFiles: Boolean(req.files)
        });
        return res.status(400).json({ message: 'Please fill required fields: title and slug.' });
      }

      if (!videoUrl) {
        console.error('Video create validation failed: missing video URL', {
          body: req.body,
          files: req.files ? Object.keys(req.files) : []
        });
        return res.status(400).json({ message: 'Video URL is missing. Upload a video file or paste a video URL.' });
      }

      if (!verticalBannerUrl) {
        console.error('Video create validation failed: missing vertical banner URL', {
          body: req.body,
          files: req.files ? Object.keys(req.files) : []
        });
        return res.status(400).json({ message: 'Vertical banner URL is missing. Upload a banner file or paste a banner URL.' });
      }

      // If categoryId exists in the categories table, use its exact name.
      // Random hidden IDs from the dashboard should not break FK validation.
      if (categoryId) {
        const cat = await categoryModel.findById(categoryId);
        if (cat) {
          category = cat.title;
        } else {
          categoryId = null;
        }
      }

      const finalOrderIndex = hasManualOrderIndex(orderIndex)
        ? parseInt(orderIndex)
        : await videoModel.getNextOrderIndex();

      const newVideo = await videoModel.create({
        title,
        slug,
        categoryId: categoryId ? parseInt(categoryId) : null,
        category: category || 'Default Category',
        videoUrl,
        verticalBannerUrl,
        subtitleUrl: subtitleUrl || '',
        videoSizeBytes,
        isLocked: isLocked === 'true' || isLocked === '1' || isLocked === true,
        isPublished: isPublished === 'true' || isPublished === '1' || isPublished === true,
        orderIndex: finalOrderIndex
      });

      res.status(201).json({
        message: 'Video başarıyla oluşturuldu.',
        video: newVideo
      });
    } catch (error) {
      console.error('Video create error:', error);
      if (error && error.code === 'SQLITE_CONSTRAINT') {
        return res.status(400).json({ message: 'Bu slug zaten kullanılıyor. Lütfen farklı bir slug girin.' });
      }
      res.status(500).json({ message: error.message || 'Video oluşturulurken hata oluştu.' });
    }
  }

  async update(req, res) {
    try {
      let { title, slug, categoryId, category, videoUrl, verticalBannerUrl, subtitleUrl, videoSizeBytes, isLocked, isPublished, orderIndex } = req.body;
      videoUrl = videoUrl || req.body.video;
      verticalBannerUrl = verticalBannerUrl || req.body.verticalBanner;
      const isS3OnlyId = String(req.params.id || '').startsWith('s3-');

      if (req.files) {
        if (req.files['video'] && req.files['video'][0]) {
          videoUrl = await maybeUploadToS3(req.files['video'][0], 'videos');
          videoSizeBytes = req.files['video'][0].size;
        }
        if (req.files['verticalBanner'] && req.files['verticalBanner'][0]) {
          verticalBannerUrl = await maybeUploadToS3(req.files['verticalBanner'][0], 'video-banners');
        }
        if (req.files['subtitleFile'] && req.files['subtitleFile'][0]) {
          subtitleUrl = await maybeUploadToS3(req.files['subtitleFile'][0], 'video-subtitles');
        }
      }

      if (categoryId) {
        const cat = await categoryModel.findById(categoryId);
        if (cat) {
          category = cat.title;
        } else {
          categoryId = null;
        }
      }

      const updatePayload = {
        title,
        slug,
        categoryId: categoryId !== undefined ? (categoryId ? parseInt(categoryId) : null) : undefined,
        category,
        videoUrl,
        verticalBannerUrl,
        subtitleUrl,
        videoSizeBytes,
        isLocked: isLocked !== undefined ? (isLocked === 'true' || isLocked === '1' || isLocked === true) : undefined,
        isPublished: isPublished !== undefined ? (isPublished === 'true' || isPublished === '1' || isPublished === true) : undefined,
        orderIndex: orderIndex !== undefined ? parseInt(orderIndex) : undefined
      };

      const updated = isS3OnlyId
        ? await videoModel.create({
            ...updatePayload,
            categoryId: updatePayload.categoryId === undefined ? null : updatePayload.categoryId,
            category: updatePayload.category || 'S3 Uploaded',
            videoUrl: updatePayload.videoUrl || '',
            verticalBannerUrl: updatePayload.verticalBannerUrl || '',
            subtitleUrl: updatePayload.subtitleUrl || '',
            videoSizeBytes: updatePayload.videoSizeBytes || 0,
            isLocked: updatePayload.isLocked === undefined ? false : updatePayload.isLocked,
            isPublished: updatePayload.isPublished === undefined ? true : updatePayload.isPublished,
            orderIndex: updatePayload.orderIndex || 1
          })
        : await videoModel.update(req.params.id, updatePayload);

      if (!updated) {
        return res.status(404).json({ message: 'Video bulunamadı.' });
      }

      res.json({
        message: 'Video başarıyla güncellendi.',
        video: updated
      });
    } catch (error) {
      console.error('Video update error:', error);
      if (error && error.code === 'SQLITE_CONSTRAINT') {
        return res.status(400).json({ message: 'Bu slug zaten kullanılıyor. Lütfen farklı bir slug girin.' });
      }
      res.status(500).json({ message: error.message || 'Video güncellenirken hata oluştu.' });
    }
  }

  async delete(req, res) {
    try {
      const id = req.params.id;
      const video = await videoModel.findById(id);
      if (video) {
        const deleted = await videoModel.delete(id);
        if (!deleted) {
          return res.status(404).json({ message: 'Video bulunamadı.' });
        }
        return res.json({ message: 'Video başarıyla silindi.' });
      }

      const source = String(req.query.source || '');
      const key = req.query.key || getS3ObjectKeyFromUrl(req.query.url || req.body?.url || '');
      if (source === 's3' || key) {
        if (!key) {
          return res.status(400).json({ message: 'S3 video silmek için key veya url gerekli.' });
        }
        await deleteS3Object({ key });
        return res.json({ message: 'S3 video başarıyla silindi.' });
      }

      return res.status(404).json({ message: 'Video bulunamadı.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Video silinirken hata oluştu.' });
    }
  }
}

module.exports = new VideoController();
