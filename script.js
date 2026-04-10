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

// Timer
const BASE_LEVEL_TIME  = 45;   // seconds for levels 1-3
const TIME_INCREMENT   = 3;    // extra seconds per level beyond 3
const MAX_LEVEL_TIME   = 60;   // ceiling

// Power-ups
const POWERUP_DROP_CHANCE = 0.18;
const POWERUP_RADIUS      = 14;
const POWERUP_FALL_SPEED  = 1.8;
const POWERUP_TIME_BONUS  = 8;    // seconds added
const SPEED_BOOST_SEC     = 5;    // seconds of speed boost
const SPEED_BOOST_MULT    = 1.8;

const TRANSITION_DURATION = 120;  // frames (~2 s at 60 fps)

const POWERUP_DEFS = [
  { type: 'time',      weight: 30, color: '#00e87a', glow: '#00ff88', symbol: '⏱' },
  { type: 'shield',    weight: 25, color: '#4d8fff', glow: '#2288ff', symbol: '🛡' },
  { type: 'speed',     weight: 20, color: '#ffcc00', glow: '#ffaa00', symbol: '⚡' },
  { type: 'permLaser', weight: 20, color: '#ff3f55', glow: '#ff0033', symbol: '⬆' },
  { type: 'extraShot', weight: 15, color: '#a855f7', glow: '#9933ff', symbol: '➕' },
];

const SIZES = {
  large:  { r: 42, speedX: 2.6, speedY: 2.8, score: 100, next: 'medium' },
  medium: { r: 25, speedX: 3.5, speedY: 3.8, score: 200, next: 'small'  },
  small:  { r: 14, speedX: 5.0, speedY: 5.2, score: 400, next: null     }
};

const PLANET_PALETTES = [
  { hi: '#ff9a8a', lo: '#c0392b', glow: '#ff4444', ring: false },
  { hi: '#7eceff', lo: '#0984e3', glow: '#22aaff', ring: false },
  { hi: '#c3a3ff', lo: '#6c5ce7', glow: '#9966ff', ring: true  },
  { hi: '#6fffd4', lo: '#00b894', glow: '#00ffaa', ring: false },
  { hi: '#ffe08a', lo: '#e67e22', glow: '#ffaa00', ring: true  },
  { hi: '#ffaad6', lo: '#e84393', glow: '#ff44cc', ring: false },
];

// ── State ───────────────────────────────────────────────────
let canvas, ctx, W, H;
let gameState  = 'menu';   // 'menu' | 'playing' | 'transition' | 'gameover'
let balance    = 10000;
let displayBal = 10000;
let score      = 0;
let level      = 1;

let planets    = [];
let lasers     = [];
let rocket     = { x: 0, y: 0 };
let particles  = [];
let bgStars    = [];
let keys       = {};
let mobileKeys = { left: false, right: false };
let lastTime   = 0;
let animId     = null;
let flashTimer = 0;

