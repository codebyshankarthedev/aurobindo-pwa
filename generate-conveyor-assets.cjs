const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const baseDir = path.resolve(__dirname, 'assets/conveyor-sorter-assets');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 1. Synthesize 16-bit PCM Mono WAV Audio
function generateWav(filename, type) {
  const sampleRate = 44100;
  let duration = 0.3;
  let freqFn = (t) => 440;

  if (type === 'menu-bgm') {
    duration = 2.4;
    freqFn = (t) => {
      const notes = [293.66, 369.99, 440.00, 587.33, 440.00, 369.99]; // D major cheerful arpeggio
      const idx = Math.floor(t * 3) % notes.length;
      return notes[idx];
    };
  } else if (type === 'game-bgm') {
    duration = 2.4;
    freqFn = (t) => {
      const melody = [329.63, 392.00, 493.88, 587.33, 493.88, 392.00, 440.00, 329.63]; // Energetic factory rhythm
      const idx = Math.floor(t * 4) % melody.length;
      return melody[idx];
    };
  } else if (type === 'grab') {
    duration = 0.08;
    freqFn = (t) => 400 + t * 500;
  } else if (type === 'drop-success') {
    duration = 0.25;
    freqFn = (t) => 523.25 + t * 400; // C5 to G5 joyful chime
  } else if (type === 'drop-fail') {
    duration = 0.3;
    freqFn = (t) => Math.max(100, 350 - t * 800); // Thud error buzzer
  } else if (type === 'combo') {
    duration = 0.35;
    freqFn = (t) => 659.25 + Math.sin(t * 60) * 120 + t * 300; // E5 chime with sparkle
  } else if (type === 'level-clear') {
    duration = 0.8;
    freqFn = (t) => 523.25 + Math.sin(t * 40) * 150 + t * 400; // Victory fanfare
  } else if (type === 'gameover') {
    duration = 0.7;
    freqFn = (t) => Math.max(60, 260 - t * 250); // Downward failure tone
  }

  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let phase = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = freqFn(t);
    phase += (2 * Math.PI * freq) / sampleRate;
    const env = Math.min(1.0, (duration - t) / 0.05);
    const sample = Math.sin(phase) * 0.3 * Math.max(0, env);
    const intSample = Math.floor(Math.max(-1, Math.min(1, sample)) * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.writeFileSync(filename, buffer);
}

// 2. PNG CRC32 & Chunks
function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  typeBuf.copy(chunk, 4);
  data.copy(chunk, 8);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function writePng(filename, width, height, bufferRgba) {
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rawRow = y * rowSize;
    rawData[rawRow] = 0;
    const srcRow = y * width * 4;
    bufferRgba.copy(rawData, rawRow + 1, srcRow, srcRow + width * 4);
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ];

  fs.writeFileSync(filename, Buffer.concat(chunks));
}

// High-Precision 5x7 Latin Typography Font (Crystal-clear English letters & digits)
const FONT_5X7 = {
  'A': [
    " ### ",
    "#   #",
    "#   #",
    "#####",
    "#   #",
    "#   #",
    "#   #"
  ],
  'B': [
    "#### ",
    "#   #",
    "#   #",
    "#### ",
    "#   #",
    "#   #",
    "#### "
  ],
  'C': [
    " ####",
    "#    ",
    "#    ",
    "#    ",
    "#    ",
    "#    ",
    " ####"
  ],
  'D': [
    "#### ",
    "#   #",
    "#   #",
    "#   #",
    "#   #",
    "#   #",
    "#### "
  ],
  'E': [
    "#####",
    "#    ",
    "#    ",
    "#### ",
    "#    ",
    "#    ",
    "#####"
  ],
  'F': [
    "#####",
    "#    ",
    "#    ",
    "#### ",
    "#    ",
    "#    ",
    "#    "
  ],
  'K': [
    "#   #",
    "#  # ",
    "# #  ",
    "##   ",
    "# #  ",
    "#  # ",
    "#   #"
  ],
  'M': [
    "#   #",
    "## ##",
    "# # #",
    "#   #",
    "#   #",
    "#   #",
    "#   #"
  ],
  'S': [
    " ####",
    "#    ",
    "#    ",
    " ### ",
    "    #",
    "    #",
    "#### "
  ],
  'X': [
    "#   #",
    "#   #",
    " # # ",
    "  #  ",
    " # # ",
    "#   #",
    "#   #"
  ],
  '1': [
    "  #  ",
    " ##  ",
    "  #  ",
    "  #  ",
    "  #  ",
    "  #  ",
    " ### "
  ],
  '2': [
    " ### ",
    "#   #",
    "    #",
    "  ## ",
    " #   ",
    "#    ",
    "#####"
  ],
  '3': [
    "#### ",
    "    #",
    "    #",
    " ### ",
    "    #",
    "    #",
    "#### "
  ],
  '4': [
    "#   #",
    "#   #",
    "#   #",
    "#####",
    "    #",
    "    #",
    "    #"
  ],
  '5': [
    "#####",
    "#    ",
    "#    ",
    "#### ",
    "    #",
    "    #",
    "#### "
  ],
  '7': [
    "#####",
    "    #",
    "   # ",
    "  #  ",
    "  #  ",
    " #   ",
    " #   "
  ],
  '8': [
    " ### ",
    "#   #",
    "#   #",
    " ### ",
    "#   #",
    "#   #",
    " ### "
  ],
  '9': [
    " ### ",
    "#   #",
    "#   #",
    " ####",
    "    #",
    "   # ",
    " ##  "
  ]
};

