// Battle Cards Online - Server
const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });
console.log('Battle Cards WS on', PORT);
let nextRoomCode = 100000;
let connectedCount = 0;
let waiting = [];
let rooms = new Map();
function send(ws, obj){ try{ if(ws.readyState===1) ws.send(JSON.stringify(obj)); }catch(e){} }
function broadcast(room, obj){ room.players.forEach(p=> send(p.ws, obj)); }
function broadcastCount(){ wss.clients.forEach(c=> send(c, {type:'online_count', count: connectedCount})); }
function makeRoom(playerCount){
const code = String(nextRoomCode++);
const room = { code, playerCount, players: [], currentPlayer: 1, scores: {}, started:false, timer:null, timerLeft:15 };
rooms.set(code, room);
return room;
}
function startTimer(room){
clearInterval(room.timer);
room.timerLeft = 15;
room.timer = setInterval(()=>{
room.timerLeft--;
broadcast(room, {type:'timer', seconds: room.timerLeft, currentPlayer: room.currentPlayer});
if(room.timerLeft<=0){
room.currentPlayer = room.currentPlayer % room.players.length + 1;
broadcast(room, {type:'turn_skipped', currentPlayer: room.currentPlayer, reason:'timeout'});
broadcast(room, {type:'game_state', currentPlayer: room.currentPlayer, players: room.players.map(p=>({id:p.id,name:p.name,score:room.scores[p.id]||0}))});
room.timerLeft = 15;
}
}, 1000);
}
function startGame(room){
room.started = true;
room.currentPlayer = 1;
room.players.forEach(p=> room.scores[p.id]=0);
room.players.forEach(p=> send(p.ws, {type:'matched', player: p.id, myPlayer: p.id, playerCount: room.players.length, players: room.players.map(x=>({id:x.id,name:x.name,score:0})), currentPlayer: 1}));
startTimer(room);
}
function cleanup(ws){
waiting = waiting.filter(w=>w.ws!==ws);
for(let [code, room] of rooms){
const idx = room.players.findIndex(p=>p.ws===ws);
if(idx!==-1){
room.players.splice(idx,1);
if(!room.started){ broadcast(room, {type:'room_players', players: room.players, count: room.players.length, maxPlayers: room.playerCount}); }
else { broadcast(room, {type:'opponent_disconnected'}); clearInterval(room.timer); rooms.delete(code); }
if(room.players.length===0){ clearInterval(room.timer); rooms.delete(code); }
}
}
}
wss.on('connection', (ws)=>{
connectedCount++; broadcastCount();
ws._name = 'Player'; ws._room = null;
ws.on('message', (raw)=>{
let data; try{ data=JSON.parse(raw); }catch(e){ return; }
const type = data.type;
if(type==='chat'){
const room = ws._room; const msg = String(data.message||'').slice(0,100).trim();
if(!msg) return; if(room) broadcast(room, {type:'chat', message: msg, name: ws._name}); return;
}
if(type==='find_match'){
ws._name = String(data.name||'Player').slice(0,20);
waiting.push({ws, name: ws._name, playerCount: Number(data.playerCount||2)});
const need = Number(data.playerCount||2);
const group = waiting.filter(w=>w.playerCount===need).slice(0, need);
if(group.length===need){
waiting = waiting.filter(w=>!group.includes(w));
const room = makeRoom(need);
group.forEach((g,i)=>{ const p={ws:g.ws,id:i+1,name:g.name}; room.players.push(p); g.ws._room=room; g.ws._playerId=i+1; });
startGame(room);
} else { send(ws, {type:'waiting', players: group.length, maxPlayers: need, playerCount: need}); }
return;
}
if(type==='create_room'){
ws._name = String(data.name||'Player').slice(0,20);
const count = Number(data.playerCount||2);
const room = makeRoom(count);
room.players.push({ws, id:1, name: ws._name}); ws._room=room; ws._playerId=1;
send(ws, {type:'room_created', roomCode: room.code});
send(ws, {type:'room_players', players: room.players, count:1, maxPlayers: count});
return;
}
if(type==='join_room'){
ws._name = String(data.name||'Player').slice(0,20);
const code = String(data.roomCode||'').trim();
const room = rooms.get(code);
if(!room){ send(ws, {type:'room_error', message:'الغرفة غير موجودة'}); return; }
if(room.started){ send(ws, {type:'room_error', message:'اللعبة بدات'}); return; }
if(room.players.length>=room.playerCount){ send(ws, {type:'room_error', message:'الغرفة ممتلئة'}); return; }
const id = room.players.length+1;
room.players.push({ws, id, name: ws._name}); ws._room=room; ws._playerId=id;
broadcast(room, {type:'room_players', players: room.players, count: room.players.length, maxPlayers: room.playerCount});
if(room.players.length===room.playerCount) startGame(room);
return;
}
if(type==='pick_card'){
const room = ws._room; if(!room||!room.started) return;
if(ws._playerId!==room.currentPlayer) return;
clearInterval(room.timer);
broadcast(room, {type:'card_picked', player: ws._playerId, cardIndex: Number(data.cardIndex), card: data.card||null});
if(data.scores) room.scores = data.scores;
room.currentPlayer = room.currentPlayer % room.players.length + 1;
broadcast(room, {type:'game_state', currentPlayer: room.currentPlayer, players: room.players.map(p=>({id:p.id,name:p.name,score:room.scores[p.id]||0}))});
startTimer(room);
return;
}
if(type==='game_over' || type==='winner'){
const room = ws._room; if(!room) return;
broadcast(room, {type:'game_over', winner: Number(data.winner||ws._playerId)});
clearInterval(room.timer); return;
}
if(type==='cancel_search'){ waiting = waiting.filter(w=>w.ws!==ws); return; }
if(type==='leave_room' || type==='leave_game'){
const room = ws._room;
if(room){ broadcast(room, {type:'opponent_disconnected'}); clearInterval(room.timer); rooms.delete(room.code); }
ws._room=null; waiting = waiting.filter(w=>w.ws!==ws); return;
}
});
ws.on('close', ()=>{ connectedCount=Math.max(0,connectedCount-1); broadcastCount(); cleanup(ws); });
send(ws, {type:'connected'});
send(ws, {type:'online_count', count: connectedCount});
});
