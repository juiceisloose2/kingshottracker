/* ═══════════════════════════════════════════════════════
   WordMatch Client
   ═══════════════════════════════════════════════════════ */

const socket = io();

// ── State ────────────────────────────────────────────────
let state = {
  screen: 'home',
  room: null,
  myId: null,
  myName: null,
  isHost: false,
  timeLimit: 30,
  timerTotal: 30,
  timerRemaining: 30,
  timerInterval: null,
  hasWildcard: true,
  wildcardUsed: false,
  locked: false,
  currentRound: 0,
  totalRounds: 10
};

// ── Player color list (mirrors server) ──────────────────
const PLAYER_COLORS = [
  '#7c3aed','#06b6d4','#f59e0b','#10b981',
  '#ef4444','#8b5cf6','#ec4899','#14b8a6',
  '#f97316','#6366f1'
];

const CATEGORY_LABELS = {
  general: '🌍 General', food: '🍕 Food & Drink',
  sports: '⚽ Sports', movies: '🎬 Movies & TV',
  tech: '💻 Tech', animals: '🐾 Animals'
};

// ─── Utility ─────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
  state.screen = name;
}

function toast(msg, type = '', duration = 3000) {
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

function playerColor(colorIndex) {
  return PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
}

// ─── Background canvas particle effect ───────────────────
(function initBgCanvas() {
  const canvas = $('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const particles = [];
  let W, H;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 2 + 0.5,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.4 + 0.1
    });
  }

  function frame() {
    if (state.screen !== 'home') { requestAnimationFrame(frame); return; }
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(159,103,255,${p.alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// ─── Confetti ────────────────────────────────────────────
function launchConfetti() {
  const canvas = $('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#7c3aed','#06b6d4','#f59e0b','#10b981','#ef4444','#ec4899'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 80,
    w: 6 + Math.random() * 8,
    h: 10 + Math.random() * 8,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.15,
    dx: (Math.random() - 0.5) * 2,
    dy: 2 + Math.random() * 3,
    alpha: 1
  }));

  let running = true;
  function draw() {
    if (!running) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    pieces.forEach(p => {
      p.x += p.dx; p.y += p.dy; p.rot += p.rotV;
      if (p.y > canvas.height * 0.8) p.alpha -= 0.02;
      if (p.alpha <= 0) return;
      alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive > 0) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(draw);
  setTimeout(() => { running = false; }, 6000);
}

// ─── Score float ─────────────────────────────────────────
function floatScore(delta, x, y) {
  if (delta <= 0) return;
  const el = document.createElement('div');
  el.className = 'score-float';
  el.textContent = `+${delta}`;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ─── Player list rendering ────────────────────────────────
function renderPlayerList(players, hostId) {
  const list = $('player-list');
  const count = $('player-count');
  if (!list) return;
  count.textContent = `${players.length}/10`;
  list.innerHTML = players.map(p => `
    <div class="player-item">
      <div class="player-avatar pc-${p.colorIndex}" style="background:${playerColor(p.colorIndex)}">
        ${escHtml(initials(p.name))}
      </div>
      <span class="player-name">${escHtml(p.name)}</span>
      ${p.id === hostId ? '<span class="host-crown">👑 Host</span>' : ''}
      ${(state.isHost && p.id !== state.myId && state.room?.state === 'lobby') ?
        `<button class="btn btn-ghost btn-sm" onclick="kickPlayer('${escHtml(p.id)}')">Kick</button>` : ''}
    </div>
  `).join('');
}

// ─── Settings rendering ───────────────────────────────────
function renderSettings(settings) {
  const r = $('lobby-rounds'); const t = $('lobby-time'); const c = $('lobby-category');
  if (r) r.value = settings.rounds;
  if (t) t.value = settings.timeLimit;
  if (c) c.value = settings.category;
}

// ─── Score list rendering ─────────────────────────────────
function renderScoreList(el, players, deltas) {
  if (!el) return;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  el.innerHTML = sorted.map((p, i) => {
    const delta = deltas ? deltas[p.id] || 0 : null;
    const streak = p.streak >= 3 ? ` 🔥${p.streak}` : '';
    return `
      <div class="score-item">
        <span class="score-rank">#${i + 1}</span>
        <div class="player-avatar pc-${p.colorIndex}" style="background:${playerColor(p.colorIndex)};width:28px;height:28px;font-size:0.7rem;flex-shrink:0">
          ${escHtml(initials(p.name))}
        </div>
        <span class="score-name">${escHtml(p.name)}${streak}</span>
        <span class="score-val">${p.score}</span>
        ${delta !== null ? `<span class="score-delta ${delta === 0 ? 'zero' : ''}">+${delta}</span>` : ''}
      </div>
    `;
  }).join('');
}

// ─── Status dots ──────────────────────────────────────────
function renderStatusDots(players) {
  const el = $('players-status');
  if (!el) return;
  el.innerHTML = players.map(p => {
    const cls = p.locked ? 'locked' : '';
    return `
      <div class="status-dot ${cls}">
        <div class="dot-ind"></div>
        <span>${escHtml(p.name)}</span>
        ${p.locked ? '🔒' : ''}
      </div>
    `;
  }).join('');
}

// ─── Prompt parsing ───────────────────────────────────────
function parsePrompt(prompt) {
  // Returns { prefix, suffix } so the input is placed correctly
  // "fire ___" → prefix="fire", blank at end
  // "___ stone" → prefix="", suffix="stone"
  const parts = prompt.split('___');
  return { prefix: (parts[0] || '').trim(), suffix: (parts[1] || '').trim() };
}

// ─── Timer ───────────────────────────────────────────────
function startLocalTimer(total, initial) {
  clearInterval(state.timerInterval);
  state.timerTotal = total;
  state.timerRemaining = initial;
  updateTimerUI(initial, total);
}

function updateTimerUI(remaining, total) {
  const display = $('timer-display');
  const bar = $('timer-bar');
  if (!display || !bar) return;
  display.textContent = remaining;
  const pct = Math.max(0, (remaining / total) * 100);
  bar.style.width = pct + '%';
  const urgent = remaining <= 5;
  display.classList.toggle('urgent', urgent);
  bar.classList.toggle('urgent', urgent);
}

// ─── How to Play modal ───────────────────────────────────
$('btn-how-to').addEventListener('click', () => {
  $('modal-how-to').style.display = 'flex';
});
$('btn-close-modal').addEventListener('click', () => {
  $('modal-how-to').style.display = 'none';
});
$('modal-how-to').addEventListener('click', (e) => {
  if (e.target === $('modal-how-to')) $('modal-how-to').style.display = 'none';
});

// ─── Tab switching (home screen) ──────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ─── Home: Join ───────────────────────────────────────────
$('btn-join').addEventListener('click', () => {
  const name = $('join-name').value.trim();
  const code = $('join-code').value.trim().toUpperCase();
  if (!name) { toast('Please enter your name', 'error'); $('join-name').focus(); return; }
  if (!code || code.length !== 4) { toast('Enter a 4-letter room code', 'error'); $('join-code').focus(); return; }
  state.myName = name;
  socket.emit('join_room', { name, code });
});

$('join-code').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

$('join-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-join').click();
});
$('join-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-join').click();
});

// ─── Home: Create ─────────────────────────────────────────
$('btn-create').addEventListener('click', () => {
  const name = $('create-name').value.trim();
  if (!name) { toast('Please enter your name', 'error'); $('create-name').focus(); return; }
  const settings = {
    rounds: parseInt($('create-rounds').value),
    timeLimit: parseInt($('create-time').value),
    category: $('create-category').value
  };
  state.myName = name;
  socket.emit('create_room', { name, settings });
});

$('create-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-create').click();
});

