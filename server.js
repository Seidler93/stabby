const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const GRID_SIZE = 32;
const GAME_WIDTH = 20;
const GAME_HEIGHT = 15;

// Define obstacles/walls on the map
const obstacles = [
  // Center pillar
  { x: 10, y: 7 },
  { x: 10, y: 8 },
  { x: 9, y: 7 },
  { x: 11, y: 7 },

  // Top left corner walls
  { x: 3, y: 3 },
  { x: 4, y: 3 },
  { x: 3, y: 4 },

  // Top right corner walls
  { x: 16, y: 3 },
  { x: 17, y: 3 },
  { x: 17, y: 4 },

  // Bottom left corner walls
  { x: 3, y: 11 },
  { x: 4, y: 11 },
  { x: 3, y: 10 },

  // Bottom right corner walls
  { x: 16, y: 11 },
  { x: 17, y: 11 },
  { x: 17, y: 10 },

  // Middle barriers
  { x: 6, y: 7 },
  { x: 14, y: 7 },
];

function isObstacle(x, y) {
  return obstacles.some(obs => obs.x === x && obs.y === y);
}

// Simple A* pathfinding to avoid getting stuck on obstacles
function findNextMove(fromX, fromY, toX, toY) {
  // If already adjacent, don't move
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
    return { x: fromX, y: fromY };
  }

  // Try all 4 directions
  const moves = [
    { x: fromX + 1, y: fromY, dir: 'right' },
    { x: fromX - 1, y: fromY, dir: 'left' },
    { x: fromX, y: fromY + 1, dir: 'down' },
    { x: fromX, y: fromY - 1, dir: 'up' }
  ];

  // Filter out invalid moves (out of bounds or obstacles)
  const validMoves = moves.filter(move =>
    move.x >= 0 && move.x < GAME_WIDTH &&
    move.y >= 0 && move.y < GAME_HEIGHT &&
    !isObstacle(move.x, move.y)
  );

  if (validMoves.length === 0) {
    return { x: fromX, y: fromY }; // Stuck, don't move
  }

  // Score each move by Manhattan distance to target
  const scoredMoves = validMoves.map(move => ({
    ...move,
    score: Math.abs(move.x - toX) + Math.abs(move.y - toY)
  }));

  // Sort by score (lowest = closest to target)
  scoredMoves.sort((a, b) => a.score - b.score);

  // Add some randomness - sometimes pick 2nd best move to avoid predictability
  const bestMoves = scoredMoves.filter(m => m.score === scoredMoves[0].score);
  const chosenMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];

  return { x: chosenMove.x, y: chosenMove.y };
}

const gameState = {
  players: {},
  enemy: {
    x: 10,
    y: 4,
    hp: 100,
    maxHp: 100,
    color: '#ff0000',
    lastMove: 0,
    lastAttack: 0
  },
  obstacles: obstacles,
  projectiles: []
};

