const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = 3000;
const JWT_SECRET = 'noir-chat-secret-key-change-in-production';

app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

const server = createServer(app)
const io = new Server(server, {
    cors: { origin: "http://localhost:4200", methods: ["GET", "POST"] }
});

let db;

async function initDb() {
    db = await open({
        filename: 'chat-oscar.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE NOT NULL,
            nickname TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS participants (
            chat_id INTEGER REFERENCES chats(id),
            user_id INTEGER REFERENCES users(id),
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (chat_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER REFERENCES chats(id),
            sender_id INTEGER REFERENCES users(id),
            sender_nickname TEXT,
            message TEXT,
            type TEXT DEFAULT 'normal',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER REFERENCES users(id),
            to_user_id INTEGER REFERENCES users(id),
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS group_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER REFERENCES chats(id),
            from_user_id INTEGER REFERENCES users(id),
            to_user_id INTEGER REFERENCES users(id),
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

initDb();

app.post('/api/register', async (req, res) => {
    try {
        const { phone, nickname, password } = req.body;

        if (!phone || !nickname || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const existing = await db.get('SELECT id FROM users WHERE phone = ?', phone);
        if (existing) {
            return res.status(409).json({ error: 'Phone number already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await db.run(
            'INSERT INTO users (phone, nickname, password_hash) VALUES (?, ?, ?)',
            phone, nickname, passwordHash
        );

        const token = jwt.sign(
            { userId: result.lastID, phone, nickname },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const user = await db.get('SELECT * FROM users WHERE phone = ?', phone);
        if (!user) {
            return res.status(401).json({ error: 'Invalid phone or password' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid phone or password' });
        }

        const token = jwt.sign(
            { userId: user.id, phone: user.phone, nickname: user.nickname },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/search-user', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ error: 'Phone is required' });
        }

        const user = await db.get(
            'SELECT id, phone, nickname FROM users WHERE phone = ?',
            phone
        );

        res.json({ user: user || null });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication required'));
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.userId;
        socket.nickname = decoded.nickname;
        next();
    } catch (err) {
        next(new Error('Invalid token'));
    }
});

io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.nickname} (${socket.userId})`);
    socket.join(`user:${socket.userId}`);

    socket.on('getChats', async () => {
        const chats = await db.all(`
            SELECT c.*,
            (SELECT COUNT(*) FROM participants WHERE chat_id = c.id) as member_count
            FROM chats c
            JOIN participants p ON c.id = p.chat_id
            WHERE p.user_id = ?
            ORDER BY c.created_at DESC
        `, socket.userId);

        for (const chat of chats) {
            if (chat.member_count === 2) {
                const other = await db.get(`
                    SELECT u.nickname FROM users u
                    JOIN participants p ON u.id = p.user_id
                    WHERE p.chat_id = ? AND u.id != ?
                `, chat.id, socket.userId);
                chat.display_name = other?.nickname || chat.name;
                chat.is_dm = true;
            } else {
                chat.display_name = chat.name || 'Group';
                chat.is_dm = false;
            }
        }

        socket.emit('chats', chats);
    });

    socket.on('createChat', async ({ name, participantPhone }) => {
        const target = await db.get('SELECT id FROM users WHERE phone = ?', participantPhone);
        if (!target) {
            socket.emit('error', 'User not found');
            return;
        }
        if (target.id === socket.userId) {
            socket.emit('error', 'Cannot chat with yourself');
            return;
        }

        const existing = await db.get(`
            SELECT c.id FROM chats c
            JOIN participants p1 ON c.id = p1.chat_id AND p1.user_id = ?
            JOIN participants p2 ON c.id = p2.chat_id AND p2.user_id = ?
            WHERE (SELECT COUNT(*) FROM participants WHERE chat_id = c.id) = 2
        `, socket.userId, target.id);

        if (existing) {
            socket.emit('chatCreated', { id: existing.id });
            return;
        }

        const result = await db.run('INSERT INTO chats (name, created_by) VALUES (?, ?)', null, socket.userId);
        const chatId = result.lastID;

        await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, socket.userId);
        await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, target.id);

        const targetUser = await db.get('SELECT nickname FROM users WHERE id = ?', target.id);
        const myUser = await db.get('SELECT nickname FROM users WHERE id = ?', socket.userId);

        io.to(`user:${target.id}`).emit('chatCreated', { id: chatId, is_dm: true, display_name: socket.nickname });
        socket.emit('chatCreated', { id: chatId, is_dm: true, display_name: targetUser?.nickname });
    });

    socket.on('createGroup', async ({ name, participantPhones }) => {
        if (!name || !participantPhones?.length) {
            socket.emit('error', 'Group name and participants required');
            return;
        }

        const result = await db.run('INSERT INTO chats (name, created_by) VALUES (?, ?)', name, socket.userId);
        const chatId = result.lastID;

        await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, socket.userId);

        for (const phone of participantPhones) {
            const user = await db.get('SELECT id FROM users WHERE phone = ?', phone);
            if (user && user.id !== socket.userId) {
                await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, user.id);
                io.to(`user:${user.id}`).emit('chatCreated', { id: chatId, is_dm: false, display_name: name });
            }
        }

        socket.emit('chatCreated', { id: chatId, is_dm: false, display_name: name });
    });

    socket.on('joinChat', ({ chatId }) => {
        socket.join(`chat:${chatId}`);
    });

    socket.on('leaveChat', ({ chatId }) => {
        socket.leave(`chat:${chatId}`);
    });

    socket.on('getMessages', async ({ chatId }) => {
        const messages = await db.all(
            'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
            chatId
        );
        socket.emit('messages', messages);
    });

    socket.on('sendMessage', async ({ chatId, content }) => {
        if (!chatId || !content?.trim()) return;

        const isParticipant = await db.get(
            'SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?',
            chatId, socket.userId
        );
        if (!isParticipant) return;

        try {
            await db.run(
                'INSERT INTO messages (chat_id, sender_id, sender_nickname, message) VALUES (?, ?, ?, ?)',
                chatId, socket.userId, socket.nickname, content
            );
        } catch (e) {
            console.log("Error: ", e);
            return;
        }

        io.to(`chat:${chatId}`).emit('newMessage', {
            chat_id: chatId,
            sender_id: socket.userId,
            sender_nickname: socket.nickname,
            message: content,
            created_at: new Date().toISOString()
        });
    });

    socket.on('sendInvite', async ({ phone, chatId }) => {
        const user = await db.get('SELECT id, nickname FROM users WHERE phone = ?', phone);
        if (!user) { socket.emit('error', 'User not found'); return; }
        if (user.id === socket.userId) { socket.emit('error', 'Cannot invite yourself'); return; }

        const isMember = await db.get(
            'SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?',
            chatId, user.id
        );
        if (isMember) { socket.emit('error', 'User is already in the chat'); return; }

        const existing = await db.get(
            'SELECT id FROM group_invites WHERE chat_id = ? AND to_user_id = ? AND status = "pending"',
            chatId, user.id
        );
        if (existing) { socket.emit('error', 'Invite already sent'); return; }

        const result = await db.run(
            'INSERT INTO group_invites (chat_id, from_user_id, to_user_id) VALUES (?, ?, ?)',
            chatId, socket.userId, user.id
        );

        const chat = await db.get('SELECT name FROM chats WHERE id = ?', chatId);

        io.to(`user:${user.id}`).emit('newInvite', {
            id: result.lastID,
            chat_id: chatId,
            chat_name: chat?.name,
            from_nickname: socket.nickname
        });

        socket.emit('inviteSent');
    });

    socket.on('getPendingInvites', async () => {
        const invites = await db.all(`
            SELECT gi.*, u.nickname as from_nickname, c.name as chat_name
            FROM group_invites gi
            JOIN users u ON gi.from_user_id = u.id
            JOIN chats c ON gi.chat_id = c.id
            WHERE gi.to_user_id = ? AND gi.status = 'pending'
        `, socket.userId);
        socket.emit('pendingInvites', invites);
    });

    socket.on('respondInvite', async ({ inviteId, accept }) => {
        const invite = await db.get('SELECT * FROM group_invites WHERE id = ?', inviteId);
        if (!invite || invite.to_user_id !== socket.userId) {
            socket.emit('error', 'Invite not found');
            return;
        }

        if (accept) {
            await db.run(
                'INSERT OR IGNORE INTO participants (chat_id, user_id) VALUES (?, ?)',
                invite.chat_id, socket.userId
            );
            await db.run('UPDATE group_invites SET status = "accepted" WHERE id = ?', inviteId);

            const chat = await db.get('SELECT name FROM chats WHERE id = ?', invite.chat_id);
            socket.emit('inviteAccepted', {
                chatId: invite.chat_id,
                name: chat?.name
            });
        } else {
            await db.run('UPDATE group_invites SET status = "denied" WHERE id = ?', inviteId);
            socket.emit('inviteDenied');
        }
    });

    socket.on('sendFriendRequest', async ({ phone }) => {
        const target = await db.get('SELECT id, nickname FROM users WHERE phone = ?', phone);
        if (!target) { socket.emit('error', 'User not found'); return; }
        if (target.id === socket.userId) { socket.emit('error', 'Cannot add yourself'); return; }

        const existing = await db.get(
            'SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = "pending"',
            socket.userId, target.id
        );
        if (existing) { socket.emit('error', 'Request already sent'); return; }

        const alreadyAccepted = await db.get(
            'SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = "accepted"',
            socket.userId, target.id
        );
        if (alreadyAccepted) { socket.emit('error', 'Already connected'); return; }

        await db.run(
            'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)',
            socket.userId, target.id
        );

        io.to(`user:${target.id}`).emit('newFriendRequest', {
            from_nickname: socket.nickname
        });

        socket.emit('friendRequestSent');
    });

    socket.on('getPendingFriendRequests', async () => {
        const requests = await db.all(`
            SELECT fr.*, u.nickname as from_nickname
            FROM friend_requests fr
            JOIN users u ON fr.from_user_id = u.id
            WHERE fr.to_user_id = ? AND fr.status = 'pending'
        `, socket.userId);
        socket.emit('pendingFriendRequests', requests);
    });

    socket.on('respondFriendRequest', async ({ requestId, accept }) => {
        const request = await db.get('SELECT * FROM friend_requests WHERE id = ?', requestId);
        if (!request || request.to_user_id !== socket.userId) {
            socket.emit('error', 'Request not found');
            return;
        }

        if (accept) {
            await db.run('UPDATE friend_requests SET status = "accepted" WHERE id = ?', requestId);

            const existingChat = await db.get(`
                SELECT c.id FROM chats c
                JOIN participants p1 ON c.id = p1.chat_id AND p1.user_id = ?
                JOIN participants p2 ON c.id = p2.chat_id AND p2.user_id = ?
                WHERE (SELECT COUNT(*) FROM participants WHERE chat_id = c.id) = 2
            `, request.from_user_id, socket.userId);

            if (existingChat) {
                const chat = await db.get('SELECT name FROM chats WHERE id = ?', existingChat.id);
                io.to(`user:${request.from_user_id}`).emit('friendRequestAccepted', { chatId: existingChat.id, display_name: socket.nickname });
                socket.emit('friendRequestAccepted', { chatId: existingChat.id, display_name: request.from_nickname });
                return;
            }

            const result = await db.run('INSERT INTO chats (name, created_by) VALUES (?, ?)', null, request.from_user_id);
            const chatId = result.lastID;
            await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, request.from_user_id);
            await db.run('INSERT INTO participants (chat_id, user_id) VALUES (?, ?)', chatId, socket.userId);

            const toUser = await db.get('SELECT nickname FROM users WHERE id = ?', socket.userId);

            io.to(`user:${request.from_user_id}`).emit('friendRequestAccepted', { chatId, display_name: toUser?.nickname });
            socket.emit('friendRequestAccepted', { chatId, display_name: request.from_nickname });
        } else {
            await db.run('UPDATE friend_requests SET status = "denied" WHERE id = ?', requestId);
            socket.emit('friendRequestDenied');
        }
    });

    socket.on('writing', ({ chatId }) => {
        io.except(socket.id).emit('writing', { chatId, nickname: socket.nickname });
    });

    socket.on('stoppedWriting', ({ chatId }) => {
        io.except(socket.id).emit('stoppedWriting', { chatId });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.nickname}`);
    });
});

server.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
