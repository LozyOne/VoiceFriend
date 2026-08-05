const socket = io();

let localStream;
let peerConnections = {};

const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Элементы интерфейса
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn') || document.querySelector('#login-screen button');
const onlineUserList = document.getElementById('online-user-list');
const voiceUserList = document.getElementById('voice-user-list');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const messagesContainer = document.getElementById('messages');

const voiceJoinBtn = document.getElementById('voice-join-btn');
const voiceLeaveBtn = document.getElementById('voice-leave-btn');
const muteBtn = document.getElementById('mute-btn');
const screenShareBtn = document.getElementById('screen-share-btn');
const audioContainer = document.getElementById('audio-container');

let myUserName = localStorage.getItem('voicechat_username') || '';

// Автоматический вход, если имя уже сохранено
if (myUserName) {
    if (loginScreen) loginScreen.classList.add('hidden');
    if (appScreen) appScreen.classList.remove('hidden');
    socket.emit('join', { name: myUserName });
}

// Обработка кнопки входа
if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!username) {
            alert('Пожалуйста, введите имя!');
            return;
        }

        myUserName = username;
        localStorage.setItem('voicechat_username', myUserName);

        if (loginScreen) loginScreen.classList.add('hidden');
        if (appScreen) appScreen.classList.remove('hidden');

        socket.emit('join', { name: myUserName });
    });
}

// Отправка текстовых сообщений без перезагрузки страницы
if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput ? chatInput.value.trim() : '';
        if (!text) return;

        socket.emit('chat-message', { name: myUserName, text: text });
        if (chatInput) chatInput.value = '';
    });
}

// Получение текстовых сообщений
socket.on('chat-message', (data) => {
    if (!messagesContainer) return;
    const msgEl = document.createElement('div');
    msgEl.className = 'message-item';
    msgEl.style.cssText = 'margin: 4px 0; color: #dbdee1; font-size: 14px;';
    msgEl.innerHTML = `<strong style="color: #fff;">${data.name}:</strong> ${data.text}`;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Обновление списков пользователей
socket.on('users', (data) => {
    const users = Array.isArray(data) ? data : (data.users || []);
    
    // Онлайн список
    if (onlineUserList) {
        onlineUserList.innerHTML = '';
        users.forEach(user => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 6px 10px; margin: 4px 0; background: rgba(255,255,255,0.05); border-radius: 6px; display: flex; align-items: center; gap: 8px; color: #fff; font-size: 14px; list-style: none;';
            li.innerHTML = `<span style="width: 8px; height: 8px; background: #23a55a; border-radius: 50%;"></span> ${user}`;
            onlineUserList.appendChild(li);
        });
    }
});

// Логика голосового канала
if (voiceJoinBtn) {
    voiceJoinBtn.addEventListener('click', async () => {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            
            if (voiceJoinBtn) voiceJoinBtn.classList.add('hidden');
            if (voiceLeaveBtn) voiceLeaveBtn.classList.remove('hidden');
            if (muteBtn) muteBtn.classList.remove('hidden');
            if (screenShareBtn) muteBtn.classList.remove('hidden'); // если нужно

            alert('Вы успешно подключились к голосовому каналу!');
        } catch (err) {
            console.error('Ошибка микрофона:', err);
            alert('Не удалось получить доступ к микрофону: ' + err.message);
        }
    });
}

if (voiceLeaveBtn) {
    voiceLeaveBtn.addEventListener('click', () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (voiceJoinBtn) voiceJoinBtn.classList.remove('hidden');
        if (voiceLeaveBtn) voiceLeaveBtn.classList.add('hidden');
        if (muteBtn) muteBtn.classList.add('hidden');
    });
}
