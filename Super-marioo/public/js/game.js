/** @typedef {{ x:number,y:number,w:number,h:number,vx:number,vy:number,dead?:boolean,dir:number,onGround?:boolean }} Goomba */

const TILE_PX = 32;
const VIEW_W = 1280;
const VIEW_H = 720;
const GRAVITY = 2200;
const MOVE = 280;
const JUMP = -580;
const MAX_FALL = 900;
const COYOTE_MS = 90;
const JUMP_BUF_MS = 120;
const LEVELS_PER_RUN = 3;

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || /** @type {typeof AudioContext} */ (window).webkitAudioContext)();
  return audioCtx;
}

function resumeSounds() {
  const a = ensureAudio();
  if (a.state === "suspended") void a.resume();
}

function beep(freq, t0, dur, type = "square", vol = 0.07) {
  const a = ensureAudio();
  if (a.state === "suspended") return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + t0);
  o.connect(g);
  g.connect(a.destination);
  const t = a.currentTime + t0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const Sound = {
  jump() {
    beep(300, 0, 0.05, "square", 0.08);
    beep(450, 0.04, 0.07, "square", 0.05);
  },
  coin() {
    beep(1318, 0, 0.06, "square", 0.07);
    beep(1640, 0.06, 0.1, "square", 0.06);
  },
  stomp() {
    beep(120, 0, 0.14, "triangle", 0.11);
  },
  hurt() {
    beep(150, 0, 0.12, "sawtooth", 0.07);
    beep(95, 0.1, 0.18, "sawtooth", 0.06);
  },
  brick() {
    beep(180, 0, 0.04, "square", 0.06);
    beep(90, 0.04, 0.1, "square", 0.05);
  },
  levelUp() {
    [523, 659, 784, 988].forEach((f, i) => beep(f, i * 0.08, 0.11, "square", 0.055));
  },
  fanfare() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => beep(f, i * 0.1, 0.16, "square", 0.055));
  },
};

const LEVEL_COL_W = 96;

const MAP_SKIES = [
  { top: "#6ec5ff", mid: "#9fd9ff", bot: "#7ecf7a" },
  { top: "#5b8cff", mid: "#ffc266", bot: "#ff7a5c" },
  { top: "#2a3d5c", mid: "#4a6088", bot: "#151d2e" },
];

const MAP_DEFS = [
  {
    id: "plains",
    name: "Mushroom Plains",
    blurb: "Classic: one ?-brick tower, brick run, two goombas, spaced pipes to the flag.",
    lines: [
      "................................................................................................",
      "................................................................................................",
      "................................................................................................",
      "..........................................................?B?...................................",
      "..................................................B?B?BBBB......................................",
      "..........................................G...................G.................................",
      "..................................PP................PP................PP........................",
      "..........................PP......PP......PP........PP......PP........PP......F.................",
      "##################SS############################################################SS##############",
    ],
  },
  {
    id: "skyway",
    name: "Brick Skyway",
    blurb: "Different from plains: four coin pairs in a row, a wide brick deck plus ?-blocks, then tighter pipe pairs.",
    lines: [
      "................................................................................................",
      "................................................................................................",
      "................................................................................................",
      "..............................................??..??..??..??....................................",
      "..........................................BBBB..........B?B?B...................................",
      "..........................................G...................G.................................",
      "........................PP....PP..........PP....PP..........PP....PP............................",
      "................PP......PP......PP......PP......PP......PP......PP......F.......................",
      "##################SS############################################################SS##############",
    ],
  },
  {
    id: "pipes",
    name: "Pipe Garden",
    blurb: "Different from plains: coin bursts beside ?-block, short brick gap, then a long pipe chain before the flag.",
    lines: [
      "................................................................................................",
      "................................................................................................",
      "................................................................................................",
      "....................................??..........?B?..........??.................................",
      "............................................B?B?................................................",
      "..........................................G...................G.................................",
      "....................PP..PP..PP..PP..PP..PP..PP..PP..PP..........................................",
      "........PP..PP..PP..PP..PP..PP..PP..PP..PP..PP..PP..F...........................................",
      "##################SS############################################################SS##############",
    ],
  },
];

const AVATARS = [
  { id: "scarlet", name: "Scarlet hero", shirt: "#e52521", overalls: "#2c6cf0", skin: "#ffcc99" },
  { id: "forest", name: "Forest plumber", shirt: "#2d8f47", overalls: "#1e3a5f", skin: "#e8c4a8" },
  { id: "royal", name: "Royal jumper", shirt: "#7c3aed", overalls: "#d97706", skin: "#fde68a" },
];

