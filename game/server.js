const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;

// ─── Word Packs ───────────────────────────────────────────────────────────────
const WORD_PACKS = {
  general: [
    'fire ___', 'thunder ___', 'black ___', 'white ___', 'sun ___',
    'cold ___', 'gold ___', 'iron ___', 'night ___', 'star ___',
    'blue ___', 'ice ___', 'red ___', 'sea ___', 'wild ___',
    '___ stone', '___ light', '___ house', '___ side', '___ line',
    'over ___', 'under ___', 'out ___', 'up ___', 'down ___',
    'back ___', 'cross ___', 'wind ___', 'sand ___', 'rain ___',
    'moon ___', 'sky ___', 'earth ___', 'day ___', 'high ___',
    '___ fall', '___ town', '___ land', '___ bird', '___ man',
    'book ___', 'door ___', 'eye ___', 'foot ___', 'hand ___',
    '___ fish', '___ dog', '___ cat', '___ time', '___ way'
  ],
  food: [
    'sweet ___', 'hot ___', 'spicy ___', 'fresh ___', 'raw ___',
    '___ cake', '___ bread', '___ sauce', '___ soup', '___ salad',
    'butter ___', 'sugar ___', 'cream ___', 'lemon ___', 'pepper ___',
    '___ roll', '___ burger', '___ wrap', '___ bowl', '___ plate',
    'meat ___', 'sea ___', 'sea___', '___ fruit', '___ berry',
    'apple ___', 'cherry ___', 'grape ___', 'corn ___', 'milk ___',
    '___ pie', '___ steak', '___ toast', '___ bar', '___ chip'
  ],
  sports: [
    'goal ___', 'home ___', 'slam ___', 'drop ___', 'fast ___',
    '___ ball', '___ court', '___ field', '___ track', '___ run',
    'power ___', 'free ___', 'team ___', 'play ___', 'game ___',
    '___ kick', '___ shot', '___ jump', '___ race', '___ match',
    'base ___', 'basket ___', 'touch ___', 'net ___', 'speed ___',
    'world ___', 'grand ___', '___ cup', '___ league', '___ zone'
  ],
  movies: [
    'star ___', 'super ___', 'dark ___', 'dead ___', 'ghost ___',
    '___ wars', '___ man', '___ woman', '___ hero', '___ force',
    'action ___', 'dream ___', 'last ___', 'lost ___', 'fast ___',
    '___ hunt', '___ chase', '___ falls', '___ city', '___ night',
    'iron ___', 'spider ___', 'bat ___', 'wonder ___', 'black ___',
    '___ rise', '___ origins', '___ legacy', '___ returns', '___ beyond'
  ],
  tech: [
    'cloud ___', 'cyber ___', 'data ___', 'smart ___', 'web ___',
    '___ app', '___ code', '___ net', '___ link', '___ core',
    'open ___', 'deep ___', 'auto ___', 'micro ___', 'mega ___',
    '___ hub', '___ lab', '___ base', '___ stack', '___ drive',
    'super ___', 'ultra ___', 'hyper ___', 'meta ___', 'neo ___',
    '___ bot', '___ AI', '___ tech', '___ ware', '___ gear'
  ],
  animals: [
    'bull ___', 'lion ___', 'tiger ___', 'wolf ___', 'bear ___',
    '___ hawk', '___ cat', '___ dog', '___ fish', '___ bird',
    'wild ___', 'great ___', 'sea ___', 'mountain ___', 'desert ___',
    '___ pup', '___ cub', '___ paw', '___ wing', '___ tail',
    'black ___', 'red ___', 'golden ___', 'snow ___', 'blue ___',
    '___ back', '___ mouth', '___ eye', '___ foot', '___ head'
  ]
};

// ─── Room State ───────────────────────────────────────────────────────────────
const rooms = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]);
  return code;
}

const PLAYER_COLORS = [
  '#7c3aed', '#06b6d4', '#f59e0b', '#10b981',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#6366f1'
];

function createPlayer(id, name, colorIndex) {
  return { id, name, score: 0, streak: 0, hasWildcard: true, locked: false, colorIndex };
}

