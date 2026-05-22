const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const minimapCanvas = document.getElementById('minimapCanvas');
const mctx = minimapCanvas.getContext('2d');

const loginCanvas = document.getElementById('loginAnimCanvas');
const lctx = loginCanvas.getContext('2d');

let localPlayer = { x: 1000, y: 1000, username: '', color: '#00fff2', age: '', gender: '', isMoving: false, bubbleText: '', isWaving: false, waveTime: 0 };
let remotePlayers = {};
let joystick = null; let myId = null;
let selectedPlayerId = null; // Track cross-hair details card lookups
const WORLD_SIZE = 2000;

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

// Splash Screen Character Animation Render
function runLoginAnimation() {
    if (document.getElementById('auth-screen').style.display === 'none') return;
    lctx.clearRect(0, 0, loginCanvas.width, loginCanvas.height);
    
    const time = Date.now() * 0.005;
    const walkX = (loginCanvas.width / 2) + Math.sin(time * 0.4) * 30;
    const groundY = 75;
    
    lctx.save(); lctx.lineWidth = 3; lctx.lineCap = 'round';
    lctx.strokeStyle = document.getElementById('stick-color').value;
    
    let neckX = walkX; let neckY = groundY - 35;
    let hipX = walkX; let hipY = groundY - 15;
    
    const angleA = Math.sin(time * 2) * 0.5;
    const angleB = Math.sin(time * 2 + Math.PI) * 0.5;
    
    lctx.beginPath(); lctx.arc(neckX, neckY - 8, 7, 0, Math.PI * 2); lctx.stroke();
    lctx.beginPath(); lctx.moveTo(neckX, neckY); lctx.lineTo(hipX, hipY); lctx.stroke();
    lctx.beginPath(); lctx.moveTo(neckX, neckY + 4); lctx.lineTo(neckX - Math.sin(angleB)*12 - 4, neckY + 12);
    lctx.moveTo(neckX, neckY + 4); lctx.lineTo(neckX - Math.sin(angleA)*12 + 4, neckY + 12); lctx.stroke();
    lctx.beginPath(); lctx.moveTo(hipX, hipY); lctx.lineTo(hipX + Math.sin(angleA)*14, groundY);
    lctx.moveTo(hipX, hipY); lctx.lineTo(hipX + Math.sin(angleB)*14, groundY); lctx.stroke();
    
    lctx.restore();
    requestAnimationFrame(runLoginAnimation);
}
requestAnimationFrame(runLoginAnimation);

// Submit Username Authentication Profile Action Execution
document.getElementById('btn-primary-action').onclick = () => {
    const user = document.getElementById('username').value.trim();
    const chosenAge = document.getElementById('age').value.trim() || '18';
    const chosenGender = document.getElementById('gender').value;
    const chosenColor = document.getElementById('stick-color').value;
    
    if(!user) return alert('Please supply a valid username handle!');
    
    localPlayer.username = user;
    localPlayer.color = chosenColor;
    localPlayer.age = chosenAge;
    localPlayer.gender = chosenGender;
    
    socket.emit('joinGame', { 
        username: user, 
        color: chosenColor,
        age: chosenAge,
        gender: chosenGender
    });
};

socket.on('connect', () => { myId = socket.id; });
socket.on('joinError', (errMsg) => { alert(errMsg); localPlayer.username = ''; });

socket.on('currentPlayers', (serverPlayers) => {
    document.getElementById('auth-screen').style.display = 'none';
    joystick = new VirtualJoystick('joystick-zone');
    
    Object.keys(serverPlayers).forEach(id => {
        if (id === myId) { 
            localPlayer.x = serverPlayers[id].x; 
            localPlayer.y = serverPlayers[id].y; 
        } else { 
            remotePlayers[id] = serverPlayers[id]; 
        }
    });
    
    // Auto-select yourself to fill the default HUD card context
    showPlayerDetailsCard(localPlayer);
    loop();
});

socket.on('newPlayer', (playerInfo) => { remotePlayers[playerInfo.id] = playerInfo; });
socket.on('playerMoved', (playerInfo) => {
    if (remotePlayers[playerInfo.id]) {
        remotePlayers[playerInfo.id].x = playerInfo.x;
        remotePlayers[playerInfo.id].y = playerInfo.y;
        remotePlayers[playerInfo.id].isMoving = playerInfo.isMoving;
        if(playerInfo.isMoving) remotePlayers[playerInfo.id].isWaving = false;
        
        // Live update the card if this is our currently selected target player
        if (selectedPlayerId === playerInfo.id) {
            showPlayerDetailsCard(remotePlayers[playerInfo.id]);
        }
    }
});

socket.on('playerEmote', (data) => {
    if (data.id === myId) { localPlayer.isWaving = true; localPlayer.waveTime = Date.now(); }
    else if (remotePlayers[data.id]) { remotePlayers[data.id].isWaving = true; remotePlayers[data.id].waveTime = Date.now(); }
});

