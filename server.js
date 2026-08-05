const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Ошибка чтения данных:', err);
    }
    return { messages: [], users: [] };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Ошибка сохранения данных:', err);
    }
}

let dbData = loadData();

wss.on('connection', (ws) => {
    console.log('Новый пользователь подключился');
    ws.send(JSON.stringify({ type: 'init', data: dbData }));

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message);
            if (parsed.type === 'message') {
                dbData.messages.push(parsed.payload);
                saveData(dbData);

                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(parsed));
                    }
                });
            }
        } catch (e) {
            console.error('Ошибка обработки сообщения:', e);
        }
    });

    ws.on('close', () => {
        console.log('Пользователь отключился');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
