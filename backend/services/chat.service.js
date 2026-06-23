const { getDb, transaction } = require('../db/connection');
const { AppError } = require('../utils/errors');

async function getUserChats(userId) {
  const db = getDb();

  const chats = await db.all(`
    SELECT c.*,
      (SELECT COUNT(*) FROM participants WHERE chat_id = c.id) as member_count,
      (SELECT MAX(created_at) FROM messages WHERE chat_id = c.id) as last_message_at,
      (SELECT COUNT(*) FROM messages WHERE chat_id = c.id AND sender_id != ? AND id > COALESCE((SELECT last_read_message_id FROM participants WHERE chat_id = c.id AND user_id = ?), 0)) as unread_count
    FROM chats c
    JOIN participants p ON c.id = p.chat_id
    WHERE p.user_id = ?
    ORDER BY last_message_at DESC, c.created_at DESC
  `, userId, userId, userId);

  for (const chat of chats) {
    if (chat.member_count === 2 && !chat.name) {
      const other = await db.get(`
        SELECT u.nickname FROM users u
        JOIN participants p ON u.id = p.user_id
        WHERE p.chat_id = ? AND u.id != ?
      `, chat.id, userId);
      chat.display_name = other?.nickname || chat.name;
      chat.is_dm = true;
    } else {
      chat.display_name = chat.name || 'Group';
      chat.is_dm = false;
    }
  }

  return chats;
}

async function createDmChat(creatorId, participantPhone) {
  const db = getDb();

  const target = await db.get('SELECT id, nickname FROM users WHERE phone = ?', participantPhone);
  if (!target) {
    throw new AppError('User not found', 'USER_NOT_FOUND');
  }
  if (target.id === creatorId) {
    throw new AppError('Cannot chat with yourself', 'SELF_CHAT');
  }

  const existing = await db.get(`
    SELECT c.id FROM chats c
    JOIN participants p1 ON c.id = p1.chat_id AND p1.user_id = ?
    JOIN participants p2 ON c.id = p2.chat_id AND p2.user_id = ?
    WHERE (SELECT COUNT(*) FROM participants WHERE chat_id = c.id) = 2
  `, creatorId, target.id);

  if (existing) {
    return { chatId: existing.id, isExisting: true };
  }

  return transaction(async (db) => {
    const result = await db.run('INSERT INTO chats (name, created_by) VALUES (?, ?)', null, creatorId);
    const chatId = result.lastID;

    await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, creatorId);
    await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, target.id);

    return { chatId, targetId: target.id, targetNickname: target.nickname, isExisting: false };
  });
}

async function createGroupChat(creatorId, name, participantPhones) {
  const db = getDb();

  if (!name || !participantPhones?.length) {
    throw new AppError('Group name and participants required', 'INVALID_INPUT');
  }

  return transaction(async (db) => {
    const result = await db.run('INSERT INTO chats (name, created_by) VALUES (?, ?)', name, creatorId);
    const chatId = result.lastID;

    await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, creatorId);

    const invites = [];
    for (const phone of participantPhones) {
      const user = await db.get('SELECT id, nickname FROM users WHERE phone = ?', phone);
      if (!user || user.id === creatorId) continue;

      const isMember = await db.get(
        'SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?',
        chatId, user.id
      );
      if (isMember) continue;

      const existingInvite = await db.get(
        'SELECT id FROM group_invites WHERE chat_id = ? AND to_user_id = ? AND status = "pending"',
        chatId, user.id
      );
      if (existingInvite) continue;

      const inviteResult = await db.run(
        'INSERT INTO group_invites (chat_id, from_user_id, to_user_id) VALUES (?, ?, ?)',
        chatId, creatorId, user.id
      );

      invites.push({ userId: user.id, nickname: user.nickname, inviteId: inviteResult.lastID });
    }

    return { chatId, name, invites };
  });
}

async function markChatRead(chatId, userId) {
  const db = getDb();

  const lastMsg = await db.get(
    'SELECT MAX(id) as max_id FROM messages WHERE chat_id = ?',
    chatId
  );
  if (lastMsg?.max_id) {
    await db.run(
      'UPDATE participants SET last_read_message_id = ? WHERE chat_id = ? AND user_id = ?',
      lastMsg.max_id, chatId, userId
    );
  }
}

module.exports = { getUserChats, createDmChat, createGroupChat, markChatRead };
