const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Helper to run query with Promise
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Helper to get all rows with Promise
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Helper to get single row with Promise
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Initialize tables and seed data
async function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        // Create tables
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            firstName TEXT NOT NULL,
            lastName TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phoneNumber TEXT NOT NULL,
            password TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            isVerified INTEGER DEFAULT 0,
            verificationToken TEXT,
            avatarId TEXT DEFAULT 'avatar_01',
            avatarUrl TEXT DEFAULT '',
            subscriptionStatus TEXT DEFAULT 'none',
            subscriptionPlan TEXT DEFAULT NULL,
            subscriptionExpiresAt TEXT DEFAULT NULL,
            trialStartedAt TEXT DEFAULT NULL,
            trialEndsAt TEXT DEFAULT NULL,
            revenueCatUserId TEXT DEFAULT NULL,
            fcmToken TEXT DEFAULT NULL,
            role TEXT DEFAULT 'user'
          )
        `);

        // Safely alter existing users table if columns are missing
        const alterColumns = [
          "isVerified INTEGER DEFAULT 0",
          "verificationToken TEXT",
          "avatarId TEXT DEFAULT 'avatar_01'",
          "avatarUrl TEXT DEFAULT ''",
          "subscriptionStatus TEXT DEFAULT 'none'",
          "subscriptionPlan TEXT DEFAULT NULL",
          "subscriptionExpiresAt TEXT DEFAULT NULL",
          "trialStartedAt TEXT DEFAULT NULL",
          "trialEndsAt TEXT DEFAULT NULL",
          "revenueCatUserId TEXT DEFAULT NULL",
          "fcmToken TEXT DEFAULT NULL",
          "role TEXT DEFAULT 'user'"
        ];

        for (const col of alterColumns) {
          db.run(`ALTER TABLE users ADD COLUMN ${col}`, [], () => {});
        }

        db.run(`
          CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            userEmail TEXT NOT NULL,
            productId TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            status TEXT NOT NULL,
            transactionId TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            uuid TEXT,
            subscriptionEndDate TEXT,
            ip TEXT,
            location TEXT
          )
        `);

        // Safely alter existing payments table if columns are missing
        const alterPaymentColumns = [
          "uuid TEXT DEFAULT NULL",
          "subscriptionEndDate TEXT DEFAULT NULL",
          "ip TEXT DEFAULT NULL",
          "location TEXT DEFAULT NULL"
        ];
        for (const col of alterPaymentColumns) {
          db.run(`ALTER TABLE payments ADD COLUMN ${col}`, [], () => {});
        }

        db.run(`
          CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            sentTo TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            read INTEGER DEFAULT 0,
            status TEXT DEFAULT NULL,
            metadata TEXT DEFAULT NULL
          )
        `);

        // Safely alter existing notifications table
        const alterNotificationColumns = [
          "read INTEGER DEFAULT 0",
          "status TEXT DEFAULT NULL",
          "metadata TEXT DEFAULT NULL"
        ];
        for (const col of alterNotificationColumns) {
          db.run(`ALTER TABLE notifications ADD COLUMN ${col}`, [], () => {});
        }

        db.run(`
          CREATE TABLE IF NOT EXISTS catalogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            thumbnailVertical TEXT NOT NULL,
            thumbnailHorizontal TEXT NOT NULL,
            createdAt TEXT NOT NULL
          )
        `);

        // NEW TABLES FOR BIBLE BACKEND REQUIREMENTS
        db.run(`
          CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            subtitle TEXT,
            count INTEGER DEFAULT 0,
            image TEXT NOT NULL,
            type TEXT NOT NULL,
            orderIndex INTEGER DEFAULT 0,
            isPublished INTEGER DEFAULT 1,
            createdAt TEXT NOT NULL
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS stories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            categoryId INTEGER,
            duration TEXT,
            durationSeconds INTEGER,
            image TEXT NOT NULL,
            contentText TEXT,
            audioUrl TEXT,
            isLocked INTEGER DEFAULT 0,
            isPublished INTEGER DEFAULT 0,
            orderIndex INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (categoryId) REFERENCES categories(id)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS audio_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            category TEXT NOT NULL,
            categoryId INTEGER,
            duration TEXT,
            durationSeconds INTEGER,
            image TEXT NOT NULL,
            audioUrl TEXT NOT NULL,
            badgeColor TEXT DEFAULT 'purple',
            isLocked INTEGER DEFAULT 0,
            isPublished INTEGER DEFAULT 0,
            orderIndex INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (categoryId) REFERENCES categories(id)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS music_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            image TEXT NOT NULL,
            audioUrl TEXT,
            categoryId INTEGER,
            category TEXT,
            createdAt TEXT NOT NULL
          )
        `);

        // Safely alter existing music_items table if columns are missing
        const alterMusicColumns = [
          "categoryId INTEGER DEFAULT NULL",
          "category TEXT DEFAULT NULL"
        ];
        for (const col of alterMusicColumns) {
          db.run(`ALTER TABLE music_items ADD COLUMN ${col}`, [], () => {});
        }

        db.run(`
          CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category TEXT DEFAULT 'Default Category',
            catColor TEXT DEFAULT '#9747ff',
            image TEXT NOT NULL,
            stories TEXT DEFAULT '',
            ages TEXT DEFAULT '',
            pages TEXT DEFAULT '',
            price REAL DEFAULT 0.0,
            priceString TEXT DEFAULT '',
            externalUrl TEXT DEFAULT '',
            isAvailable INTEGER DEFAULT 1,
            orderIndex INTEGER DEFAULT 0,
            description TEXT DEFAULT '',
            duration TEXT DEFAULT '',
            durationSeconds INTEGER DEFAULT 0,
            isPublished INTEGER DEFAULT 1,
            createdAt TEXT NOT NULL
          )
        `);

        // Safely alter existing products table if columns are missing
        const alterProductColumns = [
          "category TEXT DEFAULT 'Default Category'",
          "catColor TEXT DEFAULT '#9747ff'",
          "stories TEXT DEFAULT ''",
          "ages TEXT DEFAULT ''",
          "pages TEXT DEFAULT ''",
          "priceString TEXT DEFAULT ''",
          "externalUrl TEXT DEFAULT ''",
          "isAvailable INTEGER DEFAULT 1",
          "description TEXT DEFAULT ''",
          "duration TEXT DEFAULT ''",
          "durationSeconds INTEGER DEFAULT 0",
          "isPublished INTEGER DEFAULT 1"
        ];
        for (const col of alterProductColumns) {
          db.run(`ALTER TABLE products ADD COLUMN ${col}`, [], () => {});
        }

        db.run(`
          CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            categoryId INTEGER,
            category TEXT,
            videoUrl TEXT NOT NULL,
            verticalBannerUrl TEXT NOT NULL,
            subtitleUrl TEXT DEFAULT '',
            isLocked INTEGER DEFAULT 0,
            isPublished INTEGER DEFAULT 0,
            orderIndex INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (categoryId) REFERENCES categories(id)
          )
        `);

        db.all("PRAGMA table_info(videos)", [], (err, rows) => {
          if (!err && Array.isArray(rows)) {
            const hasSubtitleUrl = rows.some((row) => row.name === 'subtitleUrl');
            if (!hasSubtitleUrl) {
              db.run("ALTER TABLE videos ADD COLUMN subtitleUrl TEXT DEFAULT ''", [], () => {});
            }
          }
        });

        db.run(`
          CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            contentId INTEGER NOT NULL,
            contentType TEXT NOT NULL,
            addedAt TEXT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS playback_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            contentId INTEGER NOT NULL,
            contentType TEXT NOT NULL,
            progressSeconds INTEGER NOT NULL,
            totalSeconds INTEGER NOT NULL,
            completed INTEGER DEFAULT 0,
            lastPlayedAt TEXT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id)
          )
        `);

        // Check if users exist to seed
        db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
          if (err) return reject(err);

          // Helper to ensure the specific user exists
          const ensureSpecificUser = async () => {
            return new Promise((resUser) => {
              db.get("SELECT * FROM users WHERE email = 'ali.valizada@octotech.az'", async (err, userRow) => {
                if (!err && !userRow) {
                  const hash = await bcrypt.hash('Initial_123!', 10);
                  db.run(
                    "INSERT INTO users (firstName, lastName, email, phoneNumber, password, createdAt, isVerified, avatarId, subscriptionStatus, role) VALUES (?, ?, ?, ?, ?, ?, 1, 'avatar_05', 'active', 'admin')",
                    ['Ali', 'Valizada', 'ali.valizada@octotech.az', '5550000001', hash, new Date().toISOString()],
                    async (err) => {
                      if (!err) console.log('--- SEEDED SPECIFIC USER ali.valizada@octotech.az ---');
                      await ensureOrnaAdmin();
                      resUser();
                    }
                  );
                } else {
                  // Ensure existing ali has role = admin
                  db.run("UPDATE users SET role = 'admin' WHERE email = 'ali.valizada@octotech.az'", [], async () => {
                    await ensureOrnaAdmin();
                    resUser();
                  });
                }
              });
            });
          };

          // Helper to ensure Orna's admin user exists
          const ensureOrnaAdmin = async () => {
            return new Promise((resOrna) => {
              db.get("SELECT * FROM users WHERE email = 'orna@thekidsbiblestories.com'", async (err, userRow) => {
                if (!err && !userRow) {
                  const hash = await bcrypt.hash('OrnaAdmin123!', 10);
                  db.run(
                    "INSERT INTO users (firstName, lastName, email, phoneNumber, password, createdAt, isVerified, avatarId, subscriptionStatus, role) VALUES (?, ?, ?, ?, ?, ?, 1, 'avatar_01', 'active', 'admin')",
                    ['Orna', 'Client', 'orna@thekidsbiblestories.com', '5551112233', hash, new Date().toISOString()],
                    (err) => {
                      if (!err) console.log('--- SEEDED ORNA ADMIN USER ---');
                      resOrna();
                    }
                  );
                } else {
                  // Ensure Orna has admin role
                  db.run("UPDATE users SET role = 'admin' WHERE email = 'orna@thekidsbiblestories.com'", [], () => {
                    resOrna();
                  });
                }
              });
            });
          };

          // Helper to ensure 5 sample videos are seeded
          const ensureVideos = async () => {
            return new Promise((resVideos) => {
              db.get("SELECT COUNT(*) as count FROM videos", (err, videoCountRow) => {
                if (!err && videoCountRow && videoCountRow.count === 0) {
                  console.log('--- SEEDING SAMPLE VIDEOS ---');
                  db.get("SELECT id FROM categories WHERE type = 'video' LIMIT 1", (err, catRow) => {
                    const insertVideos = (finalCatId) => {
                      const sampleVideos = [
                        {
                          title: 'The Story of David & Goliath',
                          slug: 'david-goliath-video',
                          categoryId: finalCatId,
                          category: 'Bible Videos',
                          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                          verticalBannerUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop',
                          isLocked: 0,
                          isPublished: 1,
                          orderIndex: 1
                        },
                        {
                          title: "Noah's Ark & The Great Flood",
                          slug: 'noah-ark-video',
                          categoryId: finalCatId,
                          category: 'Bible Videos',
                          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
                          verticalBannerUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop',
                          isLocked: 0,
                          isPublished: 1,
                          orderIndex: 2
                        },
                        {
                          title: 'The Birth of Jesus',
                          slug: 'birth-jesus-video',
                          categoryId: finalCatId,
                          category: 'Bible Videos',
                          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
                          verticalBannerUrl: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=800&auto=format&fit=crop',
                          isLocked: 0,
                          isPublished: 1,
                          orderIndex: 3
                        },
                        {
                          title: 'The Creation of the World',
                          slug: 'creation-world-video',
                          categoryId: finalCatId,
                          category: 'Bible Videos',
                          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
                          verticalBannerUrl: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800&auto=format&fit=crop',
                          isLocked: 1,
                          isPublished: 1,
                          orderIndex: 4
                        },
                        {
                          title: "Daniel and the Lions' Den",
                          slug: 'daniel-lions-den-video',
                          categoryId: finalCatId,
                          category: 'Bible Videos',
                          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
                          verticalBannerUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&auto=format&fit=crop',
                          isLocked: 1,
                          isPublished: 1,
                          orderIndex: 5
                        }
                      ];

                      let inserted = 0;
                      for (const v of sampleVideos) {
                        db.run(
                          "INSERT OR IGNORE INTO videos (title, slug, categoryId, category, videoUrl, verticalBannerUrl, subtitleUrl, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                          [v.title, v.slug, v.categoryId, v.category, v.videoUrl, v.verticalBannerUrl, v.subtitleUrl || '', v.isLocked, v.isPublished, v.orderIndex, new Date().toISOString()],
                          () => {
                            inserted++;
                            if (inserted === sampleVideos.length) {
                              console.log('--- SEEDED 5 SAMPLE VIDEOS ---');
                              resVideos();
                            }
                          }
                        );
                      }
                    };

                    if (!err && catRow) {
                      insertVideos(catRow.id);
                    } else {
                      db.run(
                        "INSERT INTO categories (title, subtitle, count, image, type, orderIndex, isPublished, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
                        ['Bible Videos', '5 videos', 5, 'https://cdn.kidsbiblestories.com/categories/cat-videos.jpg', 'video', 7, new Date().toISOString()],
                        function(err) {
                          if (!err) {
                            insertVideos(this.lastID);
                          } else {
                            insertVideos(null);
                          }
                        }
                      );
                    }
                  });
                } else {
                  resVideos();
                }
              });
            });
          };

          if (row.count === 0) {
            console.log('--- SEEDING SQLITE DATABASE ---');
            
            // Seed Users
            const adminHash = await bcrypt.hash('admin123', 10);
            const user2Hash = await bcrypt.hash('veli123', 10);
            const user3Hash = await bcrypt.hash('ayse123', 10);
            const user4Hash = await bcrypt.hash('ahmet123', 10);

            db.run("INSERT INTO users (firstName, lastName, email, phoneNumber, password, createdAt, isVerified, avatarId, subscriptionStatus, role) VALUES (?, ?, ?, ?, ?, ?, 1, 'avatar_05', 'active', 'admin')",
              ['Admin', 'User', 'admin@cms.com', '5550000000', adminHash, new Date().toISOString()]);

            db.run("INSERT INTO users (firstName, lastName, email, phoneNumber, password, createdAt, isVerified, avatarId, subscriptionStatus) VALUES (?, ?, ?, ?, ?, ?, 1, 'avatar_01', 'active')",
              ['Veli', 'Kaya', 'veli@example.com', '5552345678', user2Hash, new Date().toISOString()]);

            db.run("INSERT INTO users (firstName, lastName, email, phoneNumber, password, createdAt, isVerified, avatarId, subscriptionStatus) VALUES (?, ?, ?, ?, ?, ?, 1, 'avatar_02', 'none')",
              ['Ayşe', 'Demir', 'ayse@example.com', '5553456789', user3Hash, new Date().toISOString()]);

            db.run("INSERT INTO users (firstName, lastName, email, phoneNumber, password, createdAt, isVerified, avatarId, subscriptionStatus) VALUES (?, ?, ?, ?, ?, ?, 1, 'avatar_03', 'none')",
              ['Ahmet', 'Yılmaz', 'ahmet.yilmaz@example.com', '5554567890', user4Hash, new Date().toISOString()]);

            // Seed Payments
            db.run("INSERT INTO payments (userId, userEmail, productId, amount, currency, status, transactionId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [2, 'veli@example.com', 'premium_access_yearly', 49.99, 'USD', 'completed', 'GPA.3312-9842-1209-12345', new Date().toISOString()]);

            db.run("INSERT INTO payments (userId, userEmail, productId, amount, currency, status, transactionId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [2, 'veli@example.com', 'ad_free_monthly', 2.99, 'USD', 'completed', 'GPA.3381-1294-0982-84729', new Date().toISOString()]);

            db.run("INSERT INTO payments (userId, userEmail, productId, amount, currency, status, transactionId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [3, 'ayse@example.com', 'premium_access_yearly', 49.99, 'USD', 'completed', 'GPA.9942-1284-8263-12847', new Date().toISOString()]);

            // Seed Notifications
            db.run("INSERT INTO notifications (title, message, type, sentTo, createdAt, read, status) VALUES (?, ?, ?, ?, ?, 0, 'pending')",
              ['Welcome to CMS Dashboard', 'Thank you for downloading and registering in the app.', 'success', 'all', new Date().toISOString()]);

            db.run("INSERT INTO notifications (title, message, type, sentTo, createdAt, read, status) VALUES (?, ?, ?, ?, ?, 0, 'pending')",
              ['Premium Catalog Unlocked', 'Your yearly subscription has successfully activated.', 'info', 'veli@example.com', new Date().toISOString()]);

            // Seed Catalogs
            db.run("INSERT INTO catalogs (name, description, thumbnailVertical, thumbnailHorizontal, createdAt) VALUES (?, ?, ?, ?, ?)",
              ['Visual Catalog v1', 'Visual publication catalog containing illustrations and text guides.', '/uploads/sample_vertical.jpg', '/uploads/sample_horizontal.jpg', new Date().toISOString()]);

            db.run("INSERT INTO catalogs (name, description, thumbnailVertical, thumbnailHorizontal, createdAt) VALUES (?, ?, ?, ?, ?)",
              ['Sample Visual Publication', 'A pre-loaded sample publication showcasing local vertical and horizontal covers.', '/uploads/sample_vertical.jpg', '/uploads/sample_horizontal.jpg', new Date().toISOString()]);
            
            // Seed Categories
            db.run("INSERT INTO categories (title, subtitle, count, image, type, orderIndex, isPublished, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
              ['Old Testament', '39 books', 39, 'https://cdn.kidsbiblestories.com/categories/cat-old-testament.jpg', 'story', 1, new Date().toISOString()]);
            db.run("INSERT INTO categories (title, subtitle, count, image, type, orderIndex, isPublished, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
              ['New Testament', '27 books', 27, 'https://cdn.kidsbiblestories.com/categories/cat-new-testament.jpg', 'story', 2, new Date().toISOString()]);
            db.run("INSERT INTO categories (title, subtitle, count, image, type, orderIndex, isPublished, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
              ['Old Audio Testament', '32 stories', 32, 'https://cdn.kidsbiblestories.com/categories/cat-old-audio.jpg', 'audio', 3, new Date().toISOString()]);
            db.run("INSERT INTO categories (title, subtitle, count, image, type, orderIndex, isPublished, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
              ['Bedtime Stories', '53 stories', 53, 'https://cdn.kidsbiblestories.com/categories/cat-bedtime.jpg', 'story', 4, new Date().toISOString()]);
            db.run("INSERT INTO categories (title, subtitle, count, image, type, orderIndex, isPublished, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
              ['Bedtime Bible Stories', '10 stories', 10, 'https://cdn.kidsbiblestories.com/categories/cat-bedtime-bible.jpg', 'story', 5, new Date().toISOString()]);
            db.run("INSERT INTO categories (title, subtitle, count, image, type, orderIndex, isPublished, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
              ['Songs of Praise', '15 songs', 15, 'https://cdn.kidsbiblestories.com/categories/cat-songs-praise.jpg', 'audio', 6, new Date().toISOString()]);

            // Seed Stories
            db.run("INSERT INTO stories (title, slug, type, categoryId, duration, durationSeconds, image, contentText, audioUrl, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['Isaiah', 'isaiah', 'Old Testament', 1, '12 min', 720, 'https://cdn.kidsbiblestories.com/stories/covers/ot-isaiah.jpg', 'This is the story of Isaiah...', 'https://cdn.kidsbiblestories.com/audio/stories/ot-isaiah.mp3', 0, 1, 1, new Date().toISOString()]);
            db.run("INSERT INTO stories (title, slug, type, categoryId, duration, durationSeconds, image, contentText, audioUrl, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['Genesis Creation', 'genesis-creation', 'Old Testament', 1, '15 min', 900, 'https://cdn.kidsbiblestories.com/stories/covers/ot-genesis.jpg', 'In the beginning...', 'https://cdn.kidsbiblestories.com/audio/stories/ot-genesis.mp3', 0, 1, 2, new Date().toISOString()]);
            db.run("INSERT INTO stories (title, slug, type, categoryId, duration, durationSeconds, image, contentText, audioUrl, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['Noah Ark', 'noah-ark', 'Old Testament', 1, '10 min', 600, 'https://cdn.kidsbiblestories.com/stories/covers/ot-noah.jpg', 'Build an ark...', 'https://cdn.kidsbiblestories.com/audio/stories/ot-noah.mp3', 1, 1, 3, new Date().toISOString()]);
            db.run("INSERT INTO stories (title, slug, type, categoryId, duration, durationSeconds, image, contentText, audioUrl, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['David and Goliath', 'david-goliath-story', 'Old Testament', 1, '9 min', 540, 'https://cdn.kidsbiblestories.com/stories/covers/ot-david.jpg', 'The young shepherd David defeats the giant Goliath with faith and a sling.', 'https://cdn.kidsbiblestories.com/audio/stories/ot-david.mp3', 0, 1, 4, new Date().toISOString()]);
            db.run("INSERT INTO stories (title, slug, type, categoryId, duration, durationSeconds, image, contentText, audioUrl, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['The Good Samaritan', 'good-samaritan', 'New Testament', 2, '7 min', 420, 'https://cdn.kidsbiblestories.com/stories/covers/nt-samaritan.jpg', 'Jesus teaches about loving our neighbors through the parable of the helpful Samaritan.', 'https://cdn.kidsbiblestories.com/audio/stories/nt-samaritan.mp3', 0, 1, 5, new Date().toISOString()]);
            db.run("INSERT INTO stories (title, slug, type, categoryId, duration, durationSeconds, image, contentText, audioUrl, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['Daniel in the Lions\' Den', 'daniel-lions-den', 'Old Testament', 1, '11 min', 660, 'https://cdn.kidsbiblestories.com/stories/covers/ot-daniel.jpg', 'Daniel shows unwavering faithfulness and is miraculously saved from hungry lions.', 'https://cdn.kidsbiblestories.com/audio/stories/ot-daniel.mp3', 1, 1, 6, new Date().toISOString()]);

            // Seed Audio Items
            db.run("INSERT INTO audio_items (title, slug, category, categoryId, duration, durationSeconds, image, audioUrl, badgeColor, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['2 Chronicles', '2-chronicles', 'Old Audio Testament', 3, '10 min', 600, 'https://cdn.kidsbiblestories.com/audio/covers/ot-2chronicles.jpg', 'https://cdn.kidsbiblestories.com/audio/files/ot-2chronicles.mp3', 'purple', 0, 1, 1, new Date().toISOString()]);
            db.run("INSERT INTO audio_items (title, slug, category, categoryId, duration, durationSeconds, image, audioUrl, badgeColor, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['David and Goliath', 'david-goliath-audio', 'Old Audio Testament', 3, '8 min', 480, 'https://cdn.kidsbiblestories.com/audio/covers/ot-david.jpg', 'https://cdn.kidsbiblestories.com/audio/files/ot-david.mp3', 'orange', 1, 1, 2, new Date().toISOString()]);
            db.run("INSERT INTO audio_items (title, slug, category, categoryId, duration, durationSeconds, image, audioUrl, badgeColor, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['Psalm 23', 'psalm-23', 'Old Audio Testament', 3, '4 min', 240, 'https://cdn.kidsbiblestories.com/audio/covers/psalm23.jpg', 'https://cdn.kidsbiblestories.com/audio/files/psalm23.mp3', 'blue', 0, 1, 3, new Date().toISOString()]);
            db.run("INSERT INTO audio_items (title, slug, category, categoryId, duration, durationSeconds, image, audioUrl, badgeColor, isLocked, isPublished, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['The Nativity Song', 'nativity-song', 'Songs of Praise', 6, '3 min', 180, 'https://cdn.kidsbiblestories.com/audio/covers/nativity-song.jpg', 'https://cdn.kidsbiblestories.com/audio/files/nativity-song.mp3', 'green', 0, 1, 4, new Date().toISOString()]);

            // Seed Music Items
            db.run("INSERT INTO music_items (title, type, image, audioUrl, createdAt) VALUES (?, ?, ?, ?, ?)",
              ['Hebrew Lullaby', 'Hebrew Biblical Music', 'https://cdn.kidsbiblestories.com/music/covers/hebrew-lullaby.jpg', 'https://cdn.kidsbiblestories.com/music/files/hebrew-lullaby.mp3', new Date().toISOString()]);
            db.run("INSERT INTO music_items (title, type, image, audioUrl, createdAt) VALUES (?, ?, ?, ?, ?)",
              ['Joyful Praise', 'Christian Music', 'https://cdn.kidsbiblestories.com/music/covers/joyful-praise.jpg', 'https://cdn.kidsbiblestories.com/music/files/joyful-praise.mp3', new Date().toISOString()]);

            // Seed Products
            db.run("INSERT INTO products (title, category, catColor, image, stories, ages, pages, price, externalUrl, isAvailable, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['Kids Bible Stories Book', 'Old Testament', '#9747ff', 'https://cdn.kidsbiblestories.com/products/ot-book.jpg', '25+', '3-12', '150', '$12.99', 'https://amazon.com/example-bible-book', 1, 1, new Date().toISOString()]);
            db.run("INSERT INTO products (title, category, catColor, image, stories, ages, pages, price, externalUrl, isAvailable, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['New Testament Stories Book', 'New Testament', '#28a745', 'https://cdn.kidsbiblestories.com/products/nt-book.jpg', '20+', '3-12', '120', '$10.99', 'https://amazon.com/example-nt-book', 1, 2, new Date().toISOString()]);
            db.run("INSERT INTO products (title, category, catColor, image, stories, ages, pages, price, externalUrl, isAvailable, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['Interactive Bible Trivia Card Game', 'Games', '#fd7e14', 'https://cdn.kidsbiblestories.com/products/trivia-game.jpg', 'N/A', '6-99', '100 cards', '$14.99', 'https://amazon.com/example-trivia-game', 1, 3, new Date().toISOString()]);
            db.run("INSERT INTO products (title, category, catColor, image, stories, ages, pages, price, externalUrl, isAvailable, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['My First Illustrated Bible', 'Books', '#20c997', 'https://cdn.kidsbiblestories.com/products/illustrated-bible.jpg', '50+', '2-7', '220', '$19.99', 'https://amazon.com/example-illustrated-bible', 1, 4, new Date().toISOString()]);
            db.run("INSERT INTO products (title, category, catColor, image, stories, ages, pages, price, externalUrl, isAvailable, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['David & Goliath Activity & Coloring Book', 'Activity Books', '#e83e8c', 'https://cdn.kidsbiblestories.com/products/coloring-book.jpg', '1', '3-8', '48', '$5.99', 'https://amazon.com/example-coloring-book', 1, 5, new Date().toISOString()]);
            db.run("INSERT INTO products (title, category, catColor, image, stories, ages, pages, price, externalUrl, isAvailable, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              ['Noah\'s Ark 3D Wooden Puzzle', 'Toys', '#ffc107', 'https://cdn.kidsbiblestories.com/products/wooden-puzzle.jpg', '1', '5-10', '35 pcs', '$24.99', 'https://amazon.com/example-wooden-puzzle', 1, 6, new Date().toISOString()],
              async (err) => {
                if (err) return reject(err);
                await ensureSpecificUser();
                await ensureVideos();
                console.log('--- SQLITE DATABASE SEED COMPLETE ---');
                resolve();
              }
            );
          } else {
            await ensureSpecificUser();
            await ensureVideos();
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = {
  db,
  run,
  all,
  get,
  initDb
};
