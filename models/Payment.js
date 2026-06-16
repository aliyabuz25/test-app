const db = require('../database');

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

      return {
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
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}

module.exports = new Payment();
