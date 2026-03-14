// ============================================
// Code Animator
// ============================================

// ---------- Configuration ----------

const CONFIG = {
  canvas: { width: 1920, height: 1080 },
  frame: { padding: 60 },
  window: {
    bg: "#282c34",
    titleBarBg: "#21252b",
    titleBarHeight: 44,
    borderRadius: 12,
  },
  code: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 18,
    lineHeight: 28,
    paddingX: 24,
    paddingY: 20,
    gutterWidth: 60,
  },
  cursor: { color: "#528bff", width: 2, blinkMs: 530 },
  typing: {
    cps: 40,
    lineDelay: 80,
    punctDelay: 30,
    indentCps: 200,
  },
  transition: { fadeMs: 400, pauseMs: 300, holdMs: 1200 },
  recording: { fps: 60, bitrate: 12_000_000 },
};

// ---------- One Dark Theme Colors ----------

const THEME_DEFAULT = "#abb2bf";

const THEME_MAP = {
  "hljs-keyword": "#c678dd",
  "hljs-built_in": "#e5c07b",
  "hljs-type": "#e5c07b",
  "hljs-literal": "#d19a66",
  "hljs-number": "#d19a66",
  "hljs-operator": "#56b6c2",
  "hljs-punctuation": "#abb2bf",
  "hljs-property": "#e06c75",
  "hljs-regexp": "#98c379",
  "hljs-string": "#98c379",
  "hljs-subst": "#e06c75",
  "hljs-symbol": "#61afef",
  "hljs-variable": "#e06c75",
  "hljs-title": "#61afef",
  "hljs-title.class": "#e5c07b",
  "hljs-title.class_": "#e5c07b",
  "hljs-title.function": "#61afef",
  "hljs-title.function_": "#61afef",
  "hljs-params": "#abb2bf",
  "hljs-comment": "#5c6370",
  "hljs-doctag": "#c678dd",
  "hljs-meta": "#e06c75",
  "hljs-attr": "#d19a66",
  "hljs-attribute": "#d19a66",
  "hljs-name": "#e06c75",
  "hljs-tag": "#e06c75",
  "hljs-selector-class": "#d19a66",
  "hljs-selector-id": "#61afef",
  "hljs-template-variable": "#e06c75",
  "hljs-template-tag": "#c678dd",
  "hljs-addition": "#98c379",
  "hljs-deletion": "#e06c75",
  "hljs-link": "#61afef",
  "hljs-bullet": "#61afef",
  "hljs-section": "#61afef",
};

function resolveColor(className) {
  if (!className) return null;
  const classes = className.split(/\s+/);
  for (const cls of classes) {
    if (THEME_MAP[cls]) return THEME_MAP[cls];
  }
  // try partial match for nested classes like "title function_"
  for (const cls of classes) {
    for (const [key, color] of Object.entries(THEME_MAP)) {
      if (cls === key || key.endsWith(cls) || cls.endsWith(key.replace("hljs-", ""))) {
        return color;
      }
    }
  }
  return null;
}

// ---------- Syntax Highlighting ----------

