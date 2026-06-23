const { getDb, transaction } = require('../db/connection');
const { AppError } = require('../utils/errors');

// --- Group Invites ---

async function getPendingInvites(userId) {
  const db = getDb();
  return db.all(`
    SELECT gi.*, u.nickname as from_nickname, c.name as chat_name
    FROM group_invites gi
    JOIN users u ON gi.from_user_id = u.id
    JOIN chats c ON gi.chat_id = c.id
    WHERE gi.to_user_id = ? AND gi.status = 'pending'
  `, userId);
}

async function sendInvite(senderId, phone, chatId) {
  const db = getDb();

  const target = await db.get('SELECT id, nickname FROM users WHERE phone = ?', phone);
  if (!target) {
    throw new AppError('User not found', 'USER_NOT_FOUND');
  }
  if (target.id === senderId) {
    throw new AppError('Cannot invite yourself', 'SELF_INVITE');
  }

  const isMember = await db.get(
    'SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?',
    chatId, target.id
  );
  if (isMember) {
    throw new AppError('User is already in the chat', 'ALREADY_MEMBER');
  }

  const existing = await db.get(
    'SELECT id FROM group_invites WHERE chat_id = ? AND to_user_id = ? AND status = "pending"',
    chatId, target.id
  );
  if (existing) {
    throw new AppError('Invite already sent', 'DUPLICATE_INVITE');
  }

  const result = await db.run(
    'INSERT INTO group_invites (chat_id, from_user_id, to_user_id) VALUES (?, ?, ?)',
    chatId, senderId, target.id
  );

  const chat = await db.get('SELECT name FROM chats WHERE id = ?', chatId);

  return { inviteId: result.lastID, targetId: target.id, targetNickname: target.nickname, chatName: chat?.name };
}

async function respondInvite(inviteId, userId, accept) {
  const db = getDb();

  const invite = await db.get('SELECT * FROM group_invites WHERE id = ?', inviteId);
  if (!invite || invite.to_user_id !== userId) {
    throw new AppError('Invite not found', 'INVITE_NOT_FOUND');
  }

  if (accept) {
    return transaction(async (db) => {
      await db.run(
        'INSERT OR IGNORE INTO participants (chat_id, user_id) VALUES (?, ?)',
        invite.chat_id, userId
      );
      await db.run('UPDATE group_invites SET status = "accepted" WHERE id = ?', inviteId);

      const chat = await db.get('SELECT id, name, created_at FROM chats WHERE id = ?', invite.chat_id);
      const memberCount = await db.get(
        'SELECT COUNT(*) as count FROM participants WHERE chat_id = ?',
        invite.chat_id
      );

      const existingParticipantIds = (await db.all(
        'SELECT user_id FROM participants WHERE chat_id = ? AND user_id != ?',
        invite.chat_id, userId
      )).map(r => r.user_id);

      return {
        chat: { id: chat.id, name: chat.name, created_at: chat.created_at },
        memberCount: memberCount.count,
        existingParticipantIds,
      };
    });
  } else {
    await db.run('UPDATE group_invites SET status = "denied" WHERE id = ?', inviteId);
    return { declined: true };
  }
}

// --- Friend Requests ---

async function sendFriendRequest(senderId, phone) {
  const db = getDb();

  const target = await db.get('SELECT id, nickname FROM users WHERE phone = ?', phone);
  if (!target) {
    throw new AppError('User not found', 'USER_NOT_FOUND');
  }
  if (target.id === senderId) {
    throw new AppError('Cannot add yourself', 'SELF_REQUEST');
  }

  const existing = await db.get(
    'SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = "pending"',
    senderId, target.id
  );
  if (existing) {
    throw new AppError('Request already sent', 'DUPLICATE_REQUEST');
  }

  const alreadyAccepted = await db.get(
    'SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = "accepted"',
    senderId, target.id
  );
  if (alreadyAccepted) {
    throw new AppError('Already connected', 'ALREADY_CONNECTED');
  }

  await db.run(
    'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)',
    senderId, target.id
  );

  return { targetId: target.id, targetNickname: target.nickname };
}

async function getPendingFriendRequests(userId) {
  const db = getDb();
  return db.all(`
    SELECT fr.*, u.nickname as from_nickname
    FROM friend_requests fr
    JOIN users u ON fr.from_user_id = u.id
    WHERE fr.to_user_id = ? AND fr.status = 'pending'
  `, userId);
}

async function respondFriendRequest(requestId, userId, accept) {
  const db = getDb();

  const request = await db.get('SELECT * FROM friend_requests WHERE id = ?', requestId);
  if (!request || request.to_user_id !== userId) {
    throw new AppError('Request not found', 'REQUEST_NOT_FOUND');
  }

  if (accept) {
    return transaction(async (db) => {
      await db.run('UPDATE friend_requests SET status = "accepted" WHERE id = ?', requestId);

      const existingChat = await db.get(`
        SELECT c.id FROM chats c
        JOIN participants p1 ON c.id = p1.chat_id AND p1.user_id = ?
        JOIN participants p2 ON c.id = p2.chat_id AND p2.user_id = ?
        WHERE (SELECT COUNT(*) FROM participants WHERE chat_id = c.id) = 2
      `, request.from_user_id, userId);

      if (existingChat) {
        return { chatId: existingChat.id, isNew: false, fromUserId: request.from_user_id, fromNickname: request.from_nickname };
      }

      const result = await db.run('INSERT INTO chats (name, created_by) VALUES (?, ?)', null, request.from_user_id);
      const chatId = result.lastID;
      await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, request.from_user_id);
      await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, userId);

      const toUser = await db.get('SELECT nickname FROM users WHERE id = ?', userId);

      return { chatId, isNew: true, fromUserId: request.from_user_id, fromNickname: request.from_nickname, toNickname: toUser?.nickname };
    });
  } else {
    await db.run('UPDATE friend_requests SET status = "denied" WHERE id = ?', requestId);
    return { declined: true, fromNickname: request.from_nickname };
  }
}

module.exports = {
  getPendingInvites, sendInvite, respondInvite,
  sendFriendRequest, getPendingFriendRequests, respondFriendRequest,
};
