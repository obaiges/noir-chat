const inviteService = require('../services/invite.service');
const chatService = require('../services/chat.service');

function registerSocialHandlers(socket, io) {
  socket.on('sendInvite', async ({ phone, chatId }) => {
    try {
      const result = await inviteService.sendInvite(socket.userId, phone, chatId);

      io.to(`user:${result.targetId}`).emit('newInvite', {
        id: result.inviteId,
        chat_id: chatId,
        chat_name: result.chatName,
        from_nickname: socket.nickname,
      });

      socket.emit('inviteSent');
    } catch (e) {
      socket.emit('error', e.message);
    }
  });

  socket.on('getPendingInvites', async () => {
    try {
      const invites = await inviteService.getPendingInvites(socket.userId);
      socket.emit('pendingInvites', invites);
    } catch (e) {
      console.error('getPendingInvites error:', e);
      socket.emit('error', 'Failed to load invites');
    }
  });

  socket.on('respondInvite', async ({ inviteId, accept }) => {
    try {
      const result = await inviteService.respondInvite(inviteId, socket.userId, accept);

      if (accept) {
        socket.emit('inviteAccepted', {
          id: result.chat.id,
          name: result.chat.name,
          display_name: result.chat.name,
          is_dm: false,
          member_count: result.memberCount,
          last_message_at: null,
          unread_count: 0,
          created_at: result.chat.created_at,
        });
        socket.join(`chat:${result.chat.id}`);

        for (const userId of result.existingParticipantIds) {
          io.to(`user:${userId}`).emit('participantJoined', {
            chatId: result.chat.id,
            memberCount: result.memberCount,
          });
        }
      } else {
        socket.emit('inviteDenied');
      }
    } catch (e) {
      socket.emit('error', e.message);
    }
  });

  socket.on('sendFriendRequest', async ({ phone }) => {
    try {
      const result = await inviteService.sendFriendRequest(socket.userId, phone);

      io.to(`user:${result.targetId}`).emit('newFriendRequest', {
        from_nickname: socket.nickname,
      });

      socket.emit('friendRequestSent');
    } catch (e) {
      socket.emit('error', e.message);
    }
  });

  socket.on('getPendingFriendRequests', async () => {
    try {
      const requests = await inviteService.getPendingFriendRequests(socket.userId);
      socket.emit('pendingFriendRequests', requests);
    } catch (e) {
      console.error('getPendingFriendRequests error:', e);
      socket.emit('error', 'Failed to load friend requests');
    }
  });

  socket.on('respondFriendRequest', async ({ requestId, accept }) => {
    try {
      const result = await inviteService.respondFriendRequest(requestId, socket.userId, accept);

      if (!result.declined) {
        io.to(`user:${result.fromUserId}`).emit('friendRequestAccepted', {
          chatId: result.chatId, display_name: result.isNew ? result.toNickname : socket.nickname,
        });
        socket.emit('friendRequestAccepted', {
          chatId: result.chatId, display_name: result.fromNickname,
        });
      } else {
        socket.emit('friendRequestDenied');
      }
    } catch (e) {
      socket.emit('error', e.message);
    }
  });
}

module.exports = registerSocialHandlers;
