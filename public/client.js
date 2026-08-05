const socket = io();

let localStream;
let screenStream;
let peerConnections = {};

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
const screensGrid = document.getElementById('screens-grid');

let myUserName = localStorage.getItem('voicechat_username') || '';
let isVoiceConnected = false;
let isMuted = false;
let isSharingScreen = false;

// Автоматический вход по сохраненному имени
if (myUserName) {
    if (loginScreen) loginScreen.classList.add('hidden');
    if (appScreen) appScreen.classList.remove('hidden');
    socket.emit('join', { name: myUserName });
}

// Кнопка входа
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

// Отправка сообщений в чат
if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput ? chatInput.value.trim() : '';
        if (!text) return;

        socket.emit('chat-message', { name: myUserName, text: text });
        if (chatInput) chatInput.value = '';
    });
}

socket.on('chat-message', (data) => {
    if (!messagesContainer) return;
    const msgEl = document.createElement('div');
    msgEl.className = 'message-item';
    msgEl.style.cssText = 'margin: 4px 0; color: #dbdee1; font-size: 14px;';
    msgEl.innerHTML = `<strong style="color: #fff;">${data.name}:</strong> ${data.text}`;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Обновление списков пользователей (Онлайн + Голосовой канал)
socket.on('users', (data) => {
    const users = Array.isArray(data) ? data : (data.users || []);
    
    // 1. Общий список онлайн
    if (onlineUserList) {
        onlineUserList.innerHTML = '';
        users.forEach(user => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 6px 10px; margin: 4px 0; background: rgba(255,255,255,0.05); border-radius: 6px; display: flex; align-items: center; gap: 8px; color: #fff; font-size: 14px; list-style: none;';
            li.innerHTML = `<span style="width: 8px; height: 8px; background: #23a55a; border-radius: 50%;"></span> ${user}`;
            onlineUserList.appendChild(li);
        });
    }

    // 2. Список голосового канала (показывает тех, кто в голосе, включая вас)
    if (voiceUserList) {
        voiceUserList.innerHTML = '';
        if (isVoiceConnected && myUserName) {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 6px 10px; margin: 4px 0; background: rgba(35, 165, 90, 0.15); border-radius: 6px; display: flex; align-items: center; gap: 8px; color: #fff; font-size: 14px; list-style: none; border-left: 3px solid #23a55a;';
            li.innerHTML = `<span style="width: 8px; height: 8px; background: #23a55a; border-radius: 50%; box-shadow: 0 0 8px #23a55a;"></span> ${myUserName} (Вы)`;
            voiceUserList.appendChild(li);
        }
    }
});

// Подключение к голосовому каналу
if (voiceJoinBtn) {
    voiceJoinBtn.addEventListener('click', async () => {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            isVoiceConnected = true;
            
            if (voiceJoinBtn) voiceJoinBtn.classList.add('hidden');
            if (voiceLeaveBtn) voiceLeaveBtn.classList.remove('hidden');
            if (muteBtn) muteBtn.classList.remove('hidden');
            if (screenShareBtn) screenShareBtn.classList.remove('hidden');

            // Принудительно обновляем отображение себя в голосовом канале
            socket.emit('join', { name: myUserName });
        } catch (err) {
            console.error('Ошибка микрофона:', err);
            alert('Не удалось получить доступ к микрофону: ' + err.message);
        }
    });
}

// Отключение от голосового канала
if (voiceLeaveBtn) {
    voiceLeaveBtn.addEventListener('click', () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
        }
        isVoiceConnected = false;
        isSharingScreen = false;

        if (voiceJoinBtn) voiceJoinBtn.classList.remove('hidden');
        if (voiceLeaveBtn) voiceLeaveBtn.classList.add('hidden');
        if (muteBtn) muteBtn.classList.add('hidden');
        if (screenShareBtn) screenShareBtn.classList.add('hidden');

        if (voiceUserList) voiceUserList.innerHTML = '';
        socket.emit('join', { name: myUserName });
    });
}

// Кнопка Мут / Выключить микрофон
if (muteBtn) {
    muteBtn.addEventListener('click', () => {
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isMuted = !isMuted;
            audioTrack.enabled = !isMuted;
            muteBtn.style.background = isMuted ? '#ed4245' : '';
            muteBtn.textContent = isMuted ? 'Включить звук' : 'Заглушить';
        }
    });
}

// Демонстрация экрана
if (screenShareBtn) {
    screenShareBtn.addEventListener('click', async () => {
        try {
            if (!isSharingScreen) {
                screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                isSharingScreen = true;
                screenShareBtn.textContent = 'Остановить показ';
                screenShareBtn.style.background = '#ed4245';

                // Показываем ваш экран локально в сетке
                if (screensGrid) {
                    let myVideoCard = document.getElementById('my-screen-card');
                    if (!myVideoCard) {
                        myVideoCard = document.createElement('div');
                        myVideoCard.id = 'my-screen-card';
                        myVideoCard.style.cssText = 'position: relative; background: #000; border-radius: 8px; overflow: hidden; width: 320px; height: 200px; display: inline-block; margin: 5px;';
                        
                        const videoEl = document.createElement('video');
                        videoEl.srcObject = screenStream;
                        videoEl.autoplay = true;
                        videoEl.muted = true;
                        videoEl.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
                        
                        const labelEl = document.createElement('div');
                        labelEl.textContent = `${myUserName} (Ваш экран)`;
                        labelEl.style.cssText = 'position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 12px;';

                        myVideoCard.appendChild(videoEl);
                        myVideoCard.appendChild(labelEl);
                        screensGrid.appendChild(myVideoCard);
                    }
                }

                // Если демонстрация экрана завершена через стандартную кнопку браузера «Остановить общий доступ»
                screenStream.getVideoTracks()[0].onended = () => {
                    stopScreenSharing();
                };
            } else {
                stopScreenSharing();
            }
        } catch (err) {
            console.error('Ошибка демонстрации экрана:', err);
        }
    });
}

function stopScreenSharing() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    isSharingScreen = false;
    if (screenShareBtn) {
        screenShareBtn.textContent = 'Демонстрация экрана';
        screenShareBtn.style.background = '';
    }
    const myVideoCard = document.getElementById('my-screen-card');
    if (myVideoCard) myVideoCard.remove();
}
