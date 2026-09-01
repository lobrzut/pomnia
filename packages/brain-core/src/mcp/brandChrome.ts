// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Shared chrome for / and /admin — same character as pomnia.ai:
 * shimmer wordmark, light neuron sky, Desktop color schemes (mint/iris/glass).
 * Zero external requests; respects prefers-reduced-motion.
 */

export const BRAND_HEAD_LINKS = `
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/icon.png" sizes="512x512">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
`.trim()

/** CSS: themes + shimmer mark + sky shell. Injected into both status + admin. */
export function brandChromeCss(): string {
  return `
  /* Desktop schemes: mint (default) · iris · glass — html[data-theme] */
  html[data-theme='mint'], :root {
    --bg:#060a08; --bg-2:#0a110d; --panel:rgba(17,31,24,.58); --border:rgba(255,255,255,.09);
    --ink:#e9f5ee; --ink-dim:#8fa89a; --ink-faint:#5b7868;
    --mint:#34d399; --iris:#2dd4bf; --cyan:#5eead4; --violet:#10b981;
    --amber:#fbbf24; --rose:#fb7185; --glow:rgba(45,212,191,.10);
    --aurora-1:#1a5c3a; --aurora-2:#34d399; --sheen-a:#e9f5ee; --sheen-b:#a7f3d0; --sheen-c:#5eead4;
  }
  html[data-theme='iris'] {
    --bg:#06070d; --bg-2:#0a0c16; --panel:rgba(17,20,31,.62); --border:rgba(255,255,255,.10);
    --ink:#e9ecf5; --ink-dim:#9aa3bd; --ink-faint:#5b6178;
    --mint:#8b5cf6; --iris:#6366f1; --cyan:#22d3ee; --violet:#8b5cf6;
    --glow:rgba(99,102,241,.14);
    --aurora-1:#4c1d95; --aurora-2:#8b5cf6; --sheen-a:#e9ecf5; --sheen-b:#c3ccff; --sheen-c:#22d3ee;
  }
  html[data-theme='glass'] {
    --bg:#05070b; --bg-2:#0a0e14; --panel:rgba(18,24,32,.55); --border:rgba(255,255,255,.14);
    --ink:#f2f6fb; --ink-dim:#9aabbd; --ink-faint:#5f6e80;
    --mint:#5eead4; --iris:#38bdf8; --cyan:#67e8f9; --violet:#5eead4;
    --glow:rgba(56,189,248,.12);
    --aurora-1:#0c4a6e; --aurora-2:#38bdf8; --sheen-a:#ffffff; --sheen-b:#bae6fd; --sheen-c:#5eead4;
  }
  #sky{position:fixed;inset:0;z-index:0;width:100%;height:100%;display:block;pointer-events:none}
  .veil{position:fixed;inset:0;z-index:1;pointer-events:none;
    background:
      radial-gradient(900px 520px at 50% 12%, color-mix(in srgb, var(--iris) 14%, transparent), transparent 62%),
      radial-gradient(700px 480px at 86% 90%, color-mix(in srgb, var(--cyan) 7%, transparent), transparent 60%),
      radial-gradient(560px 400px at 8% 72%, color-mix(in srgb, var(--violet) 6%, transparent), transparent 60%),
      linear-gradient(180deg, color-mix(in srgb, var(--bg) 35%, transparent), var(--bg) 78%);}
  .page-root{position:relative;z-index:2}
  .mark{
    margin:0;font-size:1.7rem;font-weight:300;letter-spacing:-.03em;line-height:1;
    background:linear-gradient(104deg,var(--sheen-a) 10%,var(--sheen-b) 46%,var(--sheen-c) 82%,var(--sheen-b) 98%);
    background-size:220% 100%;
    -webkit-background-clip:text;background-clip:text;color:transparent;
    animation:sheen 9s linear infinite;
  }
  .mark .i{
    -webkit-text-fill-color:var(--mint);color:var(--mint);
    text-shadow:0 0 .35em color-mix(in srgb,var(--mint) 55%,transparent),0 0 1.1em color-mix(in srgb,var(--mint) 30%,transparent);
    animation:iGlow 3.4s ease-in-out infinite;
  }
  @keyframes sheen{from{background-position:0% 0}to{background-position:220% 0}}
  @keyframes iGlow{
    0%,100%{text-shadow:0 0 .35em color-mix(in srgb,var(--mint) 55%,transparent),0 0 1.1em color-mix(in srgb,var(--mint) 30%,transparent)}
    50%{text-shadow:0 0 .5em color-mix(in srgb,var(--mint) 75%,transparent),0 0 1.6em color-mix(in srgb,var(--mint) 45%,transparent)}
  }
  @media (prefers-reduced-motion:reduce){
    .mark,.mark .i{animation:none}
  }
  .theme-bar{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}
  .theme-bar[hidden]{display:none!important}
  .theme-bar .lbl{font-size:.72rem;color:var(--ink-faint);margin-right:.25rem}
  .theme-bar button{
    font-family:inherit;font-size:.75rem;font-weight:600;padding:.28rem .65rem;border-radius:999px;
    border:1px solid var(--border);background:transparent;color:var(--ink-dim);cursor:pointer;
  }
  .theme-bar button[aria-checked="true"]{
    color:var(--mint);background:color-mix(in srgb,var(--mint) 14%,transparent);
    border-color:color-mix(in srgb,var(--mint) 35%,var(--border));
  }
  `
}

