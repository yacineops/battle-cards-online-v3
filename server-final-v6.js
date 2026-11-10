// Battle Cards - Online Server V6 (final)
// - Keeps card revealed for everyone
// - Enforces turns
// - Unified timer (server-side)
// - If a player leaves, others can continue
// - Serves index.html if present, otherwise WS OK text
// Start Command on Render: node server-final-v6.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;
// ---------- Deck generation (same spirit as original game, 45 cards) ----------
let cardId = 1;
function mk(type, value, amount) {
return { id: cardId++, type, value: value ?? null, amount: amount ?? null, opened: false };
}
function makeDeck(level) {
cardId = 1;
let cards = [];
// points cards
const pointsVals = [1,1,1,3,3,3,5,5,5,10,10,10,-2,-2,-2,-5,-5,-5,-10,-10];
pointsVals.forEach(v => cards.push(mk('points', v)));
// specials - level 1 base
const specials = [
'nextLevel','reverse','reverse','skip','skip',
'steal','steal','shield','shield','replay',
'bomb','bomb','shuffle','reset','doubleChoice',
'exchange','resetShield','resetPlayer','exchangePlayers',
'bombShield','stealShield','reflect','doubleSelf','doubleTarget'
];
specials.forEach(t => {
let amt = null;
if (t === 'steal') amt = 3;
if (t === 'bomb') amt = 3;
cards.push(mk(t, null, amt));
});
// level 2+ extras
if (level >= 2) {
['freeze','stealAll','reverseBalances','shieldSteal','shieldReverse','shieldSkip','goldenShield','doubleChoice','randomBalances','bombAll','cancelShuffle','cancelReplay','randomPoints'].forEach(t => cards.push(mk(t)));
}
if (level >= 3) {
cards.push(mk('randomPoints'));
}
while (cards.length < 45) cards.push(mk('points', [1,3,5,-2][cards.length % 4]));
if (cards.length > 45) cards = cards.slice(0, 45);
// shuffle
for (let i = cards.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[cards[i], cards[j]] = [cards[j], cards[i]];
}
return cards;
}
function makePlayers(count) {
const names = ['اللاعب 1','اللاعب 2','اللاعب 3','اللاعب 4'];
return Array.from({length: count}, (_, i) => ({
id: i, name: names[i] || ('اللاعب ' + (i+1)),
score: 0, shield: 0, bombShield: 0, stealShield: 0, resetShield: 0,
reflect: 0, shieldReverse: 0, shieldSkip: 0, goldenShield: 0,
cancelShuffle: 0, cancelReplay: 0, freeze: 0,
connected: true, isBot: false
}));
}
// ---------- Rooms ----------
const rooms = new Map(); // code -> room
function makeRoom(code, maxPlayers) {
return {
code, maxPlayers, players: [], // {ws, slot, name, connected}
game: null, // {players, cards, level, direction, current, timer, started}
timerInterval: null,
};
}
function publicGameState(room) {
if (!room.game) return null;
return {
players: room.game.players,
cards: room.game.cards,
level: room.game.level,
direction: room.game.direction,
current: room.game.current,
timer: room.game.timer,
started: true,
};
}
function broadcast(room, obj) {
const msg = JSON.stringify(obj);
room.players.forEach(p => {
if (p.ws && p.ws.readyState === WebSocket.OPEN) {
try { p.ws.send(msg); } catch {}
}
});
}
function broadcastState(room) {
if (!room.game) return;
broadcast(room, { type: 'game_state', ...publicGameState(room) });
}
function stopTimer(room) {
if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
}
function startTimer(room) {
stopTimer(room);
if (!room.game) return;
room.game.timer = 30;
broadcast(room, { type: 'timer', timer: 30, current: room.game.current });
room.timerInterval = setInterval(() => {
if (!room.game) { stopTimer(room); return; }
room.game.timer -= 1;
if (room.game.timer <= 0) {
// time out -> skip turn (respect freeze in nextTurn)
room.game.timer = 30;
broadcast(room, { type: 'timeout', current: room.game.current, message: '⏱️ انتهى الوقت - تم تخطي الدور' });
advanceTurn(room, 1, 'timeout');
} else {
broadcast(room, { type: 'timer', timer: room.game.timer, current: room.game.current });
}
}, 1000);
}
// advanceTurn: steps=1 normal, steps=2 for skip card effect etc.
// handles freeze: if next player frozen, decrease freeze and skip again
function advanceTurn(room, steps = 1, reason = '') {
if (!room.game) return;
const g = room.game;
let cur = g.current;
let toAdvance = steps;
// we loop to handle freeze
for (let i = 0; i < 10; i++) {
// move `toAdvance` steps in direction
for (let s = 0; s < toAdvance; s++) {
cur = (cur + g.direction + g.players.length) % g.players.length;
}
toAdvance = 1; // after first move, further freeze-skips are 1 step
const p = g.players[cur];
if (p && p.freeze > 0) {
p.freeze -= 1;
broadcast(room, { type: 'frozen_skip', player: cur, name: p.name, message: `🧊 تم تخطي دور ${p.name} بسبب التجميد` });
// continue loop to move to next
continue;
}
// skip disconnected players - they don't block the game
if (p && !p.connected && g.players.filter(x => x.connected).length > 1) {
// skip disconnected, continue
continue;
}
break;
}
g.current = cur;
g.timer = 30;
broadcastState(room);
broadcast(room, { type: 'turn', current: cur });
}
function startGame(room) {
const count = room.players.length;
const players = makePlayers(count);
// keep names from room
room.players.forEach((rp, i) => { if (rp.name) players[i].name = rp.name; });
room.game = {
players,
cards: makeDeck(1),
level: 1,
direction: 1,
current: 0,
timer: 30,
started: true,
};
// tell each ws its slot (myIndex)
room.players.forEach((rp, i) => {
if (rp.ws && rp.ws.readyState === WebSocket.OPEN) {
rp.ws.send(JSON.stringify({ type: 'game_start', myIndex: i, ...publicGameState(room) }));
}
});
startTimer(room);
}
function checkAllOpened(room) {
if (!room.game) return;
if (room.game.cards.every(c => c.opened)) {
broadcast(room, { type: 'game_over', players: room.game.players });
stopTimer(room);
}
}
// ---------- HTTP (serve game if index.html exists) ----------
const server = http.createServer((req, res) => {
const url = req.url.split('?')[0];
if (url === '/' || url === '/index.html') {
const idx = path.join(__dirname, 'index.html');
if (fs.existsSync(idx)) {
res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
return res.end(fs.readFileSync(idx));
}
res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
return res.end('Battle Cards WS V6 OK - game file not found, upload index.html');
}
if (url === '/health' || url === '/ping') {
res.writeHead(200, { 'Content-Type': 'application/json' });
return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
}
res.writeHead(404, { 'Content-Type': 'text/plain' });
res.end('Not found');
});
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
let myRoom = null;
let mySlot = -1;
let myName = '';
ws.on('message', (raw) => {
let data;
try { data = JSON.parse(raw.toString()); } catch { return; }
const type = data.type;
// ---- create room ----
if (type === 'create_room' || type === 'create') {
const code = String(Math.floor(100000 + Math.random() * 900000));
const maxPlayers = data.maxPlayers || data.playerCount || 2;
const room = makeRoom(code, maxPlayers);
rooms.set(code, room);
myRoom = room; myName = data.name || 'اللاعب 1';
mySlot = 0;
room.players.push({ ws, slot: 0, name: myName, connected: true });
ws.send(JSON.stringify({ type: 'room_created', code, myIndex: 0, maxPlayers }));
return;
}
// ---- join room ----
if (type === 'join_room' || type === 'join') {
const code = String(data.code || '').trim();
const room = rooms.get(code);
if (!room) { ws.send(JSON.stringify({ type: 'error', message: 'الغرفة غير موجودة' })); return; }
if (room.game && room.game.started) { ws.send(JSON.stringify({ type: 'error', message: 'الجولة بدأت already' })); return; }
if (room.players.length >= room.maxPlayers) { ws.send(JSON.stringify({ type: 'error', message: 'الغرفة ممتلئة' })); return; }
myRoom = room; myName = data.name || ('اللاعب ' + (room.players.length + 1));
mySlot = room.players.length;
room.players.push({ ws, slot: mySlot, name: myName, connected: true });
ws.send(JSON.stringify({ type: 'room_joined', code, myIndex: mySlot, maxPlayers: room.maxPlayers, players: room.players.map(p => p.name) }));
broadcast(room, { type: 'player_joined', name: myName, count: room.players.length, maxPlayers: room.maxPlayers, players: room.players.map(p => p.name) });
// auto-start when full
if (room.players.length === room.maxPlayers) {
setTimeout(() => startGame(room), 500);
}
return;
}
// ---- start manually (host) ----
if (type === 'start_game') {
if (myRoom && myRoom.players.length >= 2 && !myRoom.game) startGame(myRoom);
return;
}
if (!myRoom) return;
const room = myRoom;
const g = room.game;
// ---- get state ----
if (type === 'get_state') {
if (g) ws.send(JSON.stringify({ type: 'game_state', myIndex: mySlot, ...publicGameState(room) }));
return;
}
// ---- chat ----
if (type === 'chat' || type === 'message') {
broadcast(room, { type: 'chat', name: myName, slot: mySlot, text: String(data.text || '').slice(0, 200) });
return;
}
if (!g) return;
// ---- pick card ----
if (type === 'pick_card' || type === 'card_picked' || type === 'pick') {
const idx = data.index ?? data.cardIndex ?? data.card_index;
if (typeof idx !== 'number' || idx < 0 || idx >= g.cards.length) return;
// TURN ENFORCEMENT: only current player can pick, unless it's doubleChoice/replay handled client-side but still current turn
if (mySlot !== g.current) {
ws.send(JSON.stringify({ type: 'error', message: 'ليس دورك' }));
return;
}
const card = g.cards[idx];
if (card.opened) {
ws.send(JSON.stringify({ type: 'error', message: 'البطاقة مكشوفة already' }));
return;
}
// 1) Mark opened - STAYS revealed for everyone because game_state always sends full cards array
card.opened = true;
broadcast(room, { type: 'card_revealed', index: idx, card, by: mySlot, current: g.current });
broadcast(room, { type: 'card_picked', index: idx, card, by: mySlot });
// reset timer for next turn? timer keeps running, but we broadcast state
// Note: client applies effect locally, then sends effect_done / apply_effect
// For simple effects (points) server applies directly if client sends apply_effect
// If client doesn't send apply, we still advance after short delay? No - wait for client apply_effect or target.
// To keep game moving even if client forgets, we set a 5s fallback? We do NOT auto-advance here.
// The client must send 'effect_done' or 'target' or 'next_turn'
return;
}
// ---- apply effect (score / shields / etc.) ----
// Client sends the resulting players array or a delta, server validates and broadcasts as truth
if (type === 'apply_effect' || type === 'effect' || type === 'update_players') {
if (Array.isArray(data.players)) {
// keep connected flags, apply scores/shields/freeze from client (trusted for now, same logic as local)
g.players = data.players.map((p, i) => ({ ...g.players[i], ...p, connected: g.players[i]?.connected ?? true }));
}
if (typeof data.direction === 'number') g.direction = data.direction;
if (typeof data.level === 'number' && data.level !== g.level) {
g.level = data.level;
g.cards = makeDeck(data.level);
g.players.forEach(p => { p.shield=0; p.bombShield=0; p.stealShield=0; p.resetShield=0; p.reflect=0; p.shieldReverse=0; p.shieldSkip=0; p.goldenShield=0; p.cancelShuffle=0; p.cancelReplay=0; p.freeze=0; });
broadcast(room, { type: 'level_changed', level: g.level, ...publicGameState(room) });
startTimer(room);
return;
}
broadcastState(room);
return;
}
// ---- target selected (steal/bomb/freeze/...) ----
if (type === 'target' || type === 'target_selected' || type === 'choose_target') {
broadcast(room, { type: 'target_selected', by: mySlot, target: data.target ?? data.index, cardType: data.cardType || data.card_type });
return;
}
// ---- shuffle / next level request ----
if (type === 'shuffle' || type === 'cards_shuffled') {
g.cards = makeDeck(g.level);
broadcast(room, { type: 'cards_shuffled', ...publicGameState(room) });
return;
}
if (type === 'next_level' || type === 'level_up') {
g.level = Math.min(3, g.level + 1);
g.cards = makeDeck(g.level);
g.players.forEach(p => { p.shield=0; p.bombShield=0; p.stealShield=0; p.resetShield=0; p.reflect=0; p.shieldReverse=0; p.shieldSkip=0; p.goldenShield=0; p.cancelShuffle=0; p.cancelReplay=0; p.freeze=0; });
broadcast(room, { type: 'level_changed', level: g.level, ...publicGameState(room) });
startTimer(room);
return;
}
// ---- next turn (after effect applied) ----
if (type === 'next_turn' || type === 'effect_done' || type === 'end_turn') {
const steps = data.steps || data.skip || 1;
// if client already updated players, apply them
if (Array.isArray(data.players)) {
g.players = data.players.map((p, i) => ({ ...g.players[i], ...p }));
}
if (typeof data.direction === 'number') g.direction = data.direction;
advanceTurn(room, steps, 'effect_done');
checkAllOpened(room);
return;
}
// ---- skip turn explicitly ----
if (type === 'skip_turn') {
advanceTurn(room, 1, 'skip');
return;
}
});
ws.on('close', () => {
if (!myRoom) return;
const room = myRoom;
const p = room.players.find(x => x.slot === mySlot);
if (p) p.connected = false;
if (room.game) {
const gp = room.game.players[mySlot];
if (gp) gp.connected = false;
broadcast(room, { type: 'player_left', slot: mySlot, name: myName, message: `${myName} خرج - تكمل الجولة بالباقي` });
// If it was his turn, pass turn so game doesn't freeze
if (room.game.current === mySlot) {
setTimeout(() => advanceTurn(room, 1, 'player_left'), 500);
} else {
broadcastState(room);
}
// If only 0 connected, stop timer and delete room after a while
if (room.game.players.every(x => !x.connected)) {
stopTimer(room);
setTimeout(() => { if (room.game && room.game.players.every(x => !x.connected)) rooms.delete(room.code); }, 30000);
}
} else {
// lobby: remove player
room.players = room.players.filter(x => x.slot !== mySlot);
broadcast(room, { type: 'player_left', slot: mySlot, name: myName });
if (room.players.length === 0) rooms.delete(room.code);
}
});
ws.on('error', () => {});
});
server.listen(PORT, () => {
console.log(`Battle Cards WS V6 listening on ${PORT}`);
});
