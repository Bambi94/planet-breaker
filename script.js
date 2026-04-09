'use strict';

/* ============================================================
   Planet Breaker — script.js
   Bubble Trouble / Pang-style game in vanilla JS + Canvas
   ============================================================ */

// ── Constants ──────────────────────────────────────────────
const GRAVITY       = 0.22;   // px/frame² (normalised to 60 fps)
const GROUND_H      = 14;     // ground strip height in px
const ROCKET_W      = 34;
const ROCKET_H      = 46;
const ROCKET_SPEED  = 6.5;    // px/frame
const LASER_SPEED   = 14;     // px/frame (upward)
const LASER_W       = 5;      // beam half-width for hit tests
const ENTRY_FEE     = 100;

const SIZES = {
  large:  { r: 42, speedX: 2.6, speedY: 2.8, score: 100, next: 'medium' },
  medium: { r: 25, speedX: 3.5, speedY: 3.8, score: 200, next: 'small'  },
  small:  { r: 14, speedX: 5.0, speedY: 5.2, score: 400, next: null     }
};

const PLANET_PALETTES = [
  { hi: '#ff9a8a', lo: '#c0392b', glow: '#ff4444', ring: false }, // fire
  { hi: '#7eceff', lo: '#0984e3', glow: '#22aaff', ring: false }, // ice
  { hi: '#c3a3ff', lo: '#6c5ce7', glow: '#9966ff', ring: true  }, // nebula
  { hi: '#6fffd4', lo: '#00b894', glow: '#00ffaa', ring: false }, // toxic
  { hi: '#ffe08a', lo: '#e67e22', glow: '#ffaa00', ring: true  }, // magma
  { hi: '#ffaad6', lo: '#e84393', glow: '#ff44cc', ring: false }, // plasma
];

// ── State ───────────────────────────────────────────────────
let canvas, ctx, W, H;
let gameState  = 'menu';   // 'menu' | 'playing' | 'levelup' | 'gameover'
let balance    = 10000;
let displayBal = 10000;    // animated display value
let score      = 0;
let level      = 1;

let planets    = [];
let laser      = null;     // { x, tipY }
let rocket     = { x: 0, y: 0 };
let particles  = [];
let stars      = [];
let keys       = {};
let mobileKeys = { left: false, right: false };
let lastTime   = 0;
let animId     = null;
let flashTimer = 0;        // for screen flash on split

// ── Bootstrap ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', boot);

function boot() {
  canvas = document.getElementById('gameCanvas');
  ctx    = canvas.getContext('2d');

  resize();
  window.addEventListener('resize', resize);

  generateStars();
  buildRocket();

  // Keyboard
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); tryShoot(); }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  // Buttons
  document.getElementById('playBtn').addEventListener('click', startGame);
  document.getElementById('nextLevelBtn').addEventListener('click', nextLevel);
  document.getElementById('restartBtn').addEventListener('click', returnToMenu);

  // Mobile controls
  setupMobile();

  updateMenuBalance();
  showScreen('menu');

  lastTime = performance.now();
  animId   = requestAnimationFrame(loop);
}

// ── Resize ──────────────────────────────────────────────────
function resize() {
  const el = document.getElementById('app');
  W = canvas.width  = el.clientWidth;
  H = canvas.height = el.clientHeight;

  if (rocket) {
    rocket.y = H - GROUND_H - ROCKET_H / 2;
    rocket.x = Math.min(Math.max(rocket.x, ROCKET_W / 2), W - ROCKET_W / 2);
  }
  generateStars();
}

// ── Stars ───────────────────────────────────────────────────
function generateStars() {
  stars = [];
  const count = Math.floor((W * H) / 6000);
  for (let i = 0; i < count; i++) {
    stars.push({
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     0.4 + Math.random() * 1.4,
      alpha: 0.2 + Math.random() * 0.7,
      speed: 0.008 + Math.random() * 0.025,
      phase: Math.random() * Math.PI * 2,
      col:   `hsl(${210 + Math.random() * 60},40%,88%)`
    });
  }
}

// ── Rocket ──────────────────────────────────────────────────
function buildRocket() {
  rocket = {
    x: W / 2,
    y: H - GROUND_H - ROCKET_H / 2
  };
}

// ── Screen Management ───────────────────────────────────────
function showScreen(name) {
  ['menu', 'levelup', 'gameover'].forEach(s => {
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== name);
  });
  const playing = (name === 'playing' || name === 'levelup');
  document.getElementById('hud').classList.toggle('hidden', !playing);
}

