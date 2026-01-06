const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GRID_SIZE = 32;
const GAME_WIDTH = 20;
const GAME_HEIGHT = 15;

canvas.width = GAME_WIDTH * GRID_SIZE;
canvas.height = GAME_HEIGHT * GRID_SIZE;

let socket = io();
let myPlayerId = null;
let gameState = {
  players: {},
  enemy: null,
  obstacles: []
};
let isDead = false;

// Audio Context for sound effects
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let soundEnabled = true;
let musicEnabled = true;
let bgMusicGain = null;
let bgMusicInterval = null;

// Background Music - 8-bit battle theme
function startBackgroundMusic() {
  if (!musicEnabled || bgMusicInterval) return;

  bgMusicGain = audioCtx.createGain();
  bgMusicGain.gain.value = 0.15; // Lower volume for background
  bgMusicGain.connect(audioCtx.destination);

  // Simple melody pattern (in Hz)
  const melody = [
    { note: 523.25, duration: 0.3 }, // C5
    { note: 587.33, duration: 0.3 }, // D5
    { note: 659.25, duration: 0.3 }, // E5
    { note: 523.25, duration: 0.3 }, // C5
    { note: 587.33, duration: 0.3 }, // D5
    { note: 659.25, duration: 0.6 }, // E5 (longer)
    { note: 783.99, duration: 0.3 }, // G5
    { note: 659.25, duration: 0.3 }, // E5
    { note: 587.33, duration: 0.3 }, // D5
    { note: 523.25, duration: 0.6 }, // C5 (longer)
  ];

  let noteIndex = 0;

  function playNextNote() {
    if (!musicEnabled) return;

    const { note, duration } = melody[noteIndex];
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    osc.type = 'square'; // 8-bit style
    osc.frequency.setValueAtTime(note, now);

    const noteGain = audioCtx.createGain();
    noteGain.gain.setValueAtTime(0.3, now);
    noteGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc.connect(noteGain);
    noteGain.connect(bgMusicGain);

    osc.start(now);
    osc.stop(now + duration);

    noteIndex = (noteIndex + 1) % melody.length;
  }

  // Play notes in sequence
  bgMusicInterval = setInterval(playNextNote, 300);
  playNextNote(); // Start immediately
}

function stopBackgroundMusic() {
  if (bgMusicInterval) {
    clearInterval(bgMusicInterval);
    bgMusicInterval = null;
  }
  if (bgMusicGain) {
    bgMusicGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
  }
}

// Sound effect functions
function playSound(type) {
  if (!soundEnabled) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  switch (type) {
    case 'attack':
      // Sword slash sound
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      break;

    case 'enemyHit':
      // Enemy damage sound
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
      break;

    case 'playerHit':
      // Player taking damage
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
      break;

    case 'death':
      // Death sound - descending tone
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
      break;

    case 'victory':
      // Victory fanfare
      const notes = [262, 330, 392, 523]; // C, E, G, C
      notes.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.type = 'square';
        o.frequency.setValueAtTime(freq, now + i * 0.15);
        g.gain.setValueAtTime(0.2, now + i * 0.15);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.3);
        o.start(now + i * 0.15);
        o.stop(now + i * 0.15 + 0.3);
      });
      return; // Don't execute the default stop

    case 'respawn':
      // Respawn sound - ascending tone
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
      break;
  }
}

// Socket event handlers
socket.on('init', (data) => {
  myPlayerId = data.playerId;
  gameState = data.gameState;
  updatePlayerInfo();
  addMessage('Connected! You are the ' + getPlayerColor(gameState.players[myPlayerId].color) + ' player');

  // Start background music on first interaction
  startBackgroundMusic();

  render();
});

socket.on('playerJoined', (player) => {
  gameState.players[player.id] = player;
  addMessage('A new player joined!');
  render();
});

socket.on('playerLeft', (playerId) => {
  delete gameState.players[playerId];
  addMessage('A player left the game');
  render();
});

