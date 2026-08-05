const socket = io();

// Элементы интерфейса
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn') || document.querySelector('#login-screen button');
const onlineUserList = document.getElementById('online-user-list');
const onlineTitle = document.querySelector('h2'); // Заголовок «Онлайн»

// Обработка входа
if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!username) {
            alert('Пожалуйста, введите имя!');
            return;
        }

        // Переключаем экраны
        if (loginScreen) loginScreen.classList.add('hidden');
        if (appScreen) appScreen.classList.remove('hidden');

        // Отправляем имя на сервер
        socket.emit('join', { name: username });
    });
}

// Получение списка пользователей от сервера
socket.on('users', (data) => {
    const users = Array.isArray(data) ? data : (data.users || []);
    
    // Обновляем счетчик в заголовке Онлайн (например, Онлайн (2))
    const onlineHeading = document.querySelectorAll('.sidebar-section h2')[1] || onlineTitle;
    if (onlineHeading) {
        onlineHeading.textContent = `Онлайн (${users.length})`;
    }

    // Обновляем список никнеймов в сайдбаре
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
