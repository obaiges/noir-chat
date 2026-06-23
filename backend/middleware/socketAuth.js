const jwt = require('jsonwebtoken');
const config = require('../config');

function socketAuth(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.nickname = decoded.nickname;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
}

module.exports = socketAuth;
