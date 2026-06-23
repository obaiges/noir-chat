const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const config = require('../config');
const schema = require('./schema');

let db;

async function initDb() {
  db = await open({
    filename: config.DB_PATH,
    driver: sqlite3.Database,
  });

  await db.exec(schema);

  try {
    await db.exec('ALTER TABLE participants ADD COLUMN last_read_message_id INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists
  }

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

async function transaction(callback) {
  const db = getDb();
  await db.exec('BEGIN');
  try {
    const result = await callback(db);
    await db.exec('COMMIT');
    return result;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { initDb, getDb, transaction };
