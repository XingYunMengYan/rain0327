// ============================================================
// shared.js — 项目全局共享工具库
// 无 JSX，可直接 <script src="shared.js"></script> 加载
// 所有导出挂载到 window 上
// ============================================================

// ──────────────────────────────────────────
// 1. 音效管理器
// ──────────────────────────────────────────
window.SoundManager = {
  context: null,
  bgm: null,
  isMuted: false,
  bgmEnabled: false,
  bgmTimeout: null,
   currentBGMSource: null,
  bgmFiles: ['bgm/bgm1.mp3', 'bgm/bgm2.mp3', 'bgm/bgm3.mp3', 'bgm/bgm4.mp3', 'bgm/bgm5.mp3'],
  lastPlayedIndex: -1,

  init() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    }
  },

  playSound(type) {
    if (this.isMuted) return;
    this.init();
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const presets = {
      click:   { type: 'sine',     freq: 800,  vol: 0.1,  dur: 0.1  },
      place:   { type: 'sine',     freq: 600,  vol: 0.15, dur: 0.2  },
      attack:  { type: 'sawtooth', freq: 200,  vol: 0.2,  dur: 0.3  },
      hover:   { type: 'sine',     freq: 600,  vol: 0.08, dur: 0.15 },
      miracle: { type: 'triangle', freq: 1046, vol: 0.18, dur: 0.4  },  // C6高音，闪耀感
    };

    // 奇迹牌施展：低频神秘共鸣 + 高泛音sparkle
    if (type === 'miracle') {
      const ctx2 = this.context;
      const o1 = ctx2.createOscillator(), g1 = ctx2.createGain();
      o1.type = 'sine';
      o1.frequency.setValueAtTime(180, ctx2.currentTime);
      o1.frequency.exponentialRampToValueAtTime(120, ctx2.currentTime + 1.5);
      g1.gain.setValueAtTime(0.25, ctx2.currentTime);
      g1.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 2.0);
      o1.connect(g1); g1.connect(ctx2.destination);
      o1.start(ctx2.currentTime); o1.stop(ctx2.currentTime + 2.0);
      const o2 = ctx2.createOscillator(), g2 = ctx2.createGain();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(1200, ctx2.currentTime);
      o2.frequency.exponentialRampToValueAtTime(800, ctx2.currentTime + 0.6);
      g2.gain.setValueAtTime(0.12, ctx2.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.8);
      o2.connect(g2); g2.connect(ctx2.destination);
      o2.start(ctx2.currentTime); o2.stop(ctx2.currentTime + 0.8);
      return;
    }

    // 轮盘转动噗声
    if (type === 'spin') {
      const ctx2 = this.context;
      const buf  = ctx2.createBuffer(1, ctx2.sampleRate * 0.1, ctx2.sampleRate);
      const d    = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
      const src  = ctx2.createBufferSource();
      const filt = ctx2.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 8;
      const g    = ctx2.createGain(); g.gain.value = 0.3;
      src.buffer = buf;
      src.connect(filt); filt.connect(g); g.connect(ctx2.destination);
      src.start();
      return;
    }

    if (type === 'victory') {
      // 三音上升弧
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
      return;
    }

    const p = presets[type];
    if (!p) return;
    osc.type = p.type;
    osc.frequency.value = p.freq;
    gain.gain.setValueAtTime(p.vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + p.dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + p.dur);
  },

    toggleBGM() {
    this.bgmEnabled = !this.bgmEnabled;
    this.bgmEnabled ? this.playBGM() : this.stopBGM();
    localStorage.setItem('bgmEnabled', this.bgmEnabled);
  },

 async playBGM() {
    if (this.isMuted || !this.bgmEnabled) return;
    this.init();
    
    // 先停止当前播放的BGM，避免重复播放
    this.stopBGM();
    
    // 随机选择一首BGM（避免重复播放同一首）
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * this.bgmFiles.length);
    } while (randomIndex === this.lastPlayedIndex && this.bgmFiles.length > 1);
    
    this.lastPlayedIndex = randomIndex;
    const bgmPath = this.bgmFiles[randomIndex];

    try {
      // 加载音频文件
      const response = await fetch(bgmPath);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

      // 再次检查状态，因为在异步加载期间可能被关闭了
      if (!this.bgmEnabled || this.isMuted) return;

      // 创建音频源
      const source = this.context.createBufferSource();
      const gainNode = this.context.createGain();
      
      source.buffer = audioBuffer;
      gainNode.gain.value = 0.05; // 音量
      
      source.connect(gainNode);
      gainNode.connect(this.context.destination);

      // 播放结束后自动播放下一首
      source.onended = () => {
        if (this.bgmEnabled && !this.isMuted) {
          this.playBGM();
        }
      };

      this.currentBGMSource = source;
      source.start(0);
    } catch (error) {
      console.error('BGM加载失败:', error);
    }
  },

  stopBGM() {
    if (this.currentBGMSource) {
      try {
        this.currentBGMSource.stop();
        this.currentBGMSource.disconnect();
      } catch (e) {
        // 忽略已停止的source错误
      }
      this.currentBGMSource = null;
    }
    if (this.bgmTimeout) {
      clearTimeout(this.bgmTimeout);
      this.bgmTimeout = null;
    }
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.isMuted ? this.stopBGM() : (this.bgmEnabled && this.playBGM());
  },

  // 页面加载时恢复上次BGM状态（需在页面ready后调用一次）
  restoreFromStorage() {
    if (localStorage.getItem('bgmEnabled') === 'true') {
      this.bgmEnabled = true;
      // 浏览器要求首次交互后才能播音
      document.addEventListener('click', () => {
        if (this.bgmEnabled && !this.currentBGMSource) this.playBGM();
      }, { once: true });
    }
  }
};


