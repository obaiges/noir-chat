const messageService = require('../services/message.service');

function registerMessageHandlers(socket, io) {
  socket.on('getMessages', async ({ chatId }) => {
    try {
      const messages = await messageService.getMessages(chatId);
      socket.emit('messages', messages);
    } catch (e) {
      console.error('getMessages error:', e);
      socket.emit('error', 'Failed to load messages');
    }
  });

  socket.on('sendMessage', async ({ chatId, content, anonymous }) => {
    try {
      const nickname = anonymous ? 'Anonymous' : socket.nickname;
      const messageData = await messageService.sendMessage(chatId, socket.userId, nickname, content);

      const participantIds = await messageService.getParticipantIds(chatId);
      for (const userId of participantIds) {
        io.to(`user:${userId}`).emit('newMessage', messageData);
      }
    } catch (e) {
      socket.emit('error', e.message);
    }
  });

  socket.on('writing', ({ chatId }) => {
    io.except(socket.id).emit('writing', { chatId, nickname: socket.nickname });
  });

  socket.on('stoppedWriting', ({ chatId }) => {
    io.except(socket.id).emit('stoppedWriting', { chatId });
  });
}

module.exports = registerMessageHandlers;
