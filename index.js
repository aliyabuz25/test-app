const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { initDb } = require('./database');
initDb().then(() => {
  console.log('SQLite Database initialized & seeded successfully.');
  if (process.env.AWS_S3_BUCKET && process.env.USER_JSON_ENCRYPTION_KEY) {
    userModel.getAll().then(users => Promise.all([
      syncUsersToS3(users),
      syncAdminsToS3(users)
    ])).catch(err => {
      console.error('Initial user S3 sync failed:', err);
    });
  }
}).catch(err => {
  console.error('Failed to initialize SQLite Database:', err);
});

const fs = require('fs');
const authController = require('./controllers/AuthController');
const catalogController = require('./controllers/CatalogController');
const categoryController = require('./controllers/CategoryController');
const storyController = require('./controllers/StoryController');
const audioItemController = require('./controllers/AudioItemController');
const musicItemController = require('./controllers/MusicItemController');
const productController = require('./controllers/ProductController');
const videoController = require('./controllers/VideoController');
const awsUploadController = require('./controllers/AwsUploadController');
const upload = require('./middlewares/upload');
const userModel = require('./models/User');
const paymentModel = require('./models/Payment');
const notificationModel = require('./models/Notification');
const catalogModel = require('./models/Catalog');
const videoModel = require('./models/Video');
const { listS3Objects } = require('./lib/s3');
const { fetchCollectionFromS3, syncAdminsToS3, syncUsersToS3 } = require('./lib/userS3Store');

const app = express();
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_CHECKOUT_SUCCESS_URL = process.env.STRIPE_CHECKOUT_SUCCESS_URL || 'http://localhost:3000/dashboard?payment=success';
const STRIPE_CHECKOUT_CANCEL_URL = process.env.STRIPE_CHECKOUT_CANCEL_URL || 'http://localhost:3000/dashboard?payment=cancel';

const videoUploadFields = [
  { name: 'video', maxCount: 1 },
  { name: 'verticalBanner', maxCount: 1 },
  { name: 'subtitleFile', maxCount: 1 }
];

function maybeVideoUpload(req, res, next) {
  if (req.is('multipart/form-data')) {
    return upload.mediaUpload.fields(videoUploadFields)(req, res, next);
  }
  return next();
}

// Trust proxy for express-rate-limit behind reverse proxy (like Nginx)
app.set('trust proxy', 1);

// Set EJS as templating engine and set views directory explicitly
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Security Middlewares
// Disable contentSecurityPolicy in helmet for development to allow external CDN stylesheets/scripts
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false
  })
);
// Allow CORS from everywhere
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, User-Agent');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '10gb' }));
app.use(express.urlencoded({ limit: '10gb', extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve terms & privacy policy statically from public folder
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Custom XSS Prevention Helper (HTML Sanitization for inputs)
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&' + 'amp;')
    .replace(/</g, '&' + 'lt;')
    .replace(/>/g, '&' + 'gt;')
    .replace(/"/g, '&' + 'quot;')
    .replace(/'/g, '&' + '#x27;');
}

function shouldSkipBodySanitize(key) {
  return [
    'imageUrl',
    'audioUrl',
    'video',
    'videoUrl',
    'verticalBanner',
    'verticalBannerUrl',
    'subtitleUrl'
  ].includes(key);
}

// Middleware to sanitize all incoming body strings to prevent XSS
app.use((req, res, next) => {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string' && !shouldSkipBodySanitize(key)) {
        req.body[key] = sanitizeString(req.body[key]);
      }
    }
  }
  next();
});

// User-Agent control middleware (allows all clients)
app.use((req, res, next) => {
  next();
});

// JWT Token Verification Middleware
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeyforbiblecms';

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Erişim engellendi: Token bulunamadı.' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Geçersiz veya süresi dolmuş token.' });
    }
    req.user = user;
    next();
  });
}

