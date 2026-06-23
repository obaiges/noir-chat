const chatService = require('../services/chat.service');

function registerChatHandlers(socket, io) {
  socket.on('getChats', async () => {
    try {
      const chats = await chatService.getUserChats(socket.userId);
      socket.emit('chats', chats);
    } catch (e) {
      console.error('getChats error:', e);
      socket.emit('error', 'Failed to load chats');
    }
  });

  socket.on('createChat', async ({ name, participantPhone }) => {
    try {
      const result = await chatService.createDmChat(socket.userId, participantPhone);

      if (result.isExisting) {
        socket.emit('chatCreated', { id: result.chatId });
        return;
      }

      io.to(`user:${result.targetId}`).emit('chatCreated', {
        id: result.chatId, is_dm: true, display_name: socket.nickname,
      });
      socket.emit('chatCreated', {
        id: result.chatId, is_dm: true, display_name: result.targetNickname,
      });
    } catch (e) {
      socket.emit('error', e.message);
    }
  });

  socket.on('createGroup', async ({ name, participantPhones }) => {
    try {
      const result = await chatService.createGroupChat(socket.userId, name, participantPhones);

      for (const invite of result.invites) {
        io.to(`user:${invite.userId}`).emit('newInvite', {
          id: invite.inviteId,
          chat_id: result.chatId,
          chat_name: name,
          from_nickname: socket.nickname,
        });
      }

      socket.emit('chatCreated', {
        id: result.chatId,
        name: result.name,
        display_name: result.name,
        is_dm: false,
        member_count: 1,
        last_message_at: null,
        unread_count: 0,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      socket.emit('error', e.message);
    }
  });

  socket.on('joinChat', ({ chatId }) => {
    socket.join(`chat:${chatId}`);
  });

  socket.on('leaveChat', ({ chatId }) => {
    socket.leave(`chat:${chatId}`);
  });

  socket.on('markRead', async ({ chatId }) => {
    try {
      await chatService.markChatRead(chatId, socket.userId);
    } catch (e) {
      console.error('markRead error:', e);
    }
  });
}

module.exports = registerChatHandlers;