export function brandWordmarkHtml(tag = 'h1'): string {
  // "Pomnia" with mint glowing "i" — same split as pomnia.ai
  return `<${tag} class="mark">Pomn<span class="i">i</span>a</${tag}>`
}

export function brandSkyHtml(): string {
  return `<canvas id="sky" aria-hidden="true"></canvas><div class="veil" aria-hidden="true"></div>`
}

export function themeSwitcherHtml(opts?: { hiddenUntilLogin?: boolean }): string {
  const hidden = opts?.hiddenUntilLogin ? ' hidden' : ''
  // English labels: public `/` must stay EN (statusPageLang.test). Admin may
  // retitle via i18n; scheme ids (mint|iris|glass) are the contract.
  return `<div class="theme-bar" id="theme-bar"${hidden} role="radiogroup" aria-label="Colors">
    <span class="lbl">Colors</span>
    <button type="button" role="radio" data-theme-opt="mint" aria-checked="true">Mint</button>
    <button type="button" role="radio" data-theme-opt="iris" aria-checked="false">Iris</button>
    <button type="button" role="radio" data-theme-opt="glass" aria-checked="false">Glass</button>
  </div>`
}

/** Light neuron field — fewer cells than www, pauses when tab hidden. */
export function brandSkyScript(): string {
  return `
(function(){
  var cv=document.getElementById('sky'); if(!cv||!cv.getContext) return;
  var ctx=cv.getContext('2d'); if(!ctx) return;
  var reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  var W=0,H=0,dpr=1,near=[],far=[],signals=[],raf=0,lastFire=0;
  var IRIS=[148,163,246], CYAN=[82,211,238], MINT=[52,211,153];
  function makeNeuron(sway,scale){
    var tint=Math.random(), hub=Math.random()<0.12, pad=64;
    var n={hx:Math.random()*W,hy:-pad+Math.random()*(H+pad*2),x:0,y:0,
      amp:(2+Math.random()*3.5)*sway,ph:Math.random()*Math.PI*2,ph2:Math.random()*Math.PI*2,
      rate:0.00012+Math.random()*0.00012,r:(hub?1.8+Math.random():0.9+Math.random()*0.8)*scale,
      c:tint<0.7?IRIS:tint<0.92?CYAN:MINT,tw:Math.random()*Math.PI*2,spin:(Math.random()-0.5)*0.0001,
      hub:hub,out:[],lit:0,glow:0,ready:0,dend:[]};
    n.x=n.hx; n.y=n.hy;
    var count=hub?4+(Math.random()*2|0):2+(Math.random()*2|0);
    for(var i=0;i<count;i++) n.dend.push({a:(i/count)*Math.PI*2+Math.random()*0.6,len:(3.5+Math.random()*8)*scale*(hub?1.4:1)});
    return n;
  }
  function wire(list,maxDist,k){
    for(var ai=0;ai<list.length;ai++){
      var a=list[ai], cand=[];
      for(var bi=0;bi<list.length;bi++){
        if(ai===bi) continue;
        var b=list[bi], d=Math.hypot(a.x-b.x,a.y-b.y);
        if(d<maxDist) cand.push({b:b,d:d});
      }
      cand.sort(function(p,q){return p.d-q.d});
      a.out=[];
      var take=Math.min(a.hub?k+1:k,cand.length);
      for(var i=0;i<take;i++) a.out.push({b:cand[i].b,bend:(Math.random()-0.5)*0.28});
    }
  }
  function seed(){
    var nNear=Math.round(Math.min(36, Math.max(16,(W*H)/52000)));
    var nFar=Math.round(nNear*0.7);
    near=Array.from({length:nNear},function(){return makeNeuron(1,1)});
    far=Array.from({length:nFar},function(){return makeNeuron(0.55,0.5)});
    wire(near,210,2); wire(far,170,2); signals=[];
  }
  function resize(){
    dpr=Math.min(devicePixelRatio||1,1.5);
    W=innerWidth; H=innerHeight;
    cv.width=W*dpr; cv.height=H*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    seed();
  }
  function sway(list,t){
    for(var i=0;i<list.length;i++){
      var n=list[i];
      n.x=n.hx+Math.cos(t*n.rate+n.ph)*n.amp;
      n.y=n.hy+Math.sin(t*n.rate*1.3+n.ph2)*n.amp*0.75;
    }
  }
  function tissue(list,axonA,somaA,t){
    ctx.lineCap='round';
    for(var ai=0;ai<list.length;ai++){
      var a=list[ai];
      for(var oi=0;oi<a.out.length;oi++){
        var o=a.out[oi], b=o.b, dx=b.x-a.x, dy=b.y-a.y;
        var cx=(a.x+b.x)/2-dy*o.bend, cy=(a.y+b.y)/2+dx*o.bend;
        var heat=Math.max(a.glow,b.glow);
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.quadraticCurveTo(cx,cy,b.x,b.y);
        ctx.strokeStyle='rgba('+a.c[0]+','+a.c[1]+','+a.c[2]+','+(axonA+heat*0.14)+')';
        ctx.lineWidth=0.65+heat*0.4; ctx.stroke();
      }
    }
    for(var i=0;i<list.length;i++){
      var n=list[i], rot=t*n.spin;
      ctx.strokeStyle='rgba('+n.c[0]+','+n.c[1]+','+n.c[2]+','+((axonA+n.glow*0.18)*1.35)+')';
      ctx.lineWidth=0.55;
      for(var di=0;di<n.dend.length;di++){
        var d=n.dend[di], a=d.a+rot, L=d.len*(1+n.glow*0.15);
        ctx.beginPath(); ctx.moveTo(n.x,n.y); ctx.lineTo(n.x+Math.cos(a)*L,n.y+Math.sin(a)*L); ctx.stroke();
      }
    }
    for(var j=0;j<list.length;j++){
      var m=list[j], breathe=reduced?1:0.78+0.22*Math.sin(t/1100+m.tw);
      var a=somaA*breathe+m.glow*0.3;
      ctx.beginPath(); ctx.arc(m.x,m.y,m.r*(1+m.glow*0.25),0,Math.PI*2);
      ctx.fillStyle='rgba('+m.c[0]+','+m.c[1]+','+m.c[2]+','+a+')'; ctx.fill();
    }
  }
  function fire(n,t,depth){
    if(t<n.ready) return;
    n.ready=t+1200+Math.random()*900; n.lit=1;
    if(!n.out.length||depth>2) return;
    var branches=depth===0?Math.min(n.out.length,2):(Math.random()<0.7?1:2);
    var used={};
    for(var i=0;i<branches;i++){
      var o=n.out[(Math.random()*n.out.length)|0];
      if(used[o]) continue; used[o]=1;
      signals.push({a:n,o:o,t:0,v:0.007+Math.random()*0.004,depth:depth});
    }
  }
  function frame(t){
    if(document.hidden){ raf=requestAnimationFrame(frame); return; }
    ctx.clearRect(0,0,W,H);
    if(!reduced){ sway(far,t); sway(near,t); }
    for(var i=0;i<far.length;i++){ far[i].lit*=0.975; far[i].glow+=(far[i].lit-far[i].glow)*0.1; }
    for(var j=0;j<near.length;j++){ near[j].lit*=0.98; near[j].glow+=(near[j].lit-near[j].glow)*0.1; }
    tissue(far,0.045,0.12,t); tissue(near,0.07,0.22,t);
    if(!reduced && t-lastFire>900){
      lastFire=t; var pool=near[(Math.random()*near.length)|0]; if(pool) fire(pool,t,0);
    }
    for(var s=signals.length-1;s>=0;s--){
      var sig=signals[s]; sig.t+=sig.v;
      if(sig.t>=1){ fire(sig.o.b,t,sig.depth+1); signals.splice(s,1); continue; }
      var a=sig.a,o=sig.o,b=o.b,dx=b.x-a.x,dy=b.y-a.y;
      var cx=(a.x+b.x)/2-dy*o.bend, cy=(a.y+b.y)/2+dx*o.bend, u=1-sig.t;
      var x=u*u*a.x+2*u*sig.t*cx+sig.t*sig.t*b.x;
      var y=u*u*a.y+2*u*sig.t*cy+sig.t*sig.t*b.y;
      ctx.beginPath(); ctx.arc(x,y,1.4,0,Math.PI*2);
      ctx.fillStyle='rgba('+a.c[0]+','+a.c[1]+','+a.c[2]+',0.85)'; ctx.fill();
    }
    raf=requestAnimationFrame(frame);
  }
  addEventListener('resize', function(){ clearTimeout(resize._t); resize._t=setTimeout(resize,120); }, {passive:true});
  resize();
  if(!reduced) raf=requestAnimationFrame(frame);
  else { tissue(far,0.05,0.14,0); tissue(near,0.08,0.24,0); }
})();
`
}

