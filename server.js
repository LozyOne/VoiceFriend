const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Храдим список подключенных пользователей
const users = new Map();

wss.on('connection', (ws) => {
    let userName = '';

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                // Когда пользователь вводит имя и нажимает «Войти»
                case 'join':
                    userName = data.name;
                    users.set(ws, userName);
                    
                    // Рассылаем всем обновленный список участников
                    broadcastUserList();
                    break;

                // Пересылка WebRTC-сигналов (для голосовой связи)
                case 'offer':
                case 'answer':
                case 'candidate':
                    forwardSignal(ws, data);
                    break;

                default:
                    console. неизвестный тип сообщения:', data.type);
            }
        } catch (e) {
            console.error('Ошибка при обработке сообщения:', e);
        }
    });

    ws.on('close', () => {
        if (userName) {
            users.delete(ws);
            broadcastUserList();
        }
    });
});

function broadcastUserList() {
    const userList = Array.from(users.values());
    const payload = JSON.stringify({
        type: 'users',
        users: userList
    });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

function forwardSignal(senderWs, data) {
    wss.clients.forEach((client) => {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
