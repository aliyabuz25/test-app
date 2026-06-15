const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const { initDb } = require('./database');
initDb().then(() => {
  console.log('SQLite Database initialized & seeded successfully.');
}).catch(err => {
  console.error('Failed to initialize SQLite Database:', err);
});

const path = require('path');
const fs = require('fs');
const authController = require('./controllers/AuthController');
const catalogController = require('./controllers/CatalogController');
const categoryController = require('./controllers/CategoryController');
const storyController = require('./controllers/StoryController');
const audioItemController = require('./controllers/AudioItemController');
const productController = require('./controllers/ProductController');
const upload = require('./middlewares/upload');
const userModel = require('./models/User');
const paymentModel = require('./models/Payment');
const notificationModel = require('./models/Notification');

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');

// Security Middlewares
// Disable contentSecurityPolicy in helmet for development to allow external CDN stylesheets/scripts
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Custom XSS Prevention Helper (HTML Sanitization for inputs)
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&' + 'amp;')
    .replace(/</g, '&' + 'lt;')
    .replace(/>/g, '&' + 'gt;')
    .replace(/"/g, '&' + 'quot;')
    .replace(/'/g, '&' + '#x27;')
    .replace(/\//g, '&' + '#x2F;');
}

// Middleware to sanitize all incoming body strings to prevent XSS
app.use((req, res, next) => {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeString(req.body[key]);
      }
    }
  }
  next();
});

// User-Agent control middleware (allows bible-appclient client as well as typical browsers for the panel UI)
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const isBrowser = userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari') || userAgent.includes('Edge');
  
  if (userAgent !== 'bible-appclient' && !isBrowser) {
    return res.status(403).json({ message: 'Erişim engellendi: Geçersiz User-Agent.' });
  }
  next();
});

// Bruteforce prevention (Rate Limiting)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    message: 'Çok fazla giriş denemesi yaptınız. Lütfen 15 dakika sonra tekrar deneyin.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes using Class Controllers
app.post('/api/register', authLimiter, (req, res) => authController.register(req, res));
app.post('/api/login', authLimiter, (req, res) => authController.login(req, res));
app.get('/api/auth/verify', (req, res) => authController.verify(req, res));

app.get('/api/catalogs', (req, res) => catalogController.getAll(req, res));

// Users API Endpoints
app.get('/api/users', async (req, res) => {
  try {
    const users = await userModel.getAll();
    const sanitizedUsers = users.map(u => ({
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

// Payments API Endpoints (In-App Purchases)
app.get('/api/payments', async (req, res) => {
  try {
    const payments = await paymentModel.getAll();
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: 'Ödemeler alınamadı.' });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const { userId, userEmail, productId, amount, currency, status, transactionId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'userId parametresi gereklidir.' });
    }
    const newPayment = await paymentModel.create({
      userId,
      userEmail,
      productId,
      amount,
      currency,
      status,
      transactionId
    });
    res.status(201).json({
      message: 'Ödeme kaydı başarıyla oluşturuldu.',
      payment: newPayment
    });
  } catch (err) {
    res.status(500).json({ message: 'Ödeme kaydı oluşturulamadı.' });
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
    const { title, message, type, sentTo } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'Başlık (title) ve Mesaj (message) alanları zorunludur.' });
    }
    const newNotif = await notificationModel.create({
      title,
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

// Category REST API routes
app.get('/api/categories', (req, res) => categoryController.getAll(req, res));
app.post('/api/categories', (req, res) => categoryController.create(req, res));
app.put('/api/categories/:id', (req, res) => categoryController.update(req, res));
app.delete('/api/categories/:id', (req, res) => categoryController.delete(req, res));

// Story REST API routes
app.get('/api/stories', (req, res) => storyController.getAll(req, res));
app.post('/api/stories', (req, res) => storyController.create(req, res));
app.put('/api/stories/:id', (req, res) => storyController.update(req, res));
app.delete('/api/stories/:id', (req, res) => storyController.delete(req, res));

// AudioItem REST API routes
app.get('/api/audio-items', (req, res) => audioItemController.getAll(req, res));
app.post('/api/audio-items', (req, res) => audioItemController.create(req, res));
app.put('/api/audio-items/:id', (req, res) => audioItemController.update(req, res));
app.delete('/api/audio-items/:id', (req, res) => audioItemController.delete(req, res));

// Product REST API routes
app.get('/api/products', (req, res) => productController.getAll(req, res));
app.post('/api/products', (req, res) => productController.create(req, res));
app.put('/api/products/:id', (req, res) => productController.update(req, res));
app.delete('/api/products/:id', (req, res) => productController.delete(req, res));

// Catalog creation endpoint supporting multipart uploads for vertical & horizontal thumbnails
app.post(
  '/api/catalogs',
  upload.fields([
    { name: 'verticalImage', maxCount: 1 },
    { name: 'horizontalImage', maxCount: 1 }
  ]),
  (req, res) => catalogController.create(req, res)
);

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