function getRoom(code) { return rooms[code.toUpperCase()]; }

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function roomPublicState(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      streak: p.streak,
      hasWildcard: p.hasWildcard,
      locked: p.locked,
      colorIndex: p.colorIndex
    })),
    settings: room.settings,
    state: room.state,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    host: room.host
  };
}

// ─── Game Logic ───────────────────────────────────────────────────────────────
function startRound(room) {
  const pack = WORD_PACKS[room.settings.category] || WORD_PACKS.general;
  const prompt = room.unusedPrompts.pop() || pack[Math.floor(Math.random() * pack.length)];

  room.state = 'playing';
  room.currentRound++;
  room.prompt = prompt;
  room.answers = {};
  room.wildcardPlayers = new Set();
  room.players.forEach(p => { p.locked = false; });
  room.remaining = room.settings.timeLimit;

  io.to(room.code).emit('round_start', {
    round: room.currentRound,
    total: room.totalRounds,
    prompt,
    timeLimit: room.settings.timeLimit,
    players: roomPublicState(room).players
  });

  room.timerRef = setInterval(() => {
    room.remaining--;
    io.to(room.code).emit('timer_tick', { remaining: room.remaining });

    const allLocked = room.players.length > 0 && room.players.every(p => p.locked);
    if (room.remaining <= 0 || allLocked) {
      clearInterval(room.timerRef);
      room.timerRef = null;
      revealRound(room);
    }
  }, 1000);
}

function revealRound(room) {
  room.state = 'reveal';

  // Group answers
  const groups = {};
  for (const player of room.players) {
    let answer = (room.answers[player.id] || '').trim().toLowerCase();
    if (!answer) answer = '(no answer)';

    if (!groups[answer]) groups[answer] = [];
    groups[answer].push(player.id);
  }

  // Apply wildcards: move wildcard players into the winning group
  const groupSizes = Object.values(groups).map(g => g.length);
  const maxSize = Math.max(...groupSizes);

  // Find winning answers (all groups tied for largest)
  const winningAnswers = Object.entries(groups)
    .filter(([, members]) => members.length === maxSize && members.length > 1)
    .map(([ans]) => ans);

  // Wildcard players: if they used wildcard and aren't already in a winning group,
  // move them to the first winning group
  for (const pid of room.wildcardPlayers) {
    const playerAnswer = (room.answers[pid] || '').trim().toLowerCase() || '(no answer)';
    if (winningAnswers.length > 0 && !winningAnswers.includes(playerAnswer)) {
      // Remove from current group
      if (groups[playerAnswer]) {
        groups[playerAnswer] = groups[playerAnswer].filter(id => id !== pid);
        if (groups[playerAnswer].length === 0) delete groups[playerAnswer];
      }
      // Add to first winning group
      groups[winningAnswers[0]].push(pid);
    }
  }

  // Recalculate winners after wildcard
  const groupSizes2 = Object.values(groups).map(g => g.length);
  const maxSize2 = Math.max(...groupSizes2);
  const winningAnswers2 = Object.entries(groups)
    .filter(([, members]) => members.length === maxSize2 && members.length > 1)
    .map(([ans]) => ans);

  const winners = new Set(
    winningAnswers2.flatMap(ans => groups[ans])
  );

  // Score
  const scoreDeltas = {};
  for (const player of room.players) {
    let delta = 0;
    if (winners.has(player.id)) {
      delta = 1;
      player.streak = (player.streak || 0) + 1;
      if (player.streak >= 3) delta += 1; // streak bonus
      player.score += delta;
    } else {
      player.streak = 0;
    }
    scoreDeltas[player.id] = delta;
  }

  // Build reveal payload
  const groupsPayload = Object.entries(groups)
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([answer, memberIds]) => ({
      answer,
      members: memberIds.map(id => {
        const p = room.players.find(pl => pl.id === id);
        return p ? { id: p.id, name: p.name, colorIndex: p.colorIndex } : null;
      }).filter(Boolean),
      isWinner: winningAnswers2.includes(answer)
    }));

  io.to(room.code).emit('round_reveal', {
    groups: groupsPayload,
    scoreDeltas,
    players: roomPublicState(room).players,
    prompt: room.prompt
  });

  // Auto-advance after 6 seconds
  setTimeout(() => {
    if (!rooms[room.code]) return;
    if (room.currentRound >= room.totalRounds) {
      endGame(room);
    } else {
      startRound(room);
    }
  }, 6000);
}