// ─── Lobby: Settings ──────────────────────────────────────
function setupLobbySettingsListeners() {
  ['lobby-rounds', 'lobby-time', 'lobby-category'].forEach(id => {
    $(id)?.addEventListener('change', () => {
      if (!state.isHost) return;
      socket.emit('update_settings', {
        settings: {
          rounds: parseInt($('lobby-rounds').value),
          timeLimit: parseInt($('lobby-time').value),
          category: $('lobby-category').value
        }
      });
    });
  });
}
setupLobbySettingsListeners();

$('btn-start').addEventListener('click', () => {
  socket.emit('start_game');
});

$('btn-copy-code').addEventListener('click', () => {
  const code = $('lobby-code').textContent;
  navigator.clipboard.writeText(code).then(() => toast('Code copied! Share it with friends.', 'success')).catch(() => toast(`Room code: ${code}`));
});

// ─── Chat ────────────────────────────────────────────────
function sendChat() {
  const input = $('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chat', { msg });
  input.value = '';
}
$('btn-chat-send').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

function appendChat({ name, msg, colorIndex }) {
  const el = $('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg pc-${colorIndex}`;
  div.innerHTML = `<span class="msg-name" style="color:${playerColor(colorIndex)}">${escHtml(name)}:</span><span class="msg-text"> ${escHtml(msg)}</span>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

// ─── Kick player ─────────────────────────────────────────
window.kickPlayer = (playerId) => {
  if (!state.isHost) return;
  socket.emit('kick_player', { playerId });
};

// ─── Game: Answer ─────────────────────────────────────────
$('btn-lock').addEventListener('click', submitAnswer);
$('answer-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(); });

function submitAnswer() {
  if (state.locked) return;
  const val = $('answer-input').value.trim();
  if (!val) { toast('Type something first!'); return; }
  socket.emit('submit_answer', { answer: val });
  state.locked = true;
  $('answer-input').disabled = true;
  $('btn-lock').style.display = 'none';
  $('locked-msg').style.display = 'block';
  Sounds.lock();
}

// ─── Game: Wildcard ───────────────────────────────────────
$('btn-wildcard').addEventListener('click', () => {
  if (state.wildcardUsed || !state.hasWildcard) return;
  socket.emit('use_wildcard');
  state.wildcardUsed = true;
  $('btn-wildcard').disabled = true;
  $('btn-wildcard').textContent = '⚡ Used!';
  toast('Wildcard activated! Your answer will count with the winning group.', 'success');
  Sounds.start();
});

// ─── Game: Reactions ──────────────────────────────────────
document.querySelectorAll('.react-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    socket.emit('react', { emoji: btn.dataset.emoji });
  });
});

function showReaction({ name, emoji }) {
  const overlay = $('reaction-overlay');
  const el = document.createElement('div');
  el.className = 'reaction-float';
  el.textContent = emoji;
  el.style.left = (15 + Math.random() * 70) + '%';
  el.style.bottom = '80px';
  overlay.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

// ─── Host controls ────────────────────────────────────────
$('btn-extend')?.addEventListener('click', () => socket.emit('extend_time'));
$('btn-skip')?.addEventListener('click', () => { if (confirm('Skip this round?')) socket.emit('skip_round'); });

// ─── Results ──────────────────────────────────────────────
$('btn-play-again').addEventListener('click', () => socket.emit('play_again'));
$('btn-leave').addEventListener('click', () => {
  socket.disconnect();
  setTimeout(() => location.reload(), 100);
});

// ═══════════════════════════════════════════════════════════
//   SOCKET EVENTS
// ═══════════════════════════════════════════════════════════

socket.on('connect', () => {
  state.myId = socket.id;
});

socket.on('error', ({ msg }) => {
  toast(msg, 'error');
});

// ── Room Created ──────────────────────────────────────────
socket.on('room_created', ({ code, room }) => {
  state.room = room;
  state.isHost = true;
  $('lobby-code').textContent = code;
  $('player-count').textContent = `${room.players.length}/10`;
  renderPlayerList(room.players, room.host);
  renderSettings(room.settings);
  $('host-settings').style.display = 'block';
  $('waiting-msg').style.display = 'none';
  showScreen('lobby');
  toast(`Room created! Code: ${code}`, 'success');
});

// ── Room Joined ───────────────────────────────────────────
socket.on('room_joined', ({ room }) => {
  state.room = room;
  state.isHost = room.host === socket.id;
  $('lobby-code').textContent = room.code;
  renderPlayerList(room.players, room.host);
  if (state.isHost) {
    $('host-settings').style.display = 'block';
    renderSettings(room.settings);
    $('waiting-msg').style.display = 'none';
  } else {
    $('host-settings').style.display = 'none';
    $('waiting-msg').style.display = 'block';
  }
  showScreen('lobby');
  Sounds.join();
});

// ── Player Joined ─────────────────────────────────────────
socket.on('player_joined', ({ player, players }) => {
  state.room.players = players;
  renderPlayerList(players, state.room.host);
  toast(`${player.name} joined!`);
  Sounds.join();
});

// ── Player Left ───────────────────────────────────────────
socket.on('player_left', ({ playerId, players }) => {
  const leaving = state.room.players.find(p => p.id === playerId);
  if (leaving) toast(`${leaving.name} left the game`);
  state.room.players = players;
  if (state.screen === 'lobby') renderPlayerList(players, state.room.host);
  if (state.screen === 'game') renderStatusDots(players);
});

// ── Host Changed ──────────────────────────────────────────
socket.on('host_changed', ({ newHostId }) => {
  state.room.host = newHostId;
  if (newHostId === socket.id) {
    state.isHost = true;
    $('host-settings').style.display = 'block';
    $('waiting-msg').style.display = 'none';
    $('host-controls').style.display = 'flex';
    toast('You are now the host!', 'success');
  }
  if (state.screen === 'lobby') renderPlayerList(state.room.players, newHostId);
});

// ── Settings Updated ──────────────────────────────────────
socket.on('settings_updated', ({ settings }) => {
  state.room.settings = settings;
  if (!state.isHost) toast(`Settings updated by host`);
});

// ── Kicked ───────────────────────────────────────────────
socket.on('kicked', ({ msg }) => {
  toast(msg, 'error');
  setTimeout(() => location.reload(), 2000);
});

// ── Game Started ──────────────────────────────────────────
socket.on('game_started', ({ settings }) => {
  state.room.settings = settings;
  state.timeLimit = settings.timeLimit;
  // Countdown
  showScreen('countdown');
  Sounds.start();
  let n = 3;
  $('countdown-num').textContent = n;
  const iv = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(iv); return; }
    $('countdown-num').style.animation = 'none';
    void $('countdown-num').offsetWidth;
    $('countdown-num').style.animation = 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    $('countdown-num').textContent = n;
    Sounds.countdown();
  }, 1000);
});

// ── Round Start ───────────────────────────────────────────
socket.on('round_start', ({ round, total, prompt, timeLimit, players }) => {
  state.currentRound = round;
  state.totalRounds = total;
  state.locked = false;
  state.wildcardUsed = false;

  const myPlayer = players.find(p => p.id === socket.id);
  state.hasWildcard = myPlayer ? myPlayer.hasWildcard : false;

  // Reset UI
  $('answer-input').value = '';
  $('answer-input').disabled = false;
  $('btn-lock').style.display = 'inline-flex';
  $('locked-msg').style.display = 'none';
  $('btn-wildcard').disabled = !state.hasWildcard;
  $('btn-wildcard').textContent = '⚡ Wildcard';

  // Set content
  $('game-round').textContent = round;
  $('game-total').textContent = total;
  $('game-category').textContent = CATEGORY_LABELS[state.room.settings.category] || '🌍 General';
  $('game-prompt').textContent = prompt;

  // Parse prefix for input context
  const { prefix } = parsePrompt(prompt);
  $('answer-prefix').textContent = prefix ? prefix + ' ' : '';

  renderStatusDots(players);

  // Timer
  clearInterval(state.timerInterval);
  state.timerTotal = timeLimit;
  state.timerRemaining = timeLimit;
  updateTimerUI(timeLimit, timeLimit);

  // Host controls
  $('host-controls').style.display = state.isHost ? 'flex' : 'none';

  showScreen('game');
  setTimeout(() => $('answer-input').focus(), 100);
});

// ── Timer Tick ────────────────────────────────────────────
socket.on('timer_tick', ({ remaining }) => {
  state.timerRemaining = remaining;
  updateTimerUI(remaining, state.timerTotal);
  if (remaining <= 5 && remaining > 0) Sounds.urgentTick();
  else if (remaining > 0) Sounds.tick();
});

socket.on('time_extended', ({ remaining }) => {
  state.timerRemaining = remaining;
  updateTimerUI(remaining, state.timerTotal);
  toast('+10 seconds added!', 'success');
});

// ── Answer Locked ─────────────────────────────────────────
socket.on('answer_locked', ({ playerId, players }) => {
  state.room.players = players;
  renderStatusDots(players);
  if (playerId !== socket.id) {
    const p = players.find(pl => pl.id === playerId);
    // subtle sound only if not me
  }
});

socket.on('wildcard_used', () => {
  state.wildcardUsed = true;
});

socket.on('player_used_wildcard', ({ name }) => {
  toast(`${name} used their Wildcard! ⚡`);
});

// ── Round Reveal ──────────────────────────────────────────
socket.on('round_reveal', ({ groups, scoreDeltas, players, prompt }) => {
  state.room.players = players;

  $('reveal-prompt').textContent = prompt;

  // Render groups
  const groupsEl = $('reveal-groups');
  groupsEl.innerHTML = '';
  groups.forEach((g, i) => {
    const card = document.createElement('div');
    card.className = `group-card${g.isWinner ? ' winner' : ''}`;
    card.style.animationDelay = (i * 0.12) + 's';
    card.innerHTML = `
      <div class="group-header">
        <div class="group-answer">${escHtml(g.answer)}</div>
        ${g.isWinner ? '<span class="group-winner-badge">✓ WIN</span>' : ''}
        <span class="group-count">${g.members.length} player${g.members.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="group-members">
        ${g.members.map(m => `
          <div class="group-member">
            <div class="mini-avatar pc-${m.colorIndex}" style="background:${playerColor(m.colorIndex)}">${escHtml(initials(m.name))}</div>
            ${escHtml(m.name)}
          </div>
        `).join('')}
      </div>
    `;
    groupsEl.appendChild(card);
  });

  // Scoreboard
  renderScoreList($('reveal-scores'), players, scoreDeltas);

  // Sound + floating scores
  const myDelta = scoreDeltas[socket.id] || 0;
  if (myDelta > 0) {
    Sounds.win();
    const lockBtn = $('btn-lock');
    if (lockBtn) {
      const rect = lockBtn.getBoundingClientRect();
      floatScore(myDelta, rect.left + rect.width / 2, rect.top);
    } else {
      floatScore(myDelta, window.innerWidth / 2, window.innerHeight / 2);
    }
  } else {
    Sounds.noMatch();
  }

  showScreen('reveal');
});

// ── Game Over ─────────────────────────────────────────────
socket.on('game_over', ({ finalScores, winner }) => {
  $('winner-name').textContent = winner ? `🎉 ${winner} wins!` : 'Great game!';

  // Podium
  const podiumEl = $('podium-area');
  const top3 = finalScores.slice(0, 3);
  const podiumOrder = top3.length >= 2
    ? [top3[1], top3[0], top3[2]].filter(Boolean) // 2nd, 1st, 3rd visual order
    : top3;
  const barClass = ['second', 'first', 'third'];

  podiumEl.innerHTML = podiumOrder.map((p, i) => {
    const rank = finalScores.indexOf(p) + 1;
    const medals = ['🥇','🥈','🥉'];
    return `
      <div class="podium-item">
        <span class="podium-medal">${medals[rank - 1] || ''}</span>
        <div class="podium-avatar pc-${p.colorIndex}" style="background:${playerColor(p.colorIndex)}">${escHtml(initials(p.name))}</div>
        <div class="podium-name">${escHtml(p.name)}</div>
        <div class="podium-score">${p.score} pts</div>
        <div class="podium-bar ${barClass[i]} pc-${p.colorIndex}" style="background:linear-gradient(180deg,${playerColor(p.colorIndex)},rgba(0,0,0,0.3))"></div>
      </div>
    `;
  }).join('');

  renderScoreList($('final-scores'), finalScores, null);

  if (state.isHost) $('btn-play-again').style.display = 'inline-flex';
  else $('btn-play-again').style.display = 'none';

  showScreen('results');
  launchConfetti();
  Sounds.win();
});

// ── Back to Lobby ─────────────────────────────────────────
socket.on('back_to_lobby', ({ room }) => {
  state.room = room;
  state.isHost = room.host === socket.id;
  $('lobby-code').textContent = room.code;
  renderPlayerList(room.players, room.host);
  renderSettings(room.settings);
  if (state.isHost) {
    $('host-settings').style.display = 'block';
    $('waiting-msg').style.display = 'none';
  } else {
    $('host-settings').style.display = 'none';
    $('waiting-msg').style.display = 'block';
  }
  showScreen('lobby');
  toast('Starting a new game!', 'success');
});

// ── Reactions ─────────────────────────────────────────────
socket.on('reaction', (data) => {
  showReaction(data);
});

// ── Chat ─────────────────────────────────────────────────
socket.on('chat_msg', (data) => {
  appendChat(data);
});

// ── Disconnect ────────────────────────────────────────────
socket.on('disconnect', () => {
  if (state.screen !== 'home') {
    toast('Disconnected from server. Refreshing…', 'error');
    setTimeout(() => location.reload(), 2500);
  }
});
