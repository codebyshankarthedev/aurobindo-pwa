/**
 * Conveyor Sorter — Pure Game Logic Engine
 * Pure computational logic — zero DOM dependencies.
 * Handles item generation, conveyor trajectory progression,
 * container hit-test validation, 12 campaign levels, and resilient persistence.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConveyorSorterCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAVE_KEY = 'conveyor_sorter_save_v1';

  // Item catalogs
  const ALPHABETS = [
    { char: 'A', texture: 'item-a', color: '#00f0ff' },
    { char: 'B', texture: 'item-b', color: '#00f0ff' },
    { char: 'C', texture: 'item-c', color: '#00f0ff' },
    { char: 'D', texture: 'item-d', color: '#00f0ff' },
    { char: 'E', texture: 'item-e', color: '#00f0ff' },
    { char: 'F', texture: 'item-f', color: '#00f0ff' },
    { char: 'K', texture: 'item-k', color: '#00f0ff' },
    { char: 'M', texture: 'item-m', color: '#00f0ff' },
    { char: 'S', texture: 'item-s', color: '#00f0ff' },
    { char: 'X', texture: 'item-x', color: '#00f0ff' }
  ];

  const NUMBERS = [
    { char: '1', texture: 'item-1', color: '#ffd700' },
    { char: '2', texture: 'item-2', color: '#ffd700' },
    { char: '3', texture: 'item-3', color: '#ffd700' },
    { char: '4', texture: 'item-4', color: '#ffd700' },
    { char: '5', texture: 'item-5', color: '#ffd700' },
    { char: '7', texture: 'item-7', color: '#ffd700' },
    { char: '8', texture: 'item-8', color: '#ffd700' },
    { char: '9', texture: 'item-9', color: '#ffd700' }
  ];

  // Container Hit-Zone Specifications (Percentage of 9:16 Stage)
  const CONTAINERS = {
    alphabet: {
      id: 'alphabet',
      name: 'Alphabets Container',
      x: 4,
      y: 18,
      width: 44,
      height: 25,
      color: '#00f0ff',
      texture: 'container-alpha'
    },
    number: {
      id: 'number',
      name: 'Numbers Container',
      x: 52,
      y: 18,
      width: 44,
      height: 25,
      color: '#9c27b0',
      texture: 'container-number'
    }
  };

  // 12 Campaign Levels
  const LEVELS = [
    {
      id: 1,
      title: 'Intake Calibration',
      sector: 'Purity Intake Bay',
      sectorBadge: 'sector-belt-1',
      targetQuota: 8,
      speedPctPerSec: 10,
      maxMistakes: 3,
      description: 'Sort 8 arriving tokens into Alphabets and Numbers containers.'
    },
    {
      id: 2,
      title: 'Primary Conveyor',
      sector: 'Sorting Bay A',
      sectorBadge: 'sector-belt-2',
      targetQuota: 10,
      speedPctPerSec: 12,
      maxMistakes: 3,
      description: 'Moderate speed: Sort 10 items without missing any token.'
    },
    {
      id: 3,
      title: 'Dual Line Splitter',
      sector: 'Quality Lane 2',
      sectorBadge: 'sector-belt-3',
      targetQuota: 12,
      speedPctPerSec: 14,
      maxMistakes: 3,
      description: 'Sort 12 mixed character crates as the belt accelerates.'
    },
    {
      id: 4,
      title: 'Speed Induction',
      sector: 'High-Flux Lane',
      sectorBadge: 'sector-belt-4',
      targetQuota: 15,
      speedPctPerSec: 16,
      maxMistakes: 4,
      description: 'Continuous flow: Sort 15 crates with precision drag or keypresses.'
    },
    {
      id: 5,
      title: 'QC Core Filtration',
      sector: 'Chamber 5',
      sectorBadge: 'sector-belt-5',
      targetQuota: 18,
      speedPctPerSec: 18,
      maxMistakes: 4,
      description: 'Complete 18 accurate categorizations to unlock Endless Sorter.'
    },
    {
      id: 6,
      title: 'Rapid Synthesis Line',
      sector: 'Solvent Conduit',
      sectorBadge: 'sector-belt-6',
      targetQuota: 20,
      speedPctPerSec: 20,
      maxMistakes: 4,
      description: 'Rapid pace: 20 tokens under high manufacturing cadence.'
    },
    {
      id: 7,
      title: 'High-Flux Ingestion',
      sector: 'Distribution Hub',
      sectorBadge: 'sector-belt-1',
      targetQuota: 22,
      speedPctPerSec: 22,
      maxMistakes: 5,
      description: 'Sort 22 items with rapid lateral drops or quick-sort keys.'
    },
    {
      id: 8,
      title: 'Precision Sorter',
      sector: 'Refinement Bay',
      sectorBadge: 'sector-belt-2',
      targetQuota: 25,
      speedPctPerSec: 24,
      maxMistakes: 5,
      description: '25 items: Maintain high streak combos for maximum par score.'
    },
    {
      id: 9,
      title: 'Vortex Splitter',
      sector: 'Centrifuge Wing',
      sectorBadge: 'sector-belt-3',
      targetQuota: 28,
      speedPctPerSec: 26,
      maxMistakes: 5,
      description: 'High velocity: 28 crates passing the optical scanner.'
    },
    {
      id: 10,
      title: 'Orbital Assembly',
      sector: 'Gantry Deck',
      sectorBadge: 'sector-belt-4',
      targetQuota: 30,
      speedPctPerSec: 28,
      maxMistakes: 6,
      description: '30 items: Zero tolerance for belt overflow.'
    },
    {
      id: 11,
      title: 'Hyper-Velocity Belt',
      sector: 'Supersonic Track',
      sectorBadge: 'sector-belt-5',
      targetQuota: 35,
      speedPctPerSec: 30,
      maxMistakes: 6,
      description: 'Extreme speed: Sort 35 items before items reach the chute.'
    },
    {
      id: 12,
      title: 'Apex Manufacturing',
      sector: 'Master QC Terminal',
      sectorBadge: 'sector-belt-6',
      targetQuota: 40,
      speedPctPerSec: 32,
      maxMistakes: 7,
      description: 'The Ultimate Sorting Challenge: 40 tokens at peak velocity!'
    }
  ];

  // Asset Manifest
  const ASSETS = {
    images: [
      'assets/conveyor-sorter-assets/page-1/page-1-bg.png',
      'assets/conveyor-sorter-assets/page-1/emblem.png',
      'assets/conveyor-sorter-assets/page-1/title-logo.png',
      'assets/conveyor-sorter-assets/page-2/story-bg.png',
      'assets/conveyor-sorter-assets/page-2/drag-guide.png',
      'assets/conveyor-sorter-assets/page-2/containers-guide.png',
      'assets/conveyor-sorter-assets/page-2/keys-guide.png',
      'assets/conveyor-sorter-assets/page-2/score-guide.png',
      'assets/conveyor-sorter-assets/page-3/map-bg.png',
      'assets/conveyor-sorter-assets/page-3/sector-belt-1.png',
      'assets/conveyor-sorter-assets/page-3/sector-belt-2.png',
      'assets/conveyor-sorter-assets/page-3/sector-belt-3.png',
      'assets/conveyor-sorter-assets/page-3/sector-belt-4.png',
      'assets/conveyor-sorter-assets/page-3/sector-belt-5.png',
      'assets/conveyor-sorter-assets/page-3/sector-belt-6.png',
      'assets/conveyor-sorter-assets/page-3/lock-icon.png',
      'assets/conveyor-sorter-assets/page-4/conveyor-backdrop.png',
      'assets/conveyor-sorter-assets/page-4/container-alpha.png',
      'assets/conveyor-sorter-assets/page-4/container-number.png',
      'assets/conveyor-sorter-assets/page-4/conveyor-belt.png',
      'assets/conveyor-sorter-assets/page-4/item-a.png',
      'assets/conveyor-sorter-assets/page-4/item-b.png',
      'assets/conveyor-sorter-assets/page-4/item-c.png',
      'assets/conveyor-sorter-assets/page-4/item-d.png',
      'assets/conveyor-sorter-assets/page-4/item-e.png',
      'assets/conveyor-sorter-assets/page-4/item-f.png',
      'assets/conveyor-sorter-assets/page-4/item-k.png',
      'assets/conveyor-sorter-assets/page-4/item-m.png',
      'assets/conveyor-sorter-assets/page-4/item-s.png',
      'assets/conveyor-sorter-assets/page-4/item-x.png',
      'assets/conveyor-sorter-assets/page-4/item-1.png',
      'assets/conveyor-sorter-assets/page-4/item-2.png',
      'assets/conveyor-sorter-assets/page-4/item-3.png',
      'assets/conveyor-sorter-assets/page-4/item-4.png',
      'assets/conveyor-sorter-assets/page-4/item-5.png',
      'assets/conveyor-sorter-assets/page-4/item-7.png',
      'assets/conveyor-sorter-assets/page-4/item-8.png',
      'assets/conveyor-sorter-assets/page-4/item-9.png'
    ],
    audio: [
      'assets/conveyor-sorter-assets/audio/menu-bgm.wav',
      'assets/conveyor-sorter-assets/audio/game-bgm.wav',
      'assets/conveyor-sorter-assets/audio/grab.wav',
      'assets/conveyor-sorter-assets/audio/drop-success.wav',
      'assets/conveyor-sorter-assets/audio/drop-fail.wav',
      'assets/conveyor-sorter-assets/audio/combo.wav',
      'assets/conveyor-sorter-assets/audio/level-clear.wav',
      'assets/conveyor-sorter-assets/audio/gameover.wav'
    ]
  };

  // Generate balanced sequence of tokens
  function generateItemSequence(count, randomFn = Math.random) {
    const items = [];
    let nextId = 1;

    for (let i = 0; i < count; i++) {
      const isAlpha = randomFn() < 0.5;
      if (isAlpha) {
        const pick = ALPHABETS[Math.floor(randomFn() * ALPHABETS.length)];
        items.push({
          id: nextId++,
          type: 'alphabet',
          char: pick.char,
          texture: pick.texture,
          color: pick.color,
          // Spaced progression along the conveyor belt (each starts behind the left edge)
          xPct: -18 - i * 26,
          yPct: 62,
          state: 'riding' // 'riding', 'dragging', 'sorted', 'missed'
        });
      } else {
        const pick = NUMBERS[Math.floor(randomFn() * NUMBERS.length)];
        items.push({
          id: nextId++,
          type: 'number',
          char: pick.char,
          texture: pick.texture,
          color: pick.color,
          xPct: -18 - i * 26,
          yPct: 62,
          state: 'riding'
        });
      }
    }
    return items;
  }

  // Validate Drop in Container
  function validateDrop(item, targetContainerId) {
    if (!item) return { success: false, reason: 'No item selected.' };

    const expectedCategory = item.type; // 'alphabet' or 'number'
    const isCorrect = (expectedCategory === targetContainerId);

    if (isCorrect) {
      return {
        success: true,
        reason: `Correct! '${item.char}' is sorted into the ${targetContainerId === 'alphabet' ? 'Alphabets' : 'Numbers'} Container.`
      };
    } else {
      const properName = expectedCategory === 'alphabet' ? 'Alphabets' : 'Numbers';
      return {
        success: false,
        reason: `Mismatched Sort: '${item.char}' is an ${expectedCategory.toUpperCase()}, not a ${targetContainerId.toUpperCase()}! Drop it into the ${properName} Container.`
      };
    }
  }

  // Check which container bounding box contains point (xPct, yPct)
  function getContainerAt(xPct, yPct) {
    for (const key of Object.keys(CONTAINERS)) {
      const c = CONTAINERS[key];
      if (
        xPct >= c.x &&
        xPct <= c.x + c.width &&
        yPct >= c.y &&
        yPct <= c.y + c.height
      ) {
        return c;
      }
    }
    return null;
  }

  // Calculate Stars (1 to 3)
  function calculateStars(level, sortedCount, mistakesCount, totalSpawned) {
    if (sortedCount < level.targetQuota) return 0;
    const totalAttempted = sortedCount + mistakesCount;
    const accuracy = totalAttempted > 0 ? (sortedCount / totalAttempted) : 1;

    if (accuracy >= 0.95 && mistakesCount === 0) return 3;
    if (accuracy >= 0.80 && mistakesCount <= 2) return 2;
    return 1;
  }

  // Initialize Game State
  function initGameState(levelConfig = LEVELS[0]) {
    const items = generateItemSequence(levelConfig.targetQuota + 8);
    return {
      level: levelConfig,
      items: items,
      sortedCount: 0,
      mistakesCount: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      status: 'playing', // 'playing', 'paused', 'victory', 'gameover'
      beltPaused: false,
      speedMultiplier: 1.0,
      draggedItem: null
    };
  }

  // Persistence (Safe for iOS Private Browsing)
  function getDefaultSaveData() {
    return {
      version: 1,
      unlockedLevels: [1],
      levelStars: { 1: 0 },
      highScore: 0,
      endlessUnlocked: false,
      endlessHighScore: 0,
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
    ALPHABETS,
    NUMBERS,
    CONTAINERS,
    LEVELS,
    ASSETS,
    generateItemSequence,
    validateDrop,
    getContainerAt,
    calculateStars,
    initGameState,
    getDefaultSaveData,
    loadSaveData,
    saveGameData
  };
});
