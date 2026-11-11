// server-final-v6.js - V16 - كل البطاقات تخدم + وقت 20 ثانية
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const PORT = process.env.PORT || 10000;
const TURN_MS = 20000;
const SEARCH_WAIT_MS = 12000;
const BOT_NAMES = ["سيف","نور","لينا","آدم","يوسف","مريم","كريم","سارة","أمين","ريان","أيمن","هدى","عمر","ليلى","أنس","دنيا","فارس","رنا","سليم","نادية","إلياس","خديجة","وليد","أمينة","طارق","سعاد","ياسين","منال","بلال","إيمان"];
function randomBotName(used){ let pool=BOT_NAMES.filter(n=>!used.includes(n)); if(pool.length===0) pool=BOT_NAMES; return pool[Math.floor(Math.random()*pool.length)]; }
function makeBot(name){ return { _name:name, _score:0, _shields:newShields(), _isBot:true, readyState:1, send:()=>{}, on:()=>{}, close:()=>{} }; }
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(__dirname, urlPath);
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
function getShields(room){ return room.players.map((p)=> p._shields || newShields()); }
function newShields(){ return {shield:0,bombShield:0,stealShield:0,resetShield:0,reflect:0,shieldReverse:0,shieldSkip:0,goldenShield:0,cancelShuffle:0,cancelReplay:0,freeze:0}; }
function removeFromAllQueues(ws){ ["2","3","4"].forEach((k)=>{ queues[k]=queues[k].filter((p)=>p!==ws); }); }
function clearTimer(room){ if(room._timer){ clearTimeout(room._timer); room._timer=null; } }
function removeFromRoom(ws){
  if(ws._removeTimer){ clearTimeout(ws._removeTimer); ws._removeTimer=null; }
  ws._disconnected=false; ws._pendingRemove=false;
  if(ws._searchTimer){ clearTimeout(ws._searchTimer); ws._searchTimer=null; }
  if(!ws._roomCode) return;
  const room = rooms.get(ws._roomCode);
  if(!room) return;
  clearTimer(room);
  room.players = room.players.filter((p)=>p!==ws);
  if(room.players.length===0){ rooms.delete(ws._roomCode); }
  else {
    if(room.game && room.game.current >= room.players.length) room.game.current = 0;
    broadcast(room, { type:"room_update", code:room.code, players:room.players.length, count:room.players.length, maxPlayers:room.maxPlayers, names:getNames(room) });
    broadcast(room, { type:"player_left", code:room.code, players:room.players.length, maxPlayers:room.maxPlayers, names:getNames(room) });
    // مع البوتات: إذا ما بقاش حتى لاعب حقيقي، نحذف الغرفة (البوتات وحدهم ما يلعبوش)
    let realLeft = room.players.filter(pp=> !pp._isBot);
    if(realLeft.length===0){ rooms.delete(ws._roomCode); return; }
    // إذا بقى لاعب حقيقي واحد و ما كاينش بوتات: يحسب فائز. إذا كاين بوتات معاه، يكمل يلعب ضدهم، ما هوش وحدو
    if(room.game && !room.game.winner && room.players.length===1 && realLeft.length===1){
      clearTimer(room);
      room.game.winner = room.players[0]._name;
      room.game.lastMsg = "🏆 فزت باللعبة لأن اللاعبين الآخرين خرجوا!";
      room.game.pending = null;
      broadcastAll(room, { type:"game_over", code:room.code, game: publicGame(room), reason:"alone", winner: room.players[0]._name });
      return;
    }
    if(room.game){ startTurnTimer(room); broadcastAll(room, { type:"game_state", code:room.code, game: publicGame(room) }); }
  }
  ws._roomCode=null; ws._score=0; ws._shields=newShields();
}
let _id = 1;
function card(type, value, amount, label, icon){ return { id:_id++, type, value: value||0, amount: amount||0, label: label||"", icon: icon||"", opened:false }; }
function buildDeck(level){
  _id = 1; let deck = [];
  const pts = [1,1,1,3,3,3,5,5,5,10,10,10,-2,-2,-2,-5,-5,-5,-10,-10];
  pts.forEach(v=> deck.push(card("points", v, 0, v>0?("نقاط +"+v):("نقاط "+v), v>0?("+"+v):(""+v))));
  if(level===1){
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
  } else if(level===2){
    const specials = [
      ["nextLevel",0,0,"الانتقال للمستوى التالي","🚪"],
      ["doubleTarget",0,0,"مضاعفة لاعب","🎯"],["doubleSelf",0,0,"ضاعف رصيدك","✖️2"],
      ["reverse",0,0,"قلب الاتجاه","🔄"],["skip",0,0,"تخطي اللاعب","⏭️"],
      ["resetPlayer",0,0,"تصفير لاعب","💥"],["exchange",0,0,"تبادل النقاط","🔃"],["exchangePlayers",0,0,"تبادل لاعبين","🔄"],
      ["freeze",0,0,"تجميد لاعب","🧊"],["reset",0,0,"تصفير الجميع","🧹"],
      ["stealAll",0,0,"سرقة الكل","🧑‍🤝‍🧑"],["reflect",0,0,"عكس الهجوم","🪞"],
      ["steal",0,5,"سرقة 5 نقاط","💰"],["replay",0,0,"إعادة التفعيل","♻️"],
      ["reverseBalances",0,0,"عكس أرصدة الخصوم","🔄"],
      ["shieldSteal",0,0,"درع ضد السرقة","🛡️"],["resetShield",0,0,"حماية الرصيد","🔐"],
      ["shieldReverse",0,0,"درع ضد قلب الاتجاه","🛡️"],["shieldSkip",0,0,"درع ضد التخطي","🛡️"],
      ["goldenShield",0,0,"الدرع الذهبي","🏆"],["doubleChoice",0,0,"اختيار مزدوج","🃏"],
      ["randomBalances",0,0,"خلط النقاط","🎲"],["bombAll",0,0,"قنبلة الخصوم −5","💣"],
      ["cancelShuffle",0,0,"إلغاء القلب","🚫"],["cancelReplay",0,0,"إلغاء إعادة التفعيل","🚫"],
      ["shuffle",0,0,"إعادة قلب البطاقات","🔄"],["nextLevel",0,0,"الانتقال للمستوى التالي","🚪"],
    ];
    specials.forEach(s=> deck.push(card(s[0], s[1], s[2], s[3], s[4])));
  } else {
    const specials = [
      ["doubleTarget",0,0,"مضاعفة لاعب","🎯"],["doubleSelf",0,0,"ضاعف رصيدك","✖️2"],
      ["reverse",0,0,"قلب الاتجاه","🔄"],["skip",0,0,"تخطي اللاعب","⏭️"],
      ["resetPlayer",0,0,"تصفير لاعب","💥"],["exchange",0,0,"تبادل النقاط","🔃"],["exchangePlayers",0,0,"تبادل لاعبين","🔄"],
      ["freeze",0,0,"تجميد لاعب","🧊"],["reset",0,0,"تصفير الجميع","🧹"],
      ["stealAll",0,0,"سرقة الكل","🧑‍🤝‍🧑"],["reflect",0,0,"عكس الهجوم","🪞"],
      ["steal",0,5,"سرقة 5 نقاط","💰"],["replay",0,0,"إعادة التفعيل","♻️"],
      ["reverseBalances",0,0,"عكس أرصدة الخصوم","🔄"],
      ["shieldSteal",0,0,"درع ضد السرقة","🛡️"],["resetShield",0,0,"حماية الرصيد","🔐"],
      ["shieldReverse",0,0,"درع ضد قلب الاتجاه","🛡️"],["shieldSkip",0,0,"درع ضد التخطي","🛡️"],
      ["goldenShield",0,0,"الدرع الذهبي","🏆"],["doubleChoice",0,0,"اختيار مزدوج","🃏"],
      ["randomBalances",0,0,"خلط النقاط","🎲"],["bombAll",0,0,"قنبلة الخصوم −5","💣"],
      ["cancelShuffle",0,0,"إلغاء القلب","🚫"],["cancelReplay",0,0,"إلغاء إعادة التفعيل","🚫"],
      ["randomPoints",0,0,"نقاط عشوائية","🎲"],["shuffle",0,0,"إعادة قلب البطاقات","🔄"],
    ];
    specials.forEach(s=> deck.push(card(s[0], s[1], s[2], s[3], s[4])));
  }
  while(deck.length < 45) deck.push(card("points", [1,3,5,-2][deck.length%4], 0, "", ""));
  deck = deck.slice(0,45);
  for(let i=deck.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}
function publicGame(room){
  const g = room.game; if(!g) return null;
  let timeLeft = 20;
  if(room._deadline) timeLeft = Math.max(0, Math.ceil((room._deadline - Date.now())/1000));
  return { cards: g.cards, scores: getScores(room), names: getNames(room), shields: getShields(room), level: g.level, direction: g.direction, current: g.current, started: true, openedCount: g.cards.filter(c=>c.opened).length, lastCard: g.lastCard || null, lastMsg: g.lastMsg || "", winner: g.winner || null, pending: g.pending || null, timeLeft, turnMs: TURN_MS };
}
function nextPlayerIdx(room, from, steps){
  let n = room.players.length; let cur = from;
  for(let i=0;i<steps;i++){ cur = (cur + room.game.direction + n) % n; }
  return cur;
}
function advanceTurn(room, steps){
  const g = room.game; if(!g) return;
  let n = room.players.length;
  let cur = g.current;
  let guard = 0;
  for(let s=0;s<steps && guard<10;s++){
    cur = (cur + g.direction + n) % n;
    // تجميد: إذا اللاعب مجمد، نقص دور تجميد و فوتو
    let sh = room.players[cur]._shields || newShields();
    if(sh.freeze>0){ sh.freeze--; room.players[cur]._shields=sh; g.lastMsg = "🧊 تم تخطي دور "+room.players[cur]._name+" بسبب التجميد"; s--; guard++; continue; }
    guard++;
  }
  g.current = cur;
}
function startTurnTimer(room){
  clearTimer(room);
  if(!room.game || room.game.winner) return;
  // البوت يناظر 6 ثواني قبل ما يلعب، كيما البنادم يخمم - ماشي بسرعة و ماشي بطيئة
  let cur = room.players[room.game.current];
  if(cur && cur._isBot){
    room._deadline = Date.now() + 7000;
    // 6 ثواني + شوية عشوائية (5.5 - 6.5 ثانية) باش ما يبانش روبوتي
    room._timer = setTimeout(()=>{ try{ botTakeTurn(room); }catch(e){ console.error('bot timer error', e); try{ room.game.pending=null; }catch(_){} finishTurn(room); } }, 5500 + Math.floor(Math.random()*1000));
    return;
  }
  room._deadline = Date.now() + TURN_MS;
  room._timer = setTimeout(()=>{
    const g = room.game; if(!g || g.winner) return;
    // إذا كان هناك اختيار معلق، نلغيه و نفوت الدور
    if(g.pending){
      g.pending = null;
      g.lastMsg = "⏱️ انتهى الوقت - تم إلغاء الاختيار";
      advanceTurn(room, 1);
    } else {
      g.lastMsg = "⏱️ انتهى الوقت - تم تخطي دور "+room.players[g.current]._name;
      advanceTurn(room, 1);
    }
    broadcastAll(room, { type:"game_state", code:room.code, game: publicGame(room) });
    startTurnTimer(room);
  }, TURN_MS);
}
function checkEnd(room){
  const g = room.game;
  if(g.cards.every(x=>x.opened)){
    let scores = getScores(room); let max = Math.max(...scores);
    let winners = room.players.filter(p=> (p._score||0)===max);
    g.winner = winners.length===1 ? winners[0]._name : "تعادل";
    g.lastMsg = winners.length===1 ? ("🏆 الفائز هو " + g.winner + " برصيد " + max + " نقطة") : ("🏆 تعادل برصيد " + max);
    clearTimer(room);
    broadcastAll(room, { type:"game_over", code:room.code, game: publicGame(room) });
    return true;
  }
  return false;
}
function finishTurn(room){
  if(checkEnd(room)) return;
  advanceTurn(room, 1);
  broadcastAll(room, { type:"game_state", code:room.code, game: publicGame(room) });
  startTurnTimer(room);
}
function tryMatch(maxPlayers){
  const q = queues[String(maxPlayers)];
  while(q.length >= maxPlayers){
    const players=[];
    while(players.length < maxPlayers && q.length>0){ const p=q.shift(); if(p.readyState===1) players.push(p); }
    if(players.length < maxPlayers){ players.forEach((p)=> q.unshift(p)); break; }
    const code = makeCode();
    const room = { code, maxPlayers, players, game:null, _timer:null, _deadline:0 };
    rooms.set(code, room);
    players.forEach((p)=>{ p._roomCode=code; p._score=0; p._shields=newShields(); });
    const names = getNames(room);
    players.forEach((p)=> send(p, { type:"match_found", code, players:players.length, count:players.length, maxPlayers, names }));
    players.forEach((p)=> send(p, { type:"joined", code, players:players.length, count:players.length, maxPlayers, names }));
  }
}
function startGame(room){
  room.players.forEach(p=>{ p._score = 0; p._shields=newShields(); });
  room.game = { cards: buildDeck(1), level:1, direction:1, current:0, lastCard:null, lastMsg:"بدأت اللعبة - دور " + getNames(room)[0], winner:null, pending:null };
  broadcastAll(room, { type:"game_started", code:room.code, maxPlayers:room.maxPlayers, names:getNames(room), game: publicGame(room) });
  startTurnTimer(room);
}
// تطبيق تأثير بطاقة بدون اختيار (تستعمل لإعادة التفعيل و الاختيار المزدوج)
function applySimple(room, actorIdx, c, cbDone){
  const g = room.game; const actor = room.players[actorIdx];
  const shieldMap = {shield:"shield",bombShield:"bombShield",stealShield:"stealShield",resetShield:"resetShield",reflect:"reflect",shieldReverse:"shieldReverse",shieldSkip:"shieldSkip",goldenShield:"goldenShield",cancelShuffle:"cancelShuffle",cancelReplay:"cancelReplay"};
  if(shieldMap[c.type]){
    let k = shieldMap[c.type]; actor._shields[k]=(actor._shields[k]||0)+1;
    g.lastMsg = "🛡️ "+actor._name+" حصل على "+(c.label||"درع");
    return cbDone(false);
  }
  if(c.type==="points"){
    let v=c.value||0;
    if(v<0 && (actor._shields.shield||0)>0){ actor._shields.shield--; g.lastMsg="🛡️ "+actor._name+" استخدم درع النقاط وألغى خسارة "+Math.abs(v)+" نقطة"; return cbDone(false); }
    actor._score=(actor._score||0)+v;
    g.lastMsg = v>0 ? (actor._name+" حصل على +"+v+" نقطة 🎉") : (actor._name+" خسر "+Math.abs(v)+" نقطة 😬");
    return cbDone(false);
  }
  if(c.type==="doubleSelf"){ if((actor._score||0)>0){ actor._score=(actor._score||0)*2; g.lastMsg="✖️2 تضاعف رصيد "+actor._name+" 🎉"; } else { g.lastMsg="✖️2 رصيد "+actor._name+" سالب أو صفر، ما تضاعفش"; } return cbDone(false); }
  if(c.type==="reset"){
    // تأكيد في الأصل، هنا نطبق مباشرة بعد التأكيد من العميل
    room.players.forEach((p,i)=>{ if(i===actorIdx) return; let s=p._shields; if((s.goldenShield||0)>0) s.goldenShield--; else if((s.resetShield||0)>0) s.resetShield--; else p._score=0; });
    g.lastMsg="🧹 تم تصفير الأرصدة ما عدا المحميين بالدروع"; return cbDone(false);
  }
  if(c.type==="stealAll"){
    let total=0;
    room.players.forEach((p,i)=>{ if(i===actorIdx) return; let s=p._shields; if((s.goldenShield||0)>0) s.goldenShield--; else if((s.stealShield||0)>0) s.stealShield--; else { let take=Math.max(0,p._score||0); total+=take; p._score=(p._score||0)-take; } });
    actor._score=(actor._score||0)+total; g.lastMsg="🧑‍🤝‍🧑 أخذت صافي "+total+" نقطة من أرصدة الخصوم"; return cbDone(false);
  }
  if(c.type==="reverseBalances"){ room.players.forEach((p,i)=>{ if(i===actorIdx) return; if((p._shields.goldenShield||0)>0){ p._shields.goldenShield--; return; } if((p._score||0)>0) p._score=-(p._score||0); }); g.lastMsg="🔄 تم عكس أرصدة الخصوم (الموجبة فقط، الذهبي يحمي)"; return cbDone(false); }
  if(c.type==="bombAll"){
    room.players.forEach((p,i)=>{ if(i===actorIdx) return; let s=p._shields; if((s.goldenShield||0)>0) s.goldenShield--; else if((s.bombShield||0)>0) s.bombShield--; else p._score=(p._score||0)-5; });
    g.lastMsg="💣 تم خصم 5 نقاط من كل الخصوم غير المحميين"; return cbDone(false);
  }
  if(c.type==="randomPoints"){ let arr=[-10,-5,-2,1,3,5,7,10]; let v=arr[Math.floor(Math.random()*arr.length)]; actor._score=(actor._score||0)+v; g.lastMsg="🎲 "+actor._name+" "+(v>0?"حصل على +":"خسر ")+Math.abs(v)+" نقطة عشوائية"; return cbDone(false); }
  if(c.type==="randomBalances"){
    // الدرع الذهبي يثبت رصيد صاحبو، نخلط غير الباقيين
    let idxs=room.players.map((p,i)=>i).filter(i=> i!==actorIdx && !((room.players[i]._shields.goldenShield||0)>0));
    // نستهلك الذهبي للمحميين
    room.players.forEach((p,i)=>{ if(i!==actorIdx && (p._shields.goldenShield||0)>0) p._shields.goldenShield--; });
    let scores=idxs.map(i=> room.players[i]._score||0);
    for(let i=scores.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [scores[i],scores[j]]=[scores[j],scores[i]]; }
    idxs.forEach((pi,k)=>{ room.players[pi]._score=scores[k]; });
    g.lastMsg="🎲 تم خلط أرصدة اللاعبين (الذهبي يثبت رصيدو)"; return cbDone(false);
  }
  if(c.type==="reverse"){
    let nxt = nextPlayerIdx(room, actorIdx, 1);
    let s = room.players[nxt]._shields;
    if((s.shieldReverse||0)>0){ s.shieldReverse--; g.lastMsg="🛡️ تم إلغاء قلب الاتجاه بواسطة درع"; return cbDone(false); }
    g.direction=-g.direction; g.lastMsg="🔄 تم قلب اتجاه اللعب"; return cbDone(false);
  }
  if(c.type==="skip"){
    let nxt = nextPlayerIdx(room, actorIdx, 1);
    let s = room.players[nxt]._shields;
    if((s.shieldSkip||0)>0){ s.shieldSkip--; g.lastMsg="🛡️ درع التخطي منع التأثير"; return cbDone(false); }
    g.lastMsg="⏭️ سيتم تخطي اللاعب التالي!"; return cbDone(true); // تخطي = دور إضافي
  }
  return cbDone(false, true); // يحتاج pending
}

    function handleCardEffect(room, actorIdx, c, isReplay){
      const g=room.game;
      // بطاقات تحتاج هدف - تبادل (مع لاعب / لاعبين) يروح لسؤال تأكيد أولا، لأنو ممكن ما يفيدكش
      const targetKinds={steal:"steal",bomb:"bomb",doubleTarget:"doubleTarget",resetPlayer:"resetPlayer",freeze:"freeze"};
      if(targetKinds[c.type]){
        g.pending={kind:targetKinds[c.type],actor:actorIdx,cardId:c.id,amount:c.amount||0,first:null};
        g.lastMsg="🎯 اختر لاعبًا لتفعيل: "+(c.label||c.type);
        broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return;
      }
      if(c.type==="exchange"||c.type==="exchangePlayers"||c.type==="shuffle"||c.type==="nextLevel"||c.type==="reset"||c.type==="stealAll"||c.type==="reverseBalances"||c.type==="bombAll"||c.type==="randomBalances"){
        g.pending={kind:"confirm",actor:actorIdx,cardId:c.id,confirmType:c.type};
        g.lastMsg="❓ هل تريد تفعيل: "+(c.label||c.type)+"؟";
        broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return;
      }
      if(c.type==="replay"){
        let openedIdx=g.cards.map((x,i)=>i).filter(i=> g.cards[i].opened && g.cards[i].id!==c.id);
        if(openedIdx.length===0){ g.lastMsg="لا توجد بطاقة مكشوفة لإعادة تفعيلها"; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
        // إلغاء إعادة التفعيل؟ أي خصم عندو الدرع يقدر يلغي، ماشي غير اللي بعدك
        let canceller=room.players.findIndex((pp,ii)=> ii!==actorIdx && (pp._shields.cancelReplay||0)>0);
        if(canceller!==-1){ room.players[canceller]._shields.cancelReplay--; g.lastMsg="🚫 أُلغيت إعادة التفعيل بواسطة "+room.players[canceller]._name; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
        g.pending={kind:"replay",actor:actorIdx,cardId:c.id};
        g.lastMsg="♻️ اختر بطاقة مكشوفة لإعادة تفعيلها";
        broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return;
      }
      if(c.type==="doubleChoice"){
        let closedCount=g.cards.filter(x=> !x.opened).length;
        if(closedCount===1){ let onlyIdx=g.cards.findIndex(x=> !x.opened); let only=g.cards[onlyIdx]; only.opened=true; g.lastCard=only; g.lastMsg="🃏 بقات بطاقة واحدة برك - فعلناها"; handleCardEffect(room, actorIdx, only, false); return; }
        if(closedCount===0){ g.lastMsg="🃏 ما بقاوش بطاقات مغلقة"; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
        g.pending={kind:"double",actor:actorIdx,cardId:c.id};
        g.lastMsg="🃏 اكشف بطاقتين مغلقتين ثم اختر واحدة لتفعيلها";
        broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return;
      }
      // بطاقات مباشرة
      let skipExtra=false;
      applySimple(room, actorIdx, c, (extra, needsPending)=>{ skipExtra=extra; });
      broadcastAll(room,{type:"card_revealed",code:room.code,game:publicGame(room)});
      if(checkEnd(room)) return;
      if(skipExtra){ advanceTurn(room, 2); broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); }
      else finishTurn(room);
    }

function botTakeTurn(room){
  try{
  const g=room.game; if(!g || g.winner) return;
  clearTimer(room);
  let actorIdx=g.current;
  let bot=room.players[actorIdx];
  if(!bot || !bot._isBot){ startTurnTimer(room); return; }
  // إذا كان هناك اختيار معلق للبوت، يختار عشوائيا
  if(g.pending && g.pending.actor===actorIdx){
    let pend=g.pending;
    if(["steal","bomb","doubleTarget","resetPlayer","exchange","freeze","exchangePlayers"].includes(pend.kind)){
      // اختر هدف عشوائي (ما عدا نفسه إلا في تبادل لاعبين)
      // تبادل لاعبين: تقدر تختار نفسك كذلك - مع لاعبين فقط، الثاني هو انت
      // باقي البطاقات: ما تقدرش تختار نفسك
      let candidates=room.players.map((_,i)=>i).filter(i=> i!==actorIdx || pend.kind==="exchangePlayers");
      if(pend.kind==="exchangePlayers" && pend.first!=null) candidates=candidates.filter(i=> i!==pend.first);
      if(candidates.length===0){ g.pending=null; finishTurn(room); return; }
      let t=candidates[Math.floor(Math.random()*candidates.length)];
      // نستدعي نفس منطق choose_target عبر دالة مساعدة: نحاكي الرسالة
      handleBotTarget(room, actorIdx, pend, t);
      return;
    }
    if(pend.kind==="confirm"){
      let yes=Math.random()<0.75;
      // التبادل: البوت يخمم - إذا رصيدو صغير و رصيد الخصم كبير، التبادل يفيدو فيقبل. إذا رصيدو كبير، يرفض
      if(pend.confirmType==="exchange"){
        let myScore=room.players[actorIdx]._score||0;
        let maxOther=Math.max(...room.players.map((pp,ii)=> ii===actorIdx?-9999:(pp._score||0)));
        yes = myScore < maxOther ? (Math.random()<0.85) : (Math.random()<0.15);
      } else if(pend.confirmType==="exchangePlayers"){
        // تبادل لاعبين: إذا الفرق بين أكبر و أصغر رصيد كبير، التبادل يخلط المتصدر فيقبل
        let scores=room.players.map(pp=> pp._score||0);
        let diff=Math.max(...scores)-Math.min(...scores);
        yes = diff>5 ? (Math.random()<0.8) : (Math.random()<0.4);
      }
      handleBotConfirm(room, actorIdx, pend, yes);
      return;
    }
    if(pend.kind==="replay"){
      let opened=g.cards.map((x,i)=>i).filter(i=> g.cards[i].opened && g.cards[i].id!==pend.cardId);
      if(opened.length===0){ g.pending=null; finishTurn(room); return; }
      let pick=opened[Math.floor(Math.random()*opened.length)];
      let chosen=g.cards[pick]; g.pending=null; g.lastCard=chosen; g.lastMsg="♻️ "+bot._name+" أعاد تفعيل: "+(chosen.label||chosen.type);
      handleCardEffect(room, actorIdx, chosen, true);
      return;
    }
    if(pend.kind==="double"){
      let closed=g.cards.map((x,i)=>i).filter(i=> !g.cards[i].opened);
      if(closed.length===0){ g.pending=null; finishTurn(room); return; }
      if(closed.length===1){ let only=g.cards[closed[0]]; only.opened=true; g.pending=null; g.lastCard=only; g.lastMsg="🃏 بقات بطاقة واحدة برك - فعلناها"; handleCardEffect(room, actorIdx, only, false); return; }
      if(closed.length<2){ g.pending=null; finishTurn(room); return; }
      // اختر 2 عشوائيا
      for(let i=closed.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [closed[i],closed[j]]=[closed[j],closed[i]]; }
      let picks=[closed[0], closed[1]];
      g.cards[picks[0]].opened=true; g.cards[picks[1]].opened=true;
      g.pending={kind:"double_choose",actor:actorIdx,picks,cardId:pend.cardId};
      g.lastMsg="🃏 "+bot._name+" اختار بطاقتين";
      broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return;
    }
    if(pend.kind==="double_choose"){
      let pick=pend.picks[Math.floor(Math.random()*pend.picks.length)];
      let chosen=g.cards[pick];
      pend.picks.forEach(i=>{ if(i!==pick) g.cards[i].opened=false; });
      g.cards[pick].opened=true; g.pending=null; g.lastCard=chosen;
      handleCardEffect(room, actorIdx, chosen, false);
      return;
    }
    g.pending=null; finishTurn(room); return;
  }
  // دور عادي: اختر بطاقة مغلقة عشوائية
  let closed=g.cards.map((x,i)=>i).filter(i=> !g.cards[i].opened);
  if(closed.length===0){ checkEnd(room); return; }
  let idx=closed[Math.floor(Math.random()*closed.length)];
  let c=g.cards[idx]; c.opened=true; g.lastCard=c;
  handleCardEffect(room, actorIdx, c, false);
  }catch(e){ console.error("bot error", e && e.stack || e); try{ room.game.pending=null; }catch(_){} finishTurn(room); }
}
function handleBotTarget(room, actorIdx, pend, targetIdx){
  // نفس منطق choose_target لكن للبوت: نستدعي عبر إنشاء pending مؤقت ونطبق
  const g=room.game; let actor=room.players[actorIdx], target=room.players[targetIdx];
  let ts=target._shields;
  g.pending=null; clearTimer(room);
  if((ts.goldenShield||0)>0 && ["steal","bomb","doubleTarget","resetPlayer","exchange","freeze","exchangePlayers"].includes(pend.kind)){
    ts.goldenShield--; g.lastMsg="🏆 الدرع الذهبي منع التأثير على "+target._name;
    broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return;
  }
  if(pend.kind==="steal"){
    let amt=pend.amount||3;
    if((ts.stealShield||0)>0){ ts.stealShield--; g.lastMsg="🛡️ الدرع منع السرقة"; }
    else if((ts.reflect||0)>0){ let take=Math.min(amt,Math.max(0,actor._score||0)); ts.reflect--; actor._score-=take; target._score+=take; g.lastMsg="🪞 انعكست السرقة - المهاجم خسر "+take; }
    else { let take=Math.min(amt,Math.max(0,target._score||0)); target._score-=take; actor._score+=take; g.lastMsg="💰 "+actor._name+" سرق "+take+" من "+target._name; }
  } else if(pend.kind==="bomb"){
    let amt=pend.amount||3;
    if((ts.bombShield||0)>0){ ts.bombShield--; g.lastMsg="🧨 درع القنبلة حمى "+target._name; }
    else { target._score-=amt; g.lastMsg="💣 "+actor._name+" فجر "+target._name+" -"+amt; }
  } else if(pend.kind==="doubleTarget"){
    if((ts.reflect||0)>0){ ts.reflect--; if((actor._score||0)>0) actor._score*=2; g.lastMsg="🪞 انعكست المضاعفة"; }
    else { if((target._score||0)>0){ target._score*=2; g.lastMsg="🎯 تضاعف رصيد "+target._name; } else { g.lastMsg="🎯 رصيد "+target._name+" سالب أو صفر، ما تضاعفش"; } }
  } else if(pend.kind==="resetPlayer"){
    if((ts.resetShield||0)>0){ ts.resetShield--; g.lastMsg="🔐 درع التصفير حمى "+target._name; }
    else { target._score=0; g.lastMsg="💥 تم تصفير "+target._name; }
  } else if(pend.kind==="exchange"){ let tmp=actor._score; actor._score=target._score; target._score=tmp; g.lastMsg="🔃 تم تبادل الرصيدين"; }
  else if(pend.kind==="freeze"){ target._shields.freeze=2; g.lastMsg="🧊 تم تجميد "+target._name; }
  else if(pend.kind==="exchangePlayers"){
    if(pend.first==null){ g.pending={kind:"exchangePlayers",actor:actorIdx,first:targetIdx,cardId:pend.cardId}; g.lastMsg="اختر اللاعب الثاني للتبادل - الأول هو "+room.players[targetIdx]._name; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return; }
    else { let first=room.players[pend.first]; if(targetIdx===pend.first){ g.pending=pend; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return; } let tmp=first._score; first._score=target._score; target._score=tmp; g.lastMsg="تم تبادل رصيد "+first._name+" و "+target._name; }
  }
  broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room);
}
function handleBotConfirm(room, actorIdx, pend, yes){
  const g=room.game; g.pending=null; clearTimer(room);
  if(!yes){ g.lastMsg="تم إلغاء التفعيل"; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
  if(pend.confirmType==="shuffle"){
    let canceller=room.players.findIndex((pp,ii)=> ii!==actorIdx && (pp._shields.cancelShuffle||0)>0);
    if(canceller!==-1){ room.players[canceller]._shields.cancelShuffle--; g.lastMsg="🚫 تم إلغاء القلب بواسطة "+room.players[canceller]._name; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
    g.cards.forEach(x=> x.opened=false);
    for(let i=g.cards.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [g.cards[i],g.cards[j]]=[g.cards[j],g.cards[i]]; }
    g.lastMsg="🔄 تم قلب كل البطاقات وخلطها!";
  } else if(pend.confirmType==="nextLevel"){
    let canceller=room.players.findIndex((pp,ii)=> ii!==actorIdx && (pp._shields.cancelShuffle||0)>0);
    if(canceller!==-1){ room.players[canceller]._shields.cancelShuffle--; g.lastMsg="🚫 تم إلغاء الانتقال بواسطة "+room.players[canceller]._name; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
    if(g.level>=3){ g.lastMsg="أنت في آخر مستوى!"; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
    g.level++; g.cards=buildDeck(g.level); room.players.forEach(p=> p._shields=newShields());
    g.lastMsg="🎉 انتقلتم إلى المستوى "+g.level+"!";
  } else if(["reset","stealAll","reverseBalances","bombAll","randomBalances"].includes(pend.confirmType)){
    applySimple(room, actorIdx, {type:pend.confirmType}, ()=>{});
  } else if(pend.confirmType==="exchange"||pend.confirmType==="exchangePlayers"){
    g.pending={kind:pend.confirmType,actor:actorIdx,cardId:pend.cardId,amount:0,first:null};
    g.lastMsg="🎯 اختر لاعبًا لتفعيل التبادل";
    broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return;
  }
  broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room);
}

// حارس: إذا اللعبة معلقة بلا تايمر (بوت ما لعبش)، يعاود يشغل الدور بعد 5 ثواني
setInterval(()=>{
  try{
    rooms.forEach((room)=>{
      if(!room.game || room.game.winner) return;
      if(room._timer) return; // كاين تايمر يخدم
      // ما كاش تايمر - الجولة معلقة، يعاود يشغلها
      console.log("watchdog: restarting stuck room", room.code, "current", room.game.current);
      startTurnTimer(room);
    });
  }catch(e){ console.error("watchdog error", e); }
}, 5000);
process.on("uncaughtException", (e)=>{ console.error("uncaught", e && e.stack || e); });
process.on("unhandledRejection", (e)=>{ console.error("unhandled", e && e.stack || e); });
wss.on("connection", (ws)=>{
  ws._roomCode=null; ws._name="اللاعب 1"; ws._score=0; ws._shields=newShields();
  ws.on("message", (raw)=>{
    let d; try{ d=JSON.parse(raw.toString()); }catch(e){ return; }
    const type=(d.type||"").toLowerCase();
    if(d.name && String(d.name).trim()){ ws._name = String(d.name).trim().slice(0,20); }
    const wanted = normCount(d.maxPlayers || d.playerCount || d.count || d.players || 2);
    if(type==="create" || type==="create_room"){
      removeFromAllQueues(ws); removeFromRoom(ws);
      const maxPlayers=wanted; const code=makeCode();
      const room={ code, maxPlayers, players:[ws], game:null, _timer:null, _deadline:0 };
      rooms.set(code, room); ws._roomCode=code; ws._score=0; ws._shields=newShields();
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
      room.players.push(ws); ws._roomCode=code; ws._score=0; ws._shields=newShields();
      const names=getNames(room);
      send(ws, { type:"joined", code, players:room.players.length, count:room.players.length, maxPlayers:room.maxPlayers, names });
      broadcast(room, { type:"player_joined", code, players:room.players.length, count:room.players.length, maxPlayers:room.maxPlayers, names }, ws);
      return;
    }
    if(type==="rejoin"){
      const room=rooms.get(d.code);
      if(!room || !room.game){ send(ws,{type:"error", message:"الغرفة غير موجودة"}); return; }
      let oldIdx=room.players.findIndex(pp=> pp._name===d.name && (pp._disconnected || pp._pendingRemove));
      if(oldIdx===-1) oldIdx=room.players.findIndex(pp=> pp._name===d.name && !pp._isBot);
      if(oldIdx===-1){ send(ws,{type:"error", message:"لم يتم العثور على مقعدك"}); return; }
      let oldWs=room.players[oldIdx];
      if(oldWs._removeTimer){ clearTimeout(oldWs._removeTimer); oldWs._removeTimer=null; }
      ws._name=oldWs._name; ws._score=oldWs._score; ws._shields=oldWs._shields; ws._roomCode=room.code; ws._isBot=false;
      room.players[oldIdx]=ws;
      send(ws,{type:"rejoined", code:room.code, names:getNames(room)});
      broadcastAll(room,{type:"game_state", code:room.code, game:publicGame(room)});
      return;
    }
    if(type==="quick_play" || type==="find_match" || type==="search" || type==="matchmaking"){
      removeFromRoom(ws); removeFromAllQueues(ws);
      const maxPlayers=wanted; const q=queues[String(maxPlayers)];
      if(!q.includes(ws)) q.push(ws);
      send(ws, { type:"searching", maxPlayers, message:"جاري البحث..." });
      tryMatch(maxPlayers);
      // إذا بعد 12 ثانية ما لقاش لاعبين، نكملو ببوتات بأسماء عشوائية - اللاعب ما يعرفش بلي بوتات
      if(ws._searchTimer) clearTimeout(ws._searchTimer);
      ws._searchTimer=setTimeout(()=>{
        if(ws._roomCode) return; // لقا غرفة
        if(!queues[String(maxPlayers)].includes(ws)) return; // لغا البحث
        // نجمع اللاعبين الحقيقيين اللي يستناو لنفس العدد (2 أو 3 أو 4) و نكملو الباقي ببوتات
        // مثال: 2 حقيقيين يستناو 4 -> غرفة فيها 2 حقيقيين + 2 بوتات
        let waiting = queues[String(maxPlayers)].slice();
        let reals = waiting.filter(x=> x!==ws).slice(0, maxPlayers-1);
        let allReals = [ws, ...reals];
        // نخرجهم كامل من الطابور و نلغي مؤقتاتهم
        queues[String(maxPlayers)] = queues[String(maxPlayers)].filter(x=> !allReals.includes(x));
        allReals.forEach(r=>{ if(r._searchTimer){ clearTimeout(r._searchTimer); r._searchTimer=null; } });
        const code=makeCode();
        const used=allReals.map(r=> r._name);
        const players=[...allReals];
        // نكملو الباقي ببوتات بأسماء عشوائية حتى نوصلو للعدد المطلوب (2 أو 3 أو 4)
        for(let i=players.length;i<maxPlayers;i++){ let nm=randomBotName(used); used.push(nm); let b=makeBot(nm); players.push(b); }
        const room={ code, maxPlayers, players, game:null, _timer:null, _deadline:0 };
        rooms.set(code, room);
        const names=getNames(room);
        allReals.forEach(r=>{ r._roomCode=code; r._score=0; r._shields=newShields(); send(r, { type:"match_found", code, players:players.length, count:players.length, maxPlayers, names }); send(r, { type:"joined", code, players:players.length, count:players.length, maxPlayers, names }); });
        // نبدا اللعبة تلقائيا بعد ثانية، باش اللاعب ما يحسش بالفرق
        setTimeout(()=>{ if(rooms.get(code) && !room.game) startGame(room); }, 800);
      }, SEARCH_WAIT_MS);
      return;
    }
    if(type==="cancel_search" || type==="stop_search"){ if(ws._searchTimer) clearTimeout(ws._searchTimer); removeFromAllQueues(ws); send(ws,{ type:"search_cancelled" }); return; }
    if(type==="start"){
      const room=rooms.get(ws._roomCode); if(!room) return;
      if(room.players.length < room.maxPlayers){ send(ws,{ type:"error", message:"مازال ناقص لاعبين" }); return; }
      if(room.game){ send(ws,{ type:"game_started", code:room.code, game: publicGame(room) }); return; }
      startGame(room); return;
    }
    if(type==="leave"){ removeFromAllQueues(ws); removeFromRoom(ws); send(ws,{ type:"left" }); return; }
    // ---- اختيار الهدف ----
    if(type==="choose_target"){
      const room=rooms.get(ws._roomCode); if(!room||!room.game) return;
      const g=room.game; if(!g.pending) return;
      const actorIdx=room.players.indexOf(ws); if(actorIdx!==g.pending.actor) return;
      let targetIdx=parseInt(d.target,10); if(isNaN(targetIdx)||targetIdx<0||targetIdx>=room.players.length) return;
      // تبادل لاعبين: تقدر تختار نفسك، لأنو مع لاعبين فقط يبقى غير انت كثاني واحد. باقي البطاقات ما تقدرش تختار نفسك
      if(targetIdx===actorIdx && g.pending.kind!=="exchangePlayers") { send(ws,{type:"error",message:"اختر لاعب آخر"}); return; }
      let pend=g.pending; g.pending=null; clearTimer(room);
      let actor=room.players[actorIdx], target=room.players[targetIdx];
      let ts=target._shields;
      // الدرع الذهبي يمنع كلش
      if((ts.goldenShield||0)>0 && ["steal","bomb","doubleTarget","resetPlayer","exchange","freeze","exchangePlayers"].includes(pend.kind)){
        ts.goldenShield--; g.lastMsg="🏆 الدرع الذهبي منع التأثير على "+target._name;
        broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return;
      }
      if(pend.kind==="steal"){
        let amt=pend.amount||3;
        if((ts.stealShield||0)>0){ ts.stealShield--; g.lastMsg="🛡️ الدرع منع السرقة"; }
        else if((ts.reflect||0)>0){ let take=Math.min(amt,Math.max(0,actor._score||0)); ts.reflect--; actor._score-=take; target._score+=take; g.lastMsg="🪞 انعكست السرقة - انت خسرت "+take; }
        else { let take=Math.min(amt,Math.max(0,target._score||0)); target._score-=take; actor._score+=take; g.lastMsg=take>0?("💰 سرقت "+take+" نقطة من "+target._name):("💰 رصيد "+target._name+" صفر"); }
      } else if(pend.kind==="bomb"){
        let amt=pend.amount||3;
        if((ts.bombShield||0)>0){ ts.bombShield--; g.lastMsg="🧨 درع القنبلة حمى "+target._name; }
        else { target._score-=amt; g.lastMsg="💣 خسر "+target._name+" "+amt+" نقاط"; }
      } else if(pend.kind==="doubleTarget"){
        if((ts.reflect||0)>0){ ts.reflect--; if((actor._score||0)>0) actor._score*=2; g.lastMsg="🪞 انعكست المضاعفة على المهاجم"; }
        else { if((target._score||0)>0){ target._score*=2; g.lastMsg="🎯 تضاعف رصيد "+target._name; } else { g.lastMsg="🎯 رصيد "+target._name+" سالب أو صفر، ما تضاعفش"; } }
      } else if(pend.kind==="resetPlayer"){
        if((ts.resetShield||0)>0){ ts.resetShield--; g.lastMsg="🔐 درع التصفير حمى "+target._name; }
        else { target._score=0; g.lastMsg="💥 تم تصفير رصيد "+target._name; }
      } else if(pend.kind==="exchange"){
        let tmp=actor._score; actor._score=target._score; target._score=tmp; g.lastMsg="🔃 تم تبادل الرصيدين";
      } else if(pend.kind==="freeze"){ target._shields.freeze=2; g.lastMsg="🧊 تم تجميد "+target._name+" لدورين"; }
      else if(pend.kind==="exchangePlayers"){
        if(pend.first==null){ g.pending={kind:"exchangePlayers",actor:actorIdx,first:targetIdx,cardId:pend.cardId}; g.lastMsg="اختر اللاعب الثاني للتبادل - الأول هو "+target._name; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return; }
        else {
          let first=room.players[pend.first];
          if(targetIdx===pend.first){ g.lastMsg="اختر لاعب مختلف"; g.pending=pend; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return; }
          let tmp=first._score; first._score=target._score; target._score=tmp; g.lastMsg="تم تبادل رصيد "+first._name+" و "+target._name;
        }
      }
      broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)});
      finishTurn(room); return;
    }
    // ---- تأكيد ----
    if(type==="confirm_yes" || type==="confirm_no"){
      const room=rooms.get(ws._roomCode); if(!room||!room.game) return;
      const g=room.game; if(!g.pending||g.pending.kind!=="confirm") return;
      const actorIdx=room.players.indexOf(ws); if(actorIdx!==g.pending.actor) return;
      let pend=g.pending; g.pending=null; clearTimer(room);
      if(type==="confirm_no"){ g.lastMsg="تم إلغاء التفعيل"; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
      let c=g.cards.find(x=>x.id===pend.cardId);
      if(pend.confirmType==="shuffle"){
        // إلغاء القلب؟ أي خصم عندو الدرع يقدر يلغي
        let canceller=room.players.findIndex((pp,ii)=> ii!==actorIdx && (pp._shields.cancelShuffle||0)>0);
        if(canceller!==-1){ room.players[canceller]._shields.cancelShuffle--; g.lastMsg="🚫 تم إلغاء القلب بواسطة "+room.players[canceller]._name; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
        g.cards.forEach(x=> x.opened=false);
        for(let i=g.cards.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [g.cards[i],g.cards[j]]=[g.cards[j],g.cards[i]]; }
        g.lastMsg="🔄 تم قلب كل البطاقات وخلطها من جديد!";
      } else if(pend.confirmType==="nextLevel"){
        if(g.level>=3){ g.lastMsg="أنت في آخر مستوى!"; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
        let canceller=room.players.findIndex((pp,ii)=> ii!==actorIdx && (pp._shields.cancelShuffle||0)>0);
        if(canceller!==-1){ room.players[canceller]._shields.cancelShuffle--; g.lastMsg="🚫 تم إلغاء الانتقال بواسطة "+room.players[canceller]._name; broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return; }
        g.level++; g.cards=buildDeck(g.level); room.players.forEach(p=> p._shields=newShields());
        g.lastMsg="🎉 انتقلتم إلى المستوى "+g.level+"!";
      } else if(["reset","stealAll","reverseBalances","bombAll","randomBalances"].includes(pend.confirmType)){
        applySimple(room, actorIdx, {type:pend.confirmType}, ()=>{});
      } else if(pend.confirmType==="exchange"||pend.confirmType==="exchangePlayers"){
        // وافق على التبادل - درك نروح لاختيار اللاعب / اللاعبين
        g.pending={kind:pend.confirmType,actor:actorIdx,cardId:pend.cardId,amount:0,first:null};
        g.lastMsg="🎯 اختر لاعبًا لتفعيل: "+(c.label||pend.confirmType);
        broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return;
      }
      broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); finishTurn(room); return;
    }
    // ---- إعادة التفعيل ----
    if(type==="replay_choose"){
      const room=rooms.get(ws._roomCode); if(!room||!room.game) return;
      const g=room.game; if(!g.pending||g.pending.kind!=="replay") return;
      const actorIdx=room.players.indexOf(ws); if(actorIdx!==g.pending.actor) return;
      let idx=parseInt(d.index,10);
      // نقبل index أو cardId
      if(isNaN(idx) && d.cardId!=null){ idx=g.cards.findIndex(x=>x.id===parseInt(d.cardId,10)); }
      if(isNaN(idx)||idx<0||idx>=g.cards.length) return;
      let chosen=g.cards[idx]; if(!chosen.opened) return;
      // لا يمكن إعادة تفعيل بطاقة إعادة التفعيل نفسها
      if(chosen.id===g.pending.cardId){ send(ws,{type:"error",message:"اختر بطاقة أخرى غير إعادة التفعيل"}); return; }
      g.pending=null; clearTimer(room);
      g.lastCard=chosen; g.lastMsg="♻️ إعادة تفعيل: "+(chosen.label||chosen.type);
      // نطبق تأثير البطاقة المختارة مرة أخرى (بدون pending جديد للتبسيط: إذا كانت تحتاج هدف، نرجع نطلب هدف)
      handleCardEffect(room, actorIdx, chosen, true);
      return;
    }
    // ---- اختيار مزدوج ----
    if(type==="double_pick"){
      const room=rooms.get(ws._roomCode); if(!room||!room.game) return;
      const g=room.game; if(!g.pending||g.pending.kind!=="double") return;
      const actorIdx=room.players.indexOf(ws); if(actorIdx!==g.pending.actor) return;
      let picks=Array.isArray(d.picks)?d.picks:[];
      if(picks.length!==2) return;
      let c1=g.cards[picks[0]], c2=g.cards[picks[1]];
      if(!c1||!c2||c1.opened||c2.opened) return;
      // نكشف البطاقتين باش اللاعب يشوفهم و يختار
      c1.opened=true; c2.opened=true;
      g.pending={kind:"double_choose",actor:actorIdx,picks,cardId:g.pending.cardId};
      g.lastMsg="🃏 اختر واحدة من البطاقتين لتفعيلها - الأخرى سترجع مغلقة";
      broadcastAll(room,{type:"game_state",code:room.code,game:publicGame(room)}); startTurnTimer(room); return;
    }
    if(type==="double_choose"){
      const room=rooms.get(ws._roomCode); if(!room||!room.game) return;
      const g=room.game; if(!g.pending||g.pending.kind!=="double_choose") return;
      const actorIdx=room.players.indexOf(ws); if(actorIdx!==g.pending.actor) return;
      let idx=parseInt(d.index,10); if(!g.pending.picks.includes(idx)) return;
      let chosen=g.cards[idx];
      // المختارة تبقى مكشوفة و تتفعل، الأخرى ترجع مغلقة
      g.pending.picks.forEach(i=>{ if(i!==idx) g.cards[i].opened=false; });
      g.cards[idx].opened=true;
      g.pending=null; clearTimer(room); g.lastCard=chosen;
      handleCardEffect(room, actorIdx, chosen, false);
      return;
    }
    // ---- اللعب: كشف بطاقة ----
    if(type==="play_card" || type==="move" || type==="game"){
      const room=rooms.get(ws._roomCode); if(!room || !room.game) return;
      const g = room.game; if(g.winner) return;
      if(g.pending){ send(ws,{type:"error",message:"أكمل الاختيار أولا"}); return; }
      const myIdx = room.players.indexOf(ws); if(myIdx === -1) return;
      if(myIdx !== g.current){ send(ws,{ type:"error", message:"مش دورك" }); return; }
      const idx = parseInt(d.index ?? d.cardIndex ?? -1, 10);
      if(isNaN(idx) || idx<0 || idx>=g.cards.length) return;
      const c = g.cards[idx]; if(c.opened){ send(ws,{ type:"error", message:"البطاقة مكشوفة" }); return; }
      c.opened = true; g.lastCard = c; clearTimer(room);
      handleCardEffect(room, myIdx, c, false);
      return;
    }
  });
  ws.on("close", ()=>{
    removeFromAllQueues(ws);
    // إذا الغرفة فيها بوتات، نستنى 15 ثانية قبل ما نحذف اللاعب، باش يقدر يرجع إذا انقطع لحظة
    let room=ws._roomCode ? rooms.get(ws._roomCode) : null;
    let hasBots = room && room.players.some(pp=> pp._isBot);
    if(hasBots && room && room.game && !room.game.winner){
      ws._disconnected=true; ws._pendingRemove=true;
      if(ws._removeTimer) clearTimeout(ws._removeTimer);
      ws._removeTimer=setTimeout(()=>{ ws._pendingRemove=false; removeFromRoom(ws); }, 15000);
      broadcastAll(room,{type:"game_state", code:room.code, game:publicGame(room)});
      return;
    }
    removeFromRoom(ws);
  });
});
server.listen(PORT, ()=>{ console.log("Server on "+PORT+" - V16 cards+timer"); });
