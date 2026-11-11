// server.js - v6 معدل - نفس السيرفر، زدنا غير النواقص
const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

let rooms = {}; // code -> { players: [], maxPlayers }
let waiting = null; // للبحث العشوائي find_match

function makeCode(){
  return String(Math.floor(100000 + Math.random()*900000));
}
function send(ws, obj){ try{ ws.send(JSON.stringify(obj)); }catch(e){} }
function broadcast(roomCode, obj){
  if(!rooms[roomCode]) return;
  rooms[roomCode].players.forEach(p=>send(p.ws, obj));
}

wss.on('connection', (ws)=>{
  console.log("New player connected");
  ws.roomCode = null;

  ws.on('message', (msg)=>{
    let data;
    try{ data = JSON.parse(msg); }catch(e){ return; }
    console.log("Received:", data);

    // 1 - إنشاء غرفة - كان ناقصو يرجع الرقم
    if(data.type === "create_room"){
      const code = makeCode();
      rooms[code] = { players: [{ ws, name: data.name || "Player 1" }], maxPlayers: data.maxPlayers || 2 };
      ws.roomCode = code;
      // هذي هي الإضافة المهمة: نرجع الرقم الحقيقي من السيرفر
      send(ws, { type:"room_created", roomCode: code, code: code });
    }

    // 2 - دخول لغرفة
    if(data.type === "join_room"){
      const code = String(data.roomCode || data.code || "").trim();
      const room = rooms[code];
      if(!room){ send(ws, { type:"room_not_found", message:"الغرفة غير موجودة" }); return; }
      if(room.players.length >= room.maxPlayers){ send(ws, { type:"error", message:"الغرفة ممتلئة" }); return; }

      room.players.push({ ws, name: data.name || "Player 2" });
      ws.roomCode = code;
      send(ws, { type:"room_joined", roomCode: code, players: room.players.length });
      broadcast(code, { type:"player_joined", players: room.players.length });

      // هذي الإضافة الثانية: كي تكمل الغرفة، نبعث game_start للزوج
      if(room.players.length >= room.maxPlayers){
        broadcast(code, { type:"game_start", roomCode: code, players: room.players.map(p=>p.name) });
      } else {
        send(ws, { type:"waiting", players: room.players.length });
      }
    }

    // 3 - البحث عن لاعب - كان مكاش كامل، زدناه
    if(data.type === "find_match"){
      if(waiting && waiting.readyState === 1){
        const code = makeCode();
        rooms[code] = { players: [{ ws: waiting, name:"Player 1" }, { ws, name: data.name || "Player 2" }], maxPlayers: 2 };
        waiting.roomCode = code;
        ws.roomCode = code;
        send(waiting, { type:"match_found", roomCode: code });
        send(ws, { type:"match_found", roomCode: code });
        broadcast(code, { type:"game_start", roomCode: code });
        waiting = null;
      } else {
        waiting = ws;
        send(ws, { type:"waiting", message:"نستنى في لاعب..." });
      }
    }
  });

  ws.on('close', ()=>{
    if(ws.roomCode && rooms[ws.roomCode]){
      rooms[ws.roomCode].players = rooms[ws.roomCode].players.filter(p=>p.ws !== ws);
      if(rooms[ws.roomCode].players.length === 0) delete rooms[ws.roomCode];
    }
    if(waiting === ws) waiting = null;
  });
});

console.log("WS V6 modified - listening on " + PORT);
