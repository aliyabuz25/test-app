const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');

// Delete old database to force clean seed
if (fs.existsSync(dbPath)) {
  console.log('Deleting existing SQLite database to re-seed...');
  fs.unlinkSync(dbPath);
}

// Require database.js which will run initDb
const { initDb } = require('./database');

console.log('Initializing and seeding new SQLite database...');
initDb()
  .then(() => {
    console.log('Database seeded successfully with all sample products and items!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error seeding database:', err);
    process.exit(1);
  });
