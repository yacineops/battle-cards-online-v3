// battle-online-v6.js - V7 FINAL - نسخة مصححة
// يحل مشكلة Join مع React - يعمل عن طريق Overlay فوق اللعبة
(function(){
  "use strict";

  const WS_URL = "wss://battle-cards-online-v2.onrender.com";
  let ws = null;
  let myCode = "";
  let myName = "اللاعب 1";
  let playerCount = 1;
  let isConnected = false;
  let reconnectTimer = null;

  // ---------- أدوات مساعدة ----------

  function toast(msg){
    let t = document.getElementById("bc-online-toast");
    if(!t){
      t = document.createElement("div");
      t.id = "bc-online-toast";
      t.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:12px 18px;border-radius:99px;font-weight:700;z-index:99999;max-width:92%;text-align:center;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.4)";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(t._h);
    t._h = setTimeout(()=>{ t.style.display = "none"; }, 3500);
  }

  function closeOverlay(){
    let o = document.getElementById("bc-online-overlay");
    if(o) o.remove();
  }

  function showOverlay(title, innerHTML){
    closeOverlay();
    let o = document.createElement("div");
    o.id = "bc-online-overlay";
    o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px 16px;overflow-y:auto";
    o.innerHTML = '<div style="background:#1e2a38;border-radius:20px;padding:22px;width:100%;max-width:360px;text-align:center;color:#fff;box-shadow:0 20px 50px rgba(0,0,0,.5)">'
      + '<h3 style="margin:0 0 8px;font-size:20px">' + title + '</h3>' + innerHTML + '</div>';
    o.addEventListener("click", function(e){ if(e.target === o) closeOverlay(); });
    document.body.appendChild(o);
    return o;
  }

  function btnStyle(color1, color2, colorText){
    return "width:100%;border:0;border-radius:14px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,"+color1+","+color2+");color:"+colorText+";margin:5px 0";
  }

  // ---------- الاتصال بالسيرفر ----------

  function connect(){
    return new Promise(function(resolve, reject){
      if(ws && ws.readyState === 1){
        isConnected = true;
        return resolve(ws);
      }
      try{ if(ws) ws.close(); }catch(e){}
      ws = new WebSocket(WS_URL);

      ws.onopen = function(){
        isConnected = true;
        resolve(ws);
      };

      ws.onerror = function(){
        isConnected = false;
        reject(new Error("WS error"));
      };

      ws.onclose = function(){
        isConnected = false;
      };

      ws.onmessage = function(ev){
        try{
          let d = JSON.parse(ev.data);

          // السيرفر قد يرسل أسماء مختلفة، نقبل كل الاحتمالات
          let type = (d.type || d.event || "").toLowerCase();

          if(type === "room_created" || type === "roomcreated" || type === "created"){
            if(d.code) myCode = String(d.code);
            if(d.roomCode) myCode = String(d.roomCode);
            playerCount = 1;
            updateWaiting();
          }

          if(type === "joined" || type === "join_success" || type === "player_joined" || type === "playerjoined" || type === "room_update" || type === "roomupdate" || type === "update"){
            if(d.code) myCode = String(d.code);
            if(d.roomCode) myCode = String(d.roomCode);
            if(typeof d.players === "number") playerCount = d.players;
            if(Array.isArray(d.players)) playerCount = d.players.length;
            if(typeof d.count === "number") playerCount = d.count;
            if(typeof d.playerCount === "number") playerCount = d.playerCount;
            updateWaiting();
            if(playerCount >= 2){
              toast("🎉 صاحبك دخل! 2 / 2 - تقدر تبدا");
            }
          }

          if(type === "error" || type === "join_error" || type === "not_found"){
            toast("❌ " + (d.message || d.error || "الغرفة غير موجودة"));
          }

          if(type === "game_started" || type === "start" || type === "game_start"){
            toast("▶️ بدأت اللعبة!");
            closeOverlay();
          }

        }catch(e){}
      };
    });
  }

  function sendSafe(obj){
    try{
      if(ws && ws.readyState === 1){
        ws.send(JSON.stringify(obj));
        return true;
      }
    }catch(e){}
    return false;
  }

  // ---------- شاشات الأونلاين ----------

  function updateWaiting(){
    let codeEl = document.getElementById("bc-code");
    let countEl = document.getElementById("bc-count");
    let startBtn = document.getElementById("bc-start-btn");
    if(codeEl) codeEl.textContent = myCode || "••••••";
    if(countEl) countEl.textContent = "👥 اللاعبون: " + playerCount + " / 2";
    if(startBtn){
      if(playerCount >= 2){
        startBtn.disabled = false;
        startBtn.style.opacity = "1";
        startBtn.textContent = "▶️ ابدأ اللعب أونلاين (2/2)";
      } else {
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        startBtn.textContent = "⏳ استنى صاحبك يدخل...";
      }
    }
  }

  function openMenu(){
    showOverlay("🌐 العب أونلاين",
      '<p style="color:#b0c4de;font-size:14px;line-height:1.6;margin:0 0 16px">العب حقيقي مع صاحبك - غرفة حقيقية على السيرفر.</p>'
      + '<label style="display:block;text-align:right;font-size:13px;color:#b0c4de;margin-bottom:8px">اسمك في اللعبة<br><input id="bc-name" value="'+myName+'" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font-size:15px;margin-top:5px"></label>'
      + '<button id="bc-create" style="'+btnStyle("#1976d2","#2196f3","#fff")+'">➕ إنشاء غرفة حقيقية</button>'
      + '<button id="bc-join-open" style="'+btnStyle("#455a64","#607d8b","#fff")+'">🔑 دخول لغرفة</button>'
      + '<button id="bc-close" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;margin:5px 0">⬅️ رجوع</button>'
    );

    document.getElementById("bc-name").addEventListener("input", function(e){
      myName = e.target.value.slice(0,20) || "اللاعب 1";
    });
    document.getElementById("bc-close").onclick = closeOverlay;

    document.getElementById("bc-create").onclick = function(){
      toast("⏳ جاري إنشاء الغرفة...");
      connect().then(function(){
        // نرسل بصيغتين لضمان التوافق مع أي سيرفر
        sendSafe({ type:"create", name: myName });
        sendSafe({ type:"create_room", name: myName });
        myCode = "";
        playerCount = 1;
        setTimeout(function(){ openWaiting(); }, 400);
      }).catch(function(){
        toast("❌ مقدرتش نتصل بالسيرفر - تأكد Render راه Online");
      });
    };

    document.getElementById("bc-join-open").onclick = openJoin;
  }

  function openJoin(){
    showOverlay("🔑 دخول لغرفة",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 16px">أدخل رقم الغرفة المكوّن من 6 أرقام</p>'
      + '<input id="bc-join-code" inputmode="numeric" placeholder="000000" style="width:100%;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font-size:22px;text-align:center;letter-spacing:4px;font-weight:800">'
      + '<button id="bc-join-go" style="'+btnStyle("#1976d2","#2196f3","#fff")+'">دخول</button>'
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
      connect().then(function(){
        sendSafe({ type:"join", code: code, roomCode: code, name: myName });
        playerCount = 1;
        setTimeout(function(){ openWaiting(); }, 400);
      }).catch(function(){
        toast("❌ مقدرتش نتصل بالسيرفر");
      });
    };
  }

  function openWaiting(){
    showOverlay("غرفتك جاهزة",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 8px">أرسل الرقم لصاحبك</p>'
      + '<div id="bc-code" style="font-size:32px;font-weight:900;letter-spacing:4px;border:2px dashed #ffc107;border-radius:14px;padding:14px 8px;margin:8px 0">••••••</div>'
      + '<div id="bc-count" style="font-size:16px;font-weight:700">👥 اللاعبون: 1 / 2</div>'
      + '<p style="color:#b0c4de;font-size:12px;margin:10px 0 0">خلي الصفحة مفتوحة، صاحبك كي يدخل راح يبان 2 / 2 تلقائيًا</p>'
      + '<button id="bc-start-btn" disabled style="'+btnStyle("#ff8f00","#ffc107","#222")+'opacity:0.5">⏳ استنى صاحبك يدخل...</button>'
      + '<button id="bc-cancel" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:5px 0">إلغاء</button>'
    );

    updateWaiting();

    document.getElementById("bc-cancel").onclick = function(){
      sendSafe({ type:"leave", code: myCode });
      closeOverlay();
    };

    document.getElementById("bc-start-btn").onclick = function(){
      if(playerCount < 2){ toast("استنى صاحبك يدخل"); return; }
      sendSafe({ type:"start", code: myCode });
      toast("▶️ بدينا!");
      closeOverlay();
      // نبدأ واجهة اللعبة المحلية بنفس العدد
      let btns = Array.from(document.querySelectorAll("button"));
      let start = btns.find(function(b){ return (b.textContent||"").includes("ابدأ اللعب"); });
      if(start) start.click();
    };
  }

  // ---------- اعتراض أزرار React قبل ما تخدم ----------

  document.addEventListener("click", function(e){
    let btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if(!btn) return;
    let txt = (btn.textContent || "").trim();

    if(txt.indexOf("العب أونلاين") !== -1 || txt.indexOf("لعب أونلاين") !== -1 || txt.indexOf("لعب مع صديق") !== -1){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setTimeout(openMenu, 60);
      return;
    }
  }, true);

  console.log("✅ Battle Online V7 FINAL loaded");
})();