socket.on('playerMoved', (data) => {
  if (gameState.players[data.id]) {
    gameState.players[data.id].x = data.x;
    gameState.players[data.id].y = data.y;
    render();
  }
});

socket.on('enemyHit', (data) => {
  gameState.enemy.hp = data.hp;
  updateEnemyInfo();
  const playerColor = gameState.players[data.playerId] ?
    getPlayerColor(gameState.players[data.playerId].color) : 'A';
  addMessage(`${playerColor} player dealt ${data.damage} damage!`);

  if (data.playerId === myPlayerId) {
    playSound('attack');
  }
  playSound('enemyHit');

  render();
});

socket.on('enemyDefeated', () => {
  addMessage('🎉 Enemy defeated! Respawning in 5 seconds...');
  playSound('victory');
  render();
});

socket.on('enemyRespawned', (enemy) => {
  gameState.enemy = enemy;
  addMessage('Enemy has respawned!');
  updateEnemyInfo();
  render();
});

socket.on('enemyMoved', (data) => {
  if (gameState.enemy) {
    gameState.enemy.x = data.x;
    gameState.enemy.y = data.y;
    render();
  }
});

socket.on('playerHit', (data) => {
  if (gameState.players[data.id]) {
    gameState.players[data.id].hp = data.hp;
    if (data.id === myPlayerId) {
      updatePlayerInfo();
      addMessage(`You took ${data.damage} damage!`);
      playSound('playerHit');
    }
    render();
  }
});

socket.on('playerDied', (playerId) => {
  if (gameState.players[playerId]) {
    gameState.players[playerId].isDead = true;
    if (playerId === myPlayerId) {
      isDead = true;
      addMessage('💀 You died! Click Respawn to continue fighting.');
      playSound('death');
      showRespawnButton();
    } else {
      addMessage('A player has fallen!');
    }
    render();
  }
});

socket.on('playerRespawned', (data) => {
  if (gameState.players[data.id]) {
    gameState.players[data.id].x = data.x;
    gameState.players[data.id].y = data.y;
    gameState.players[data.id].hp = data.hp;
    gameState.players[data.id].mana = data.mana;
    gameState.players[data.id].isDead = false;

    if (data.id === myPlayerId) {
      isDead = false;
      hideRespawnButton();
      addMessage('You have respawned!');
      playSound('respawn');
      updatePlayerInfo();
    } else {
      addMessage('A player has respawned!');
    }
    render();
  }
});

socket.on('playerManaChanged', (data) => {
  if (gameState.players[data.id]) {
    gameState.players[data.id].mana = data.mana;
    if (data.id === myPlayerId) {
      updatePlayerInfo();
    }
    render();
  }
});

socket.on('abilityUsed', (data) => {
  const player = gameState.players[data.playerId];
  if (!player) return;

  const playerColor = getPlayerColor(player.color);

  switch (data.ability) {
    case 'fireball':
      playSound('attack');
      if (data.hit) {
        playSound('enemyHit');
        gameState.enemy.hp = data.enemyHp;
        updateEnemyInfo();
        addMessage(`${playerColor} cast Fireball for ${data.damage} damage! 🔥`);
      } else {
        addMessage(`${playerColor}'s Fireball missed!`);
      }
      break;
    case 'heal':
      playSound('respawn');
      addMessage(`${playerColor} healed for ${data.healAmount} HP! ✨`);
      break;
    case 'dash':
      playSound('attack');
      addMessage(`${playerColor} dashed away! 💨`);
      break;
  }
  render();
});

socket.on('playerHealed', (data) => {
  if (gameState.players[data.id]) {
    gameState.players[data.id].hp = data.hp;
    if (data.id === myPlayerId) {
      updatePlayerInfo();
    }
    render();
  }
});

// Keyboard controls
const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  handleInput(e.key);
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

