const socket = io();

let localStream;
let peerConnections = {};
const remoteStreams = {};

const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Элементы интерфейса
const loginScreen = document.getElementById('login-screen') || document.createElement('div');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const userListEl = document.getElementById('user-list') || createFallbackList('Онлайн');
const voiceUserListEl = document.getElementById('voice-user-list') || createFallbackList('Голосовой канал');

// Обработка входа по кнопке
if (joinBtn) {
    joinBtn.addEventListener('click', () => {
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!username) {
            alert('Пожалуйста, введите имя!');
            return;
        }

        // Прячем экран входа, если он есть
        if (loginScreen) loginScreen.style.display = 'none';
        
        // Отправляем на сервер событие входа
        socket.emit('join', { name: username });
    });
}

// Получение списка пользователей от сервера
socket.on('users', (data) => {
    // Поддерживаем оба формата (если сервер прислал массив или объект)
    const users = Array.isArray(data) ? data : (data.users || []);
    
    updateUserList(users);
});

// Функция для создания списков, если их не было в HTML
function createFallbackList(title) {
    const div = document.createElement('div');
    div.id = title === 'Онлайн' ? 'user-list' : 'voice-user-list';
    return div;
}

// Красивое обновление списков пользователей на экране
function updateUserList(users) {
    // Обновляем блок Онлайн
    if (userListEl) {
        userListEl.innerHTML = '';
        
        // Находим или создаем заголовок онлайн
        const onlineHeader = document.querySelector('.online-title, h3') || document.createElement('div');
        onlineHeader.textContent = `ОНЛАЙН (${users.length})`;
        
        users.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.style.cssText = 'padding: 6px 10px; margin: 4px 0; background: rgba(255,255,255,0.05); border-radius: 6px; display: flex; align-items: center; gap: 8px; color: #fff; font-size: 14px;';
            userItem.innerHTML = `<span style="width: 8px; height: 8px; background: #23a55a; border-radius: 50%;"></span> ${user}`;
            userListEl.appendChild(userItem);
        });
    }
}
