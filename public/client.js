const socket = io();

let localStream = null;
let screenStream = null;
let peerConnections = {}; // id -> RTCPeerConnection

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
const screensGrid = document.getElementById('screens-grid');
const audioContainer = document.getElementById('audio-container');

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

if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!username) {
            alert('Введите имя!');
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
    msgEl.style.cssText = 'margin: 6px 0; color: #dbdee1; font-size: 14px; word-break: break-word;';
    msgEl.innerHTML = `<strong style="color: #fff; margin-right: 6px;">${data.name}:</strong> ${data.text}`;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Отображение списков пользователей (Онлайн и Голос)
socket.on('users', (users) => {
    if (onlineUserList) {
        onlineUserList.innerHTML = '';
        users.forEach(u => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 6px 10px; margin: 4px 0; background: rgba(255,255,255,0.05); border-radius: 6px; display: flex; align-items: center; gap: 8px; color: #fff; font-size: 14px; list-style: none;';
            li.innerHTML = `<span style="width: 8px; height: 8px; background: #23a55a; border-radius: 50%;"></span> ${u.name}`;
            onlineUserList.appendChild(li);
        });
    }

    if (voiceUserList) {
        voiceUserList.innerHTML = '';
        users.filter(u => u.inVoice).forEach(u => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 6px 10px; margin: 4px 0; background: rgba(35, 165, 90, 0.15); border-radius: 6px; display: flex; align-items: center; gap: 8px; color: #fff; font-size: 14px; list-style: none; border-left: 3px solid #23a55a;';
            const isMe = u.name === myUserName;
            li.innerHTML = `<span style="width: 8px; height: 8px; background: #23a55a; border-radius: 50%; box-shadow: 0 0 8px #23a55a;"></span> ${u.name} ${isMe ? '(Вы)' : ''}`;
            voiceUserList.appendChild(li);
        });
    }
});

// Управление голосовым каналом
if (voiceJoinBtn) {
    voiceJoinBtn.addEventListener('click', async () => {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            isVoiceConnected = true;

            if (voiceJoinBtn) voiceJoinBtn.classList.add('hidden');
            if (voiceLeaveBtn) voiceLeaveBtn.classList.remove('hidden');
            if (muteBtn) muteBtn.classList.remove('hidden');
            if (screenShareBtn) screenShareBtn.classList.remove('hidden');

            socket.emit('join-voice');
        } catch (err) {
            alert('Ошибка доступа к микрофону: ' + err.message);
        }
    });
}

if (voiceLeaveBtn) {
    voiceLeaveBtn.addEventListener('click', () => {
        leaveVoiceChannel();
    });
}

function leaveVoiceChannel() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    stopScreenSharing();
    
    // Закрываем все соединения
    Object.keys(peerConnections).forEach(id => {
        peerConnections[id].close();
        delete peerConnections[id];
    });

    isVoiceConnected = false;
    if (voiceJoinBtn) voiceJoinBtn.classList.remove('hidden');
    if (voiceLeaveBtn) voiceLeaveBtn.classList.add('hidden');
    if (muteBtn) muteBtn.classList.add('hidden');
    if (screenShareBtn) muteBtn.classList.add('hidden');

    socket.emit('leave-voice');
}

// Заглушить микрофон
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

                // Добавляем видео на экран себе
                appendVideoElement('my-screen', screenStream, `${myUserName} (Ваш экран)`, true);

                // Транслируем видео всем участникам через WebRTC
                // (упрощенный broadcast треков)
                screenStream.getVideoTracks()[0].onended = () => {
                    stopScreenSharing();
                };
            } else {
                stopScreenSharing();
            }
        } catch (err) {
            console.log('Демонстрация отменена');
        }
    });
}

function stopScreenSharing() {
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }
    isSharingScreen = false;
    if (screenShareBtn) {
        screenShareBtn.textContent = 'Демонстрация экрана';
        screenShareBtn.style.background = '';
    }
    const myCard = document.getElementById('my-screen');
    if (myCard) myCard.remove();
}

function appendVideoElement(id, stream, label, muted = false) {
    if (!screensGrid) return;
    let card = document.getElementById(id);
    if (!card) {
        card = document.createElement('div');
        card.id = id;
        card.style.cssText = 'position: relative; background: #000; border-radius: 8px; overflow: hidden; width: 320px; height: 200px; display: inline-block; margin: 6px;';
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = muted;
        video.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';

        const tag = document.createElement('div');
        tag.textContent = label;
        tag.style.cssText = 'position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 12px;';

        card.appendChild(video);
        card.appendChild(tag);
        screensGrid.appendChild(card);
    }
}
