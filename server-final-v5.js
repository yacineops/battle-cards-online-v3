// Battle Cards - Server FINAL V6 - NO ERRORS - Authoritative
// File: server-final-v6.js
// Render: Build: npm install, Start: node server-final-v6.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;
// Serve game
const server = http.createServer((req, res) => {
if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404); res.end('Not found'); return; }
fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
if (err) { res.writeHead(500); res.end('index.html not found'); return; }
res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
res.end(data);
});
});
const wss = new WebSocket.Server({ server });
server.listen(PORT, () => console.log('Battle Cards V6 running on', PORT));
let nextId = 1;
let rooms = new Map();
let waiting = []; // {ws, name, playerCount}
let clients = new Set();
function send(ws, o){ try{ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(o)); }catch(e){} }
function bcast(room, o, except=null){ room.players.forEach(p=>{ if(p.ws!==except) send(p.ws,o); }); }
function genCode(){ return String(Math.floor(100000+Math.random()*900000)); }
// Seat order for domino clockwise: TOP(1) -> RIGHT(3) -> BOTTOM(0) -> LEFT(2)
// Players array order is join order. Seat mapping is done client-side: index 0 = bottom, 1 = top, 2 = left, 3 = right.
// For turn order, we use CLOCKWISE seat order list filtered to present players.
function seatOrder(n){
// return array of player indices in clockwise order: top, right, bottom, left
const order = [1,3,0,2].filter(i=>i<n);
return order;
}
function nextPlayerIndex(room){
const order = seatOrder(room.players.length);
const cur = room.currentPlayer; // index in players array
const pos = order.indexOf(cur);
const step = room.direction === 1 ? 1 : -1;
const nextPos = (pos + step + order.length) % order.length;
return order[nextPos];
}
function skipPlayerIndex(room, steps=1){
let idx = room.currentPlayer;
for(let s=0;s<steps;s++){
const order = seatOrder(room.players.length);
const pos = order.indexOf(idx);
const step = room.direction === 1 ? 1 : -1;
idx = order[(pos+step+order.length)%order.length];
}
return idx;
}
function makeDeck(){
let cards=[];
const pts=[1,1,1,3,3,3,5,5,5,10,10,10,-2,-2,-2,-5,-5,-5,-10,-10];
pts.forEach(v=>cards.push({type:'points', value:v, icon:'⭐', label:'نقاط '+v}));
const specials=[
{type:'nextLevel', icon:'🚪', label:'الانتقال للمستوى التالي'},
{type:'reverse', icon:'🔄', label:'قلب الاتجاه'},
{type:'skip', icon:'⏭️', label:'تخطي اللاعب'},
{type:'steal', icon:'💰', label:'سرقة 3 نقاط', amount:3},
{type:'shield', icon:'🛡️', label:'درع النقاط'},
{type:'replay', icon:'♻️', label:'إعادة التفعيل'},
{type:'bomb', icon:'💣', label:'خصم 3 نقاط', amount:3},
{type:'shuffle', icon:'🔀', label:'إعادة قلب البطاقات'},
{type:'reset', icon:'🧹', label:'تصفير الجميع'},
{type:'doubleChoice', icon:'🃏', label:'اختيار مزدوج'},
{type:'exchange', icon:'🔃', label:'تبادل النقاط'},
{type:'resetShield', icon:'🔐', label:'حماية الرصيد'},
{type:'points', value:7, icon:'➕', label:'نقاط +7'},
{type:'points', value:4, icon:'➕', label:'نقاط +4'},
{type:'resetPlayer', icon:'💥', label:'تصفير لاعب'},
{type:'exchangePlayers', icon:'🔀', label:'تبادل لاعبين'},
{type:'bombShield', icon:'🛡️', label:'درع القنبلة'},
{type:'stealShield', icon:'🛡️', label:'درع السرقة'},
{type:'reflect', icon:'🪞', label:'عكس الهجوم'},
{type:'doubleSelf', icon:'✖️2', label:'ضاعف رصيدك'},
{type:'doubleTarget', icon:'🎯', label:'مضاعفة لاعب'},
{type:'freeze', icon:'🧊', label:'تجميد لاعب'},
{type:'stealAll', icon:'🦹', label:'سرقة أرصدة الخصوم'},
{type:'bombAll', icon:'💣', label:'قنبلة الخصوم −5'},
];
specials.forEach(s=>cards.push(s));
for(let i=cards.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [cards[i],cards[j]]=[cards[j],cards[i]]; }
return cards.slice(0,45);
}
function publicPlayers(room){
return room.players.map(p=>({name:p.name, score:p.score, shields:p.shields||[], frozen:!!p.frozen}));
}
function gameState(room){
return {type:'game_state', players: room.players.map(p=>p.score), playersFull: publicPlayers(room), currentPlayer: room.currentPlayer+1, level: room.level, direction: room.direction, openedCards: room.opened.size, openedIndices: [...room.opened], cards: room.cards};
}
function startGame(room){
room.started=true; room.level=1; room.direction=1; room.currentPlayer=0; room.opened=new Set();
room.cards=makeDeck(); room.timer=15;
room.players.forEach(p=>{ p.score=0; p.shields=[]; p.frozen=false; p.protected=false; });
room.players.forEach(p=>{
send(p.ws, {type:'matched', players: publicPlayers(room), myPlayer: p.id, currentPlayer: 1, level: 1, direction: 1, cards: room.cards, seconds: 15});
});
startTimer(room);
}
function startTimer(room){
if(room.timerInterval) clearInterval(room.timerInterval);
room.timer=15;
room.timerInterval=setInterval(()=>{
if(!room.started){ clearInterval(room.timerInterval); return; }
room.timer--;
bcast(room, {type:'timer', seconds: room.timer});
if(room.timer<=0){
room.timer=15;
// skip frozen / advance
let nxt = nextPlayerIndex(room);
// if next is frozen, skip him too
let tries=0;
while(room.players[nxt] && room.players[nxt].frozen && tries<room.players.length){
room.players[nxt].frozen=false;
nxt = (()=>{ const o=seatOrder(room.players.length); const pos=o.indexOf(nxt); const st=room.direction===1?1:-1; return o[(pos+st+o.length)%o.length]; })();
tries++;
}
room.currentPlayer=nxt;
bcast(room, {type:'turn_skipped', currentPlayer: room.currentPlayer+1});
bcast(room, gameState(room));
}
}, 1000);
}
function checkGameOver(room){
if(room.opened.size>=room.cards.length){
clearInterval(room.timerInterval); room.started=false;
let max=Math.max(...room.players.map(p=>p.score));
let winners=room.players.filter(p=>p.score===max);
bcast(room, {type:'game_over', players: publicPlayers(room), winner: winners.length===1 ? winners[0].name : ''});
}
}
function handleLeave(ws){
waiting=waiting.filter(q=>q.ws!==ws);
if(ws.roomCode){
let room=rooms.get(ws.roomCode);
if(room){
room.players=room.players.filter(p=>p.ws!==ws);
if(room.players.length===0){ if(room.timerInterval) clearInterval(room.timerInterval); rooms.delete(ws.roomCode); }
else{
bcast(room, {type:'opponent_disconnected', message:'غادر أحد اللاعبين'});
bcast(room, {type:'room_players', current: room.players.length, total: room.playerCount, players: room.players.map(p=>p.name)});
if(room.started){ room.started=false; if(room.timerInterval) clearInterval(room.timerInterval); }
}
}
ws.roomCode=null; ws.room=null;
}
}
wss.on('connection', (ws)=>{
ws.id=nextId++; ws.name='لاعب'; clients.add(ws);
send(ws, {type:'online_count', count: clients.size});
ws.on('message', (data)=>{
let msg; try{ msg=JSON.parse(String(data)); }catch(e){ return; }
let type=msg.type||msg.event;
if(type==='create_room'){
ws.name=msg.name||'لاعب';
let pc=parseInt(msg.playerCount||2);
if(pc<2||pc>4) pc=2;
let code=genCode();
let room={code, playerCount:pc, players:[{ws, name:ws.name, score:0, id:ws.id, shields:[], frozen:false}], started:false, level:1, direction:1, currentPlayer:0, opened:new Set(), cards:[], timer:15};
ws.roomCode=code; ws.room=room; rooms.set(code, room);
send(ws, {type:'room_created', roomCode:code, code:code});
send(ws, {type:'room_players', current:1, total:pc, players:[ws.name]});
return;
}
if(type==='join_room'){
ws.name=msg.name||'لاعب';
let code=String(msg.roomCode||msg.code||'').trim();
let room=rooms.get(code);
if(!room){ send(ws, {type:'room_error', message:'الغرفة غير موجودة - تأكد من الكود'}); return; }
if(room.started){ send(ws, {type:'room_error', message:'اللعبة بدأت، لا يمكنك الدخول'}); return; }
if(room.players.length>=room.playerCount){ send(ws, {type:'room_error', message:'الغرفة ممتلئة'}); return; }
room.players.push({ws, name:ws.name, score:0, id:ws.id, shields:[], frozen:false});
ws.roomCode=code; ws.room=room;
bcast(room, {type:'room_players', current: room.players.length, total: room.playerCount, players: room.players.map(p=>p.name)});
if(room.players.length===room.playerCount) startGame(room);
return;
}
if(type==='find_match'){
ws.name=msg.name||'لاعب';
let pc=parseInt(msg.playerCount||2); if(pc<2||pc>4) pc=2;
// avoid duplicate queue entry
waiting=waiting.filter(q=>q.ws!==ws);
waiting.push({ws, name:ws.name, playerCount:pc});
let group=waiting.filter(q=>q.playerCount===pc);
if(group.length>=pc){
let members=group.slice(0,pc);
members.forEach(m=> waiting=waiting.filter(q=>q.ws!==m.ws));
let code=genCode();
let room={code, playerCount:pc, players:[], started:false, level:1, direction:1, currentPlayer:0, opened:new Set(), cards:[], timer:15};
members.forEach(m=>{ let p={ws:m.ws, name:m.name, score:0, id:m.ws.id, shields:[], frozen:false}; m.ws.roomCode=code; m.ws.room=room; room.players.push(p); });
rooms.set(code, room); startGame(room);
} else {
send(ws, {type:'waiting', current: group.length, total: pc});
// also notify others in same queue
group.forEach(q=>{ if(q.ws!==ws) send(q.ws, {type:'waiting', current: group.length, total: pc}); });
}
return;
}
if(type==='cancel_search'){ waiting=waiting.filter(q=>q.ws!==ws); send(ws,{type:'search_cancelled'}); return; }
if(type==='pick_card'){
let room=ws.room; if(!room||!room.started) return;
let pIdx=room.players.findIndex(p=>p.ws===ws);
if(pIdx===-1) return;
if(pIdx!==room.currentPlayer){ send(ws,{type:'error', message:'ليس دورك'}); return; }
let idx=msg.cardIndex;
if(typeof idx!=='number'||!room.cards[idx]||room.opened.has(idx)){ send(ws,{type:'error', message:'بطاقة غير صالحة'}); return; }
room.opened.add(idx);
let card=room.cards[idx];
let me=room.players[pIdx];
let targetIdx = (typeof msg.target==='number') ? msg.target : -1;
let log = '';
// --- Apply card effect AUTHORITATIVELY ---
if(card.type==='points'){
me.score += (card.value||0);
log = 'نقاط '+(card.value>0?'+':'')+card.value;
} else if(card.type==='nextLevel'){
// ALL players go to next level together
room.level+=1; room.cards=makeDeck(); room.opened=new Set(); room.direction=1;
room.players.forEach(p=>{ p.shields=[]; p.frozen=false; });
// current player stays, timer reset
room.timer=15;
bcast(room, {type:'card_picked', cardIndex: idx, card: card, by: ws.id, player: pIdx});
bcast(room, {type:'level_changed', level: room.level, cards: room.cards, currentPlayer: room.currentPlayer+1, direction: room.direction, playersFull: publicPlayers(room)});
bcast(room, gameState(room));
return;
} else if(card.type==='reverse'){
room.direction*=-1; log='قلب الاتجاه';
} else if(card.type==='skip'){
// skip next player: advance 2 steps in current direction
room.currentPlayer = skipPlayerIndex(room, 1); // first move to next, then skip logic: we set to after skipped
// Actually skip means: next player is skipped, so advance 2 from current
// skipPlayerIndex already does 1 step, we need one more
// Recompute correctly: from original, advance 2
// We already advanced 1, advance 1 more
let o=seatOrder(room.players.length); let pos=o.indexOf(room.currentPlayer); let st=room.direction===1?1:-1;
room.currentPlayer = o[(pos+st+o.length)%o.length];
bcast(room, {type:'card_picked', cardIndex: idx, card: card, by: ws.id, player: pIdx});
bcast(room, gameState(room));
checkGameOver(room); return;
} else if(card.type==='steal'){
if(targetIdx>=0 && targetIdx!==pIdx){
let t=room.players[targetIdx];
let amt=Math.min(3, Math.max(0,t.score));
if(t.shields && t.shields.includes('stealShield')){ amt=0; log='درع السرقة حمى الهدف'; }
else { t.score-=amt; me.score+=amt; log='سرقة '+amt; }
}
} else if(card.type==='shield'){ me.shields.push('shield'); log='درع'; }
else if(card.type==='bomb'){
if(targetIdx>=0 && targetIdx!==pIdx){
let t=room.players[targetIdx];
if(t.shields && t.shields.includes('bombShield')) log='درع القنبلة حمى الهدف';
else t.score=Math.max(0, t.score-3);
} else { me.score=Math.max(0, me.score-3); }
} else if(card.type==='shuffle'){
// reshuffle same deck for ALL
let newDeck=[...room.cards];
for(let i=newDeck.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [newDeck[i],newDeck[j]]=[newDeck[j],newDeck[i]]; }
room.cards=newDeck;
bcast(room, {type:'card_picked', cardIndex: idx, card: card, by: ws.id, player: pIdx});
bcast(room, {type:'cards_shuffled', cards: room.cards});
bcast(room, gameState(room));
// advance turn
room.currentPlayer=nextPlayerIndex(room);
bcast(room, gameState(room));
return;
} else if(card.type==='reset'){
room.players.forEach(p=>p.score=0);
} else if(card.type==='exchange'){
if(targetIdx>=0 && targetIdx!==pIdx){ let t=room.players[targetIdx]; let tmp=me.score; me.score=t.score; t.score=tmp; }
} else if(card.type==='doubleSelf'){ me.score*=2; }
else if(card.type==='doubleTarget'){ if(targetIdx>=0) room.players[targetIdx].score*=2; }
else if(card.type==='freeze'){ if(targetIdx>=0) room.players[targetIdx].frozen=true; }
else if(card.type==='stealAll'){
room.players.forEach((p,i)=>{ if(i!==pIdx){ let amt=Math.min(3, Math.max(0,p.score)); p.score-=amt; me.score+=amt; } });
} else if(card.type==='bombAll'){
room.players.forEach((p,i)=>{ if(i!==pIdx) p.score=Math.max(0,p.score-5); });
} else if(card.type==='resetPlayer'){ if(targetIdx>=0) room.players[targetIdx].score=0; else me.score=0; }
else if(card.type==='bombShield'){ me.shields.push('bombShield'); }
else if(card.type==='stealShield'){ me.shields.push('stealShield'); }
else if(card.type==='resetShield'){ me.shields.push('resetShield'); }
// For replay/doubleChoice etc, client will send second pick; server just advances normally
// Broadcast card to ALL - same card, same index
bcast(room, {type:'card_picked', cardIndex: idx, card: card, by: ws.id, player: pIdx, target: targetIdx, log});
// Advance turn (except replay which keeps turn - handled by client sending replay flag)
if(card.type!=='replay'){
room.currentPlayer=nextPlayerIndex(room);
}
room.timer=15;
bcast(room, gameState(room));
checkGameOver(room);
return;
}
if(type==='chat'){
let room=ws.room; if(room) bcast(room, {type:'chat', name: ws.name, message: String(msg.message||'').slice(0,200)}, ws);
return;
}
if(type==='leave_room' || type==='leave_game'){ handleLeave(ws); return; }
});
ws.on('close', ()=>{ clients.delete(ws); handleLeave(ws); clients.forEach(c=> send(c,{type:'online_count', count: clients.size})); });
});
