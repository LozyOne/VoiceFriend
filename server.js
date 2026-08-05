const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Подключаем папку public для всех статических файлов
app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();
const messageHistory = [];

io.on('connection', (socket) => {
    socket.emit('init-history', messageHistory);
    broadcastUsers();

    socket.on('join', (data) => {
        const name = typeof data === 'string' ? data : (data.name || 'Аноним');
        users.set(socket.id, { name, inVoice: false });
        broadcastUsers();
    });

    socket.on('join-voice', () => {
        const user = users.get(socket.id);
        if (user) {
            user.inVoice = true;
            broadcastUsers();
            socket.broadcast.emit('user-joined-voice', socket.id);
        }
    });

    socket.on('leave-voice', () => {
        const user = users.get(socket.id);
        if (user) {
            user.inVoice = false;
            broadcastUsers();
            socket.broadcast.emit('user-left-voice', socket.id);
        }
    });

    socket.on('chat-message', (data) => {
        const msg = { name: data.name, text: data.text };
        messageHistory.push(msg);
        if (messageHistory.length > 100) messageHistory.shift();
        io.emit('chat-message', msg);
    });

    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    socket.on('disconnect', () => {
        users.delete(socket.id);
        broadcastUsers();
        io.emit('user-left-voice', socket.id);
    });
});

function broadcastUsers() {
    const userList = Array.from(users.values());
    io.emit('users', userList);
}

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