function handleInput(key) {
  if (!myPlayerId || isDead) return;

  const moveKeys = {
    'w': 'up', 'W': 'up', 'ArrowUp': 'up',
    's': 'down', 'S': 'down', 'ArrowDown': 'down',
    'a': 'left', 'A': 'left', 'ArrowLeft': 'left',
    'd': 'right', 'D': 'right', 'ArrowRight': 'right'
  };

  if (moveKeys[key]) {
    socket.emit('move', moveKeys[key]);
  } else if (key === ' ' || key === 'Spacebar') {
    socket.emit('attack');
  } else if (key === 'q' || key === 'Q') {
    socket.emit('ability', 'fireball');
  } else if (key === 'e' || key === 'E') {
    socket.emit('ability', 'heal');
  } else if (key === 'r' || key === 'R') {
    socket.emit('ability', 'dash');
  }
}

// Rendering
function render() {
  // Clear canvas
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply death overlay if player is dead
  if (isDead) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw grid
  ctx.strokeStyle = isDead ? '#222' : '#333';
  ctx.lineWidth = 1;
  for (let x = 0; x <= GAME_WIDTH; x++) {
    ctx.beginPath();
    ctx.moveTo(x * GRID_SIZE, 0);
    ctx.lineTo(x * GRID_SIZE, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= GAME_HEIGHT; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * GRID_SIZE);
    ctx.lineTo(canvas.width, y * GRID_SIZE);
    ctx.stroke();
  }

  // Draw obstacles/walls
  ctx.fillStyle = '#555';
  ctx.strokeStyle = '#777';
  ctx.lineWidth = 2;
  for (let obs of gameState.obstacles) {
    const x = obs.x * GRID_SIZE;
    const y = obs.y * GRID_SIZE;

    // Draw stone texture
    ctx.fillRect(x + 2, y + 2, GRID_SIZE - 4, GRID_SIZE - 4);
    ctx.strokeRect(x + 2, y + 2, GRID_SIZE - 4, GRID_SIZE - 4);

    // Add brick pattern
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + GRID_SIZE / 2);
    ctx.lineTo(x + GRID_SIZE - 2, y + GRID_SIZE / 2);
    ctx.stroke();

    ctx.strokeStyle = '#777';
    ctx.lineWidth = 2;
  }

  // Draw enemy
  if (gameState.enemy && gameState.enemy.hp > 0) {
    drawPixelSprite(
      gameState.enemy.x,
      gameState.enemy.y,
      gameState.enemy.color,
      'E'
    );

    // Draw HP bar
    drawHealthBar(gameState.enemy.x, gameState.enemy.y, gameState.enemy.hp, gameState.enemy.maxHp);
  }

  // Draw players
  for (let id in gameState.players) {
    const player = gameState.players[id];
    if (player.isDead) continue; // Don't draw dead players

    const isMe = id === myPlayerId;
    drawPixelSprite(player.x, player.y, player.color, isMe ? 'Y' : 'P');
    drawHealthBar(player.x, player.y, player.hp, player.maxHp);
    drawManaBar(player.x, player.y, player.mana, player.maxMana);
  }
}

function drawPixelSprite(gridX, gridY, color, label) {
  const x = gridX * GRID_SIZE;
  const y = gridY * GRID_SIZE;
  const padding = 4;

  // Draw body
  ctx.fillStyle = color;
  ctx.fillRect(x + padding, y + padding, GRID_SIZE - padding * 2, GRID_SIZE - padding * 2);

  // Draw border
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + padding, y + padding, GRID_SIZE - padding * 2, GRID_SIZE - padding * 2);

  // Draw label
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + GRID_SIZE / 2, y + GRID_SIZE / 2);
}

