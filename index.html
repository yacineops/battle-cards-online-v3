// server-final-v6.js - V11 FINAL - طاولة واحدة مشتركة + مزامنة البطاقة
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const PORT = process.env.PORT || 10000;
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(__dirname, urlPath);
  // منع الخروج من مجلد المشروع
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});
const wss = new WebSocket.Server({ server });
const rooms = new Map();
const queues = { "2": [], "3": [], "4": [] };
function send(ws, obj){ try{ if(ws && ws.readyState===1) ws.send(JSON.stringify(obj)); }catch(e){} }
function broadcast(room, obj, exceptWs){ room.players.forEach((p)=>{ if(p!==exceptWs) send(p,obj); }); }
function broadcastAll(room, obj){ room.players.forEach((p)=> send(p,obj)); }
function makeCode(){ let c=""; do{ c=String(Math.floor(100000+Math.random()*900000)); }while(rooms.has(c)); return c; }
function normCount(n){ n=parseInt(n,10); if(n===3) return 3; if(n===4) return 4; return 2; }
function getNames(room){ return room.players.map((p)=> p._name || "اللاعب 1"); }
function getScores(room){ return room.players.map((p)=> p._score || 0); }
function removeFromAllQueues(ws){ ["2","3","4"].forEach((k)=>{ queues[k]=queues[k].filter((p)=>p!==ws); }); }
function removeFromRoom(ws){
  if(!ws._roomCode) return;
  const room = rooms.get(ws._roomCode);
  if(!room) return;
  room.players = room.players.filter((p)=>p!==ws);
  if(room.players.length===0) rooms.delete(ws._roomCode);
  else {
    if(room.game && room.game.current >= room.players.length) room.game.current = 0;
    broadcast(room, { type:"room_update", code:room.code, players:room.players.length, count:room.players.length, maxPlayers:room.maxPlayers, names:getNames(room) });
    broadcast(room, { type:"player_left", code:room.code, players:room.players.length, maxPlayers:room.maxPlayers, names:getNames(room) });
    if(room.game) broadcastAll(room, { type:"game_state", code:room.code, game: publicGame(room) });
  }
  ws._roomCode=null; ws._score=0;
}
// ---- توليد طاولة 45 بطاقة - نفس توزيع اللعبة الأصلية (مستوى 1) ----
let _id = 1;
function card(type, value, amount, label, icon){ return { id:_id++, type, value: value||0, amount: amount||0, label: label||"", icon: icon||"", opened:false }; }
function buildDeck(){
  _id = 1;
  let deck = [];
  // نقاط: نفس توزيع الأصلية
  const pts = [1,1,1,3,3,3,5,5,5,10,10,10,-2,-2,-2,-5,-5,-5,-10,-10];
  pts.forEach(v=> deck.push(card("points", v, 0, v>0?("نقاط +"+v):("نقاط "+v), v>0?("+"+v):(""+v))));
  const specials = [
    ["nextLevel",0,0,"الانتقال للمستوى التالي","🚪"],
    ["reverse",0,0,"قلب الاتجاه","🔄"],["reverse",0,0,"قلب الاتجاه","🔄"],
    ["skip",0,0,"تخطي اللاعب","⏭️"],["skip",0,0,"تخطي اللاعب","⏭️"],
    ["steal",0,3,"سرقة 3 نقاط","💰"],["steal",0,3,"سرقة 3 نقاط","💰"],
    ["shield",0,0,"درع النقاط","🛡️"],["shield",0,0,"درع النقاط","🛡️"],
    ["replay",0,0,"إعادة التفعيل","♻️"],
    ["bomb",0,3,"خصم 3 نقاط","💣"],["bomb",0,3,"خصم 3 نقاط","💣"],
    ["shuffle",0,0,"إعادة قلب البطاقات","🔄"],
    ["reset",0,0,"تصفير الجميع","🧹"],
    ["doubleChoice",0,0,"اختيار مزدوج","🃏"],
    ["exchange",0,0,"تبادل النقاط","🔃"],
    ["resetShield",0,0,"حماية الرصيد","🔐"],
    ["points",7,0,"نقاط +7","+7"],["points",4,0,"نقاط +4","+4"],
    ["resetPlayer",0,0,"تصفير لاعب","💥"],
    ["exchangePlayers",0,0,"تبادل لاعبين","🔄"],
    ["bombShield",0,0,"درع القنبلة","🛡️"],
    ["stealShield",0,0,"درع السرقة","🛡️"],
    ["reflect",0,0,"عكس الهجوم","🪞"],
    ["doubleSelf",0,0,"ضاعف رصيدك","✖️2"],
    ["doubleTarget",0,0,"مضاعفة لاعب","🎯"],
  ];
  specials.forEach(s=> deck.push(card(s[0], s[1], s[2], s[3], s[4])));
  while(deck.length < 45) deck.push(card("points", [1,3,5,-2][deck.length%4], 0, "", ""));
  deck = deck.slice(0,45);
  for(let i=deck.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}
function publicGame(room){
  const g = room.game;
  if(!g) return null;
  return { cards: g.cards, scores: getScores(room), names: getNames(room), level: g.level, direction: g.direction, current: g.current, started: true, openedCount: g.cards.filter(c=>c.opened).length, lastCard: g.lastCard || null, lastMsg: g.lastMsg || "", winner: g.winner || null };
}
function nextTurn(room, steps){
  const g = room.game; if(!g) return;
  let n = room.players.length; if(!n) return;
  let cur = g.current;
  for(let i=0;i<steps;i++){ cur = (cur + g.direction + n) % n; }
  g.current = cur;
}
function tryMatch(maxPlayers){
  const q = queues[String(maxPlayers)];
  while(q.length >= maxPlayers){
    const players=[];
    while(players.length < maxPlayers && q.length>0){ const p=q.shift(); if(p.readyState===1) players.push(p); }
    if(players.length < maxPlayers){ players.forEach((p)=> q.unshift(p)); break; }
    const code = makeCode();
    const room = { code, maxPlayers, players, game:null };
    rooms.set(code, room);
    players.forEach((p)=>{ p._roomCode=code; p._score=0; });
    const names = getNames(room);
    players.forEach((p)=> send(p, { type:"match_found", code, players:players.length, count:players.length, maxPlayers, names }));
    players.forEach((p)=> send(p, { type:"joined", code, players:players.length, count:players.length, maxPlayers, names }));
    console.log("MATCH " + maxPlayers + ":", code, names.join(", "));
  }
}
function startGame(room){
  room.players.forEach(p=> p._score = 0);
  room.game = { cards: buildDeck(), level:1, direction:1, current:0, lastCard:null, lastMsg:"بدأت اللعبة - دور " + getNames(room)[0], winner:null };
  broadcastAll(room, { type:"game_started", code:room.code, maxPlayers:room.maxPlayers, names:getNames(room), game: publicGame(room) });
}
wss.on("connection", (ws)=>{
  ws._roomCode=null; ws._name="اللاعب 1"; ws._score=0;
  ws.on("message", (raw)=>{
    let d; try{ d=JSON.parse(raw.toString()); }catch(e){ return; }
    const type=(d.type||"").toLowerCase();
    if(d.name && String(d.name).trim()){ ws._name = String(d.name).trim().slice(0,20); }
    const wanted = normCount(d.maxPlayers || d.playerCount || d.count || d.players || 2);
    if(type==="create" || type==="create_room"){
      removeFromAllQueues(ws); removeFromRoom(ws);
      const maxPlayers=wanted; const code=makeCode();
      const room={ code, maxPlayers, players:[ws], game:null };
      rooms.set(code, room); ws._roomCode=code; ws._score=0;
      send(ws, { type:"room_created", code, players:1, count:1, maxPlayers, names:getNames(room) });
      return;
    }
    if(type==="join"){
      const code=String(d.code||d.roomCode||"").trim();
      removeFromAllQueues(ws);
      const room=rooms.get(code);
      if(!room){ send(ws,{ type:"error", message:"الغرفة غير موجودة" }); return; }
      if(room.players.length >= room.maxPlayers){ send(ws,{ type:"error", message:"الغرفة ممتلئة" }); return; }
      if(room.game){ send(ws,{ type:"error", message:"اللعبة بدأت، لا يمكن الدخول الآن" }); return; }
      removeFromRoom(ws);
      room.players.push(ws); ws._roomCode=code; ws._score=0;
      const names=getNames(room);
      send(ws, { type:"joined", code, players:room.players.length, count:room.players.length, maxPlayers:room.maxPlayers, names });
      broadcast(room, { type:"player_joined", code, players:room.players.length, count:room.players.length, maxPlayers:room.maxPlayers, names }, ws);
      return;
    }
    if(type==="quick_play" || type==="find_match" || type==="search" || type==="matchmaking"){
      removeFromRoom(ws); removeFromAllQueues(ws);
      const maxPlayers=wanted;
      const q=queues[String(maxPlayers)];
      if(!q.includes(ws)) q.push(ws);
      send(ws, { type:"searching", maxPlayers, message:"جاري البحث..." });
      tryMatch(maxPlayers);
      return;
    }
    if(type==="cancel_search" || type==="stop_search"){ removeFromAllQueues(ws); send(ws,{ type:"search_cancelled" }); return; }
    if(type==="start"){
      const room=rooms.get(ws._roomCode);
      if(!room) return;
      if(room.players.length < room.maxPlayers){ send(ws,{ type:"error", message:"مازال ناقص لاعبين" }); return; }
      if(room.game){ send(ws,{ type:"game_started", code:room.code, game: publicGame(room) }); return; }
      startGame(room);
      return;
    }
    if(type==="leave"){ removeFromAllQueues(ws); removeFromRoom(ws); send(ws,{ type:"left" }); return; }
    // ---- اللعب: كشف بطاقة واحدة ----
    if(type==="play_card" || type==="move" || type==="game"){
      const room=rooms.get(ws._roomCode);
      if(!room || !room.game) return;
      const g = room.game;
      if(g.winner) return;
      const myIdx = room.players.indexOf(ws);
      if(myIdx === -1) return;
      if(myIdx !== g.current){ send(ws,{ type:"error", message:"مش دورك" }); return; }
      const idx = parseInt(d.index ?? d.cardIndex ?? -1, 10);
      if(isNaN(idx) || idx<0 || idx>=g.cards.length) return;
      const c = g.cards[idx];
      if(c.opened){ send(ws,{ type:"error", message:"البطاقة مكشوفة" }); return; }
      c.opened = true;
      g.lastCard = c;
      let msg = "";
      let steps = 1;
      // تطبيق النقاط مباشرة في السيرفر - نفس مبدأ اللعبة
      if(c.type === "points"){
        ws._score = (ws._score||0) + (c.value||0);
        msg = c.value>0 ? (ws._name + " حصل على +" + c.value + " نقطة 🎉") : (ws._name + " خسر " + Math.abs(c.value) + " نقطة 😬");
      } else if(c.type === "reverse"){
        g.direction = -g.direction;
        msg = "🔄 " + ws._name + " قلب اتجاه اللعب";
      } else if(c.type === "skip"){
        steps = 2; msg = "⏭️ " + ws._name + " تخطى اللاعب التالي";
      } else if(c.type === "bomb"){
        ws._score = (ws._score||0) - 3;
        msg = "💣 " + ws._name + " خسر 3 نقاط بالقنبلة";
      } else if(c.type === "steal"){
        // سرقة 3 من اللاعب التالي إن أمكن
        let targetIdx = (g.current + g.direction + room.players.length) % room.players.length;
        let target = room.players[targetIdx];
        let take = Math.min(3, Math.max(0, target._score||0));
        target._score = (target._score||0) - take;
        ws._score = (ws._score||0) + take;
        msg = "💰 " + ws._name + " سرق " + take + " نقطة من " + (target._name||"");
      } else if(c.type === "doubleSelf"){
        ws._score = (ws._score||0) * 2;
        msg = "✖️2 " + ws._name + " ضاعف رصيده";
      } else if(c.type === "reset"){
        room.players.forEach(p=> p._score = 0);
        msg = "🧹 تم تصفير الجميع";
      } else {
        msg = "✨ " + ws._name + " كشف: " + (c.label || c.type);
      }
      g.lastMsg = msg;
      // هل انتهت الطاولة؟
      if(g.cards.every(x=>x.opened)){
        let scores = getScores(room);
        let max = Math.max(...scores);
        let winners = room.players.filter(p=> (p._score||0)===max);
        g.winner = winners.length===1 ? winners[0]._name : "تعادل";
        g.lastMsg = winners.length===1 ? ("🏆 الفائز هو " + g.winner + " برصيد " + max + " نقطة") : ("🏆 تعادل برصيد " + max);
        broadcastAll(room, { type:"game_over", code:room.code, game: publicGame(room) });
        return;
      }
      nextTurn(room, steps);
      g.lastMsg = msg + " - دور " + getNames(room)[g.current];
      broadcastAll(room, { type:"card_revealed", code:room.code, index:idx, card:c, game: publicGame(room) });
      return;
    }
  });
  ws.on("close", ()=>{ removeFromAllQueues(ws); removeFromRoom(ws); });
});
server.listen(PORT, ()=>{ console.log("WS V11 FINAL - shared board - listening on " + PORT); });
