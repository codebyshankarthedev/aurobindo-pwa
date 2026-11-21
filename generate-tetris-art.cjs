const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const baseDir = path.resolve(__dirname, 'assets/tetris-assets');

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
    rawData[rawRow] = 0; // Filter None
    const srcRow = y * width * 4;
    bufferRgba.copy(rawData, rawRow + 1, srcRow, srcRow + width * 4);
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
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

// Pixel canvas utility
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

  // Draw a 3D beveled tetromino block
  drawTetrisBlock(bx, by, size, rgb, glow = true) {
    const [r, g, b] = rgb;

    // Outer glow aura
    if (glow) {
      const glowR = size * 0.4;
      for (let y = by - glowR; y < by + size + glowR; y++) {
        for (let x = bx - glowR; x < bx + size + glowR; x++) {
          const dx = Math.max(bx - x, 0, x - (bx + size));
          const dy = Math.max(by - y, 0, y - (by + size));
          const dist = Math.hypot(dx, dy);
          if (dist < glowR) {
            const glowAlpha = Math.floor((1 - dist / glowR) * 60);
            this.setPixel(x, y, r, g, b, glowAlpha);
          }
        }
      }
    }

    // Main block base
    this.fillRect(bx, by, size, size, r, g, b, 255);

    // Bevel highlights (Top & Left)
    const highlightR = Math.min(255, r + 70);
    const highlightG = Math.min(255, g + 70);
    const highlightB = Math.min(255, b + 70);
    const bevel = Math.max(2, Math.floor(size * 0.14));

    for (let i = 0; i < bevel; i++) {
      for (let x = bx + i; x < bx + size - i; x++) {
        this.setPixel(x, by + i, highlightR, highlightG, highlightB, 240); // Top
      }
      for (let y = by + i; y < by + size - i; y++) {
        this.setPixel(bx + i, y, highlightR, highlightG, highlightB, 240); // Left
      }
    }

    // Bevel shadows (Bottom & Right)
    const shadowR = Math.floor(r * 0.5);
    const shadowG = Math.floor(g * 0.5);
    const shadowB = Math.floor(b * 0.5);

    for (let i = 0; i < bevel; i++) {
      for (let x = bx + i; x < bx + size - i; x++) {
        this.setPixel(x, by + size - 1 - i, shadowR, shadowG, shadowB, 240); // Bottom
      }
      for (let y = by + i; y < by + size - i; y++) {
        this.setPixel(bx + size - 1 - i, y, shadowR, shadowG, shadowB, 240); // Right
      }
    }

    // Inner glossy core
    const innerMargin = bevel + 2;
    const innerSize = size - innerMargin * 2;
    if (innerSize > 0) {
      const coreR = Math.min(255, Math.floor(r * 1.15));
      const coreG = Math.min(255, Math.floor(g * 1.15));
      const coreB = Math.min(255, Math.floor(b * 1.15));
      this.fillRect(bx + innerMargin, by + innerMargin, innerSize, innerSize, coreR, coreG, coreB, 255);
    }
  }

  // Draw full tetromino shape
  drawTetromino(grid, startX, startY, blockSize, rgb) {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === 1) {
          this.drawTetrisBlock(startX + c * blockSize, startY + r * blockSize, blockSize, rgb, true);
        }
      }
    }
  }

  savePng(filename) {
    writePng(filename, this.w, this.h, this.data);
  }
}

console.log('🎨 Generating high-resolution Tetris Game Launch Banner (360x640)...');
const banner = new PixelCanvas(360, 640);

// 1. Deep space Cyberpunk / QC Matrix background gradient
for (let y = 0; y < 640; y++) {
  const normY = y / 640;
  // Multi-stop gradient: Deep Indigo (#040714) -> Dark Royal Purple (#150d30) -> Cosmic Blue (#081226)
  let r, g, b;
  if (normY < 0.4) {
    const t = normY / 0.4;
    r = Math.floor(4 + t * 18);
    g = Math.floor(7 + t * 8);
    b = Math.floor(20 + t * 30);
  } else if (normY < 0.75) {
    const t = (normY - 0.4) / 0.35;
    r = Math.floor(22 - t * 14);
    g = Math.floor(15 - t * 3);
    b = Math.floor(50 - t * 15);
  } else {
    const t = (normY - 0.75) / 0.25;
    r = Math.floor(8 - t * 4);
    g = Math.floor(12 - t * 6);
    b = Math.floor(35 - t * 18);
  }

  for (let x = 0; x < 360; x++) {
    banner.setPixel(x, y, r, g, b, 255);
  }
}

