/**
 * Tetris Core Game Logic & Matrix Simulation Engine
 * Pure computational logic — zero DOM dependencies.
 * Adheres strictly to the Super Rotation System (SRS), 7-bag randomizer,
 * multi-level campaign progression, and resilient state persistence.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TetrisCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const HIDDEN_ROWS = 2; // Extra buffer rows above visible playfield
  const TOTAL_ROWS = ROWS + HIDDEN_ROWS;

  const SAVE_KEY = 'tetris_save_v1';

  // 1. Tetromino Shapes & Rotations (0: North, 1: East, 2: South, 3: West)
  const TETROMINOES = {
    I: {
      id: 'I',
      color: '#00f0ff',
      texture: 'block-i',
      rotations: [
        [
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [0, 0, 0, 0],
          [0, 0, 0, 0]
        ],
        [
          [0, 0, 1, 0],
          [0, 0, 1, 0],
          [0, 0, 1, 0],
          [0, 0, 1, 0]
        ],
        [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [0, 0, 0, 0]
        ],
        [
          [0, 1, 0, 0],
          [0, 1, 0, 0],
          [0, 1, 0, 0],
          [0, 1, 0, 0]
        ]
      ]
    },
    J: {
      id: 'J',
      color: '#0066ff',
      texture: 'block-j',
      rotations: [
        [
          [1, 0, 0],
          [1, 1, 1],
          [0, 0, 0]
        ],
        [
          [0, 1, 1],
          [0, 1, 0],
          [0, 1, 0]
        ],
        [
          [0, 0, 0],
          [1, 1, 1],
          [0, 0, 1]
        ],
        [
          [0, 1, 0],
          [0, 1, 0],
          [1, 1, 0]
        ]
      ]
    },
    L: {
      id: 'L',
      color: '#ff8800',
      texture: 'block-l',
      rotations: [
        [
          [0, 0, 1],
          [1, 1, 1],
          [0, 0, 0]
        ],
        [
          [0, 1, 0],
          [0, 1, 0],
          [0, 1, 1]
        ],
        [
          [0, 0, 0],
          [1, 1, 1],
          [1, 0, 0]
        ],
        [
          [1, 1, 0],
          [0, 1, 0],
          [0, 1, 0]
        ]
      ]
    },
    O: {
      id: 'O',
      color: '#ffd700',
      texture: 'block-o',
      rotations: [
        [
          [1, 1],
          [1, 1]
        ],
        [
          [1, 1],
          [1, 1]
        ],
        [
          [1, 1],
          [1, 1]
        ],
        [
          [1, 1],
          [1, 1]
        ]
      ]
    },
    S: {
      id: 'S',
      color: '#00e676',
      texture: 'block-s',
      rotations: [
        [
          [0, 1, 1],
          [1, 1, 0],
          [0, 0, 0]
        ],
        [
          [0, 1, 0],
          [0, 1, 1],
          [0, 0, 1]
        ],
        [
          [0, 0, 0],
          [0, 1, 1],
          [1, 1, 0]
        ],
        [
          [1, 0, 0],
          [1, 1, 0],
          [0, 1, 0]
        ]
      ]
    },
    T: {
      id: 'T',
      color: '#9c27b0',
      texture: 'block-t',
      rotations: [
        [
          [0, 1, 0],
          [1, 1, 1],
          [0, 0, 0]
        ],
        [
          [0, 1, 0],
          [0, 1, 1],
          [0, 1, 0]
        ],
        [
          [0, 0, 0],
          [1, 1, 1],
          [0, 1, 0]
        ],
        [
          [0, 1, 0],
          [1, 1, 0],
          [0, 1, 0]
        ]
      ]
    },
    Z: {
      id: 'Z',
      color: '#ff1744',
      texture: 'block-z',
      rotations: [
        [
          [1, 1, 0],
          [0, 1, 1],
          [0, 0, 0]
        ],
        [
          [0, 0, 1],
          [0, 1, 1],
          [0, 1, 0]
        ],
        [
          [0, 0, 0],
          [1, 1, 0],
          [0, 1, 1]
        ],
        [
          [0, 1, 0],
          [1, 1, 0],
          [1, 0, 0]
        ]
      ]
    }
  };

  // 2. Super Rotation System (SRS) Kick Tables
  // Kicks format: [dx, dy] where positive y is down, negative y is up
  const SRS_KICKS_JLSTZ = {
    '0->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1->0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '1->2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '2->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '3->2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '3->0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '0->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
  };

  const SRS_KICKS_I = {
    '0->1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '1->0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '1->2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '2->1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '2->3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '3->2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '3->0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '0->3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
  };

  // 3. Campaign Levels
  const LEVELS = [
    {
      id: 1,
      title: 'Calibration Matrix',
      sector: 'QC Intake Grid',
      sectorBadge: 'sector-matrix-1',
      targetLines: 3,
      targetScore: 300,
      dropIntervalMs: 800,
      description: 'Clear 3 lines to calibrate matrix synchronization.'
    },
    {
      id: 2,
      title: 'Buffer Alignment',
      sector: 'Purity Station A',
      sectorBadge: 'sector-matrix-2',
      targetLines: 5,
      targetScore: 600,
      dropIntervalMs: 720,
      description: 'Clear 5 lines before buffer overflow occurs.'
    },
    {
      id: 3,
      title: 'Synthesizer Core',
      sector: 'Solvent Vault',
      sectorBadge: 'sector-matrix-3',
      targetLines: 7,
      targetScore: 1000,
      dropIntervalMs: 640,
      description: 'Align 7 synthesized block chains.'
    },
    {
      id: 4,
      title: 'Purity Filtration',
      sector: 'Assay Chamber',
      sectorBadge: 'sector-matrix-4',
      targetLines: 10,
      targetScore: 1500,
      dropIntervalMs: 560,
      description: 'Filter 10 polymer rows under accelerating flux.'
    },
    {
      id: 5,
      title: 'QC Core Compression',
      sector: 'Compression Lab',
      sectorBadge: 'sector-matrix-5',
      targetLines: 12,
      targetScore: 2200,
      dropIntervalMs: 500,
      description: 'Reach 2,200 points through tactical combos.'
    },
    {
      id: 6,
      title: 'High-Flux Reaction',
      sector: 'Thermal Reactor',
      sectorBadge: 'sector-matrix-6',
      targetLines: 14,
      targetScore: 3000,
      dropIntervalMs: 440,
      description: 'Clear 14 lines under high-temperature gravitational drift.'
    },
    {
      id: 7,
      title: 'Catalytic Surge',
      sector: 'Accelerator Wing',
      sectorBadge: 'sector-matrix-1',
      targetLines: 16,
      targetScore: 4000,
      dropIntervalMs: 380,
      description: 'Sustain structural integrity during rapid synthesis.'
    },
    {
      id: 8,
      title: 'Resonance Cascade',
      sector: 'Crystal Chamber',
      sectorBadge: 'sector-matrix-2',
      targetLines: 18,
      targetScore: 5000,
      dropIntervalMs: 340,
      description: 'Execute a 4-line Tetris clear to neutralize resonance.'
    },
    {
      id: 9,
      title: 'Sub-Atomic Fusion',
      sector: 'Isotope Hub',
      sectorBadge: 'sector-matrix-3',
      targetLines: 20,
      targetScore: 6500,
      dropIntervalMs: 300,
      description: 'Clear 20 lines with rapid lateral maneuvering.'
    },
    {
      id: 10,
      title: 'Orbital Synchronizer',
      sector: 'Cosmic Array',
      sectorBadge: 'sector-matrix-4',
      targetLines: 22,
      targetScore: 8000,
      dropIntervalMs: 260,
      description: 'Lock 22 matrix rows with zero containment breaches.'
    },
    {
      id: 11,
      title: 'Hyperdrive Warp',
      sector: 'Dimensional Gate',
      sectorBadge: 'sector-matrix-5',
      targetLines: 25,
      targetScore: 10000,
      dropIntervalMs: 220,
      description: 'Extreme speed: Clear 25 rows at hyper-velocity.'
    },
    {
      id: 12,
      title: 'Singularity Apex',
      sector: 'Apex Crucible',
      sectorBadge: 'sector-matrix-6',
      targetLines: 30,
      targetScore: 13000,
      dropIntervalMs: 180,
      description: 'The Ultimate Matrix Test: 30 lines at maximum flux.'
    }
  ];

  // 4. Asset Manifest (Strictly matches on-disk files)
  const ASSETS = {
    images: [
      'assets/tetris-assets/page-1/page-1-bg.png',
      'assets/tetris-assets/page-1/emblem.png',
      'assets/tetris-assets/page-1/title-logo.png',
      'assets/tetris-assets/page-2/story-bg.png',
      'assets/tetris-assets/page-2/rotate-guide.png',
      'assets/tetris-assets/page-2/drop-guide.png',
      'assets/tetris-assets/page-2/clear-guide.png',
      'assets/tetris-assets/page-2/hold-guide.png',
      'assets/tetris-assets/page-3/map-bg.png',
      'assets/tetris-assets/page-3/sector-matrix-1.png',
      'assets/tetris-assets/page-3/sector-matrix-2.png',
      'assets/tetris-assets/page-3/sector-matrix-3.png',
      'assets/tetris-assets/page-3/sector-matrix-4.png',
      'assets/tetris-assets/page-3/sector-matrix-5.png',
      'assets/tetris-assets/page-3/sector-matrix-6.png',
      'assets/tetris-assets/page-3/lock-icon.png',
      'assets/tetris-assets/page-4/tetris-backdrop.png',
      'assets/tetris-assets/page-4/block-i.png',
      'assets/tetris-assets/page-4/block-j.png',
      'assets/tetris-assets/page-4/block-l.png',
      'assets/tetris-assets/page-4/block-o.png',
      'assets/tetris-assets/page-4/block-s.png',
      'assets/tetris-assets/page-4/block-t.png',
      'assets/tetris-assets/page-4/block-z.png'
    ],
    audio: [
      'assets/tetris-assets/audio/menu-bgm.wav',
      'assets/tetris-assets/audio/game-bgm.wav',
      'assets/tetris-assets/audio/move.wav',
      'assets/tetris-assets/audio/rotate.wav',
      'assets/tetris-assets/audio/drop.wav',
      'assets/tetris-assets/audio/clear.wav',
      'assets/tetris-assets/audio/tetris.wav',
      'assets/tetris-assets/audio/gameover.wav'
    ]
  };

  // 5. Board Matrix Creation
  function createBoard() {
    const board = [];
    for (let r = 0; r < TOTAL_ROWS; r++) {
      board.push(new Array(COLS).fill(null));
    }
    return board;
  }

  // 6. 7-Bag Randomizer
  function generate7Bag(randomFn = Math.random) {
    const pieces = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    // Fisher-Yates shuffle
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    return pieces;
  }

  // 7. Spawn Piece
  function createPiece(type) {
    const def = TETROMINOES[type];
    if (!def) throw new Error(`Unknown tetromino type: ${type}`);
    // Center horizontally in 10-column board
    // 3x3 pieces spawn at col 3 (cells 3,4,5). 4x4 'I' spawns at col 3. 2x2 'O' spawns at col 4.
    const spawnX = type === 'O' ? 4 : 3;
    // Spawn in hidden buffer rows at top
    const spawnY = 0;
    return {
      type: type,
      rotation: 0,
      x: spawnX,
      y: spawnY,
      color: def.color,
      texture: def.texture
    };
  }

  // 8. Collision Detection
  function isValidPosition(board, piece, offsetX = 0, offsetY = 0, testRotation = piece.rotation) {
    const shape = TETROMINOES[piece.type].rotations[testRotation];
    const targetX = piece.x + offsetX;
    const targetY = piece.y + offsetY;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          const boardX = targetX + c;
          const boardY = targetY + r;

          // Wall boundaries
          if (boardX < 0 || boardX >= COLS) return false;
          // Floor boundary
          if (boardY >= TOTAL_ROWS) return false;
          // Ceiling check: allowed to be negative during spawn, but if boardY >= 0 check collision
          if (boardY >= 0 && board[boardY][boardX] !== null) return false;
        }
      }
    }
    return true;
  }

  // 9. SRS Rotation Attempt with Wall-Kicks
  function tryRotate(board, piece, dir = 1) { // dir = 1: CW, dir = -1: CCW
    const currentRot = piece.rotation;
    const nextRot = (currentRot + (dir === 1 ? 1 : 3)) % 4;

    if (piece.type === 'O') {
      return { success: true, newPiece: { ...piece, rotation: nextRot } };
    }

    const kickKey = `${currentRot}->${nextRot}`;
    const kickTable = piece.type === 'I' ? SRS_KICKS_I : SRS_KICKS_JLSTZ;
    const kicks = kickTable[kickKey] || [[0, 0]];

    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      // Note: ky in standard kick table: positive means UP in cartesian, but in our matrix DOWN is +y
      // Therefore matrix offsetY is -ky
      const testOffsetX = kx;
      const testOffsetY = -ky;

      if (isValidPosition(board, piece, testOffsetX, testOffsetY, nextRot)) {
        return {
          success: true,
          newPiece: {
            ...piece,
            x: piece.x + testOffsetX,
            y: piece.y + testOffsetY,
            rotation: nextRot
          }
        };
      }
    }

    return { success: false, newPiece: piece };
  }

  // 10. Ghost Piece Projection
  function getGhostY(board, piece) {
    let dropDist = 0;
    while (isValidPosition(board, piece, 0, dropDist + 1)) {
      dropDist++;
    }
    return piece.y + dropDist;
  }

  // 11. Lock Piece & Clear Lines
  function lockPiece(board, piece) {
    const shape = TETROMINOES[piece.type].rotations[piece.rotation];
    const newBoard = board.map(row => [...row]);
    let gameOver = false;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          const bx = piece.x + c;
          const by = piece.y + r;
          if (by < HIDDEN_ROWS) {
            // Block locked in hidden buffer = top out
            gameOver = true;
          }
          if (by >= 0 && by < TOTAL_ROWS && bx >= 0 && bx < COLS) {
            newBoard[by][bx] = {
              type: piece.type,
              color: piece.color,
              texture: piece.texture
            };
          }
        }
      }
    }

    // Line clear detection
    const clearedIndices = [];
    for (let r = 0; r < TOTAL_ROWS; r++) {
      const isFull = newBoard[r].every(cell => cell !== null);
      if (isFull) {
        clearedIndices.push(r);
      }
    }

    // Remove cleared lines and add new empty lines at the top
    let updatedBoard = newBoard;
    if (clearedIndices.length > 0) {
      updatedBoard = newBoard.filter((_, idx) => !clearedIndices.includes(idx));
      while (updatedBoard.length < TOTAL_ROWS) {
        updatedBoard.unshift(new Array(COLS).fill(null));
      }
    }

    return {
      board: updatedBoard,
      linesCleared: clearedIndices.length,
      clearedIndices: clearedIndices,
      gameOver: gameOver
    };
  }

  // 12. Score Calculator
  function calculateScore(linesCleared, levelNum = 1, isHardDrop = false, dropRows = 0) {
    let base = 0;
    if (linesCleared === 1) base = 100;
    else if (linesCleared === 2) base = 300;
    else if (linesCleared === 3) base = 500;
    else if (linesCleared >= 4) base = 800;

    let total = base * Math.max(1, levelNum);
    if (isHardDrop) {
      total += dropRows * 2;
    }
    return total;
  }

  // 13. Stars Calculation (0 - 3)
  function calculateStars(level, linesCleared, score) {
    if (linesCleared < level.targetLines && score < level.targetScore) return 0;
    // 1 star: met minimum goal
    let stars = 1;
    // 2 stars: exceeded score by 25% or completed with extra lines
    if (score >= level.targetScore * 1.25 || linesCleared >= level.targetLines + 2) stars = 2;
    // 3 stars: exceeded score by 60% or completed with 4+ extra lines
    if (score >= level.targetScore * 1.6 || linesCleared >= level.targetLines + 4) stars = 3;
    return stars;
  }

  // 14. Initialize Game State
  function initGameState(levelConfig = LEVELS[0]) {
    const bag = generate7Bag();
    const currentPieceType = bag.pop();
    const nextQueue = [...bag];
    // Ensure queue always has at least 5 pieces
    while (nextQueue.length < 5) {
      nextQueue.unshift(...generate7Bag());
    }

    return {
      level: levelConfig,
      board: createBoard(),
      currentPiece: createPiece(currentPieceType),
      nextQueue: nextQueue,
      holdPiece: null,
      canHold: true,
      score: 0,
      linesClearedTotal: 0,
      combo: 0,
      status: 'playing', // 'playing', 'paused', 'victory', 'gameover'
      lastDropTime: 0,
      dropIntervalMs: levelConfig.dropIntervalMs || 600,
      gameOverReason: ''
    };
  }

  // 15. Hold Piece Action
  function swapHoldPiece(gameState) {
    if (!gameState.canHold) return false;
    const currentType = gameState.currentPiece.type;
    if (gameState.holdPiece === null) {
      gameState.holdPiece = currentType;
      const nextType = gameState.nextQueue.pop();
      if (gameState.nextQueue.length < 5) {
        gameState.nextQueue.unshift(...generate7Bag());
      }
      gameState.currentPiece = createPiece(nextType);
    } else {
      const temp = gameState.holdPiece;
      gameState.holdPiece = currentType;
      gameState.currentPiece = createPiece(temp);
    }
    gameState.canHold = false;
    return true;
  }

  // 16. Persistence / Save Data Helpers (Safe for iOS Private Browsing)
  function getDefaultSaveData() {
    return {
      version: 1,
      unlockedLevels: [1],
      levelStars: { 1: 0 },
      highScore: 0,
      endlessHighScore: 0,
      endlessUnlocked: false,
      soundMuted: false
    };
  }

  function loadSaveData(storage) {
    try {
      if (!storage) return getDefaultSaveData();
      const raw = storage.getItem(SAVE_KEY);
      if (!raw) return getDefaultSaveData();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.unlockedLevels)) {
        return getDefaultSaveData();
      }
      return {
        ...getDefaultSaveData(),
        ...parsed,
        levelStars: { ...getDefaultSaveData().levelStars, ...(parsed.levelStars || {}) }
      };
    } catch {
      return getDefaultSaveData();
    }
  }

  function saveGameData(storage, data) {
    try {
      if (!storage) return false;
      storage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  return {
    COLS,
    ROWS,
    HIDDEN_ROWS,
    TOTAL_ROWS,
    TETROMINOES,
    SRS_KICKS_JLSTZ,
    SRS_KICKS_I,
    LEVELS,
    ASSETS,
    createBoard,
    generate7Bag,
    createPiece,
    isValidPosition,
    tryRotate,
    getGhostY,
    lockPiece,
    calculateScore,
    calculateStars,
    initGameState,
    swapHoldPiece,
    getDefaultSaveData,
    loadSaveData,
    saveGameData
  };
});