const LS_MAP = "spr_map";
const LS_AVATAR = "spr_avatar";

function normalizeLevel(lines) {
  return lines.map((r) => r.padEnd(LEVEL_COL_W, ".").slice(0, LEVEL_COL_W));
}

/** @type {string[]} */
let INITIAL_GRID = [];
/** @type {string[]} */
let GRID = [];
let COLS = LEVEL_COL_W;
let ROWS = 9;
let WORLD_W = COLS * TILE_PX;
let WORLD_H = ROWS * TILE_PX;

/** @type {{tx:number,ty:number}[]} */
let spawns = [];
/** @type {{tx:number,ty:number}[]} */
let flags = [];
/** @type {Goomba[]} */
let goombas = [];

function parseWorld() {
  spawns = [];
  flags = [];
  goombas = [];
  for (let ty = 0; ty < ROWS; ty++) {
    const row = GRID[ty];
    for (let tx = 0; tx < COLS; tx++) {
      const ch = row[tx];
      if (ch === "S") spawns.push({ tx, ty });
      if (ch === "F") flags.push({ tx, ty });
      if (ch === "G") {
        goombas.push({
          x: tx * TILE_PX + 2,
          y: ty * TILE_PX,
          w: 26,
          h: 26,
          vx: 70,
          vy: 0,
          dir: 1,
          dead: false,
        });
      }
    }
  }
  if (!spawns.length) spawns.push({ tx: 3, ty: ROWS - 2 });
}

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
const ctx = canvas.getContext("2d");

const hudScore = document.getElementById("score");
const hudCoins = document.getElementById("coins");
const hudLives = document.getElementById("livesHearts");
const hudLevel = document.getElementById("hudLevel");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const btnPrimary = document.getElementById("btnPrimary");
const btnSecondary = document.getElementById("btnSecondary");
const btnMenu = document.getElementById("btnMenu");
const lbEl = document.getElementById("leaderboard");
const lbErr = document.getElementById("lbError");
const screenLanding = document.getElementById("screen-landing");
const screenMap = document.getElementById("screen-map");
const screenAvatar = document.getElementById("screen-avatar");
const screenGame = document.getElementById("screen-game");
const btnPlay = document.getElementById("btnPlay");
const btnMaps = document.getElementById("btnMaps");
const btnAvatars = document.getElementById("btnAvatars");
const btnMapBack = document.getElementById("btnMapBack");
const btnAvatarBack = document.getElementById("btnAvatarBack");
const mapPickGrid = document.getElementById("mapPickGrid");
const avatarPickGrid = document.getElementById("avatarPickGrid");
const landingHint = document.getElementById("landingSelectionHint");
const gameMapLabel = document.getElementById("gameMapLabel");
const btnTopMenu = document.getElementById("btnTopMenu");
const avatarShowcase = /** @type {HTMLCanvasElement} */ (document.getElementById("avatarShowcase"));
const avatarShowcaseCaption = document.getElementById("avatarShowcaseCaption");

const keys = new Set();

function tileAt(tx, ty) {
  if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return "#";
  return GRID[ty][tx];
}

function setTile(tx, ty, ch) {
  if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return;
  const row = GRID[ty];
  GRID[ty] = row.slice(0, tx) + ch + row.slice(tx + 1);
}

function solidChar(ch) {
  return ch === "#" || ch === "B" || ch === "?" || ch === "x" || ch === "P";
}

function rectTiles(rx, ry, rw, rh) {
  const x0 = Math.floor(rx / TILE_PX);
  const y0 = Math.floor(ry / TILE_PX);
  const x1 = Math.floor((rx + rw - 1) / TILE_PX);
  const y1 = Math.floor((ry + rh - 1) / TILE_PX);
  return { x0, y0, x1, y1 };
}

const player = {
  x: 0,
  y: 0,
  w: 22,
  h: 28,
  vx: 0,
  vy: 0,
  onGround: false,
  facing: 1,
  coyote: 0,
  jumpBuf: 0,
  iframes: 0,
};

let selectedMapIndex = 0;
let activeMapIndex = 0;
let campaignSlot = 0;
let selectedAvatarIndex = 0;
let gameActive = false;

let camX = 0;
let score = 0;
let coins = 0;
let lives = 3;
let won = false;
let paused = false;
let lastTs = 0;
let raf = 0;
let hurtPopupTimer = 0;

