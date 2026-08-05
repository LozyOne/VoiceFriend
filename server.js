const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Хранение пользователей: id -> { name, inVoice }
const users = new Map();

io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

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
            // Сообщаем всем остальным, что зашел новый участник в голос
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
        io.emit('chat-message', {
            name: data.name,
            text: data.text
        });
    });

    // WebRTC Сигнализация (нужна для передачи звука и экрана между клиентами)
    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
        users.delete(socket.id);
        broadcastUsers();
        io.emit('user-left-voice', socket.id);
    });
});

function broadcastUsers() {
    const userList = Array.from(users.values());
    io.emit('users', userList);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
