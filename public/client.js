// ============================================================
//  Конфигурация
// ============================================================
// STUN-сервер помогает установить соединение напрямую между браузерами.
// Для пользователей за "сложным" NAT/корпоративным firewall может
// понадобиться ещё и TURN-сервер (см. README.md, раздел про TURN).
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ============================================================
//  Состояние
// ============================================================
const socket = io();

let myUsername = null;
let localStream = null;      // микрофон
let screenStream = null;     // демонстрация экрана
let isMuted = false;
let isSharingScreen = false;

const peers = new Map(); // socketId -> { pc: RTCPeerConnection, username }

// ============================================================
//  DOM элементы
// ============================================================
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');

const messagesEl = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const onlineUserList = document.getElementById('online-user-list');
const onlineCount = document.getElementById('online-count');
const voiceUserList = document.getElementById('voice-user-list');

const voiceJoinBtn = document.getElementById('voice-join-btn');
const voiceLeaveBtn = document.getElementById('voice-leave-btn');
const muteBtn = document.getElementById('mute-btn');
const screenShareBtn = document.getElementById('screen-share-btn');

const screensGrid = document.getElementById('screens-grid');
const audioContainer = document.getElementById('audio-container');

// ============================================================
//  Вход в чат
// ============================================================
function doJoin() {
  const name = usernameInput.value.trim();
  if (!name) {
    usernameInput.focus();
    return;
  }
  myUsername = name;
  socket.emit('join', name);
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  chatInput.focus();
}

joinBtn.addEventListener('click', doJoin);
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doJoin();
});

// ============================================================
//  Текстовый чат
// ============================================================
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat message', text);
  chatInput.value = '';
});

function renderMessage(msg) {
  const div = document.createElement('div');
  div.className = 'message';
  const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  div.innerHTML =
    `<span class="author">${escapeHtml(msg.username)}</span>` +
    `<span class="time">${time}</span><br>` +
    `<span class="text">${escapeHtml(msg.text)}</span>`;
  messagesEl.appendChild(div);
  scrollMessagesToBottom();
}

function renderSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollMessagesToBottom();
}

function scrollMessagesToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

socket.on('history', (msgs) => {
  messagesEl.innerHTML = '';
  msgs.forEach(renderMessage);
});

socket.on('chat message', renderMessage);
socket.on('system-message', renderSystemMessage);

// ============================================================
//  Список онлайн-пользователей
// ============================================================
socket.on('user-list', (users) => {
  onlineCount.textContent = users.length;
  onlineUserList.innerHTML = '';
  users.forEach((u) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot"></span>${escapeHtml(u.username)}`;
    onlineUserList.appendChild(li);
  });
});

// ============================================================
//  Голосовой чат — управление
// ============================================================
voiceJoinBtn.addEventListener('click', joinVoice);
voiceLeaveBtn.addEventListener('click', leaveVoice);
muteBtn.addEventListener('click', toggleMute);
screenShareBtn.addEventListener('click', toggleScreenShare);

async function joinVoice() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    alert('Не удалось получить доступ к микрофону: ' + err.message);
    return;
  }

  voiceJoinBtn.classList.add('hidden');
  voiceLeaveBtn.classList.remove('hidden');
  muteBtn.classList.remove('hidden');
  screenShareBtn.classList.remove('hidden');

  socket.emit('voice-join');
}

function leaveVoice() {
  socket.emit('voice-leave');
  cleanupVoice();
}

function cleanupVoice() {
  peers.forEach(({ pc }) => pc.close());
  peers.clear();
  audioContainer.innerHTML = '';
  screensGrid.innerHTML = '';

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

  isMuted = false;
  isSharingScreen = false;
  muteBtn.textContent = '🔇 Заглушить';
  muteBtn.classList.remove('active');
  screenShareBtn.textContent = '🖥️ Демонстрация экрана';
  screenShareBtn.classList.remove('active');

  voiceJoinBtn.classList.remove('hidden');
  voiceLeaveBtn.classList.add('hidden');
  muteBtn.classList.add('hidden');
  screenShareBtn.classList.add('hidden');

  renderVoiceUserList();
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
  muteBtn.textContent = isMuted ? '🔊 Включить звук' : '🔇 Заглушить';
  muteBtn.classList.toggle('active', isMuted);
  socket.emit('voice-mute-status', isMuted);
}

// ============================================================
//  Демонстрация экрана
// ============================================================
async function toggleScreenShare() {
  if (isSharingScreen) {
    stopScreenShare();
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    // пользователь отменил выбор окна/экрана
    return;
  }

  isSharingScreen = true;
  screenShareBtn.textContent = '⏹️ Остановить демонстрацию';
  screenShareBtn.classList.add('active');

  const screenTrack = screenStream.getVideoTracks()[0];

  // добавляем видеотрек во все текущие соединения
  peers.forEach(({ pc }) => {
    pc.addTrack(screenTrack, screenStream);
  });

  // показываем свой экран себе тоже
  addScreenTile('local', 'Вы (демонстрация экрана)', screenStream);

  screenTrack.addEventListener('ended', stopScreenShare);

  socket.emit('screen-share-status', true);

  // т.к. добавили новый трек в уже установленные соединения — нужно
  // пере-согласовать (renegotiate) их
  peers.forEach(({ pc }, peerId) => renegotiate(peerId, pc));
}

