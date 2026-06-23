const { getDb } = require('../db/connection');
const { AppError } = require('../utils/errors');

async function getMessages(chatId) {
  const db = getDb();
  return db.all(
    'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
    chatId
  );
}

async function sendMessage(chatId, senderId, senderNickname, content) {
  const db = getDb();

  if (!chatId || !content?.trim()) {
    throw new AppError('Invalid message', 'INVALID_INPUT');
  }

  const isParticipant = await db.get(
    'SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?',
    chatId, senderId
  );
  if (!isParticipant) {
    throw new AppError('Not a participant', 'NOT_PARTICIPANT');
  }

  const result = await db.run(
    'INSERT INTO messages (chat_id, sender_id, sender_nickname, message) VALUES (?, ?, ?, ?)',
    chatId, senderId, senderNickname, content
  );

  return {
    id: result.lastID,
    chat_id: chatId,
    sender_id: senderId,
    sender_nickname: senderNickname,
    message: content,
    created_at: new Date().toISOString(),
  };
}

async function getParticipantIds(chatId) {
  const db = getDb();
  const rows = await db.all(
    'SELECT user_id FROM participants WHERE chat_id = ?',
    chatId
  );
  return rows.map(r => r.user_id);
}

module.exports = { getMessages, sendMessage, getParticipantIds };