// ──────────────────────────────────────────
// 2. CSV 加载 + 解析
// ──────────────────────────────────────────
/**
 * loadCards() → Promise<Card[]>
 * 从 ./card_data.csv 读取并解析。
 * 依赖：PapaParse（页面已通过 CDN 引入）
 */
window.loadCards = function () {
  return fetch('./card_data.csv')
    .then(r => r.text())
    .then(text => {
      return new Promise((resolve, reject) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete(results) {
            const cards = results.data.map(row => {
              const hp = row.hp === '?' ? 0 : (parseInt(row.hp) || 0);
              return {
                id:      parseInt(row['#']),
                name:    row.name,
                type:    row.type,            // 'battlefield' | 'support' | 'miracle'
                rarity:  row.rarity  || '',
                stRace:  row.stRace  || '',
                ndRace:  row.ndRace  || '',
                cost:    parseFloat(row.cost) || 0,
                hp,
                atk:     parseInt(row.atk) || 0,
                effect:  row.effect  || ''
              };
            }).filter(c => c.id && c.name);
            resolve(cards);
          },
          error: reject
        });
      });
    });
};

// ──────────────────────────────────────────
// 3. 卡牌实例工厂
// ──────────────────────────────────────────
/**
 * createCard(template) → Card实例（带 maxHp + 唯一 instanceId）
 */
window.createCard = function (cardData) {
  return {
    ...cardData,
    maxHp:      cardData.hp,
    instanceId: Math.random().toString(36).slice(2)   // 比 Math.random() 更清楚
  };
};

// ──────────────────────────────────────────
// 4. 通用工具
// ──────────────────────────────────────────

/** 卡牌图片路径 */
window.getCardImagePath = function (id) { return 'card_images/' + id + '.png'; };

/** 洗牌 (Fisher-Yates) */
window.shuffleArray = function (arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ──────────────────────────────────────────
// 5. JSX-free SVG 图标工厂（返回 React.createElement）
//    在 gameUI.js 的 JSX 里可以直接 <Icons.Sword size={16} />
// ──────────────────────────────────────────
window.Icons = (function () {
  const R = window.React;                          // 依赖 React 已加载
  const svg = (paths, w = 24) =>
    (props) => {
      const { size = w, className = '' } = props || {};
      return R.createElement('svg', {
        width: size, height: size,
        viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2,
        className
      }, ...paths);
    };

  const path  = (d)       => R.createElement('path',     { d });
  const circ  = (cx,cy,r) => R.createElement('circle',   { cx, cy, r });
  const line  = (x1,y1,x2,y2) => R.createElement('line', { x1, y1, x2, y2 });
  const poly  = (pts)    => R.createElement('polygon',   { points: pts });

  return {
    Sword: svg([
      path('M14.5 17.5L3 6V3h3l11.5 11.5'),
      path('M13 19l6-6'),
      path('M16 16l4 4'),
      path('M19 21l2-2')
    ]),
    Heart: svg([
      path('M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z')
    ]),
    Coins: svg([
      circ(8,8,6),
      path('M18.09 10.37A6 6 0 1 1 10.34 18'),
      path('M7 6h1v4')
    ]),
    Sparkles: svg([
      path('M12 3v18M3 12h18M6.5 6.5l11 11M6.5 17.5l11-11')
    ]),
    RefreshCw: svg([
      path('M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16')
    ]),
    Eye: svg([
      path('M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z'),
      circ(12,12,3)
    ]),
    Volume2: svg([
      poly('11 5 6 9 2 9 2 15 6 15 11 19 11 5'),
      path('M15.54 8.46a5 5 0 0 1 0 7.07'),
      path('M19.07 4.93a10 10 0 0 1 0 14.14')
    ]),
    VolumeX: svg([
      poly('11 5 6 9 2 9 2 15 6 15 11 19 11 5'),
      line(23,9,17,15),
      line(17,9,23,15)
    ]),
    Home: svg([
      path('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
      R.createElement('polyline', { points: '9 22 9 12 15 12 15 22' })
    ]),
    X: svg([
      line(18,6,6,18),
      line(6,6,18,18)
    ])
  };
})();

// ──────────────────────────────────────────
// 6. gameUI.js 动态加载 + Babel 编译
//    在每个页面的入口调用：
//      GameUILoader.load().then(() => { /* GameUI 组件已就绪 */ })
// ──────────────────────────────────────────
window.GameUILoader = {
  _promise: null,
  load() {
    if (this._promise) return this._promise;     // 单次加载
    this._promise = fetch('./gameUI.js')
      .then(r => r.text())
      .then(src => {
        const compiled = Babel.transform(src, { presets: ['react'] }).code;
        // 在全局作用域 eval，使其能访问 React 和 window.Icons 等
        (new Function(compiled))();
      });
    return this._promise;
  }
};