function endGame(room) {
  room.state = 'results';
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.code).emit('game_over', {
    finalScores: sorted.map(p => ({
      id: p.id, name: p.name, score: p.score, colorIndex: p.colorIndex
    })),
    winner: sorted[0] ? sorted[0].name : null
  });
}

// ─── Socket Events ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {

  socket.on('create_room', ({ name, settings }) => {
    if (!name || !name.trim()) return socket.emit('error', { msg: 'Name is required' });
    name = name.trim().slice(0, 20);

    const code = generateCode();
    const pack = shuffleArray(WORD_PACKS[settings?.category] || WORD_PACKS.general);

    rooms[code] = {
      code,
      host: socket.id,
      players: [createPlayer(socket.id, name, 0)],
      settings: {
        rounds: Math.min(20, Math.max(2, parseInt(settings?.rounds) || 10)),
        timeLimit: Math.min(60, Math.max(5, parseInt(settings?.timeLimit) || 30)),
        category: WORD_PACKS[settings?.category] ? settings.category : 'general'
      },
      state: 'lobby',
      currentRound: 0,
      totalRounds: Math.min(20, Math.max(2, parseInt(settings?.rounds) || 10)),
      prompt: null,
      answers: {},
      wildcardPlayers: new Set(),
      unusedPrompts: pack,
      timerRef: null,
      remaining: 0
    };

    socket.join(code);
    socket.emit('room_created', { code, room: roomPublicState(rooms[code]) });
  });

  socket.on('join_room', ({ name, code }) => {
    if (!name || !name.trim()) return socket.emit('error', { msg: 'Name is required' });
    if (!code) return socket.emit('error', { msg: 'Room code is required' });

    name = name.trim().slice(0, 20);
    code = code.trim().toUpperCase();
    const room = rooms[code];

    if (!room) return socket.emit('error', { msg: 'Room not found. Check your code!' });
    if (room.state !== 'lobby') return socket.emit('error', { msg: 'Game already in progress' });
    if (room.players.length >= 10) return socket.emit('error', { msg: 'Room is full (10 players max)' });
    if (room.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      return socket.emit('error', { msg: 'Name already taken in this room' });
    }

    const colorIndex = room.players.length % PLAYER_COLORS.length;
    const player = createPlayer(socket.id, name, colorIndex);
    room.players.push(player);
    socket.join(code);

    socket.emit('room_joined', { room: roomPublicState(room) });
    socket.to(code).emit('player_joined', {
      player: { id: player.id, name: player.name, colorIndex: player.colorIndex },
      players: roomPublicState(room).players
    });
  });

  socket.on('update_settings', ({ settings }) => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.host !== socket.id) return;
    if (room.state !== 'lobby') return;

    if (settings.rounds) room.settings.rounds = Math.min(20, Math.max(2, parseInt(settings.rounds) || 10));
    if (settings.timeLimit) room.settings.timeLimit = Math.min(60, Math.max(5, parseInt(settings.timeLimit) || 30));
    if (settings.category && WORD_PACKS[settings.category]) {
      room.settings.category = settings.category;
      room.unusedPrompts = shuffleArray(WORD_PACKS[settings.category]);
    }
    room.totalRounds = room.settings.rounds;

    io.to(room.code).emit('settings_updated', { settings: room.settings });
  });

  socket.on('start_game', () => {
    const room = findPlayerRoom(socket.id);
    if (!room) return socket.emit('error', { msg: 'Not in a room' });
    if (room.host !== socket.id) return socket.emit('error', { msg: 'Only the host can start' });
    if (room.state !== 'lobby') return socket.emit('error', { msg: 'Game already started' });
    if (room.players.length < 2) return socket.emit('error', { msg: 'Need at least 2 players to start' });

    room.state = 'starting';
    io.to(room.code).emit('game_started', { settings: room.settings });

    setTimeout(() => startRound(room), 3000);
  });

  socket.on('submit_answer', ({ answer }) => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.state !== 'playing') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.locked) return;

    answer = (answer || '').trim().slice(0, 50);
    room.answers[socket.id] = answer;
    player.locked = true;

    io.to(room.code).emit('answer_locked', {
      playerId: socket.id,
      players: roomPublicState(room).players
    });
  });

  socket.on('use_wildcard', () => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.state !== 'playing') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.hasWildcard) return;

    player.hasWildcard = false;
    room.wildcardPlayers.add(socket.id);

    socket.emit('wildcard_used', { ok: true });
    socket.to(room.code).emit('player_used_wildcard', { playerId: socket.id, name: player.name });
  });

  socket.on('react', ({ emoji }) => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const allowed = ['❤️', '😂', '🔥', '😤', '🎉', '👀', '💯', '🤯'];
    if (!allowed.includes(emoji)) return;

    io.to(room.code).emit('reaction', { playerId: socket.id, name: player.name, emoji });
  });

  socket.on('chat', ({ msg }) => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    msg = (msg || '').trim().slice(0, 200);
    if (!msg) return;

    io.to(room.code).emit('chat_msg', {
      name: player.name,
      msg,
      colorIndex: player.colorIndex
    });
  });

  socket.on('kick_player', ({ playerId }) => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.host !== socket.id || room.state !== 'lobby') return;

    const kicked = room.players.find(p => p.id === playerId);
    if (!kicked || kicked.id === socket.id) return;

    room.players = room.players.filter(p => p.id !== playerId);
    const kickedSocket = io.sockets.sockets.get(playerId);
    if (kickedSocket) {
      kickedSocket.leave(room.code);
      kickedSocket.emit('kicked', { msg: 'You were removed from the room.' });
    }

    io.to(room.code).emit('player_left', {
      playerId,
      players: roomPublicState(room).players
    });
  });

  socket.on('extend_time', () => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.host !== socket.id || room.state !== 'playing') return;

    room.remaining = Math.min(room.remaining + 10, room.settings.timeLimit + 10);
    io.to(room.code).emit('time_extended', { remaining: room.remaining });
  });

  socket.on('skip_round', () => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.host !== socket.id || room.state !== 'playing') return;

    if (room.timerRef) {
      clearInterval(room.timerRef);
      room.timerRef = null;
    }
    revealRound(room);
  });

  socket.on('play_again', () => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.host !== socket.id || room.state !== 'results') return;

    room.players.forEach(p => {
      p.score = 0;
      p.streak = 0;
      p.hasWildcard = true;
      p.locked = false;
    });
    room.currentRound = 0;
    room.state = 'lobby';
    room.unusedPrompts = shuffleArray(WORD_PACKS[room.settings.category] || WORD_PACKS.general);

    io.to(room.code).emit('back_to_lobby', { room: roomPublicState(room) });
  });

  socket.on('disconnect', () => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;

    const wasHost = room.host === socket.id;
    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      if (room.timerRef) clearInterval(room.timerRef);
      delete rooms[room.code];
      return;
    }

    if (wasHost) {
      room.host = room.players[0].id;
      io.to(room.code).emit('host_changed', { newHostId: room.host });
    }

    io.to(room.code).emit('player_left', {
      playerId: socket.id,
      players: roomPublicState(room).players
    });

    // If game was playing and all remaining players are locked, advance
    if (room.state === 'playing') {
      const allLocked = room.players.length > 0 && room.players.every(p => p.locked);
      if (allLocked && room.timerRef) {
        clearInterval(room.timerRef);
        room.timerRef = null;
        revealRound(room);
      }
    }
  });
});

function findPlayerRoom(socketId) {
  return Object.values(rooms).find(r => r.players.some(p => p.id === socketId)) || null;
}

server.listen(PORT, () => {
  console.log(`WordMatch server running on http://localhost:${PORT}`);
});