function resetPlayerToSpawn() {
  const s = spawns[0];
  player.x = s.tx * TILE_PX + 4;
  player.y = (s.ty - 1) * TILE_PX;
  player.vx = 0;
  player.vy = 0;
  player.iframes = 1.2;
}

function resetLevelEntities() {
  GRID = INITIAL_GRID.map((r) => r);
  parseWorld();
  won = false;
  camX = 0;
  resetPlayerToSpawn();
}

function applyMap(index) {
  const i = Math.max(0, Math.min(MAP_DEFS.length - 1, index | 0));
  activeMapIndex = i;
  const def = MAP_DEFS[i];
  const stageRoot = document.getElementById("gameStage");
  if (stageRoot) {
    for (const m of MAP_DEFS) {
      stageRoot.classList.remove(`stage--${m.id}`);
    }
    stageRoot.classList.add(`stage--${def.id}`);
  }
  INITIAL_GRID = normalizeLevel(def.lines);
  ROWS = INITIAL_GRID.length;
  COLS = LEVEL_COL_W;
  WORLD_W = COLS * TILE_PX;
  WORLD_H = ROWS * TILE_PX;
  GRID = INITIAL_GRID.map((r) => r);
  parseWorld();
  resetPlayerToSpawn();
  camX = 0;
}

function campaignMapIndices() {
  const n = MAP_DEFS.length;
  return [selectedMapIndex % n, (selectedMapIndex + 1) % n, (selectedMapIndex + 2) % n];
}

function updateGameHeader() {
  gameMapLabel.textContent = MAP_DEFS[activeMapIndex]?.name ?? "";
  if (hudLevel) hudLevel.textContent = `${campaignSlot + 1} / ${LEVELS_PER_RUN}`;
}

function showLevelAdvanceOverlay() {
  paused = true;
  Sound.levelUp();
  const name = MAP_DEFS[activeMapIndex]?.name ?? "";
  showOverlay(
    `Level ${campaignSlot + 1} / ${LEVELS_PER_RUN}`,
    `Next stage: ${name}`,
    "Continue",
    "",
    () => {
      paused = false;
      hideOverlay();
    },
    async () => {},
    { hideSecondary: true, hideMenu: true }
  );
}

function showOverlay(title, text, primary, secondary, onPrimary, onSecondary, menuOptions) {
  overlay.hidden = false;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  btnPrimary.textContent = primary;
  btnSecondary.textContent = secondary;
  btnPrimary.onclick = onPrimary;
  btnSecondary.onclick = onSecondary;
  btnSecondary.hidden = !!menuOptions?.hideSecondary;

  const showMenuBtn = !!(menuOptions?.show && !menuOptions?.hideMenu);
  if (showMenuBtn) {
    btnMenu.hidden = false;
    btnMenu.textContent = menuOptions.label || "Main menu";
    btnMenu.onclick = menuOptions.onClick;
  } else {
    btnMenu.hidden = true;
    btnMenu.onclick = null;
  }
}

function hideOverlay() {
  overlay.hidden = true;
  btnMenu.hidden = true;
  btnMenu.onclick = null;
  btnSecondary.hidden = false;
}

function showScreen(which) {
  screenLanding.hidden = which !== "landing";
  screenMap.hidden = which !== "map";
  screenAvatar.hidden = which !== "avatar";
  screenGame.hidden = which !== "game";
}

function goToMainMenu() {
  const hp = document.getElementById("hurtPopup");
  if (hp) hp.hidden = true;
  clearTimeout(hurtPopupTimer);
  paused = false;
  won = false;
  hideOverlay();
  keys.clear();
  gameActive = false;
  showScreen("landing");
  updateLandingHint();
}

function updateLandingHint() {
  const m = MAP_DEFS[selectedMapIndex]?.name ?? "";
  const a = AVATARS[selectedAvatarIndex]?.name ?? "";
  landingHint.textContent = `3-level run starts on: ${m} · Hero: ${a}`;
}

function minimapColor(ch) {
  if (ch === "#") return "#5a4324";
  if (ch === "B" || ch === "x") return "#a85a18";
  if (ch === "?") return "#c9a012";
  if (ch === "P") return "#0d6e38";
  if (ch === "F") return "#e52521";
  if (ch === "S") return "#4ade80";
  if (ch === "G") return "#7b4a32";
  return "#87ceeb";
}

function paintMinimap(ctx, cw, ch, grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const tw = cw / cols;
  const th = ch / rows;
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = "#7ec8ff";
  ctx.fillRect(0, 0, cw, ch);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const cell = grid[ty][tx];
      if (cell === ".") continue;
      ctx.fillStyle = minimapColor(cell);
      ctx.fillRect(tx * tw, ty * th, Math.ceil(tw) + 0.5, Math.ceil(th) + 0.5);
    }
  }
}

