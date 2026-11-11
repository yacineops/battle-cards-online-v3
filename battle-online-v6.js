// battle-online-v6.js - V15 FINAL - نفس طاولة الأصلية بالضبط، الأونلاين غير مزامنة
// لا يرسم طاولة جديدة: يعيد استخدام نفس domino-board + card + player تاع index.html الأصلي
(function(){
  "use strict";
  const WS_URL = "wss://battle-cards-online-v2.onrender.com";
  let ws=null, myCode="", myName="";
  try{ myName = localStorage.getItem("bc_player_name")||""; }catch(e){}
  if(!myName) myName="اللاعب 1";
  let maxPlayers=2, playerCount=1, playerNames=[], joinTimer=null, gameStarted=false, game=null, myIndex=-1, _lastBigKey="", _doublePicks=[], _timerInt=null, _pendingDelayUntil=0, _lastPendingKey="", _timerDeadline=0, _timerLoopStarted=false, _timerTotal=20;

  function saveName(n){ myName=(n||"").trim().slice(0,20)||"اللاعب 1"; try{localStorage.setItem("bc_player_name",myName);}catch(e){} }
  function toast(msg){
    let t=document.getElementById("bc-online-toast");
    if(!t){ t=document.createElement("div"); t.id="bc-online-toast"; t.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:12px 18px;border-radius:99px;font-weight:700;z-index:99999;max-width:92%;text-align:center;font-size:14px"; document.body.appendChild(t); }
    t.textContent=msg; t.style.display="block"; clearTimeout(t._h); t._h=setTimeout(()=>{t.style.display="none";},4000);
  }
  function closeOverlay(){ let o=document.getElementById("bc-online-overlay"); if(o) o.remove(); }
  function closeReactModal(){
    try{
      let backs=Array.from(document.querySelectorAll("button")).filter(b=>{ let t=(b.textContent||"").trim(); return t.indexOf("رجوع")!==-1 && b.offsetParent!==null; });
      if(backs.length) backs[backs.length-1].click();
    }catch(e){}
  }
  // ---- overlays للقائمة فقط: إنشاء / دخول / انتظار ----
  function showOverlay(title, innerHTML){
    closeOverlay();
    let o=document.createElement("div"); o.id="bc-online-overlay";
    o.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:1001;display:flex;align-items:flex-start;justify-content:center;padding:20px 16px 16px;overflow-y:auto";
    o.innerHTML='<div style="background:#1e2a38;border-radius:20px;padding:22px;width:100%;max-width:360px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.5);color:#fff"><h3 style="margin:0 0 8px;font-size:20px">'+title+'</h3>'+innerHTML+'</div>';
    document.body.appendChild(o); return o;
  }
  function btn(c1,c2,txt){ return "width:100%;border:0;border-radius:14px;padding:13px 18px;margin:5px;font-size:16px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,"+c1+","+c2+");color:"+txt+";box-shadow:0 4px 12px rgba(0,0,0,.3)"; }
  function countSelector(){
    return '<div style="margin:10px 0 6px"><div style="font-size:13px;color:#b0c4de;margin-bottom:6px">👥 اختر عدد اللاعبين</div><div style="display:flex;gap:8px;justify-content:center">'
      + [2,3,4].map(n=>{ let a=(n===maxPlayers); return '<button data-count="'+n+'" class="bc-count-btn" style="flex:1;border:0;border-radius:12px;padding:12px;font-size:16px;font-weight:800;cursor:pointer;background:'+(a?"linear-gradient(135deg,#ff8f00,#ffc107);color:#222":"rgba(255,255,255,.15);color:#fff")+'">👥 '+n+'</button>'; }).join("")
      + '</div><div id="bc-count-label" style="font-size:12px;color:#ffc107;margin-top:6px">المختار الآن: '+maxPlayers+' لاعبين</div></div>';
  }
  function bindCountSelector(){
    document.querySelectorAll(".bc-count-btn").forEach(b=>{ b.onclick=()=>{ maxPlayers=parseInt(b.getAttribute("data-count"),10)||2;
      document.querySelectorAll(".bc-count-btn").forEach(x=>{ let n=parseInt(x.getAttribute("data-count"),10); if(n===maxPlayers){x.style.background="linear-gradient(135deg,#ff8f00,#ffc107)";x.style.color="#222";} else {x.style.background="rgba(255,255,255,.15)";x.style.color="#fff";} });
      let l=document.getElementById("bc-count-label"); if(l) l.textContent="المختار الآن: "+maxPlayers+" لاعبين"; }; });
  }
  function connect(){
    return new Promise((resolve,reject)=>{
      if(ws && ws.readyState===1) return resolve(ws);
      try{ if(ws) ws.close(); }catch(e){}
      ws=new WebSocket(WS_URL);
      ws.onopen=()=>resolve(ws);
      ws.onerror=()=>reject(new Error("WS"));
      ws.onclose=()=>{ if(gameStarted) toast("⚠️ انقطع الاتصال بالسيرفر"); };
      ws.onmessage=(ev)=>{
        try{
          let d=JSON.parse(ev.data); let type=(d.type||"").toLowerCase();
          if(d.maxPlayers) maxPlayers=parseInt(d.maxPlayers,10)||maxPlayers;
          if(d.names) playerNames=d.names;
          if(d.game) game=d.game;
          if(type==="room_created"){ if(d.code) myCode=String(d.code); playerCount=1; myIndex=0; updateWaiting(); }
          if(type==="joined"||type==="player_joined"||type==="room_update"||type==="match_found"){
            if(d.code) myCode=String(d.code);
            if(typeof d.players==="number") playerCount=d.players;
            if(typeof d.count==="number") playerCount=d.count;
            clearTimeout(joinTimer);
            if(playerNames) myIndex=playerNames.indexOf(myName);
            if(type==="match_found"){ toast("🎉 اكتمل العدد! "+playerCount+" / "+maxPlayers); openWaiting(); }
            else if(!gameStarted) updateWaiting();
            if(playerCount>=maxPlayers && !gameStarted) toast("🎉 اكتمل العدد! "+playerCount+" / "+maxPlayers);
          }
          if(type==="error"){ clearTimeout(joinTimer); toast("❌ "+(d.message||"الغرفة غير موجودة")); if(!gameStarted) setTimeout(openJoin,800); }
          if(type==="game_started"||type==="card_revealed"||type==="game_state"){ gameStarted=true; if(d.game) game=d.game; if(playerNames) myIndex=playerNames.indexOf(myName); renderGame(); playSoundForLastCard(); }
          if(type==="game_over"){ if(d.game) game=d.game; if(d.reason==="alone"){ game._aloneWinner=true; } renderGame(true); }
          if(type==="player_left"){ playerCount=Math.max(1,playerCount-1); if(!gameStarted) updateWaiting(); else if(game) renderGame(); }
        }catch(e){}
      };
    });
  }
  function sendSafe(o){ try{ if(ws && ws.readyState===1){ ws.send(JSON.stringify(o)); return true; } }catch(e){} return false; }
  function updateWaiting(){
    let codeEl=document.getElementById("bc-code"), countEl=document.getElementById("bc-count"), namesEl=document.getElementById("bc-names"), startBtn=document.getElementById("bc-start-btn");
    if(codeEl) codeEl.textContent=myCode||"••••••";
    if(countEl) countEl.textContent="👥 اللاعبون: "+playerCount+" / "+maxPlayers;
    if(namesEl){ namesEl.innerHTML=(playerNames&&playerNames.length?playerNames:[myName]).map(n=>"<div>✅ "+n+(n===myName?" (أنت)":"")+"</div>").join(""); }
    if(startBtn){ if(playerCount>=maxPlayers){ startBtn.disabled=false; startBtn.style.opacity="1"; startBtn.textContent="▶️ ابدأ اللعب ("+playerCount+" / "+maxPlayers+")"; } else { startBtn.disabled=true; startBtn.style.opacity="0.5"; startBtn.textContent="⏳ نستنى "+(maxPlayers-playerCount)+" لاعب... ("+playerCount+" / "+maxPlayers+")"; } }
  }
  // ---- صوت الأصلي: نستعمل نفس ترددات اللعبة الأصلية ----
  let _audio=null;
  function playSound(kind){
    try{
      if(!_audio) _audio=new (window.AudioContext||window.webkitAudioContext)();
      if(_audio.state==="suspended") _audio.resume();
      let h=_audio, y=h.currentTime;
      function tone(freq,dur,type,vol,delay,to){
        let o=h.createOscillator(), g=h.createGain(); o.connect(g); g.connect(h.destination);
        o.frequency.setValueAtTime(freq,y+delay); if(to) o.frequency.exponentialRampToValueAtTime(to,y+delay+dur);
        o.type=type; g.gain.setValueAtTime(0.0001,y+delay); g.gain.exponentialRampToValueAtTime(vol,y+delay+0.02); g.gain.exponentialRampToValueAtTime(0.001,y+delay+dur);
        o.start(y+delay); o.stop(y+delay+dur+0.05);
      }
      if(kind==="flip") tone(300,0.07,"sine",0.08,0,600);
      else if(kind==="positive"){ tone(523,0.12,"sine",0.14,0); tone(784,0.18,"sine",0.14,0.09); }
      else if(kind==="negative"){ tone(220,0.2,"sawtooth",0.08,0); tone(150,0.25,"sawtooth",0.08,0.1); }
      else if(kind==="special"){ tone(880,0.1,"triangle",0.14,0); tone(1174,0.16,"triangle",0.14,0.08); }
      else if(kind==="bomb") tone(150,0.4,"sawtooth",0.12,0,35);
      else tone(500,0.12,"sine",0.14,0);
    }catch(e){}
  }
  function playSoundForLastCard(){
    if(!game||!game.lastCard) return;
    let c=game.lastCard;
    if(c.type==="points") playSound((c.value||0)>0?"positive":"negative");
    else if(c.type==="bomb") playSound("bomb");
    else playSound("special");
  }

  // ===== البطاقة الكبيرة كيما العادي بالضبط =====
  // في العادي: كي تكشف بطاقة تكبر في الوسط 260x360، اضغط في أي مكان باش تكمل
  function showBigCard(c){
    if(!c) return;
    let key=(c.id||"")+":"+(c.type||"")+":"+(c.value||""); // لا نستعمل lastMsg هنا، وإلا تعاود تطلع وتحجب الضغط
    if(key===_lastBigKey) return;
    _lastBigKey=key;
    let oldEl=document.getElementById("bc-big-card");
    if(oldEl) oldEl.remove();
    let bg=c.type==="points"?((c.value||0)>0?"linear-gradient(160deg,#e8f5e9,#a5d6a7)":"linear-gradient(160deg,#ffebee,#ef9a9a)"):"linear-gradient(160deg,#fff3e0,#ffcc80)";
    let title=c.type==="points"?((c.value||0)>0?"نقاط ذهبية! 🎉":"يا خسارة! 😬"):(c.label||"");
    let sub=c.type==="points"?((c.value||0)>0?("حصلت على +"+c.value+" نقطة، أحسنت!"):("خسرت "+Math.abs(c.value||0)+" نقطة... ركز في الجاية")):(c.label||"");
    let el=document.createElement("div");
    el.id="bc-big-card";
    el.className="bigCardOverlay";
    el.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:1500;display:flex;align-items:center;justify-content:center;padding:20px";
    el.innerHTML='<div class="bigCard" style="width:260px;height:360px;border-radius:24px;background:'+bg+';color:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 4px #fff;animation:bigIn .55s;padding:18px;text-align:center;position:relative">'
      + '<div style="font-size:92px;line-height:1">'+(c.icon||"⭐")+'</div>'
      + (c.type==="points"?'<div style="font-size:52px;font-weight:900">'+(c.icon||"")+'</div>':"")
      + '<div style="font-size:26px;font-weight:900">'+title+'</div>'
      + '<div style="font-size:15px;color:#444;font-weight:600">'+sub+'</div>'
      + '<div style="position:absolute;bottom:14px;font-size:12px;color:#777;font-weight:700">اضغط في أي مكان للمتابعة 👆</div></div>'
      + '<style>@keyframes bigIn{0%{transform:scale(.2) rotate(-18deg);opacity:0}60%{transform:scale(1.12) rotate(3deg);opacity:1}100%{transform:scale(1)}}</style>';
    el.onclick=()=>{ el.remove(); };
    document.body.appendChild(el);
    // كيما العادي: إذا ما ضغطش، تتسكر وحدها بعد 1.9 ثانية باش اللعب ما يحبسش
    setTimeout(()=>{ if(document.getElementById("bc-big-card")===el) el.remove(); }, 2800);
  }

  // ===== الطاولة الأصلية بالضبط =====
  // ننسخ نفس structure تاع index.html: domino-board + player domino-edge/side + card face back/front
  function shieldIcons(idx){
    let sh=(game.shields&&game.shields[idx])||{};
    let out="";
    if(sh.shield>0) out+="🛡️";
    if(sh.bombShield>0) out+="🧨";
    if(sh.stealShield>0) out+="💰🛡️";
    if(sh.resetShield>0) out+="🔐";
    if(sh.reflect>0) out+="🪞";
    if(sh.goldenShield>0) out+="🏆";
    if(sh.freeze>0) out+="🧊";
    return out;
  }
  function playerHTML(idx, pos){
    let names=game.names||playerNames, scores=game.scores||[];
    let name=names[idx]||("اللاعب "+(idx+1));
    let isCur=(idx===game.current), isMe=(idx===myIndex);
    let cls="player"+(isCur?" current":"");
    let inner='<div style="font-size:28px;line-height:1;min-height:30px;cursor:pointer">'+(["🧸","🤖","🦁","🚀"][idx%4])+'</div>'
      + '<div style="text-align:right;min-width:0"><div style="font-weight:800;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+name+'</div>'
      + '<div style="font-size:10px;min-height:14px;line-height:1">—</div></div>'
      + '<div style="font-size:16px;font-weight:900;color:#ffdf6e;white-space:nowrap">'+(scores[idx]||0)+' نقطة</div>'
      + '<div style="font-size:14px;line-height:1">'+shieldIcons(idx)+'</div>'
      + (isCur?'<div style="background:#00e676;color:#06281a;font-size:10px;font-weight:900;padding:2px 7px;border-radius:99px;white-space:nowrap">⭐ دورك</div>':"");
    if(pos==="side"){
      return '<div data-player-idx="'+idx+'" dir="rtl" class="'+cls+' domino-side" style="width:58px;height:360px;align-self:center;justify-self:center;padding:10px 6px;box-sizing:border-box;border-radius:12px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.15);position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-width:0">'+inner+'</div>';
    }
    return '<div data-player-idx="'+idx+'" dir="rtl" class="'+cls+' domino-edge" style="width:360px;height:58px;justify-self:center;display:flex;align-items:center;justify-content:center;gap:8px;padding:6px 10px;box-sizing:border-box;border-radius:12px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.15);position:relative;min-width:0;flex-wrap:nowrap;overflow:hidden">'+inner+'</div>';
  }
  function renderGame(isOver){
    if(!game || !game.pending || game.pending.kind!=="replay"){ let pk=document.getElementById("bc-replay-picker"); if(pk) pk.remove(); }
    // صفحة الفائز المبهرة: ترتيب + آخر بطاقة في الوسط + كونفيتي
    if(game && game.winner && !game._aloneWinner){
      let ex=document.getElementById("bc-winner-page");
      if(!ex){
        let namesW=game.names||playerNames, scoresW=game.scores||[];
        let ranking=namesW.map((n,i)=>({name:n, score:scoresW[i]||0, isMe:(i===myIndex)})).sort((a,b)=> b.score-a.score);
        let medals=["🥇","🥈","🥉","4️⃣"];
        let rows=ranking.map((r,i)=>'<div style="display:flex;align-items:center;gap:10px;background:'+(r.isMe?"rgba(0,230,118,.18)":"rgba(255,255,255,.06)")+';border:'+(r.isMe?"2px solid #00e676":"1px solid rgba(255,255,255,.12)")+';border-radius:14px;padding:10px 12px"><div style="font-size:24px;min-width:32px;text-align:center">'+(medals[i]||(i+1))+'</div><div style="flex:1;text-align:right;font-weight:900;font-size:16px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+r.name+(r.isMe?" <span style=\"font-size:11px;color:#00e676\">• أنت</span>":"")+'</div><div style="font-weight:900;font-size:17px;color:#ffdf6e;white-space:nowrap">'+r.score+' نقطة</div></div>').join("");
        let lc=game.lastCard;
        let lcBg=!lc?"#fff":(lc.type==="points"?((lc.value||0)>0?"linear-gradient(135deg,#c8e6c9,#a5d6a7)":"linear-gradient(135deg,#ffcdd2,#ef9a9a)"):"linear-gradient(135deg,#fff3e0,#ffcc80)");
        let lcHtml=!lc?"":('<div style="margin:14px auto 4px;width:110px;height:150px;border-radius:16px;background:'+lcBg+';border:3px solid #fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.4)"><div style="font-size:48px;line-height:1">'+(lc.icon||"⭐")+'</div><div style="font-size:12px;font-weight:900;color:#111;margin-top:6px;padding:0 6px;text-align:center">'+(lc.label||"")+'</div></div><div style="font-size:12px;color:#b0c4de;margin-bottom:2px">🃏 آخر بطاقة تم كشفها</div>');
        let confetti=Array.from({length:24},(_,i)=>{ let em=["🎉","⭐","🏆","🎊","✨"][i%5]; let left=Math.floor(Math.random()*100); let delay=(Math.random()*1.5).toFixed(2); let dur=(2.5+Math.random()*2).toFixed(2); return '<div style="position:absolute;top:-30px;left:'+left+'%;font-size:20px;animation:bcFall '+dur+'s linear '+delay+'s infinite"> '+em+' </div>'; }).join("");
        let page=document.createElement("div"); page.id="bc-winner-page";
        page.style.cssText="position:fixed;inset:0;background:linear-gradient(180deg,#0f2027,#203a43,#2c5364);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto";
        page.innerHTML='<style>@keyframes bcFall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(360deg);opacity:.2}} @keyframes bcPop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}</style><div style="position:absolute;inset:0;overflow:hidden;pointer-events:none">'+confetti+'</div><div style="position:relative;background:rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.2);border-radius:26px;padding:24px 18px;width:100%;max-width:380px;text-align:center;color:#fff;animation:bcPop .5s"><div style="font-size:64px;line-height:1">🏆</div><div style="font-size:14px;color:#ffdf6e;font-weight:900;margin-top:6px;letter-spacing:1px">الفائز باللعبة</div><div style="font-size:30px;font-weight:900;margin:6px 0;line-height:1.1">'+game.winner+'</div><div style="font-size:14px;color:#b0c4de">'+(game.winner===(namesW[myIndex]||"")?"🎉 مبروك! فزت باللعبة":"انتهت اللعبة - مبروك للفائز")+'</div>'+lcHtml+'<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">'+rows+'</div><button id="bc-play-again" style="width:100%;border:0;border-radius:14px;padding:14px;font-size:17px;font-weight:900;cursor:pointer;background:linear-gradient(135deg,#00c853,#00e676);color:#fff;margin-top:16px">🔄 العب مرة أخرى</button><button id="bc-winner-menu" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:15px;font-weight:800;cursor:pointer;background:rgba(255,255,255,.12);color:#fff;margin-top:8px">🏠 القائمة الرئيسية</button></div>';
        document.body.appendChild(page);
        document.getElementById("bc-play-again").onclick=()=>{ page.remove(); let mp=maxPlayers||namesW.length; leaveRoom(); setTimeout(()=>{ maxPlayers=mp; playerCount=mp; openMenu(); setTimeout(()=>{ let b=document.getElementById("bc-quick"); if(b) b.click(); }, 300); }, 300); };
        document.getElementById("bc-winner-menu").onclick=()=>{ page.remove(); leaveRoom(); };
        let fx=document.getElementById("bc-timer-fixed"); if(fx) fx.remove();
      }
    }
    // 4) إذا بقى وحدو: فائز + زر العودة للوبي
    if(game && game.winner && game._aloneWinner){
      setTimeout(()=>{
        let old=document.getElementById("bc-alone-box"); if(old) old.remove();
        let box=document.createElement("div"); box.id="bc-alone-box";
        box.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px";
        box.innerHTML='<div style="background:#1e2a38;border-radius:22px;padding:26px;width:100%;max-width:340px;text-align:center;color:#fff"><div style="font-size:56px">🏆</div><div style="font-size:22px;font-weight:900;margin:8px 0">مبروك! فزت باللعبة</div><div style="color:#b0c4de;font-size:14px">اللاعبين الآخرين خرجوا، و بقيت وحدك</div><button id="bc-back-lobby" style="width:100%;border:0;border-radius:14px;padding:14px;font-size:17px;font-weight:900;cursor:pointer;background:linear-gradient(135deg,#00c853,#00e676);color:#fff;margin-top:18px">🏠 العودة إلى اللوبي</button></div>';
        document.body.appendChild(box);
        document.getElementById("bc-back-lobby").onclick=()=>{ box.remove(); leaveRoom(); };
      },300);
    }
    if(!game || !game.pending || game.pending.kind!=="double") _doublePicks=[];
    if(!game) return;
    if(game.lastCard) showBigCard(game.lastCard);
    // نغلق overlay القائمة ونعرض اللعبة في نفس صفحة اللعبة، بلا overlay جديد
    closeOverlay();
    let root=document.getElementById("root");
    if(!root) return;
    // نحفظ شاشة النتيجة الأصلية؟ لا - نرسم فقط داخل #root بنفس حاوية اللعبة الأصلية
    let names=game.names||playerNames, scores=game.scores||[], cards=game.cards||[];
    let opened=cards.filter(c=>c.opened).length;
    let myTurn=(game.current===myIndex);
    let level=game.level||1;
    let levelLabel=level===1?"🥉 المستوى الأول":level===2?"🥈 المستوى الثاني":"🥇 المستوى الثالث";
    let levelBg=level===1?"linear-gradient(160deg,#0f2027,#203a43,#2c5364)":level===2?"linear-gradient(160deg,#2a0a0a,#5a1a1a,#8b2a2a)":"linear-gradient(160deg,#1a0a2a,#3a1a5a,#5a2a8b)";
    let cardsHTML=cards.map((c,i)=>{
      let openedCls=c.opened?" open "+(c.type==="points"?((c.value||0)>0?"pos":"neg"):"special"):"";
      let frontBg=c.type==="points"?((c.value||0)>0?"linear-gradient(135deg,#c8e6c9,#a5d6a7)":"linear-gradient(135deg,#ffcdd2,#ef9a9a)"):"linear-gradient(135deg,#fff3e0,#ffcc80)";
      return '<div data-card="'+i+'" class="card'+openedCls+'" style="height:auto;min-height:0;border-radius:10px;position:relative;cursor:pointer;transform-style:preserve-3d;transition:transform .45s;transform:'+(c.opened?"rotateY(180deg)":"none")+'">'
        + '<div class="face back" style="position:absolute;inset:0;border-radius:10px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#263f59,#3a5a7c);border:2px solid #5a7d9c;font-size:20px;backface-visibility:hidden">🃏</div>'
        + '<div class="face front" style="position:absolute;inset:0;border-radius:10px;display:flex;align-items:center;justify-content:center;background:'+frontBg+';color:#111;border:2px solid #fff;transform:rotateY(180deg);backface-visibility:hidden;overflow:hidden">'
        + '<div style="font-size:'+(c.type==="points"?"30px":"26px")+';font-weight:900;line-height:1;text-align:center">'+(c.icon||"⭐")+'</div>'
        + '</div></div>';
    }).join("");
    // نفس تخطيط domino-board الأصلي
    let board='<div dir="rtl" style="min-height:100dvh;background:'+levelBg+';background-attachment:fixed;color:#fff;text-align:center;overflow-x:clip;box-sizing:border-box;font-family:system-ui,Tahoma,Arial,sans-serif">'
      + '<div style="height:100dvh;max-height:100dvh;display:flex;flex-direction:column;padding:8px 10px 8px;overflow:hidden;position:relative;z-index:1;box-sizing:border-box">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div style="font-size:18px;font-weight:800;color:#ffdf6e">'+levelLabel+' • '+(game.direction===1?"➡️":"⬅️")+' • غرفة '+myCode+'</div>'
      + '<div></div>'
      + '<div style="display:flex;gap:6px"><button class="iconBtn" id="bc-home" style="width:44px;height:44px;padding:0;font-size:20px;border-radius:50%;background:rgba(255,255,255,.12);border:0;color:#fff;cursor:pointer">🏠</button></div></div>'
      + '<div style="height:8px;background:rgba(255,255,255,.15);border-radius:99px;overflow:hidden;margin:6px 0 10px"><i style="display:block;height:100%;background:linear-gradient(90deg,#00e676,#ffc107);border-radius:99px;transition:width .5s;width:'+Math.round(opened/cards.length*100)+'%"></i></div>'
      + '' // نحينا جملة تم كشف - بلا فائدة، لربح المساحة
      + '<div id="bc-pend-msg" style="min-height:30px;margin:2px 0;font-size:14px;font-weight:700;background:rgba(255,255,255,.08);border-radius:12px;padding:6px 10px;display:flex;align-items:center;justify-content:center">'+(game.lastMsg||"")+'</div>'
      + '<div style="font-size:13px;font-weight:800;margin-bottom:4px">'+(game.winner?("🏆 الفائز: "+game.winner):(myTurn?"⭐ دورك - اكشف بطاقة واحدة":"⏳ دور: "+(names[game.current]||"")))+'</div>'
      + '<style>.domino-board{--domino-thickness:74px;--domino-length:min(430px,calc(100vw - 16px),calc(100dvh - 230px))}</style>'
      + '<div class="domino-board" dir="ltr" style="flex:1 1 auto;display:grid;grid-template-areas:\'top top top\' \'left cards right\' \'bottom bottom bottom\';grid-template-columns:'+(names.length>=3?"58px":"0px")+' minmax(0,1fr) '+(names.length>=4?"58px":"0px")+';grid-template-rows:auto minmax(0,1fr) auto;gap:4px;margin:2px 0;min-height:0">'
      + '<div style="grid-area:top;display:flex;justify-content:center;min-width:0">'+(names.length>2?playerHTML(2,"top"):(names.length>1?playerHTML(1,"top"):""))+'</div>'
      + '<div style="grid-area:left;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0">'+(names.length>2?playerHTML(1,"side"):"")+'</div>'
      + '<div style="grid-area:cards;min-width:0;display:flex"><div style="flex:1 1 auto;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(9,1fr);gap:5px;margin:0;min-height:0;min-width:0">'+cardsHTML+'</div></div>'
      + '<div style="grid-area:right;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0">'+(names.length>3?playerHTML(3,"side"):"")+'</div>'
      + '<div style="grid-area:bottom;display:flex;justify-content:center;min-width:0">'+playerHTML(0,"bottom")+'</div>'
      + '</div>'
      + '<div style="display:flex;justify-content:center;gap:6px;flex-wrap:wrap"><button class="btn secondary" id="bc-leave-game" style="border:0;border-radius:14px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#c62828,#ef5350);color:#fff">🚪 مغادرة الغرفة</button>'
      + (isOver?'<button class="btn secondary" id="bc-back-menu" style="border:0;border-radius:14px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#455a64,#607d8b);color:#fff">🏠 القائمة</button>':"")+'</div>'
      + '</div></div>';
    root.innerHTML=board;
    // نفس سلوك الأصلية: الضغط على بطاقة + حالات الاختيار
    let pend = game.pending||null;
    // 2) البطاقة الكبيرة تبقى للقراءة قبل رسالة التفعيل: 2.8 ثانية تأخير
    // مهم: لا نحفظ pendReadyNow() كقيمة ثابتة، نحسبها لحظة الضغطة، وإلا تبقى false للأبد
    let pendKey = pend ? (pend.kind+"|"+(pend.cardId||"")+"|"+pend.actor) : "";
    if(pend && pendKey!==_lastPendingKey){ _lastPendingKey=pendKey; _pendingDelayUntil=Date.now()+2800; }
    if(!pend) _lastPendingKey="";
    function pendReadyNow(){ return !pend || Date.now()>=_pendingDelayUntil; }
    root.querySelectorAll("[data-card]").forEach(el=>{
      el.onclick=()=>{
        let idx=parseInt(el.getAttribute("data-card"),10);
        let c=(game.cards||[])[idx]; if(!c) return;
        if(pend && pend.actor===myIndex && Date.now()<_pendingDelayUntil){ toast("⏳ اقرا البطاقة أولا..."); return; }
        if(pend && pend.actor===myIndex){
          if(pend.kind==="replay"){ if(!c.opened){ toast("اختر بطاقة مكشوفة"); return; } sendSafe({type:"replay_choose",code:myCode,index:idx}); return; }
          if(pend.kind==="double"){
            if(c.opened){ toast("اختر بطاقة مغلقة"); return; }
            if(_doublePicks.includes(idx)) _doublePicks=_doublePicks.filter(x=>x!==idx);
            else if(_doublePicks.length<2) _doublePicks.push(idx);
            else { toast("اخترت بطاقتين، اضغط تأكيد"); return; }
            // نظهر الاختيار
            document.querySelectorAll("[data-card]").forEach(e2=>{ let ii=parseInt(e2.getAttribute("data-card"),10); e2.style.outline=_doublePicks.includes(ii)?"4px solid #00e676":"none"; });
            if(_doublePicks.length===2){ setTimeout(()=>{ sendSafe({type:"double_pick",code:myCode,picks:_doublePicks}); _doublePicks=[]; },400); }
            return;
          }
          if(pend.kind==="double_choose"){
            if(!pend.picks || !pend.picks.includes(idx)){ toast("اختر واحدة من البطاقتين"); return; }
            sendSafe({type:"double_choose",code:myCode,index:idx}); return;
          }
          toast("أكمل الاختيار أولا"); return;
        }
        if(!myTurn){ toast("⏳ مش دورك"); return; }
        sendSafe({type:"play_card",code:myCode,index:idx});
      };
    });
    // اختيار اللاعب المستهدف: الضغط على بطاقة اللاعب
    // إعادة التفعيل: البطاقات المكشوفة تبان بالأخضر + نافذة اختيار كبيرة
    if(pend && pend.kind==="replay" && pend.actor===myIndex){
      root.querySelectorAll("[data-card]").forEach(el=>{
        let ii=parseInt(el.getAttribute("data-card"),10);
        let cc=(game.cards||[])[ii];
        if(cc && cc.opened){ el.style.outline="4px solid #00e676"; el.style.boxShadow="0 0 18px rgba(0,230,118,.7)"; el.style.cursor="pointer"; }
      });
      // نافذة اختيار البطاقة المكشوفة - باش ما تضطرش تضغط على البطاقة الصغيرة في الطاولة
      let oldPicker=document.getElementById("bc-replay-picker");
      if(!oldPicker && Date.now()>=_pendingDelayUntil){
        let openedList=(game.cards||[]).map((cc,ii)=>({cc,ii})).filter(x=>x.cc.opened);
        let picker=document.createElement("div"); picker.id="bc-replay-picker";
        picker.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:1700;display:flex;align-items:center;justify-content:center;padding:20px";
        let items=openedList.map(x=>'<button data-replay-pick="'+x.ii+'" style="border:3px solid #00e676;border-radius:16px;padding:16px 10px;background:#fff;color:#111;cursor:pointer;min-width:92px;min-height:92px;display:flex;align-items:center;justify-content:center"><div style="font-size:28px;line-height:1;font-weight:900">'+(x.cc.icon||"⭐")+'</div></button>').join("");
        picker.innerHTML='<div style="background:#1e2a38;border-radius:22px;padding:22px;width:100%;max-width:360px;text-align:center;color:#fff"><div style="font-size:44px">♻️</div><div style="font-size:19px;font-weight:900;margin:6px 0">اختر بطاقة مكشوفة لإعادة تفعيلها</div><div style="color:#b0c4de;font-size:13px;margin-bottom:12px">اضغط على واحدة من البطاقات</div><div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-height:320px;overflow-y:auto">'+items+'</div><button id="bc-replay-cancel" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:800;cursor:pointer;background:#455a64;color:#fff;margin-top:14px">❌ إلغاء</button></div>';
        document.body.appendChild(picker);
        picker.querySelectorAll("[data-replay-pick]").forEach(b=>{
          b.onclick=()=>{ let idx=parseInt(b.getAttribute("data-replay-pick"),10); picker.remove(); sendSafe({type:"replay_choose",code:myCode,index:idx}); };
        });
        document.getElementById("bc-replay-cancel").onclick=()=>{ picker.remove(); sendSafe({type:"confirm_no",code:myCode}); toast("تم إلغاء إعادة التفعيل"); };
      }
    } else {
      let oldPicker=document.getElementById("bc-replay-picker"); if(oldPicker) oldPicker.remove();
    }
    // اختيار مزدوج: البطاقتين المكشوفتين يبانو بالأخضر باش تعرف واش تختار
    if(pend && pend.kind==="double_choose" && pend.picks){
      root.querySelectorAll("[data-card]").forEach(el=>{
        let ii=parseInt(el.getAttribute("data-card"),10);
        if(pend.picks.includes(ii)){ el.style.outline="4px solid #00e676"; el.style.boxShadow="0 0 18px rgba(0,230,118,.7)"; el.style.cursor="pointer"; }
      });
    }
    // 1) ألوان: صاحب الدور أخضر، المستهدفين أحمر
    root.querySelectorAll("[data-player-idx]").forEach(el=>{
      let pi=parseInt(el.getAttribute("data-player-idx"),10);
      if(pi===game.current && !game.winner){ el.style.outline="4px solid #00e676"; el.style.boxShadow="0 0 0 4px rgba(0,230,118,.25), 0 0 18px rgba(0,230,118,.6)"; }
      else { el.style.boxShadow="none"; if(!(pend && pend.actor===myIndex)) el.style.outline="none"; }
    });
    if(pend && pend.actor===myIndex && ["steal","bomb","doubleTarget","resetPlayer","exchange","freeze","exchangePlayers"].includes(pend.kind)){
      root.querySelectorAll("[data-player-idx]").forEach(el=>{
        let pi=parseInt(el.getAttribute("data-player-idx"),10);
        if(pi===pend.actor) { el.style.outline="4px solid #00e676"; return; }
        el.style.cursor="pointer"; el.style.outline="4px solid #ff5252"; el.style.boxShadow="0 0 18px rgba(255,82,82,.7)";
        el.onclick=()=>{ if(Date.now()<_pendingDelayUntil){ toast("⏳ اقرا البطاقة أولا..."); return; } let t=parseInt(el.getAttribute("data-player-idx"),10); if(t===myIndex && pend.kind!=="exchangePlayers"){ toast("اختر لاعب آخر"); return; } sendSafe({type:"choose_target",code:myCode,target:t}); };
      });
    }
    // 3) الوقت كيما في العادي: ثابت في أعلى الشاشة باش يبان ديما حتى لو ضاق الـ header
    // العداد: حبة صغيرة كيما في العادي + شريط رقيق، يخدم بحلقة مستقلة ما تتعاودش تتصفر مع كل رسم
    let fixed=document.getElementById("bc-timer-fixed");
    if(!fixed && !game.winner){
      fixed=document.createElement("div"); fixed.id="bc-timer-fixed";
      fixed.style.cssText="position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:1800;background:rgba(0,0,0,.72);border:1px solid rgba(255,255,255,.28);border-radius:99px;padding:5px 12px 6px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:86px;box-shadow:0 4px 12px rgba(0,0,0,.35)";
      fixed.innerHTML='<div id="bc-timer-fixed-num" style="font-size:16px;font-weight:900;color:#fff;line-height:1">⏱️ 20</div><div style="width:76px;height:4px;background:rgba(255,255,255,.18);border-radius:99px;overflow:hidden"><div id="bc-timer-fixed-bar" style="height:100%;width:100%;background:#00e676;border-radius:99px"></div></div>';
      document.body.appendChild(fixed);
    }
    if(game.winner && fixed) fixed.remove();
    // نحفظ deadline من السيرفر و نخدم بحلقة واحدة مستقلة
    if(game.timeLeft!=null && !game.winner){ _timerDeadline=Date.now()+(game.timeLeft*1000); _timerTotal=game.timeLeft; }
    if(!_timerLoopStarted){
      _timerLoopStarted=true;
      setInterval(()=>{
        let el=document.getElementById("bc-timer-fixed-num");
        let bar=document.getElementById("bc-timer-fixed-bar");
        let box=document.getElementById("bc-timer-fixed");
        if(!el || !box) return;
        if(!_timerDeadline){ el.textContent="⏱️ 20"; return; }
        let totalSec=_timerTotal||20; let remain=Math.max(0, Math.ceil((_timerDeadline-Date.now())/1000));
        el.textContent="⏱️ "+remain;
        let col=remain<=5?"#ff5252":remain<=10?"#ffab00":"#00e676";
        el.style.color=remain<=5?"#ff5252":"#fff";
        if(bar){ bar.style.width=Math.max(0,(remain/totalSec*100))+"%"; bar.style.background=col; }
        if(box){ box.style.borderColor=remain<=5?"#ff5252":"rgba(255,255,255,.28)"; }
      }, 250);
    }
    // لا نمس حلقة العداد المستقلة هنا - هي اللي تحسب، و إلا يتعاود يتصفر
    // العداد يتحسب في الحلقة المستقلة فوق، ما نعاودوش نصفره هنا
    // نافذة التأكيد - تظهر بعد 2.8 ثانية (بعد قراءة البطاقة الكبيرة)
    if(pend && pend.actor===myIndex && pend.kind==="confirm"){
      let m=document.getElementById("bc-confirm-modal"); if(m) m.remove();
      // نأجل ظهور النافذة حتى تنتهي قراءة البطاقة الكبيرة
      let waitMs=Math.max(0,_pendingDelayUntil-Date.now());
      setTimeout(()=>{
        if(!game || !game.pending || game.pending.kind!=="confirm" || game.pending.actor!==myIndex) return;
        if(document.getElementById("bc-confirm-modal")) return;
        let mod=document.createElement("div"); mod.id="bc-confirm-modal";
      mod.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px";
      mod.innerHTML='<div style="background:#1e2a38;border-radius:20px;padding:22px;width:100%;max-width:320px;text-align:center;color:#fff"><div style="font-size:48px">❓</div><div style="font-size:18px;font-weight:800;margin:8px 0">هل تريد تفعيل؟</div><div style="color:#b0c4de;font-size:14px">'+(game.lastMsg||"")+'</div><button id="bc-yes" style="width:100%;border:0;border-radius:14px;padding:13px;font-size:16px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#00c853,#00e676);color:#fff;margin-top:14px">✅ نعم، فعّلها</button><button id="bc-no" style="width:100%;border:0;border-radius:14px;padding:13px;font-size:16px;font-weight:800;cursor:pointer;background:#c62828;color:#fff;margin-top:8px">❌ لا، ألغيها</button></div>';
      document.body.appendChild(mod);
      document.getElementById("bc-yes").onclick=()=>{ mod.remove(); sendSafe({type:"confirm_yes",code:myCode}); };
      document.getElementById("bc-no").onclick=()=>{ mod.remove(); sendSafe({type:"confirm_no",code:myCode}); };
      }, waitMs);
    } else { let m=document.getElementById("bc-confirm-modal"); if(m) m.remove(); }
    if(pend && !pendReadyNow()){ let pe=document.getElementById("bc-pend-msg"); if(pe) pe.textContent="📖 اقرا البطاقة..."; }
    // رسالة الاختيار
    let pendEl=document.getElementById("bc-pend-msg");
    if(pendEl){
      if(pend && !pendReadyNow()){ pendEl.textContent="📖 اقرا البطاقة..."; }
      else if(pend && pend.actor===myIndex){
        if(pend.kind==="replay") pendEl.textContent="♻️ اضغط على بطاقة مكشوفة لإعادة تفعيلها";
        else if(pend.kind==="double") pendEl.textContent="🃏 اضغط على بطاقتين مغلقتين (اخترت "+_doublePicks.length+" / 2)";
        else if(pend.kind==="double_choose") pendEl.textContent="🃏 اختر واحدة من البطاقتين";
        else if(["steal","bomb","doubleTarget","resetPlayer","exchange","freeze","exchangePlayers"].includes(pend.kind)) pendEl.textContent="🎯 اضغط على اللاعب المستهدف";
        else pendEl.textContent=game.lastMsg||"";
      } else if(pend) pendEl.textContent="⏳ نستنى "+(game.names[pend.actor]||"")+" يكمل الاختيار...";
      else pendEl.textContent=game.lastMsg||"";
    }
    let home=document.getElementById("bc-home"); if(home) home.onclick=()=>{ sendSafe({type:"leave",code:myCode}); location.reload(); };
    let leave=document.getElementById("bc-leave-game"); if(leave) leave.onclick=()=>{ gameStarted=false; game=null; sendSafe({type:"leave",code:myCode}); myCode=""; playerCount=1; playerNames=[myName]; myIndex=-1; toast("👋 غادرت الغرفة"); openMenu(); };
    let back=document.getElementById("bc-back-menu"); if(back) back.onclick=()=>{ gameStarted=false; game=null; sendSafe({type:"leave",code:myCode}); myCode=""; openMenu(); };
  }

  function openMenu(){ let fx=document.getElementById("bc-timer-fixed"); if(fx) fx.remove(); if(_timerInt) clearInterval(_timerInt);
    gameStarted=false; game=null;
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
    document.getElementById("bc-name").addEventListener("input",e=>saveName(e.target.value));
    document.getElementById("bc-close").onclick=()=>{ closeOverlay(); setTimeout(closeReactModal,100); };
    document.getElementById("bc-quick").onclick=openSearch;
    document.getElementById("bc-join-open").onclick=openJoin;
    document.getElementById("bc-create").onclick=()=>{
      toast("⏳ جاري إنشاء غرفة لـ "+maxPlayers+" لاعبين...");
      connect().then(()=>{ sendSafe({type:"create",name:myName,maxPlayers:maxPlayers}); myCode=""; playerCount=1; playerNames=[myName]; myIndex=0; setTimeout(openWaiting,400); }).catch(()=>toast("❌ مقدرتش نتصل بالسيرفر"));
    };
  }
  function openSearch(){
    showOverlay("🔍 جاري البحث عن لاعبين...",
      '<div style="font-size:50px;margin:10px 0">🔍</div><p style="color:#b0c4de;font-size:14px;margin:0 0 10px">نبحث عن <b style="color:#ffc107">'+maxPlayers+' لاعبين</b>...</p>'
      + '<div style="font-size:13px;color:#ffc107;font-weight:700">⏳ البحث جاري... (1 / '+maxPlayers+')</div>'
      + '<button id="bc-cancel-search" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:14px 0 0">إلغاء البحث</button>');
    connect().then(()=>sendSafe({type:"quick_play",name:myName,maxPlayers:maxPlayers})).catch(()=>toast("❌ مقدرتش نتصل بالسيرفر"));
    document.getElementById("bc-cancel-search").onclick=()=>{ sendSafe({type:"cancel_search"}); openMenu(); };
  }
  function openJoin(){
    showOverlay("🔑 دخول لغرفة",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 16px">أدخل رقم الغرفة المكوّن من 6 أرقام</p>'
      + '<input id="bc-join-code" inputmode="numeric" placeholder="000000" style="width:100%;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font-size:22px;text-align:center;letter-spacing:4px;font-weight:800">'
      + '<button id="bc-join-go" style="'+btn("#1976d2","#2196f3","#fff")+'">دخول</button>'
      + '<button id="bc-join-back" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;margin:5px 0">⬅️ رجوع</button>');
    let inp=document.getElementById("bc-join-code"); inp.focus();
    inp.addEventListener("input",()=>{ inp.value=inp.value.replace(/[^0-9]/g,"").slice(0,6); });
    document.getElementById("bc-join-back").onclick=openMenu;
    document.getElementById("bc-join-go").onclick=()=>{
      let code=inp.value.trim(); if(code.length<4){ toast("أدخل رقم الغرفة بشكل صحيح"); return; }
      myCode=code; toast("⏳ جاري الدخول..."); clearTimeout(joinTimer);
      joinTimer=setTimeout(()=>toast("❌ لم يرد السيرفر - تأكد من الرقم وحاول مجددًا"),4000);
      connect().then(()=>{ sendSafe({type:"join",code:code,roomCode:code,name:myName}); playerCount=1; setTimeout(openWaiting,400); }).catch(()=>toast("❌ مقدرتش نتصل بالسيرفر"));
    };
  }
  function openWaiting(){
    showOverlay("غرفتك جاهزة",
      '<p style="color:#b0c4de;font-size:14px;margin:0 0 8px">أرسل الرقم لأصدقائك</p>'
      + '<div id="bc-code" style="font-size:32px;font-weight:900;letter-spacing:4px;border:2px dashed #ffc107;border-radius:14px;padding:14px 8px;margin:8px 0">••••••</div>'
      + '<div id="bc-count" style="font-size:16px;font-weight:700">👥 اللاعبون: 1 / '+maxPlayers+'</div>'
      + '<div id="bc-names" style="font-size:14px;margin:10px 0;line-height:1.8;color:#fff"></div>'
      + '<button id="bc-start-btn" disabled style="'+btn("#ff8f00","#ffc107","#222")+'opacity:0.5">⏳ نستنى...</button>'
      + '<button id="bc-cancel" style="width:100%;border:0;border-radius:14px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;background:#c62828;color:#fff;margin:5px 0">إلغاء</button>');
    updateWaiting();
    document.getElementById("bc-cancel").onclick=()=>{ sendSafe({type:"leave",code:myCode}); openMenu(); };
    document.getElementById("bc-start-btn").onclick=()=>{ if(playerCount<maxPlayers){ toast("مازال ناقص "+(maxPlayers-playerCount)+" لاعب"); return; } sendSafe({type:"start",code:myCode}); };
  }
  function leaveRoom(){ _timerDeadline=0; let fx=document.getElementById("bc-timer-fixed"); if(fx) fx.remove();
    gameStarted=false; game=null; myCode=""; playerCount=1; playerNames=[myName]; myIndex=-1; _lastBigKey=""; _lastPendingKey=""; _pendingDelayUntil=0;
    try{ if(ws) ws.close(); ws=null; }catch(e){}
    // رجوع للصفحة الأولى الأصلية
    location.reload();
  }
  function handleOpen(e){
    let btnEl=e.target && e.target.closest ? e.target.closest("button") : null;
    if(!btnEl) return;
    let txt=(btnEl.textContent||"").trim();
    if(txt==="العب أونلاين" || (txt.indexOf("العب أونلاين")!==-1 && txt.length<30)){ e.preventDefault(); setTimeout(openMenu,80); }
  }
  document.addEventListener("click",handleOpen,false);
  console.log("✅ Battle Online V15 - نفس طاولة الأصلية");
})();
