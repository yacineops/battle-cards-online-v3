// battle-online-v6.js - V14 FINAL - طاولة 45 بطاقة حقيقية داخل الغرفة + مزامنة كاملة
(function(){
  "use strict";
  const WS_URL = "wss://battle-cards-online-v2.onrender.com";
  let ws = null;
  let myCode = "";
  let myName = "";
  try { myName = localStorage.getItem("bc_player_name") || ""; } catch(e){}
  if(!myName) myName = "اللاعب 1";
  let playerCount = 1;
  let maxPlayers = 2;
  let playerNames = [];
  let joinTimer = null;
  let gameStarted = false;
  let game = null; // {cards, scores, names, current, direction, level, lastMsg, winner}
  let myIndex = -1;

  function saveName(n){
    myName = (n || "").trim().slice(0,20) || "اللاعب 1";
    try { localStorage.setItem("bc_player_name", myName); } catch(e){}
  }
  function toast(msg){
    let t = document.getElementById("bc-online-toast");
    if(!t){
      t = document.createElement("div");
      t.id = "bc-online-toast";
      t.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:12px 18px;border-radius:99px;font-weight:700;z-index:99999;max-width:92%;text-align:center;font-size:14px";
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.display = "block";
    clearTimeout(t._h); t._h = setTimeout(()=>{ t.style.display="none"; }, 4000);
  }
  function closeOverlay(){
    let o = document.getElementById("bc-online-overlay");
    if(o) o.remove();
  }
  function closeReactModal(){
    try{
      let backs = Array.from(document.querySelectorAll("button")).filter(function(b){
        let t = (b.textContent||"").trim();
        return t.indexOf("رجوع") !== -1 && b.offsetParent !== null;
      });
      if(backs.length > 0) backs[backs.length - 1].click();
      if(document.body && document.body.style) document.body.style.display = "";
    }catch(e){}
  }
  function showOverlay(title, innerHTML){
    closeOverlay();
    let o = document.createElement("div");
    o.id = "bc-online-overlay";
    o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow-y:auto;touch-action:manipulation";
    o.innerHTML = '<div id="bc-box" style="background:#1e2a38;border-radius:20px;padding:16px;width:100%;max-width:520px;text-align:center;color:#fff">'
      + '<h3 style="margin:0 0 8px;font-size:20px">' + title + '</h3>' + innerHTML + '</div>';
    o.addEventListener("click", function(e){ if(e.target === o){ e.preventDefault(); } });
    document.body.appendChild(o);
    return o;
  }
  function btn(c1,c2,txt){ return "width:100%;border:0;border-radius:14px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,"+c1+","+c2+");color:"+txt+";margin:5px 0"; }
  function countSelector(){
    return '<div style="margin:10px 0 6px"><div style="font-size:13px;color:#b0c4de;margin-bottom:6px">👥 اختر عدد اللاعبين</div>'
      + '<div style="display:flex;gap:8px;justify-content:center">'
      + [2,3,4].map(function(n){
          let active = (n === maxPlayers);
          return '<button data-count="'+n+'" class="bc-count-btn" style="flex:1;border:0;border-radius:12px;padding:12px;font-size:16px;font-weight:800;cursor:pointer;background:'+(active ? "linear-gradient(135deg,#ff8f00,#ffc107);color:#222" : "rgba(255,255,255,.15);color:#fff")+'">👥 '+n+'</button>';
        }).join("")
      + '</div>'
      + '<div id="bc-count-label" style="font-size:12px;color:#ffc107;margin-top:6px">المختار الآن: ' + maxPlayers + ' لاعبين</div></div>';
  }
  function bindCountSelector(){
    document.querySelectorAll(".bc-count-btn").forEach(function(b){
      b.onclick = function(){
        maxPlayers = parseInt(b.getAttribute("data-count"), 10) || 2;
        document.querySelectorAll(".bc-count-btn").forEach(function(x){
          let n = parseInt(x.getAttribute("data-count"),10);
          if(n === maxPlayers){ x.style.background = "linear-gradient(135deg,#ff8f00,#ffc107)"; x.style.color = "#222"; }
          else { x.style.background = "rgba(255,255,255,.15)"; x.style.color = "#fff"; }
        });
        let label = document.getElementById("bc-count-label");
        if(label) label.textContent = "المختار الآن: " + maxPlayers + " لاعبين";
      };
    });
  }
  function connect(){
    return new Promise(function(resolve, reject){
      if(ws && ws.readyState === 1) return resolve(ws);
      try{ if(ws) ws.close(); }catch(e){}
      ws = new WebSocket(WS_URL);
      ws.onopen = function(){ resolve(ws); };
      ws.onerror = function(){ reject(new Error("WS")); };
      ws.onclose = function(){ if(gameStarted) toast("⚠️ انقطع الاتصال بالسيرفر"); };
      ws.onmessage = function(ev){
        try{
          let d = JSON.parse(ev.data);
          let type = (d.type || "").toLowerCase();
          if(d.maxPlayers) maxPlayers = parseInt(d.maxPlayers,10) || maxPlayers;
          if(d.names) playerNames = d.names;
          if(d.game) game = d.game;
          if(type === "room_created"){
            if(d.code) myCode = String(d.code);
            playerCount = 1; myIndex = 0;
            updateWaiting();
          }
          if(type === "joined" || type === "player_joined" || type === "room_update" || type === "match_found"){
            if(d.code) myCode = String(d.code);
            if(typeof d.players === "number") playerCount = d.players;
            if(Array.isArray(d.players)) playerCount = d.players.length;
            if(typeof d.count === "number") playerCount = d.count;
            clearTimeout(joinTimer);
            if(playerNames) myIndex = playerNames.indexOf(myName);
            if(type === "match_found"){ toast("🎉 اكتمل العدد! " + playerCount + " / " + maxPlayers); openWaiting(); }
            else if(!gameStarted) updateWaiting();
            if(playerCount >= maxPlayers && !gameStarted) toast("🎉 اكتمل العدد! " + playerCount + " / " + maxPlayers);
          }
          if(type === "error"){
            clearTimeout(joinTimer);
            toast("❌ " + (d.message || "الغرفة غير موجودة"));
            if(!gameStarted) setTimeout(openJoin, 800);
          }
          if(type === "game_started" || type === "card_revealed" || type === "game_state"){
            gameStarted = true;
            if(d.game) game = d.game;
            if(playerNames) myIndex = playerNames.indexOf(myName);
            renderGame();
          }
          if(type === "game_over"){
            if(d.game) game = d.game;
            renderGame(true);
          }
          if(type === "player_left"){
            playerCount = Math.max(1, playerCount - 1);
            if(!gameStarted) updateWaiting();
            else if(game) renderGame();
          }
        }catch(e){}
      };
    });
  }
  function sendSafe(obj){
    try{ if(ws && ws.readyState === 1){ ws.send(JSON.stringify(obj)); return true; } }catch(e){}
    return false;
  }
  function updateWaiting(){
    let codeEl = document.getElementById("bc-code");
    let countEl = document.getElementById("bc-count");
    let namesEl = document.getElementById("bc-names");
    let startBtn = document.getElementById("bc-start-btn");
    if(codeEl) codeEl.textContent = myCode || "••••••";
    if(countEl) countEl.textContent = "👥 اللاعبون: " + playerCount + " / " + maxPlayers;
    if(namesEl){
      if(playerNames && playerNames.length) namesEl.innerHTML = playerNames.map(function(n){ return "<div>✅ " + n + (n===myName?" (أنت)":"") + "</div>"; }).join("");
      else namesEl.innerHTML = "<div>✅ " + myName + " (أنت)</div>";
    }
    if(startBtn){
      if(playerCount >= maxPlayers){
        startBtn.disabled = false;
        startBtn.style.opacity = "1";
        startBtn.textContent = "▶️ ابدأ اللعب (" + playerCount + " / " + maxPlayers + ")";
      } else {
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        startBtn.textContent = "⏳ نستنى " + (maxPlayers - playerCount) + " لاعب... (" + playerCount + " / " + maxPlayers + ")";
      }
    }
  }
  // ===== الطاولة الحقيقية داخل الغرفة =====
  function renderGame(isOver){
    if(!game) return;
    let names = game.names || playerNames;
    let scores = game.scores || [];
    let cards = game.cards || [];
    let opened = cards.filter(function(c){return c.opened;}).length;
    let myTurn = (game.current === myIndex);
    let playersHTML = names.map(function(n,i){
      let isCur = (i===game.current);
      let isMe = (i===myIndex);
      return '<div style="flex:1;min-width:0;padding:8px 4px;border-radius:12px;background:'+(isCur?"rgba(0,230,118,.18)":"rgba(255,255,255,.08)")+';border:2px solid '+(isCur?"#00e676":"rgba(255,255,255,.15)")+'">'
        + '<div style="font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(isCur?"⭐ ":"")+n+(isMe?" (أنت)":"")+'</div>'
        + '<div style="font-size:16px;font-weight:900;color:#ffdf6e">'+(scores[i]||0)+' نقطة</div></div>';
    }).join("");
    let cardsHTML = cards.map(function(c,i){
      if(c.opened){
        let bg = c.type==="points" ? ((c.value||0)>0 ? "linear-gradient(135deg,#c8e6c9,#a5d6a7)" : "linear-gradient(135deg,#ffcdd2,#ef9a9a)") : "linear-gradient(135deg,#fff3e0,#ffcc80)";
        return '<div style="aspect-ratio:0.72;border-radius:8px;background:'+bg+';color:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:16px;font-weight:900;border:2px solid #fff;padding:2px"><span>'+(c.icon||"⭐")+'</span><span style="font-size:9px;line-height:1.1">'+(c.type==="points" ? ((c.value>0?"+":"")+c.value) : (c.label||""))+'</span></div>';
      }
      return '<button data-card="'+i+'" class="bc-card-btn" style="aspect-ratio:0.72;border-radius:8px;background:linear-gradient(135deg,#263f59,#3a5a7c);border:2px solid #5a7d9c;color:#fff;font-size:20px;cursor:'+(myTurn?"pointer":"not-allowed")+';opacity:'+(myTurn?"1":"0.7")+'">🃏</button>';
    }).join("");
    showOverlay(isOver ? "🏆 انتهت الجولة" : "🎮 لعبة أونلاين - غرفة " + myCode,
      '<div style="display:flex;gap:6px;margin:8px 0">'+playersHTML+'</div>'
      + '<div style="font-size:13px;font-weight:800;margin:6px 0">'+(game.winner ? ("🏆 الفائز: "+game.winner) : (myTurn ? "⭐ دورك - اكشف بطاقة واحدة" : "⏳ دور: "+(names[game.current]||""))) + '</div>'
      + '<div style="font-size:12px;color:#b0c4de;min-height:20px">'+(game.lastMsg||"")+'</div>'
      + '<div style="font-size:12px;color:#ffc107;margin:4px 0">تم كشف '+opened+' / '+cards.length+' • '+(game.direction===1?"➡️":"⬅️")+' المستوى '+game.level+'</div>'
      + '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:10px 0">'+cardsHTML+'</div>'
      + '<button id="bc-leave-game" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:6px 0 0">🚪 مغادرة الغرفة</button>'
      + (isOver ? '<button id="bc-back-menu" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#455a64;color:#fff;margin:6px 0 0">🏠 القائمة</button>' : '')
    );
    document.querySelectorAll(".bc-card-btn").forEach(function(b){
      b.onclick = function(){
        if(!myTurn){ toast("⏳ مش دورك"); return; }
        let idx = parseInt(b.getAttribute("data-card"),10);
        sendSafe({ type:"play_card", code: myCode, index: idx });
      };
    });
    let leaveBtn = document.getElementById("bc-leave-game");
    if(leaveBtn) leaveBtn.onclick = function(){
      gameStarted = false; game = null;
      sendSafe({ type:"leave", code: myCode });
      myCode = ""; playerCount = 1; playerNames = [myName]; myIndex = -1;
      toast("👋 غادرت الغرفة");
      openMenu();
    };
    let backBtn = document.getElementById("bc-back-menu");
    if(backBtn) backBtn.onclick = function(){
      gameStarted = false; game = null;
      sendSafe({ type:"leave", code: myCode });
      myCode = ""; openMenu();
    };
  }
  function openMenu(){
    gameStarted = false; game = null;
    showOverlay("🌐 العب أونلاين",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 10px">اختر عدد اللاعبين أولًا، بعدها اختر طريقة اللعب.</p>'
      + '<label style="display:block;text-align:right;font-size:13px;color:#b0c4de;margin-bottom:4px">اسمك<br><input id="bc-name" value="'+myName+'" placeholder="اكتب اسمك" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font-size:15px;margin-top:5px"></label>'
      + countSelector()
      + '<button id="bc-quick" style="'+btn("#ff8f00","#ffc107","#222")+'">🔍 بحث عن لاعبين - لعب سريع</button>'
      + '<button id="bc-create" style="'+btn("#1976d2","#2196f3","#fff")+'">➕ إنشاء غرفة</button>'
      + '<button id="bc-join-open" style="'+btn("#455a64","#607d8b","#fff")+'">🔑 دخول لغرفة بالكود</button>'
      + '<button id="bc-close" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;margin:5px 0">⬅️ رجوع للصفحة الأولى</button>'
    );
    bindCountSelector();
    document.getElementById("bc-name").addEventListener("input", function(e){ saveName(e.target.value); });
    document.getElementById("bc-close").onclick = function(){
      closeOverlay();
      setTimeout(closeReactModal, 100);
    };
    document.getElementById("bc-quick").onclick = openSearch;
    document.getElementById("bc-join-open").onclick = openJoin;
    document.getElementById("bc-create").onclick = function(){
      toast("⏳ جاري إنشاء غرفة لـ " + maxPlayers + " لاعبين...");
      connect().then(function(){
        sendSafe({ type:"create", name: myName, maxPlayers: maxPlayers });
        myCode = ""; playerCount = 1; playerNames = [myName]; myIndex = 0;
        setTimeout(openWaiting, 400);
      }).catch(function(){ toast("❌ مقدرتش نتصل بالسيرفر"); });
    };
  }
  function openSearch(){
    showOverlay("🔍 جاري البحث عن لاعبين...",
      '<div style="font-size:50px;margin:10px 0">🔍</div>'
      + '<p style="color:#b0c4de;font-size:14px;margin:0 0 10px">نبحث عن <b style="color:#ffc107">' + maxPlayers + ' لاعبين</b>...</p>'
      + '<div style="font-size:13px;color:#ffc107;font-weight:700">⏳ البحث جاري... (1 / ' + maxPlayers + ')</div>'
      + '<button id="bc-cancel-search" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:14px 0 0">إلغاء البحث</button>'
    );
    connect().then(function(){ sendSafe({ type:"quick_play", name: myName, maxPlayers: maxPlayers }); }).catch(function(){ toast("❌ مقدرتش نتصل بالسيرفر"); });
    document.getElementById("bc-cancel-search").onclick = function(){ sendSafe({ type:"cancel_search" }); openMenu(); };
  }
  function openJoin(){
    showOverlay("🔑 دخول لغرفة",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 16px">أدخل رقم الغرفة المكوّن من 6 أرقام</p>'
      + '<input id="bc-join-code" inputmode="numeric" placeholder="000000" style="width:100%;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font-size:22px;text-align:center;letter-spacing:4px;font-weight:800">'
      + '<button id="bc-join-go" style="'+btn("#1976d2","#2196f3","#fff")+'">دخول</button>'
      + '<button id="bc-join-back" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;margin:5px 0">⬅️ رجوع</button>'
    );
    let inp = document.getElementById("bc-join-code");
    inp.focus();
    inp.addEventListener("input", function(){ inp.value = inp.value.replace(/[^0-9]/g,"").slice(0,6); });
    document.getElementById("bc-join-back").onclick = openMenu;
    document.getElementById("bc-join-go").onclick = function(){
      let code = inp.value.trim();
      if(code.length < 4){ toast("أدخل رقم الغرفة بشكل صحيح"); return; }
      myCode = code;
      toast("⏳ جاري الدخول...");
      clearTimeout(joinTimer);
      joinTimer = setTimeout(function(){ toast("❌ لم يرد السيرفر - تأكد من الرقم وحاول مجددًا"); }, 4000);
      connect().then(function(){
        sendSafe({ type:"join", code: code, roomCode: code, name: myName });
        playerCount = 1;
        setTimeout(openWaiting, 400);
      }).catch(function(){ toast("❌ مقدرتش نتصل بالسيرفر"); });
    };
  }
  function openWaiting(){
    showOverlay("غرفتك جاهزة",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 8px">أرسل الرقم لأصدقائك</p>'
      + '<div id="bc-code" style="font-size:32px;font-weight:900;letter-spacing:4px;border:2px dashed #ffc107;border-radius:14px;padding:14px 8px;margin:8px 0">••••••</div>'
      + '<div id="bc-count" style="font-size:16px;font-weight:700">👥 اللاعبون: 1 / ' + maxPlayers + '</div>'
      + '<div id="bc-names" style="font-size:14px;margin:10px 0;line-height:1.8;color:#fff"></div>'
      + '<button id="bc-start-btn" disabled style="'+btn("#ff8f00","#ffc107","#222")+'opacity:0.5">⏳ نستنى...</button>'
      + '<button id="bc-cancel" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:5px 0">إلغاء</button>'
    );
    updateWaiting();
    document.getElementById("bc-cancel").onclick = function(){ sendSafe({ type:"leave", code: myCode }); openMenu(); };
    document.getElementById("bc-start-btn").onclick = function(){
      if(playerCount < maxPlayers){ toast("مازال ناقص " + (maxPlayers - playerCount) + " لاعب"); return; }
      sendSafe({ type:"start", code: myCode });
    };
  }
  function handleOpen(e){
    let btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if(!btn) return;
    let txt = (btn.textContent || "").trim();
    if(txt === "العب أونلاين" || (txt.indexOf("العب أونلاين") !== -1 && txt.length < 30)){
      e.preventDefault();
      setTimeout(openMenu, 80);
    }
  }
  document.addEventListener("click", handleOpen, false);
  console.log("✅ Battle Online V14 FINAL - shared board");
})();