// 3. PixelCanvas Helper
class PixelCanvas {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.data = Buffer.alloc(width * height * 4);
  }

  setPixel(x, y, r, g, b, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    const idx = (y * this.w + x) * 4;
    if (a >= 255) {
      this.data[idx] = r;
      this.data[idx + 1] = g;
      this.data[idx + 2] = b;
      this.data[idx + 3] = 255;
    } else {
      const alpha = a / 255;
      const inv = 1 - alpha;
      this.data[idx] = Math.floor(r * alpha + this.data[idx] * inv);
      this.data[idx + 1] = Math.floor(g * alpha + this.data[idx + 1] * inv);
      this.data[idx + 2] = Math.floor(b * alpha + this.data[idx + 2] * inv);
      this.data[idx + 3] = Math.max(this.data[idx + 3], a);
    }
  }

  fillRect(rx, ry, rw, rh, r, g, b, a = 255) {
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        this.setPixel(x, y, r, g, b, a);
      }
    }
  }

  drawCircle(cx, cy, radius, r, g, b, a = 255) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist <= radius) {
          this.setPixel(x, y, r, g, b, a);
        }
      }
    }
  }

  drawGlowCircle(cx, cy, radius, r, g, b) {
    for (let y = cy - radius * 1.5; y <= cy + radius * 1.5; y++) {
      for (let x = cx - radius * 1.5; x <= cx + radius * 1.5; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist <= radius * 1.5) {
          const alpha = Math.floor(Math.max(0, (1 - dist / (radius * 1.5))) * 120);
          this.setPixel(x, y, r, g, b, alpha);
        }
      }
    }
    this.drawCircle(cx, cy, radius, r, g, b, 255);
  }

  drawGlyph(char, cx, cy, scale = 2, r = 255, g = 255, b = 255, a = 255) {
    const glyph = FONT_5X7[char.toUpperCase()] || FONT_5X7['A'];
    const gw = 5 * scale;
    const gh = 7 * scale;
    const startX = Math.floor(cx - gw / 2);
    const startY = Math.floor(cy - gh / 2);
    for (let row = 0; row < 7; row++) {
      const line = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (line[col] === '#') {
          this.fillRect(startX + col * scale, startY + row * scale, scale, scale, r, g, b, a);
        }
      }
    }
  }

  // Draw 3D Bevelled Token Box with Real Font Typography
  drawTokenBox(bx, by, size, rgb, char = 'A') {
    const [r, g, b] = rgb;
    const rBevel = Math.min(255, r + 70);
    const gBevel = Math.min(255, g + 70);
    const bBevel = Math.min(255, b + 70);
    const rShadow = Math.floor(r * 0.45);
    const gShadow = Math.floor(g * 0.45);
    const bShadow = Math.floor(b * 0.45);

    // Ambient Glow around crate
    const glowR = size * 0.3;
    for (let y = by - glowR; y <= by + size + glowR; y++) {
      for (let x = bx - glowR; x <= bx + size + glowR; x++) {
        const dx = Math.max(bx - x, 0, x - (bx + size));
        const dy = Math.max(by - y, 0, y - (by + size));
        const dist = Math.hypot(dx, dy);
        if (dist < glowR) {
          this.setPixel(x, y, r, g, b, Math.floor((1 - dist / glowR) * 90));
        }
      }
    }

    // Base body
    this.fillRect(bx, by, size, size, r, g, b, 255);

    // Bevel highlights & shadow rims
    const bevel = Math.max(2, Math.floor(size * 0.12));
    for (let i = 0; i < bevel; i++) {
      for (let x = bx + i; x < bx + size - i; x++) {
        this.setPixel(x, by + i, rBevel, gBevel, bBevel, 255);
      }
      for (let y = by + i; y < by + size - i; y++) {
        this.setPixel(bx + i, y, rBevel, gBevel, bBevel, 255);
      }
      for (let x = bx + i; x < bx + size - i; x++) {
        this.setPixel(x, by + size - 1 - i, rShadow, gShadow, bShadow, 255);
      }
      for (let y = by + i; y < by + size - i; y++) {
        this.setPixel(bx + size - 1 - i, y, rShadow, gShadow, bShadow, 255);
      }
    }

    // Inner glossy surface
    const pad = bevel + 2;
    this.fillRect(bx + pad, by + pad, size - pad * 2, size - pad * 2, Math.min(255, r + 25), Math.min(255, g + 25), Math.min(255, b + 25), 255);

    // Draw genuine Latin / Number character with drop shadow
    const cx = bx + size / 2;
    const cy = by + size / 2;
    const scale = Math.max(2, Math.floor(size / 13));
    // Text drop shadow
    this.drawGlyph(char, cx + 1, cy + 2, scale, 10, 15, 25, 200);
    // Crisp white foreground letter
    this.drawGlyph(char, cx, cy, scale, 255, 255, 255, 255);
  }

  savePng(filename) {
    writePng(filename, this.w, this.h, this.data);
  }
}

