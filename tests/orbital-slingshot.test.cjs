/**
 * Orbital Slingshot — Unit & Integration Test Suite
 * Powered by Node.js built-in `node:test` and `node:assert/strict`.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Core = require('../assets/orbital-slingshot-scripts/orbital-slingshot-core.js');
const AudioManager = require('../assets/orbital-slingshot-scripts/orbital-slingshot-audio.js');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

describe('Orbital Slingshot Test Suite', () => {

  // --- TEST GROUP 1: ASSET EXISTENCE ON DISK ---
  describe('Asset Existence & File Integrity', () => {
    test('All images declared in Core.ASSETS.images exist on disk', () => {
      assert.ok(Array.isArray(Core.ASSETS.images) && Core.ASSETS.images.length > 0);
      for (const relPath of Core.ASSETS.images) {
        const fullPath = path.join(WORKSPACE_ROOT, relPath);
        assert.ok(fs.existsSync(fullPath), `Missing image asset on disk: ${relPath}`);
        const stat = fs.statSync(fullPath);
        assert.ok(stat.size > 0, `Asset file is empty: ${relPath}`);
      }
    });

    test('All audio tracks declared in Core.ASSETS.audio exist on disk', () => {
      assert.ok(Array.isArray(Core.ASSETS.audio) && Core.ASSETS.audio.length > 0);
      for (const relPath of Core.ASSETS.audio) {
        const fullPath = path.join(WORKSPACE_ROOT, relPath);
        assert.ok(fs.existsSync(fullPath), `Missing audio asset on disk: ${relPath}`);
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

  // --- TEST GROUP 2: LEVEL CONFIGURATION VALIDATION ---
  describe('Level Design & Celestial Architecture', () => {
    test('Exactly 12 campaign levels exist', () => {
      assert.equal(Core.LEVELS.length, 12);
    });

    test('All 12 levels have valid 9:16 coordinates, goals, and 3 star crystals', () => {
      Core.LEVELS.forEach((level, idx) => {
        assert.equal(level.id, idx + 1);
        assert.ok(level.title && typeof level.title === 'string');
        assert.ok(level.sector && typeof level.sector === 'string');
        assert.ok(level.parShots >= 1 && level.parShots <= 4);

        // Probe start bounds
        assert.ok(level.probeStart.x >= 10 && level.probeStart.x <= 90);
        assert.ok(level.probeStart.y >= 70 && level.probeStart.y <= 95);

        // Wormhole goal bounds
        assert.ok(level.wormhole.x >= 10 && level.wormhole.x <= 90);
        assert.ok(level.wormhole.y >= 5 && level.wormhole.y <= 30);
        assert.ok(level.wormhole.radius > 0);

        // Exactly 3 star crystals per level
        assert.ok(Array.isArray(level.crystals));
        assert.equal(level.crystals.length, 3, `Level ${level.id} does not have exactly 3 crystals`);
        level.crystals.forEach(c => {
          assert.ok(c.x >= 5 && c.x <= 95, `Crystal x=${c.x} out of range in level ${level.id}`);
          assert.ok(c.y >= 5 && c.y <= 95, `Crystal y=${c.y} out of range in level ${level.id}`);
          assert.ok(c.radius > 0);
        });

        // Planets
        assert.ok(Array.isArray(level.planets) && level.planets.length >= 1);
        level.planets.forEach(p => {
          assert.ok(p.x >= 5 && p.x <= 95);
          assert.ok(p.y >= 5 && p.y <= 95);
          assert.ok(p.radius >= 3.0);
          assert.ok(p.mass !== 0, 'Planet mass cannot be zero');
        });
      });
    });

    test('Procedural endless level generator outputs valid structures', () => {
      const procedural = Core.generateProceduralLevel(15);
      assert.equal(procedural.id, 15);
      assert.ok(procedural.planets.length >= 1);
      assert.equal(procedural.crystals.length, 3);
      assert.ok(procedural.wormhole.x > 0 && procedural.wormhole.y > 0);
    });
  });

  // --- TEST GROUP 3: PHYSICS ENGINE SIMULATION ---
  describe('Newtonian Inverse-Square Gravity & Collision Math', () => {
    test('Attractive mass pulls probe toward its center', () => {
      const level = {
        id: 99,
        title: 'Gravity Test',
        sector: 'Test',
        parShots: 1,
        probeStart: { x: 50, y: 70 },
        wormhole: { x: 50, y: 10, radius: 4 },
        planets: [
          { name: 'Heavy Core', x: 50, y: 50, radius: 6, mass: 40 }
        ],
        hazards: [],
        crystals: []
      };

      const state = Core.createGameState(level);
      state.probe.active = true;
      state.probe.vx = 0;
      state.probe.vy = 0;
      state.status = 'flying';

      // Step physics by 0.1s
      const result = Core.simulateStep(state, 0.1);
      assert.equal(result.outcome, 'flying');
      // Planet is at y=50, probe is at y=70 -> dy is negative -> probe vy should be negative (accelerating upwards toward planet)
      assert.ok(state.probe.vy < 0, `Expected negative vy towards planet, got ${state.probe.vy}`);
      assert.ok(state.probe.y < 70, `Expected probe y to decrease towards 50, got ${state.probe.y}`);
    });

    test('Repulsor pulsar pushes probe away from its center', () => {
      const level = {
        id: 99,
        title: 'Repulsor Test',
        sector: 'Test',
        parShots: 1,
        probeStart: { x: 50, y: 60 },
        wormhole: { x: 50, y: 10, radius: 4 },
        planets: [
          { name: 'Anti-Gravity Pulsar', x: 50, y: 50, radius: 5, mass: -30 } // Negative mass
        ],
        hazards: [],
        crystals: []
      };

      const state = Core.createGameState(level);
      state.probe.active = true;
      state.probe.vx = 0;
      state.probe.vy = 0;
      state.status = 'flying';

      Core.simulateStep(state, 0.1);
      // Pulsar is at y=50, probe at y=60 -> negative mass pushes probe downward (vy > 0)
      assert.ok(state.probe.vy > 0, `Expected positive vy pushed away by pulsar, got ${state.probe.vy}`);
      assert.ok(state.probe.y > 60, `Expected probe y to increase away from 50, got ${state.probe.y}`);
    });

    test('Impact with planet triggers crash with failure reason', () => {
      const level = {
        id: 99,
        title: 'Crash Test',
        sector: 'Test',
        parShots: 1,
        probeStart: { x: 50, y: 55 },
        wormhole: { x: 50, y: 10, radius: 4 },
        planets: [
          { name: 'Jupiter Core', x: 50, y: 50, radius: 8, mass: 20 }
        ],
        hazards: [],
        crystals: []
      };

      const state = Core.createGameState(level);
      state.probe.active = true;
      state.status = 'flying';

      const result = Core.simulateStep(state, 0.05);
      assert.equal(result.outcome, 'crash');
      assert.ok(result.reason.includes('Atmospheric Vaporization'));
      assert.equal(state.status, 'crashed');
      assert.equal(state.probe.alive, false);
    });

    test('Hazard collision triggers asteroid impact crash', () => {
      const level = {
        id: 99,
        title: 'Asteroid Test',
        sector: 'Test',
        parShots: 1,
        probeStart: { x: 50, y: 52 },
        wormhole: { x: 50, y: 10, radius: 4 },
        planets: [],
        hazards: [
          { id: 1, name: 'Chondrite Alpha', x: 50, y: 50, radius: 3 }
        ],
        crystals: []
      };

      const state = Core.createGameState(level);
      state.probe.active = true;
      state.status = 'flying';

      const result = Core.simulateStep(state, 0.05);
      assert.equal(result.outcome, 'crash');
      assert.ok(result.reason.includes('Asteroid Impact'));
    });

    test('Passing close to star crystal marks it collected', () => {
      const level = {
        id: 99,
        title: 'Collect Test',
        sector: 'Test',
        parShots: 1,
        probeStart: { x: 50, y: 51 },
        wormhole: { x: 50, y: 10, radius: 4 },
        planets: [],
        hazards: [],
        crystals: [
          { id: 1, x: 50, y: 50, radius: 3 }
        ]
      };

      const state = Core.createGameState(level);
      state.probe.active = true;
      state.status = 'flying';

      const result = Core.simulateStep(state, 0.05);
      assert.equal(result.outcome, 'star');
      assert.equal(state.crystals[0].collected, true);
      assert.equal(state.crystalsCollectedCount, 1);
    });

    test('Entering wormhole triggers warp victory', () => {
      const level = {
        id: 99,
        title: 'Wormhole Test',
        sector: 'Test',
        parShots: 1,
        probeStart: { x: 50, y: 12 },
        wormhole: { x: 50, y: 10, radius: 4.8 },
        planets: [],
        hazards: [],
        crystals: []
      };

      const state = Core.createGameState(level);
      state.probe.active = true;
      state.status = 'flying';

      const result = Core.simulateStep(state, 0.05);
      assert.equal(result.outcome, 'warp');
      assert.equal(state.status, 'won');
      assert.equal(state.probe.won, true);
    });

    test('Exiting bounds triggers deep space drift failure', () => {
      const level = {
        id: 99,
        title: 'Drift Test',
        sector: 'Test',
        parShots: 1,
        probeStart: { x: 115, y: 50 }, // Out of bounds > 112
        wormhole: { x: 50, y: 10, radius: 4 },
        planets: [],
        hazards: [],
        crystals: []
      };

      const state = Core.createGameState(level);
      state.probe.active = true;
      state.status = 'flying';

      const result = Core.simulateStep(state, 0.05);
      assert.equal(result.outcome, 'drift');
      assert.ok(result.reason.includes('Deep Space Drift'));
    });

    test('Trajectory solver generates up to 60 non-empty predictive points', () => {
      const start = { x: 50, y: 85 };
      const pull = { x: 5, y: 8 };
      const planets = [{ x: 50, y: 50, radius: 8, mass: 25 }];
      const hazards = [];

      const traj = Core.computeTrajectory(start, pull, planets, hazards, 60, 0.04);
      assert.ok(traj.length > 5 && traj.length <= 60);
      assert.ok(typeof traj[0].x === 'number');
      assert.ok(typeof traj[0].y === 'number');
    });
  });

  // --- TEST GROUP 4: SCORING & STARS CALCULATION ---
  describe('Star Calculation & Scoring Formulas', () => {
    test('3 stars awarded for par shots and all 3 crystals', () => {
      const stars = Core.calculateStars(2, 3, 2);
      assert.equal(stars, 3);
    });

    test('2 stars awarded if par shots achieved or 2 crystals gathered', () => {
      assert.equal(Core.calculateStars(2, 1, 2), 2);
      assert.equal(Core.calculateStars(4, 2, 2), 2);
    });

    test('1 star awarded for finishing above par with 1 or 0 crystals', () => {
      assert.equal(Core.calculateStars(4, 0, 2), 1);
    });

    test('Deterministic score increases with level, crystals, and fast times', () => {
      const scoreHigh = Core.calculateScore(5, 1, 3, 10);
      const scoreLow = Core.calculateScore(5, 3, 1, 28);
      assert.ok(scoreHigh > scoreLow);
    });
  });

  // --- TEST GROUP 5: SAVE PROGRESSION & MOCK STORAGE ---
  describe('State Persistence & Progression Systems', () => {
    test('Initial save defaults to Level 1 unlocked, 0 stars', () => {
      const save = Core.getDefaultSaveData();
      assert.deepEqual(save.unlockedLevels, [1]);
      assert.equal(save.levelStars[1], 0);
      assert.equal(save.equippedTrail, 'cyan');
    });

    test('Unlocking next level appends next level ID and unlocks endless after L5', () => {
      let save = Core.getDefaultSaveData();
      save = Core.unlockNextLevel(save, 1, 3, 2500);
      assert.ok(save.unlockedLevels.includes(2));
      assert.equal(save.levelStars[1], 3);

      save = Core.unlockNextLevel(save, 5, 3, 6000);
      assert.equal(save.endlessUnlocked, true);
    });

    test('Mock Storage saves and loads correctly', () => {
      const mockStorage = {
        store: {},
        getItem(k) { return this.store[k] || null; },
        setItem(k, v) { this.store[k] = v; }
      };

      const defaultData = Core.loadSaveData(mockStorage);
      assert.equal(defaultData.version, 1);

      defaultData.equippedTrail = 'solar';
      Core.saveGameData(mockStorage, defaultData);

      const loaded = Core.loadSaveData(mockStorage);
      assert.equal(loaded.equippedTrail, 'solar');
    });

    test('Storage gracefully handles exceptions (Private Browsing Mode)', () => {
      const brokenStorage = {
        getItem() { throw new Error('QuotaExceededError'); },
        setItem() { throw new Error('QuotaExceededError'); }
      };

      assert.doesNotThrow(() => {
        const data = Core.loadSaveData(brokenStorage);
        assert.equal(data.version, 1);
        const saved = Core.saveGameData(brokenStorage, data);
        assert.equal(saved, false);
      });
    });
  });

  // --- TEST GROUP 6: GALLERY & CACHING INTEGRATION ---
  describe('Gallery, Service Worker & Firebase Cache Rules', () => {
    test('index.html contains orbital-slingshot as first poster in .game-gallery', () => {
      const indexHtml = fs.readFileSync(path.join(WORKSPACE_ROOT, 'index.html'), 'utf8');
      const gameGalleryIdx = indexHtml.indexOf('class="game-gallery"');
      assert.ok(gameGalleryIdx !== -1, 'index.html missing .game-gallery');

      const slingshotIdx = indexHtml.indexOf('poster-orbital-slingshot', gameGalleryIdx);
      const seeSawIdx = indexHtml.indexOf('poster-see-saw', gameGalleryIdx);

      assert.ok(slingshotIdx !== -1, 'orbital-slingshot poster missing in .game-gallery');
      assert.ok(seeSawIdx !== -1, 'see-saw poster missing in .game-gallery');
      assert.ok(slingshotIdx < seeSawIdx, 'orbital-slingshot is not the leading item in .game-gallery');
    });

    test('index.html contains orbital-slingshot as first poster in #rc-game-gallery', () => {
      const indexHtml = fs.readFileSync(path.join(WORKSPACE_ROOT, 'index.html'), 'utf8');
      const rcGalleryIdx = indexHtml.indexOf('id="rc-game-gallery"');
      assert.ok(rcGalleryIdx !== -1, 'index.html missing #rc-game-gallery');

      const slingshotIdx = indexHtml.indexOf('poster-orbital-slingshot', rcGalleryIdx);
      const seeSawIdx = indexHtml.indexOf('poster-see-saw', rcGalleryIdx);

      assert.ok(slingshotIdx !== -1, 'orbital-slingshot poster missing in #rc-game-gallery');
      assert.ok(seeSawIdx !== -1, 'see-saw poster missing in #rc-game-gallery');
      assert.ok(slingshotIdx < seeSawIdx, 'orbital-slingshot is not the leading item in #rc-game-gallery');
    });

    test('firebase.qc-core.json contains no-cache rule for orbital-slingshot', () => {
      const fbConfig = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'firebase.qc-core.json'), 'utf8'));
      assert.ok(fbConfig.hosting && Array.isArray(fbConfig.hosting.headers));
      const hasRule = fbConfig.hosting.headers.some(h =>
        h.source && h.source.includes('orbital-slingshot') &&
        h.headers.some(hdr => hdr.key === 'Cache-Control' && hdr.value.includes('no-cache'))
      );
      assert.ok(hasRule, 'Missing orbital-slingshot no-cache header in firebase.qc-core.json');
    });

    test('sw.js contains cache bypass for orbital-slingshot and bumped CACHE version', () => {
      const swJs = fs.readFileSync(path.join(WORKSPACE_ROOT, 'sw.js'), 'utf8');
      assert.ok(swJs.includes('/assets/orbital-slingshot-'), 'sw.js missing cache bypass');
      assert.ok(swJs.includes('no-store'), 'sw.js bypass missing no-store fetch');
      assert.ok(swJs.includes('CACHE ='), 'sw.js missing CACHE constant');
    });

    test('orbital-slingshot.html has no-cache meta tags and versioned assets', () => {
      const html = fs.readFileSync(path.join(WORKSPACE_ROOT, 'assets/orbital-slingshot-scripts/orbital-slingshot.html'), 'utf8');
      assert.ok(html.includes('http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"'));
      assert.ok(html.includes('orbital-slingshot.css?v=1'));
      assert.ok(html.includes('orbital-slingshot-core.js?v=1'));
      assert.ok(html.includes('orbital-slingshot-audio.js?v=1'));
      assert.ok(html.includes('orbital-slingshot.js?v=1'));
    });
  });

});
