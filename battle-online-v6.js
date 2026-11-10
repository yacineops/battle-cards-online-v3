// battle-online-v6.js — ربط اللعبة بالسيرفر V6 فقط
(function(){
  if(window.BattleOnlineV6) return;
  let ws=null, queue=[], roomCode="", myIndex=0, myName="اللاعب 1", isOnline=false;

  function send(o){
    if(ws && ws.readyState===1) ws.send(JSON.stringify(o));
    else queue.push(o);
  }

  function connect(){
    if(ws && (ws.readyState===1 || ws.readyState===0)) return;
    ws = new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
    ws.onopen = ()=>{ while(queue.length) ws.send(JSON.stringify(queue.shift())); };
    ws.onmessage = (ev)=>{
      let m;
      try{ m=JSON.parse(ev.data); }catch{ return; }
      window.dispatchEvent(new CustomEvent("battle-v6-msg",{detail:m}));
      if(m.type==="room_created"){ roomCode=m.code; myIndex=m.myIndex||0; isOnline=true; }
      if(m.type==="room_joined"){ roomCode=m.code||roomCode; myIndex=m.myIndex??myIndex; isOnline=true; }
    };
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
        });
      }
    });
  }

  new MutationObserver(hook).observe(document.body, {childList:true, subtree:true});
  hook();
})();
