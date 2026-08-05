const socket = io();

let localStream;
const peerConnections = {};

const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Получаем элементы интерфейса
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const userListEl = document.getElementById('user-list') || document.querySelector('.online-list');

// Если пользователь нажимает войти
if (joinBtn) {
    joinBtn.addEventListener('click', () => {
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!username) {
            alert('Пожалуйста, введите имя!');
            return;
        }

        // Скрываем окно входа, если оно есть в разметке
        if (loginScreen) loginScreen.style.display = 'none';
        if (chatScreen) chatScreen.style.display = 'block';

        // Отправляем имя на сервер
        socket.emit('join', { name: username });
    });
}

// Получение списка пользователей от сервера в реальном времени
socket.on('users', (data) => {
    const users = Array.isArray(data) ? data : (data.users || []);
    
    // Находим блок для отображения онлайн-пользователей
    let container = document.getElementById('user-list');
    if (!container) {
        // Если такого ID нет, пробуем найти блок "ОНЛАЙН" по тексту в боковой панели
        const headings = document.querySelectorAll('div, span');
        headings.forEach(el => {
            if (el.textContent && el.textContent.includes('ОНЛАЙН')) {
                container = el.nextElementSibling || el.parentElement;
            }
        });
    }

    if (container) {
        // Очищаем и выводим актуальный список
        container.innerHTML = '';
        users.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.style.cssText = 'padding: 6px 10px; margin: 4px 0; background: rgba(255,255,255,0.05); border-radius: 6px; display: flex; align-items: center; gap: 8px; color: #fff; font-size: 14px;';
            userItem.innerHTML = `<span style="width: 8px; height: 8px; background: #23a55a; border-radius: 50%;"></span> ${user}`;
            container.appendChild(userItem);
        });
    }
});