/**
 * Wiring for the admin panel's colour switcher.
 *
 * It writes through to server settings, so the choice belongs to the server
 * rather than to whichever browser happened to make it. The public status page
 * no longer carries a switcher at all — it renders the stored scheme and
 * nothing else, because a status page's job is to report this server's state,
 * not to offer the visitor a preference that only they can see.
 *
 * localStorage is still written, as an immediate local echo so the panel does
 * not flicker back before the PUT lands. The server's copy is what any other
 * browser will see.
 */
export function themeScript(): string {
  return `
(function(){
  var KEY='pomnia-color-scheme';
  var allowed={mint:1,iris:1,glass:1};
  function persist(scheme){
    try{
      fetch('/admin/settings', {
        method:'PUT',
        credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({colorScheme:scheme})
      }).catch(function(){});
    }catch(e){}
  }
  function apply(scheme, save){
    if(!allowed[scheme]) scheme='mint';
    document.documentElement.setAttribute('data-theme', scheme);
    try{ localStorage.setItem(KEY, scheme); }catch(e){}
    if(save) persist(scheme);
    var bar=document.getElementById('theme-bar');
    if(!bar) return;
    var buttons=bar.querySelectorAll('[data-theme-opt]');
    for(var i=0;i<buttons.length;i++){
      var b=buttons[i];
      b.setAttribute('aria-checked', String(b.getAttribute('data-theme-opt')===scheme));
    }
  }
  // The server-rendered data-theme is the stored setting; trust it over the
  // local echo, which may be a stale choice from before someone changed it.
  var initial=document.documentElement.getAttribute('data-theme');
  if(!initial||!allowed[initial]){
    try{ initial=localStorage.getItem(KEY)||'mint'; }catch(e){ initial='mint'; }
  }
  apply(initial, false);
  var bar=document.getElementById('theme-bar');
  if(bar){
    bar.addEventListener('click', function(ev){
      var t=ev.target;
      if(!t||!t.getAttribute) return;
      var opt=t.getAttribute('data-theme-opt');
      if(opt) apply(opt, true);
    });
  }
  window.__pomniaApplyTheme=apply;
})();
`
}
