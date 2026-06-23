const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db/connection');
const { AppError } = require('../utils/errors');

async function register(phone, nickname, password) {
  const db = getDb();

  const existing = await db.get('SELECT id FROM users WHERE phone = ?', phone);
  if (existing) {
    throw new AppError('Phone number already registered', 'PHONE_EXISTS', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await db.run(
    'INSERT INTO users (phone, nickname, password_hash) VALUES (?, ?, ?)',
    phone, nickname, passwordHash
  );

  const token = jwt.sign(
    { userId: result.lastID, phone, nickname },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  return { token };
}

async function login(phone, password) {
  const db = getDb();

  const user = await db.get('SELECT * FROM users WHERE phone = ?', phone);
  if (!user) {
    throw new AppError('Invalid phone or password', 'INVALID_CREDENTIALS', 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError('Invalid phone or password', 'INVALID_CREDENTIALS', 401);
  }

  const token = jwt.sign(
    { userId: user.id, phone: user.phone, nickname: user.nickname },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  return { token };
}

async function searchByPhone(phone) {
  const db = getDb();
  return db.get('SELECT id, phone, nickname FROM users WHERE phone = ?', phone);
}

module.exports = { register, login, searchByPhone };