function tokenizeCode(code, language) {
  // Normalize line endings
  code = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let html;
  try {
    html = hljs.highlight(code, { language }).value;
  } catch {
    html = hljs.highlightAuto(code).value;
  }

  const container = document.createElement("div");
  container.innerHTML = html;

  const chars = [];

  function walk(node, color) {
    if (node.nodeType === Node.TEXT_NODE) {
      for (const ch of node.textContent) {
        chars.push({ char: ch, color: color || THEME_DEFAULT });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const newColor = resolveColor(node.className) || color;
      for (const child of node.childNodes) {
        walk(child, newColor);
      }
    }
  }

  walk(container, THEME_DEFAULT);
  return chars;
}

function countLinesUpTo(tokens, count) {
  let lines = 0;
  for (let i = 0; i < count && i < tokens.length; i++) {
    if (tokens[i].char === "\n") lines++;
  }
  return lines;
}

// ---------- Canvas Renderer ----------

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.charWidth = 0;
    this.resize(CONFIG.canvas.width, CONFIG.canvas.height);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    CONFIG.canvas.width = w;
    CONFIG.canvas.height = h;
    this.measureChar();
  }

  measureChar() {
    const ctx = this.ctx;
    ctx.font = `${CONFIG.code.fontSize}px ${CONFIG.code.fontFamily}`;
    this.charWidth = ctx.measureText("M").width;
  }

  get winX() { return CONFIG.frame.padding; }
  get winY() { return CONFIG.frame.padding; }
  get winW() { return CONFIG.canvas.width - CONFIG.frame.padding * 2; }
  get winH() { return CONFIG.canvas.height - CONFIG.frame.padding * 2; }
  get codeAreaY() { return this.winY + CONFIG.window.titleBarHeight; }
  get codeAreaH() { return this.winH - CONFIG.window.titleBarHeight; }
  get maxVisibleLines() {
    return Math.floor((this.codeAreaH - CONFIG.code.paddingY * 2) / CONFIG.code.lineHeight);
  }
  get maxCols() {
    const codeWidth = this.winW - CONFIG.code.paddingX * 2 - CONFIG.code.gutterWidth;
    return Math.max(1, Math.floor(codeWidth / this.charWidth));
  }

  // Count visual lines (accounting for wrapping) up to charCount
  countVisualLines(tokens, charCount) {
    const max = this.maxCols;
    let col = 0, vLine = 0;
    for (let i = 0; i < charCount && i < tokens.length; i++) {
      const ch = tokens[i].char;
      if (ch === "\n") { vLine++; col = 0; }
      else if (ch === "\t") {
        if (col + 2 > max) { vLine++; col = 0; }
        col += 2;
      } else {
        if (col >= max) { vLine++; col = 0; }
        col++;
      }
    }
    return vLine;
  }

  render(scene, charCount, opacity, scrollY) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    this.drawBackground();

    if (opacity < 1) { ctx.save(); ctx.globalAlpha = opacity; }

    this.drawWindow();
    this.drawTitleBar(scene.title);

    if (scene.tokens && scene.tokens.length > 0) {
      // Clip code area
      ctx.save();
      ctx.beginPath();
      const r = CONFIG.window.borderRadius;
      ctx.moveTo(this.winX, this.codeAreaY);
      ctx.lineTo(this.winX + this.winW, this.codeAreaY);
      ctx.lineTo(this.winX + this.winW, this.winY + this.winH - r);
      ctx.arcTo(this.winX + this.winW, this.winY + this.winH, this.winX + this.winW - r, this.winY + this.winH, r);
      ctx.lineTo(this.winX + r, this.winY + this.winH);
      ctx.arcTo(this.winX, this.winY + this.winH, this.winX, this.winY + this.winH - r, r);
      ctx.lineTo(this.winX, this.codeAreaY);
      ctx.closePath();
      ctx.clip();

      this.drawLineNumbers(scene, charCount, scrollY);
      this.drawCode(scene, charCount, scrollY);
      this.drawCursor(scene, charCount, scrollY);

      ctx.restore();
    }

    if (opacity < 1) { ctx.restore(); }
  }

  drawBackground() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
    g.addColorStop(0, "#0f0c29");
    g.addColorStop(0.5, "#302b63");
    g.addColorStop(1, "#24243e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
  }

  drawWindow() {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = CONFIG.window.bg;
    this.roundRect(this.winX, this.winY, this.winW, this.winH, CONFIG.window.borderRadius);
    ctx.fill();
    ctx.restore();
  }

  drawTitleBar(title) {
    const ctx = this.ctx;
    const { winX: x, winY: y, winW: w } = this;
    const h = CONFIG.window.titleBarHeight;
    const r = CONFIG.window.borderRadius;

    // Title bar bg
    ctx.fillStyle = CONFIG.window.titleBarBg;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fill();

    // Separator
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    // Traffic lights
    const dots = ["#ff5f56", "#ffbd2e", "#27c93f"];
    const dotY = y + h / 2;
    dots.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(x + 22 + i * 24, dotY, 7, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });

    // Title
    if (title) {
      ctx.fillStyle = "#9da5b4";
      ctx.font = `13px ${CONFIG.code.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(title, x + w / 2, dotY);
      ctx.textAlign = "left";
    }
  }

  drawLineNumbers(scene, charCount, scrollY) {
    const ctx = this.ctx;
    const startX = this.winX + CONFIG.code.paddingX;
    const baseY = this.codeAreaY + CONFIG.code.paddingY - scrollY;
    const maxC = this.maxCols;
    const tokens = scene.tokens;
    const count = Math.min(charCount, tokens.length);

    // Walk tokens to find the visual line where each logical line starts
    const totalLogical = countLinesUpTo(tokens, tokens.length) + 1;
    const numWidth = String(totalLogical).length + 1;
    const lineStartVLines = [0]; // visual line index for each logical line
    let col = 0, vLine = 0;

    for (let i = 0; i < count; i++) {
      const ch = tokens[i].char;
      if (ch === "\n") {
        vLine++; col = 0;
        lineStartVLines.push(vLine);
      } else if (ch === "\t") {
        if (col + 2 > maxC) { vLine++; col = 0; }
        col += 2;
      } else {
        if (col >= maxC) { vLine++; col = 0; }
        col++;
      }
    }

    ctx.font = `${CONFIG.code.fontSize}px ${CONFIG.code.fontFamily}`;
    ctx.textBaseline = "top";

    for (let i = 0; i < lineStartVLines.length; i++) {
      const y = baseY + lineStartVLines[i] * CONFIG.code.lineHeight;
      if (y + CONFIG.code.lineHeight < this.codeAreaY || y > this.winY + this.winH) continue;
      ctx.fillStyle = "#495162";
      ctx.fillText(String(i + 1).padStart(numWidth, " "), startX, y);
    }
  }

  drawCode(scene, charCount, scrollY) {
    if (charCount <= 0) return;
    const ctx = this.ctx;
    const codeX = this.winX + CONFIG.code.paddingX + CONFIG.code.gutterWidth;
    const baseY = this.codeAreaY + CONFIG.code.paddingY - scrollY;
    const maxC = this.maxCols;

    ctx.font = `${CONFIG.code.fontSize}px ${CONFIG.code.fontFamily}`;
    ctx.textBaseline = "top";

    let col = 0, vLine = 0;

    for (let i = 0; i < charCount && i < scene.tokens.length; i++) {
      const t = scene.tokens[i];
      if (t.char === "\n") {
        vLine++; col = 0;
        continue;
      }
      if (t.char === "\t") {
        if (col + 2 > maxC) { vLine++; col = 0; }
        col += 2;
        continue;
      }
      if (col >= maxC) { vLine++; col = 0; }
      const x = codeX + col * this.charWidth;
      const y = baseY + vLine * CONFIG.code.lineHeight;
      if (y + CONFIG.code.lineHeight >= this.codeAreaY && y <= this.winY + this.winH) {
        ctx.fillStyle = t.color;
        ctx.fillText(t.char, x, y);
      }
      col++;
    }
  }

  drawCursor(scene, charCount, scrollY) {
    if (!scene.tokens || scene.tokens.length === 0) return;
    const ctx = this.ctx;
    const codeX = this.winX + CONFIG.code.paddingX + CONFIG.code.gutterWidth;
    const baseY = this.codeAreaY + CONFIG.code.paddingY - scrollY;
    const maxC = this.maxCols;

    let col = 0, vLine = 0;
    for (let i = 0; i < charCount && i < scene.tokens.length; i++) {
      const ch = scene.tokens[i].char;
      if (ch === "\n") { vLine++; col = 0; }
      else if (ch === "\t") {
        if (col + 2 > maxC) { vLine++; col = 0; }
        col += 2;
      } else {
        if (col >= maxC) { vLine++; col = 0; }
        col++;
      }
    }

    const x = codeX + col * this.charWidth;
    const y = baseY + vLine * CONFIG.code.lineHeight;

    // Blink: always show during typing, blink when idle
    const typing = charCount < scene.tokens.length;
    const show = typing || Math.floor(Date.now() / CONFIG.cursor.blinkMs) % 2 === 0;
    if (show) {
      ctx.fillStyle = CONFIG.cursor.color;
      ctx.fillRect(x, y, CONFIG.cursor.width, CONFIG.code.lineHeight);
    }
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

// ---------- Animator ----------

class Animator {
  constructor(renderer) {
    this.renderer = renderer;
    this.playing = false;
    this.cancelled = false;
    this.scrollY = 0;
  }

  cancel() { this.cancelled = true; }

  wait(ms) {
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        if (this.cancelled) return res();
        if (performance.now() - t0 >= ms) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  async playAll(scenes, onProgress) {
    this.playing = true;
    this.cancelled = false;

    const totalChars = scenes.reduce((s, sc) => s + sc.tokens.length, 0);
    let doneChars = 0;

    for (let i = 0; i < scenes.length; i++) {
      if (this.cancelled) break;
      this.scrollY = 0;

      // Fade in
      await this.fade(scenes[i], 0, true);
      if (this.cancelled) break;

      // Brief pause before typing
      await this.holdFrame(scenes[i], 0, CONFIG.transition.pauseMs);
      if (this.cancelled) break;

      // Type
      const sceneDone = doneChars;
      await this.typeScene(scenes[i], (p) => {
        onProgress?.((sceneDone + p * scenes[i].tokens.length) / totalChars);
      });
      doneChars += scenes[i].tokens.length;
      if (this.cancelled) break;

      // Hold end frame
      await this.holdFrame(scenes[i], scenes[i].tokens.length, CONFIG.transition.holdMs);
      if (this.cancelled) break;

      // Fade out (not on last scene)
      if (i < scenes.length - 1) {
        await this.fade(scenes[i], scenes[i].tokens.length, false);
        await this.wait(CONFIG.transition.pauseMs);
      }
    }

    this.playing = false;
  }

  async fade(scene, charCount, fadeIn) {
    const dur = CONFIG.transition.fadeMs;
    const t0 = performance.now();
    return new Promise((res) => {
      const tick = () => {
        if (this.cancelled) return res();
        const p = Math.min((performance.now() - t0) / dur, 1);
        const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
        const opacity = fadeIn ? ease : 1 - ease;
        this.renderer.render(scene, charCount, opacity, this.scrollY);
        if (p < 1) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
  }

  async holdFrame(scene, charCount, ms) {
    const t0 = performance.now();
    return new Promise((res) => {
      const tick = () => {
        if (this.cancelled) return res();
        this.renderer.render(scene, charCount, 1, this.scrollY);
        if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
  }

  async typeScene(scene, onProgress) {
    const total = scene.tokens.length;
    if (total === 0) return;

    const maxVis = this.renderer.maxVisibleLines;
    let charIdx = 0;
    let lastTime = performance.now();
    let accum = 0;

    return new Promise((res) => {
      const tick = () => {
        if (this.cancelled) return res();

        const now = performance.now();
        const dt = now - lastTime;
        lastTime = now;

        // Determine speed
        let cps = CONFIG.typing.cps;
        if (charIdx < total) {
          const ch = scene.tokens[charIdx].char;
          if (ch === " " || ch === "\t") {
            // Check if leading whitespace
            let leading = true;
            for (let j = charIdx - 1; j >= 0; j--) {
              if (scene.tokens[j].char === "\n") break;
              if (scene.tokens[j].char !== " " && scene.tokens[j].char !== "\t") { leading = false; break; }
            }
            if (leading) cps = CONFIG.typing.indentCps;
          }
        }

        accum += dt * cps / 1000;
        const add = Math.floor(accum);
        if (add > 0) {
          accum -= add;
          charIdx = Math.min(charIdx + add, total);
        }

        // Extra delays after certain characters (only when we just advanced)
        if (add > 0 && charIdx > 0 && charIdx < total) {
          const prev = scene.tokens[charIdx - 1].char;
          if (prev === "\n") accum -= CONFIG.typing.lineDelay * cps / 1000;
          else if ("({[;:,.".includes(prev)) accum -= CONFIG.typing.punctDelay * cps / 1000;
        }

        // Smooth scroll (use visual lines to account for wrapping)
        const curLine = this.renderer.countVisualLines(scene.tokens, charIdx);
        const targetScroll = Math.max(0, (curLine - maxVis + 4) * CONFIG.code.lineHeight);
        this.scrollY += (targetScroll - this.scrollY) * 0.12;

        this.renderer.render(scene, charIdx, 1, this.scrollY);
        onProgress?.(charIdx / total);

        if (charIdx < total) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
  }
}

// ---------- Video Recorder ----------

class Recorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.chunks = [];
    this.mr = null;
  }

  start() {
    const stream = this.canvas.captureStream(CONFIG.recording.fps);
    let mime = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm";
    this.mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: CONFIG.recording.bitrate });
    this.chunks = [];
    this.mr.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.mr.start(100);
  }

  stop() {
    return new Promise((res) => {
      this.mr.onstop = () => res(new Blob(this.chunks, { type: "video/webm" }));
      this.mr.stop();
    });
  }
}

// ---------- Application ----------

class App {
  constructor() {
    this.scenes = [];
    this.sceneIdx = 0;
    this.renderer = null;
    this.animator = null;
    this.recorder = null;
    this.init();
  }

  init() {
    // Elements
    this.$ = {
      canvas: document.getElementById("preview-canvas"),
      code: document.getElementById("code-input"),
      lang: document.getElementById("lang-select"),
      title: document.getElementById("title-input"),
      scenes: document.getElementById("scene-list"),
      addScene: document.getElementById("add-scene"),
      play: document.getElementById("play-btn"),
      export: document.getElementById("export-btn"),
      speed: document.getElementById("speed-input"),
      fontSize: document.getElementById("font-size-input"),
      resolution: document.getElementById("resolution-select"),
      progress: document.getElementById("progress-bar"),
      status: document.getElementById("status-text"),
    };

    this.renderer = new Renderer(this.$.canvas);
    this.animator = new Animator(this.renderer);
    this.recorder = new Recorder(this.$.canvas);

    // Default scene with sample code
    this.addScene(SAMPLE_CODE, "typescript", "extractGifFrames.ts");
    this.bindEvents();
    this.renderPreview();
  }

  addScene(code = "", lang = "typescript", title = "untitled.ts") {
    const tokens = code ? tokenizeCode(code, lang) : [];
    this.scenes.push({ code, language: lang, title, tokens });
    this.sceneIdx = this.scenes.length - 1;
    this.updateUI();
  }

  removeScene(i) {
    if (this.scenes.length <= 1) return;
    this.scenes.splice(i, 1);
    if (this.sceneIdx >= this.scenes.length) this.sceneIdx = this.scenes.length - 1;
    this.updateUI();
  }

  selectScene(i) {
    this.sceneIdx = i;
    this.updateUI();
  }

  syncScene() {
    const s = this.scenes[this.sceneIdx];
    s.code = this.$.code.value;
    s.language = this.$.lang.value;
    s.title = this.$.title.value;
    s.tokens = s.code ? tokenizeCode(s.code, s.language) : [];
    this.updateSceneList();
    this.renderPreview();
  }

  updateUI() {
    const s = this.scenes[this.sceneIdx];
    this.$.code.value = s.code;
    this.$.lang.value = s.language;
    this.$.title.value = s.title;
    this.updateSceneList();
    this.renderPreview();
  }

  updateSceneList() {
    this.$.scenes.innerHTML = "";
    this.scenes.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = `scene-item${i === this.sceneIdx ? " active" : ""}`;
      el.innerHTML = `
        <span class="scene-name" data-i="${i}">${s.title || "Scene " + (i + 1)}</span>
        ${this.scenes.length > 1 ? `<button class="scene-remove" data-i="${i}">&times;</button>` : ""}
      `;
      this.$.scenes.appendChild(el);
    });
  }

  renderPreview() {
    const s = this.scenes[this.sceneIdx];
    this.renderer.render(s, s.tokens.length, 1, 0);
  }

  applySettings() {
    CONFIG.typing.cps = parseInt(this.$.speed.value) || 40;
    CONFIG.code.fontSize = parseInt(this.$.fontSize.value) || 18;
    CONFIG.code.lineHeight = Math.round(CONFIG.code.fontSize * 1.55);
    const [w, h] = this.$.resolution.value.split("x").map(Number);
    this.renderer.resize(w, h);
    this.renderer.measureChar();
  }

  async play() {
    if (this.animator.playing) {
      this.animator.cancel();
      this.$.play.textContent = "Preview";
      this.$.status.textContent = "Ready";
      return;
    }
    this.applySettings();
    this.$.play.textContent = "Stop";
    this.$.status.textContent = "Playing...";
    await this.animator.playAll(this.scenes, (p) => {
      this.$.progress.style.width = `${p * 100}%`;
    });
    this.$.play.textContent = "Preview";
    this.$.status.textContent = "Ready";
    this.$.progress.style.width = "0%";
    this.renderPreview();
  }

  async exportVideo() {
    if (this.animator.playing) return;
    this.applySettings();
    this.$.export.disabled = true;
    this.$.play.disabled = true;
    this.$.status.textContent = "Recording...";

    this.recorder.start();
    await this.animator.playAll(this.scenes, (p) => {
      this.$.progress.style.width = `${p * 100}%`;
    });

    // Hold last frame
    await new Promise((r) => setTimeout(r, 1500));
    const webm = await this.recorder.stop();

    // Try server-side MP4 conversion
    this.$.status.textContent = "Converting to MP4...";
    let blob = webm;
    let name = "code-animation.webm";

    try {
      const fd = new FormData();
      fd.append("video", webm, "video.webm");
      const resp = await fetch("/api/convert", { method: "POST", body: fd });
      if (resp.ok) {
        blob = await resp.blob();
        name = "code-animation.mp4";
      }
    } catch {
      // ffmpeg not available, keep WebM
    }

    // Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);

    this.$.export.disabled = false;
    this.$.play.disabled = false;
    this.$.status.textContent = `Exported ${name}`;
    this.$.progress.style.width = "0%";
    this.renderPreview();
  }

  bindEvents() {
    this.$.code.addEventListener("input", () => this.syncScene());
    this.$.lang.addEventListener("change", () => this.syncScene());
    this.$.title.addEventListener("input", () => this.syncScene());

    // Tab support in textarea
    this.$.code.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.substring(0, start) + "  " + e.target.value.substring(end);
        e.target.selectionStart = e.target.selectionEnd = start + 2;
        this.syncScene();
      }
    });

    // Scene list
    this.$.scenes.addEventListener("click", (e) => {
      const name = e.target.closest(".scene-name");
      const rm = e.target.closest(".scene-remove");
      if (name) this.selectScene(parseInt(name.dataset.i));
      if (rm) this.removeScene(parseInt(rm.dataset.i));
    });

    this.$.addScene.addEventListener("click", () => this.addScene());
    this.$.play.addEventListener("click", () => this.play());
    this.$.export.addEventListener("click", () => this.exportVideo());

    this.$.fontSize.addEventListener("change", () => {
      this.applySettings();
      this.renderPreview();
    });

    this.$.resolution.addEventListener("change", () => {
      this.applySettings();
      this.renderPreview();
    });
  }
}

// ---------- Sample Code ----------

const SAMPLE_CODE = `async function extractGifFrames(imageBuffer: Buffer): Promise<Buffer[]> {
  const metadata = await sharp(imageBuffer).metadata();
  const totalFrames = metadata.pages ?? 1;

  if (totalFrames <= 1) return [imageBuffer];

  const frameIndices: number[] = [];
  for (let i = 0; i < Math.min(MAX_GIF_FRAMES, totalFrames); i++) {
    frameIndices.push(
      Math.round(i * (totalFrames - 1) / (Math.min(MAX_GIF_FRAMES, totalFrames) - 1))
    );
  }

  const frames: Buffer[] = [];
  for (const page of frameIndices) {
    const frame = await sharp(imageBuffer, { page })
      .png()
      .toBuffer();
    frames.push(frame);
  }
  return frames;
}`;

// ---------- Boot ----------

document.fonts.ready.then(() => {
  window.app = new App();
});