function renderMapGrid() {
  mapPickGrid.innerHTML = "";
  MAP_DEFS.forEach((m, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick-card map-pick-card" + (i === selectedMapIndex ? " selected" : "");
    const grid = normalizeLevel(m.lines);
    const prev = document.createElement("canvas");
    prev.className = "map-preview-canvas";
    prev.width = 288;
    prev.height = 54;
    prev.setAttribute("aria-hidden", "true");
    paintMinimap(prev.getContext("2d"), prev.width, prev.height, grid);
    const cap = document.createElement("div");
    cap.className = "map-pick-body";
    const h = document.createElement("h3");
    h.textContent = m.name;
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = m.blurb;
    cap.appendChild(h);
    cap.appendChild(p);
    b.appendChild(prev);
    b.appendChild(cap);
    b.addEventListener("click", () => {
      selectedMapIndex = i;
      localStorage.setItem(LS_MAP, String(i));
      renderMapGrid();
      updateLandingHint();
    });
    mapPickGrid.appendChild(b);
  });
}

function paintAvatarShowcase() {
  if (!avatarShowcase) return;
  const sc = avatarShowcase.getContext("2d");
  if (!sc) return;
  sc.imageSmoothingEnabled = false;
  sc.clearRect(0, 0, avatarShowcase.width, avatarShowcase.height);
  sc.fillStyle = "#121a28";
  sc.fillRect(0, 0, avatarShowcase.width, avatarShowcase.height);
  const pal = AVATARS[selectedAvatarIndex] ?? AVATARS[0];
  const scale = 6;
  const ox = (avatarShowcase.width - 22 * scale) / 2;
  const oy = (avatarShowcase.height - 28 * scale) / 2 + 6;
  drawPlumberFigure(sc, ox, oy, scale, pal, 1);
  if (avatarShowcaseCaption) {
    avatarShowcaseCaption.textContent = pal.name;
  }
}

function renderAvatarGrid() {
  avatarPickGrid.innerHTML = "";
  AVATARS.forEach((av, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick-card avatar-pick-card" + (i === selectedAvatarIndex ? " selected" : "");
    const mini = document.createElement("canvas");
    mini.className = "avatar-mini-canvas";
    mini.width = 44;
    mini.height = 56;
    mini.setAttribute("aria-hidden", "true");
    const mctx = mini.getContext("2d");
    if (mctx) drawPlumberFigure(mctx, 0, 4, 2, av, 1);
    const cap = document.createElement("div");
    cap.className = "avatar-pick-body";
    const h = document.createElement("h3");
    h.textContent = av.name;
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = "Cap, overalls, and mustache.";
    cap.appendChild(h);
    cap.appendChild(p);
    b.appendChild(mini);
    b.appendChild(cap);
    b.addEventListener("click", () => {
      selectedAvatarIndex = i;
      localStorage.setItem(LS_AVATAR, String(i));
      renderAvatarGrid();
      updateLandingHint();
      paintAvatarShowcase();
    });
    avatarPickGrid.appendChild(b);
  });
  paintAvatarShowcase();
}

function startGame() {
  resumeSounds();
  keys.clear();
  campaignSlot = 0;
  applyMap(campaignMapIndices()[0]);
  score = 0;
  coins = 0;
  lives = 3;
  won = false;
  paused = false;
  gameActive = true;
  updateGameHeader();
  renderLivesHearts();
  showScreen("game");
}

function pauseGame() {
  if (!gameActive) return;
  if (!overlay.hidden) return;
  paused = true;
  showOverlay(
    "Paused",
    "Take a break. Resume when you are ready.",
    "Resume",
    "Leaderboard",
    () => {
      paused = false;
      hideOverlay();
    },
    async () => {
      await refreshLeaderboard();
    },
    {
      show: true,
      label: "Main menu",
      onClick: () => {
        if (!window.confirm("Return to the main menu? This run will end.")) return;
        paused = false;
        hideOverlay();
        goToMainMenu();
      },
    }
  );
}