// Ensure Directories
ensureDir(path.join(baseDir, 'audio'));
ensureDir(path.join(baseDir, 'page-1'));
ensureDir(path.join(baseDir, 'page-2'));
ensureDir(path.join(baseDir, 'page-3'));
ensureDir(path.join(baseDir, 'page-4'));

console.log('Generating Conveyor Sorter audio assets...');
['menu-bgm', 'game-bgm', 'grab', 'drop-success', 'drop-fail', 'combo', 'level-clear', 'gameover'].forEach(name => {
  generateWav(path.join(baseDir, 'audio', `${name}.wav`), name);
});

// Helper for high-tech QC factory background (Deep midnight laboratory gradient + grid)
function drawFactoryBackground(canvas) {
  const { w, h } = canvas;
  for (let y = 0; y < h; y++) {
    const normY = y / h;
    let r = Math.floor(5 + normY * 18);
    let g = Math.floor(9 + normY * 14);
    let b = Math.floor(25 + normY * 38);
    for (let x = 0; x < w; x++) {
      canvas.setPixel(x, y, r, g, b, 255);
    }
  }

  // Cyan laser grid lines
  for (let x = 0; x <= w; x += 24) {
    for (let y = 0; y < h; y++) {
      canvas.setPixel(x, y, 0, 240, 255, 14);
    }
  }
  for (let y = 0; y <= h; y += 24) {
    for (let x = 0; x < w; x++) {
      canvas.setPixel(x, y, 0, 240, 255, 14);
    }
  }
}

// =========================================================================
// 1. PAGE 1: GAME LAUNCH BANNER (360x640) - page-1-bg.png & page-1-bg.webp
// =========================================================================
console.log('Generating Conveyor Sorter 360x640 Game Launch Banner (page-1-bg.png)...');
const banner = new PixelCanvas(360, 640);
drawFactoryBackground(banner);

