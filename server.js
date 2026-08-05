const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');

// ---------- Настройки ----------
const PORT = process.env.PORT || 3000;
const HISTORY_LIMIT = 500; // сколько последних сообщений отдаём при входе
const MAX_STORED_MESSAGES = 20000; // сколько сообщений храним всего в БД (чтобы не росла бесконечно)

// ---------- База данных ----------
const db = new Database(path.join(__dirname, 'chat.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room TEXT NOT NULL,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room, created_at);
`);

const insertMessage = db.prepare(
  'INSERT INTO messages (id, room, username, text, created_at) VALUES (?, ?, ?, ?, ?)'
);
const getHistory = db.prepare(
  'SELECT id, username, text, created_at FROM messages WHERE room = ? ORDER BY created_at DESC LIMIT ?'
);
const countMessages = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE room = ?');
const trimOld = db.prepare(
  'DELETE FROM messages WHERE room = ? AND id IN (SELECT id FROM messages WHERE room = ? ORDER BY created_at ASC LIMIT ?)'
);

function saveMessage(room, username, text) {
  const id = nanoid();
  const created_at = Date.now();
  insertMessage.run(id, room, username, text, created_at);

  const { c } = countMessages.get(room);
  if (c > MAX_STORED_MESSAGES) {
    trimOld.run(room, room, c - MAX_STORED_MESSAGES);
  }
  return { id, username, text, created_at };
}

function loadHistory(room) {
  const rows = getHistory.all(room, HISTORY_LIMIT);
  return rows.reverse(); // от старых к новым
}

// ---------- Express + Socket.io ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e6, // 1MB, с запасом для длинных сообщений
});

app.use(express.static(path.join(__dirname, 'public')));

const ROOM = 'general'; // одна общая комната; можно расширить до нескольких каналов

// Кто сейчас онлайн (в тексте) и кто в голосовом канале
const onlineUsers = new Map(); // socket.id -> { username }
const voiceUsers = new Map(); // socket.id -> { username, sharingScreen: bool }

function publicUserList() {
  return Array.from(onlineUsers.entries()).map(([id, u]) => ({ id, username: u.username }));
}

function publicVoiceList() {
  return Array.from(voiceUsers.entries()).map(([id, u]) => ({
    id,
    username: u.username,
    sharingScreen: u.sharingScreen,
  }));
}

io.on('connection', (socket) => {
  // ---- Вход пользователя ----
  socket.on('join', (rawUsername) => {
    const username = String(rawUsername || 'Гость').trim().slice(0, 32) || 'Гость';
    socket.data.username = username;
    onlineUsers.set(socket.id, { username });
    socket.join(ROOM);

    socket.emit('history', loadHistory(ROOM));
    socket.emit('voice-users', publicVoiceList());

    io.to(ROOM).emit('user-list', publicUserList());
    socket.to(ROOM).emit('system-message', `${username} присоединился(-ась) к чату`);
  });

  // ---- Текстовый чат ----
  socket.on('chat message', (text) => {
    if (!socket.data.username) return;
    const clean = String(text || '').slice(0, 2000).trim();
    if (!clean) return;

    const msg = saveMessage(ROOM, socket.data.username, clean);
    io.to(ROOM).emit('chat message', msg);
  });

  // ---- Голосовой чат: сигналинг WebRTC (mesh-топология) ----
  socket.on('voice-join', () => {
    if (!socket.data.username) return;
    if (voiceUsers.has(socket.id)) return;

    // Отдаём новому участнику список тех, кто уже в голосовом канале —
    // именно новый участник инициирует соединения с существующими
    socket.emit('voice-existing-users', publicVoiceList());

    voiceUsers.set(socket.id, { username: socket.data.username, sharingScreen: false });
    socket.to(ROOM).emit('voice-user-joined', { id: socket.id, username: socket.data.username });
  });

  socket.on('voice-signal', ({ to, signal }) => {
    if (!to || !signal) return;
    io.to(to).emit('voice-signal', { from: socket.id, signal });
  });

  socket.on('voice-leave', () => {
    leaveVoice(socket);
  });

  socket.on('screen-share-status', (sharing) => {
    const u = voiceUsers.get(socket.id);
    if (!u) return;
    u.sharingScreen = !!sharing;
    io.to(ROOM).emit('screen-share-status', { id: socket.id, sharing: u.sharingScreen });
  });

  socket.on('voice-mute-status', (muted) => {
    if (!voiceUsers.has(socket.id)) return;
    socket.to(ROOM).emit('voice-mute-status', { id: socket.id, muted: !!muted });
  });

  // ---- Отключение ----
  socket.on('disconnect', () => {
    leaveVoice(socket);
    const u = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    if (u) {
      io.to(ROOM).emit('user-list', publicUserList());
      io.to(ROOM).emit('system-message', `${u.username} вышел(-ла) из чата`);
    }
  });

  function leaveVoice(sock) {
    if (voiceUsers.has(sock.id)) {
      voiceUsers.delete(sock.id);
      sock.to(ROOM).emit('voice-user-left', { id: sock.id });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