// ── Balance Display ─────────────────────────────────────────
function updateMenuBalance() {
  const el = document.getElementById('menu-balance');
  if (el) el.textContent = `${balance.toLocaleString()} $STARS`;
}

function updateHUD() {
  document.getElementById('hud-score').textContent   = score.toLocaleString();
  document.getElementById('hud-level').textContent   = level;
  document.getElementById('hud-balance').textContent = Math.round(displayBal).toLocaleString();
}

// ── Game Flow ────────────────────────────────────────────────
function startGame() {
  if (balance < ENTRY_FEE) return;
  balance   -= ENTRY_FEE;
  displayBal = balance;
  score      = 0;
  level      = 1;
  buildRocket();
  spawnLevel();
  gameState = 'playing';
  showScreen('playing');
  updateHUD();
}

function nextLevel() {
  level++;
  buildRocket();
  spawnLevel();
  gameState = 'playing';
  showScreen('playing');
  updateHUD();
}

function returnToMenu() {
  gameState = 'menu';
  planets   = [];
  laser     = null;
  particles = [];
  showScreen('menu');
  updateMenuBalance();
  document.getElementById('playBtn').disabled = balance < ENTRY_FEE;
}

function triggerGameOver() {
  gameState = 'gameover';
  laser     = null;
  document.getElementById('final-score').textContent       = score.toLocaleString();
  document.getElementById('gameover-balance').textContent  = `${balance.toLocaleString()} $STARS`;
  showScreen('gameover');
  document.getElementById('restartBtn').disabled = balance < ENTRY_FEE;
}

function triggerLevelUp() {
  gameState = 'levelup';
  const bonus = level * 200;
  balance   += bonus;
  displayBal = balance;
  updateHUD();
  document.getElementById('levelup-bonus').textContent = `+${bonus.toLocaleString()} $STARS`;
  showScreen('levelup');
}

// ── Level / Planet Spawning ──────────────────────────────────
function spawnLevel() {
  planets   = [];
  laser     = null;
  particles = [];

  const numLarge  = Math.min(1 + Math.floor((level - 1) / 2), 4);
  const numMedium = level >= 4 ? Math.min(Math.floor((level - 3) / 2) + 1, 3) : 0;

  for (let i = 0; i < numLarge; i++) {
    const x  = (W / (numLarge + 1)) * (i + 1);
    const vx = (Math.random() < 0.5 ? 1 : -1) * (SIZES.large.speedX + (level - 1) * 0.15);
    const vy = -(SIZES.large.speedY + (level - 1) * 0.1);
    planets.push(new Planet(x, H * 0.3, 'large', vx, vy));
  }

  for (let i = 0; i < numMedium; i++) {
    const x  = W * 0.2 + Math.random() * W * 0.6;
    const vx = (Math.random() < 0.5 ? 1 : -1) * (SIZES.medium.speedX + (level - 1) * 0.12);
    const vy = -(SIZES.medium.speedY + (level - 1) * 0.1);
    planets.push(new Planet(x, H * 0.35, 'medium', vx, vy));
  }
}

// ── Shooting ────────────────────────────────────────────────
function tryShoot() {
  if (gameState !== 'playing' || laser) return;
  laser = { x: rocket.x, tipY: rocket.y - ROCKET_H / 2 };
}

// ── Planet Class ─────────────────────────────────────────────
class Planet {
  constructor(x, y, size, vx, vy, paletteIdx) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.r    = SIZES[size].r;
    this.vx   = vx;
    this.vy   = vy;
    this.pi   = paletteIdx !== undefined ? paletteIdx : Math.floor(Math.random() * PLANET_PALETTES.length);
    this.pal  = PLANET_PALETTES[this.pi];
    this.rot  = Math.random() * Math.PI * 2;
    this.rotV = (Math.random() - 0.5) * 0.04;
    this.pulse = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.vy    += GRAVITY * dt;
    if (this.vy > 13) this.vy = 13; // terminal velocity
    this.x     += this.vx * dt;
    this.y     += this.vy * dt;
    this.rot   += this.rotV * dt;
    this.pulse += 0.05 * dt;

    // Wall bounce
    if (this.x - this.r < 0) {
      this.x  = this.r;
      this.vx = Math.abs(this.vx);
    } else if (this.x + this.r > W) {
      this.x  = W - this.r;
      this.vx = -Math.abs(this.vx);
    }

