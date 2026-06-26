const db = require('../database');
const { syncCollectionToS3 } = require('../lib/userS3Store');

class Notification {
  async getAll() {
    try {
      const rows = await db.all("SELECT * FROM notifications ORDER BY id ASC");
      return rows;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async create({ title, message, type, sentTo }) {
    try {
      const notifTitle = 'KidsBibleApp';
      const notifMessage = message || '';
      const notifType = type || 'info';
      const notifSentTo = sentTo || 'all';
      const createdAt = new Date().toISOString();

      const result = await db.run(
        "INSERT INTO notifications (title, message, type, sentTo, createdAt) VALUES (?, ?, ?, ?, ?)",
        [notifTitle, notifMessage, notifType, notifSentTo, createdAt]
      );

      const createdNotification = {
        id: result.lastID,
        title: notifTitle,
        message: notifMessage,
        type: notifType,
        sentTo: notifSentTo,
        createdAt
      };
      await syncCollectionToS3('notifications', await this.getAll());
      return createdNotification;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async delete(id) {
    try {
      const result = await db.run("DELETE FROM notifications WHERE id = ?", [parseInt(id)]);
      if (result.changes > 0) {
        await syncCollectionToS3('notifications', await this.getAll());
      }
      return result.changes > 0;
    } catch (err) {
      console.error(err);
      return false;
    }
  }
}

module.exports = new Notification();
