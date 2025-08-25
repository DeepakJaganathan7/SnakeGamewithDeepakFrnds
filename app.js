/* Friendsy Snake - original assets, PWA-ready.
   Features: obstacles, power-ups (coffee, boots, umbrella), dynamic music via WebAudio, offline play.
*/
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const size = 20;
const cols = canvas.width / size;
const rows = canvas.height / size;

let snake, dir, nextDir, food, score, high, level, speedMs, timer;
let obstacles = [];
let powerups = []; // {x,y,type,ttl}
let effects = { coffee:false, coffeeUntil:0, boots:false, bootsUntil:0, shield:0 };
let running = true;

const ui = {
  score: document.getElementById("score"),
  high: document.getElementById("high"),
  level: document.getElementById("level"),
  status: document.getElementById("status"),
  btnPause: document.getElementById("btn-pause"),
  btnMute: document.getElementById("btn-mute"),
  btnInstall: document.getElementById("btn-install")
};

// ---- High score
high = Number(localStorage.getItem("friendsy_high") || 0);
ui.high.textContent = high;

// ---- Music via WebAudio (simple cozy loop)
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx, musicOn = true;
let musicNodes = [];
function note(freq, time, dur, type="sine", gain=0.05){
  if(!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gain, time+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, time+dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time+dur+0.1);
  musicNodes.push(osc, g);
}
function startMusic(){
  if(!musicOn) return;
  if(!audioCtx) audioCtx = new AudioCtx();
  const now = audioCtx.currentTime + 0.05;
  const tempo = 92/60; // beats per second
  const bar = 4/tempo; // seconds per 4 beats

  // Chord progression I - vi - IV - V (C-Am-F-G)
  const chords = [
    [261.63, 329.63, 392.00], // C major
    [220.00, 261.63, 329.63], // A minor
    [174.61, 220.00, 261.63], // F major (down an inversion for warmth)
    [196.00, 246.94, 392.00], // G add6-ish
  ];
  // schedule 2 bars ahead (simple loop)
  function scheduleLoop(startAt){
    for(let b=0;b<4;b++){
      const chord = chords[b];
      const t = startAt + b*bar;
      chord.forEach((base,i)=>{
        // pad
        note(base/2, t, bar*0.95, "sine", 0.02);
      });
      // simple Rhodes-like plucks
      for(let step=0; step<4; step++){
        const tt = t + step*(bar/4);
        const c = chord[(step)%chord.length];
        note(c, tt, 0.18, "triangle", 0.04);
      }
      // gentle bass
      note(chord[0]/2, t, bar*0.95, "square", 0.015);
    }
  }
  scheduleLoop(now);
  // reschedule every 4 bars
  if(window._musicInterval) clearInterval(window._musicInterval);
  window._musicInterval = setInterval(()=>{
    if(!audioCtx) return;
    const t = audioCtx.currentTime + 0.05;
    scheduleLoop(t);
  }, 4000);
}
function stopMusic(){
  if(window._musicInterval) clearInterval(window._musicInterval);
  musicNodes.forEach(n=>{ try{ n.disconnect(); }catch{} });
  musicNodes = [];
  if(audioCtx){
    try{ audioCtx.close(); }catch{}
    audioCtx = null;
  }
}

ui.btnMute.addEventListener("click", ()=>{
  musicOn = !musicOn;
  ui.btnMute.textContent = musicOn ? "Mute" : "Unmute";
  if(musicOn) startMusic(); else stopMusic();
});

// ---- PWA Install prompt
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  ui.btnInstall.hidden = false;
});
ui.btnInstall.addEventListener("click", async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  ui.btnInstall.hidden = true;
});

