const registerChatHandlers = require('./chat.handlers');
const registerMessageHandlers = require('./message.handlers');
const registerSocialHandlers = require('./social.handlers');

function setupSocket(io) {
  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.nickname} (${socket.userId})`);
    socket.join(`user:${socket.userId}`);

    registerChatHandlers(socket, io);
    registerMessageHandlers(socket, io);
    registerSocialHandlers(socket, io);

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.nickname}`);
    });
  });
}

module.exports = setupSocket;
