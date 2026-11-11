const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url;
  let filePath = path.join(__dirname, file);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    if (file.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    else if (file.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    else res.setHeader('Content-Type', 'text/html');
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
let rooms = {};
let queue = [];

function send(ws, o){ try{ ws.send(JSON.stringify(o)); }catch{} }
function makeCode(){ return String(Math.floor(100000 + Math.random()*900000)); }
function broadcast(room, o, except=null){
  room.players.forEach(p => { if(p.ws !== except) send(p.ws, o); });
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m;
    try{ m = JSON.parse(raw); }catch{ return; }

    if(m.type === 'create_room'){
      let code = makeCode();
      while(rooms[code]) code = makeCode();
      rooms[code] = { players: [{ ws, name: m.name || 'اللاعب 1' }], maxPlayers: m.maxPlayers || 2 };
      ws.roomCode = code;
      ws.myIndex = 0;
      send(ws, { type: 'room_created', code, myIndex: 0 });
      console.log('ROOM CREATED', code);
    }

    if(m.type === 'join_room'){
      let room = rooms[m.code];
      if(!room){ send(ws, { type: 'error', message: 'الغرفة غير موجودة' }); return; }
      if(room.players.length >= room.maxPlayers){ send(ws, { type: 'error', message: 'الغرفة ممتلئة' }); return; }
      let myIndex = room.players.length;
      room.players.push({ ws, name: m.name || 'لاعب' });
      ws.roomCode = m.code;
      ws.myIndex = myIndex;
      // للاعب اللي دخل جديد
      send(ws, { type: 'room_joined', code: m.code, myIndex, players: room.players.map(p => p.name) });
      // للاعبين القدام
      broadcast(room, { type: 'room_joined', code: m.code, players: room.players.map(p => p.name), newPlayer: m.name, newIndex: myIndex }, ws);
      // إذا اكتمل العدد
      if(room.players.length === room.maxPlayers){
        broadcast(room, { type: 'game_start', code: m.code, players: room.players.map(p => p.name) });
      }
    }

    // هاذو هوما اللي كانو ناقصين
    if(m.type === 'pick_card'){
      let room = rooms[ws.roomCode];
      if(!room) return;
      broadcast(room, { type: 'pick_card', index: m.index, from: ws.myIndex }, ws);
    }
    if(m.type === 'apply_effect'){
      let room = rooms[ws.roomCode];
      if(!room) return;
      broadcast(room, { type: 'apply_effect', players: m.players, direction: m.direction, from: ws.myIndex }, ws);
    }
    if(m.type === 'next_turn'){
      let room = rooms[ws.roomCode];
      if(!room) return;
      broadcast(room, { type: 'next_turn', steps: m.steps, players: m.players, direction: m.direction, from: ws.myIndex }, ws);
    }

    if(m.type === 'find_match'){
      ws.playerName = m.name || 'لاعب';
      ws.wantPlayers = m.maxPlayers || 2;
      queue = queue.filter(p => p.ws !== ws && p.ws.readyState === 1);
      let mate = queue.find(p => p.wantPlayers === ws.wantPlayers);
      if(!mate){ queue.push({ ws, name: ws.playerName, wantPlayers: ws.wantPlayers }); send(ws, { type: 'searching' }); return; }
      queue = queue.filter(p => p.ws !== mate.ws);
      let code = makeCode();
      rooms[code] = { players: [{ ws: mate.ws, name: mate.name }, { ws, name: ws.playerName }], maxPlayers: ws.wantPlayers };
      mate.ws.roomCode = code; mate.ws.myIndex = 0;
      ws.roomCode = code; ws.myIndex = 1;
      send(mate.ws, { type: 'match_found', code, myIndex: 0, players: rooms[code].players.map(p => p.name) });
      send(ws, { type: 'match_found', code, myIndex: 1, players: room.players.map(p => p.name) });
    }
  });

  ws.on('close', () => {
    queue = queue.filter(p => p.ws !== ws);
    if(ws.roomCode && rooms[ws.roomCode]){
      rooms[ws.roomCode].players = rooms[ws.roomCode].players.filter(p => p.ws !== ws);
      if(rooms[ws.roomCode].players.length === 0) delete rooms[ws.roomCode];
      else broadcast(rooms[ws.roomCode], { type: 'player_left', players: rooms[ws.roomCode].players.map(p => p.name) });
    }
  });
});

server.listen(PORT, () => console.log('WS V6 + GAME listening on ' + PORT));