// 2. Perspective Matrix Floor & Grid Lines
for (let x = 0; x <= 360; x += 30) {
  for (let y = 0; y < 640; y++) {
    const gridAlpha = Math.floor(18 + Math.sin(y * 0.04) * 8);
    banner.setPixel(x, y, 0, 240, 255, gridAlpha);
  }
}
for (let y = 0; y <= 640; y += 30) {
  for (let x = 0; x < 360; x++) {
    const gridAlpha = Math.floor(18 + Math.cos(x * 0.04) * 8);
    banner.setPixel(x, y, 0, 240, 255, gridAlpha);
  }
}

// 3. Digital sparkles & ambient matrix stars
for (let i = 0; i < 90; i++) {
  const sx = (i * 73 + 17) % 360;
  const sy = (i * 97 + 31) % 640;
  const brightness = (i % 3 === 0) ? 255 : 180;
  banner.setPixel(sx, sy, brightness, brightness, 255, 230);
  if (i % 5 === 0) {
    banner.setPixel(sx + 1, sy, 0, 240, 255, 150);
    banner.setPixel(sx - 1, sy, 0, 240, 255, 150);
    banner.setPixel(sx, sy + 1, 0, 240, 255, 150);
    banner.setPixel(sx, sy - 1, 0, 240, 255, 150);
  }
}

// 4. Cascading Vibrant Neon Tetrominoes
const B = 28; // block size for poster

// Cyan I-Piece (horizontal, glowing top center)
banner.drawTetromino(
  [[1, 1, 1, 1]],
  120, 95, B, [0, 240, 255]
);

// Gold O-Piece (top left)
banner.drawTetromino(
  [[1, 1], [1, 1]],
  36, 140, B, [255, 215, 0]
);

// Purple T-Piece (center feature piece)
banner.drawTetromino(
  [[0, 1, 0], [1, 1, 1]],
  135, 185, B, [170, 45, 235]
);

// Green S-Piece (right side)
banner.drawTetromino(
  [[0, 1, 1], [1, 1, 0]],
  245, 130, B, [0, 235, 120]
);

// Red Z-Piece (middle left)
banner.drawTetromino(
  [[1, 1, 0], [0, 1, 1]],
  45, 270, B, [255, 30, 70]
);

// Orange L-Piece (middle right)
banner.drawTetromino(
  [[0, 0, 1], [1, 1, 1]],
  240, 250, B, [255, 140, 0]
);

// Blue J-Piece (lower center)
banner.drawTetromino(
  [[1, 0, 0], [1, 1, 1]],
  140, 310, B, [0, 120, 255]
);

// Cyan I-Piece (vertical, diving into bottom stack)
banner.drawTetromino(
  [[1], [1], [1], [1]],
  290, 340, B, [0, 240, 255]
);

// 5. Synthesized Matrix Bottom Base (partially completed rows with glow)
const bottomRows = [
  // row 1: almost full line
  [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
  // row 2: solid filled row
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  // row 3: base foundation
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

const palette = [
  [0, 240, 255], [0, 120, 255], [255, 140, 0], [255, 215, 0],
  [0, 235, 120], [170, 45, 235], [255, 30, 70]
];

for (let r = 0; r < bottomRows.length; r++) {
  const by = 520 + r * 30;
  for (let c = 0; c < 11; c++) {
    if (bottomRows[r][c] === 1) {
      const colColor = palette[(r * 4 + c) % palette.length];
      banner.drawTetrisBlock(15 + c * 30, by, 28, colColor, false);
    }
  }
}

// 6. Glowing Line Clear Beam across bottom matrix
for (let x = 0; x < 360; x++) {
  for (let y = 548; y <= 552; y++) {
    banner.setPixel(x, y, 255, 255, 255, 240);
  }
  for (let y = 544; y <= 556; y++) {
    banner.setPixel(x, y, 0, 240, 255, 120);
  }
}

// Save outputs
const page1BgPng = path.join(baseDir, 'page-1', 'page-1-bg.png');
const page1BgWebp = path.join(baseDir, 'page-1', 'page-1-bg.webp');
const storyBgPng = path.join(baseDir, 'page-2', 'story-bg.png');
const mapBgPng = path.join(baseDir, 'page-3', 'map-bg.png');
const backdropPng = path.join(baseDir, 'page-4', 'tetris-backdrop.png');

banner.savePng(page1BgPng);
fs.copyFileSync(page1BgPng, page1BgWebp);
banner.savePng(storyBgPng);
banner.savePng(mapBgPng);
banner.savePng(backdropPng);

console.log('✅ Tetris launch banner and backgrounds generated successfully!');
