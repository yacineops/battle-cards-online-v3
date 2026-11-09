// Battle Cards - Server V2 - Shared Deck + Server Authoritative Scores + 25s Timer
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
// --- Serve index.html ---
const server = http.createServer((req, res) => {
if (req.url === '/' || req.url === '/index.html') {
fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
if (err) { res.writeHead(500); res.end('index.html not found'); return; }
res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
res.end(data);
});
return;
}
res.writeHead(404); res.end('Not found');
});
const wss = new WebSocket.Server({ server });
// --- State ---
let nextId = 1;
const rooms = new Map(); // code -> room
const waitingQueue = []; // {ws, need}
let waitingTimer = null;
function send(ws, obj) {
if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj, exceptWs = null) {
room.players.forEach(p => {
if (p.ws && p.ws !== exceptWs) send(p.ws, obj);
});
}
function makeCode() {
let c;
do { c = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(c));
return c;
}
function makeDeck() {
const deck = Array.from({ length: 45 }, (_, i) => i);
for (let i = deck.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[deck[i], deck[j]] = [deck[j], deck[i]];
}
return deck;
}
function playersPayload(room) {
return room.players.map(p => ({ id: p.id, name: p.name, score: room.scores[p.id] || 0 }));
}
function clearTimer(room) { if (room.timer) { clearInterval(room.timer); room.timer = null; } }
// FIXED: unified timer - broadcasts countdown every second to ALL players
function startTimer(room) {
clearTimer(room);
room.timeLeft = 25;
broadcast(room, { type: 'timer', seconds: 25, currentPlayer: room.currentPlayer + 1, players: playersPayload(room) });
room.timer = setInterval(() => {
if (!room.started) { clearTimer(room); return; }
room.timeLeft -= 1;
broadcast(room, { type: 'timer', seconds: room.timeLeft, currentPlayer: room.currentPlayer + 1, players: playersPayload(room) });
if (room.timeLeft <= 0) {
room.currentPlayer = (room.currentPlayer + 1) % room.players.length;
room.timeLeft = 25;
broadcast(room, { type: 'turn_skipped', currentPlayer: room.currentPlayer + 1, players: playersPayload(room) });
broadcast(room, { type: 'game_state', currentPlayer: room.currentPlayer + 1, players: playersPayload(room), deck: room.deck });
broadcast(room, { type: 'timer', seconds: 25, currentPlayer: room.currentPlayer + 1, players: playersPayload(room) });
}
}, 1000);
}
function startGame(room) {
room.started = true;
room.deck = makeDeck(); // ONE deck for everyone
room.scores = {};
room.players.forEach(p => { room.scores[p.id] = 0; });
room.currentPlayer = 0;
room.openedCount = 0;
room.timeLeft = 25;
room._lastPickKey = null;
// Send deck FIRST, then matched
broadcast(room, { type: 'deck_sync', deck: room.deck });
setTimeout(() => {
broadcast(room, {
type: 'matched',
players: playersPayload(room),
currentPlayer: 1,
deck: room.deck
});
startTimer(room);
}, 150);
}
function removeFromQueue(ws) {
const i = waitingQueue.findIndex(e => e.ws === ws);
if (i !== -1) waitingQueue.splice(i, 1);
}
function tryMatch() {
// Group by need
for (let need of [2, 3, 4]) {
const group = waitingQueue.filter(e => e.need === need);
if (group.length >= need) {
const picked = group.slice(0, need);
picked.forEach(e => removeFromQueue(e.ws));
const code = makeCode();
const room = { code, players: [], need, started: false, scores: {}, currentPlayer: 0, deck: null, timer: null, openedCount: 0, timeLeft: 25, _lastPickKey: null };
rooms.set(code, room);
picked.forEach(e => {
const p = { id: nextId++, name: e.name || ('لاعب ' + (room.players.length + 1)), ws: e.ws };
room.players.push(p);
e.ws._room = room;
e.ws._playerId = p.id;
});
startGame(room);
return;
}
}
}
wss.on('connection', (ws) => {
ws._playerId = null;
ws._room = null;
ws.on('message', (raw) => {
let data;
try { data = JSON.parse(raw); } catch { return; }
// --- Find match ---
if (data.type === 'find_match') {
removeFromQueue(ws);
waitingQueue.push({ ws, need: data.need || 2, name: data.name || 'لاعب' });
// Tell waiting counts
const count = waitingQueue.filter(e => e.need === (data.need || 2)).length;
waitingQueue.filter(e => e.need === (data.need || 2)).forEach(e => {
send(e.ws, { type: 'waiting', count, need: data.need || 2 });
});
tryMatch();
return;
}
// --- Create room ---
if (data.type === 'create_room') {
const code = makeCode();
const room = { code, players: [], need: data.need || 2, started: false, scores: {}, currentPlayer: 0, deck: null, timer: null, openedCount: 0, timeLeft: 25, _lastPickKey: null };
rooms.set(code, room);
const p = { id: nextId++, name: data.name || 'لاعب 1', ws };
room.players.push(p);
ws._room = room; ws._playerId = p.id;
send(ws, { type: 'room_created', code, players: playersPayload(room), need: room.need });
return;
}
// --- Join room ---
if (data.type === 'join_room') {
const room = rooms.get(String(data.code));
if (!room) { send(ws, { type: 'error', message: 'الغرفة غير موجودة' }); return; }
if (room.started) { send(ws, { type: 'error', message: 'الجولة بدأت بالفعل' }); return; }
if (room.players.length >= room.need) { send(ws, { type: 'error', message: 'الغرفة ممتلئة' }); return; }
const p = { id: nextId++, name: data.name || ('لاعب ' + (room.players.length + 1)), ws };
room.players.push(p);
ws._room = room; ws._playerId = p.id;
broadcast(room, { type: 'player_joined', players: playersPayload(room), count: room.players.length, need: room.need });
send(ws, { type: 'joined_room', code: room.code, players: playersPayload(room), count: room.players.length, need: room.need });
if (room.players.length === room.need) startGame(room);
return;
}
// --- Request deck (if client missed it) ---
if (data.type === 'request_deck') {
const room = ws._room;
if (room && room.deck) send(ws, { type: 'deck_sync', deck: room.deck });
return;
}
// --- Pick card - FIXED: single source, advances turn immediately ---
if (data.type === 'pick_card') {
const room = ws._room; if (!room || !room.started) return;
// Ignore duplicate pick for same turn (same card, same player)
const pickKey = room.currentPlayer + ':' + data.cardIndex + ':' + ws._playerId;
if (room._lastPickKey === pickKey) return;
room._lastPickKey = pickKey;
// Save scores sent by picker (after effect). Scores array is in players order.
if (Array.isArray(data.scores)) {
room.players.forEach((pl, idx) => { room.scores[pl.id] = data.scores[idx] || 0; });
}
broadcast(room, {
type: 'card_picked',
player: ws._playerId,
cardIndex: data.cardIndex,
cardId: data.cardId,
players: playersPayload(room)
});
// Advance turn HERE - only place that advances on pick
room.currentPlayer = (room.currentPlayer + 1) % room.players.length;
room.openedCount = (room.openedCount || 0) + 1;
broadcast(room, {
type: 'game_state',
currentPlayer: room.currentPlayer + 1,
players: playersPayload(room),
deck: room.deck
});
startTimer(room);
return;
}
// --- Score sync - FIXED: only updates scores, does NOT advance turn (pick_card already did) ---
if (data.type === 'score_sync') {
const room = ws._room; if (!room) return;
if (Array.isArray(data.scores)) {
room.players.forEach((pl, idx) => { room.scores[pl.id] = data.scores[idx] || 0; });
}
// Do NOT advance turn here - pick_card already advanced it. Just rebroadcast scores.
broadcast(room, {
type: 'game_state',
currentPlayer: room.currentPlayer + 1,
players: playersPayload(room),
deck: room.deck
});
return;
}
// --- Target pick (steal/bomb etc) - just relay ---
if (data.type === 'target_pick') {
const room = ws._room; if (!room) return;
broadcast(room, { type: 'target_picked', player: ws._playerId, target: data.target }, ws);
return;
}
// --- Chat ---
if (data.type === 'chat') {
const room = ws._room; if (!room) return;
broadcast(room, { type: 'chat', player: ws._playerId, text: data.text }, ws);
return;
}
// --- Cancel search ---
if (data.type === 'cancel_search') {
removeFromQueue(ws);
return;
}
// --- Leave room / game ---
if (data.type === 'leave_room' || data.type === 'leave_game') {
const room = ws._room;
if (room) {
room.players = room.players.filter(p => p.ws !== ws);
if (room.players.length === 0) { clearTimer(room); rooms.delete(room.code); }
else broadcast(room, { type: 'player_left', players: playersPayload(room) });
}
removeFromQueue(ws);
ws._room = null;
return;
}
// --- Game over ---
if (data.type === 'game_over') {
const room = ws._room; if (!room) return;
clearTimer(room);
broadcast(room, { type: 'game_over', winner: data.winner, players: playersPayload(room) });
room.started = false;
return;
}
});
ws.on('close', () => {
removeFromQueue(ws);
const room = ws._room;
if (room) {
room.players = room.players.filter(p => p.ws !== ws);
if (room.players.length === 0) { clearTimer(room); rooms.delete(room.code); }
else broadcast(room, { type: 'player_left', players: playersPayload(room) });
}
});
// Keep alive for Render (prevent idle close)
const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); }, 25000);
ws.on('close', () => clearInterval(ping));
});
server.listen(PORT, () => console.log('Battle Cards server on ' + PORT));