function gameOverFlow() {
  paused = true;
  showOverlay(
    "Game over",
    "No lives left. Your score was " + score + ".",
    "Play again",
    "Submit score",
    () => {
      lives = 3;
      score = 0;
      coins = 0;
      campaignSlot = 0;
      applyMap(campaignMapIndices()[0]);
      won = false;
      paused = false;
      hideOverlay();
      updateGameHeader();
      renderLivesHearts();
    },
    async () => {
      const name = window.prompt("Name for leaderboard (max 24 chars):", "Player") || "Player";
      await submitScore(name, score);
      await refreshLeaderboard();
    },
    {
      show: true,
      label: "Main menu",
      onClick: () => {
        paused = false;
        hideOverlay();
        goToMainMenu();
      },
    }
  );
}

function winFlow() {
  paused = true;
  const bonus = 1000;
  score += bonus;
  showOverlay(
    "All 3 levels cleared!",
    `You finished the whole run. Bonus +${bonus}. Final score: ${score}.`,
    "Play again",
    "Submit score",
    () => {
      score = 0;
      coins = 0;
      lives = 3;
      campaignSlot = 0;
      applyMap(campaignMapIndices()[0]);
      won = false;
      paused = false;
      hideOverlay();
      updateGameHeader();
      renderLivesHearts();
    },
    async () => {
      const name = window.prompt("Name for leaderboard (max 24 chars):", "Player") || "Player";
      await submitScore(name, score);
      await refreshLeaderboard();
    },
    {
      show: true,
      label: "Main menu",
      onClick: () => {
        paused = false;
        hideOverlay();
        goToMainMenu();
      },
    }
  );
}

function hurtPlayer() {
  if (player.iframes > 0 || won) return;
  Sound.hurt();
  lives -= 1;
  renderLivesHearts();
  if (lives <= 0) {
    gameOverFlow();
    return;
  }
  showHurtLifePopup();
  player.iframes = 2;
  resetPlayerToSpawn();
}

function resolveAxisX(dt) {
  player.x += player.vx * dt;
  let { x0, y0, x1, y1 } = rectTiles(player.x, player.y, player.w, player.h);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const ch = tileAt(tx, ty);
      if (!solidChar(ch) || ch === "S") continue;
      const bx = tx * TILE_PX;
      const bw = TILE_PX;
      if (player.x + player.w > bx && player.x < bx + bw) {
        if (player.vx > 0) player.x = bx - player.w - 0.01;
        else if (player.vx < 0) player.x = bx + bw + 0.01;
        player.vx = 0;
        ({ x0, y0, x1, y1 } = rectTiles(player.x, player.y, player.w, player.h));
      }
    }
  }
}

function bumpBlock(tx, ty) {
  const ch = tileAt(tx, ty);
  if (ch === "?") {
    coins += 1;
    score += 200;
    setTile(tx, ty, "x");
    Sound.coin();
  } else if (ch === "B") {
    setTile(tx, ty, ".");
    score += 50;
    Sound.brick();
  }
}

function resolveAxisY(dt) {
  player.y += player.vy * dt;
  player.onGround = false;
  let landed = false;
  let { x0, y0, x1, y1 } = rectTiles(player.x, player.y, player.w, player.h);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const ch = tileAt(tx, ty);
      if (!solidChar(ch) || ch === "S") continue;
      const bx = tx * TILE_PX;
      const by = ty * TILE_PX;
      const bw = TILE_PX;
      const bh = TILE_PX;
      if (player.x + player.w > bx && player.x < bx + bw && player.y + player.h > by && player.y < by + bh) {
        if (player.vy > 0) {
          player.y = by - player.h - 0.01;
          player.vy = 0;
          player.onGround = true;
          landed = true;
        } else if (player.vy < 0) {
          player.y = by + bh + 0.01;
          player.vy = 0;
          bumpBlock(tx, ty);
        }
        ({ x0, y0, x1, y1 } = rectTiles(player.x, player.y, player.w, player.h));
      }
    }
  }
  if (landed) {
    player.coyote = COYOTE_MS / 1000;
  } else {
    player.coyote = Math.max(0, player.coyote - dt);
  }
}