socket.on('playerDisconnected', (id) => { 
    delete remotePlayers[id]; 
    if (selectedPlayerId === id) {
        // Fall back seamlessly to tracking yourself if your target leaves
        selectedPlayerId = null;
        showPlayerDetailsCard(localPlayer);
    }
});

socket.on('incomingMessage', (data) => {
    const hist = document.getElementById('chat-history');
    const msgEl = document.createElement('div');
    msgEl.innerHTML = `<strong>${data.username}:</strong> ${data.text}`;
    hist.appendChild(msgEl); hist.scrollTop = hist.scrollHeight;
    
    if (data.id === myId) {
        localPlayer.bubbleText = data.text; clearTimeout(localPlayer.timer);
        localPlayer.timer = setTimeout(() => localPlayer.bubbleText = '', 5000);
    } else if (remotePlayers[data.id]) {
        remotePlayers[data.id].bubbleText = data.text; clearTimeout(remotePlayers[data.id].timer);
        remotePlayers[data.id].timer = setTimeout(() => remotePlayers[data.id].bubbleText = '', 5000);
    }
});

// Click Interaction Registration to Intercept Frame Elements
canvas.addEventListener('mousedown', handleSceneSelection);
canvas.addEventListener('touchstart', (e) => {
    if(e.touches.length > 0) handleSceneSelection(e.touches[0]);
});

function handleSceneSelection(e) {
    if (!localPlayer.username) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const camX = canvas.width / 2 - localPlayer.x;
    const camY = canvas.height / 2 - localPlayer.y;
    
    let clickedTarget = null;
    
    // Look through other visible entities to check if your click context falls near them
    Object.values(remotePlayers).forEach(p => {
        const pScreenX = p.x + camX;
        const pScreenY = p.y + camY;
        const dist = Math.sqrt((clickX - pScreenX)**2 + (clickY - pScreenY)**2);
        if (dist < 35) { clickedTarget = p; }
    });
    
    if (clickedTarget) {
        selectedPlayerId = clickedTarget.id;
        showPlayerDetailsCard(clickedTarget);
    } else {
        // Check selection distance to self
        const selfScreenX = canvas.width / 2;
        const selfScreenY = canvas.height / 2;
        if (Math.sqrt((clickX - selfScreenX)**2 + (clickY - selfScreenY)**2) < 35) {
            selectedPlayerId = null;
            showPlayerDetailsCard(localPlayer);
        }
    }
}

function showPlayerDetailsCard(p) {
    const card = document.getElementById('player-details-card');
    const dot = document.getElementById('hud-color-indicator');
    
    document.getElementById('hud-username').innerText = p.username;
    document.getElementById('hud-gender').innerText = p.gender;
    document.getElementById('hud-age').innerText = p.age;
    
    dot.style.color = p.color;
    dot.style.backgroundColor = p.color;
    card.style.display = 'flex';
}

const chatInput = document.getElementById('chat-input');
function sendChat() {
    const text = chatInput.value.trim();
    if(!text) return;
    if (text.toLowerCase() === '/wave') { socket.emit('triggerEmote', 'wave'); }
    else { socket.emit('chatMessage', text); }
    chatInput.value = ''; chatInput.blur();
}
document.getElementById('btn-send').onclick = sendChat;
chatInput.onkeydown = (e) => { if(e.key === 'Enter') sendChat(); };

// Cross-Platform Input Mappings (Keyboard Supports)
const keys = {};
window.onkeydown = (e) => { if (document.activeElement !== chatInput) keys[e.key.toLowerCase()] = true; };
window.onkeyup = (e) => { keys[e.key.toLowerCase()] = false; };

function updatePhysics() {
    let dx = 0; let dy = 0; const speed = 4;
    if (keys['w'] || keys['arrowup']) dy = -1;
    if (keys['s'] || keys['arrowdown']) dy = 1;
    if (keys['a'] || keys['arrowleft']) dx = -1;
    if (keys['d'] || keys['arrowright']) dx = 1;
    
    if (joystick && joystick.active) { dx = joystick.deltaX; dy = joystick.deltaY; }
    
    const moving = (dx !== 0 || dy !== 0);
    if (moving !== localPlayer.isMoving) {
        localPlayer.isMoving = moving; if(moving) localPlayer.isWaving = false;
    }
    
    if (moving) {
        localPlayer.x += dx * speed; localPlayer.y += dy * speed;
        localPlayer.x = Math.max(10, Math.min(WORLD_SIZE - 10, localPlayer.x));
        localPlayer.y = Math.max(10, Math.min(WORLD_SIZE - 10, localPlayer.y));
        socket.emit('playerMovement', { x: localPlayer.x, y: localPlayer.y, isMoving: true });
        
        // Live update card details if tracking yourself while running
        if (!selectedPlayerId) { showPlayerDetailsCard(localPlayer); }
    } else if (socket.connected) {
        socket.emit('playerMovement', { x: localPlayer.x, y: localPlayer.y, isMoving: false });
    }
}

