/* =========================================================
 *  情侣网站 · 多形态 3D 照片墙（复刻抖音 @芒果&布丁 第14集效果）
 *  形态循环：心形照片云 → 照片墙 → 星球形 → 横向长廊 → 圆环 → 星系 → 时间线
 *  ↓↓↓ 在这里修改你们的专属信息 ↓↓↓
 * ========================================================= */
const CONFIG = {
  // 恋爱开始的日期（从这天算起，今天正好在一起 762 天）
  startDate: '2024-10-12T00:00:00',

  // 两个人名字（顶部展示）
  names: ['GUYU', 'WANGYAPING'],

  // 照片清单文件（把照片放进 photos 文件夹后运行"生成照片清单.bat"）
  manifestUrl: 'photos/manifest.json',
  photosFolder: 'photos/',

  // 没有照片时使用的演示图（联网才会加载）
  demoImages: true,
  demoCount: 160,

  // 舞台上的照片卡片总数
  cardCount: 160,

  // 每种形态停留的秒数
  layoutDuration: 9,

  // 整体旋转一圈的时间（秒）
  spinDuration: 44,

  // 滚轮缩放范围
  zoomMin: 0.4,
  zoomMax: 2.6,

  // 时间线内容（可在下面自由增删）
  timeline: [
    { date: '2024-10-12', title: '第一次见面', desc: '那天你穿了一件白裙子，笑起来眼睛弯弯的，我一下子就沦陷了。' },
    { date: '2024-11-20', title: '第一次牵手', desc: '晚风、路灯和你的手，一切都很刚刚好，紧张到手心冒汗。' },
    { date: '2025-01-01', title: '第一次一起跨年', desc: '零点的烟花响起时，我在人潮里吻了你，那是今年最亮的一秒。' },
    { date: '2025-06-01', title: '第一次一起旅行', desc: '看了海、拍了照片、吵了架又和好，原来这就是和我们在一起。' },
    { date: '未来每一天', title: '未完待续…', desc: '往后的故事还很长，我们慢慢写。' },
  ],
};

/* ============ 歌词轮播（对应视频底部滚动字幕） ============ */
const LYRICS = [
  '♪ 每一张照片，都是想你的证据 ♪',
  '♪ 时间会老，但爱不会 ♪',
  '♪ 你笑起来的样子，胜过所有星光 ♪',
  '♪ 往后余生，风雪是你，平淡是你 ♪',
  '♪ 把日子攒成星光，把你存进心里 ♪',
  '♪ 我们的故事，未完待续 ♪',
];

const QUOTES = [
  '从遇见你的那一刻，整个宇宙都有了意义',
  '所谓浪漫，就是把每一个平凡的日子过成纪念日',
  '你是我的今天，和所有的明天',
  '世间万物，唯你最珍贵',
  '想和你一起，看遍每一场日落与晨曦',
];

/* ========================================================= */
let photoPool = [];
let poolIndex = 0;
let cards = [];          // 所有卡片 DOM
let currentLayout = 0;
let zoom = 1;
let tilt = -8;

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- 照片本地持久化（IndexedDB）：导入过的照片自动保存，下次打开自动加载 ---------- */
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('love-gallery', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('photos', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function dbSavePhoto(blob) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').add({ blob });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) {
    console.warn('照片保存失败（可能超出浏览器存储上限）', e);
    return false;
  }
}

async function dbLoadPhotos() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly');
      const req = tx.objectStore('photos').getAll();
      req.onsuccess = () =>
        resolve(req.result.map((r) => URL.createObjectURL(r.blob)));
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}