// Dual High-Tech Sorting Chambers at Top
// Left: Alphabets Container (Cyan)
banner.fillRect(20, 85, 145, 115, 10, 25, 55, 230);
banner.fillRect(24, 89, 137, 107, 0, 240, 255, 30);
for (let i = 0; i < 3; i++) {
  banner.fillRect(20 - i, 85 - i, 145 + i * 2, 3, 0, 240, 255, 220);
  banner.fillRect(20 - i, 200 + i, 145 + i * 2, 3, 0, 240, 255, 220);
  banner.fillRect(20 - i, 85 - i, 3, 115 + i * 2, 0, 240, 255, 220);
  banner.fillRect(165 + i, 85 - i, 3, 115 + i * 2, 0, 240, 255, 220);
}
// Show authentic 'A' token hovering towards chamber
banner.drawTokenBox(65, 115, 55, [0, 240, 255], 'A');

// Right: Numbers Container (Purple)
banner.fillRect(195, 85, 145, 115, 25, 10, 50, 230);
banner.fillRect(199, 89, 137, 107, 156, 39, 176, 30);
for (let i = 0; i < 3; i++) {
  banner.fillRect(195 - i, 85 - i, 145 + i * 2, 3, 156, 39, 176, 220);
  banner.fillRect(195 - i, 200 + i, 145 + i * 2, 3, 156, 39, 176, 220);
  banner.fillRect(195 - i, 85 - i, 3, 115 + i * 2, 156, 39, 176, 220);
  banner.fillRect(340 + i, 85 - i, 3, 115 + i * 2, 156, 39, 176, 220);
}
// Show authentic '7' token hovering towards chamber
banner.drawTokenBox(240, 115, 55, [255, 180, 0], '7');

// Moving Conveyor Belt in Middle Section
const beltY = 320;
const beltHeight = 70;
banner.fillRect(0, beltY, 360, beltHeight, 20, 28, 48, 255);
// Steel treads
for (let x = 0; x < 360; x += 28) {
  banner.fillRect(x, beltY, 4, beltHeight, 10, 14, 25, 255);
  banner.fillRect(x + 4, beltY, 2, beltHeight, 60, 80, 120, 200);
}
// Hazard chevron strips
for (let x = 0; x < 360; x += 18) {
  banner.fillRect(x, beltY - 6, 9, 6, 255, 215, 0, 255);
  banner.fillRect(x + 9, beltY - 6, 9, 6, 15, 15, 15, 255);
  banner.fillRect(x, beltY + beltHeight, 9, 6, 255, 215, 0, 255);
  banner.fillRect(x + 9, beltY + beltHeight, 9, 6, 15, 15, 15, 255);
}

// Authentic Latin & Number tokens riding the conveyor:
banner.drawTokenBox(20, beltY + 12, 46, [0, 240, 255], 'A');
banner.drawTokenBox(88, beltY + 12, 46, [255, 215, 0], '3');
banner.drawTokenBox(156, beltY + 12, 46, [0, 230, 118], 'B');
banner.drawTokenBox(224, beltY + 12, 46, [255, 23, 68], '8');
banner.drawTokenBox(292, beltY + 12, 46, [156, 39, 176], 'C');

// Laser beam
for (let y = 205; y <= beltY + 10; y++) {
  const beamX = 92 + Math.floor(Math.sin(y * 0.1) * 2);
  banner.setPixel(beamX, y, 0, 240, 255, 240);
  banner.setPixel(beamX - 1, y, 0, 240, 255, 150);
  banner.setPixel(beamX + 1, y, 0, 240, 255, 150);
}

const page1BgPng = path.join(baseDir, 'page-1', 'page-1-bg.png');
const page1BgWebp = path.join(baseDir, 'page-1', 'page-1-bg.webp');
banner.savePng(page1BgPng);
fs.copyFileSync(page1BgPng, page1BgWebp);

// Page 1 Emblem
console.log('Generating Page 1 Emblem & Title Logo...');
const emblem = new PixelCanvas(128, 128);
emblem.drawGlowCircle(64, 64, 52, 0, 240, 255);
emblem.drawCircle(64, 64, 44, 15, 25, 55, 255);
for (let a = 0; a < 8; a++) {
  const rad = (a * Math.PI) / 4;
  for (let d = 10; d < 38; d++) {
    emblem.setPixel(64 + Math.cos(rad) * d, 64 + Math.sin(rad) * d, 0, 240, 255, 230);
  }
}
emblem.savePng(path.join(baseDir, 'page-1', 'emblem.png'));

