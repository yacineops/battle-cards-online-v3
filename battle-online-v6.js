// battle-online-v6.js - V9 - اختيار 2 / 3 / 4 قبل البحث أو إنشاء غرفة
(function(){
  "use strict";
  const WS_URL = "wss://battle-cards-online-v2.onrender.com";
  let ws = null;
  let myCode = "";
  let myName = "اللاعب 1";
  let playerCount = 1;
  let maxPlayers = 2; // العدد الذي اختاره اللاعب
  let joinTimer = null;

  function toast(msg){
    let t = document.getElementById("bc-online-toast");
    if(!t){
      t = document.createElement("div");
      t.id = "bc-online-toast";
      t.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:12px 18px;border-radius:99px;font-weight:700;z-index:99999;max-width:92%;text-align:center;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.4)";
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
    let o = document.createElement("div");
    o.id = "bc-online-overlay";
    o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px 16px;overflow-y:auto;touch-action:manipulation";
    o.innerHTML = '<div id="bc-box" style="background:#1e2a38;border-radius:20px;padding:22px;width:100%;max-width:360px;text-align:center;color:#fff;box-shadow:0 20px 50px rgba(0,0,0,.5)">'
      + '<h3 style="margin:0 0 8px;font-size:20px">' + title + '</h3>' + innerHTML + '</div>';
    let box = o.querySelector("#bc-box");
    ["click","touchstart","touchend","pointerdown","pointerup","mousedown","mouseup"].forEach(function(ev){
      box.addEventListener(ev, function(e){ e.stopPropagation(); }, true);
      o.addEventListener(ev, function(e){ if(e.target === o){ e.stopPropagation(); e.preventDefault(); } }, true);
    });
    document.body.appendChild(o);
    return o;
  }

  function btn(c1,c2,txt){ return "width:100%;border:0;border-radius:14px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,"+c1+","+c2+");color:"+txt+";margin:5px 0"; }

  // أزرار اختيار العدد 2 / 3 / 4
  function countSelector(){
    return '<div style="margin:10px 0 6px"><div style="font-size:13px;color:#b0c4de;margin-bottom:6px">👥 اختر عدد اللاعبين</div>'
      + '<div style="display:flex;gap:8px;justify-content:center">'
      + [2,3,4].map(function(n){
          let active = (n === maxPlayers);
          return '<button data-count="'+n+'" class="bc-count-btn" style="flex:1;border:0;border-radius:12px;padding:12px;font-size:16px;font-weight:800;cursor:pointer;background:'+(active ? "linear-gradient(135deg,#ff8f00,#ffc107);color:#222" : "rgba(255,255,255,.15);color:#fff")+'">👥 '+n+'</button>';
        }).join("")
      + '</div>'
      + '<div style="font-size:12px;color:#ffc107;margin-top:6px">المختار الآن: <b>'+maxPlayers+' لاعبين</b></div></div>';
  }

  function bindCountSelector(){
    let btns = document.querySelectorAll(".bc-count-btn");
    btns.forEach(function(b){
      b.addEventListener("click", function(e){
        e.stopPropagation();
        maxPlayers = parseInt(b.getAttribute("data-count"), 10) || 2;
        // نعيد رسم الأزرار لتحديث اللون
        let parent = b.parentElement;
        if(parent){
          parent.querySelectorAll(".bc-count-btn").forEach(function(x){
            let n = parseInt(x.getAttribute("data-count"),10);
            if(n === maxPlayers){ x.style.background = "linear-gradient(135deg,#ff8f00,#ffc107)"; x.style.color = "#222"; }
            else { x.style.background = "rgba(255,255,255,.15)"; x.style.color = "#fff"; }
          });
        }
        let label = document.getElementById("bc-count-label");
        if(label) label.textContent = "المختار الآن: " + maxPlayers + " لاعبين";
        toast("✅ اخترت " + maxPlayers + " لاعبين");
      });
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
          if(type === "room_created"){
            if(d.code) myCode = String(d.code);
            playerCount = 1;
            updateWaiting();
          }
          if(type === "joined" || type === "player_joined" || type === "room_update" || type === "match_found"){
            if(d.code) myCode = String(d.code);
            if(typeof d.players === "number") playerCount = d.players;
            if(Array.isArray(d.players)) playerCount = d.players.length;
            if(typeof d.count === "number") playerCount = d.count;
            clearTimeout(joinTimer);
            if(type === "match_found"){
              toast("🎉 اكتمل العدد! " + playerCount + " / " + maxPlayers);
              openWaiting();
            } else updateWaiting();
            if(playerCount >= maxPlayers) toast("🎉 اكتمل العدد! " + playerCount + " / " + maxPlayers + " - تقدر تبدا");
          }
          if(type === "error"){
            clearTimeout(joinTimer);
            toast("❌ " + (d.message || "الغرفة غير موجودة"));
            setTimeout(openJoin, 800);
          }
          if(type === "game_started"){ toast("▶️ بدأت اللعبة!"); closeOverlay(); }
          if(type === "player_left"){
            playerCount = Math.max(1, playerCount - 1);
            updateWaiting();
            toast("👋 اللاعب الآخر خرج");
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
    let startBtn = document.getElementById("bc-start-btn");
    if(codeEl) codeEl.textContent = myCode || "••••••";
    if(countEl) countEl.textContent = "👥 اللاعبون: " + playerCount + " / " + maxPlayers;
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

  function openMenu(){
    showOverlay("🌐 العب أونلاين",
      '<p style="color:#b0c4de;font-size:14px;line-height:1.6;margin:0 0 10px">اختر عدد اللاعبين أولًا، بعدها اختر طريقة اللعب.</p>'
      + '<label style="display:block;text-align:right;font-size:13px;color:#b0c4de;margin-bottom:4px">اسمك<br><input id="bc-name" value="'+myName+'" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font-size:15px;margin-top:5px"></label>'
      + countSelector()
      + '<button id="bc-quick" style="'+btn("#ff8f00","#ffc107","#222")+'">🔍 بحث عن لاعبين - لعب سريع</button>'
      + '<button id="bc-create" style="'+btn("#1976d2","#2196f3","#fff")+'">➕ إنشاء غرفة</button>'
      + '<button id="bc-join-open" style="'+btn("#455a64","#607d8b","#fff")+'">🔑 دخول لغرفة بالكود</button>'
      + '<button id="bc-close" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;margin:5px 0">⬅️ رجوع</button>'
    );
    bindCountSelector();
    document.getElementById("bc-name").addEventListener("input", function(e){ myName = e.target.value.slice(0,20) || "اللاعب 1"; });
    document.getElementById("bc-close").onclick = closeOverlay;
    document.getElementById("bc-quick").onclick = openSearch;
    document.getElementById("bc-join-open").onclick = openJoin;
    document.getElementById("bc-create").onclick = function(){
      toast("⏳ جاري إنشاء غرفة لـ " + maxPlayers + " لاعبين...");
      connect().then(function(){
        sendSafe({ type:"create", name: myName, maxPlayers: maxPlayers, playerCount: maxPlayers });
        myCode = ""; playerCount = 1;
        setTimeout(openWaiting, 400);
      }).catch(function(){ toast("❌ مقدرتش نتصل بالسيرفر"); });
    };
  }

  function openSearch(){
    showOverlay("🔍 جاري البحث عن لاعبين...",
      '<div style="font-size:50px;margin:10px 0">🔍</div>'
      + '<p style="color:#b0c4de;font-size:14px;line-height:1.6;margin:0 0 10px">نبحث عن <b style="color:#ffc107">' + maxPlayers + ' لاعبين</b> مثلك...<br>عندما يكتمل العدد راح ندخلك تلقائيًا.</p>'
      + '<div style="font-size:13px;color:#ffc107;font-weight:700">⏳ البحث جاري... (1 / ' + maxPlayers + ')</div>'
      + '<button id="bc-cancel-search" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:14px 0 0">إلغاء البحث</button>'
    );
    connect().then(function(){
      sendSafe({ type:"quick_play", name: myName, maxPlayers: maxPlayers, playerCount: maxPlayers });
    }).catch(function(){ toast("❌ مقدرتش نتصل بالسيرفر"); });
    document.getElementById("bc-cancel-search").onclick = function(){
      sendSafe({ type:"cancel_search" });
      openMenu();
    };
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
      + '<button id="bc-start-btn" disabled style="'+btn("#ff8f00","#ffc107","#222")+'opacity:0.5">⏳ نستنى...</button>'
      + '<button id="bc-cancel" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:5px 0">إلغاء</button>'
    );
    updateWaiting();
    document.getElementById("bc-cancel").onclick = function(){ sendSafe({ type:"leave", code: myCode }); closeOverlay(); };
    document.getElementById("bc-start-btn").onclick = function(){
      if(playerCount < maxPlayers){ toast("مازال ناقص " + (maxPlayers - playerCount) + " لاعب"); return; }
      sendSafe({ type:"start", code: myCode });
      toast("▶️ بدينا!");
      closeOverlay();
      let btns = Array.from(document.querySelectorAll("button"));
      let start = btns.find(function(b){ return (b.textContent||"").includes("ابدأ اللعب"); });
      if(start) start.click();
    };
  }

  function handleOpen(e){
    let btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if(!btn) return;
    let txt = (btn.textContent || "").trim();
    if(txt.indexOf("العب أونلاين") !== -1 || txt.indexOf("لعب أونلاين") !== -1 || txt.indexOf("لعب مع صديق") !== -1){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      setTimeout(openMenu, 60);
    }
  }
  document.addEventListener("click", handleOpen, true);
  document.addEventListener("touchend", handleOpen, true);
  console.log("✅ Battle Online V9 - 2/3/4 loaded");
})();