// New gameplay state
let levelTimer      = 0;      // seconds remaining
let levelTimerMax   = 0;      // max for current level
let powerUpDrops    = [];     // falling PowerUp objects
let hasShield       = false;
let permLaserActive = false;  // permanent-laser power-up active this level
let extraShots      = 0;      // +1 power-up stacks (resets each level)
let speedBoostTime  = 0;      // seconds remaining
let transitionTimer = 0;      // frames remaining in auto-transition
let floatingTexts   = [];     // notification pop-ups

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
  bgStars = [];
  const count = Math.floor((W * H) / 6000);
  for (let i = 0; i < count; i++) {
    bgStars.push({
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
  ['menu', 'gameover'].forEach(s => {
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== name);
  });
  const showHud = (name === 'playing' || name === 'transition');
  document.getElementById('hud').classList.toggle('hidden', !showHud);
}

// ── Balance Display ─────────────────────────────────────────
function updateMenuBalance() {
  const el = document.getElementById('menu-balance');
  if (el) el.textContent = `${balance.toLocaleString()} $STARS`;
}

function getLevelTime(lvl) {
  if (lvl <= 3) return BASE_LEVEL_TIME;
  return Math.min(BASE_LEVEL_TIME + (lvl - 3) * TIME_INCREMENT, MAX_LEVEL_TIME);
}

function updateHUD() {
  document.getElementById('hud-score').textContent = score.toLocaleString();
  document.getElementById('hud-level').textContent = level;
  const secs = Math.ceil(Math.max(0, levelTimer));
  document.getElementById('hud-timer').textContent = secs;
  const timerEl = document.getElementById('hud-timer');
  if (secs <= 10) {
    timerEl.style.color = 'var(--danger)';
    timerEl.style.textShadow = '0 0 12px rgba(255,63,85,0.8)';
  } else {
    timerEl.style.color = 'var(--accent-blue)';
    timerEl.style.textShadow = '0 0 12px rgba(77,143,255,0.7)';
  }
}

// ── Timer helpers ──────────────────────────────────────────
function initLevelTimer() {
  levelTimerMax = getLevelTime(level);
  levelTimer    = levelTimerMax;
}

// ── Game Flow ────────────────────────────────────────────────
function startGame() {
  if (balance < ENTRY_FEE) return;
  balance   -= ENTRY_FEE;
  displayBal = balance;
  score      = 0;
  level      = 1;
  hasShield       = false;
  permLaserActive = false;
  extraShots      = 0;
  speedBoostTime  = 0;
  powerUpDrops    = [];
  floatingTexts   = [];
  buildRocket();
  spawnLevel();
  initLevelTimer();
  gameState = 'playing';
  showScreen('playing');
  updateHUD();
}

function autoNextLevel() {
  level++;
  hasShield       = false;   // reset per-level
  permLaserActive = false;
  extraShots      = 0;
  speedBoostTime  = 0;
  powerUpDrops    = [];
  buildRocket();
  spawnLevel();
  initLevelTimer();
  gameState = 'playing';
  showScreen('playing');
  updateHUD();
}

function returnToMenu() {
  gameState = 'menu';
  planets   = [];
  lasers    = [];
  particles = [];
  powerUpDrops    = [];
  floatingTexts   = [];
  permLaserActive = false;
  extraShots      = 0;
  hasShield       = false;
  speedBoostTime  = 0;
  showScreen('menu');
  updateMenuBalance();
  document.getElementById('playBtn').disabled = balance < ENTRY_FEE;
}

function triggerGameOver() {
  gameState = 'gameover';
  lasers    = [];
  document.getElementById('final-score').textContent = score.toLocaleString();
  showScreen('gameover');
  document.getElementById('restartBtn').disabled = balance < ENTRY_FEE;
}

function triggerLevelClear() {
  // No STARS bonus — just score + progression
  gameState       = 'transition';
  lasers          = [];
  transitionTimer = TRANSITION_DURATION;
  showScreen('playing');  // keep HUD visible during transition
}

// ── Level / Planet Spawning ──────────────────────────────────
function spawnLevel() {
  planets   = [];
  lasers    = [];
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
  if (gameState !== 'playing') return;

  const maxShots = 1 + extraShots;

  // If at max capacity, evict the oldest permanent laser to make room
  if (lasers.length >= maxShots) {
    const permIdx = lasers.findIndex(l => l.permanent);
    if (permIdx !== -1) {
      lasers.splice(permIdx, 1);
    } else {
      return;   // all slots occupied by normal lasers — can't fire
    }
  }

  if (permLaserActive) {
    // Anchored beam from rocket position to ceiling
    lasers.push({ x: rocket.x, tipY: 0, permanent: true });
  } else {
    // Normal upward-moving laser
    lasers.push({ x: rocket.x, tipY: rocket.y - ROCKET_H / 2, permanent: false });
  }
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
    if (this.vy > 13) this.vy = 13;
    this.x     += this.vx * dt;
    this.y     += this.vy * dt;
    this.rot   += this.rotV * dt;
    this.pulse += 0.05 * dt;

    if (this.x - this.r < 0) {
      this.x  = this.r;
      this.vx = Math.abs(this.vx);
    } else if (this.x + this.r > W) {
      this.x  = W - this.r;
      this.vx = -Math.abs(this.vx);
    }

    const floor = H - GROUND_H;
    if (this.y + this.r >= floor) {
      this.y  = floor - this.r;
      this.vy = -Math.abs(this.vy);
      if (Math.abs(this.vy) < 2.5) this.vy = -2.5;
    }
  }

  split() {
    const cfg = SIZES[this.size];
    if (!cfg.next) return [];
    const ns  = cfg.next;
    const nc  = SIZES[ns];
    const spX = nc.speedX + (level - 1) * 0.12;
    const spY = nc.speedY + (level - 1) * 0.10;
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

    ctx.shadowBlur  = 22;
    ctx.shadowColor = this.pal.glow;

    const bg = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.08, 0, 0, r);
    bg.addColorStop(0,    this.pal.hi);
    bg.addColorStop(0.55, this.pal.lo);
    bg.addColorStop(1,    '#00001a');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.shadowBlur = 0;
    const hl = ctx.createRadialGradient(-r * 0.4, -r * 0.38, 0, -r * 0.3, -r * 0.3, r * 0.55);
    hl.addColorStop(0, 'rgba(255,255,255,0.38)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = hl;
    ctx.fill();

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

// ── PowerUp Class ───────────────────────────────────────────
class PowerUp {
  constructor(x, y, type) {
    this.x    = x;
    this.y    = y;
    this.type = type;
    this.vy   = -2;       // initial upward pop
    this.age  = 0;
    this.r    = POWERUP_RADIUS;

    const def   = POWERUP_DEFS.find(d => d.type === type);
    this.color  = def.color;
    this.glow   = def.glow;
    this.symbol = def.symbol;
  }

  update(dt) {
    this.vy += GRAVITY * 0.5 * dt;
    this.y  += this.vy * dt;
    this.age += dt;

    const floor = H - GROUND_H;
    if (this.y + this.r >= floor) {
      this.y  = floor - this.r;
      this.vy = -Math.abs(this.vy) * 0.5;
      if (Math.abs(this.vy) < 0.8) this.vy = 0;
    }

    // Expire after ~8 seconds (480 frames)
    return this.age < 480;
  }

  draw(ctx) {
    ctx.save();
    const pulse = 1 + Math.sin(this.age * 0.12) * 0.15;
    const r = this.r * pulse;

    // Outer glow
    ctx.shadowBlur  = 18;
    ctx.shadowColor = this.glow;

    // Circle background
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = this.color + '33';
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Symbol
    ctx.shadowBlur = 0;
    ctx.font       = `${Math.round(r * 1.1)}px sans-serif`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle  = '#fff';
    ctx.fillText(this.symbol, this.x, this.y + 1);

    ctx.restore();
  }
}

function pickPowerUpType() {
  const total = POWERUP_DEFS.reduce((s, d) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const d of POWERUP_DEFS) {
    r -= d.weight;
    if (r <= 0) return d.type;
  }
  return POWERUP_DEFS[0].type;
}

function maybeSpawnPowerUp(x, y) {
  if (Math.random() > POWERUP_DROP_CHANCE) return;
  powerUpDrops.push(new PowerUp(x, y, pickPowerUpType()));
}

function collectPowerUp(pu) {
  spawnParticles(pu.x, pu.y, pu.color, 8);

  switch (pu.type) {
    case 'time':
      levelTimer = Math.min(levelTimer + POWERUP_TIME_BONUS, levelTimerMax + 10);
      showFloatingText('+' + POWERUP_TIME_BONUS + 's', pu.color);
      break;
    case 'shield':
      hasShield = true;
      showFloatingText('SHIELD!', pu.color);
      break;
    case 'speed':
      speedBoostTime = SPEED_BOOST_SEC;
      showFloatingText('SPEED!', pu.color);
      break;
    case 'permLaser':
      permLaserActive = true;
      showFloatingText('PERM LASER!', pu.color);
      break;
    case 'extraShot':
      extraShots++;
      showFloatingText('+1 SHOT!', pu.color);
      break;
  }
}

// ── Floating Text ──────────────────────────────────────────
function showFloatingText(text, color) {
  floatingTexts.push({
    text, color,
    x: W / 2,
    y: H * 0.38,
    life: 1.0,
  });
}

function updateFloatingTexts(dt) {
  for (const ft of floatingTexts) {
    ft.life -= 0.018 * dt;
    ft.y    -= 0.6 * dt;
  }
  floatingTexts = floatingTexts.filter(ft => ft.life > 0);
}

function drawFloatingTexts() {
  for (const ft of floatingTexts) {
    ctx.save();
    ctx.globalAlpha = ft.life;
    ctx.font        = `bold 22px 'Orbitron', monospace`;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = ft.color;
    ctx.shadowBlur  = 14;
    ctx.shadowColor = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

// ── Mobile Controls ──────────────────────────────────────────
function setupMobile() {
  const btnL = document.getElementById('btn-left');
  const btnR = document.getElementById('btn-right');
  const btnF = document.getElementById('btn-fire');

  function press(side)   { if (side === 'L') mobileKeys.left  = true;  else mobileKeys.right = true;  }
  function release(side) { if (side === 'L') mobileKeys.left  = false; else mobileKeys.right = false; }

  btnL.addEventListener('touchstart', e => { e.preventDefault(); press('L');   btnL.classList.add('pressed'); },    { passive: false });
  btnL.addEventListener('touchend',   e => { e.preventDefault(); release('L'); btnL.classList.remove('pressed'); }, { passive: false });
  btnL.addEventListener('touchcancel',() => { release('L'); btnL.classList.remove('pressed'); });

  btnR.addEventListener('touchstart', e => { e.preventDefault(); press('R');   btnR.classList.add('pressed'); },    { passive: false });
  btnR.addEventListener('touchend',   e => { e.preventDefault(); release('R'); btnR.classList.remove('pressed'); }, { passive: false });
  btnR.addEventListener('touchcancel',() => { release('R'); btnR.classList.remove('pressed'); });

  btnF.addEventListener('touchstart', e => { e.preventDefault(); tryShoot(); btnF.classList.add('pressed'); },    { passive: false });
  btnF.addEventListener('touchend',   e => { e.preventDefault();             btnF.classList.remove('pressed'); }, { passive: false });

  btnL.addEventListener('mousedown', () => press('L'));
  btnL.addEventListener('mouseup',   () => release('L'));
  btnL.addEventListener('mouseleave',() => release('L'));
  btnR.addEventListener('mousedown', () => press('R'));
  btnR.addEventListener('mouseup',   () => release('R'));
  btnR.addEventListener('mouseleave',() => release('R'));
  btnF.addEventListener('mousedown', () => tryShoot());
}

// ── Collision Detection ───────────────────────────────────────
function checkLasers() {
  for (let li = lasers.length - 1; li >= 0; li--) {
    const las = lasers[li];
    let best = null, bestY = -Infinity;

    for (const p of planets) {
      const dx = Math.abs(p.x - las.x);
      if (dx > p.r + LASER_W) continue;
      if (las.tipY > p.y + p.r) continue;
      if (p.y > bestY) { bestY = p.y; best = p; }
    }

    if (best) {
      spawnParticles(best.x, best.y, best.pal.glow, 14);
      maybeSpawnPowerUp(best.x, best.y);
      const children = best.split();
      planets = planets.filter(p => p !== best);
      planets.push(...children);
      score += SIZES[best.size].score;
      lasers.splice(li, 1);
      flashTimer = 6;
      updateHUD();
    }
  }
}

function checkRocket() {
  const hw = ROCKET_W * 0.38;
  const hh = ROCKET_H * 0.42;

  for (const p of planets) {
    const cx = Math.max(rocket.x - hw, Math.min(p.x, rocket.x + hw));
    const cy = Math.max(rocket.y - hh, Math.min(p.y, rocket.y + hh));
    const d  = Math.hypot(p.x - cx, p.y - cy);
    if (d < p.r) {
      if (hasShield) {
        // Shield absorbs the hit
        hasShield = false;
        spawnParticles(rocket.x, rocket.y, '#4d8fff', 16);
        showFloatingText('SHIELD BROKEN!', '#4d8fff');
        // Also destroy the planet that hit us
        spawnParticles(p.x, p.y, p.pal.glow, 14);
        const children = p.split();
        planets = planets.filter(q => q !== p);
        planets.push(...children);
        score += SIZES[p.size].score;
        flashTimer = 6;
        updateHUD();
        return;
      }
      spawnParticles(rocket.x, rocket.y, '#4d8fff', 20);
      triggerGameOver();
      return;
    }
  }
}

function checkPowerUpCollection() {
  const hw = ROCKET_W * 0.5;
  const hh = ROCKET_H * 0.5;

  powerUpDrops = powerUpDrops.filter(pu => {
    const dx = Math.abs(pu.x - rocket.x);
    const dy = Math.abs(pu.y - rocket.y);
    if (dx < hw + pu.r && dy < hh + pu.r) {
      collectPowerUp(pu);
      return false;
    }
    return true;
  });
}


// ── Update ───────────────────────────────────────────────────
function update(dt, realSec) {
  // ── Timer countdown using real elapsed seconds (framerate-independent)
  levelTimer -= realSec;
  if (levelTimer <= 0) {
    levelTimer = 0;
    triggerGameOver();
    return;
  }

  // Move rocket
  const movingLeft  = keys['ArrowLeft']  || keys['KeyA'] || mobileKeys.left;
  const movingRight = keys['ArrowRight'] || keys['KeyD'] || mobileKeys.right;
  const speedMult   = speedBoostTime > 0 ? SPEED_BOOST_MULT : 1;

  if (movingLeft)  rocket.x -= ROCKET_SPEED * speedMult * dt;
  if (movingRight) rocket.x += ROCKET_SPEED * speedMult * dt;
  rocket.x = Math.max(ROCKET_W / 2, Math.min(W - ROCKET_W / 2, rocket.x));

  // Speed boost countdown (real seconds)
  if (speedBoostTime > 0) {
    speedBoostTime -= realSec;
    if (speedBoostTime < 0) speedBoostTime = 0;
  }

  // Move normal lasers; permanent lasers stay put
  lasers = lasers.filter(las => {
    if (las.permanent) return true;   // anchored — don't move, don't expire by position
    las.tipY -= LASER_SPEED * dt;
    return las.tipY >= 0;             // remove when it leaves the top
  });

  // Update planets
  for (const p of planets) p.update(dt);

  // Update particles
  particles = particles.filter(p => p.update(dt));

  // Update power-up drops
  powerUpDrops = powerUpDrops.filter(pu => pu.update(dt));

  // Update floating texts
  updateFloatingTexts(dt);

  // Check collisions
  checkLasers();
  if (gameState === 'playing') {
    checkRocket();
    checkPowerUpCollection();
  }

  // Animate balance counter
  if (Math.abs(displayBal - balance) > 0.5) {
    displayBal += (balance - displayBal) * 0.08 * dt;
  }

  // Flash timer
  if (flashTimer > 0) flashTimer -= dt;

  // Update HUD each frame for timer
  updateHUD();

  // Win condition
  if (gameState === 'playing' && planets.length === 0) {
    triggerLevelClear();
  }
}

// ── Draw ─────────────────────────────────────────────────────
function draw(ts) {
  ctx.clearRect(0, 0, W, H);

  drawBackground(ts);

  if (gameState === 'playing' || gameState === 'transition' || gameState === 'gameover') {
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
    for (const pu of powerUpDrops) pu.draw(ctx);
    for (const las of lasers) drawLaser(las);

    if (gameState === 'playing') {
      drawRocket();
      // Shield visual
      if (hasShield) drawShield();
      // Speed boost trail
      if (speedBoostTime > 0) drawSpeedTrail();
    }

    // Timer bar at top
    if (gameState === 'playing' || gameState === 'transition') drawTimerBar();

    // Floating texts
    drawFloatingTexts();

    // Transition overlay
    if (gameState === 'transition') drawTransition();
  }

  drawGround();
}

function drawBackground(ts) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,   '#04040e');
  bg.addColorStop(0.5, '#070718');
  bg.addColorStop(1,   '#0a0a20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  for (const s of bgStars) {
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

  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.strokeStyle = 'rgba(77,143,255,0.9)';
  ctx.lineWidth   = 1.5;
  ctx.shadowBlur  = 12;
  ctx.shadowColor = '#4d8fff';
  ctx.stroke();

  const gf = ctx.createLinearGradient(0, y, 0, H);
  gf.addColorStop(0, 'rgba(77,143,255,0.18)');
  gf.addColorStop(1, 'rgba(77,143,255,0.05)');
  ctx.fillStyle = gf;
  ctx.fillRect(0, y, W, GROUND_H);

  ctx.restore();
}

function drawLaser(las) {
  const x  = las.x;
  const y0 = las.tipY;
  const y1 = las.permanent ? (H - GROUND_H) : (rocket.y - ROCKET_H / 2);

  ctx.save();

  if (las.permanent) {
    // ── Permanent laser: wide cyan/magenta anchored beam ──
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.strokeStyle = 'rgba(255,63,85,0.18)';
    ctx.lineWidth   = 18;
    ctx.lineCap     = 'round';
    ctx.stroke();

    const pg = ctx.createLinearGradient(0, y0, 0, y1);
    pg.addColorStop(0,   '#ff3355');
    pg.addColorStop(0.5, '#ff6688');
    pg.addColorStop(1,   '#ff3355');

    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.strokeStyle = pg;
    ctx.lineWidth   = 5;
    ctx.shadowBlur  = 22;
    ctx.shadowColor = '#ff3355';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.strokeStyle = 'rgba(255,200,200,0.85)';
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 0;
    ctx.stroke();

    // Pulse glow at top and bottom
    for (const py of [y0 + 4, y1 - 4]) {
      ctx.beginPath();
      ctx.arc(x, py, 6, 0, Math.PI * 2);
      ctx.fillStyle   = '#ff6688';
      ctx.shadowBlur  = 24;
      ctx.shadowColor = '#ff0033';
      ctx.fill();
    }
  } else {
    // ── Normal laser (original style) ──
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.strokeStyle = 'rgba(255,80,80,0.25)';
    ctx.lineWidth   = 14;
    ctx.lineCap     = 'round';
    ctx.stroke();

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

    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.strokeStyle = 'rgba(255,220,220,0.9)';
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 0;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y0, 5, 0, Math.PI * 2);
    ctx.fillStyle   = '#ff6666';
    ctx.shadowBlur  = 20;
    ctx.shadowColor = '#ff0000';
    ctx.fill();
  }

  ctx.restore();
}

function drawRocket() {
  const x  = rocket.x;
  const y  = rocket.y;
  const hw = ROCKET_W / 2;
  const hh = ROCKET_H / 2;

  ctx.save();
  ctx.translate(x, y);

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

  const body = ctx.createLinearGradient(-hw, 0, hw, 0);
  body.addColorStop(0,   '#12203a');
  body.addColorStop(0.3, '#2a4a7a');
  body.addColorStop(0.5, '#3a6aaa');
  body.addColorStop(0.7, '#2a4a7a');
  body.addColorStop(1,   '#12203a');

  ctx.shadowBlur  = 14;
  ctx.shadowColor = '#4d8fff';

  ctx.beginPath();
  ctx.moveTo(0,           -hh);
  ctx.lineTo(hw * 0.42,   hh * 0.15);
  ctx.lineTo(hw * 0.52,   hh * 0.35);
  ctx.lineTo(hw * 0.32,   hh * 0.5);
  ctx.lineTo(-hw * 0.32,  hh * 0.5);
  ctx.lineTo(-hw * 0.52,  hh * 0.35);
  ctx.lineTo(-hw * 0.42,  hh * 0.15);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-hw * 0.12, -hh * 0.7);
  ctx.lineTo(hw * 0.12,  -hh * 0.7);
  ctx.lineTo(hw * 0.22,   hh * 0.1);
  ctx.lineTo(-hw * 0.22,  hh * 0.1);
  ctx.closePath();
  ctx.fillStyle  = 'rgba(77,143,255,0.22)';
  ctx.shadowBlur = 0;
  ctx.fill();

  ctx.shadowBlur  = 8;
  ctx.shadowColor = '#88ccff';
  const win = ctx.createRadialGradient(-hw * 0.06, -hh * 0.28, 0, 0, -hh * 0.22, hw * 0.16);
  win.addColorStop(0, '#aaddff');
  win.addColorStop(1, '#114488');
  ctx.beginPath();
  ctx.ellipse(0, -hh * 0.2, hw * 0.17, hw * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = win;
  ctx.fill();

  ctx.restore();
}

// ── New Drawing Functions ────────────────────────────────────

function drawTimerBar() {
  const barH   = 4;
  const barY   = 0;
  const ratio  = Math.max(0, levelTimer / levelTimerMax);

  // Background
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, barY, W, barH);

  // Fill
  let barColor;
  if (ratio > 0.4)      barColor = '#4d8fff';
  else if (ratio > 0.2) barColor = '#ffcc00';
  else                   barColor = '#ff3f55';

  ctx.fillStyle   = barColor;
  ctx.shadowBlur  = 8;
  ctx.shadowColor = barColor;
  ctx.fillRect(0, barY, W * ratio, barH);

  // Pulsing effect when low
  if (ratio <= 0.2) {
    ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.3;
    ctx.fillStyle   = '#ff3f55';
    ctx.fillRect(0, barY, W * ratio, barH);
  }

  ctx.restore();
}

function drawShield() {
  ctx.save();
  ctx.translate(rocket.x, rocket.y);

  const r = ROCKET_H * 0.55;
  const pulse = 1 + Math.sin(Date.now() * 0.006) * 0.08;

  ctx.beginPath();
  ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(77,143,255,0.5)';
  ctx.lineWidth   = 3;
  ctx.shadowBlur  = 16;
  ctx.shadowColor = '#4d8fff';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r * pulse + 3, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(77,143,255,0.15)';
  ctx.lineWidth   = 6;
  ctx.shadowBlur  = 0;
  ctx.stroke();

  ctx.restore();
}

function drawSpeedTrail() {
  ctx.save();
  const x = rocket.x;
  const y = rocket.y + ROCKET_H * 0.3;

  for (let i = 0; i < 3; i++) {
    const offsetX = (Math.random() - 0.5) * 10;
    const offsetY = Math.random() * 12;
    ctx.globalAlpha = 0.15 + Math.random() * 0.15;
    ctx.fillStyle   = '#ffcc00';
    ctx.beginPath();
    ctx.arc(x + offsetX, y + offsetY, 2 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}


function drawTransition() {
  const progress = 1 - (transitionTimer / TRANSITION_DURATION);
  ctx.save();

  // Semi-transparent overlay
  ctx.globalAlpha = 0.6;
  ctx.fillStyle   = 'rgba(4,4,14,0.7)';
  ctx.fillRect(0, 0, W, H);

  // Text
  ctx.globalAlpha = 1;
  const scale = 0.5 + Math.min(progress * 3, 1) * 0.5;

  ctx.font      = `900 ${Math.round(38 * scale)}px 'Orbitron', monospace`;
  ctx.textAlign  = 'center';
  ctx.fillStyle  = '#00e87a';
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#00e87a';
  ctx.fillText('LEVEL ' + level + ' CLEAR!', W / 2, H * 0.42);

  // Sub text
  ctx.font      = `600 ${Math.round(16 * scale)}px 'Orbitron', monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.shadowBlur = 0;
  ctx.fillText('Next level starting...', W / 2, H * 0.42 + 44);

  ctx.restore();
}

// ── Main Loop ────────────────────────────────────────────────
function loop(ts) {
  const elapsedMs = ts - lastTime;            // real milliseconds since last frame
  const rawDt     = elapsedMs / 16.667;       // normalised to 60-fps frame units
  const dt        = Math.min(rawDt, 4);       // cap to avoid spiral-of-death
  const realSec   = Math.min(elapsedMs / 1000, 0.25); // real seconds, capped at 250 ms
  lastTime        = ts;

  if (gameState === 'playing') {
    update(dt, realSec);
  } else if (gameState === 'transition') {
    // Count down transition timer
    transitionTimer -= dt;
    particles = particles.filter(p => p.update(dt));
    updateFloatingTexts(dt);
    if (flashTimer > 0) flashTimer -= dt;

    if (transitionTimer <= 0) {
      autoNextLevel();
    }
  } else {
    // Still animate particles + stars even on overlay screens
    particles = particles.filter(p => p.update(dt));
    if (flashTimer > 0) flashTimer -= dt;
  }

  draw(ts);
  animId = requestAnimationFrame(loop);
}