let projectileIdCounter = 0;

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
    mana: 100,
    maxMana: 100,
    color: playerColor,
    lastAttack: 0,
    lastAbility: 0,
    lastUltimate: 0,
    isDead: false
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
    if (!player || player.isDead) return;

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

    // Check collision with obstacles
    if (isObstacle(player.x, player.y)) {
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
    if (!player || player.isDead) return;

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

  // Handle respawn
  socket.on('respawn', () => {
    const player = gameState.players[socket.id];
    if (!player) return;

    player.isDead = false;
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    player.x = Math.floor(Math.random() * 5) + 2;
    player.y = Math.floor(Math.random() * 5) + 2;

    io.emit('playerRespawned', {
      id: socket.id,
      x: player.x,
      y: player.y,
      hp: player.hp,
      mana: player.mana
    });
  });

  // Handle abilities
  socket.on('ability', (data) => {
    const player = gameState.players[socket.id];
    if (!player || player.isDead) return;

    const now = Date.now();
    if (now - player.lastAbility < 500) return; // 0.5 second cooldown between abilities

    player.lastAbility = now;
    const abilityType = data.type;

    switch (abilityType) {
      case 'fireball': // Q - Ranged projectile attack (30 mana)
        if (player.mana >= 30) {
          player.mana -= 30;

          // Create projectile
          const projectile = {
            id: projectileIdCounter++,
            x: player.x * GRID_SIZE + GRID_SIZE / 2,
            y: player.y * GRID_SIZE + GRID_SIZE / 2,
            targetX: data.targetX,
            targetY: data.targetY,
            playerId: socket.id,
            speed: 8, // pixels per update
            damage: Math.floor(Math.random() * 15) + 15,
            type: 'fireball'
          };

          // Calculate direction
          const dx = data.targetX - projectile.x;
          const dy = data.targetY - projectile.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          projectile.vx = (dx / distance) * projectile.speed;
          projectile.vy = (dy / distance) * projectile.speed;

          gameState.projectiles.push(projectile);

          io.emit('projectileCreated', projectile);
          io.emit('playerManaChanged', {
            id: socket.id,
            mana: player.mana
          });
        }
        break;

      case 'heal': // E - Heal self (40 mana)
        if (player.mana >= 40) {
          player.mana -= 40;
          const healAmount = 20;
          player.hp = Math.min(player.maxHp, player.hp + healAmount);

          io.emit('abilityUsed', {
            playerId: socket.id,
            ability: 'heal',
            healAmount: healAmount
          });

          io.emit('playerHealed', {
            id: socket.id,
            hp: player.hp
          });

          io.emit('playerManaChanged', {
            id: socket.id,
            mana: player.mana
          });
        }
        break;

      case 'dash': // R - Dash 2 tiles (25 mana)
        if (player.mana >= 25) {
          player.mana -= 25;

          // Dash in the direction of nearest player or away from enemy
          const enemyDx = gameState.enemy.x - player.x;
          const enemyDy = gameState.enemy.y - player.y;

          // Dash away from enemy
          let dashX = player.x;
          let dashY = player.y;

          if (Math.abs(enemyDx) > Math.abs(enemyDy)) {
            dashX = enemyDx > 0 ? player.x - 2 : player.x + 2;
          } else {
            dashY = enemyDy > 0 ? player.y - 2 : player.y + 2;
          }

          // Clamp to bounds
          dashX = Math.max(0, Math.min(GAME_WIDTH - 1, dashX));
          dashY = Math.max(0, Math.min(GAME_HEIGHT - 1, dashY));

          // Check if dash location is valid (not obstacle or enemy)
          if (!isObstacle(dashX, dashY) &&
            !(dashX === gameState.enemy.x && dashY === gameState.enemy.y)) {
            player.x = dashX;
            player.y = dashY;
          }

          io.emit('abilityUsed', {
            playerId: socket.id,
            ability: 'dash'
          });

          io.emit('playerMoved', {
            id: socket.id,
            x: player.x,
            y: player.y
          });

          io.emit('playerManaChanged', {
            id: socket.id,
            mana: player.mana
          });
        }
        break;

      case 'homing': // F - Homing Missile (60 mana, 3 second cooldown)
        const now2 = Date.now();
        if (player.mana >= 60 && now2 - player.lastUltimate >= 3000) {
          player.mana -= 60;
          player.lastUltimate = now2;

          // Create homing missile projectile
          const missile = {
            id: projectileIdCounter++,
            x: player.x * GRID_SIZE + GRID_SIZE / 2,
            y: player.y * GRID_SIZE + GRID_SIZE / 2,
            targetX: gameState.enemy.x * GRID_SIZE + GRID_SIZE / 2,
            targetY: gameState.enemy.y * GRID_SIZE + GRID_SIZE / 2,
            playerId: socket.id,
            speed: 5, // Slower than fireball
            damage: Math.floor(Math.random() * 20) + 30, // 30-50 damage
            type: 'homing',
            lifetime: 0,
            maxLifetime: 10000 // 10 seconds max
          };

          // Initial direction toward enemy
          const dx = missile.targetX - missile.x;
          const dy = missile.targetY - missile.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          missile.vx = (dx / distance) * missile.speed;
          missile.vy = (dy / distance) * missile.speed;

          gameState.projectiles.push(missile);

          io.emit('projectileCreated', missile);
          io.emit('abilityUsed', {
            playerId: socket.id,
            ability: 'homing'
          });
          io.emit('playerManaChanged', {
            id: socket.id,
            mana: player.mana
          });
        }
        break;
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Projectile update loop
setInterval(() => {
  const projectilesToRemove = [];
  const deltaTime = 1000 / 60;

  for (let i = 0; i < gameState.projectiles.length; i++) {
    const proj = gameState.projectiles[i];

    // Handle homing missile behavior
    if (proj.type === 'homing' && gameState.enemy.hp > 0) {
      proj.lifetime += deltaTime;

      // Update target to current enemy position
      const targetX = gameState.enemy.x * GRID_SIZE + GRID_SIZE / 2;
      const targetY = gameState.enemy.y * GRID_SIZE + GRID_SIZE / 2;

      // Calculate direction to target
      const dx = targetX - proj.x;
      const dy = targetY - proj.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0) {
        // Smoothly adjust velocity toward target
        const targetVx = (dx / distance) * proj.speed;
        const targetVy = (dy / distance) * proj.speed;

        // Lerp for smooth turning (0.15 = turning speed)
        proj.vx += (targetVx - proj.vx) * 0.15;
        proj.vy += (targetVy - proj.vy) * 0.15;
      }

      // Check lifetime
      if (proj.lifetime >= proj.maxLifetime) {
        projectilesToRemove.push(i);
        io.emit('projectileDestroyed', { id: proj.id, hitData: null });
        continue;
      }
    }

    // Update position
    proj.x += proj.vx;
    proj.y += proj.vy;

    const gridX = Math.floor(proj.x / GRID_SIZE);
    const gridY = Math.floor(proj.y / GRID_SIZE);

    let shouldRemove = false;
    let hitData = null;

    // Check bounds
    if (gridX < 0 || gridX >= GAME_WIDTH || gridY < 0 || gridY >= GAME_HEIGHT) {
      shouldRemove = true;
    }

    // Check wall collision (homing missiles ignore walls)
    if (!shouldRemove && proj.type !== 'homing' && isObstacle(gridX, gridY)) {
      shouldRemove = true;
    }

    // Check enemy collision
    if (!shouldRemove && gameState.enemy.hp > 0) {
      const enemyCenterX = gameState.enemy.x * GRID_SIZE + GRID_SIZE / 2;
      const enemyCenterY = gameState.enemy.y * GRID_SIZE + GRID_SIZE / 2;
      const dist = Math.sqrt(
        Math.pow(proj.x - enemyCenterX, 2) +
        Math.pow(proj.y - enemyCenterY, 2)
      );

      const hitRadius = proj.type === 'homing' ? GRID_SIZE / 1.5 : GRID_SIZE / 2;

      if (dist < hitRadius) {
        gameState.enemy.hp = Math.max(0, gameState.enemy.hp - proj.damage);
        shouldRemove = true;
        hitData = {
          type: 'enemy',
          damage: proj.damage,
          enemyHp: gameState.enemy.hp,
          projectileType: proj.type
        };

        if (gameState.enemy.hp <= 0) {
          io.emit('enemyDefeated');
          setTimeout(() => {
            gameState.enemy.hp = gameState.enemy.maxHp;
            gameState.enemy.x = 10;
            gameState.enemy.y = 4;
            io.emit('enemyRespawned', gameState.enemy);
          }, 5000);
        }
      }
    }

    if (shouldRemove) {
      projectilesToRemove.push(i);
      io.emit('projectileDestroyed', {
        id: proj.id,
        hitData: hitData
      });
    } else {
      io.emit('projectileUpdated', {
        id: proj.id,
        x: proj.x,
        y: proj.y,
        vx: proj.vx,
        vy: proj.vy
      });
    }
  }

  // Remove destroyed projectiles (reverse order to maintain indices)
  for (let i = projectilesToRemove.length - 1; i >= 0; i--) {
    gameState.projectiles.splice(projectilesToRemove[i], 1);
  }
}, 1000 / 60); // 60 FPS for smooth projectiles

// Mana regeneration loop (5 mana per second)
setInterval(() => {
  for (let id in gameState.players) {
    const player = gameState.players[id];
    if (!player.isDead && player.mana < player.maxMana) {
      player.mana = Math.min(player.maxMana, player.mana + 5);
      io.emit('playerManaChanged', {
        id: id,
        mana: player.mana
      });
    }
  }
}, 1000);

// Enemy AI Loop
setInterval(() => {
  const now = Date.now();

  // Enemy movement (every 500ms)
  if (now - gameState.enemy.lastMove > 500 && gameState.enemy.hp > 0) {
    gameState.enemy.lastMove = now;

    // Find nearest alive player
    let nearestPlayer = null;
    let minDist = Infinity;

    for (let id in gameState.players) {
      const player = gameState.players[id];
      if (player.isDead) continue;

      const dist = Math.abs(player.x - gameState.enemy.x) + Math.abs(player.y - gameState.enemy.y);
      if (dist < minDist) {
        minDist = dist;
        nearestPlayer = player;
      }
    }

    // Move toward nearest player (smarter pathfinding)
    if (nearestPlayer) {
      const newPos = findNextMove(
        gameState.enemy.x,
        gameState.enemy.y,
        nearestPlayer.x,
        nearestPlayer.y
      );

      // Only emit if position actually changed
      if (newPos.x !== gameState.enemy.x || newPos.y !== gameState.enemy.y) {
        gameState.enemy.x = newPos.x;
        gameState.enemy.y = newPos.y;

        io.emit('enemyMoved', {
          x: gameState.enemy.x,
          y: gameState.enemy.y
        });
      }
    }
  }

  // Enemy attack (every 1 second)
  if (now - gameState.enemy.lastAttack > 1000 && gameState.enemy.hp > 0) {
    gameState.enemy.lastAttack = now;

    // Attack all adjacent players
    for (let id in gameState.players) {
      const player = gameState.players[id];
      if (player.isDead) continue;

      const dx = Math.abs(player.x - gameState.enemy.x);
      const dy = Math.abs(player.y - gameState.enemy.y);

      if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
        player.hp = Math.max(0, player.hp - 10);

        io.emit('playerHit', {
          id: id,
          hp: player.hp,
          damage: 10
        });

        if (player.hp <= 0) {
          player.isDead = true;
          io.emit('playerDied', id);
        }
      }
    }
  }
}, 100); // Check every 100ms for smooth gameplay

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});