function drawHealthBar(gridX, gridY, hp, maxHp) {
  const x = gridX * GRID_SIZE;
  const y = gridY * GRID_SIZE;
  const barWidth = GRID_SIZE - 8;
  const barHeight = 3;
  const barX = x + 4;
  const barY = y + GRID_SIZE - 10;

  // Background
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Health
  const hpPercent = hp / maxHp;
  ctx.fillStyle = hpPercent > 0.5 ? '#0f0' : hpPercent > 0.25 ? '#ff0' : '#f00';
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
}

function drawManaBar(gridX, gridY, mana, maxMana) {
  const x = gridX * GRID_SIZE;
  const y = gridY * GRID_SIZE;
  const barWidth = GRID_SIZE - 8;
  const barHeight = 3;
  const barX = x + 4;
  const barY = y + GRID_SIZE - 6;

  // Background
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Mana
  const manaPercent = mana / maxMana;
  ctx.fillStyle = '#00bfff';
  ctx.fillRect(barX, barY, barWidth * manaPercent, barHeight);
}

function updatePlayerInfo() {
  const player = gameState.players[myPlayerId];
  if (player) {
    document.getElementById('playerInfo').textContent =
      `You: ${getPlayerColor(player.color)} | HP: ${player.hp}/${player.maxHp} | Mana: ${player.mana}/${player.maxMana}`;
  }
}

function updateEnemyInfo() {
  if (gameState.enemy) {
    document.getElementById('enemyInfo').textContent =
      `Enemy HP: ${gameState.enemy.hp}/${gameState.enemy.maxHp}`;
  }
}

function getPlayerColor(colorHex) {
  const colors = {
    '#00ff00': 'Green',
    '#0000ff': 'Blue',
    '#ffff00': 'Yellow',
    '#ff00ff': 'Magenta'
  };
  return colors[colorHex] || 'Unknown';
}

function addMessage(text) {
  const messagesDiv = document.getElementById('messages');
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.textContent = text;
  messagesDiv.appendChild(messageEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Keep only last 5 messages
  while (messagesDiv.children.length > 5) {
    messagesDiv.removeChild(messagesDiv.firstChild);
  }
}

function showRespawnButton() {
  let btn = document.getElementById('respawnBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'respawnBtn';
    btn.className = 'respawn-btn';
    btn.textContent = 'RESPAWN';
    btn.onclick = () => {
      socket.emit('respawn');
    };
    document.querySelector('.container').appendChild(btn);
  }
  btn.style.display = 'block';
}

function hideRespawnButton() {
  const btn = document.getElementById('respawnBtn');
  if (btn) {
    btn.style.display = 'none';
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('soundToggle');
  if (btn) {
    btn.textContent = soundEnabled ? '🔊 SFX ON' : '🔇 SFX OFF';
  }
  addMessage(soundEnabled ? 'Sound effects enabled' : 'Sound effects disabled');
}

function toggleMusic() {
  musicEnabled = !musicEnabled;
  const btn = document.getElementById('musicToggle');

  if (musicEnabled) {
    startBackgroundMusic();
    if (btn) btn.textContent = '🎵 Music ON';
    addMessage('Music enabled');
  } else {
    stopBackgroundMusic();
    if (btn) btn.textContent = '🎵 Music OFF';
    addMessage('Music disabled');
  }
}

// Add sound toggle buttons on load
window.addEventListener('load', () => {
  const soundBtn = document.createElement('button');
  soundBtn.id = 'soundToggle';
  soundBtn.className = 'sound-toggle';
  soundBtn.textContent = '🔊 SFX ON';
  soundBtn.onclick = toggleSound;
  document.querySelector('.container').appendChild(soundBtn);

  const musicBtn = document.createElement('button');
  musicBtn.id = 'musicToggle';
  musicBtn.className = 'music-toggle';
  musicBtn.textContent = '🎵 Music ON';
  musicBtn.onclick = toggleMusic;
  document.querySelector('.container').appendChild(musicBtn);
});

// Game loop
setInterval(render, 1000 / 30); // 30 FPS