// ---- Input
document.addEventListener("keydown", (e)=>{
  const k = e.key.toLowerCase();
  if(["arrowup","w"].includes(k) && dir.y !== 1) nextDir = {x:0,y:-1};
  if(["arrowdown","s"].includes(k) && dir.y !== -1) nextDir = {x:0,y:1};
  if(["arrowleft","a"].includes(k) && dir.x !== 1) nextDir = {x:-1,y:0};
  if(["arrowright","d"].includes(k) && dir.x !== -1) nextDir = {x:1,y:0};
  if(k===" "){ togglePause(); }
});

document.querySelectorAll(".pad").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const d = btn.dataset.dir;
    if(d==="up" && dir.y !== 1) nextDir = {x:0,y:-1};
    if(d==="down" && dir.y !== -1) nextDir = {x:0,y:1};
    if(d==="left" && dir.x !== 1) nextDir = {x:-1,y:0};
    if(d==="right" && dir.x !== -1) nextDir = {x:1,y:0};
  });
});

// ---- Game setup
function reset(){
  snake = [{x:5,y:10},{x:4,y:10},{x:3,y:10}];
  dir = {x:1,y:0}; nextDir = {x:1,y:0};
  score = 0; level = 1;
  speedMs = 140;
  ui.score.textContent = score;
  ui.level.textContent = level;
  obstacles = makeObstacles(level);
  food = spawnFree();
  powerups = [];
  effects = { coffee:false, coffeeUntil:0, boots:false, bootsUntil:0, shield:0 };
  ui.status.textContent = "Good luck!";
}
function makeObstacles(lvl){
  const list = [];
  // A couple of cozy "sofas" (rect blocks), plus columns
  const blocks = [
    {x: 6, y: 6, w: 8, h: 1},
    {x: 6, y: rows-7, w: 8, h: 1},
    {x: 2, y: 2, w: 1, h: 4},
    {x: cols-3, y: rows-6, w: 1, h: 4},
  ];
  blocks.forEach(b=>{
    for(let i=0;i<b.w;i++) for(let j=0;j<b.h;j++){
      list.push({x:b.x+i, y:b.y+j});
    }
  });
  // More obstacles with level
  for(let i=0;i<lvl-1;i++){
    list.push({x: Math.floor(cols/2), y: 3+i});
  }
  return list;
}

function spawnFree(){
  while(true){
    const p = { x: Math.floor(Math.random()*cols), y: Math.floor(Math.random()*rows) };
    if(isFree(p)) return p;
  }
}
function isFree(p){
  if(snake.some(s=>s.x===p.x && s.y===p.y)) return false;
  if(obstacles.some(o=>o.x===p.x && o.y===p.y)) return false;
  if(powerups.some(o=>o.x===p.x && o.y===p.y)) return false;
  return true;
}

// ---- Powerups
const PU_TYPES = ["coffee","boots","shield"];
function maybeSpawnPowerup(tick){
  if(powerups.length >= 2) return;
  if(Math.random() < 0.03){ // ~3% chance per tick
    const p = spawnFree();
    const type = PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)];
    powerups.push({x:p.x, y:p.y, type, ttl: 600}); // ~600 ticks max
  }
}
function applyPowerup(type){
  if(type==="coffee"){
    effects.coffee = true;
    effects.coffeeUntil = performance.now()+10000;
    ui.status.textContent = "Coffee! 2× points ☕";
  } else if(type==="boots"){
    effects.boots = true;
    effects.bootsUntil = performance.now()+8000;
    ui.status.textContent = "Speed boots! 🥾";
  } else if(type==="shield"){
    effects.shield += 1;
    ui.status.textContent = "Umbrella ready ☂️";
  }
}