function drawStickFigure(p, isMe) {
    const camX = canvas.width / 2 - localPlayer.x;
    const camY = canvas.height / 2 - localPlayer.y;
    const screenX = p.x + camX; const screenY = p.y + camY;
    
    const isMoving = p.isMoving || false; const time = Date.now() * 0.008;
    if (p.isWaving && Date.now() - p.waveTime > 4000) { p.isWaving = false; }

    ctx.save(); ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.strokeStyle = p.color;

    let hipX = screenX; let hipY = screenY - 15;
    let neckX = screenX; let neckY = screenY - 40;

    if (isMoving) {
        const angleA = Math.sin(time) * 0.5; const angleB = Math.sin(time + Math.PI) * 0.5;
        ctx.beginPath(); ctx.arc(neckX, neckY - 10, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(neckX, neckY); ctx.lineTo(hipX, hipY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(neckX, neckY + 5); ctx.lineTo(neckX - Math.sin(angleB)*15 - 5, neckY + 12);
        ctx.moveTo(neckX, neckY + 5); ctx.lineTo(neckX - Math.sin(angleA)*15 + 5, neckY + 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(hipX + Math.sin(angleA)*16, screenY);
        ctx.moveTo(hipX, hipY); ctx.lineTo(hipX + Math.sin(angleB)*16, screenY); ctx.stroke();
    } else if (p.isWaving) {
        const wave = Math.sin(Date.now() * 0.015) * 6;
        ctx.beginPath(); ctx.arc(neckX, neckY - 10, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(neckX, neckY); ctx.lineTo(hipX, hipY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(neckX, neckY + 5); ctx.lineTo(neckX - 12, neckY + 20);
        ctx.moveTo(neckX, neckY + 5); ctx.lineTo(neckX + 14 + wave, neckY - 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(hipX - 10, screenY);
        ctx.moveTo(hipX, hipY); ctx.lineTo(hipX + 10, screenY); ctx.stroke();
    } else {
        ctx.beginPath(); ctx.arc(neckX, neckY - 10, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(neckX, neckY); ctx.lineTo(hipX, hipY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(neckX, neckY + 5); ctx.lineTo(neckX - 12, neckY + 20);
        ctx.moveTo(neckX, neckY + 5); ctx.lineTo(neckX + 12, neckY + 20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(hipX - 10, screenY);
        ctx.moveTo(hipX, hipY); ctx.lineTo(hipX + 10, screenY); ctx.stroke();
    }

    // Semi-transparent indicator backgrounds above characters
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    const nameLabel = `${p.username} (${p.gender[0]}/${p.age})`;
    const textWidth = ctx.measureText(nameLabel).width;
    ctx.fillRect(neckX - (textWidth/2) - 6, neckY - 34, textWidth + 12, 17);
    
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText(nameLabel, neckX, neckY - 21);

    if (p.bubbleText) {
        ctx.font = '13px sans-serif'; const txtMetrics = ctx.measureText(p.bubbleText);
        const bubbleW = Math.max(txtMetrics.width + 18, 40); const bubbleH = 28;
        const bx = neckX - bubbleW / 2; const by = neckY - 67;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath(); ctx.roundRect(bx, by, bubbleW, bubbleH, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(p.bubbleText, neckX, by + 18);
    }
    ctx.restore();
}

function drawGrid() {
    const camX = canvas.width / 2 - localPlayer.x; const camY = canvas.height / 2 - localPlayer.y;
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
    for (let x = 0; x <= WORLD_SIZE; x += 100) { ctx.beginPath(); ctx.moveTo(x + camX, camY); ctx.lineTo(x + camX, WORLD_SIZE + camY); ctx.stroke(); }
    for (let y = 0; y <= WORLD_SIZE; y += 100) { ctx.beginPath(); ctx.moveTo(camX, y + camY); ctx.lineTo(WORLD_SIZE + camX, y + camY); ctx.stroke(); }
}

function drawMinimap() {
    mctx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    mctx.fillStyle = '#1e293b'; mctx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    const factor = minimapCanvas.width / WORLD_SIZE;
    Object.values(remotePlayers).forEach(p => {
        if(p.x && p.y) { mctx.fillStyle = p.color; mctx.beginPath(); mctx.arc(p.x * factor, p.y * factor, 3, 0, Math.PI * 2); mctx.fill(); }
    });
    mctx.fillStyle = localPlayer.color; mctx.beginPath(); mctx.arc(localPlayer.x * factor, localPlayer.y * factor, 4.5, 0, Math.PI * 2); mctx.fill();
}

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updatePhysics(); drawGrid();
    const all = Object.values(remotePlayers); all.push(localPlayer);
    all.sort((a, b) => a.y - b.y);
    all.forEach(p => { if(p.username) drawStickFigure(p, p.username === localPlayer.username); });
    drawMinimap();
    requestAnimationFrame(loop);
}