async function dbClearPhotos() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- 照片加载 ---------- */
async function loadPhotos() {
  // 1. 先加载上一次保存在本网站里的照片
  const saved = await dbLoadPhotos();
  let manifestCount = 0;

  // 2. 再加载 photos 文件夹里的照片（如果有清单）
  try {
    const res = await fetch(CONFIG.manifestUrl, { cache: 'no-store' });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length) {
        photoPool = saved.concat(list.map((n) => CONFIG.photosFolder + n));
        manifestCount = list.length;
      }
    }
  } catch (e) { /* 无清单文件，忽略 */ }

  if (!photoPool.length) photoPool = saved;

  // 3. 什么照片都没有时才使用演示图
  if (!photoPool.length && CONFIG.demoImages) {
    photoPool = Array.from(
      { length: CONFIG.demoCount },
      (_, i) => `https://picsum.photos/seed/love${i}/300/380`
    );
  }

  $('photoCount').textContent = photoPool.length;
  console.log(`已加载照片：本地保存 ${saved.length} 张 + photos 文件夹 ${manifestCount} 张`);
}

function nextPhoto() {
  if (!photoPool.length) return '';
  const url = photoPool[poolIndex % photoPool.length];
  poolIndex++;
  return url;
}

/* ---------- 心形参数方程 ---------- */
function heartPoint(t) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return { x, y: -y };
}

/* =========================================================
 *  七种布局：每个函数为所有卡片生成目标位姿
 *  { x, y, z, ry, rz, s(缩放), o(透明度) }
 * ========================================================= */
const S = 17.5;

function layoutHeart(n) {
  const pos = new Array(n);
  const layers = [
    { f: 1.00, size: 1.05, z: 45,  share: 0.30 },
    { f: 0.92, size: 0.97, z: 15,  share: 0.22 },
    { f: 0.84, size: 0.90, z: -12, share: 0.18 },
    { f: 0.76, size: 0.83, z: -35, share: 0.14 },
    { f: 0.68, size: 0.77, z: -55, share: 0.10 },
    { f: 0.60, size: 0.72, z: -70, share: 0.06 },
  ];
  let idx = 0;
  layers.forEach((layer) => {
    const cnt = Math.max(3, Math.round(n * layer.share));
    for (let i = 0; i < cnt && idx < n; i++, idx++) {
      const t = (i / cnt) * Math.PI * 2;
      const p = heartPoint(t);
      const faceAngle = Math.atan2(p.x, p.y) * (180 / Math.PI);
      pos[idx] = {
        x: p.x * S * layer.f,
        y: p.y * S * layer.f - 10,
        z: layer.z + rand(-10, 10),
        ry: faceAngle * 0.35,
        rz: rand(-6, 6),
        s: layer.size * rand(0.95, 1.05),
      };
    }
  });
  for (; idx < n; idx++) pos[idx] = pos[idx - 1];
  return pos;
}

function layoutWall(n) {
  const cols = 16;
  const rows = Math.ceil(n / cols);
  const sx = 72, sy = 88;
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return {
      x: (c - (cols - 1) / 2) * sx + rand(-4, 4),
      y: (r - (rows - 1) / 2) * sy + rand(-4, 4),
      z: rand(-15, 15),
      ry: rand(-3, 3),
      rz: rand(-2, 2),
      s: 0.82,
    };
  });
}

function layoutSphere(n) {
  const R = 265;
  const pos = Array.from({ length: n }, (_, i) => {
    const y0 = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const th = i * 2.399963229728653;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    return {
      x: x * R, y: y0 * R, z: z * R,
      ry: (Math.atan2(x, z) * 180) / Math.PI,
      rx: (-Math.asin(y0) * 180) / Math.PI,
      rz: rand(-4, 4),
      s: 0.85,
    };
  });
  // 中间放一张放大突出的照片（对应视频中的特写）
  pos[0] = { x: 0, y: -10, z: 320, ry: 0, rx: 0, rz: 0, s: 2.1 };
  return pos;
}