const titleLogo = new PixelCanvas(240, 70);
titleLogo.fillRect(10, 15, 220, 40, 0, 240, 255, 220);
titleLogo.savePng(path.join(baseDir, 'page-1', 'title-logo.png'));

// =========================================================================
// 2. PAGE 2: STORY & TUTORIAL BACKGROUND
// =========================================================================
const storyBg = new PixelCanvas(360, 640);
drawFactoryBackground(storyBg);
storyBg.savePng(path.join(baseDir, 'page-2', 'story-bg.png'));

console.log('Generating Page 2 Tutorial Guides...');
['drag-guide', 'containers-guide', 'keys-guide', 'score-guide'].forEach((name, idx) => {
  const guide = new PixelCanvas(80, 80);
  const colors = [[0, 240, 255], [156, 39, 176], [255, 215, 0], [0, 230, 118]];
  guide.drawGlowCircle(40, 40, 30, ...colors[idx]);
  guide.savePng(path.join(baseDir, 'page-2', `${name}.png`));
});

// =========================================================================
// 3. PAGE 3: SECTOR MAP BACKGROUND & BADGES
// =========================================================================
const mapBg = new PixelCanvas(360, 640);
drawFactoryBackground(mapBg);
mapBg.savePng(path.join(baseDir, 'page-3', 'map-bg.png'));

console.log('Generating Page 3 Sector Map Badges...');
for (let i = 1; i <= 6; i++) {
  const badge = new PixelCanvas(80, 80);
  badge.drawGlowCircle(40, 40, 32, 0, 240, 255);
  badge.fillRect(20, 20, 40, 40, 15, 25, 60, 255);
  badge.savePng(path.join(baseDir, 'page-3', `sector-belt-${i}.png`));
}
const lockIcon = new PixelCanvas(48, 48);
lockIcon.drawGlowCircle(24, 24, 18, 255, 180, 0);
lockIcon.savePng(path.join(baseDir, 'page-3', 'lock-icon.png'));

// =========================================================================
// 4. PAGE 4: GAMEPLAY BACKDROP (CRUCIAL: CLEAN INDUSTRIAL BACKGROUND ONLY!
//    NO FAKE STATIC TOKENS, NO DUPLICATE BELT, NO FAKE LASER!)
// =========================================================================
console.log('Generating Clean Page 4 Gameplay Backdrop (conveyor-backdrop.png)...');
const gameplayBackdrop = new PixelCanvas(360, 640);
drawFactoryBackground(gameplayBackdrop);

// Add subtle atmospheric laboratory lighting fixtures & telemetry grid
for (let y = 0; y < 640; y++) {
  // Left vertical laser guide line
  gameplayBackdrop.setPixel(16, y, 0, 240, 255, 35);
  // Right vertical laser guide line
  gameplayBackdrop.setPixel(343, y, 0, 240, 255, 35);
}
// Subtle top corner brackets
for (let i = 0; i < 20; i++) {
  gameplayBackdrop.setPixel(16 + i, 20, 0, 240, 255, 180);
  gameplayBackdrop.setPixel(16, 20 + i, 0, 240, 255, 180);
  gameplayBackdrop.setPixel(343 - i, 20, 0, 240, 255, 180);
  gameplayBackdrop.setPixel(343, 20 + i, 0, 240, 255, 180);
}
gameplayBackdrop.savePng(path.join(baseDir, 'page-4', 'conveyor-backdrop.png'));

// =========================================================================
// 5. HIGH-TECH EMPTY RECEIVING HOPPER CONTAINERS (NO HARDCODED FAKE TOKENS!)
// =========================================================================
console.log('Generating Clean Empty Receiving Containers (container-alpha.png & container-number.png)...');

