const firebaseConfig = {
    apiKey: "AIzaSyCx_uuqfC2bTBfuDUvAu2Fa4JE3-ozJQY4",
    authDomain: "woolingchat.firebaseapp.com",
    projectId: "woolingchat",
    storageBucket: "woolingchat.appspot.com",
    messagingSenderId: "877867450311",
    appId: "1:877867450311:web:5d92a9c650d213b9a6e3e2"
};

// Инициализация
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let activeChatUser = null;
let mediaRecorder;
let audioChunks = [];

// === ФУНКЦИЯ ВХОДА ===
async function handleLogin() {
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPass').value;
    const nick = document.getElementById('regNick').value;

    if (!email || !pass) {
        alert("Заполни почту и пароль!");
        return;
    }

    try {
        console.log("Попытка входа...");
        await auth.signInWithEmailAndPassword(email, pass);
        document.getElementById('sphere').classList.add('explode');
    } catch (e) {
        console.log("Вход не удался, пробуем регистрацию...");
        if (nick) {
            try {
                const res = await auth.createUserWithEmailAndPassword(email, pass);
                await db.collection("users").doc(res.user.uid).set({ nickname: nick });
                document.getElementById('sphere').classList.add('explode');
            } catch (regErr) {
                alert("Ошибка регистрации: " + regErr.message);
            }
        } else {
            alert("Аккаунт не найден. Введи никнейм, чтобы зарегистрироваться!");
        }
    }
}

// Привязываем кнопку
document.getElementById('loginBtn').addEventListener('click', handleLogin);

// === ПРОВЕРКА СЕССИИ ===
auth.onAuthStateChanged(async user => {
    const authBox = document.getElementById('authContainer');
    const appBox = document.getElementById('appContainer');

    if (user) {
        const doc = await db.collection("users").doc(user.uid).get();
        document.getElementById('myNickDisplay').textContent = doc.data()?.nickname || "User";
        authBox.style.display = 'none';
        appBox.classList.remove('app-hidden');
        appBox.classList.add('app-container');
    } else {
        authBox.style.display = 'flex';
        appBox.className = 'app-hidden';
    }
});

// Выход
document.getElementById('logoutBtn').onclick = () => auth.signOut().then(() => location.reload());
document.getElementById('settingsBtn').onclick = () => document.getElementById('settingsModal').style.display = 'flex';

// === ИЗБРАННОЕ ===
document.getElementById('favoritesBtn').onclick = () => {
    activeChatUser = auth.currentUser.uid;
    document.getElementById('currentChatNick').textContent = "⭐ Избранное";
    listenMessages();
};

// === ОТПРАВКА ФАЙЛОВ ===
document.getElementById('attachBtn').onclick = () => document.getElementById('fileInp').click();
document.getElementById('fileInp').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeChatUser) return;

    const ref = storage.ref(`chats/${Date.now()}_${file.name}`);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    const type = file.type.startsWith('image') ? 'image' : 'video';
    await sendMsg({ type, url });
};

// === ГОЛОСОВЫЕ ===
document.getElementById('micBtn').onclick = async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        document.getElementById('micBtn').classList.remove('mic-active');
    } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const ref = storage.ref(`voices/${Date.now()}.webm`);
            await ref.put(blob);
            const url = await ref.getDownloadURL();
            await sendMsg({ type: 'voice', url });
        };
        mediaRecorder.start();
        document.getElementById('micBtn').classList.add('mic-active');
    }
};

// === СООБЩЕНИЯ ===
document.getElementById('sendBtn').onclick = () => {
    const text = document.getElementById('msgInp').value;
    if (text && activeChatUser) {
        sendMsg({ type: 'text', text });
        document.getElementById('msgInp').value = "";
    }
};

async function sendMsg(data) {
    await db.collection("messages").add({
        ...data,
        sender: auth.currentUser.uid,
        receiver: activeChatUser,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
}

let sub = null;
function listenMessages() {
    if (sub) sub();
    sub = db.collection("messages").orderBy("timestamp", "asc").onSnapshot(snap => {
        const view = document.getElementById('msgView');
        view.innerHTML = "";
        snap.forEach(doc => {
            const m = doc.data();
            if ((m.sender === auth.currentUser.uid && m.receiver === activeChatUser) || 
                (m.sender === activeChatUser && m.receiver === auth.currentUser.uid)) {
                
                const div = document.createElement('div');
                div.className = `bubble ${m.sender === auth.currentUser.uid ? 'my-msg' : 'other-msg'}`;
                
                if (m.type === 'text') div.textContent = m.text;
                else if (m.type === 'image') div.innerHTML = `<img src="${m.url}" class="chat-img" onclick="window.open('${m.url}')">`;
                else if (m.type === 'video') div.innerHTML = `<video src="${m.url}" controls class="chat-vid"></video>`;
                else if (m.type === 'voice') div.innerHTML = `<audio src="${m.url}" controls></audio>`;
                
                view.appendChild(div);
            }
        });
        view.scrollTop = view.scrollHeight;
    });
}

// Поиск
document.getElementById('searchBtn').onclick = async () => {
    const nick = document.getElementById('userSearchInp').value;
    const snap = await db.collection("users").where("nickname", "==", nick).get();
    const list = document.getElementById('chatList');
    list.innerHTML = "";
    snap.forEach(doc => {
        const div = document.createElement('div');
        div.className = "chat-item animated-hover";
        div.textContent = doc.data().nickname;
        div.onclick = () => { activeChatUser = doc.id; document.getElementById('currentChatNick').textContent = doc.data().nickname; listenMessages(); };
        list.appendChild(div);
    });
};