    // Floor bounce (elastic – restore to same height)
    const floor = H - GROUND_H;
    if (this.y + this.r >= floor) {
      this.y  = floor - this.r;
      this.vy = -Math.abs(this.vy);
      if (Math.abs(this.vy) < 2.5) this.vy = -2.5; // ensure planet keeps bouncing
    }
  }

  split() {
    const cfg  = SIZES[this.size];
    if (!cfg.next) return [];
    const ns   = cfg.next;
    const nc   = SIZES[ns];
    const spX  = nc.speedX + (level - 1) * 0.12;
    const spY  = nc.speedY + (level - 1) * 0.10;
    return [
      new Planet(this.x, this.y, ns, -spX, -spY * 1.4, this.pi),
      new Planet(this.x, this.y, ns,  spX, -spY * 1.4, this.pi)
    ];
  }

  draw(ctx) {
    const pulseFactor = 1 + Math.sin(this.pulse) * 0.025;
    const r = this.r * pulseFactor;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Glow
    ctx.shadowBlur  = 22;
    ctx.shadowColor = this.pal.glow;

    // Body gradient
    const bg = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.08, 0, 0, r);
    bg.addColorStop(0,   this.pal.hi);
    bg.addColorStop(0.55, this.pal.lo);
    bg.addColorStop(1,   '#00001a');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();

    // Specular highlight
    ctx.shadowBlur = 0;
    const hl = ctx.createRadialGradient(-r * 0.4, -r * 0.38, 0, -r * 0.3, -r * 0.3, r * 0.55);
    hl.addColorStop(0,   'rgba(255,255,255,0.38)');
    hl.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = hl;
    ctx.fill();

    // Ring for planets that have one
    if (this.pal.ring) {
      ctx.save();
      ctx.rotate(this.rot);
      ctx.scale(1, 0.28);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = this.pal.glow + '88';
      ctx.lineWidth   = 4;
      ctx.shadowBlur  = 10;
      ctx.shadowColor = this.pal.glow;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}

// ── Particle Class ───────────────────────────────────────────
class Particle {
  constructor(x, y, col, vx, vy) {
    this.x    = x;
    this.y    = y;
    this.col  = col;
    this.vx   = vx;
    this.vy   = vy;
    this.life = 1.0;
    this.size = 1.5 + Math.random() * 3;
    this.dec  = 0.025 + Math.random() * 0.025;
  }

  update(dt) {
    this.x    += this.vx * dt;
    this.y    += this.vy * dt;
    this.vy   += GRAVITY * 0.4 * dt;
    this.life -= this.dec * dt;
    return this.life > 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.life * this.life;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = this.col;
    ctx.fillStyle   = this.col;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function spawnParticles(x, y, col, n) {
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) + Math.random() * 0.6;
    const spd   = 2 + Math.random() * 6;
    particles.push(new Particle(x, y, col, Math.cos(angle) * spd, Math.sin(angle) * spd - 2));
  }
}

// ── Mobile Controls ──────────────────────────────────────────
function setupMobile() {
  const btnL = document.getElementById('btn-left');
  const btnR = document.getElementById('btn-right');
  const btnF = document.getElementById('btn-fire');

  function press(side)   { if (side === 'L') mobileKeys.left  = true;  else mobileKeys.right = true;  }
  function release(side) { if (side === 'L') mobileKeys.left  = false; else mobileKeys.right = false; }

  // Touch events
  btnL.addEventListener('touchstart', e => { e.preventDefault(); press('L');   btnL.classList.add('pressed'); },    { passive: false });
  btnL.addEventListener('touchend',   e => { e.preventDefault(); release('L'); btnL.classList.remove('pressed'); }, { passive: false });
  btnL.addEventListener('touchcancel',() => { release('L'); btnL.classList.remove('pressed'); });

  btnR.addEventListener('touchstart', e => { e.preventDefault(); press('R');   btnR.classList.add('pressed'); },    { passive: false });
  btnR.addEventListener('touchend',   e => { e.preventDefault(); release('R'); btnR.classList.remove('pressed'); }, { passive: false });
  btnR.addEventListener('touchcancel',() => { release('R'); btnR.classList.remove('pressed'); });

  btnF.addEventListener('touchstart', e => { e.preventDefault(); tryShoot(); btnF.classList.add('pressed'); },    { passive: false });
  btnF.addEventListener('touchend',   e => { e.preventDefault();             btnF.classList.remove('pressed'); }, { passive: false });

  // Mouse fallback (handy on desktop testing with DevTools)
  btnL.addEventListener('mousedown', () => press('L'));
  btnL.addEventListener('mouseup',   () => release('L'));
  btnL.addEventListener('mouseleave',() => release('L'));
  btnR.addEventListener('mousedown', () => press('R'));
  btnR.addEventListener('mouseup',   () => release('R'));
  btnR.addEventListener('mouseleave',() => release('R'));
  btnF.addEventListener('mousedown', () => tryShoot());
}

