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
  enemy: null
};
let isDead = false;

// Socket event handlers
socket.on('init', (data) => {
  myPlayerId = data.playerId;
  gameState = data.gameState;
  updatePlayerInfo();
  addMessage('Connected! You are the ' + getPlayerColor(gameState.players[myPlayerId].color) + ' player');
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
  render();
});

socket.on('enemyDefeated', () => {
  addMessage('🎉 Enemy defeated! Respawning in 5 seconds...');
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
    gameState.players[data.id].isDead = false;

    if (data.id === myPlayerId) {
      isDead = false;
      hideRespawnButton();
      addMessage('You have respawned!');
      updatePlayerInfo();
    } else {
      addMessage('A player has respawned!');
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
  const barHeight = 4;
  const barX = x + 4;
  const barY = y + GRID_SIZE - 6;

  // Background
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Health
  const hpPercent = hp / maxHp;
  ctx.fillStyle = hpPercent > 0.5 ? '#0f0' : hpPercent > 0.25 ? '#ff0' : '#f00';
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
}

function updatePlayerInfo() {
  const player = gameState.players[myPlayerId];
  if (player) {
    document.getElementById('playerInfo').textContent =
      `You: ${getPlayerColor(player.color)} | HP: ${player.hp}/${player.maxHp}`;
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

// Game loop
setInterval(render, 1000 / 30); // 30 FPS