// battle-online-v6.js — ربط اللعبة بالسيرفر V6 فقط - مصحح
(function(){
  if(window.BattleOnlineV6) return;
  let ws=null, queue=[], roomCode="", myIndex=0, myName="اللاعب 1", isOnline=false;

  function send(o){
    if(ws && ws.readyState===1) ws.send(JSON.stringify(o));
    else queue.push(o);
  }

  function showCode(code){
    // حاول تلقى بلاصة تعرض الكود
    let el = document.querySelector('#roomCodeDisplay, [data-room-code], #room-code');
    if(el){ el.textContent = code; el.style.display = 'block'; }
    else {
      // إذا ماكاش بلاصة، وريه في تنبيه صغير
      let d = document.querySelector('#v6-code-toast');
      if(!d){
        d = document.createElement('div');
        d.id = 'v6-code-toast';
        d.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:12px 18px;border-radius:12px;z-index:9999;font-size:18px;font-weight:bold;';
        document.body.appendChild(d);
      }
      d.textContent = 'كود الغرفة: ' + code + ' - ابعثو لصاحبك';
      d.style.display = 'block';
    }
  }

  function connect(){
    if(ws && (ws.readyState===1 || ws.readyState===0)) return;
    ws = new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
    ws.onopen = ()=>{ while(queue.length) ws.send(JSON.stringify(queue.shift())); };
    ws.onmessage = (ev)=>{
      let m;
      try{ m=JSON.parse(ev.data); }catch{ return; }
      window.dispatchEvent(new CustomEvent("battle-v6-msg",{detail:m}));
      if(m.type==="room_created"){ roomCode=m.code; myIndex=m.myIndex||0; isOnline=true; showCode(roomCode); console.log('ROOM CREATED', roomCode); }
      if(m.type==="room_joined"){ roomCode=m.code||roomCode; if(m.myIndex!==undefined) myIndex=m.myIndex; isOnline=true; console.log('ROOM JOINED', roomCode, 'myIndex', myIndex, 'players', m.players); }
      if(m.type==="room_update"){ console.log('ROOM UPDATE', m.players); }
      if(m.type==="game_start"){ console.log('GAME START', m.players); window.dispatchEvent(new CustomEvent("battle-game-start",{detail:m})); }
      if(m.type==="error"){ alert(m.message); }
      if(m.type==="match_found"){ roomCode=m.code; myIndex=m.myIndex||0; isOnline=true; console.log('MATCH FOUND', roomCode); }
    };
    ws.onclose = ()=>{ setTimeout(()=>{ ws=null; connect(); }, 2000); };
  }

  window.BattleOnlineV6 = {
    get isOnline(){ return isOnline; },
    get roomCode(){ return roomCode; },
    get myIndex(){ return myIndex; },
    createRoom(name, max){
      myName=(name||"اللاعب 1").slice(0,20);
      isOnline=true;
      connect();
      send({type:"create_room", name:myName, maxPlayers:max||2});
    },
    joinRoom(name, code){
      myName=(name||"اللاعب 1").slice(0,20);
      roomCode=String(code||"").trim();
      isOnline=true;
      connect();
      send({type:"join_room", name:myName, code:roomCode});
    },
    pickCard(i){ send({type:"pick_card", index:i}); },
    applyEffect(players, direction){ send({type:"apply_effect", players, direction}); },
    nextTurn(s, players, direction){ send({type:"next_turn", steps:s||1, players, direction}); }
  };

  connect();

  function hook(){
    document.querySelectorAll("button").forEach(btn=>{
      let t = btn.textContent||"";
      if(t.includes("إنشاء الغرفة") && !btn.dataset.v6){
        btn.dataset.v6="1";
        btn.addEventListener("click", ()=>{
          let nameInput = document.querySelector('input[placeholder="اللاعب 1"]');
          let name = nameInput ? nameInput.value : "اللاعب 1";
          window.BattleOnlineV6.createRoom(name, 2);
        });
      }
      if(t.trim()==="دخول" && !btn.dataset.v6){
        btn.dataset.v6="1";
        btn.addEventListener("click", ()=>{
          let codeInput = document.querySelector('input[placeholder="000000"]');
          let nameInput = document.querySelector('input[placeholder="اللاعب 1"]');
          let code = codeInput ? codeInput.value : "";
          let name = nameInput ? nameInput.value : "اللاعب 1";
          if(code.length>=4) window.BattleOnlineV6.joinRoom(name, code);
          else alert('اكتب الكود أولا');
        });
      }
    });
  }

  new MutationObserver(hook).observe(document.body, {childList:true, subtree:true});
  hook();
})();
