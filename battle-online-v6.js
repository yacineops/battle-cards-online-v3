// battle-online-v6.js - V14 - طاولة بطاقات حقيقية متزامنة
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
  let myHand = [];
  let gameScores = {};
  let gameTurn = "";
  let lastPlay = null;
  let joinTimer = null;
  let gameStarted = false;

  function saveName(n){ myName = (n||"").trim().slice(0,20) || "اللاعب 1"; try{ localStorage.setItem("bc_player_name", myName); }catch(e){} }
  function toast(msg){
    let t = document.getElementById("bc-online-toast");
    if(!t){ t=document.createElement("div"); t.id="bc-online-toast"; t.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:12px 18px;border-radius:99px;font-weight:700;z-index:99999;max-width:92%;text-align:center;font-size:14px"; document.body.appendChild(t); }
    t.textContent=msg; t.style.display="block"; clearTimeout(t._h); t._h=setTimeout(()=>{ t.style.display="none"; }, 4000);
  }
  function closeOverlay(){ let o=document.getElementById("bc-online-overlay"); if(o) o.remove(); }
  function showOverlay(title, innerHTML){
    closeOverlay();
    let o=document.createElement("div"); o.id="bc-online-overlay";
    o.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:12px 10px;overflow-y:auto;touch-action:manipulation";
    o.innerHTML='<div id="bc-box" style="background:#1e2a38;border-radius:20px;padding:16px;width:100%;max-width:420px;text-align:center;color:#fff">'
      + '<h3 style="margin:0 0 8px;font-size:19px">'+title+'</h3>' + innerHTML + '</div>';
    o.addEventListener("click", function(e){ if(e.target===o){ e.preventDefault(); } });
    document.body.appendChild(o); return o;
  }
  function btn(c1,c2,txt){ return "width:100%;border:0;border-radius:14px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,"+c1+","+c2+");color:"+txt+";margin:5px 0"; }
  function countSelector(){
    return '<div style="margin:10px 0 6px"><div style="font-size:13px;color:#b0c4de;margin-bottom:6px">👥 اختر عدد اللاعبين</div><div style="display:flex;gap:8px;justify-content:center">'
      + [2,3,4].map(function(n){ let a=(n===maxPlayers); return '<button data-count="'+n+'" class="bc-count-btn" style="flex:1;border:0;border-radius:12px;padding:12px;font-size:16px;font-weight:800;cursor:pointer;background:'+(a?"linear-gradient(135deg,#ff8f00,#ffc107);color:#222":"rgba(255,255,255,.15);color:#fff")+'">👥 '+n+'</button>'; }).join("")
      + '</div><div id="bc-count-label" style="font-size:12px;color:#ffc107;margin-top:6px">المختار الآن: '+maxPlayers+' لاعبين</div></div>';
  }
  function bindCountSelector(){
    document.querySelectorAll(".bc-count-btn").forEach(function(b){
      b.onclick=function(){ maxPlayers=parseInt(b.getAttribute("data-count"),10)||2;
        document.querySelectorAll(".bc-count-btn").forEach(function(x){ let n=parseInt(x.getAttribute("data-count"),10); if(n===maxPlayers){ x.style.background="linear-gradient(135deg,#ff8f00,#ffc107)"; x.style.color="#222"; } else { x.style.background="rgba(255,255,255,.15)"; x.style.color="#fff"; } });
        let l=document.getElementById("bc-count-label"); if(l) l.textContent="المختار الآن: "+maxPlayers+" لاعبين";
      };
    });
  }
  function connect(){
    return new Promise(function(resolve, reject){
      if(ws && ws.readyState===1) return resolve(ws);
      try{ if(ws) ws.close(); }catch(e){}
      ws=new WebSocket(WS_URL);
      ws.onopen=function(){ resolve(ws); };
      ws.onerror=function(){ reject(new Error("WS")); };
      ws.onmessage=function(ev){
        try{
          let d=JSON.parse(ev.data); let type=(d.type||"").toLowerCase();
          if(d.maxPlayers) maxPlayers=parseInt(d.maxPlayers,10)||maxPlayers;
          if(d.names) playerNames=d.names;
          if(type==="room_created"){ if(d.code) myCode=String(d.code); playerCount=1; updateWaiting(); }
          if(type==="joined"||type==="player_joined"||type==="room_update"||type==="match_found"){
            if(d.code) myCode=String(d.code);
            if(typeof d.players==="number") playerCount=d.players;
            if(Array.isArray(d.players)) playerCount=d.players.length;
            if(typeof d.count==="number") playerCount=d.count;
            clearTimeout(joinTimer);
            if(type==="match_found"){ toast("🎉 اكتمل العدد!"); openWaiting(); } else if(!gameStarted) updateWaiting();
          }
          if(type==="error"){ clearTimeout(joinTimer); toast("❌ "+(d.message||"خطأ")); if(!gameStarted) setTimeout(openJoin,800); }
          if(type==="your_hand"){ myHand=d.hand||[]; if(gameStarted) renderGame(); }
          if(type==="game_started"){ gameStarted=true; toast("▶️ بدأت اللعبة!"); openGameScreen(); }
          if(type==="game_state"){
            gameScores=d.scores||{}; gameTurn=d.turnName||d.turn||""; lastPlay=d.lastPlay||null;
            if(gameStarted) renderGame();
          }
          if(type==="game_over"){
            toast("🏆 الفائز: "+d.winner);
            setTimeout(function(){ showOverlay("🏆 انتهت اللعبة!", '<p style="font-size:20px">الفائز: <b style="color:#ffc107">'+d.winner+'</b></p><p style="color:#b0c4de">'+Object.keys(d.scores||{}).map(function(n){ return n+": "+d.scores[n]+" نقطة"; }).join("<br>")+'</p><button id="bc-again" style="'+btn("#ff8f00","#ffc107","#222")+'">🔄 العب مرة أخرى</button><button id="bc-back-menu" style="width:100%;border:0;border-radius:14px;padding:12px;font-weight:700;background:rgba(255,255,255,.15);color:#fff">⬅️ رجوع للقائمة</button>'); document.getElementById("bc-again").onclick=function(){ gameStarted=false; openWaiting(); }; document.getElementById("bc-back-menu").onclick=function(){ gameStarted=false; openMenu(); }; }, 600);
          }
          if(type==="player_left"){ playerCount=Math.max(1,playerCount-1); if(!gameStarted) updateWaiting(); else toast("👋 لاعب خرج"); }
        }catch(e){}
      };
    });
  }
  function sendSafe(obj){ try{ if(ws && ws.readyState===1){ ws.send(JSON.stringify(obj)); return true; } }catch(e){} return false; }
  function updateWaiting(){
    let codeEl=document.getElementById("bc-code"); let countEl=document.getElementById("bc-count"); let namesEl=document.getElementById("bc-names"); let startBtn=document.getElementById("bc-start-btn");
    if(codeEl) codeEl.textContent=myCode||"••••••";
    if(countEl) countEl.textContent="👥 اللاعبون: "+playerCount+" / "+maxPlayers;
    if(namesEl){ if(playerNames && playerNames.length) namesEl.innerHTML=playerNames.map(function(n){ return "<div>✅ "+n+"</div>"; }).join(""); else namesEl.innerHTML="<div>✅ "+myName+" (أنت)</div>"; }
    if(startBtn){ if(playerCount>=maxPlayers){ startBtn.disabled=false; startBtn.style.opacity="1"; startBtn.textContent="▶️ ابدأ اللعب ("+playerCount+" / "+maxPlayers+")"; } else { startBtn.disabled=true; startBtn.style.opacity="0.5"; startBtn.textContent="⏳ نستنى "+(maxPlayers-playerCount)+" لاعب... ("+playerCount+" / "+maxPlayers+")"; } }
  }

  // طاولة اللعبة الحقيقية
  function renderGame(){
    let box=document.getElementById("bc-box"); if(!box) return;
    let isMyTurn = (gameTurn===myName);
    let scoresHtml = playerNames.map(function(n){
      let s = (gameScores[n]!==undefined?gameScores[n]:20);
      return '<div style="flex:1;background:'+(n===myName?"rgba(255,193,7,.2)":"rgba(255,255,255,.08)")+';border-radius:12px;padding:8px;font-size:13px">'+(n===gameTurn?"👉 ":"")+n+'<br><b style="font-size:18px;color:#ffc107">'+s+'</b> نقطة'+(n===myName?" (أنت)":"")+'</div>';
    }).join("");
    let centerHtml = lastPlay ? '<div style="background:rgba(255,255,255,.1);border-radius:14px;padding:12px;margin:10px 0"><div style="font-size:36px">'+(lastPlay.card?lastPlay.card.emoji:"🃏")+'</div><div style="font-size:13px;color:#ffc107">'+(lastPlay.log||"")+'</div></div>' : '<div style="background:rgba(255,255,255,.06);border-radius:14px;padding:14px;margin:10px 0;color:#b0c4de;font-size:13px">🃏 لم تلعب أي بطاقة بعد<br>ابدأ أنت أو انتظر دورك</div>';
    let handHtml = myHand.map(function(c){
      return '<button data-card="'+c.id+'" class="bc-card-btn" style="flex:1 0 28%;border:2px solid '+(isMyTurn?"#ffc107":"rgba(255,255,255,.2)")+';background:#fff;color:#222;border-radius:14px;padding:10px 4px;cursor:'+(isMyTurn?"pointer":"not-allowed")+';opacity:'+(isMyTurn?"1":"0.6")+'"><div style="font-size:26px">'+c.emoji+'</div><div style="font-size:11px;font-weight:800;line-height:1.2">'+c.name+'</div><div style="font-size:10px;color:#666">'+c.desc+'</div></button>';
    }).join("");
    box.innerHTML = '<h3 style="margin:0 0 6px;font-size:19px">🎮 لعبة أونلاين - غرفة '+myCode+'</h3>'
      + '<div style="display:flex;gap:6px">'+scoresHtml+'</div>'
      + '<div style="margin:8px 0;font-weight:800;color:'+(isMyTurn?"#4caf50":"#ffc107")+'">'+(isMyTurn?"✅ دورك الآن - اختر بطاقة":"⏳ دور: "+gameTurn+" - انتظر")+'</div>'
      + centerHtml
      + '<div style="font-size:13px;color:#b0c4de;margin:6px 0">🃏 بطاقاتك ('+myHand.length+') - اضغط على بطاقة للعبها</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">'+handHtml+'</div>'
      + '<button id="bc-leave-game" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:12px 0 0">🚪 مغادرة الغرفة</button>';
    document.getElementById("bc-leave-game").onclick=function(){ gameStarted=false; sendSafe({ type:"leave", code: myCode }); myCode=""; playerCount=1; openMenu(); };
    document.querySelectorAll(".bc-card-btn").forEach(function(b){
      b.onclick=function(){
        if(!isMyTurn){ toast("ليس دورك، دور "+gameTurn); return; }
        let cid=b.getAttribute("data-card");
        toast("⏳ جاري لعب البطاقة...");
        sendSafe({ type:"play_card", cardId: cid, card_id: cid, id: cid, code: myCode });
      };
    });
  }
  function openGameScreen(){ gameStarted=true; showOverlay("🎮 لعبة أونلاين - بدأت!", '<div id="bc-game-loading" style="padding:20px;color:#b0c4de">⏳ جاري توزيع البطاقات...</div>'); renderGame(); }

  function openMenu(){
    gameStarted=false;
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
    document.getElementById("bc-close").onclick=function(){ closeOverlay(); };
    document.getElementById("bc-quick").onclick=openSearch;
    document.getElementById("bc-join-open").onclick=openJoin;
    document.getElementById("bc-create").onclick=function(){
      toast("⏳ جاري إنشاء غرفة لـ "+maxPlayers+" لاعبين...");
      connect().then(function(){ sendSafe({ type:"create", name: myName, maxPlayers: maxPlayers }); myCode=""; playerCount=1; playerNames=[myName]; setTimeout(openWaiting,400); }).catch(function(){ toast("❌ مقدرتش نتصل بالسيرفر"); });
    };
  }
  function openSearch(){
    showOverlay("🔍 جاري البحث عن لاعبين...",
      '<div style="font-size:50px;margin:10px 0">🔍</div><p style="color:#b0c4de;font-size:14px;margin:0 0 10px">نبحث عن <b style="color:#ffc107">'+maxPlayers+' لاعبين</b>...</p><div style="font-size:13px;color:#ffc107;font-weight:700">⏳ البحث جاري... (1 / '+maxPlayers+')</div><button id="bc-cancel-search" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:14px 0 0">إلغاء البحث</button>'
    );
    connect().then(function(){ sendSafe({ type:"quick_play", name: myName, maxPlayers: maxPlayers }); }).catch(function(){ toast("❌ مقدرتش نتصل بالسيرفر"); });
    document.getElementById("bc-cancel-search").onclick=function(){ sendSafe({ type:"cancel_search" }); openMenu(); };
  }
  function openJoin(){
    showOverlay("🔑 دخول لغرفة",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 16px">أدخل رقم الغرفة المكوّن من 6 أرقام</p><input id="bc-join-code" inputmode="numeric" placeholder="000000" style="width:100%;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font-size:22px;text-align:center;letter-spacing:4px;font-weight:800"><button id="bc-join-go" style="'+btn("#1976d2","#2196f3","#fff")+'">دخول</button><button id="bc-join-back" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;margin:5px 0">⬅️ رجوع</button>'
    );
    let inp=document.getElementById("bc-join-code"); inp.focus();
    inp.addEventListener("input", function(){ inp.value=inp.value.replace(/[^0-9]/g,"").slice(0,6); });
    document.getElementById("bc-join-back").onclick=openMenu;
    document.getElementById("bc-join-go").onclick=function(){
      let code=inp.value.trim(); if(code.length<4){ toast("أدخل رقم الغرفة بشكل صحيح"); return; }
      myCode=code; toast("⏳ جاري الدخول..."); clearTimeout(joinTimer); joinTimer=setTimeout(function(){ toast("❌ لم يرد السيرفر"); },4000);
      connect().then(function(){ sendSafe({ type:"join", code: code, roomCode: code, name: myName }); playerCount=1; setTimeout(openWaiting,400); }).catch(function(){ toast("❌ مقدرتش نتصل بالسيرفر"); });
    };
  }
  function openWaiting(){
    showOverlay("غرفتك جاهزة",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 8px">أرسل الرقم لأصدقائك</p><div id="bc-code" style="font-size:32px;font-weight:900;letter-spacing:4px;border:2px dashed #ffc107;border-radius:14px;padding:14px 8px;margin:8px 0">••••••</div><div id="bc-count" style="font-size:16px;font-weight:700">👥 اللاعبون: 1 / '+maxPlayers+'</div><div id="bc-names" style="font-size:14px;margin:10px 0;line-height:1.8;color:#fff"></div><button id="bc-start-btn" disabled style="'+btn("#ff8f00","#ffc107","#222")+'opacity:0.5">⏳ نستنى...</button><button id="bc-cancel" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:5px 0">إلغاء</button>'
    );
    updateWaiting();
    document.getElementById("bc-cancel").onclick=function(){ sendSafe({ type:"leave", code: myCode }); openMenu(); };
    document.getElementById("bc-start-btn").onclick=function(){ if(playerCount<maxPlayers){ toast("مازال ناقص "+(maxPlayers-playerCount)+" لاعب"); return; } sendSafe({ type:"start", code: myCode }); };
  }
  function handleOpen(e){
    let btn=e.target && e.target.closest ? e.target.closest("button") : null; if(!btn) return;
    let txt=(btn.textContent||"").trim();
    if(txt==="العب أونلاين" || (txt.indexOf("العب أونلاين")!==-1 && txt.length<30)){ e.preventDefault(); setTimeout(openMenu,80); }
  }
  document.addEventListener("click", handleOpen, false);
  console.log("✅ Battle Online V14 - real board");
})();
