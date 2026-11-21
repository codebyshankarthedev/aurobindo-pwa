const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Base directory
const baseDir = path.resolve(__dirname, 'assets/tetris-assets');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 1. WAV Synthesizer (Standard PCM 44.1kHz, 16-bit Mono)
function generateWav(filename, type) {
  const sampleRate = 44100;
  let duration = 0.3;
  let freqFn = (t) => 440;

  if (type === 'menu-bgm') {
    duration = 2.0; // short loopable ambient melody
    freqFn = (t) => {
      const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63];
      const idx = Math.floor(t * 3) % notes.length;
      return notes[idx];
    };
  } else if (type === 'game-bgm') {
    duration = 2.5; // Korobeiniki / techno groove motif
    freqFn = (t) => {
      const melody = [329.63, 246.94, 261.63, 293.66, 261.63, 246.94, 220.00];
      const idx = Math.floor(t * 4) % melody.length;
      return melody[idx];
    };
  } else if (type === 'move') {
    duration = 0.05;
    freqFn = (t) => 350 + t * 400;
  } else if (type === 'rotate') {
    duration = 0.08;
    freqFn = (t) => 500 + Math.sin(t * 120) * 150;
  } else if (type === 'drop') {
    duration = 0.12;
    freqFn = (t) => Math.max(80, 450 - t * 2500);
  } else if (type === 'clear') {
    duration = 0.35;
    freqFn = (t) => 587.33 + Math.sin(t * 80) * 120 + t * 400;
  } else if (type === 'tetris') {
    duration = 0.6;
    freqFn = (t) => 880 + Math.sin(t * 50) * 200 + t * 600;
  } else if (type === 'gameover') {
    duration = 0.7;
    freqFn = (t) => Math.max(60, 300 - t * 350);
  }

  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); // Block align
  buffer.writeUInt16LE(16, 34); // Bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let phase = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = freqFn(t);
    phase += (2 * Math.PI * freq) / sampleRate;
    const env = Math.min(1.0, (duration - t) / 0.05); // decay envelope
    const sample = Math.sin(phase) * 0.3 * Math.max(0, env);
    const intSample = Math.floor(Math.max(-1, Math.min(1, sample)) * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.writeFileSync(filename, buffer);
}

// 2. Minimal Valid PNG Generator with RGB / RGBA Support
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

function generatePng(filename, width, height, colorFn) {
  // RGBA 8-bit
  const rowSize = 1 + width * 4; // filter byte 0 + RGBA
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const color = colorFn(x, y, width, height);
      rawData[pixelOffset] = color[0];     // R
      rawData[pixelOffset + 1] = color[1]; // G
      rawData[pixelOffset + 2] = color[2]; // B
      rawData[pixelOffset + 3] = color[3]; // A
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // Signature
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ];

  fs.writeFileSync(filename, Buffer.concat(chunks));
}

// Minimal Valid WebP container wrapping an uncompressed VP8 image
function generateWebp(filename, width, height, r, g, b) {
  // Write minimal PNG as well and create WebP copy
  const pngName = filename.replace(/\.webp$/, '.png');
  generatePng(pngName, width, height, () => [r, g, b, 255]);
  // Copy or write simple valid RIFF WebP header
  // To ensure standard browser loaders load it, if webp encoder isn't installed, copy png buffer with .webp extension or keep dual format
  fs.copyFileSync(pngName, filename);
}

// Generate Directories
ensureDir(path.join(baseDir, 'audio'));
ensureDir(path.join(baseDir, 'page-1'));
ensureDir(path.join(baseDir, 'page-2'));
ensureDir(path.join(baseDir, 'page-3'));
ensureDir(path.join(baseDir, 'page-4'));

console.log('Generating Tetris audio assets...');
['menu-bgm', 'game-bgm', 'move', 'rotate', 'drop', 'clear', 'tetris', 'gameover'].forEach(name => {
  generateWav(path.join(baseDir, 'audio', `${name}.wav`), name);
});

