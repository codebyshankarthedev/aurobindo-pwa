/**
 * See Saw — Unit & Integration Test Suite
 * Powered by Node.js built-in `node:test` and `node:assert/strict`.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Core = require('../assets/see-saw-scripts/see-saw-core.js');
const AudioManager = require('../assets/see-saw-scripts/see-saw-audio.js');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

describe('See Saw Test Suite', () => {

  // --- TEST GROUP 1: ASSET EXISTENCE ON DISK ---
  describe('Asset Existence & File Integrity', () => {
    test('All images declared in Core.ASSETS.images exist on disk', () => {
      assert.ok(Array.isArray(Core.ASSETS.images) && Core.ASSETS.images.length > 0);
      for (const relPath of Core.ASSETS.images) {
        const fullPath = path.join(WORKSPACE_ROOT, relPath);
        assert.ok(fs.existsSync(fullPath), `Missing image asset: ${relPath}`);
        const stat = fs.statSync(fullPath);
        assert.ok(stat.size > 0, `Image file is empty: ${relPath}`);
      }
    });

    test('All audio tracks declared in Core.ASSETS.audio exist on disk', () => {
      assert.ok(Array.isArray(Core.ASSETS.audio) && Core.ASSETS.audio.length > 0);
      for (const relPath of Core.ASSETS.audio) {
        const fullPath = path.join(WORKSPACE_ROOT, relPath);
        assert.ok(fs.existsSync(fullPath), `Missing audio asset: ${relPath}`);
        const stat = fs.statSync(fullPath);
        assert.ok(stat.size > 0, `Audio file is empty: ${relPath}`);
      }
    });

    test('Audio manager tracks match physical audio files', () => {
      const audioMgr = new AudioManager();
      const allAudioUrls = [
        ...Object.values(audioMgr.bgmTracks),
        ...Object.values(audioMgr.sfxTracks)
      ];

      for (const relPath of allAudioUrls) {
        const fullPath = path.join(WORKSPACE_ROOT, relPath);
        assert.ok(fs.existsSync(fullPath), `AudioManager points to non-existent track: ${relPath}`);
      }
    });
  });

  // --- TEST GROUP 2: LEVEL VALIDATION ---
  describe('Level Design & Station Architecture', () => {
    test('Exactly 12 campaign levels exist', () => {
      assert.equal(Core.LEVELS.length, 12);
    });

    test('All 12 levels have valid slots, par moves, and weights', () => {
      Core.LEVELS.forEach((level, idx) => {
        assert.equal(level.id, idx + 1);
        assert.ok(level.title && typeof level.title === 'string');
        assert.ok(level.labStation && typeof level.labStation === 'string');
        assert.ok(level.parMoves >= 1 && level.parMoves <= 4);

        // Preplaced weights validation
        assert.ok(Array.isArray(level.preplaced));
        level.preplaced.forEach(p => {
          assert.ok(Core.CONSTANTS.SLOTS.some(s => s.id === p.slotId), `Invalid slotId ${p.slotId} in level ${level.id}`);
          assert.ok(p.weight.mass > 0);
        });

        // Rack weights validation
        assert.ok(Array.isArray(level.rack) && level.rack.length >= 1);
        level.rack.forEach(w => {
          assert.ok(w.mass > 0);
          assert.ok(w.label);
        });
      });
    });

    test('Procedural endless level generator outputs valid structures', () => {
      const proc = Core.generateProceduralLevel(16);
      assert.equal(proc.id, 16);
      assert.ok(proc.preplaced.length >= 1);
      assert.ok(proc.rack.length >= 1);
    });
  });

  // --- TEST GROUP 3: TORQUE PHYSICS & BALANCE MATH ---
  describe('Analytical Torque Physics Solver', () => {
    test('Empty beam has zero torque and 0° tilt', () => {
      const slots = {};
      Core.CONSTANTS.SLOTS.forEach(s => slots[s.id] = null);
      const res = Core.calculateTorque(slots);
      assert.equal(res.leftTorque, 0);
      assert.equal(res.rightTorque, 0);
      assert.equal(res.netTorque, 0);
      assert.equal(res.tiltAngleDeg, 0);
      assert.equal(res.isBalanced, false); // Empty beam is not a completed puzzle
    });

    test('Equal weights at equal distances balance to 0° tilt and isBalanced: true', () => {
      const slots = {};
      Core.CONSTANTS.SLOTS.forEach(s => slots[s.id] = null);
      // Place 5g at L-2 (torque = 5 * 2 = 10)
      slots['L-2'] = { mass: 5 };
      // Place 5g at R-2 (torque = 5 * 2 = 10)
      slots['R-2'] = { mass: 5 };

      const res = Core.calculateTorque(slots);
      assert.equal(res.leftTorque, 10);
      assert.equal(res.rightTorque, 10);
      assert.equal(res.netTorque, 0);
      assert.equal(res.tiltAngleDeg, 0);
      assert.equal(res.isBalanced, true);
    });

    test('Leverage principle: 10g at 1x balances 5g at 2x', () => {
      const slots = {};
      Core.CONSTANTS.SLOTS.forEach(s => slots[s.id] = null);
      slots['L-1'] = { mass: 10 }; // 10 * 1 = 10
      slots['R-2'] = { mass: 5 };  // 5 * 2 = 10

      const res = Core.calculateTorque(slots);
      assert.equal(res.leftTorque, 10);
      assert.equal(res.rightTorque, 10);
      assert.equal(res.isBalanced, true);
    });

    test('Imbalance tilts beam and isBalanced: false', () => {
      const slots = {};
      Core.CONSTANTS.SLOTS.forEach(s => slots[s.id] = null);
      slots['L-3'] = { mass: 10 }; // 10 * 3 = 30 left torque
      slots['R-1'] = { mass: 2 };  // 2 * 1 = 2 right torque

      const res = Core.calculateTorque(slots);
      assert.equal(res.leftTorque, 30);
      assert.equal(res.rightTorque, 2);
      assert.equal(res.netTorque, -28);
      assert.ok(res.tiltAngleDeg < 0); // Tilts down on left
      assert.equal(res.isBalanced, false);
    });

    test('Placing and removing weights mutates state correctly', () => {
      const state = Core.createGameState(Core.LEVELS[0]);
      // Level 1 starts with 5g at L-2 (left torque = 10)
      assert.equal(state.slots['L-2'].mass, 5);
      assert.equal(state.isBalanced, false);

      // Place 5g in R-2
      const ok = Core.placeWeightInSlot(state, { id: 'test-w', mass: 5 }, 'R-2');
      assert.equal(ok, true);
      assert.equal(state.movesUsed, 1);
      assert.equal(state.isBalanced, true);

      // Remove weight from R-2
      const removed = Core.removeWeightFromSlot(state, 'R-2');
      assert.equal(removed.mass, 5);
      assert.equal(state.slots['R-2'], null);
      assert.equal(state.isBalanced, false);
    });
  });

  // --- TEST GROUP 4: STARS & SCORING ---
  describe('Star Calculation & Scoring', () => {
    test('3 stars awarded for moves <= parMoves', () => {
      assert.equal(Core.calculateStars(1, 1), 3);
      assert.equal(Core.calculateStars(2, 2), 3);
    });

    test('2 stars awarded for moves <= parMoves + 1', () => {
      assert.equal(Core.calculateStars(2, 1), 2);
    });

    test('1 star awarded for moves > parMoves + 1', () => {
      assert.equal(Core.calculateStars(4, 1), 1);
    });

    test('Score increases with level and speed', () => {
      const scoreFast = Core.calculateScore(3, 2, 8);
      const scoreSlow = Core.calculateScore(3, 2, 25);
      assert.ok(scoreFast > scoreSlow);
    });
  });

  // --- TEST GROUP 5: SAVE/LOAD PERSISTENCE ---
  describe('Save System & Progression', () => {
    test('Default save data unlocks Level 1', () => {
      const def = Core.getDefaultSaveData();
      assert.deepEqual(def.unlockedLevels, [1]);
    });

    test('unlockNextLevel advances level progression and unlocks endless after Level 5', () => {
      let save = Core.getDefaultSaveData();
      save = Core.unlockNextLevel(save, 1, 3, 2000);
      assert.ok(save.unlockedLevels.includes(2));

      save = Core.unlockNextLevel(save, 5, 3, 5000);
      assert.equal(save.endlessUnlocked, true);
    });

    test('Mock storage round-trip with exception handling', () => {
      const mockStorage = {
        store: {},
        getItem(k) { return this.store[k] || null; },
        setItem(k, v) { this.store[k] = v; }
      };

      let save = Core.loadSaveData(mockStorage);
      save = Core.unlockNextLevel(save, 1, 3, 2200);
      Core.saveGameData(mockStorage, save);

      const loaded = Core.loadSaveData(mockStorage);
      assert.equal(loaded.levelStars[1], 3);

      // Fault tolerance
      const badStorage = {
        getItem() { throw new Error('SecurityError'); },
        setItem() { throw new Error('SecurityError'); }
      };
      assert.doesNotThrow(() => Core.loadSaveData(badStorage));
      assert.equal(Core.saveGameData(badStorage, save), false);
    });
  });

});
