const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');

const config = require('./config');
const { initDb } = require('./db/connection');
const socketAuth = require('./middleware/socketAuth');
const setupSocket = require('./socket');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: { origin: config.CORS_ORIGIN, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

app.use('/api', authRoutes);
app.use('/api', userRoutes);

io.use(socketAuth);

setupSocket(io);

async function start() {
  await initDb();
  server.listen(config.PORT, () => {
    console.log(`Server listening on port ${config.PORT}`);
  });
}

start();