function updatePlayer(dt) {
  let ax = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) {
    ax -= 1;
    player.facing = -1;
  }
  if (keys.has("ArrowRight") || keys.has("KeyD")) {
    ax += 1;
    player.facing = 1;
  }
  player.vx = ax * MOVE;
  if (keys.has("ArrowUp") || keys.has("KeyW") || keys.has("Space")) {
    player.jumpBuf = JUMP_BUF_MS / 1000;
  } else {
    player.jumpBuf = Math.max(0, player.jumpBuf - dt);
  }

  const canJump = player.onGround || player.coyote > 0;
  if (player.jumpBuf > 0 && canJump) {
    player.vy = JUMP;
    player.jumpBuf = 0;
    player.coyote = 0;
    player.onGround = false;
    Sound.jump();
  }

  player.vy += GRAVITY * dt;
  player.vy = Math.min(player.vy, MAX_FALL);

  resolveAxisX(dt);
  resolveAxisY(dt);

  if (player.iframes > 0) player.iframes -= dt;

  if (player.y > WORLD_H + 200) {
    hurtPlayer();
  }

  for (const f of flags) {
    const fx = f.tx * TILE_PX;
    const fy = f.ty * TILE_PX;
    if (
      player.x + player.w > fx + 4 &&
      player.x < fx + TILE_PX - 4 &&
      player.y + player.h > fy &&
      player.y < fy + TILE_PX * 3
    ) {
      if (!won) {
        if (campaignSlot < LEVELS_PER_RUN - 1) {
          campaignSlot++;
          score += 500;
          applyMap(campaignMapIndices()[campaignSlot]);
          updateGameHeader();
          showLevelAdvanceOverlay();
        } else {
          won = true;
          Sound.fanfare();
          winFlow();
        }
      }
    }
  }
}

function updateGoombas(dt) {
  for (const g of goombas) {
    if (g.dead) continue;
    g.x += g.vx * dt;
    g.vy += GRAVITY * dt;
    g.vy = Math.min(g.vy, MAX_FALL);
    g.y += g.vy * dt;

    let gx0 = Math.floor(g.x / TILE_PX);
    let gy0 = Math.floor(g.y / TILE_PX);
    let gx1 = Math.floor((g.x + g.w - 1) / TILE_PX);
    let gy1 = Math.floor((g.y + g.h - 1) / TILE_PX);
    g.onGround = false;

    for (let ty = gy0; ty <= gy1; ty++) {
      for (let tx = gx0; tx <= gx1; tx++) {
        const ch = tileAt(tx, ty);
        if (!solidChar(ch) || ch === "S") continue;
        const bx = tx * TILE_PX;
        const by = ty * TILE_PX;
        if (g.x + g.w > bx && g.x < bx + TILE_PX && g.y + g.h > by && g.y < by + TILE_PX) {
          if (g.vy > 0 && g.y + g.h - g.vy * dt <= by + 2) {
            g.y = by - g.h - 0.01;
            g.vy = 0;
            g.onGround = true;
          } else {
            g.vx *= -1;
            g.x += Math.sign(g.vx) * 2;
          }
          gx0 = Math.floor(g.x / TILE_PX);
          gy0 = Math.floor(g.y / TILE_PX);
          gx1 = Math.floor((g.x + g.w - 1) / TILE_PX);
          gy1 = Math.floor((g.y + g.h - 1) / TILE_PX);
        }
      }
    }

    const overlapX = Math.min(player.x + player.w, g.x + g.w) - Math.max(player.x, g.x);
    const overlapY = Math.min(player.y + player.h, g.y + g.h) - Math.max(player.y, g.y);
    if (overlapX > 2 && overlapY > 2 && !won) {
      const stomp = player.vy > 80 && player.y + player.h < g.y + g.h * 0.55;
      if (stomp) {
        g.dead = true;
        player.vy = JUMP * 0.45;
        score += 100;
        Sound.stomp();
      } else if (player.iframes <= 0) {
        hurtPlayer();
      }
    }
  }
}

function updateCamera() {
  const target = player.x + player.w / 2 - VIEW_W / 2;
  camX = Math.max(0, Math.min(target, WORLD_W - VIEW_W));
}