function layoutRow(n) {
  // 经典 3D 旋转木马：一排卡片围成圆环，视线平视，与视频中的横排长廊一致
  const visible = Math.min(26, n);
  const R = 520;
  const pos = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i < visible) {
      const t = (i / visible) * Math.PI * 2;
      pos[i] = {
        x: Math.sin(t) * R,
        y: rand(-8, 8),
        z: Math.cos(t) * R,
        ry: (t * 180) / Math.PI + 180,
        rx: 0,
        rz: rand(-2, 2),
        s: 1.12,
      };
    } else {
      // 其余卡片淡出，飘向远处
      pos[i] = { x: rand(-600, 600), y: rand(-320, 320), z: -420, ry: rand(-90, 90), rx: 0, rz: rand(-30, 30), s: 0.5, o: 0 };
    }
  }
  return pos;
}

function layoutRing(n) {
  // 双层圆环水平放置，舞台前倾 58°，呈现视频中的漩涡圆盘
  const pos = new Array(n);
  const outer = Math.round(n * 0.44);
  const inner = n - outer;
  const ringPos = (count, offsetPhase, r, s) =>
    Array.from({ length: count }, (_, i) => {
      const t = ((i + offsetPhase) / count) * Math.PI * 2;
      return {
        x: Math.sin(t) * r,
        y: rand(-6, 6),
        z: Math.cos(t) * r,
        ry: (t * 180) / Math.PI,
        rx: 0,
        rz: rand(-3, 3),
        s,
      };
    });
  const outerPos = ringPos(outer, 0, 360, 0.95);
  const innerPos = ringPos(inner, 0.5, 235, 0.72);
  outerPos.forEach((p, i) => (pos[i] = p));
  innerPos.forEach((p, i) => (pos[outer + i] = p));
  return pos;
}

function layoutGalaxy(n) {
  return Array.from({ length: n }, () => ({
    x: rand(-430, 430),
    y: rand(-280, 280),
    z: rand(-200, 180),
    ry: rand(-180, 180),
    rz: rand(-25, 25),
    s: rand(0.6, 1.0),
  }));
}

function layoutTimeline(n) {
  // 照片退到远处变暗，让时间线面板登场
  return Array.from({ length: n }, (_, i) => ({
    x: rand(-520, 520),
    y: rand(-340, 340),
    z: rand(-380, -120),
    ry: rand(-120, 120),
    rz: rand(-40, 40),
    s: 0.55,
    o: 0.14,
  }));
}

const LAYOUTS = [
  { name: 'heart',    tilt: -8,  build: layoutHeart },
  { name: 'wall',     tilt: -5,  build: layoutWall },
  { name: 'sphere',   tilt: -14, build: layoutSphere },
  { name: 'row',      tilt: -4,  build: layoutRow },
  { name: 'ring',     tilt: 58,  build: layoutRing },
  { name: 'galaxy',   tilt: -10, build: layoutGalaxy },
  { name: 'timeline', tilt: -8,  build: layoutTimeline, panel: true },
];

/* ---------- 应用布局 ---------- */
function applyLayout(index, instant = false) {
  const L = LAYOUTS[index % LAYOUTS.length];
  tilt = L.tilt;
  const pos = L.build(cards.length);

  cards.forEach((card, i) => {
    if (instant) card.style.transitionDelay = '0ms';
    else card.style.transitionDelay = (i % 24) * 55 + 'ms';
    const p = pos[i];
    card.style.opacity = p.o !== undefined ? p.o : 1;
    card.style.transform =
      `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, ${p.z.toFixed(1)}px) ` +
      `rotateY(${p.ry.toFixed(1)}deg) rotateX(${(p.rx || 0).toFixed(1)}deg) rotateZ(${p.rz.toFixed(1)}deg) scale(${(p.s || 1).toFixed(2)})`;
  });

  $('heartScene').style.transform = `rotateX(${tilt}deg) scale(${zoom.toFixed(3)})`;
  $('timelinePanel').classList.toggle('active', !!L.panel);
}

function startLayoutLoop() {
  applyLayout(0, true);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => cards.forEach((c) => (c.style.transitionDelay = '0ms')))
  );
  setInterval(() => {
    currentLayout = (currentLayout + 1) % LAYOUTS.length;
    applyLayout(currentLayout);
  }, CONFIG.layoutDuration * 1000);
}

