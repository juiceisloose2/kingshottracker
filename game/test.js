/* Quick functional test — simulates 3 players through a full game */
const { io } = require('socket.io-client');

const URL = 'http://localhost:3001';
const log = (...a) => console.log('[TEST]', ...a);
let passed = 0, failed = 0;

function ok(label, val) {
  if (val) { log(`✅  ${label}`); passed++; }
  else      { log(`❌  ${label}`); failed++; }
}

function connect() { return io(URL, { forceNew: true }); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Promise that resolves on first of several socket events
function firstOf(socket, ...events) {
  return new Promise(resolve => {
    const cleanup = [];
    events.forEach(ev => {
      const h = (data) => {
        cleanup.forEach(({ e, fn }) => socket.off(e, fn));
        resolve({ event: ev, data });
      };
      socket.on(ev, h);
      cleanup.push({ e: ev, fn: h });
    });
  });
}

function onEvent(socket, event) {
  return new Promise(resolve => socket.once(event, resolve));
}

async function run() {
  const host = connect();
  const p2   = connect();
  const p3   = connect();
  await wait(400);

  let roomCode;

  // ── Test 1: Create Room ──────────────────────────────────────────────
  log('--- Test: Create Room ---');
  const created = await onEvent(host, 'room_created', host.emit('create_room', {
    name: 'Alice',
    settings: { rounds: 2, timeLimit: 5, category: 'general' }
  }));

  ok('Room created with 4-char code', created.code && created.code.length === 4);
  ok('Host in player list', created.room.players.length === 1);
  ok('Host name correct', created.room.players[0].name === 'Alice');
  roomCode = created.code;
  log(`Room code: ${roomCode}`);

  // ── Test 2: Join Room ────────────────────────────────────────────────
  log('--- Test: Join Room ---');
  const [joined2, joined3] = await Promise.all([
    onEvent(p2, 'room_joined'),
    onEvent(p3, 'room_joined'),
    new Promise(r => { p2.emit('join_room', { name: 'Bob', code: roomCode }); r(); }),
    new Promise(r => { p3.emit('join_room', { name: 'Carol', code: roomCode }); r(); })
  ]);
  ok('Bob joined successfully', !!joined2);
  // joined3 has the final state after both have joined
  ok('3 players in room', joined3.room.players.length === 3);

  // ── Test 3: Validation ──────────────────────────────────────────────
  log('--- Test: Validation ---');
  const dupErr = await new Promise(r => {
    p2.once('error', r);
    p2.emit('join_room', { name: 'Bob', code: roomCode });
  });
  ok('Duplicate name rejected', dupErr.msg.toLowerCase().includes('taken'));

  const noRoomErr = await new Promise(r => {
    p2.once('error', r);
    p2.emit('join_room', { name: 'Zara', code: 'XXXX' });
  });
  ok('Invalid code rejected', noRoomErr.msg.toLowerCase().includes('not found'));

  const notHostErr = await new Promise(r => {
    p2.once('error', r);
    p2.emit('start_game');
  });
  ok('Non-host start rejected', notHostErr.msg.toLowerCase().includes('host'));

  // ── Test 4: Start Game ──────────────────────────────────────────────
  log('--- Test: Start Game ---');
  const [gs1, gs2, gs3] = await Promise.all([
    onEvent(host, 'game_started'),
    onEvent(p2, 'game_started'),
    onEvent(p3, 'game_started'),
    new Promise(r => { host.emit('start_game'); r(); })
  ]);
  ok('All 3 players got game_started', !!gs1 && !!gs2 && !!gs3);
  ok('Settings in game_started', gs1.settings.rounds >= 2);

  // ── Test 5: Round 1 ────────────────────────────────────────────────
  log('--- Test: Round 1 ---');
  const [r1] = await Promise.all([
    onEvent(host, 'round_start'),
    onEvent(p2, 'round_start'),
    onEvent(p3, 'round_start')
  ]);
  ok('Round start received', r1.round === 1);
  ok('Prompt is a string', typeof r1.prompt === 'string' && r1.prompt.includes('___'));
  ok('Timer set', r1.timeLimit >= 5);
  log(`Prompt: "${r1.prompt}"`);

  // Alice and Bob submit same answer, Carol submits different
  host.emit('submit_answer', { answer: 'storm' });
  p2.emit('submit_answer', { answer: 'storm' });
  p3.emit('submit_answer', { answer: 'bird' });

  // Wait for round reveal
  const rev1 = await onEvent(host, 'round_reveal');
  ok('Round reveal has groups', Array.isArray(rev1.groups) && rev1.groups.length >= 1);

  const winGrp = rev1.groups.find(g => g.isWinner);
  ok('Winner group exists', !!winGrp);
  ok('storm group wins (2 players)', winGrp && winGrp.answer === 'storm' && winGrp.members.length === 2);

  ok('Alice +1 for matching', (rev1.scoreDeltas[host.id] || 0) >= 1);
  ok('Carol 0 for no match', (rev1.scoreDeltas[p3.id] || 0) === 0);
  log('Round 1 scores:', JSON.stringify(rev1.scoreDeltas));

  // ── Test 6: Round 2 ────────────────────────────────────────────────
  log('--- Test: Round 2 (waiting ~6s for auto-advance) ---');
  const [r2] = await Promise.all([
    onEvent(host, 'round_start'),
    onEvent(p2, 'round_start'),
    onEvent(p3, 'round_start')
  ]);
  ok('Round 2 starts', r2.round === 2);
  log(`Round 2 prompt: "${r2.prompt}"`);

  // All three match → everyone scores
  host.emit('submit_answer', { answer: 'works' });
  p2.emit('submit_answer', { answer: 'works' });
  p3.emit('submit_answer', { answer: 'works' });

  const rev2 = await onEvent(host, 'round_reveal');
  const winGrp2 = rev2.groups.find(g => g.isWinner);
  ok('All-match: winner group has 3', winGrp2 && winGrp2.members.length === 3);
  ok('Carol now +1 (matched in round 2)', (rev2.scoreDeltas[p3.id] || 0) >= 1);

  // ── Test 7: Game Over ───────────────────────────────────────────────
  log('--- Test: Game Over (waiting ~6s) ---');
  const go = await onEvent(host, 'game_over');
  ok('Game over received', !!go.finalScores);
  ok('Final scores array', Array.isArray(go.finalScores) && go.finalScores.length === 3);
  ok('Winner declared', !!go.winner);
  log(`Winner: ${go.winner}`);
  log('Final scores:', go.finalScores.map(p => `${p.name}: ${p.score}`).join(', '));

  // ── Test 8: Play Again ──────────────────────────────────────────────
  log('--- Test: Play Again ---');
  const lobby = await new Promise(r => {
    host.once('back_to_lobby', r);
    host.emit('play_again');
  });
  ok('Back to lobby', lobby.room.state === 'lobby');
  ok('Scores reset', lobby.room.players.every(p => p.score === 0));
  ok('Wildcards reset', lobby.room.players.every(p => p.hasWildcard === true));

  // ── Test 9: Wildcard ────────────────────────────────────────────────
  log('--- Test: Wildcard (starting new game) ---');
  await Promise.all([
    onEvent(host, 'game_started'),
    onEvent(p2, 'game_started'),
    onEvent(p3, 'game_started'),
    new Promise(r => { host.emit('start_game'); r(); })
  ]);
  await onEvent(host, 'round_start');

  // Carol submits 'solo', then uses wildcard — host+p2 submit matching
  p3.emit('submit_answer', { answer: 'solo' });
  p3.emit('use_wildcard');
  host.emit('submit_answer', { answer: 'fire' });
  p2.emit('submit_answer', { answer: 'fire' });

  const wcUsed = await onEvent(p3, 'wildcard_used');
  ok('Wildcard acknowledgement sent', wcUsed !== undefined);

  const revWC = await onEvent(host, 'round_reveal');
  ok('Wildcard round revealed', !!revWC);
  // Carol should be moved into fire group
  const fireGrp = revWC.groups.find(g => g.answer === 'fire');
  const carolInFire = fireGrp && fireGrp.members.some(m => m.id === p3.id);
  ok('Wildcard player moved to winning group', carolInFire);
  ok('Wildcard player scores point', (revWC.scoreDeltas[p3.id] || 0) >= 1);

  // ── Test 10: Disconnect handling ────────────────────────────────────
  log('--- Test: Disconnect ---');
  const leftProm = onEvent(host, 'player_left');
  p3.disconnect();
  const leftEvent = await leftProm;
  ok('player_left emitted on disconnect', !!leftEvent.playerId);
  ok('Room still has 2 players', leftEvent.players.length === 2);

  // ── Cleanup ──────────────────────────────────────────────────────────
  host.disconnect();
  p2.disconnect();
  await wait(200);

  log('═══════════════════════════════════');
  log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test error:', err.message || err);
  process.exit(1);
});
