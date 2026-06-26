const bcrypt = require('bcryptjs');
const db = require('../database');
const { syncAdminsToS3, syncUsersToS3 } = require('../lib/userS3Store');

async function syncUserMirrorsToS3() {
  try {
    const users = await db.all("SELECT * FROM users ORDER BY id ASC");
    await Promise.all([
      syncUsersToS3(users),
      syncAdminsToS3(users)
    ]);
  } catch (err) {
    console.error('User S3 sync failed:', err);
  }
}

class User {
  async findByEmail(email) {
    try {
      const row = await db.get("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [email]);
      return row || null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async findById(id) {
    try {
      const row = await db.get("SELECT * FROM users WHERE id = ?", [parseInt(id)]);
      return row || null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async getAll() {
    try {
      const rows = await db.all("SELECT * FROM users ORDER BY id ASC");
      return rows;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async create({ firstName, lastName, email, phoneNumber, password, verificationToken = null, role = 'user', subscriptionStatus = 'none', isVerified = 1 }) {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createdAt = new Date().toISOString();
      const result = await db.run(
        "INSERT INTO users (firstName, lastName, email, phoneNumber, password, createdAt, isVerified, verificationToken, subscriptionStatus, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [firstName, lastName, email.toLowerCase(), phoneNumber, hashedPassword, createdAt, isVerified ? 1 : 0, verificationToken, subscriptionStatus, role]
      );
      const createdUser = {
        id: result.lastID,
        firstName,
        lastName,
        email: email.toLowerCase(),
        phoneNumber,
        createdAt,
        isVerified: isVerified ? 1 : 0,
        verificationToken,
        subscriptionStatus,
        role
      };
      await syncUserMirrorsToS3();
      return createdUser;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async verifyEmail(token) {
    try {
      const row = await db.get("SELECT * FROM users WHERE verificationToken = ?", [token]);
      if (!row) return null;
      await db.run("UPDATE users SET isVerified = 1, verificationToken = NULL WHERE id = ?", [row.id]);
      await syncUserMirrorsToS3();
      return row;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async update(id, { firstName, lastName, email, phoneNumber, password }) {
    try {
      const user = await this.findById(id);
      if (!user) return null;

      const updatedFirstName = firstName || user.firstName;
      const updatedLastName = lastName || user.lastName;
      const updatedEmail = (email || user.email).toLowerCase();
      const updatedPhoneNumber = phoneNumber || user.phoneNumber;
      
      let updatedPassword = user.password;
      if (password) {
        updatedPassword = await bcrypt.hash(password, 10);
      }

      await db.run(
        "UPDATE users SET firstName = ?, lastName = ?, email = ?, phoneNumber = ?, password = ? WHERE id = ?",
        [updatedFirstName, updatedLastName, updatedEmail, updatedPhoneNumber, updatedPassword, parseInt(id)]
      );

      await syncUserMirrorsToS3();
      return {
        id: parseInt(id),
        firstName: updatedFirstName,
        lastName: updatedLastName,
        email: updatedEmail,
        phoneNumber: updatedPhoneNumber
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async delete(id) {
    try {
      const result = await db.run("DELETE FROM users WHERE id = ?", [parseInt(id)]);
      if (result.changes > 0) {
        await syncUserMirrorsToS3();
      }
      return result.changes > 0;
    } catch (err) {
      console.error(err);
      return false;
    }
  }
}

module.exports = new User();