/* ---------- 构建卡片 ---------- */
function buildCards() {
  const layer = $('cardLayer');
  layer.innerHTML = '';
  cards = [];
  document.documentElement.style.setProperty('--spin', CONFIG.spinDuration + 's');

  for (let i = 0; i < CONFIG.cardCount; i++) {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.style.setProperty('--w', '74px');
    card.style.setProperty('--h', '92px');
    card.style.setProperty('--delay', (-Math.random() * 12).toFixed(2) + 's');
    card.style.setProperty('--flipDur', (10 + Math.random() * 8).toFixed(2) + 's');

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const front = document.createElement('div');
    front.className = 'face front';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = nextPhoto();
    img.alt = '我们的回忆';
    img.addEventListener('error', () => {
      front.classList.add('placeholder');
      img.remove();
    });
    front.appendChild(img);

    const back = document.createElement('div');
    back.className = 'face back';
    back.textContent = '💗';

    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);

    card.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openLightbox(img.src);
    });

    layer.appendChild(card);
    cards.push(card);
  }
}

/* 照片轮播：每 6 秒随机换一批卡片上的图，让 2000 张照片都有机会登场 */
function startPhotoCarousel() {
  setInterval(() => {
    if (!cards.length || !photoPool.length) return;
    for (let k = 0; k < 24; k++) {
      const card = cards[Math.floor(Math.random() * cards.length)];
      const img = card.querySelector('img');
      if (img) img.src = nextPhoto();
    }
  }, 6000);
}

/* ---------- 计时器 ---------- */
function tickTimer() {
  const start = new Date(CONFIG.startDate).getTime();
  const now = Date.now();
  let diff = Math.max(0, now - start);
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000);  diff -= h * 3600000;
  const m = Math.floor(diff / 60000);    diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  $('dDays').textContent = d;
  $('dHours').textContent = String(h).padStart(2, '0');
  $('dMins').textContent = String(m).padStart(2, '0');
  $('dSecs').textContent = String(s).padStart(2, '0');
}

/* ---------- 金句 / 歌词轮播 ---------- */
function rotateText(el, arr, interval) {
  let i = 0;
  el.style.transition = 'opacity .4s';
  setInterval(() => {
    i = (i + 1) % arr.length;
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = arr[i]; el.style.opacity = 1; }, 400);
  }, interval);
}

/* ---------- 星空与漂浮爱心 ---------- */
function buildStars() {
  const box = $('stars');
  const colors = ['#f5a8c4', '#e8c7f2', '#ffd6b8', '#f9c8d8'];
  for (let i = 0; i < 140; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2.2 + 0.6;
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.background = colors[Math.floor(Math.random() * colors.length)];
    s.style.setProperty('--dur', (2 + Math.random() * 4) + 's');
    box.appendChild(s);
  }
}

function buildFloatingHearts() {
  const box = $('floating-hearts');
  const emojis = ['💗', '💕', '💖', '🩷', '✨', '🌸'];
  for (let i = 0; i < 18; i++) {
    const h = document.createElement('div');
    h.className = 'float-heart';
    h.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    h.style.left = Math.random() * 100 + '%';
    h.style.fontSize = (10 + Math.random() * 18) + 'px';
    h.style.setProperty('--dur', (9 + Math.random() * 10) + 's');
    h.style.setProperty('--s', (0.6 + Math.random()).toFixed(2));
    h.style.setProperty('--o', (0.25 + Math.random() * 0.45).toFixed(2));
    h.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
    h.style.animationDelay = (-Math.random() * 15) + 's';
    box.appendChild(h);
  }
}

