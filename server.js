const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();

wss.on('connection', (ws) => {
    let userName = '';

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'join':
                    userName = data.name;
                    users.set(ws, userName);
                    broadcastUserList();
                    break;

                case 'chat-message':
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'chat-message',
                                name: data.name,
                                text: data.text
                            }));
                        }
                    });
                    break;

                case 'offer':
                case 'answer':
                case 'candidate':
                    forwardSignal(ws, data);
                    break;

                default:
                    break;
            }
        } catch (e) {
            console.error('Ошибка обработки сообщения:', e);
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
