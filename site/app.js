(function(){
"use strict";

const LET = ["a","b","c","d"];
const QS = RAW.map((r,i)=>({
  id:i+1, week:r[0], text:r[1], opts:r[2], ans:LET.indexOf(r[3]), topic:r[4], level:r[5], exp:r[6]||"", note:r[7]||""
}));
const TOPIC = Object.fromEntries(TOPICS.map(t=>[t.id,t]));
const $app = document.getElementById("app");

const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const shuffle = a => { a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const store = {
  get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
};
// options that refer to each other ("all of the above") must keep their order
const fixedOrder = q => q.opts.some(o=>/(all|none|both) of the above|^all /i.test(o));

/* ---------------- shared question card ---------------- */
function qCard(q, n){
  const lv = `<span class="tag l${q.level}">${LEVELS[q.level]}</span>`;
  const opts = q.opts.map((o,i)=>`<li class="${i===q.ans?"right":""}"><b>${LET[i]})</b><span>${esc(o)}</span></li>`).join("");
  return `<article class="card q" id="q${q.id}">
    <div class="qn">${n}</div>
    <div class="qb">
      <div class="meta"><span class="tag">Week ${q.week}</span>${lv}<span class="tag">${esc(TOPIC[q.topic].name)}</span></div>
      <p class="qt">${esc(q.text)}</p>
      ${q.note?`<div class="note">${esc(q.note)}</div>`:""}
      <ul class="opts">${opts}</ul>
      ${q.exp?`<div class="exp"><b>Why:</b> ${esc(q.exp)}</div>`:""}
    </div></article>`;
}

/* ---------------- 1. All questions ---------------- */
const qaState = {week:"all", level:"all", topic:"all", text:"", hide:false};
function viewQA(){
  const weeks = [...new Set(QS.map(q=>q.week))];
  $app.innerHTML = `
    <h1>All questions with answers</h1>
    <p class="sub">${QS.length} questions from Assignments 1 to 12. Correct answers are highlighted in green.</p>
    <div class="card">
      <div class="row">
        <div class="grow"><input type="search" id="qs" placeholder="Search a question or answer..." value="${esc(qaState.text)}"></div>
        <div><select id="qlv"><option value="all">All levels</option>${[1,2,3].map(l=>`<option value="${l}" ${qaState.level==l?"selected":""}>${LEVELS[l]}</option>`).join("")}</select></div>
        <div><select id="qtp"><option value="all">All topics</option>${TOPICS.map(t=>`<option value="${t.id}" ${qaState.topic===t.id?"selected":""}>${esc(t.name)}</option>`).join("")}</select></div>
      </div>
      <div class="chips" id="wk">
        <span class="chip ${qaState.week==="all"?"on":""}" data-w="all">All weeks</span>
        ${weeks.map(w=>`<span class="chip ${qaState.week==w?"on":""}" data-w="${w}" title="${esc(WEEK_TITLES[w])}">Week ${w}</span>`).join("")}
      </div>
      <label class="row" style="margin-top:6px;cursor:pointer"><input type="checkbox" id="hide" ${qaState.hide?"checked":""}> Hide answers (self-test mode, click a question's option row to reveal)</label>
    </div>
    <div class="count" id="cnt"></div>
    <div id="list"></div>`;
  const list = document.getElementById("list"), cnt = document.getElementById("cnt");
  function render(){
    const t = qaState.text.trim().toLowerCase();
    const res = QS.filter(q=>
      (qaState.week==="all"||q.week==qaState.week) &&
      (qaState.level==="all"||q.level==qaState.level) &&
      (qaState.topic==="all"||q.topic===qaState.topic) &&
      (!t || (q.text+" "+q.opts.join(" ")).toLowerCase().includes(t)));
    cnt.textContent = `Showing ${res.length} of ${QS.length} questions`;
    list.className = qaState.hide ? "hide-ans" : "";
    list.innerHTML = res.length ? res.map(q=>qCard(q,"W"+q.week+"."+(QS.filter(x=>x.week===q.week).indexOf(q)+1))).join("")
      : `<div class="card">No questions match your filters.</div>`;
  }
  document.getElementById("qs").oninput = e=>{ qaState.text=e.target.value; render(); };
  document.getElementById("qlv").onchange = e=>{ qaState.level=e.target.value; render(); };
  document.getElementById("qtp").onchange = e=>{ qaState.topic=e.target.value; render(); };
  document.getElementById("hide").onchange = e=>{ qaState.hide=e.target.checked; render(); };
  document.getElementById("wk").onclick = e=>{
    const c=e.target.closest(".chip"); if(!c) return;
    qaState.week=c.dataset.w;
    document.querySelectorAll("#wk .chip").forEach(x=>x.classList.toggle("on",x===c));
    render();
  };
  list.onclick = e=>{
    if(!qaState.hide) return;
    const art=e.target.closest("article"); if(!art) return;
    const id = +art.id.slice(1);
    const q = QS.find(x=>x.id===id);
    art.querySelectorAll(".opts li").forEach((li,i)=>{ if(i===q.ans){li.classList.toggle("showme");li.style.cssText = li.classList.contains("showme")?"background:var(--ok-bg);border-color:var(--ok);color:var(--ok)":"";} });
  };
  render();
}

/* ---------------- 2. Quiz ---------------- */
let quiz = null;
const best = () => store.get("spm_best",{});
const QUIZ_MODES = [
  {id:"1", name:"Level 1 - Easy", desc:"Definitions and direct recall."},
  {id:"2", name:"Level 2 - Medium", desc:"Concept and comparison questions."},
  {id:"3", name:"Level 3 - Hard", desc:"Calculations, 'NOT / FALSE' traps and tricky wording."},
  {id:"mix", name:"Full mock", desc:"All 3 levels in one test, easy to hard."}
];
const cfg = {mode:"1", n:10};

function pickQuestions(mode, n, topic){
  let pool = topic ? QS.filter(q=>q.topic===topic) : QS;
  let chosen;
  if(mode==="mix" || topic){
    if(topic && mode!=="mix" && mode!=="all") pool = pool.filter(q=>q.level==mode);
    if(mode==="mix" && !topic){
      const per = Math.ceil(n/3);
      chosen = [1,2,3].flatMap(l=>shuffle(pool.filter(q=>q.level===l)).slice(0,per)).slice(0,n);
    } else chosen = shuffle(pool).slice(0,n);
  } else chosen = shuffle(pool.filter(q=>q.level==mode)).slice(0,n);
  return chosen.map(q=>{
    const order = fixedOrder(q) ? q.opts.map((_,i)=>i) : shuffle(q.opts.map((_,i)=>i));
    return {q, opts:order.map(i=>q.opts[i]), ans:order.indexOf(q.ans), pick:null};
  });
}

function viewQuizSetup(topic){
  quiz = null;
  const b = best();
  $app.innerHTML = `
    <h1>${topic?`Quiz: ${esc(TOPIC[topic].name)}`:"Mini NPTEL quiz"}</h1>
    <p class="sub">Questions and options are shuffled every run. Timer: 1 minute per question, like the real exam pressure.</p>
    ${topic?"":`<div class="lvl-grid" id="modes">${QUIZ_MODES.map(m=>`
      <button class="lvl ${cfg.mode===m.id?"on":""}" data-m="${m.id}">
        <h3>${m.name}</h3><p>${m.desc}</p>
        <p style="margin-top:8px">Best: <b>${b[m.id]!=null?b[m.id]+"%":"none yet"}</b></p>
      </button>`).join("")}</div>`}
    <div class="card" style="margin-top:14px">
      <div class="row">
        <label>Number of questions&nbsp;
          <select id="n" style="width:auto">${[10,15,20,30].map(n=>`<option ${cfg.n===n?"selected":""}>${n}</option>`).join("")}</select></label>
        <button class="primary" id="go">Start quiz</button>
      </div>
    </div>`;
  const m = document.getElementById("modes");
  if(m) m.onclick = e=>{
    const c=e.target.closest(".lvl"); if(!c) return;
    cfg.mode=c.dataset.m; m.querySelectorAll(".lvl").forEach(x=>x.classList.toggle("on",x===c));
  };
  document.getElementById("n").onchange = e=>cfg.n=+e.target.value;
  document.getElementById("go").onclick = ()=>startQuiz(topic);
}

function startQuiz(topic){
  const items = pickQuestions(topic?"all":cfg.mode, cfg.n, topic);
  quiz = {items, i:0, topic, mode:topic?"topic":cfg.mode, endAt:Date.now()+items.length*60000, start:Date.now(), timer:null};
  quiz.timer = setInterval(tick,500);
  renderQuiz();
}
function tick(){
  if(!quiz){return;}
  const left = Math.max(0,quiz.endAt-Date.now());
  const el = document.getElementById("tm");
  if(el){ const s=Math.ceil(left/1000); el.textContent = Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); el.classList.toggle("low", s<=60); }
  if(left===0) finishQuiz();
}
function renderQuiz(){
  const it = quiz.items[quiz.i], n = quiz.items.length;
  const answered = quiz.items.filter(x=>x.pick!==null).length;
  $app.innerHTML = `
    <div class="card">
      <div class="qhead"><span>Question ${quiz.i+1} of ${n}</span><span class="timer" id="tm">--</span></div>
      <div class="bar"><i style="width:${answered/n*100}%"></i></div>
      <div class="meta" style="margin-top:12px"><span class="tag l${it.q.level}">${LEVELS[it.q.level]}</span><span class="tag">Week ${it.q.week}</span></div>
      <p class="qt">${esc(it.q.text)}</p>
      ${it.q.note?`<div class="note">${esc(it.q.note)}</div>`:""}
      <ul class="opts click" id="o">${it.opts.map((o,i)=>`<li data-i="${i}" class="${it.pick===i?"pick":""}"><b>${LET[i]})</b><span>${esc(o)}</span></li>`).join("")}</ul>
      <div class="nav">
        <button id="prev" ${quiz.i===0?"disabled":""}>Previous</button>
        ${quiz.i<n-1?`<button class="primary" id="next">Next</button>`:`<button class="primary" id="fin">Submit</button>`}
      </div>
    </div>
    <div class="card"><div class="palette" style="margin:0">${quiz.items.map((x,i)=>`<button data-j="${i}" class="${x.pick!==null?"done":""} ${i===quiz.i?"cur":""}">${i+1}</button>`).join("")}</div>
      <div class="right-btns"><button id="fin2">Submit now (${answered}/${n} answered)</button></div></div>`;
  document.getElementById("o").onclick = e=>{
    const li=e.target.closest("li"); if(!li) return;
    it.pick = it.pick===+li.dataset.i ? null : +li.dataset.i; renderQuiz(); tick();
  };
  const go = d => { quiz.i+=d; renderQuiz(); tick(); window.scrollTo(0,0); };
  document.getElementById("prev").onclick = ()=>go(-1);
  const nx=document.getElementById("next"); if(nx) nx.onclick=()=>go(1);
  const fn=document.getElementById("fin"); if(fn) fn.onclick=confirmFinish;
  document.getElementById("fin2").onclick = confirmFinish;
  document.querySelectorAll(".palette button").forEach(b=>b.onclick=()=>{quiz.i=+b.dataset.j; renderQuiz(); tick();});
  tick();
}
function confirmFinish(){
  const un = quiz.items.filter(x=>x.pick===null).length;
  if(un && !confirm(`${un} question(s) are unanswered. Submit anyway?`)) return;
  finishQuiz();
}
let reviewFilter = "all";
function finishQuiz(){
  if(!quiz) return;
  clearInterval(quiz.timer);
  const n=quiz.items.length, ok=quiz.items.filter(x=>x.pick===x.ans).length;
  const pct=Math.round(ok/n*100), secs=Math.round((Date.now()-quiz.start)/1000);
  quiz.result={ok,n,pct,secs};
  if(!quiz.topic){ const b=best(); if(b[quiz.mode]==null||pct>b[quiz.mode]){ b[quiz.mode]=pct; store.set("spm_best",b); } }
  reviewFilter="all";
  renderResult();
}
function renderResult(){
  const {ok,n,pct,secs}=quiz.result;
  const msg = pct>=80?"Excellent. You are exam ready.":pct>=60?"Good. Review the wrong ones below.":"Keep going. Read the Important Topics page and retry.";
  const items = quiz.items.map((x,i)=>({x,i})).filter(({x})=>reviewFilter==="all"||x.pick!==x.ans);
  $app.innerHTML = `
    <div class="card">
      <div class="score">${ok}<small> / ${n}</small> &nbsp;<small>${pct}%</small></div>
      <p class="sub" style="margin:8px 0 0">${msg} Time taken: ${Math.floor(secs/60)}m ${secs%60}s.</p>
      <div class="right-btns">
        <button class="primary" id="again">New shuffled run</button>
        <button id="setup">Change level</button>
        <button id="onlywrong">${reviewFilter==="all"?"Show only wrong / skipped":"Show all"}</button>
      </div>
    </div>
    ${items.length?items.map(({x,i})=>{
      const right = x.pick===x.ans;
      return `<article class="card q"><div class="qn">${i+1}</div><div class="qb">
        <div class="meta"><span class="tag l${x.q.level}">${LEVELS[x.q.level]}</span><span class="tag">Week ${x.q.week}</span>
        <span class="tag" style="${right?"background:var(--ok-bg);color:var(--ok)":"background:var(--bad-bg);color:var(--bad)"}">${x.pick===null?"Skipped":right?"Correct":"Wrong"}</span></div>
        <p class="qt">${esc(x.q.text)}</p>
        ${x.q.note?`<div class="note">${esc(x.q.note)}</div>`:""}
        <ul class="opts">${x.opts.map((o,k)=>`<li class="${k===x.ans?"right":k===x.pick?"wrong":""}"><b>${LET[k]})</b><span>${esc(o)}${k===x.pick?" (your answer)":""}</span></li>`).join("")}</ul>
        ${x.q.exp?`<div class="exp"><b>Why:</b> ${esc(x.q.exp)}</div>`:""}</div></article>`;}).join("")
      : `<div class="card">Nothing wrong. Perfect run!</div>`}`;
  document.getElementById("again").onclick = ()=>startQuiz(quiz.topic);
  document.getElementById("setup").onclick = ()=>{ location.hash = "#/quiz"; if(!quiz.topic) viewQuizSetup(); else go(); };
  document.getElementById("onlywrong").onclick = ()=>{ reviewFilter = reviewFilter==="all"?"wrong":"all"; renderResult(); };
  window.scrollTo(0,0);
}

/* ---------------- 3. Important topics ---------------- */
function viewTopics(){
  const order = TOPICS.slice().sort((a,b)=>b.stars-a.stars);
  $app.innerHTML = `
    <h1>Important topics</h1>
    <p class="sub">Revise the key points, then try the related questions. Topics with more stars are the ones asked most often (calculations, NOT/FALSE traps and definitions).</p>
    <div class="card"><b>Quick formula sheet</b>
      <ul class="pts">
        <li>1 man-month = <b>152</b> hours &nbsp;|&nbsp; Putnam: effort &prop; 1/time<sup>4</sup> (half the time = <b>16x</b> effort)</li>
        <li>ES = max(EF of predecessors) &nbsp;|&nbsp; LF = min(LS of successors) &nbsp;|&nbsp; Slack = LS - ES</li>
        <li>SV = EV - PV &nbsp;|&nbsp; CV = EV - AC &nbsp;|&nbsp; SPI = EV/PV &nbsp;|&nbsp; CPI = EV/AC</li>
        <li>Availability = MTBF/(MTBF+MTTR) &nbsp;|&nbsp; POFOD = failures/demands</li>
        <li>CMM: 1 Initial, 2 Repeatable, 3 Defined, 4 Managed, 5 Optimizing</li>
      </ul></div>
    ${order.map(t=>{
      const qs = QS.filter(q=>q.topic===t.id);
      return `<section class="card" id="t-${t.id}">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">${esc(t.name)}</h2>
          <span class="stars" title="Importance">${"&#9733;".repeat(t.stars)}${"&#9734;".repeat(3-t.stars)}</span>
        </div>
        <div class="meta"><span class="tag">${t.weeks}</span><span class="tag">${qs.length} questions</span></div>
        <ul class="pts">${t.points.map(p=>`<li>${p}</li>`).join("")}</ul>
        <div class="right-btns"><button class="primary" data-quiz="${t.id}">Quiz me on this topic</button></div>
        <div style="margin-top:12px"><b>Questions on this topic</b>
          ${qs.map(q=>`<details class="tq"><summary>${esc(q.text)}</summary>
            ${q.note?`<div class="note">${esc(q.note)}</div>`:""}
            <ul class="opts">${q.opts.map((o,i)=>`<li class="${i===q.ans?"right":""}"><b>${LET[i]})</b><span>${esc(o)}</span></li>`).join("")}</ul>
            ${q.exp?`<div class="exp"><b>Why:</b> ${esc(q.exp)}</div>`:""}</details>`).join("")}
        </div></section>`;}).join("")}`;
  $app.onclick = e=>{
    const b=e.target.closest("[data-quiz]"); if(!b) return;
    location.hash = "#/quiz/"+b.dataset.quiz;
  };
}

/* ---------------- router ---------------- */
function go(){
  if(quiz && quiz.timer) clearInterval(quiz.timer);
  $app.onclick = null;
  const [ , route, arg] = (location.hash||"#/qa").split("/");
  document.querySelectorAll("#nav a").forEach(a=>a.classList.toggle("on",a.dataset.r===route));
  window.scrollTo(0,0);
  if(route==="quiz"){
    if(arg && TOPIC[arg]){ cfg.n = Math.min(cfg.n, 10); viewQuizSetup(arg); } else viewQuizSetup();
  } else if(route==="topics") viewTopics();
  else viewQA();
}
window.addEventListener("hashchange", go);
go();
})();