// 1. container-alpha.png: Sleek Cyan Chute with glowing intake aperture
const contAlpha = new PixelCanvas(160, 110);
// Metallic casing
contAlpha.fillRect(4, 4, 152, 102, 12, 22, 45, 245);
// Cyan neon rim
for (let i = 0; i < 3; i++) {
  contAlpha.fillRect(4 - i, 4 - i, 152 + i * 2, 2, 0, 240, 255, 230);
  contAlpha.fillRect(4 - i, 106 + i, 152 + i * 2, 2, 0, 240, 255, 230);
  contAlpha.fillRect(4 - i, 4 - i, 2, 104 + i * 2, 0, 240, 255, 230);
  contAlpha.fillRect(156 + i, 4 - i, 2, 104 + i * 2, 0, 240, 255, 230);
}
// Interior dark receiving aperture with depth gradient
for (let y = 20; y < 94; y++) {
  const depth = Math.floor(5 + ((y - 20) / 74) * 20);
  contAlpha.fillRect(16, y, 128, 1, 5, 12 + depth, 25 + depth, 255);
}
// Tech guide markings inside intake
for (let x = 20; x < 140; x += 16) {
  contAlpha.fillRect(x, 22, 2, 70, 0, 240, 255, 30);
}
// Downward chevron intake arrow indicators ▼
for (let c = 0; c < 3; c++) {
  const ax = 56 + c * 24;
  contAlpha.fillRect(ax - 6, 50, 12, 2, 0, 240, 255, 200);
  contAlpha.fillRect(ax - 4, 54, 8, 2, 0, 240, 255, 220);
  contAlpha.fillRect(ax - 2, 58, 4, 2, 0, 240, 255, 255);
}
contAlpha.savePng(path.join(baseDir, 'page-4', 'container-alpha.png'));

// 2. container-number.png: Sleek Purple/Amber Chute with glowing intake aperture
const contNum = new PixelCanvas(160, 110);
// Metallic casing
contNum.fillRect(4, 4, 152, 102, 28, 12, 42, 245);
// Purple neon rim
for (let i = 0; i < 3; i++) {
  contNum.fillRect(4 - i, 4 - i, 152 + i * 2, 2, 186, 60, 220, 230);
  contNum.fillRect(4 - i, 106 + i, 152 + i * 2, 2, 186, 60, 220, 230);
  contNum.fillRect(4 - i, 4 - i, 2, 104 + i * 2, 186, 60, 220, 230);
  contNum.fillRect(156 + i, 4 - i, 2, 104 + i * 2, 186, 60, 220, 230);
}
// Interior dark receiving aperture with depth gradient
for (let y = 20; y < 94; y++) {
  const depth = Math.floor(5 + ((y - 20) / 74) * 20);
  contNum.fillRect(16, y, 128, 1, 20 + depth, 6, 25 + depth, 255);
}
// Tech guide markings inside intake
for (let x = 20; x < 140; x += 16) {
  contNum.fillRect(x, 22, 2, 70, 255, 180, 0, 30);
}
// Downward chevron intake arrow indicators ▼
for (let c = 0; c < 3; c++) {
  const ax = 56 + c * 24;
  contNum.fillRect(ax - 6, 50, 12, 2, 255, 180, 0, 200);
  contNum.fillRect(ax - 4, 54, 8, 2, 255, 180, 0, 220);
  contNum.fillRect(ax - 2, 58, 4, 2, 255, 180, 0, 255);
}
contNum.savePng(path.join(baseDir, 'page-4', 'container-number.png'));

// Conveyor belt track textures
const beltTex = new PixelCanvas(200, 60);
beltTex.fillRect(0, 0, 200, 60, 25, 35, 55, 255);
for (let x = 0; x < 200; x += 20) {
  beltTex.fillRect(x, 0, 4, 60, 10, 15, 25, 255);
}
beltTex.savePng(path.join(baseDir, 'page-4', 'conveyor-belt.png'));

// =========================================================================
// 6. INDIVIDUAL TOKEN SPRITES WITH CRISP REAL ALPHABETS & NUMBERS
// =========================================================================
console.log('Generating Individual Token Sprites (item-a.png through item-9.png)...');

// Letter item sprites
const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'k', 'm', 's', 'x'];
letters.forEach(ch => {
  const item = new PixelCanvas(64, 64);
  item.drawTokenBox(6, 6, 52, [0, 240, 255], ch.toUpperCase());
  item.savePng(path.join(baseDir, 'page-4', `item-${ch}.png`));
});

// Number item sprites
const numbers = ['1', '2', '3', '4', '5', '7', '8', '9'];
numbers.forEach(num => {
  const item = new PixelCanvas(64, 64);
  item.drawTokenBox(6, 6, 52, [255, 180, 0], num);
  item.savePng(path.join(baseDir, 'page-4', `item-${num}.png`));
});

console.log('All Conveyor Sorter assets successfully generated with authentic Latin typography and clean containers!');