// ── Collision Detection ───────────────────────────────────────
function checkLaser() {
  if (!laser) return;

  let best = null, bestY = -Infinity;

  for (const p of planets) {
    const dx = Math.abs(p.x - laser.x);
    if (dx > p.r + LASER_W) continue;         // too far horizontally
    if (laser.tipY > p.y + p.r) continue;     // tip hasn't reached planet's bottom yet
    // Pick the planet whose centre is lowest on screen (first encountered by the rising laser)
    if (p.y > bestY) { bestY = p.y; best = p; }
  }

  if (best) {
    spawnParticles(best.x, best.y, best.pal.glow, 14);
    const children = best.split();
    planets = planets.filter(p => p !== best);
    planets.push(...children);
    score += SIZES[best.size].score;
    laser = null;
    flashTimer = 6;
    updateHUD();
  }
}

function checkRocket() {
  const hw = ROCKET_W * 0.38;  // tighter hitbox for forgiving gameplay
  const hh = ROCKET_H * 0.42;

  for (const p of planets) {
    const cx = Math.max(rocket.x - hw, Math.min(p.x, rocket.x + hw));
    const cy = Math.max(rocket.y - hh, Math.min(p.y, rocket.y + hh));
    const d  = Math.hypot(p.x - cx, p.y - cy);
    if (d < p.r) {
      spawnParticles(rocket.x, rocket.y, '#4d8fff', 20);
      triggerGameOver();
      return;
    }
  }
}

// ── Update ───────────────────────────────────────────────────
function update(dt) {
  // Move rocket
  const moving = keys['ArrowLeft'] || keys['KeyA'] || mobileKeys.left;
  const movingR = keys['ArrowRight'] || keys['KeyD'] || mobileKeys.right;

  if (moving)  rocket.x -= ROCKET_SPEED * dt;
  if (movingR) rocket.x += ROCKET_SPEED * dt;
  rocket.x = Math.max(ROCKET_W / 2, Math.min(W - ROCKET_W / 2, rocket.x));

  // Move laser
  if (laser) {
    laser.tipY -= LASER_SPEED * dt;
    if (laser.tipY < 0) laser = null;
  }

  // Update planets
  for (const p of planets) p.update(dt);

  // Update particles
  particles = particles.filter(p => p.update(dt));

  // Check collisions
  checkLaser();
  if (gameState === 'playing') checkRocket();

  // Animate balance counter
  if (Math.abs(displayBal - balance) > 0.5) {
    displayBal += (balance - displayBal) * 0.08 * dt;
    updateHUD();
  }

  // Flash timer
  if (flashTimer > 0) flashTimer -= dt;

  // Win condition
  if (gameState === 'playing' && planets.length === 0) {
    triggerLevelUp();
  }
}

