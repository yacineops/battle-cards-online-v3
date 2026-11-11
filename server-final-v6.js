// server-final-v6.js - V9 - غرف 2 / 3 / 4 + بحث حسب العدد
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(__dirname, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

// rooms: code -> { code, maxPlayers, players: [] }
// queue: { "2": [ws], "3": [ws], "4": [ws] } - طابور منفصل لكل عدد
const rooms = new Map();
const queues = { "2": [], "3": [], "4": [] };

function send(ws, obj) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (e) {}
}
function broadcast(room, obj, exceptWs) {
  room.players.forEach((p) => { if (p !== exceptWs) send(p, obj); });
}
function makeCode() {
  let code = "";
  do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(code));
  return code;
}
function normCount(n) {
  n = parseInt(n, 10);
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 2;
}
function removeFromAllQueues(ws) {
  ["2","3","4"].forEach((k) => { queues[k] = queues[k].filter((p) => p !== ws); });
}
function removeFromRoom(ws) {
  if (!ws._roomCode) return;
  const room = rooms.get(ws._roomCode);
  if (!room) return;
  room.players = room.players.filter((p) => p !== ws);
  if (room.players.length === 0) {
    rooms.delete(ws._roomCode);
  } else {
    broadcast(room, { type: "room_update", code: room.code, players: room.players.length, count: room.players.length, maxPlayers: room.maxPlayers });
    broadcast(room, { type: "player_left", code: room.code, players: room.players.length, maxPlayers: room.maxPlayers });
  }
  ws._roomCode = null;
}
function tryMatch(maxPlayers) {
  const q = queues[String(maxPlayers)];
  // لا نجمع إلا عندما يكتمل العدد المطلوب
  while (q.length >= maxPlayers) {
    const players = [];
    while (players.length < maxPlayers && q.length > 0) {
      const p = q.shift();
      if (p.readyState === 1) players.push(p);
    }
    if (players.length < maxPlayers) {
      // نرجع الباقي للطابور إذا لم يكتمل العدد
      players.forEach((p) => q.unshift(p));
      break;
    }
    const code = makeCode();
    const room = { code, maxPlayers, players };
    rooms.set(code, room);
    players.forEach((p) => { p._roomCode = code; });
    const msg = { type: "match_found", code, players: players.length, count: players.length, maxPlayers };
    players.forEach((p) => send(p, msg));
    players.forEach((p) => send(p, { type: "joined", code, players: players.length, count: players.length, maxPlayers }));
    console.log("MATCH " + maxPlayers + " players:", code);
  }
}

wss.on("connection", (ws) => {
  ws._roomCode = null;
  ws._name = "اللاعب 1";
  ws._wantedCount = 2;

  ws.on("message", (raw) => {
    let d;
    try { d = JSON.parse(raw.toString()); } catch (e) { return; }
    const type = (d.type || "").toLowerCase();
    if (d.name) ws._name = String(d.name).slice(0, 20);
    const wanted = normCount(d.maxPlayers || d.playerCount || d.count || d.players || 2);

    // ---------- إنشاء غرفة بعدد يختاره اللاعب ----------
    if (type === "create" || type === "create_room") {
      removeFromAllQueues(ws);
      removeFromRoom(ws);
      const maxPlayers = wanted;
      const code = makeCode();
      const room = { code, maxPlayers, players: [ws] };
      rooms.set(code, room);
      ws._roomCode = code;
      ws._wantedCount = maxPlayers;
      send(ws, { type: "room_created", code, players: 1, count: 1, maxPlayers });
      console.log("CREATE:", code, "max:", maxPlayers);
      return;
    }

    // ---------- دخول لغرفة ----------
    if (type === "join") {
      const code = String(d.code || d.roomCode || "").trim();
      removeFromAllQueues(ws);
      const room = rooms.get(code);
      if (!room) { send(ws, { type: "error", message: "الغرفة غير موجودة - تأكد من الرقم" }); return; }
      if (room.players.length >= room.maxPlayers) { send(ws, { type: "error", message: "الغرفة ممتلئة - " + room.maxPlayers + " / " + room.maxPlayers }); return; }
      removeFromRoom(ws);
      room.players.push(ws);
      ws._roomCode = code;
      send(ws, { type: "joined", code, players: room.players.length, count: room.players.length, maxPlayers: room.maxPlayers });
      broadcast(room, { type: "player_joined", code, players: room.players.length, count: room.players.length, maxPlayers: room.maxPlayers }, ws);
      broadcast(room, { type: "room_update", code, players: room.players.length, count: room.players.length, maxPlayers: room.maxPlayers }, ws);
      console.log("JOIN:", code, room.players.length + "/" + room.maxPlayers);
      return;
    }

    // ---------- بحث عن لاعبين حسب العدد المختار ----------
    if (type === "quick_play" || type === "find_match" || type === "search" || type === "matchmaking") {
      removeFromRoom(ws);
      removeFromAllQueues(ws);
      const maxPlayers = wanted;
      ws._wantedCount = maxPlayers;
      const q = queues[String(maxPlayers)];
      if (!q.includes(ws)) q.push(ws);
      send(ws, { type: "searching", maxPlayers, message: "جاري البحث عن " + maxPlayers + " لاعبين..." });
      console.log("SEARCH for " + maxPlayers + " - queue:", q.length);
      tryMatch(maxPlayers);
      return;
    }

    if (type === "cancel_search" || type === "stop_search") {
      removeFromAllQueues(ws);
      send(ws, { type: "search_cancelled" });
      return;
    }

    if (type === "start") {
      const room = rooms.get(ws._roomCode);
      if (room) broadcast(room, { type: "game_started", code: room.code, maxPlayers: room.maxPlayers });
      send(ws, { type: "game_started", code: ws._roomCode });
      return;
    }

    if (type === "leave") {
      removeFromAllQueues(ws);
      removeFromRoom(ws);
      send(ws, { type: "left" });
      return;
    }

    if (type === "game" || type === "move" || type === "play_card") {
      const room = rooms.get(ws._roomCode);
      if (room) broadcast(room, d, ws);
      return;
    }
  });

  ws.on("close", () => {
    removeFromAllQueues(ws);
    removeFromRoom(ws);
  });
});

server.listen(PORT, () => {
  console.log("WS V9 - 2/3/4 players - listening on " + PORT);
});