/* ---------- 时间线面板 ---------- */
function buildTimelinePanel() {
  const panel = $('timelinePanel');
  panel.innerHTML =
    `<div class="timeline-head">TIMELINE</div>
     <div class="timeline-title">我们的小小时间线</div>` +
    CONFIG.timeline.map((it) => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div>
          <div class="t-date">${it.date}</div>
          <div class="t-title">${it.title}</div>
          <div class="t-desc">${it.desc}</div>
        </div>
      </div>`).join('');
}

/* ---------- 音乐：优先播放 music.mp3，没有则用内置八音盒旋律 ---------- */
const music = $('bgMusic');

class MelodyBox {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.timer = null;
    // 柔和的 C 大调分解和弦八音盒旋律（C → Am → F → G）
    this.melody = [
      523.25, 659.26, 783.99, 659.26, 880.00, 783.99, 659.26, 523.25,
      440.00, 523.25, 659.26, 523.25, 880.00, 659.26, 523.25, 440.00,
      349.23, 440.00, 523.25, 440.00, 698.46, 523.25, 440.00, 349.23,
      392.00, 493.88, 587.33, 493.88, 783.99, 587.33, 493.88, 392.00,
    ];
    this.bass = [130.81, 220.00, 174.61, 196.00];
    this.stepDur = 0.5;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.16;
    // 轻微回声，营造柔和空间感
    this.delay = this.ctx.createDelay(1);
    this.delay.delayTime.value = 0.42;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.32;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.master.connect(this.ctx.destination);
    this.master.connect(this.delay);
    this.delay.connect(this.ctx.destination);
  }

  note(freq, t, dur = 1.1, vol = 0.5) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.1);

    // 加一层高八度泛音，音色更像八音盒
    const o2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2;
    g2.gain.setValueAtTime(vol * 0.16, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6);
    o2.connect(g2); g2.connect(this.master);
    o2.start(t); o2.stop(t + dur);
  }

  scheduleLoop() {
    const t0 = this.ctx.currentTime + 0.08;
    this.melody.forEach((f, i) => {
      if (f) this.note(f, t0 + i * this.stepDur, 1.2, 0.42);
      if (i % 8 === 0) this.note(this.bass[i / 8], t0 + i * this.stepDur, 2.2, 0.3);
    });
    const loopDur = this.melody.length * this.stepDur * 1000;
    this.timer = setTimeout(() => this.playing && this.scheduleLoop(), loopDur - 120);
  }

  start() {
    this.ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.playing = true;
    this.scheduleLoop();
  }

  stop() {
    this.playing = false;
    clearTimeout(this.timer);
    if (this.ctx) this.ctx.suspend();
  }
}

const melody = new MelodyBox();
let musicMode = null; // 'file' | 'synth' | null

function initMusic() {
  const btn = $('musicBtn');
  const eq = $('equalizer');

  const setPlaying = (on) => {
    btn.textContent = on ? '🔇 暂停音乐' : '🎵 打开音乐';
    eq.classList.toggle('playing', on);
  };

  btn.addEventListener('click', async () => {
    if (musicMode === 'file') {
      if (music.paused) { await music.play(); setPlaying(true); }
      else { music.pause(); setPlaying(false); }
      return;
    }
    if (musicMode === 'synth') {
      if (melody.playing) { melody.stop(); setPlaying(false); }
      else { melody.start(); setPlaying(true); }
      return;
    }
    // 第一次点击：尝试播放 music.mp3，失败则切换到内置旋律
    try {
      await music.play();
      musicMode = 'file';
      setPlaying(true);
    } catch (e) {
      musicMode = 'synth';
      melody.start();
      setPlaying(true);
    }
  });
}

/* ---------- 照片导入（拖拽 + 按钮，自动保存到本地） ---------- */
function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;

  let savedCount = 0;
  files.forEach((f) => {
    const url = URL.createObjectURL(f);
    photoPool.push(url);
    // 自动存入浏览器本地数据库，下次打开自动加载
    dbSavePhoto(f).then((ok) => {
      if (ok) savedCount++;
      if (savedCount === files.length) {
        console.log(`已保存 ${savedCount} 张照片到本地，下次打开自动加载`);
      }
    });
  });

  $('photoCount').textContent = photoPool.length;
  cards.forEach((card, i) => {
    if (i % 3 === 0) {
      const img = card.querySelector('img');
      if (img) img.src = nextPhoto();
    }
  });
}

function initUpload() {
  const overlay = $('dropOverlay');
  $('uploadBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });

  // 清空已保存到本网站的照片（不影响电脑里的原图）
  $('clearBtn').addEventListener('click', async () => {
    if (!confirm('确定清空保存在本网站里的所有照片吗？（电脑里的原图不受影响）')) return;
    await dbClearPhotos();
    photoPool = [];
    await loadPhotos();
    cards.forEach((card, i) => {
      if (i % 2 === 0) {
        const img = card.querySelector('img');
        if (img) img.src = nextPhoto();
      }
    });
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; overlay.classList.add('active'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; overlay.classList.remove('active'); } });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove('active');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
}

/* ---------- 滚轮 / 双指缩放 ---------- */
function initZoom() {
  const scene = $('heartScene');
  zoom = window.innerWidth < 700 ? 0.6 : 1;

  const apply = () => {
    scene.style.transform = `rotateX(${tilt}deg) scale(${zoom.toFixed(3)})`;
  };
  const setZoom = (v) => {
    zoom = Math.min(CONFIG.zoomMax, Math.max(CONFIG.zoomMin, v));
    apply();
  };

  window.addEventListener('wheel', (e) => {
    if ($('lightbox').classList.contains('active')) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY > 0 ? 0.92 : 1.08));
  }, { passive: false });

  window.addEventListener('dblclick', (e) => {
    if (e.target.closest('.lightbox')) return;
    zoom = window.innerWidth < 700 ? 0.6 : 1;
    apply();
  });

  let pinchStart = 0, pinchZoom = 1;
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStart = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchZoom = zoom;
    }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStart) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      setZoom(pinchZoom * (dist / pinchStart));
    }
  }, { passive: true });
  window.addEventListener('touchend', () => { pinchStart = 0; });
}

/* ---------- 大图查看（可左右切换） ---------- */
let lightboxIndex = -1;

function openLightbox(src) {
  lightboxIndex = photoPool.indexOf(src);
  renderLightbox(src);
  $('lightbox').classList.add('active');
  $('spinWrap').classList.add('paused');
}

function renderLightbox(src) {
  $('lightboxImg').src = src;
  const pos = lightboxIndex >= 0 ? `第 ${lightboxIndex + 1} / ${photoPool.length} 张 · ` : '';
  $('lightboxCaption').textContent =
    `${pos}已一起走过 ${$('dDays').textContent} 天 · 每一帧都值得被记住`;
}

function stepLightbox(dir) {
  if (!photoPool.length) return;
  if (lightboxIndex < 0) lightboxIndex = 0;
  lightboxIndex = (lightboxIndex + dir + photoPool.length) % photoPool.length;
  renderLightbox(photoPool[lightboxIndex]);
}

function closeLightbox() {
  $('lightbox').classList.remove('active');
  $('spinWrap').classList.remove('paused');
}

function initLightbox() {
  const box = $('lightbox');
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.id === 'lightboxImg' || e.target.id === 'lightboxClose') {
      closeLightbox();
    }
  });
  $('lightboxPrev').addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(-1); });
  $('lightboxNext').addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(1); });
  window.addEventListener('keydown', (e) => {
    if (!box.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  });
}

/* ---------- 启动 ---------- */
(async function init() {
  $('coupleName').textContent = `${CONFIG.names[0]} ♥ ${CONFIG.names[1]}`;
  document.title = `${CONFIG.names[0]} ♥ ${CONFIG.names[1]} · 我们的小宇宙`;

  buildStars();
  buildFloatingHearts();
  buildTimelinePanel();
  await loadPhotos();
  buildCards();
  startLayoutLoop();
  startPhotoCarousel();

  tickTimer();
  setInterval(tickTimer, 1000);

  rotateText($('loveQuote'), QUOTES, 6000);
  rotateText($('lyric'), LYRICS, 4500);

  initMusic();
  initUpload();
  initLightbox();
  initZoom();
})();