// Bruteforce prevention (Rate Limiting) - Disabled as requested
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 999999, // Increased limit to prevent lockout
  message: {
    message: 'Çok fazla giriş denemesi yaptınız. Lütfen 15 dakika sonra tekrar deneyin.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes using Class Controllers
app.post('/api/register', (req, res) => authController.register(req, res));
app.post('/api/login', (req, res) => authController.login(req, res));
app.get('/api/auth/verify', (req, res) => authController.verify(req, res));

app.get('/api/catalogs', (req, res) => catalogController.getAll(req, res));

// Users API Endpoints
app.get('/api/users', async (req, res) => {
  try {
    const users = await userModel.getAll();
    const regularUsers = users.filter(u => u.role !== 'admin');
    const sanitizedUsers = regularUsers.map(u => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phoneNumber: u.phoneNumber,
      createdAt: u.createdAt
    }));
    res.json(sanitizedUsers);
  } catch (err) {
    res.status(500).json({ message: 'Kullanıcılar alınamadı.' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body;
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({ message: 'Lütfen tüm alanları doldurun.' });
    }
    const userExists = await userModel.findByEmail(email);
    if (userExists) {
      return res.status(400).json({ message: 'Bu e-posta adresi zaten kullanımda.' });
    }
    await userModel.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role: 'user',
      subscriptionStatus: 'none',
      isVerified: true
    });
    res.status(201).json({
      message: 'Kullanıcı başarıyla oluşturuldu.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Kullanıcı oluşturulurken bir hata oluştu.' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body;
    const updated = await userModel.update(req.params.id, {
      firstName,
      lastName,
      email,
      phoneNumber,
      password
    });
    if (!updated) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }
    res.json({
      message: 'Kullanıcı başarıyla güncellendi.',
      user: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phoneNumber: updated.phoneNumber
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Kullanıcı güncellenemedi.' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const success = await userModel.delete(req.params.id);
    if (!success) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }
    res.json({ message: 'Kullanıcı başarıyla silindi.' });
  } catch (err) {
    res.status(500).json({ message: 'Kullanıcı silinemedi.' });
  }
});

// Admins API Endpoints
app.get('/api/admins', async (req, res) => {
  try {
    const users = await userModel.getAll();
    const admins = users.filter(u => u.role === 'admin');
    const sanitizedAdmins = admins.map(u => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phoneNumber: u.phoneNumber,
      createdAt: u.createdAt
    }));
    res.json(sanitizedAdmins);
  } catch (err) {
    res.status(500).json({ message: 'Yöneticiler alınamadı.' });
  }
});

app.post('/api/admins', async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body;
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({ message: 'Lütfen tüm alanları doldurun.' });
    }
    const userExists = await userModel.findByEmail(email);
    if (userExists) {
      return res.status(400).json({ message: 'Bu e-posta adresi zaten kullanımda.' });
    }
    await userModel.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role: 'admin',
      subscriptionStatus: 'active',
      isVerified: true
    });
    res.status(201).json({
      message: 'Admin kullanıcısı başarıyla oluşturuldu.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Admin oluşturulurken bir hata oluştu.' });
  }
});

app.put('/api/admins/:id', async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body;
    const user = await userModel.findById(req.params.id);
    if (!user || user.role !== 'admin') {
      return res.status(404).json({ message: 'Admin bulunamadı.' });
    }
    const updated = await userModel.update(req.params.id, {
      firstName,
      lastName,
      email,
      phoneNumber,
      password
    });
    res.json({
      message: 'Admin başarıyla güncellendi.',
      admin: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phoneNumber: updated.phoneNumber
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Admin güncellenemedi.' });
  }
});

app.delete('/api/admins/:id', async (req, res) => {
  try {
    const user = await userModel.findById(req.params.id);
    if (!user || user.role !== 'admin') {
      return res.status(404).json({ message: 'Admin bulunamadı.' });
    }
    const success = await userModel.delete(req.params.id);
    if (!success) {
      return res.status(404).json({ message: 'Admin bulunamadı.' });
    }
    res.json({ message: 'Admin başarıyla silindi.' });
  } catch (err) {
    res.status(500).json({ message: 'Admin silinemedi.' });
  }
});

// Payments API Endpoints (In-App Purchases)
app.get('/api/payments', async (req, res) => {
  try {
    const payments = await paymentModel.getAll();
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: 'Ödemeler alınamadı.' });
  }
});

