const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Core = require('../assets/tetris-scripts/tetris-core.js');

test('1. Tetris Asset Manifest — All referenced files exist on disk', () => {
  const rootDir = path.resolve(__dirname, '..');

  Core.ASSETS.images.forEach(imgPath => {
    const fullPath = path.join(rootDir, imgPath);
    assert.ok(fs.existsSync(fullPath), `Missing image asset: ${imgPath}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `Empty image asset: ${imgPath}`);
  });

  Core.ASSETS.audio.forEach(audioPath => {
    const fullPath = path.join(rootDir, audioPath);
    assert.ok(fs.existsSync(fullPath), `Missing audio asset: ${audioPath}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 44, `WAV asset too small / invalid: ${audioPath}`);
  });
});

test('2. Matrix and Tetromino Geometry Definitions', () => {
  assert.equal(Core.COLS, 10);
  assert.equal(Core.ROWS, 20);
  assert.equal(Core.TOTAL_ROWS, 22);

  const types = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  types.forEach(t => {
    const def = Core.TETROMINOES[t];
    assert.ok(def, `Missing tetromino definition: ${t}`);
    assert.equal(def.rotations.length, 4, `${t} must have 4 rotation states`);
    assert.ok(def.color, `${t} must have a color`);
    assert.ok(def.texture, `${t} must have a texture identifier`);
  });
});

test('3. 7-Bag Randomizer produces uniform permutations', () => {
  const bag = Core.generate7Bag();
  assert.equal(bag.length, 7);
  const unique = new Set(bag);
  assert.equal(unique.size, 7);
  ['I', 'J', 'L', 'O', 'S', 'T', 'Z'].forEach(t => {
    assert.ok(unique.has(t));
  });
});

test('4. Collision Detection and Boundaries', () => {
  const board = Core.createBoard();
  const piece = Core.createPiece('O'); // 2x2 at (4, 0)

  // Valid position
  assert.equal(Core.isValidPosition(board, piece, 0, 0), true);

  // Left boundary collision
  assert.equal(Core.isValidPosition(board, piece, -5, 0), false);

  // Right boundary collision
  assert.equal(Core.isValidPosition(board, piece, 5, 0), false);

  // Bottom floor collision
  assert.equal(Core.isValidPosition(board, piece, 0, 22), false);

  // Block collision
  board[10][4] = { type: 'I', color: '#00f0ff' };
  piece.y = 9;
  assert.equal(Core.isValidPosition(board, piece, 0, 0), false);
});

test('5. Super Rotation System (SRS) Wall-Kicks', () => {
  const board = Core.createBoard();
  const piece = Core.createPiece('T'); // 3x3 at (3, 0)

  // Rotate in open space
  const rotRes = Core.tryRotate(board, piece, 1);
  assert.equal(rotRes.success, true);
  assert.equal(rotRes.newPiece.rotation, 1);

  // Rotate against right wall: piece at x = 8 in rotation 0
  const wallPiece = { ...piece, x: 8, rotation: 0 };
  const kickRes = Core.tryRotate(board, wallPiece, 1);
  assert.equal(kickRes.success, true);
  assert.equal(kickRes.newPiece.x, 7, 'Piece should kick left away from wall to x=7');
});

test('6. Ghost Piece Projection Solver', () => {
  const board = Core.createBoard();
  const piece = Core.createPiece('I'); // spawns at (3, 0), shape in row 1
  const ghostY = Core.getGhostY(board, piece);
  assert.equal(ghostY, Core.TOTAL_ROWS - 2); // 4x4 with line on row 1 reaches row 21
});

test('7. Line Clear Detection and Board Rebuilding', () => {
  const board = Core.createBoard();
  // Fill row 21 completely except col 0
  for (let c = 1; c < Core.COLS; c++) {
    board[21][c] = { type: 'I', color: '#00f0ff' };
  }

  // Lock a piece that completes row 21
  const piece = {
    type: 'O',
    rotation: 0,
    x: 0,
    y: 20,
    color: '#ffd700',
    texture: 'block-o'
  };

  const lockRes = Core.lockPiece(board, piece);
  assert.equal(lockRes.gameOver, false);
  assert.equal(lockRes.linesCleared, 1);
  assert.equal(lockRes.board.length, Core.TOTAL_ROWS);
  // Top row must be empty
  assert.ok(lockRes.board[0].every(cell => cell === null));
});

test('8. Scoring and Combo Multipliers', () => {
  assert.equal(Core.calculateScore(1, 1), 100);
  assert.equal(Core.calculateScore(2, 1), 300);
  assert.equal(Core.calculateScore(3, 1), 500);
  assert.equal(Core.calculateScore(4, 1), 800); // Tetris
  assert.equal(Core.calculateScore(4, 3), 2400); // Level 3 Tetris
  assert.equal(Core.calculateScore(0, 1, true, 15), 30); // Hard drop 15 rows
});

test('9. Campaign Levels Configuration and Stars Evaluation', () => {
  assert.equal(Core.LEVELS.length, 12);
  Core.LEVELS.forEach((lvl, idx) => {
    assert.equal(lvl.id, idx + 1);
    assert.ok(lvl.title);
    assert.ok(lvl.targetLines > 0);
    assert.ok(lvl.targetScore > 0);
    assert.ok(lvl.dropIntervalMs > 0);
  });

  const lvl1 = Core.LEVELS[0];
  assert.equal(Core.calculateStars(lvl1, 2, 200), 0); // below target
  assert.equal(Core.calculateStars(lvl1, 3, 300), 1); // target met
  assert.equal(Core.calculateStars(lvl1, 5, 450), 2); // 2 stars
  assert.equal(Core.calculateStars(lvl1, 7, 700), 3); // 3 stars
});

test('10. Save / Load Persistence System', () => {
  const memoryStore = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = v; }
  };

  // Fresh load gives defaults
  const fresh = Core.loadSaveData(memoryStore);
  assert.equal(fresh.version, 1);
  assert.deepEqual(fresh.unlockedLevels, [1]);

  // Save new progress
  fresh.unlockedLevels.push(2);
  fresh.levelStars[1] = 3;
  fresh.highScore = 1500;
  Core.saveGameData(memoryStore, fresh);

  // Reload
  const loaded = Core.loadSaveData(memoryStore);
  assert.deepEqual(loaded.unlockedLevels, [1, 2]);
  assert.equal(loaded.levelStars[1], 3);
  assert.equal(loaded.highScore, 1500);

  // Corrupted data handling
  memoryStore.setItem('tetris_save_v1', 'NOT_JSON{[');
  const recovered = Core.loadSaveData(memoryStore);
  assert.equal(recovered.version, 1);
  assert.deepEqual(recovered.unlockedLevels, [1]);
});