// ---- Loop
function tick(){
  if(!running) return;
  timer = setTimeout(tick, getSpeedMs());
  step();
  draw();
}
function getSpeedMs(){
  let s = speedMs;
  const now = performance.now();
  if(effects.boots && now < effects.bootsUntil) s *= 0.68;
  else if(effects.boots && now >= effects.bootsUntil) effects.boots = false;
  return Math.max(50, s);
}
function step(){
  dir = nextDir;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  // wrap
  head.x = (head.x + cols) % cols;
  head.y = (head.y + rows) % rows;

  // collision with obstacles or self
  let hit = obstacles.some(o=>o.x===head.x && o.y===head.y) || snake.some(s=>s.x===head.x && s.y===head.y);
  if(hit){
    if(effects.shield>0){
      effects.shield -= 1; // consume shield and survive
      ui.status.textContent = "Shield saved you!";
    } else {
      gameOver();
      return;
    }
  }

  snake.unshift(head);
  // eat food?
  if(head.x===food.x && head.y===food.y){
    const pts = effects.coffee ? 2 : 1;
    score += pts;
    ui.score.textContent = score;
    food = spawnFree();
    // level up every 8 points
    if(score>0 && score%8===0){
      level += 1; ui.level.textContent = level;
      speedMs = Math.max(70, speedMs-6);
      obstacles = makeObstacles(level);
      ui.status.textContent = "Level up!";
    }
  } else {
    snake.pop();
  }

  // powerups pickup
  powerups = powerups.filter(p=>{
    p.ttl -= 1;
    if(p.ttl <= 0) return false;
    if(p.x===head.x && p.y===head.y){
      applyPowerup(p.type);
      return false;
    }
    return true;
  });

  // coffee timeout
  if(effects.coffee && performance.now() > effects.coffeeUntil){
    effects.coffee = false;
  }

  // random powerup spawn
  maybeSpawnPowerup();
}

function gameOver(){
  running = false;
  clearTimeout(timer);
  if(score > high){
    high = score; localStorage.setItem("friendsy_high", String(high));
  }
  ui.high.textContent = high;
  ui.status.textContent = "Game over. Press Pause to restart.";
}

function togglePause(){
  if(running){
    running = false; clearTimeout(timer);
    ui.status.textContent = "Paused.";
  } else {
    if(!snake){ init(); return; }
    running = true; ui.status.textContent = "Resumed."; tick();
  }
}
ui.btnPause.addEventListener("click", ()=>{
  if(!snake || !running){ // start/restart
    init(true);
  } else {
    togglePause();
  }
});

function init(restart=false){
  if(restart){
    stopMusic();
  }
  reset();
  running = true;
  tick();
  if(musicOn) startMusic();
}

// ---- Drawing
function drawCell(x,y, color){
  const px = x*size, py = y*size;
  // soft rounded
  const r = 5;
  ctx.fillStyle = color;
  roundRect(ctx, px+2, py+2, size-4, size-4, r);
  ctx.fill();
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

// cozy neon-ish palette
const COLORS = {
  snake: "#34d399",
  head: "#22d3ee",
  food: "#f59e0b",
  sofa: "#a78bfa",
  column: "#94a3b8",
  coffee: "#a855f7",
  boots: "#22c55e",
  shield: "#38bdf8",
};

function draw(){
  // clear bg grid (already patterned via CSS), add vignette
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // obstacles
  obstacles.forEach((o,i)=>{
    const c = (i%7===0) ? COLORS.column : COLORS.sofa;
    drawCell(o.x,o.y,c);
  });

  // food
  drawCell(food.x, food.y, COLORS.food);

  // powerups
  powerups.forEach(p=>{
    const color = p.type==="coffee"?COLORS.coffee: p.type==="boots"?COLORS.boots: COLORS.shield;
    drawCell(p.x,p.y,color);
  });

  // snake
  snake.forEach((s,i)=>{
    drawCell(s.x, s.y, i===0?COLORS.head:COLORS.snake);
  });

  // effect indicators
  const now = performance.now();
  let fx = [];
  if(effects.coffee) fx.push("☕");
  if(effects.boots) fx.push("🥾");
  if(effects.shield>0) fx.push("☂️×"+effects.shield);
  ui.status.dataset.fx = fx.join(" ");
}

// start immediately
init(false);

// register SW
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js");
  });
}