app.get('/api/payments/:id', async (req, res) => {
  try {
    const db = require('./database');
    const payment = await db.get("SELECT * FROM payments WHERE id = ?", [parseInt(req.params.id)]);
    if (!payment) {
      return res.status(404).json({ message: 'Ödeme bulunamadı.' });
    }
    res.json(payment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ödeme alınamadı.' });
  }
});

app.patch('/api/payments/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = new Set(['pending', 'completed', 'approved', 'blocked', 'failed', 'refunded', 'cancelled']);
    if (!allowed.has(String(status || '').toLowerCase())) {
      return res.status(400).json({ message: 'Geçersiz ödeme durumu.' });
    }

    const updated = await paymentModel.updateStatus(req.params.id, String(status).toLowerCase());
    if (!updated) {
      return res.status(404).json({ message: 'Ödeme bulunamadı.' });
    }

    res.json({
      message: 'Ödeme durumu güncellendi.',
      payment: updated
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ödeme durumu güncellenemedi.' });
  }
});

async function createStripeCheckoutSession({ amount, currency, productId, productName, userEmail, uid, successUrl, cancelUrl }) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key is not configured.');
  }

  const stripeAmount = Math.round(Number(amount || 0) * 100);
  if (!Number.isFinite(stripeAmount) || stripeAmount <= 0) {
    throw new Error('Invalid amount for Stripe checkout.');
  }

  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('success_url', successUrl || STRIPE_CHECKOUT_SUCCESS_URL);
  body.set('cancel_url', cancelUrl || STRIPE_CHECKOUT_CANCEL_URL);
  body.set('customer_email', userEmail || '');
  body.set('client_reference_id', String(uid || ''));
  body.set('line_items[0][price_data][currency]', String(currency || 'usd').toLowerCase());
  body.set('line_items[0][price_data][product_data][name]', productName || productId || 'BibleCMS Product');
  body.set('line_items[0][price_data][unit_amount]', String(stripeAmount));
  body.set('line_items[0][quantity]', '1');
  body.set('metadata[uid]', String(uid || ''));
  body.set('metadata[productId]', String(productId || ''));

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Stripe checkout session could not be created.');
  }

  return data;
}