// ── Draw ─────────────────────────────────────────────────────
function draw(ts) {
  ctx.clearRect(0, 0, W, H);

  drawBackground(ts);

  if (gameState === 'playing' || gameState === 'levelup' || gameState === 'gameover') {
    // Flash overlay on hit
    if (flashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = (flashTimer / 6) * 0.18;
      ctx.fillStyle   = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    for (const p of particles) p.draw(ctx);
    for (const p of planets)   p.draw(ctx);
    if (laser) drawLaser();
    if (gameState === 'playing') drawRocket();
  }

  drawGround();
}

function drawBackground(ts) {
  // Deep space gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,   '#04040e');
  bg.addColorStop(0.5, '#070718');
  bg.addColorStop(1,   '#0a0a20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Twinkling stars
  for (const s of stars) {
    s.phase += s.speed;
    const a = s.alpha * (0.5 + Math.sin(s.phase) * 0.5);
    ctx.globalAlpha = a;
    ctx.fillStyle   = s.col;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGround() {
  const y = H - GROUND_H;
  ctx.save();

  // Neon ground line
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.strokeStyle = 'rgba(77,143,255,0.9)';
  ctx.lineWidth   = 1.5;
  ctx.shadowBlur  = 12;
  ctx.shadowColor = '#4d8fff';
  ctx.stroke();

  // Ground fill
  const gf = ctx.createLinearGradient(0, y, 0, H);
  gf.addColorStop(0, 'rgba(77,143,255,0.18)');
  gf.addColorStop(1, 'rgba(77,143,255,0.05)');
  ctx.fillStyle = gf;
  ctx.fillRect(0, y, W, GROUND_H);

  ctx.restore();
}

function drawLaser() {
  const x = laser.x;
  const y0 = laser.tipY;
  const y1 = rocket.y - ROCKET_H / 2;

  ctx.save();

  // Wide glow
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.strokeStyle = 'rgba(255,80,80,0.25)';
  ctx.lineWidth   = 14;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // Main beam
  const lg = ctx.createLinearGradient(0, y0, 0, y1);
  lg.addColorStop(0,   '#ff3333');
  lg.addColorStop(0.4, '#ff6644');
  lg.addColorStop(1,   'rgba(255,80,60,0.15)');

  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.strokeStyle = lg;
  ctx.lineWidth   = 4;
  ctx.shadowBlur  = 16;
  ctx.shadowColor = '#ff3333';
  ctx.stroke();

  // Bright core
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.strokeStyle = 'rgba(255,220,220,0.9)';
  ctx.lineWidth   = 1.5;
  ctx.shadowBlur  = 0;
  ctx.stroke();

  // Tip flare
  ctx.beginPath();
  ctx.arc(x, y0, 5, 0, Math.PI * 2);
  ctx.fillStyle   = '#ff6666';
  ctx.shadowBlur  = 20;
  ctx.shadowColor = '#ff0000';
  ctx.fill();

  ctx.restore();
}

function drawRocket() {
  const x = rocket.x;
  const y = rocket.y;
  const hw = ROCKET_W / 2;
  const hh = ROCKET_H / 2;

  ctx.save();
  ctx.translate(x, y);

  // Engine flame
  const fh = hh * 0.8 + Math.random() * 8;
  const fl = ctx.createLinearGradient(0, hh * 0.3, 0, hh * 0.3 + fh);
  fl.addColorStop(0,   '#ff8800');
  fl.addColorStop(0.4, '#ffcc00');
  fl.addColorStop(1,   'rgba(255,100,0,0)');

  ctx.beginPath();
  ctx.moveTo(-hw * 0.28, hh * 0.35);
  ctx.lineTo(0,          hh * 0.35 + fh);
  ctx.lineTo(hw * 0.28,  hh * 0.35);
  ctx.fillStyle   = fl;
  ctx.shadowBlur  = 18;
  ctx.shadowColor = '#ff8800';
  ctx.fill();

  // Body gradient
  const body = ctx.createLinearGradient(-hw, 0, hw, 0);
  body.addColorStop(0,   '#12203a');
  body.addColorStop(0.3, '#2a4a7a');
  body.addColorStop(0.5, '#3a6aaa');
  body.addColorStop(0.7, '#2a4a7a');
  body.addColorStop(1,   '#12203a');

  ctx.shadowBlur  = 14;
  ctx.shadowColor = '#4d8fff';

  // Main fuselage
  ctx.beginPath();
  ctx.moveTo(0,      -hh);          // nose tip
  ctx.lineTo(hw * 0.42,  hh * 0.15);
  ctx.lineTo(hw * 0.52,  hh * 0.35);
  ctx.lineTo(hw * 0.32,  hh * 0.5);
  ctx.lineTo(-hw * 0.32, hh * 0.5);
  ctx.lineTo(-hw * 0.52, hh * 0.35);
  ctx.lineTo(-hw * 0.42, hh * 0.15);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();

  // Stripe highlight
  ctx.beginPath();
  ctx.moveTo(-hw * 0.12, -hh * 0.7);
  ctx.lineTo(hw * 0.12, -hh * 0.7);
  ctx.lineTo(hw * 0.22,  hh * 0.1);
  ctx.lineTo(-hw * 0.22, hh * 0.1);
  ctx.closePath();
  ctx.fillStyle   = 'rgba(77,143,255,0.22)';
  ctx.shadowBlur  = 0;
  ctx.fill();

  // Cockpit window
  ctx.shadowBlur  = 8;
  ctx.shadowColor = '#88ccff';
  const win = ctx.createRadialGradient(-hw * 0.06, -hh * 0.28, 0, 0, -hh * 0.22, hw * 0.16);
  win.addColorStop(0,   '#aaddff');
  win.addColorStop(1,   '#114488');
  ctx.beginPath();
  ctx.ellipse(0, -hh * 0.2, hw * 0.17, hw * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = win;
  ctx.fill();

  ctx.restore();
}

// ── Main Loop ────────────────────────────────────────────────
function loop(ts) {
  const rawDt = (ts - lastTime) / 16.667;
  const dt    = Math.min(rawDt, 4);   // cap to avoid spiral-of-death
  lastTime    = ts;

  if (gameState === 'playing') {
    update(dt);
  } else {
    // Still animate particles + stars even on overlay screens
    particles = particles.filter(p => p.update(dt));
    if (flashTimer > 0) flashTimer -= dt;
  }

  draw(ts);
  animId = requestAnimationFrame(loop);
}
