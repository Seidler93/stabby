const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const GRID_SIZE = 32;
const GAME_WIDTH = 20;
const GAME_HEIGHT = 15;

const gameState = {
  players: {},
  enemy: {
    x: 10,
    y: 7,
    hp: 100,
    maxHp: 100,
    color: '#ff0000'
  }
};

const playerColors = ['#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
let colorIndex = 0;

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create new player
  const playerColor = playerColors[colorIndex % playerColors.length];
  colorIndex++;

  gameState.players[socket.id] = {
    id: socket.id,
    x: Math.floor(Math.random() * 5) + 2,
    y: Math.floor(Math.random() * 5) + 2,
    hp: 50,
    maxHp: 50,
    color: playerColor,
    lastAttack: 0
  };

  // Send initial game state to new player
  socket.emit('init', {
    playerId: socket.id,
    gameState: gameState
  });

  // Broadcast new player to others
  socket.broadcast.emit('playerJoined', gameState.players[socket.id]);

  // Handle player movement
  socket.on('move', (direction) => {
    const player = gameState.players[socket.id];
    if (!player) return;

    const oldX = player.x;
    const oldY = player.y;

    switch (direction) {
      case 'up':
        if (player.y > 0) player.y--;
        break;
      case 'down':
        if (player.y < GAME_HEIGHT - 1) player.y++;
        break;
      case 'left':
        if (player.x > 0) player.x--;
        break;
      case 'right':
        if (player.x < GAME_WIDTH - 1) player.x++;
        break;
    }

    // Check collision with enemy
    if (player.x === gameState.enemy.x && player.y === gameState.enemy.y) {
      player.x = oldX;
      player.y = oldY;
    }

    io.emit('playerMoved', {
      id: socket.id,
      x: player.x,
      y: player.y
    });
  });

  // Handle attack
  socket.on('attack', () => {
    const player = gameState.players[socket.id];
    if (!player) return;

    const now = Date.now();
    if (now - player.lastAttack < 1000) return; // 1 second cooldown

    player.lastAttack = now;

    // Check if player is adjacent to enemy
    const dx = Math.abs(player.x - gameState.enemy.x);
    const dy = Math.abs(player.y - gameState.enemy.y);

    if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
      const damage = Math.floor(Math.random() * 10) + 5;
      gameState.enemy.hp = Math.max(0, gameState.enemy.hp - damage);

      io.emit('enemyHit', {
        hp: gameState.enemy.hp,
        damage: damage,
        playerId: socket.id
      });

      if (gameState.enemy.hp <= 0) {
        io.emit('enemyDefeated');
        // Respawn enemy after 5 seconds
        setTimeout(() => {
          gameState.enemy.hp = gameState.enemy.maxHp;
          gameState.enemy.x = 10;
          gameState.enemy.y = 7;
          io.emit('enemyRespawned', gameState.enemy);
        }, 5000);
      }
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});