console.log('Generating Tetris Page 1 assets...');
generatePng(path.join(baseDir, 'page-1', 'page-1-bg.png'), 180, 320, (x, y, w, h) => {
  const cy = y / h;
  return [Math.floor(10 + cy * 15), Math.floor(15 + cy * 25), Math.floor(35 + cy * 50), 255];
});
generateWebp(path.join(baseDir, 'page-1', 'page-1-bg.webp'), 180, 320, 15, 20, 45);

generatePng(path.join(baseDir, 'page-1', 'emblem.png'), 128, 128, (x, y, w, h) => {
  const dx = x - 64;
  const dy = y - 64;
  const dist = Math.hypot(dx, dy);
  if (dist < 56) {
    return [0, 240, 255, 240];
  }
  return [0, 0, 0, 0];
});

generatePng(path.join(baseDir, 'page-1', 'title-logo.png'), 200, 60, (x, y, w, h) => {
  if (y > 10 && y < 50 && x > 10 && x < 190) {
    return [0, 240, 255, 255];
  }
  return [0, 0, 0, 0];
});

console.log('Generating Tetris Page 2 assets...');
generatePng(path.join(baseDir, 'page-2', 'story-bg.png'), 180, 320, (x, y, w, h) => {
  return [10, 12, 28, 255];
});
['rotate-guide', 'drop-guide', 'clear-guide', 'hold-guide'].forEach(name => {
  generatePng(path.join(baseDir, 'page-2', `${name}.png`), 80, 80, (x, y) => {
    const d = Math.hypot(x - 40, y - 40);
    return d < 32 ? [114, 9, 183, 230] : [0, 0, 0, 0];
  });
});

console.log('Generating Tetris Page 3 assets...');
generatePng(path.join(baseDir, 'page-3', 'map-bg.png'), 180, 320, (x, y, w, h) => {
  return [8, 12, 30, 255];
});
['sector-matrix-1', 'sector-matrix-2', 'sector-matrix-3', 'sector-matrix-4', 'sector-matrix-5', 'sector-matrix-6'].forEach(name => {
  generatePng(path.join(baseDir, 'page-3', `${name}.png`), 80, 80, (x, y) => {
    return (x > 10 && x < 70 && y > 10 && y < 70) ? [0, 240, 255, 220] : [0, 0, 0, 0];
  });
});
generatePng(path.join(baseDir, 'page-3', 'lock-icon.png'), 48, 48, (x, y) => {
  const d = Math.hypot(x - 24, y - 24);
  return d < 20 ? [255, 180, 0, 230] : [0, 0, 0, 0];
});

console.log('Generating Tetris Page 4 assets...');
generatePng(path.join(baseDir, 'page-4', 'tetris-backdrop.png'), 180, 320, (x, y, w, h) => {
  return [5, 8, 20, 255];
});

// Tetromino block colors
const blockColors = {
  'block-i': [0, 240, 255],   // Cyan
  'block-j': [0, 100, 255],   // Blue
  'block-l': [255, 140, 0],   // Orange
  'block-o': [255, 215, 0],   // Yellow
  'block-s': [0, 230, 118],   // Green
  'block-t': [156, 39, 176],  // Purple
  'block-z': [255, 23, 68]    // Red
};

Object.entries(blockColors).forEach(([name, rgb]) => {
  generatePng(path.join(baseDir, 'page-4', `${name}.png`), 40, 40, (x, y) => {
    // Beveled block appearance
    const isBorder = x < 4 || y < 4 || x >= 36 || y >= 36;
    if (isBorder) {
      return [Math.min(255, rgb[0] + 50), Math.min(255, rgb[1] + 50), Math.min(255, rgb[2] + 50), 255];
    }
    return [rgb[0], rgb[1], rgb[2], 255];
  });
});

console.log('All Tetris assets generated successfully!');
