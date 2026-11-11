const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;

// 1. سيرفر يبعث صفحة اللعبة
const server = http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url;
  let filePath = path.join(__dirname, file);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    if (file.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    else if (file.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    else res.setHeader('Content-Type', 'text/html');
    res.end(data);
  });
});

// 2. WebSocket على نفس السيرفر
const wss = new WebSocket.Server({ server });

let rooms = {};
let queue = [];

function send(ws, obj){ try{ ws.send(JSON.stringify(obj)); }catch{} }
function makeCode(){ return String(Math.floor(100000 + Math.random()*900000)); }

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try{ msg = JSON.parse(raw); }catch{ return; }

    if(msg.type === 'create_room'){
      let code = makeCode();
      while(rooms[code]) code = makeCode();
      rooms[code] = { players: [{ ws, name: msg.name || 'اللاعب 1' }], maxPlayers: msg.maxPlayers || 2 };
      ws.roomCode = code;
      send(ws, { type: 'room_created', code });
    }

    if(msg.type === 'join_room'){
      let room = rooms[msg.code];
      if(!room){ send(ws, { type: 'error', message: 'الغرفة غير موجودة' }); return; }
      if(room.players.length >= room.maxPlayers){ send(ws, { type: 'error', message: 'الغرفة ممتلئة' }); return; }
      room.players.push({ ws, name: msg.name || 'لاعب' });
      ws.roomCode = msg.code;
      room.players.forEach(p => send(p.ws, {
        type: 'room_update',
        code: msg.code,
        players: room.players.map(p => p.name),
        count: room.players.length,
        max: room.maxPlayers
      }));
      if(room.players.length === room.maxPlayers){
        room.players.forEach(p => send(p.ws, { type: 'game_start', code: msg.code, players: room.players.map(p => p.name) }));
      }
    }

    if(msg.type === 'find_match'){
      ws.playerName = msg.name || 'لاعب';
      ws.wantPlayers = msg.maxPlayers || 2;
      queue = queue.filter(p => p.ws !== ws && p.ws.readyState === 1);
      let mate = queue.find(p => p.wantPlayers === ws.wantPlayers);
      if(!mate){ queue.push({ ws, name: ws.playerName, wantPlayers: ws.wantPlayers }); send(ws, { type: 'searching' }); return; }
      queue = queue.filter(p => p.ws !== mate.ws);
      let code = makeCode();
      rooms[code] = { players: [{ ws: mate.ws, name: mate.name }, { ws, name: ws.playerName }], maxPlayers: ws.wantPlayers };
      [mate.ws, ws].forEach(s => { s.roomCode = code; send(s, { type: 'match_found', code, players: rooms[code].players.map(p => p.name) }); });
    }
  });

  ws.on('close', () => {
    queue = queue.filter(p => p.ws !== ws);
    if(ws.roomCode && rooms[ws.roomCode]){
      rooms[ws.roomCode].players = rooms[ws.roomCode].players.filter(p => p.ws !== ws);
      if(rooms[ws.roomCode].players.length === 0) delete rooms[ws.roomCode];
    }
  });
});

server.listen(PORT, () => {
  console.log('WS V7 + GAME listening on ' + PORT);
});
