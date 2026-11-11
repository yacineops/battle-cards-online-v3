// battle-online-v6.js - V12 - إصلاح الصفحة البيضاء + لعبة واحدة
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

  function saveName(n){
    myName = (n || "").trim().slice(0,20) || "اللاعب 1";
    try { localStorage.setItem("bc_player_name", myName); } catch(e){}
  }

  // V12: إخفاء آمن - نخفي فقط المربع الصغير تاع المعاينة، لا نخفي الصفحة
  function hideReactLocalModal(){
    try {
      let all = document.querySelectorAll("div");
      all.forEach(function(el){
        let t = (el.textContent || "");
        // نبحث فقط عن المربع الصغير الذي يحتوي النص بالضبط، وطوله صغير
        if(t.indexOf("معاينة محلية") !== -1 && t.length < 800){
          // نخفي هذا العنصر فقط، ولا نصعد للأب
          if(el.style) el.style.display = "none";
          // ونخفي أيضا أزرار "لعب أونلاين" و "لعب مع صديق" التي داخله إذا كانت موجودة
          let btns = el.querySelectorAll("button");
          btns.forEach(function(b){ b.style.display = "none"; });
        }
      });
    } catch(e){}
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

  function showOverlay(title, innerHTML){
    closeOverlay();
    // لا نخفي الصفحة هنا، نعرض شاشتنا فقط فوق الصفحة
    let o = document.createElement("div");
    o.id = "bc-online-overlay";
    o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px 16px;overflow-y:auto;touch-action:manipulation";
    o.innerHTML = '<div id="bc-box" style="background:#1e2a38;border-radius:20px;padding:22px;width:100%;max-width:360px;text-align:center;color:#fff">'
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
      ws.onmessage = function(ev){
        try{
          let d = JSON.parse(ev.data);
          let type = (d.type || "").toLowerCase();
          if(d.maxPlayers) maxPlayers = parseInt(d.maxPlayers,10) || maxPlayers;
          if(d.names) playerNames = d.names;
          if(type === "room_created"){
            if(d.code) myCode = String(d.code);
            playerCount = 1;
            if(d.names) playerNames = d.names;
            updateWaiting();
          }
          if(type === "joined" || type === "player_joined" || type === "room_update" || type === "match_found"){
            if(d.code) myCode = String(d.code);
            if(typeof d.players === "number") playerCount = d.players;
            if(Array.isArray(d.players)) playerCount = d.players.length;
            if(typeof d.count === "number") playerCount = d.count;
            clearTimeout(joinTimer);
            if(type === "match_found"){ toast("🎉 اكتمل العدد! " + playerCount + " / " + maxPlayers); openWaiting(); }
            else if(!gameStarted) updateWaiting();
            if(playerCount >= maxPlayers && !gameStarted) toast("🎉 اكتمل العدد! " + playerCount + " / " + maxPlayers);
          }
          if(type === "error"){
            clearTimeout(joinTimer);
            toast("❌ " + (d.message || "الغرفة غير موجودة"));
            setTimeout(openJoin, 800);
          }
          if(type === "game_started"){
            gameStarted = true;
            toast("▶️ بدأت اللعبة!");
            openGameScreen();
          }
          if(type === "player_left"){
            playerCount = Math.max(1, playerCount - 1);
            if(!gameStarted) updateWaiting();
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
      if(playerNames && playerNames.length) namesEl.innerHTML = playerNames.map(function(n){ return "<div>✅ " + n + "</div>"; }).join("");
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

  function openGameScreen(){
    gameStarted = true;
    showOverlay("🎮 لعبة أونلاين - بدأت!",
      '<p style="color:#ffc107;font-size:15px;font-weight:700;margin:0 0 6px">غرفة: ' + myCode + ' • ' + playerCount + ' / ' + maxPlayers + '</p>'
      + '<div style="background:rgba(255,255,255,.08);border-radius:14px;padding:12px;margin:10px 0;text-align:right;line-height:2">'
      + (playerNames && playerNames.length ? playerNames.map(function(n){ return "<div>✅ " + n + (n===myName ? " (أنت)" : "") + "</div>"; }).join("") : "<div>✅ " + myName + " (أنت)</div>")
      + '</div>'
      + '<p style="color:#b0c4de;font-size:13px;line-height:1.7;margin:8px 0">أنت الآن داخل اللعبة أونلاين مع ' + (playerNames.join(" و ") || myName) + '.</p>'
      + '<button id="bc-leave-game" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:10px 0 0">🚪 مغادرة الغرفة</button>'
    );
    document.getElementById("bc-leave-game").onclick = function(){
      gameStarted = false;
      sendSafe({ type:"leave", code: myCode });
      closeOverlay();
    };
  }

  function openMenu(){
    gameStarted = false;
    showOverlay("🌐 العب أونلاين",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 10px">اختر عدد اللاعبين أولًا، بعدها اختر طريقة اللعب.</p>'
      + '<label style="display:block;text-align:right;font-size:13px;color:#b0c4de;margin-bottom:4px">اسمك<br><input id="bc-name" value="'+myName+'" placeholder="اكتب اسمك" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font-size:15px;margin-top:5px"></label>'
      + countSelector()
      + '<button id="bc-quick" style="'+btn("#ff8f00","#ffc107","#222")+'">🔍 بحث عن لاعبين - لعب سريع</button>'
      + '<button id="bc-create" style="'+btn("#1976d2","#2196f3","#fff")+'">➕ إنشاء غرفة</button>'
      + '<button id="bc-join-open" style="'+btn("#455a64","#607d8b","#fff")+'">🔑 دخول لغرفة بالكود</button>'
      + '<button id="bc-close" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;margin:5px 0">⬅️ رجوع</button>'
    );
    bindCountSelector();
    document.getElementById("bc-name").addEventListener("input", function(e){ saveName(e.target.value); });
    document.getElementById("bc-close").onclick = closeOverlay;
    document.getElementById("bc-quick").onclick = openSearch;
    document.getElementById("bc-join-open").onclick = openJoin;
    document.getElementById("bc-create").onclick = function(){
      toast("⏳ جاري إنشاء غرفة لـ " + maxPlayers + " لاعبين...");
      connect().then(function(){
        sendSafe({ type:"create", name: myName, maxPlayers: maxPlayers });
        myCode = ""; playerCount = 1; playerNames = [myName];
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
    document.getElementById("bc-cancel").onclick = function(){ sendSafe({ type:"leave", code: myCode }); closeOverlay(); };
    document.getElementById("bc-start-btn").onclick = function(){
      if(playerCount < maxPlayers){ toast("مازال ناقص " + (maxPlayers - playerCount) + " لاعب"); return; }
      sendSafe({ type:"start", code: myCode });
      openGameScreen();
    };
  }

  function handleOpen(e){
    let btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if(!btn) return;
    let txt = (btn.textContent || "").trim();
    // نفتح أونلاين فقط من زر الصفحة الرئيسية "العب أونلاين"
    if(txt === "العب أونلاين" || txt.indexOf("العب أونلاين") !== -1 && txt.length < 30){
      e.preventDefault();
      setTimeout(openMenu, 80);
    }
  }
  document.addEventListener("click", handleOpen, false);
  console.log("✅ Battle Online V12 - white page fixed");
})();