function stopScreenShare() {
  if (!isSharingScreen) return;
  isSharingScreen = false;
  screenShareBtn.textContent = '🖥️ Демонстрация экрана';
  screenShareBtn.classList.remove('active');

  if (screenStream) {
    const track = screenStream.getVideoTracks()[0];
    peers.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track === track);
      if (sender) pc.removeTrack(sender);
    });
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

  removeScreenTile('local');
  socket.emit('screen-share-status', false);

  peers.forEach(({ pc }, peerId) => renegotiate(peerId, pc));
}

function addScreenTile(id, label, stream) {
  removeScreenTile(id);
  const tile = document.createElement('div');
  tile.className = 'screen-tile';
  tile.id = `screen-tile-${id}`;
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  if (id === 'local') video.muted = true;
  video.srcObject = stream;
  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;
  tile.appendChild(video);
  tile.appendChild(labelEl);
  screensGrid.appendChild(tile);
}

function removeScreenTile(id) {
  const el = document.getElementById(`screen-tile-${id}`);
  if (el) el.remove();
}

// ============================================================
//  WebRTC: mesh-сигналинг через socket.io
// ============================================================

function createPeerConnection(peerId, username) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }
  if (screenStream) {
    pc.addTrack(screenStream.getVideoTracks()[0], screenStream);
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('voice-signal', { to: peerId, signal: { type: 'ice', candidate: event.candidate } });
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0];
    if (event.track.kind === 'audio') {
      let audioEl = document.getElementById(`audio-${peerId}`);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-${peerId}`;
        audioEl.autoplay = true;
        audioContainer.appendChild(audioEl);
      }
      audioEl.srcObject = stream;
    } else if (event.track.kind === 'video') {
      addScreenTile(peerId, `${username} — демонстрация экрана`, stream);
      event.track.addEventListener('ended', () => removeScreenTile(peerId));
    }
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
      // соединение может само восстановиться, но если совсем упало — чистим
      if (pc.connectionState === 'failed') {
        removeScreenTile(peerId);
      }
    }
  };

  peers.set(peerId, { pc, username });
  renderVoiceUserList();
  return pc;
}

async function renegotiate(peerId, pc) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('voice-signal', { to: peerId, signal: { type: 'offer', sdp: pc.localDescription } });
  } catch (err) {
    console.error('Ошибка renegotiate:', err);
  }
}

// Список тех, кто уже в голосовом канале, когда мы в него заходим —
// мы инициируем соединение с каждым из них
socket.on('voice-existing-users', async (users) => {
  for (const u of users) {
    const pc = createPeerConnection(u.id, u.username);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice-signal', { to: u.id, signal: { type: 'offer', sdp: pc.localDescription } });
    } catch (err) {
      console.error('Ошибка создания offer:', err);
    }
  }
});

// Кто-то новый зашёл в голосовой канал после нас — просто регистрируем,
// он сам пришлёт нам offer
socket.on('voice-user-joined', ({ id, username }) => {
  if (!peers.has(id)) {
    peers.set(id, { pc: null, username });
  }
  renderVoiceUserList();
});

socket.on('voice-user-left', ({ id }) => {
  const p = peers.get(id);
  if (p && p.pc) p.pc.close();
  peers.delete(id);
  const audioEl = document.getElementById(`audio-${id}`);
  if (audioEl) audioEl.remove();
  removeScreenTile(id);
  renderVoiceUserList();
});

socket.on('voice-signal', async ({ from, signal }) => {
  let entry = peers.get(from);

  if (signal.type === 'offer') {
    let pc;
    if (entry && entry.pc) {
      pc = entry.pc;
    } else {
      pc = createPeerConnection(from, entry ? entry.username : 'Участник');
    }
    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('voice-signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });
  } else if (signal.type === 'answer') {
    if (entry && entry.pc) {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    }
  } else if (signal.type === 'ice') {
    if (entry && entry.pc) {
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (err) {
        console.error('Ошибка добавления ICE-кандидата:', err);
      }
    }
  }
});

socket.on('voice-users', (users) => {
  // начальный список для отображения (мы ещё не подключены к голосу)
  users.forEach((u) => {
    if (!peers.has(u.id)) peers.set(u.id, { pc: null, username: u.username, sharingScreen: u.sharingScreen });
  });
  renderVoiceUserList();
});

socket.on('screen-share-status', ({ id, sharing }) => {
  if (!sharing) removeScreenTile(id);
});

socket.on('voice-mute-status', ({ id, muted }) => {
  const li = document.getElementById(`voice-li-${id}`);
  if (li) {
    const icon = li.querySelector('.muted-icon');
    if (icon) icon.textContent = muted ? '🔇' : '';
  }
});

function renderVoiceUserList() {
  voiceUserList.innerHTML = '';
  peers.forEach(({ username }, id) => {
    const li = document.createElement('li');
    li.id = `voice-li-${id}`;
    li.innerHTML = `<span class="dot"></span>${escapeHtml(username)}<span class="muted-icon"></span>`;
    voiceUserList.appendChild(li);
  });
}

// ============================================================
//  На всякий случай — чистим голосовые соединения при закрытии вкладки
// ============================================================
window.addEventListener('beforeunload', () => {
  if (localStream || screenStream) {
    socket.emit('voice-leave');
  }
});
