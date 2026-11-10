// Battle Cards - Server Final V7 - FIXED
// freeze = 1, doubleChoice + replay online, targetBase=1, game_state after every pick
const http = require('http');
const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;
const server = http.createServer((req,res)=>{ res.writeHead(200,{'Content-Type':'text/plain'}); res.end('Battle Cards WS V7 OK'); });
const wss = new WebSocket.Server({ server });
function deckFor(level){
let cs=[]; const push=(t,v,a)=>{let c={type:t,opened:false}; if(v!=null)c.value=v; if(a!=null)c.amount=a; cs.push(c);};
let vals = level===1?[1,1,1,3,3,3,5,5,5,10,10,10,-2,-2,-2,-5,-5,-5,-10]:level===2?[1,1,1,3,3,3,5,5,5,10,10,10,-2,-2,-2,-5,-5]:[1,1,1,3,3,3,5,5,5,10,10,10,-2,-2,-2,-5,-5,-5];
vals.forEach(v=>push('points',v));
let sp = level===1 ? [['nextLevel'],['reverse'],['reverse'],['skip'],['skip'],['steal',null,3],['steal',null,3],['shield'],['shield'],['replay'],['bomb',null,3],['bomb',null,3],['shuffle'],['reset'],['doubleChoice'],['exchange'],['resetShield'],['points',7],['points',4],['resetPlayer'],['exchangePlayers'],['bombShield'],['stealShield'],['reflect'],['doubleSelf'],['doubleTarget']] : level===2 ? [['nextLevel'],['doubleTarget'],['doubleSelf'],['reverse'],['skip'],['resetPlayer'],['exchange'],['exchangePlayers'],['freeze'],['reset'],['stealAll'],['reflect'],['steal',null,5],['replay'],['reverseBalances'],['shieldSteal'],['resetShield'],['shieldReverse'],['shieldSkip'],['goldenShield'],['doubleChoice'],['randomBalances'],['bombAll'],['cancelShuffle'],['cancelReplay'],['shuffle'],['nextLevel']] : [['doubleTarget'],['doubleSelf'],['reverse'],['skip'],['resetPlayer'],['exchange'],['exchangePlayers'],['freeze'],['reset'],['stealAll'],['reflect'],['steal',null,5],['replay'],['reverseBalances'],['shieldSteal'],['resetShield'],['shieldReverse'],['shieldSkip'],['goldenShield'],['doubleChoice'],['randomBalances'],['bombAll'],['cancelShuffle'],['cancelReplay'],['randomPoints'],['shuffle']];
sp.forEach(s=>push(s[0],s[1],s[2]));
while(cs.length<45) cs.push({type:'points',value:[1,3,5,-2][cs.length%4],opened:false});
cs=cs.slice(0,45);
for(let i=cs.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1)); [cs[i],cs[j]]=[cs[j],cs[i]];}
return cs;
}
function freshPlayers(names){
return names.map((n,i)=>({id:i+1,name:n||('اللاعب '+(i+1)),score:0,shield:0,bombShield:0,stealShield:0,resetShield:0,reflect:0,shieldReverse:0,shieldSkip:0,goldenShield:0,cancelShuffle:0,cancelReplay:0,freeze:0}));
}
let waiting = []; // {ws,name,playerCount}
let rooms = new Map(); // code -> game
let wsToGame = new Map(); // ws -> {code, idx}
function send(ws,o){ try{ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(o)); }catch(e){} }
function broadcast(game,o){ game.players.forEach(p=>{ if(p.ws) send(p.ws,o); }); }
function roomCodeGen(){ return String(Math.floor(100000+Math.random()*900000)); }
function publicState(game){
return {
type:'game_state',
players: game.players.map(p=>({id:p.id,name:p.name,score:p.score,shield:p.shield,bombShield:p.bombShield,stealShield:p.stealShield,resetShield:p.resetShield,reflect:p.reflect,shieldReverse:p.shieldReverse,shieldSkip:p.shieldSkip,goldenShield:p.goldenShield,cancelShuffle:p.cancelShuffle,cancelReplay:p.cancelReplay,freeze:p.freeze})),
cards: game.cards.map(c=>({type:c.type,value:c.value,amount:c.amount,opened:c.opened})),
level: game.level, direction: game.direction,
currentPlayer: game.current+1, currentPlayerBase:1,
seconds: 15, roomCode: game.code
};
}
function startGame(game){
game.cards = deckFor(1);
game.level=1; game.direction=1; game.current=0;
game.players.forEach((p,i)=>{
p.id=i+1;
send(p.ws,{type:'game_start', myPlayerId:i+1, myPlayer:i+1, myIndex:i, players: game.players.map(x=>({id:x.id,name:x.name,score:0,shield:0,bombShield:0,stealShield:0,resetShield:0,reflect:0,shieldReverse:0,shieldSkip:0,goldenShield:0,cancelShuffle:0,cancelReplay:0,freeze:0})), cards: game.cards, level:1, direction:1, currentPlayer:1, currentPlayerBase:1, seconds:15, roomCode: game.code});
});
startTimer(game);
}
function startTimer(game){
clearInterval(game.timer);
game.seconds=15;
game.timer=setInterval(()=>{
if(!game.started) return;
game.seconds--;
broadcast(game,{type:'timer',seconds:game.seconds});
if(game.seconds<=0){
broadcast(game,{type:'turn_skipped'});
advance(game,1);
game.seconds=15;
broadcast(game, publicState(game));
}
},1000);
}
function advance(game, steps){
let left=steps||1, guard=0;
while(left>0 && guard<30){
guard++;
game.current = game.direction===1 ? (game.current+1)%game.players.length : (game.current-1+game.players.length)%game.players.length;
let p=game.players[game.current];
if(p && p.freeze>0){ p.freeze--; left++; }
left--;
}
}
function checkEnd(game){
if(!game.cards.every(c=>c.opened)) return false;
clearInterval(game.timer);
let best=Math.max(...game.players.map(p=>p.score));
let win=game.players.filter(p=>p.score===best);
broadcast(game,{type:'game_over', winner: win.length===1? win[0].name : null, players: game.players.map(p=>({id:p.id,name:p.name,score:p.score,shield:p.shield,bombShield:p.bombShield,stealShield:p.stealShield,resetShield:p.resetShield,reflect:p.reflect,shieldReverse:p.shieldReverse,shieldSkip:p.shieldSkip,goldenShield:p.goldenShield,cancelShuffle:p.cancelShuffle,cancelReplay:p.cancelReplay,freeze:p.freeze}))});
game.started=false;
return true;
}
// Apply effect - server is source of truth. Returns true if turn should advance.
function applyEffect(game, card, pickerIdx, targetIdx, firstIdx, extra){
let players=game.players;
let me=players[pickerIdx];
let t = targetIdx!=null ? players[targetIdx] : null;
let amt = card.amount!=null?card.amount:3;
// replay / doubleChoice are handled by caller - they call applyEffect again with chosen card
if(card.type==='points'){
let v=card.value||0;
if(v<0 && me.shield>0){ me.shield--; }
else me.score+=v;
}
else if(card.type==='shield'){ me.shield++; }
else if(card.type==='stealShield'||card.type==='shieldSteal'){ me.stealShield++; }
else if(card.type==='resetShield'){ me.resetShield++; }
else if(card.type==='shieldReverse'){ me.shieldReverse++; }
else if(card.type==='shieldSkip'){ me.shieldSkip++; }
else if(card.type==='goldenShield'){ me.goldenShield++; }
else if(card.type==='bombShield'){ me.bombShield++; }
else if(card.type==='reflect'){ me.reflect++; }
else if(card.type==='cancelShuffle'){ me.cancelShuffle++; }
else if(card.type==='cancelReplay'){ me.cancelReplay++; }
else if(card.type==='reverse'){
let nx=players[(pickerIdx+game.direction+players.length)%players.length];
if(nx && nx.shieldReverse>0){ nx.shieldReverse--; }
else game.direction=-game.direction;
}
else if(card.type==='skip'){
let n2=players[(pickerIdx+game.direction+players.length)%players.length];
if(n2 && n2.shieldSkip>0){ n2.shieldSkip--; advance(game,1); return; }
else { advance(game,2); return; }
}
else if(card.type==='doubleSelf'){ me.score*=2; }
else if(card.type==='reset'){ players.forEach(p=>{ if(p===me) return; if(p.goldenShield>0) p.goldenShield--; else if(p.resetShield>0) p.resetShield--; else p.score=0; }); }
else if(card.type==='stealAll'){ let g=0; players.forEach(p=>{ if(p===me) return; if(p.goldenShield>0) p.goldenShield--; else if(p.stealShield>0) p.stealShield--; else { g+=Math.max(0,p.score); p.score-=Math.max(0,p.score); } }); me.score+=g; }
else if(card.type==='reverseBalances'){ players.forEach(p=>{ if(p!==me) p.score=-p.score; }); }
else if(card.type==='bombAll'){ players.forEach(p=>{ if(p===me) return; if(p.goldenShield>0) p.goldenShield--; else if(p.bombShield>0) p.bombShield--; else p.score-=5; }); }
else if(card.type==='randomPoints'){ let vals=[-10,-5,-2,1,3,5,7,10]; let v=vals[Math.floor(Math.random()*vals.length)]; me.score+=v; }
else if(card.type==='randomBalances'){ let sc=players.map(p=>p.score); for(let i=sc.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1)); [sc[i],sc[j]]=[sc[j],sc[i]];} players.forEach((p,i)=>p.score=sc[i]); }
else if(card.type==='shuffle'){
// check cancelShuffle of others
let canceller = players.find(p=>p!==me && p.cancelShuffle>0);
if(canceller){ canceller.cancelShuffle--; }
else {
let closedIdx=[]; game.cards.forEach((cc,i)=>{ if(!cc.opened) closedIdx.push(i); });
let vals=closedIdx.map(i=>game.cards[i]);
for(let i=vals.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1)); [vals[i],vals[j]]=[vals[j],vals[i]];}
closedIdx.forEach((idx,k)=>game.cards[idx]=vals[k]);
// keep opened state: all closed cards stay closed, opened stay opened
broadcast(game,{type:'cards_shuffled', cards: game.cards});
}
}
else if(card.type==='nextLevel'){
if(game.level>=3) return;
game.level++;
game.cards=deckFor(game.level);
players.forEach(p=>{ p.shield=0;p.bombShield=0;p.stealShield=0;p.resetShield=0;p.reflect=0;p.shieldReverse=0;p.shieldSkip=0;p.goldenShield=0;p.cancelShuffle=0;p.cancelReplay=0;p.freeze=0; });
broadcast(game,{type:'level_changed', level: game.level, cards: game.cards});
// don't advance extra - normal advance below will happen, but reset current to 0 for new level? keep current
advance(game,1); return;
}
else if(card.type==='steal' && t){
if(t.goldenShield>0) t.goldenShield--;
else if(t.stealShield>0) t.stealShield--;
else if(t.reflect>0){ t.reflect--; let take=Math.min(amt,Math.max(0,me.score)); me.score-=take; t.score+=take; }
else { let take=Math.min(amt,Math.max(0,t.score)); t.score-=take; me.score+=take; }
}
else if(card.type==='bomb' && t){
if(t.goldenShield>0) t.goldenShield--;
else if(t.bombShield>0) t.bombShield--;
else t.score-=amt;
}
else if(card.type==='doubleTarget' && t){
if(t.goldenShield>0) t.goldenShield--; else t.score*=2;
}
else if(card.type==='resetPlayer' && t){
if(t.goldenShield>0) t.goldenShield--;
else if(t.resetShield>0) t.resetShield--;
else t.score=0;
}
else if(card.type==='exchange' && t){
if(t.goldenShield>0) t.goldenShield--;
else { let tmp=me.score; me.score=t.score; t.score=tmp; }
}
else if(card.type==='exchangePlayers'){
if(firstIdx!=null && t){
let a=players[firstIdx];
if(a && a!==t){ let tmp=a.score; a.score=t.score; t.score=tmp; }
} else if(t){
let tmp=me.score; me.score=t.score; t.score=tmp;
}
}
else if(card.type==='freeze' && t){
// FIX: freeze = 1 (was 2)
t.freeze=1;
}
advance(game,1);
}
function handlePick(game, ws, msg){
let idx = Number(msg.cardIndex);
if(!Number.isFinite(idx) || !game.cards[idx] || game.cards[idx].opened){
send(ws,{type:'error', message:'بطاقة غير صالحة'});
return;
}
let pickerIdx = game.players.findIndex(p=>p.ws===ws);
if(pickerIdx!==game.current){
send(ws,{type:'error', message:'ماشي دورك'});
return;
}
let card = game.cards[idx];
// Cards that need target: if no target provided, ask client for target
let needTarget = ['steal','bomb','doubleTarget','resetPlayer','exchange','exchangePlayers','freeze'];
if(needTarget.includes(card.type) && msg.target==null){
send(ws,{type:'need_target', cardIndex:idx, cardType:card.type});
return;
}
// doubleChoice: client sends choiceIndex = which of the two revealed cards to activate
// In this server, doubleChoice flow: first pick of doubleChoice card itself -> reveal it, then client picks 2 closed cards via doubleChoicePick?
// Simplified compatible flow: if msg.choiceIndex != null, activate that card. If msg.doubleChoicePick, handle.
// If card is doubleChoice and no choiceIndex, we reveal it and wait for choice
if(card.type==='doubleChoice' && msg.choiceIndex==null){
// reveal doubleChoice card, tell client to pick 2
card.opened=true;
broadcast(game,{type:'card_picked', cardIndex:idx, card:card, currentPlayer: game.current+1, currentPlayerBase:1});
send(ws,{type:'need_target', cardIndex:idx, cardType:'doubleChoice'});
// store pending
game.pendingDoubleChoice = {picker: pickerIdx, cardIndex: idx};
return;
}
if(card.type==='doubleChoice' && msg.choiceIndex!=null){
// activate chosen card
let chosenIdx = Number(msg.choiceIndex);
let chosen = game.cards[chosenIdx];
if(chosen && !chosen.opened) chosen.opened=true;
broadcast(game,{type:'card_picked', cardIndex:chosenIdx, card:chosen, currentPlayer: game.current+1, currentPlayerBase:1});
if(chosen) applyEffect(game, chosen, pickerIdx, null, null);
game.pendingDoubleChoice=null;
if(checkEnd(game)) return;
game.seconds=15;
broadcast(game, publicState(game));
return;
}
if(card.type==='replay' && msg.replayIndex==null){
card.opened=true;
broadcast(game,{type:'card_picked', cardIndex:idx, card:card, currentPlayer: game.current+1, currentPlayerBase:1});
send(ws,{type:'need_target', cardIndex:idx, cardType:'replay'});
game.pendingReplay = {picker: pickerIdx, cardIndex: idx};
return;
}
if(card.type==='replay' && msg.replayIndex!=null){
let replayIdx = Number(msg.replayIndex);
let replayCard = game.cards[replayIdx];
if(replayCard && replayCard.opened){
broadcast(game,{type:'card_picked', cardIndex:replayIdx, card:replayCard, currentPlayer: game.current+1, currentPlayerBase:1});
applyEffect(game, replayCard, pickerIdx, null, null);
}
game.pendingReplay=null;
if(checkEnd(game)) return;
game.seconds=15;
broadcast(game, publicState(game));
return;
}
// Normal pick
card.opened=true;
// resolve target indices: client sends 1-based (targetBase=1)
let targetIdx=null, firstIdx=null;
if(msg.target!=null){
let tb = msg.targetBase===1 ? 1 : (msg.targetBase===0 ? 0 : 1);
targetIdx = Number(msg.target) - tb;
}
if(msg.first!=null){
let fb = msg.firstBase===1 ? 1 : (msg.firstBase===0 ? 0 : 1);
firstIdx = Number(msg.first) - fb;
}
broadcast(game,{type:'card_picked', cardIndex:idx, card:card, currentPlayer: game.current+1, currentPlayerBase:1});
applyEffect(game, card, pickerIdx, targetIdx, firstIdx, msg);
if(checkEnd(game)) return;
game.seconds=15;
broadcast(game, publicState(game));
}
function tryMatch(){
// group waiting by playerCount
for(let i=0;i<waiting.length;i++){
let w=waiting[i];
let group = waiting.filter(x=>x.playerCount===w.playerCount);
if(group.length>=w.playerCount){
let chosen = group.slice(0,w.playerCount);
waiting = waiting.filter(x=>!chosen.includes(x));
let code=roomCodeGen();
let game={code, players: chosen.map(c=>({ws:c.ws, name:c.name})), cards:[], level:1, direction:1, current:0, started:true, seconds:15};
// init player objects
game.players = freshPlayers(chosen.map(c=>c.name));
game.players.forEach((p,idx)=>{ p.ws=chosen[idx].ws; });
rooms.set(code,game);
chosen.forEach((c,idx)=>{ wsToGame.set(c.ws,{code, idx}); });
startGame(game);
}
}
}
wss.on('connection',(ws)=>{
ws.on('message',(raw)=>{
let msg; try{ msg=JSON.parse(String(raw)); }catch(e){ return; }
let type=String(msg.type||'');
if(type==='find_match'){
let name=String(msg.name||'اللاعب 1').slice(0,20);
let pc=Number(msg.playerCount)||2;
waiting.push({ws,name,playerCount:pc});
send(ws,{type:'waiting', players: waiting.filter(w=>w.playerCount===pc).map(w=>w.name), current: waiting.filter(w=>w.playerCount===pc).length, total: pc});
tryMatch();
// broadcast waiting update to group
waiting.filter(w=>w.playerCount===pc).forEach(w=> send(w.ws,{type:'waiting', players: waiting.filter(x=>x.playerCount===pc).map(x=>x.name), current: waiting.filter(x=>x.playerCount===pc).length, total: pc}));
return;
}
if(type==='create_room'){
let name=String(msg.name||'اللاعب 1').slice(0,20);
let pc=Number(msg.playerCount)||2;
let code=roomCodeGen();
let game={code, players:[{ws, name}], cards:[], level:1, direction:1, current:0, started:false, seconds:15, total:pc};
game.players = freshPlayers([name]);
game.players[0].ws=ws;
rooms.set(code,game);
wsToGame.set(ws,{code, idx:0});
send(ws,{type:'room_created', roomCode:code});
send(ws,{type:'room_players', players:[name], current:1, total:pc, roomCode:code});
return;
}
if(type==='join_room'){
let code=String(msg.roomCode||'');
let game=rooms.get(code);
if(!game){ send(ws,{type:'room_error', message:'الغرفة غير موجودة'}); return; }
if(game.started){ send(ws,{type:'room_error', message:'الجولة بدأت'}); return; }
let name=String(msg.name||'اللاعب 1').slice(0,20);
game.players.push({ws, name});
// rebuild freshPlayers keeping names
let names=game.players.map(p=>p.name);
let oldWs=game.players.map(p=>p.ws);
game.players=freshPlayers(names);
game.players.forEach((p,i)=>p.ws=oldWs[i]);
game.players.forEach((p,i)=> wsToGame.set(p.ws,{code, idx:i}));
let total=game.total||2;
broadcast(game,{type:'room_players', players: names, current: names.length, total, roomCode:code});
if(names.length>=total){
game.started=true;
startGame(game);
}
return;
}
if(type==='cancel_search'){
waiting=waiting.filter(w=>w.ws!==ws);
send(ws,{type:'search_cancelled'});
return;
}
if(type==='leave_game'){
let info=wsToGame.get(ws);
if(info){
let game=rooms.get(info.code);
if(game){
clearInterval(game.timer);
broadcast(game,{type:'player_disconnected', player: game.players[info.idx]?.name});
rooms.delete(info.code);
}
wsToGame.delete(ws);
}
waiting=waiting.filter(w=>w.ws!==ws);
send(ws,{type:'left_game'});
return;
}
if(type==='chat'){
let info=wsToGame.get(ws);
if(info){
let game=rooms.get(info.code);
if(game) broadcast(game,{type:'chat', name:String(msg.name||'لاعب'), message:String(msg.message||'')});
}
return;
}
if(type==='get_state' || type==='sync' || type==='request_state'){
let info=wsToGame.get(ws);
if(info){
let game=rooms.get(info.code);
if(game) send(ws, publicState(game));
}
return;
}
if(type==='pick_card'){
let info=wsToGame.get(ws);
if(!info){ send(ws,{type:'error', message:'ماكش في غرفة'}); return; }
let game=rooms.get(info.code);
if(!game) return;
handlePick(game, ws, msg);
return;
}
});
ws.on('close',()=>{
waiting=waiting.filter(w=>w.ws!==ws);
let info=wsToGame.get(ws);
if(info){
let game=rooms.get(info.code);
if(game && game.started){
broadcast(game,{type:'player_disconnected', player: game.players[info.idx]?.name});
}
wsToGame.delete(ws);
}
});
});
server.listen(PORT,()=>console.log('WS V7 listening on '+PORT));
