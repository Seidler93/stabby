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
  obstacles: [],
  projectiles: [],
  powerups: []
};
let isDead = false;
let mouseX = 0;
let mouseY = 0;
let homingCooldown = 0;
let homingCooldownInterval = null;
let aoeEffects = []; // Store AOE visual effects

console.log('CLIENT: Script loaded, socket created');

socket.on('connect', () => {
  console.log('CLIENT: Connected to server, socket ID:', socket.id);
});

socket.on('disconnect', () => {
  console.log('CLIENT: Disconnected from server');
});

// Track mouse position
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

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
  
  switch(type) {
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
  
  // Initialize powerups array if it doesn't exist
  if (!gameState.powerups) {
    gameState.powerups = [];
  }
  
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
      updateActionBar();
    }
    render();
  }
});

socket.on('abilityUsed', (data) => {
  const player = gameState.players[data.playerId];
  if (!player) return;
  
  const playerColor = getPlayerColor(player.color);
  
  switch(data.ability) {
    case 'heal':
      playSound('respawn');
      addMessage(`${playerColor} healed for ${data.healAmount} HP! ✨`);
      break;
    case 'dash':
      playSound('attack');
      addMessage(`${playerColor} dashed away! 💨`);
      break;
    case 'homing':
      playSound('victory');
      addMessage(`${playerColor} launched a Homing Missile! 🚀`);
      if (data.playerId === myPlayerId) {
        startHomingCooldown();
      }
      break;
    case 'groundsmash':
      playSound('enemyHit');
      
      // Add AOE visual effect
      aoeEffects.push({
        x: data.position.x,
        y: data.position.y,
        radius: 0,
        maxRadius: GRID_SIZE * 1.8,
        alpha: 1,
        duration: 500,
        startTime: Date.now()
      });
      
      if (data.hit) {
        playSound('enemyHit');
        gameState.enemy.hp = data.enemyHp;
        updateEnemyInfo();
        addMessage(`${playerColor} ground smashed for ${data.damage} damage! 💥`);
      } else {
        addMessage(`${playerColor} ground smashed but missed!`);
      }
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

socket.on('powerupSpawned', (powerup) => {
  console.log('CLIENT: Powerup spawned event received:', powerup);
  console.log('CLIENT: Current powerups array before push:', gameState.powerups);
  
  gameState.powerups.push(powerup);
  
  console.log('CLIENT: Powerups array after push:', gameState.powerups);
  console.log('CLIENT: About to render...');
  
  render();
});

socket.on('powerupCollected', (data) => {
  // Remove powerup from local state
  const index = gameState.powerups.findIndex(p => p.id === data.powerupId);
  if (index !== -1) {
    gameState.powerups.splice(index, 1);
  }
  
  // Show message
  const player = gameState.players[data.playerId];
  if (player) {
    const playerColor = getPlayerColor(player.color);
    let message = '';
    switch(data.effect) {
      case 'health':
        message = `${playerColor} collected Health! +${data.value} HP ❤️`;
        break;
      case 'mana':
        message = `${playerColor} collected Mana! +${data.value} MP 💎`;
        break;
      case 'invincible':
        message = `${playerColor} is INVINCIBLE! ⭐`;
        break;
    }
    addMessage(message);
    
    if (data.playerId === myPlayerId) {
      playSound('respawn');
    }
  }
  
  render();
});

socket.on('powerupDespawned', (powerupId) => {
  const index = gameState.powerups.findIndex(p => p.id === powerupId);
  if (index !== -1) {
    gameState.powerups.splice(index, 1);
  }
  render();
});

socket.on('playerStatsChanged', (data) => {
  if (gameState.players[data.id]) {
    if (data.hp !== undefined) gameState.players[data.id].hp = data.hp;
    if (data.mana !== undefined) gameState.players[data.id].mana = data.mana;
    if (data.invincible !== undefined) gameState.players[data.id].invincible = data.invincible;
    
    if (data.id === myPlayerId) {
      updatePlayerInfo();
      if (data.invincible === false) {
        addMessage('Invincibility wore off!');
      }
    }
    render();
  }
});

socket.on('projectileCreated', (projectile) => {
  gameState.projectiles.push(projectile);
});

socket.on('projectileUpdated', (data) => {
  const proj = gameState.projectiles.find(p => p.id === data.id);
  if (proj) {
    proj.x = data.x;
    proj.y = data.y;
    if (data.vx !== undefined) proj.vx = data.vx;
    if (data.vy !== undefined) proj.vy = data.vy;
  }
});

socket.on('projectileDestroyed', (data) => {
  const index = gameState.projectiles.findIndex(p => p.id === data.id);
  if (index !== -1) {
    gameState.projectiles.splice(index, 1);
  }
  
  if (data.hitData && data.hitData.type === 'enemy') {
    playSound('enemyHit');
    gameState.enemy.hp = data.hitData.enemyHp;
    updateEnemyInfo();
    
    if (data.hitData.projectileType === 'homing') {
      addMessage(`💥 Homing Missile hit for ${data.hitData.damage} damage!`);
    } else {
      addMessage(`Fireball hit for ${data.hitData.damage} damage! 🔥`);
    }
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
    socket.emit('ability', {
      type: 'fireball',
      targetX: mouseX,
      targetY: mouseY
    });
  } else if (key === 'e' || key === 'E') {
    socket.emit('ability', { type: 'heal' });
  } else if (key === 'r' || key === 'R') {
    socket.emit('ability', { type: 'dash' });
  } else if (key === 'v' || key === 'V') {
    socket.emit('ability', { type: 'groundsmash' });
  } else if (key === 'f' || key === 'F') {
    if (homingCooldown <= 0) {
      socket.emit('ability', { type: 'homing' });
    }
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
    drawPixelSprite(player.x, player.y, player.color, isMe ? 'Y' : 'P', player.invincible);
    drawHealthBar(player.x, player.y, player.hp, player.maxHp);
    drawManaBar(player.x, player.y, player.mana, player.maxMana);
  }
  
  // Draw powerups
  if (gameState.powerups && gameState.powerups.length > 0) {
    console.log('RENDER: Drawing powerups, count:', gameState.powerups.length);
    for (let powerup of gameState.powerups) {
      console.log('RENDER: Drawing powerup at', powerup.x, powerup.y, powerup.icon);
      drawPowerup(powerup);
    }
  } else {
    console.log('RENDER: No powerups to draw');
  }
  
  // Draw projectiles
  if (gameState.projectiles && gameState.projectiles.length > 0) {
    for (let proj of gameState.projectiles) {
      drawProjectile(proj);
    }
  }
  
  // Draw AOE effects
  const now = Date.now();
  if (aoeEffects && aoeEffects.length > 0) {
    for (let i = aoeEffects.length - 1; i >= 0; i--) {
      const effect = aoeEffects[i];
      const elapsed = now - effect.startTime;
      
      if (elapsed >= effect.duration) {
        aoeEffects.splice(i, 1);
        continue;
      }
      
      const progress = elapsed / effect.duration;
      effect.radius = effect.maxRadius * progress;
      effect.alpha = 1 - progress;
      
      drawAOEEffect(effect);
    }
  }
}

function drawPixelSprite(gridX, gridY, color, label, invincible = false) {
  const x = gridX * GRID_SIZE;
  const y = gridY * GRID_SIZE;
  const padding = 4;
  
  // Draw invincibility aura
  if (invincible) {
    ctx.save();
    const time = Date.now() / 100;
    const pulseSize = Math.sin(time) * 3 + 3;
    
    const gradient = ctx.createRadialGradient(
      x + GRID_SIZE / 2, y + GRID_SIZE / 2, GRID_SIZE / 4,
      x + GRID_SIZE / 2, y + GRID_SIZE / 2, GRID_SIZE / 2 + pulseSize
    );
    gradient.addColorStop(0, 'rgba(255, 255, 0, 0.6)');
    gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x + GRID_SIZE / 2, y + GRID_SIZE / 2, GRID_SIZE / 2 + pulseSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  
  // Draw body
  ctx.fillStyle = color;
  ctx.fillRect(x + padding, y + padding, GRID_SIZE - padding * 2, GRID_SIZE - padding * 2);
  
  // Draw border
  ctx.strokeStyle = invincible ? '#ffff00' : '#fff';
  ctx.lineWidth = invincible ? 3 : 2;
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

function drawPowerup(powerup) {
  console.log('drawPowerup called with:', powerup);
  
  const x = powerup.x * GRID_SIZE + GRID_SIZE / 2;
  const y = powerup.y * GRID_SIZE + GRID_SIZE / 2;
  const time = Date.now() / 200;
  const float = Math.sin(time) * 3;
  const rotate = time * 0.5;
  
  console.log('Drawing at canvas coords:', x, y);
  
  ctx.save();
  ctx.translate(x, y + float);
  ctx.rotate(rotate);
  
  // Glow effect
  const gradient = ctx.createRadialGradient(0, 0, 5, 0, 0, 15);
  gradient.addColorStop(0, powerup.color + 'aa');
  gradient.addColorStop(0.5, powerup.color + '44');
  gradient.addColorStop(1, powerup.color + '00');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw icon
  ctx.rotate(-rotate); // Keep text upright
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(powerup.icon, 0, 0);
  ctx.fillText(powerup.icon, 0, 0);
  
  console.log('Powerup drawn successfully');
  
  ctx.restore();
}

function drawProjectile(proj) {
  if (proj.type === 'fireball') {
    // Draw fireball with glow effect
    ctx.save();
    
    // Outer glow
    const gradient = ctx.createRadialGradient(proj.x, proj.y, 2, proj.x, proj.y, 8);
    gradient.addColorStop(0, 'rgba(255, 150, 0, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Core
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Center bright spot
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  } else if (proj.type === 'homing') {
    // Draw homing missile with trail and glow
    ctx.save();
    
    // Calculate angle based on velocity
    const angle = Math.atan2(proj.vy, proj.vx);
    
    // Outer glow
    const gradient = ctx.createRadialGradient(proj.x, proj.y, 2, proj.x, proj.y, 12);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 150, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Missile body
    ctx.translate(proj.x, proj.y);
    ctx.rotate(angle);
    
    // Main body
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(-8, -3, 16, 6);
    
    // Nose cone
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(12, -3);
    ctx.lineTo(12, 3);
    ctx.closePath();
    ctx.fill();
    
    // Fins
    ctx.fillStyle = '#0088ff';
    ctx.fillRect(-8, -5, 4, 2);
    ctx.fillRect(-8, 3, 4, 2);
    
    // Exhaust
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(-10, -2, 2, 4);
    
    ctx.restore();
  }
}

function drawAOEEffect(effect) {
  ctx.save();
  
  const centerX = effect.x * GRID_SIZE + GRID_SIZE / 2;
  const centerY = effect.y * GRID_SIZE + GRID_SIZE / 2;
  
  // Outer ring
  ctx.strokeStyle = `rgba(255, 100, 0, ${effect.alpha * 0.8})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, effect.radius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Inner ring
  ctx.strokeStyle = `rgba(255, 150, 0, ${effect.alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, effect.radius * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  
  // Shockwave fill
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, effect.radius);
  gradient.addColorStop(0, `rgba(255, 200, 0, ${effect.alpha * 0.3})`);
  gradient.addColorStop(0.5, `rgba(255, 100, 0, ${effect.alpha * 0.2})`);
  gradient.addColorStop(1, `rgba(255, 0, 0, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, effect.radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Impact cracks (8 directions)
  ctx.strokeStyle = `rgba(255, 80, 0, ${effect.alpha * 0.6})`;
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 / 8) * i;
    const startDist = GRID_SIZE * 0.3;
    const endDist = effect.radius;
    
    ctx.beginPath();
    ctx.moveTo(
      centerX + Math.cos(angle) * startDist,
      centerY + Math.sin(angle) * startDist
    );
    ctx.lineTo(
      centerX + Math.cos(angle) * endDist,
      centerY + Math.sin(angle) * endDist
    );
    ctx.stroke();
  }
  
  ctx.restore();
}

function updatePlayerInfo() {
  const player = gameState.players[myPlayerId];
  if (player) {
    const invincibleText = player.invincible ? ' ⭐ INVINCIBLE' : '';
    document.getElementById('playerInfo').textContent = 
      `You: ${getPlayerColor(player.color)} | HP: ${player.hp}/${player.maxHp} | Mana: ${player.mana}/${player.maxMana}${invincibleText}`;
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
  
  // Update action bar with mana info
  updateActionBar();
});

function updateActionBar() {
  const player = gameState.players[myPlayerId];
  if (!player) return;
  
  // Update fireball
  const fireballSlot = document.getElementById('ability-fireball');
  if (player.mana < 30) {
    fireballSlot.classList.add('insufficient-mana');
  } else {
    fireballSlot.classList.remove('insufficient-mana');
  }
  
  // Update heal
  const healSlot = document.getElementById('ability-heal');
  if (player.mana < 40) {
    healSlot.classList.add('insufficient-mana');
  } else {
    healSlot.classList.remove('insufficient-mana');
  }
  
  // Update dash
  const dashSlot = document.getElementById('ability-dash');
  if (player.mana < 25) {
    dashSlot.classList.add('insufficient-mana');
  } else {
    dashSlot.classList.remove('insufficient-mana');
  }
  
  // Update homing
  const homingSlot = document.getElementById('ability-homing');
  if (player.mana < 60 || homingCooldown > 0) {
    homingSlot.classList.add('insufficient-mana');
  } else {
    homingSlot.classList.remove('insufficient-mana');
  }
  
  // Update ground smash
  const smashSlot = document.getElementById('ability-groundsmash');
  if (player.mana < 50) {
    smashSlot.classList.add('insufficient-mana');
  } else {
    smashSlot.classList.remove('insufficient-mana');
  }
}

function startHomingCooldown() {
  homingCooldown = 3; // 3 seconds
  const overlay = document.getElementById('homing-cooldown');
  overlay.style.height = '100%';
  overlay.textContent = homingCooldown;
  
  if (homingCooldownInterval) clearInterval(homingCooldownInterval);
  
  homingCooldownInterval = setInterval(() => {
    homingCooldown -= 0.1;
    if (homingCooldown <= 0) {
      homingCooldown = 0;
      overlay.style.height = '0%';
      overlay.textContent = '';
      clearInterval(homingCooldownInterval);
      updateActionBar();
    } else {
      const percent = (homingCooldown / 3) * 100;
      overlay.style.height = percent + '%';
      overlay.textContent = Math.ceil(homingCooldown);
    }
  }, 100);
}

// Game loop
setInterval(render, 1000 / 30); // 30 FPS