app.post('/api/payments', async (req, res) => {
  try {
    const { userId, userEmail, productId, amount, currency, status, transactionId, uuid, subscriptionEndDate, ip, location } = req.body;
    
    // uid is required
    const uid = req.body.uid || userId || uuid;
    if (!uid) {
      return res.status(400).json({ message: 'uid parametresi gereklidir.' });
    }

    const clientIp = ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const clientLocation = location || 'Unknown';

    const newPayment = await paymentModel.create({
      userId: uid,
      userEmail,
      productId,
      amount,
      currency,
      status,
      transactionId,
      uuid: uuid || null,
      subscriptionEndDate,
      ip: clientIp,
      location: clientLocation
    });

    const wantsStripeCheckout = req.body.provider === 'stripe' || req.body.paymentMethod === 'stripe' || req.body.returnStripeLink === true;
    if (wantsStripeCheckout) {
      const stripeSession = await createStripeCheckoutSession({
        amount,
        currency,
        productId,
        productName: req.body.productName || req.body.title || productId,
        userEmail,
        uid,
        successUrl: req.body.successUrl,
        cancelUrl: req.body.cancelUrl
      });

      return res.status(201).json({
        message: 'Ödeme kaydı ve Stripe checkout bağlantısı oluşturuldu.',
        payment: newPayment,
        checkoutUrl: stripeSession.url,
        checkoutSessionId: stripeSession.id
      });
    }

    res.status(201).json({
      message: 'Ödeme kaydı başarıyla oluşturuldu.',
      payment: newPayment
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ödeme kaydı oluşturulamadı.' });
  }
});

app.post('/api/payments/stripe-checkout', async (req, res) => {
  try {
    const { userId, userEmail, productId, productName, amount, currency, successUrl, cancelUrl } = req.body;
    const uid = req.body.uid || userId || req.body.uuid;
    if (!uid) {
      return res.status(400).json({ message: 'uid parametresi gereklidir.' });
    }

    const stripeSession = await createStripeCheckoutSession({
      amount,
      currency,
      productId,
      productName,
      userEmail,
      uid,
      successUrl,
      cancelUrl
    });

    res.status(201).json({
      message: 'Stripe checkout bağlantısı oluşturuldu.',
      checkoutUrl: stripeSession.url,
      checkoutSessionId: stripeSession.id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Stripe checkout oluşturulamadı.' });
  }
});

// Check subscription endpoint
app.get('/api/subscription/check', async (req, res) => {
  try {
    const uid = req.query.uid || req.query.userId || req.query.uuid;
    if (!uid) {
      return res.status(400).json({ message: 'uid parametresi gereklidir.' });
    }

    const db = require('./database');
    const payment = await db.get(
      "SELECT * FROM payments WHERE (userId = ? OR uuid = ?) ORDER BY id DESC LIMIT 1",
      [uid, uid]
    );

    if (!payment) {
      return res.status(200).json({ status: 'exhausted', message: 'Subscription not found.' });
    }

    if (payment.subscriptionEndDate) {
      const expiryDate = new Date(payment.subscriptionEndDate);
      if (isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
        return res.status(200).json({ status: 'exhausted', message: 'Subscription has expired.' });
      }
      return res.json({
        status: 'active',
        subscriptionEndDate: payment.subscriptionEndDate,
        payment: {
          id: payment.id,
          productId: payment.productId,
          transactionId: payment.transactionId
        }
      });
    }

    if (payment.status !== 'completed' && payment.status !== 'active') {
      return res.status(200).json({ status: 'exhausted', message: 'Subscription is not active.' });
    }

    return res.json({
      status: 'active',
      payment: {
        id: payment.id,
        productId: payment.productId,
        transactionId: payment.transactionId
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Abonelik kontrolü sırasında hata oluştu.' });
  }
});

app.post('/api/subscription/check', async (req, res) => {
  try {
    const uid = req.body.uid || req.body.userId || req.body.uuid;
    if (!uid) {
      return res.status(400).json({ message: 'uid parametresi gereklidir.' });
    }

    const db = require('./database');
    const payment = await db.get(
      "SELECT * FROM payments WHERE (userId = ? OR uuid = ?) ORDER BY id DESC LIMIT 1",
      [uid, uid]
    );

    if (!payment) {
      return res.status(200).json({ status: 'exhausted', message: 'Subscription not found.' });
    }

    if (payment.subscriptionEndDate) {
      const expiryDate = new Date(payment.subscriptionEndDate);
      if (isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
        return res.status(200).json({ status: 'exhausted', message: 'Subscription has expired.' });
      }
      return res.json({
        status: 'active',
        subscriptionEndDate: payment.subscriptionEndDate,
        payment: {
          id: payment.id,
          productId: payment.productId,
          transactionId: payment.transactionId
        }
      });
    }

    if (payment.status !== 'completed' && payment.status !== 'active') {
      return res.status(200).json({ status: 'exhausted', message: 'Subscription is not active.' });
    }

    return res.json({
      status: 'active',
      payment: {
        id: payment.id,
        productId: payment.productId,
        transactionId: payment.transactionId
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Abonelik kontrolü sırasında hata oluştu.' });
  }
});

// In-App Notifications API Endpoints
app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await notificationModel.getAll();
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Bildirimler alınamadı.' });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const { message, type, sentTo } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'Mesaj (message) alanı zorunludur.' });
    }
    const newNotif = await notificationModel.create({
      title: 'KidsBibleApp',
      message,
      type,
      sentTo
    });
    res.status(201).json({
      message: 'Bildirim başarıyla oluşturuldu.',
      notification: newNotif
    });
  } catch (err) {
    res.status(500).json({ message: 'Bildirim oluşturulamadı.' });
  }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const success = await notificationModel.delete(req.params.id);
    if (!success) {
      return res.status(404).json({ message: 'Bildirim bulunamadı.' });
    }
    res.json({ message: 'Bildirim başarıyla silindi.' });
  } catch (err) {
    res.status(500).json({ message: 'Bildirim silinemedi.' });
  }
});

// Endpoint to fetch locales json without any api-key
app.get('/api/locales', (req, res) => {
  try {
    const localesPath = path.join(__dirname, 'data', 'locales.json');
    const localesData = JSON.parse(fs.readFileSync(localesPath, 'utf8'));
    res.json(localesData);
  } catch (err) {
    res.status(500).json({ message: 'Locales could not be loaded.' });
  }
});

// AWS S3 Upload REST API routes
app.post('/api/aws/upload', verifyToken, upload.genericUpload.single('file'), (req, res) => awsUploadController.uploadFile(req, res));

// Category REST API routes
app.get('/api/categories', (req, res) => categoryController.getAll(req, res));
app.post('/api/categories', upload.single('image'), (req, res) => categoryController.create(req, res));
app.put('/api/categories/:id', upload.single('image'), (req, res) => categoryController.update(req, res));
app.delete('/api/categories/:id', (req, res) => categoryController.delete(req, res));

// Story REST API routes
app.get('/api/stories', (req, res) => storyController.getAll(req, res));
app.post('/api/stories', upload.genericUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => storyController.create(req, res));
app.put('/api/stories/:id', upload.genericUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => storyController.update(req, res));
app.delete('/api/stories/:id', (req, res) => storyController.delete(req, res));

// AudioItem REST API routes
app.get('/api/audio-items', (req, res) => audioItemController.getAll(req, res));
app.post('/api/audio-items', upload.genericUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => audioItemController.create(req, res));
app.put('/api/audio-items/:id', upload.genericUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => audioItemController.update(req, res));
app.delete('/api/audio-items/:id', (req, res) => audioItemController.delete(req, res));

// MusicItem REST API routes
app.get('/api/music-items', (req, res) => musicItemController.getAll(req, res));
app.get('/api/music-items/:id', (req, res) => musicItemController.getById(req, res));
app.post('/api/music-items', upload.genericUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => musicItemController.create(req, res));
app.delete('/api/music-items/:id', (req, res) => musicItemController.delete(req, res));

// Product REST API routes
app.get('/api/products', (req, res) => productController.getAll(req, res));
app.post('/api/products', upload.single('image'), (req, res) => productController.create(req, res));
app.put('/api/products/:id', upload.single('image'), (req, res) => productController.update(req, res));
app.delete('/api/products/:id', (req, res) => productController.delete(req, res));

// Video REST API routes
app.get('/api/videos', (req, res) => videoController.getAll(req, res));
app.get('/api/videos/next-order', (req, res) => videoController.getNextOrderIndex(req, res));
app.get('/api/videos/:id', (req, res) => videoController.getById(req, res));
app.post('/api/videos/presign', (req, res) => videoController.createPresignedUrls(req, res));
app.post('/api/videos', maybeVideoUpload, (req, res) => videoController.create(req, res));
app.put('/api/videos/:id', maybeVideoUpload, (req, res) => videoController.update(req, res));
app.delete('/api/videos/:id', (req, res) => videoController.delete(req, res));

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [catalogs, users, payments, notifications, dbVideos] = await Promise.all([
      fetchCollectionFromS3('catalogs').catch(() => []),
      fetchCollectionFromS3('users').catch(() => []),
      fetchCollectionFromS3('payments').catch(() => []),
      fetchCollectionFromS3('notifications').catch(() => []),
      videoModel.getAll({}).then(rows => rows.length)
    ]);

    const rootPrefix = process.env.AWS_S3_PREFIX || 'kidsbible-content';
    const [videoObjects, bannerObjects, subtitleObjects] = await Promise.all([
      listS3Objects({ prefix: `${rootPrefix}/videos` }),
      listS3Objects({ prefix: `${rootPrefix}/video-banners` }),
      listS3Objects({ prefix: `${rootPrefix}/video-subtitles` })
    ]);

    res.json({
      catalogs: catalogs.length,
      users: users.length,
      payments: payments.length,
      notifications: notifications.length,
      videos: {
        db: dbVideos,
        s3Videos: videoObjects.length,
        s3Banners: bannerObjects.length,
        s3Subtitles: subtitleObjects.length,
        totalS3Media: videoObjects.length + bannerObjects.length + subtitleObjects.length
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Dashboard stats could not be loaded.' });
  }
});

// Catalog creation endpoint supporting multipart uploads for vertical & horizontal thumbnails
app.post(
  '/api/catalogs',
  upload.fields([
    { name: 'verticalImage', maxCount: 1 },
    { name: 'horizontalImage', maxCount: 1 }
  ]),
  (req, res) => catalogController.create(req, res)
);

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Dosya boyutu çok büyük. Video için limiti yükselttim; hala alıyorsan yüklediğin dosya beklenenden büyük olabilir.' });
  }
  if (err.message && (
    err.message.includes('dosya türü') ||
    err.message.includes('görsel') ||
    err.message.includes('video') ||
    err.message.includes('altyazı')
  )) {
    return res.status(400).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: 'An error occurred during upload.' });
});

// HTML Panel Routes
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/register', (req, res) => {
  res.redirect('/login');
});

app.get('/dashboard', (req, res) => {
  res.render('dashboard');
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
