const db = require('../database');
const { syncCollectionToS3 } = require('../lib/userS3Store');

class Payment {
  async getAll() {
    try {
      const rows = await db.all("SELECT * FROM payments ORDER BY id ASC");
      return rows;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async create({ userId, userEmail, productId, amount, currency, status, transactionId, uuid, subscriptionEndDate, ip, location }) {
    try {
      const uId = userId !== undefined && userId !== null ? String(userId) : '0';
      const email = userEmail || 'unknown@example.com';
      const prodId = productId || 'unknown_product';
      const amt = parseFloat(amount) || 0.0;
      const curr = currency || 'USD';
      const stat = status || 'pending';
      const txId = transactionId || `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const createdAt = new Date().toISOString();
      const subEndDate = subscriptionEndDate || null;
      const clientIp = ip || null;
      const clientLoc = location || null;
      const deviceUuid = uuid || null;

      const result = await db.run(
        "INSERT INTO payments (userId, userEmail, productId, amount, currency, status, transactionId, createdAt, uuid, subscriptionEndDate, ip, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [uId, email, prodId, amt, curr, stat, txId, createdAt, deviceUuid, subEndDate, clientIp, clientLoc]
      );

      const createdPayment = {
        id: result.lastID,
        userId: uId,
        userEmail: email,
        productId: prodId,
        amount: amt,
        currency: curr,
        status: stat,
        transactionId: txId,
        createdAt,
        uuid: deviceUuid,
        subscriptionEndDate: subEndDate,
        ip: clientIp,
        location: clientLoc
      };
      await syncCollectionToS3('payments', await this.getAll());
      return createdPayment;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async updateStatus(id, status) {
    try {
      const paymentId = parseInt(id);
      if (!paymentId) return null;
      const newStatus = String(status || '').trim();
      if (!newStatus) return null;

      const existing = await db.get("SELECT * FROM payments WHERE id = ?", [paymentId]);
      if (!existing) return null;

      await db.run("UPDATE payments SET status = ? WHERE id = ?", [newStatus, paymentId]);
      await syncCollectionToS3('payments', await this.getAll());
      return { ...existing, status: newStatus };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}

module.exports = new Payment();
