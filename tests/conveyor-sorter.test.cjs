const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Core = require('../assets/conveyor-sorter-scripts/conveyor-sorter-core.js');

test('1. Conveyor Sorter Asset Manifest — All referenced files exist on disk', () => {
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

test('2. Alphabet and Number Category Integrity', () => {
  assert.ok(Core.ALPHABETS.length >= 8);
  assert.ok(Core.NUMBERS.length >= 8);

  Core.ALPHABETS.forEach(item => {
    assert.ok(/[A-Z]/.test(item.char), `${item.char} must be an uppercase letter`);
    assert.ok(item.texture.startsWith('item-'));
  });

  Core.NUMBERS.forEach(item => {
    assert.ok(/[0-9]/.test(item.char), `${item.char} must be a numeric digit`);
    assert.ok(item.texture.startsWith('item-'));
  });
});

test('3. Balanced Sequence Generation and Spacing', () => {
  const seq = Core.generateItemSequence(12);
  assert.equal(seq.length, 12);
  // Check sequential spacing
  for (let i = 1; i < seq.length; i++) {
    assert.ok(seq[i].xPct < seq[i - 1].xPct, 'Subsequent tokens must spawn further behind on belt');
    assert.equal(seq[i].state, 'riding');
  }
});

test('4. Container Categorization and Drop Validation', () => {
  const letterItem = { char: 'B', type: 'alphabet' };
  const numItem = { char: '7', type: 'number' };

  // Correct sorts
  const sortAlpha = Core.validateDrop(letterItem, 'alphabet');
  assert.equal(sortAlpha.success, true);

  const sortNum = Core.validateDrop(numItem, 'number');
  assert.equal(sortNum.success, true);

  // Mismatched sorts
  const mismatch1 = Core.validateDrop(letterItem, 'number');
  assert.equal(mismatch1.success, false);
  assert.ok(mismatch1.reason.includes('ALPHABET'));

  const mismatch2 = Core.validateDrop(numItem, 'alphabet');
  assert.equal(mismatch2.success, false);
  assert.ok(mismatch2.reason.includes('NUMBER'));
});

test('5. Container Hit-Zone Geometry Resolution', () => {
  // Point in Alphabet Container
  const hitAlpha = Core.getContainerAt(20, 25);
  assert.ok(hitAlpha);
  assert.equal(hitAlpha.id, 'alphabet');

  // Point in Number Container
  const hitNum = Core.getContainerAt(70, 25);
  assert.ok(hitNum);
  assert.equal(hitNum.id, 'number');

  // Point in open space below containers
  const hitNone = Core.getContainerAt(50, 65);
  assert.equal(hitNone, null);
});

test('6. Campaign Levels Configuration', () => {
  assert.equal(Core.LEVELS.length, 12);
  Core.LEVELS.forEach((lvl, idx) => {
    assert.equal(lvl.id, idx + 1);
    assert.ok(lvl.targetQuota > 0);
    assert.ok(lvl.speedPctPerSec > 0);
    assert.ok(lvl.maxMistakes > 0);
  });
});

test('7. Star Rating Evaluation', () => {
  const lvl = Core.LEVELS[0]; // targetQuota: 8
  // Below quota
  assert.equal(Core.calculateStars(lvl, 7, 0, 10), 0);
  // Quota met with zero mistakes = 3 stars
  assert.equal(Core.calculateStars(lvl, 8, 0, 8), 3);
  // Quota met with 2 mistakes = 2 stars
  assert.equal(Core.calculateStars(lvl, 8, 2, 10), 2);
  // Quota met with 3 mistakes = 1 star
  assert.equal(Core.calculateStars(lvl, 8, 3, 11), 1);
});

test('8. Save/Load Persistence System', () => {
  const memoryStore = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = v; }
  };

  const fresh = Core.loadSaveData(memoryStore);
  assert.equal(fresh.version, 1);
  assert.deepEqual(fresh.unlockedLevels, [1]);

  fresh.unlockedLevels.push(2);
  fresh.levelStars[1] = 3;
  fresh.highScore = 850;
  Core.saveGameData(memoryStore, fresh);

  const loaded = Core.loadSaveData(memoryStore);
  assert.deepEqual(loaded.unlockedLevels, [1, 2]);
  assert.equal(loaded.levelStars[1], 3);
  assert.equal(loaded.highScore, 850);

  // Corrupted save data fallback
  memoryStore.setItem('conveyor_sorter_save_v1', '{corrupt!!');
  const recovered = Core.loadSaveData(memoryStore);
  assert.equal(recovered.version, 1);
  assert.deepEqual(recovered.unlockedLevels, [1]);
});