function drawTile(tx, ty, ch) {
  const x = tx * TILE_PX - camX;
  const y = ty * TILE_PX;
  if (x + TILE_PX < 0 || x > VIEW_W || y + TILE_PX < 0 || y > VIEW_H) return;

  if (ch === "." || ch === "S" || ch === "G") {
    return;
  }
  if (ch === "#") {
    ctx.fillStyle = "#6b4f2a";
    ctx.fillRect(x, y, TILE_PX, TILE_PX);
    ctx.fillStyle = "#c49a6c";
    ctx.fillRect(x, y, TILE_PX, 6);
    return;
  }
  if (ch === "B" || ch === "x") {
    ctx.fillStyle = ch === "B" ? "#c84c0c" : "#7a5230";
    ctx.strokeStyle = "#3b2414";
    ctx.lineWidth = 2;
    ctx.fillRect(x + 2, y + 2, TILE_PX - 4, TILE_PX - 4);
    ctx.strokeRect(x + 2, y + 2, TILE_PX - 4, TILE_PX - 4);
    return;
  }
  if (ch === "?") {
    ctx.fillStyle = "#d4a017";
    ctx.strokeStyle = "#7a5200";
    ctx.lineWidth = 2;
    ctx.fillRect(x + 2, y + 2, TILE_PX - 4, TILE_PX - 4);
    ctx.strokeRect(x + 2, y + 2, TILE_PX - 4, TILE_PX - 4);
    ctx.fillStyle = "#5a3b00";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", x + TILE_PX / 2, y + TILE_PX / 2 + 1);
    return;
  }
  if (ch === "P") {
    ctx.fillStyle = "#0d7a3a";
    ctx.fillRect(x + 4, y, TILE_PX - 8, TILE_PX);
    ctx.fillStyle = "#12a652";
    ctx.fillRect(x + 6, y + 4, TILE_PX - 12, TILE_PX - 8);
    return;
  }
  if (ch === "F") {
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(x + TILE_PX / 2 - 3, y - TILE_PX * 2, 6, TILE_PX * 3);
    ctx.fillStyle = "#e52521";
    ctx.beginPath();
    ctx.moveTo(x + TILE_PX / 2 + 4, y - TILE_PX * 2 + 4);
    ctx.lineTo(x + TILE_PX / 2 + 22, y - TILE_PX * 2 + 14);
    ctx.lineTo(x + TILE_PX / 2 + 4, y - TILE_PX * 2 + 24);
    ctx.closePath();
    ctx.fill();
  }
}

function showHurtLifePopup() {
  const root = document.getElementById("hurtPopup");
  const heart = root?.querySelector(".hurt-popup__heart--anim");
  const txt = root?.querySelector(".hurt-popup__text");
  if (!root || !heart) return;
  root.hidden = false;
  heart.style.animation = "none";
  void heart.offsetWidth;
  heart.style.animation = "";
  if (txt) {
    txt.style.animation = "none";
    void txt.offsetWidth;
    txt.style.animation = "";
  }
  clearTimeout(hurtPopupTimer);
  hurtPopupTimer = window.setTimeout(() => {
    root.hidden = true;
  }, 1000);
}

function renderLivesHearts() {
  if (!hudLives) return;
  hudLives.innerHTML = "";
  const maxSlots = 3;
  for (let i = 0; i < maxSlots; i++) {
    const span = document.createElement("span");
    span.className = "heart " + (i < lives ? "heart--full" : "heart--empty");
    span.textContent = "\u2665";
    span.setAttribute("aria-hidden", "true");
    hudLives.appendChild(span);
  }
  hudLives.setAttribute("aria-label", `${lives} ${lives === 1 ? "life" : "lives"}`);
}

function drawSky() {
  const sky = MAP_SKIES[activeMapIndex] ?? MAP_SKIES[0];
  const grd = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grd.addColorStop(0, sky.top);
  grd.addColorStop(0.52, sky.mid);
  grd.addColorStop(1, sky.bot);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawWorld() {
  const tx0 = Math.floor(camX / TILE_PX);
  const tx1 = Math.min(COLS - 1, Math.floor((camX + VIEW_W) / TILE_PX));
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      drawTile(tx, ty, GRID[ty][tx]);
    }
  }
}

function drawPlumberFigure(c, x, y, scale, pal, facing) {
  const R = pal.shirt;
  const B = pal.overalls;
  const S = pal.skin;
  const M = "#24120a";
  const Boot = "#3d2914";
  const W = "#f4f4f4";
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  if (facing === -1) {
    c.translate(22, 0);
    c.scale(-1, 1);
  }

  c.fillStyle = R;
  c.fillRect(3, 0, 16, 2);
  c.fillRect(0, 2, 22, 4);

  c.fillStyle = S;
  c.fillRect(4, 6, 14, 9);

  c.fillStyle = M;
  c.fillRect(2, 12, 8, 4);
  c.fillRect(12, 12, 8, 4);

  c.fillStyle = "#111";
  c.fillRect(14, 8, 3, 3);
  c.fillRect(9, 8, 2, 2);

  c.fillStyle = S;
  c.fillRect(10, 10, 4, 3);

  c.fillStyle = R;
  c.fillRect(5, 14, 12, 4);
  c.fillRect(2, 15, 4, 3);
  c.fillRect(16, 15, 4, 3);

  c.fillStyle = W;
  c.fillRect(1, 16, 3, 3);
  c.fillRect(18, 16, 3, 3);

  c.fillStyle = B;
  c.fillRect(4, 17, 14, 10);
  c.fillStyle = "#0f1f3d";
  c.fillRect(8, 20, 2, 2);
  c.fillRect(12, 20, 2, 2);

  c.strokeStyle = B;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(7, 7);
  c.lineTo(7, 18);
  c.moveTo(15, 7);
  c.lineTo(15, 18);
  c.stroke();

  c.fillStyle = Boot;
  c.fillRect(3, 25, 7, 3);
  c.fillRect(12, 25, 7, 3);

  c.restore();
}

function drawPlayer() {
  const x = player.x - camX;
  const y = player.y;
  const flash = player.iframes > 0 && Math.floor(performance.now() / 80) % 2 === 0;
  if (flash) return;
  const pal = AVATARS[selectedAvatarIndex] ?? AVATARS[0];
  drawPlumberFigure(ctx, x, y, 1, pal, player.facing);
}

function drawGoombas() {
  for (const g of goombas) {
    if (g.dead) continue;
    const x = g.x - camX;
    const y = g.y;
    ctx.fillStyle = "#6b3f2a";
    ctx.beginPath();
    ctx.ellipse(x + g.w / 2, y + g.h - 6, g.w / 2, g.h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4d7ba";
    ctx.fillRect(x + 4, y + 6, g.w - 8, 10);
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 7, y + 10, 4, 4);
    ctx.fillRect(x + g.w - 11, y + 10, 4, 4);
  }
}

function drawHudText() {
  hudScore.textContent = String(score);
  hudCoins.textContent = String(coins);
  if (hudLevel) hudLevel.textContent = `${campaignSlot + 1} / ${LEVELS_PER_RUN}`;
}

function loop(ts) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (gameActive && !paused) {
    updatePlayer(dt);
    updateGoombas(dt);
    updateCamera();
  }
  if (!gameActive) return;
  drawSky();
  drawWorld();
  drawGoombas();
  drawPlayer();
  drawHudText();
}

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Escape") {
    if (!screenMap.hidden) {
      showScreen("landing");
      e.preventDefault();
      return;
    }
    if (!screenAvatar.hidden) {
      showScreen("landing");
      e.preventDefault();
      return;
    }
  }
  if (!gameActive) return;
  if (e.code === "KeyP" || e.code === "Escape") {
    if (!overlay.hidden && overlayTitle.textContent === "Paused") {
      paused = false;
      hideOverlay();
    } else if (!overlay.hidden) {
      if (e.code === "Escape") e.preventDefault();
      return;
    } else {
      pauseGame();
    }
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

async function refreshLeaderboard() {
  lbErr.hidden = true;
  lbEl.innerHTML = "";
  try {
    const res = await fetch("/api/scores");
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    const scores = data.scores || [];
    if (!scores.length) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "No scores yet.";
      lbEl.appendChild(li);
      return;
    }
    for (const s of scores.slice(0, 10)) {
      const li = document.createElement("li");
      li.textContent = `${s.name} — ${s.score}`;
      lbEl.appendChild(li);
    }
  } catch {
    lbErr.hidden = false;
  }
}

async function submitScore(name, value) {
  try {
    await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score: value }),
    });
  } catch {
    /* ignore */
  }
}

btnSecondary.addEventListener("click", () => refreshLeaderboard());

btnPlay.addEventListener("click", () => startGame());
btnMaps.addEventListener("click", () => {
  renderMapGrid();
  showScreen("map");
});
btnAvatars.addEventListener("click", () => {
  renderAvatarGrid();
  showScreen("avatar");
});
btnMapBack.addEventListener("click", () => showScreen("landing"));
btnAvatarBack.addEventListener("click", () => showScreen("landing"));
btnTopMenu.addEventListener("click", () => {
  if (!window.confirm("Return to the main menu? This run will end.")) return;
  goToMainMenu();
});

const savedMap = parseInt(localStorage.getItem(LS_MAP) || "0", 10);
const savedAv = parseInt(localStorage.getItem(LS_AVATAR) || "0", 10);
if (!Number.isNaN(savedMap) && savedMap >= 0 && savedMap < MAP_DEFS.length) selectedMapIndex = savedMap;
if (!Number.isNaN(savedAv) && savedAv >= 0 && savedAv < AVATARS.length) selectedAvatarIndex = savedAv;
applyMap(selectedMapIndex);
gameActive = false;
showScreen("landing");
updateLandingHint();

renderLivesHearts();

paintAvatarShowcase();

refreshLeaderboard();
raf = requestAnimationFrame(loop);
