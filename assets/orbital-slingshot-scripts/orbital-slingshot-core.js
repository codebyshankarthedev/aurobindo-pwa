/**
 * Orbital Slingshot - Core Game Logic & Pure Mathematical Solver
 * Zero DOM dependencies. Safe for Node.js unit testing and browser runtime.
 */

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.OrbitalSlingshotCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- 1. PHYSICS CONSTANTS ---
  const CONSTANTS = {
    G: 1400, // Gravitational scale for percentage coordinates (0..100)
    SOFTENING: 3.8, // Distance softening to prevent singularity
    MAX_VELOCITY: 160, // Max probe speed (% per sec)
    MIN_LAUNCH_PULL: 2.0, // Minimum drag distance to register launch
    MAX_PULL_RADIUS: 20.0, // Max pull-back radius (% of stage)
    SLINGSHOT_FORCE_SCALE: 2.2, // Maps pull vector to initial velocity
    PROBE_RADIUS: 1.8,
    CRYSTAL_COLLECT_RADIUS: 3.2,
    WORMHOLE_RADIUS: 4.8,
    ASTEROID_RADIUS: 2.4,
    STAGE_BOUNDS: { minX: -12, maxX: 112, minY: -12, maxY: 112 },
    DEFAULT_PAR_SHOTS: 3,
    MAX_TRAJECTORY_STEPS: 60,
    TRAJECTORY_DT: 0.04
  };

  // --- 2. ASSET PATH REGISTRY ---
  const ASSETS = {
    images: [
      'assets/orbital-slingshot-assets/page-1/page-1-bg.png',
      'assets/orbital-slingshot-assets/page-1/page-1-bg.webp',
      'assets/orbital-slingshot-assets/page-1/title-logo.png',
      'assets/orbital-slingshot-assets/page-1/emblem.png',
      'assets/orbital-slingshot-assets/page-2/story-bg.png',
      'assets/orbital-slingshot-assets/page-2/slingshot-guide.png',
      'assets/orbital-slingshot-assets/page-2/gravity-guide.png',
      'assets/orbital-slingshot-assets/page-2/crystal-guide.png',
      'assets/orbital-slingshot-assets/page-2/wormhole-guide.png',
      'assets/orbital-slingshot-assets/page-3/map-bg.png',
      'assets/orbital-slingshot-assets/page-3/sector-earth.png',
      'assets/orbital-slingshot-assets/page-3/sector-mars.png',
      'assets/orbital-slingshot-assets/page-3/sector-jupiter.png',
      'assets/orbital-slingshot-assets/page-3/sector-saturn.png',
      'assets/orbital-slingshot-assets/page-3/sector-uranus.png',
      'assets/orbital-slingshot-assets/page-3/sector-neptune.png',
      'assets/orbital-slingshot-assets/page-3/sector-void.png',
      'assets/orbital-slingshot-assets/page-3/star-badge-0.png',
      'assets/orbital-slingshot-assets/page-3/star-badge-1.png',
      'assets/orbital-slingshot-assets/page-3/star-badge-2.png',
      'assets/orbital-slingshot-assets/page-3/star-badge-3.png',
      'assets/orbital-slingshot-assets/page-3/lock-icon.png',
      'assets/orbital-slingshot-assets/page-4/space-backdrop.png',
      'assets/orbital-slingshot-assets/page-4/planet-terran.png',
      'assets/orbital-slingshot-assets/page-4/planet-gas-giant.png',
      'assets/orbital-slingshot-assets/page-4/planet-ice.png',
      'assets/orbital-slingshot-assets/page-4/planet-lava.png',
      'assets/orbital-slingshot-assets/page-4/planet-rings.png',
      'assets/orbital-slingshot-assets/page-4/planet-pulsar.png',
      'assets/orbital-slingshot-assets/page-4/probe.png',
      'assets/orbital-slingshot-assets/page-4/wormhole.png',
      'assets/orbital-slingshot-assets/page-4/star-crystal.png',
      'assets/orbital-slingshot-assets/page-4/asteroid.png'
    ],
    audio: [
      'assets/orbital-slingshot-assets/audio/menu-bgm.wav',
      'assets/orbital-slingshot-assets/audio/game-bgm.wav',
      'assets/orbital-slingshot-assets/audio/launch.wav',
      'assets/orbital-slingshot-assets/audio/star.wav',
      'assets/orbital-slingshot-assets/audio/warp.wav',
      'assets/orbital-slingshot-assets/audio/crash.wav'
    ]
  };

  // --- 3. SHIP TRAILS CATALOG ---
  const TRAILS = [
    { id: 'cyan', name: 'Ion Cyan', color: '#00f0ff', glow: 'rgba(0, 240, 255, 0.6)', requiredStars: 0 },
    { id: 'solar', name: 'Solar Flare', color: '#ffb703', glow: 'rgba(255, 183, 3, 0.6)', requiredStars: 6 },
    { id: 'plasma', name: 'Plasma Magenta', color: '#f72585', glow: 'rgba(247, 37, 133, 0.6)', requiredStars: 15 },
    { id: 'emerald', name: 'Warp Emerald', color: '#06d6a0', glow: 'rgba(6, 214, 160, 0.6)', requiredStars: 25 }
  ];

  // --- 4. 12 LEVEL CONFIGURATIONS ---
  const LEVELS = [
    {
      id: 1,
      title: 'Orbit Alpha',
      sector: 'Sol Gateway',
      sectorBadge: 'sector-earth',
      parShots: 2,
      probeStart: { x: 50, y: 78 },
      wormhole: { x: 50, y: 16, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Terra Nova', type: 'terran', x: 50, y: 50, radius: 8.5, mass: 28, texture: 'planet-terran.png' }
      ],
      hazards: [],
      crystals: [
        { id: 1, x: 28, y: 50, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 50, y: 32, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 72, y: 50, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 2,
      title: 'Lunar Deflection',
      sector: 'Sol Gateway',
      sectorBadge: 'sector-earth',
      parShots: 2,
      probeStart: { x: 25, y: 78 },
      wormhole: { x: 75, y: 18, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Earth Prime', type: 'terran', x: 42, y: 54, radius: 8.0, mass: 26, texture: 'planet-terran.png' },
        { name: 'Luna Beta', type: 'ice', x: 68, y: 40, radius: 5.0, mass: 12, texture: 'planet-ice.png' }
      ],
      hazards: [],
      crystals: [
        { id: 1, x: 34, y: 68, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 52, y: 44, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 80, y: 32, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 3,
      title: 'Martian Slalom',
      sector: 'Martian Belt',
      sectorBadge: 'sector-mars',
      parShots: 2,
      probeStart: { x: 75, y: 78 },
      wormhole: { x: 25, y: 16, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Ares Prime', type: 'lava', x: 50, y: 50, radius: 8.0, mass: 25, texture: 'planet-lava.png' }
      ],
      hazards: [
        { id: 1, name: 'Phobos Shard', x: 30, y: 38, radius: CONSTANTS.ASTEROID_RADIUS }
      ],
      crystals: [
        { id: 1, x: 68, y: 64, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 36, y: 52, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 28, y: 28, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 4,
      title: 'Asteroid Corridor',
      sector: 'Martian Belt',
      sectorBadge: 'sector-mars',
      parShots: 2,
      probeStart: { x: 50, y: 78 },
      wormhole: { x: 50, y: 14, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Ceres Core', type: 'terran', x: 50, y: 52, radius: 7.5, mass: 24, texture: 'planet-terran.png' }
      ],
      hazards: [
        { id: 1, name: 'Asteroid Alpha', x: 32, y: 52, radius: CONSTANTS.ASTEROID_RADIUS },
        { id: 2, name: 'Asteroid Beta', x: 68, y: 52, radius: CONSTANTS.ASTEROID_RADIUS }
      ],
      crystals: [
        { id: 1, x: 50, y: 70, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 20, y: 38, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 80, y: 38, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 5,
      title: 'Binary Repulsor',
      sector: 'Jovian Ring',
      sectorBadge: 'sector-jupiter',
      parShots: 2,
      probeStart: { x: 30, y: 78 },
      wormhole: { x: 70, y: 15, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Helios Attractor', type: 'gas-giant', x: 65, y: 55, radius: 9.0, mass: 32, texture: 'planet-gas-giant.png' },
        { name: 'Zephyr Pulsar', type: 'pulsar', x: 35, y: 45, radius: 6.0, mass: -18, texture: 'planet-pulsar.png' } // Repulsor!
      ],
      hazards: [],
      crystals: [
        { id: 1, x: 48, y: 70, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 48, y: 48, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 78, y: 32, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 6,
      title: 'The Great Red Eye',
      sector: 'Jovian Ring',
      sectorBadge: 'sector-jupiter',
      parShots: 2,
      probeStart: { x: 50, y: 78 },
      wormhole: { x: 50, y: 12, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Jove Massive', type: 'gas-giant', x: 50, y: 48, radius: 11.0, mass: 42, texture: 'planet-gas-giant.png' }
      ],
      hazards: [
        { id: 1, name: 'Storm Shard A', x: 24, y: 48, radius: CONSTANTS.ASTEROID_RADIUS },
        { id: 2, name: 'Storm Shard B', x: 76, y: 48, radius: CONSTANTS.ASTEROID_RADIUS }
      ],
      crystals: [
        { id: 1, x: 26, y: 64, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 74, y: 64, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 50, y: 28, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 7,
      title: 'Saturnian Crossing',
      sector: 'Saturnian Abyss',
      sectorBadge: 'sector-saturn',
      parShots: 3,
      probeStart: { x: 20, y: 78 },
      wormhole: { x: 80, y: 16, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Cronus Gold', type: 'gas-giant', x: 50, y: 50, radius: 9.5, mass: 34, texture: 'planet-gas-giant.png', rings: true }
      ],
      hazards: [
        { id: 1, name: 'Ring Debris 1', x: 30, y: 50, radius: CONSTANTS.ASTEROID_RADIUS },
        { id: 2, name: 'Ring Debris 2', x: 70, y: 50, radius: CONSTANTS.ASTEROID_RADIUS }
      ],
      crystals: [
        { id: 1, x: 35, y: 72, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 50, y: 32, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 65, y: 25, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 8,
      title: 'Uranian Gauntlet',
      sector: 'Saturnian Abyss',
      sectorBadge: 'sector-uranus',
      parShots: 2,
      probeStart: { x: 50, y: 78 },
      wormhole: { x: 50, y: 15, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Titania Ice', type: 'ice', x: 32, y: 48, radius: 7.5, mass: 22, texture: 'planet-ice.png' },
        { name: 'Oberon Ice', type: 'ice', x: 68, y: 48, radius: 7.5, mass: 22, texture: 'planet-ice.png' }
      ],
      hazards: [
        { id: 1, name: 'Ice Spire', x: 50, y: 48, radius: CONSTANTS.ASTEROID_RADIUS }
      ],
      crystals: [
        { id: 1, x: 50, y: 68, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 18, y: 36, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 82, y: 36, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 9,
      title: 'Repulsor Alley',
      sector: 'Neptunian Deep',
      sectorBadge: 'sector-neptune',
      parShots: 2,
      probeStart: { x: 50, y: 78 },
      wormhole: { x: 50, y: 14, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Pulsar Alpha', type: 'pulsar', x: 26, y: 52, radius: 6.5, mass: -20, texture: 'planet-pulsar.png' },
        { name: 'Pulsar Omega', type: 'pulsar', x: 74, y: 52, radius: 6.5, mass: -20, texture: 'planet-pulsar.png' },
        { name: 'Neptune Core', type: 'ice', x: 50, y: 36, radius: 7.0, mass: 24, texture: 'planet-ice.png' }
      ],
      hazards: [],
      crystals: [
        { id: 1, x: 50, y: 64, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 32, y: 36, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 68, y: 36, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 10,
      title: 'Celestial Triangle',
      sector: 'Deep Void',
      sectorBadge: 'sector-void',
      parShots: 3,
      probeStart: { x: 50, y: 78 },
      wormhole: { x: 50, y: 15, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Inferno', type: 'lava', x: 28, y: 60, radius: 7.0, mass: 24, texture: 'planet-lava.png' },
        { name: 'Glacies', type: 'ice', x: 72, y: 60, radius: 7.0, mass: 24, texture: 'planet-ice.png' },
        { name: 'Verdant', type: 'terran', x: 50, y: 38, radius: 8.0, mass: 26, texture: 'planet-terran.png' }
      ],
      hazards: [],
      crystals: [
        { id: 1, x: 50, y: 62, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 24, y: 40, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 76, y: 40, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 11,
      title: 'Eclipse Nexus',
      sector: 'Deep Void',
      sectorBadge: 'sector-void',
      parShots: 3,
      probeStart: { x: 22, y: 78 },
      wormhole: { x: 78, y: 16, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Eclipse Star', type: 'gas-giant', x: 50, y: 50, radius: 9.0, mass: 35, texture: 'planet-gas-giant.png' },
        { name: 'Dark Pulsar', type: 'pulsar', x: 74, y: 48, radius: 6.0, mass: -18, texture: 'planet-pulsar.png' }
      ],
      hazards: [
        { id: 1, name: 'Nexus Shard 1', x: 34, y: 36, radius: CONSTANTS.ASTEROID_RADIUS },
        { id: 2, name: 'Nexus Shard 2', x: 62, y: 64, radius: CONSTANTS.ASTEROID_RADIUS }
      ],
      crystals: [
        { id: 1, x: 38, y: 66, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 50, y: 30, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 80, y: 32, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    },
    {
      id: 12,
      title: 'Event Horizon',
      sector: 'Deep Void',
      sectorBadge: 'sector-void',
      parShots: 3,
      probeStart: { x: 50, y: 78 },
      wormhole: { x: 50, y: 12, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: [
        { name: 'Singularity Zero', type: 'gas-giant', x: 50, y: 50, radius: 10.5, mass: 48, texture: 'planet-gas-giant.png' },
        { name: 'Vortex Pulsar', type: 'pulsar', x: 50, y: 30, radius: 5.5, mass: -16, texture: 'planet-pulsar.png' }
      ],
      hazards: [
        { id: 1, name: 'Void Boulder A', x: 28, y: 50, radius: CONSTANTS.ASTEROID_RADIUS },
        { id: 2, name: 'Void Boulder B', x: 72, y: 50, radius: CONSTANTS.ASTEROID_RADIUS }
      ],
      crystals: [
        { id: 1, x: 20, y: 32, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 50, y: 68, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 80, y: 32, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    }
  ];

  // --- 5. PROCEDURAL LEVEL GENERATOR (FOR ENDLESS SECTOR) ---
  function generateProceduralLevel(levelIndex) {
    const seed = (levelIndex * 9301 + 49297) % 233280;
    const rng = (offset) => {
      const v = (seed + offset * 1337) % 1000;
      return v / 1000;
    };

    const hasPulsar = rng(1) > 0.45;
    const planetTypes = ['terran', 'gas-giant', 'ice', 'lava'];
    const pType = planetTypes[Math.floor(rng(2) * planetTypes.length)];

    const mainX = 35 + rng(3) * 30;
    const mainY = 42 + rng(4) * 20;
    const mainMass = 24 + rng(5) * 18;

    const planets = [
      {
        name: `Sector-${levelIndex} Prime`,
        type: pType,
        x: mainX,
        y: mainY,
        radius: 8.0 + rng(6) * 2.5,
        mass: mainMass,
        texture: `planet-${pType}.png`
      }
    ];

    if (hasPulsar) {
      planets.push({
        name: `Pulsar-${levelIndex}`,
        type: 'pulsar',
        x: 100 - mainX,
        y: 40 + rng(7) * 25,
        radius: 6.0,
        mass: -(14 + rng(8) * 8),
        texture: 'planet-pulsar.png'
      });
    }

    const hazards = [];
    if (rng(9) > 0.3) {
      hazards.push({
        id: 1,
        name: 'Roaming Asteroid',
        x: 25 + rng(10) * 50,
        y: 35 + rng(11) * 30,
        radius: CONSTANTS.ASTEROID_RADIUS
      });
    }

    return {
      id: levelIndex,
      title: `Void Sector ${levelIndex}`,
      sector: 'Infinite Cosmos',
      sectorBadge: 'sector-void',
      parShots: 3,
      probeStart: { x: 50, y: 86 },
      wormhole: { x: 25 + rng(12) * 50, y: 14 + rng(13) * 6, radius: CONSTANTS.WORMHOLE_RADIUS },
      planets: planets,
      hazards: hazards,
      crystals: [
        { id: 1, x: 25 + rng(14) * 50, y: 65 + rng(15) * 15, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 2, x: 20 + rng(16) * 60, y: 40 + rng(17) * 20, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS },
        { id: 3, x: 25 + rng(18) * 50, y: 24 + rng(19) * 14, radius: CONSTANTS.CRYSTAL_COLLECT_RADIUS }
      ]
    };
  }

  // --- 6. GAME STATE INITIALIZER ---
  function createGameState(levelConfig) {
    const config = JSON.parse(JSON.stringify(levelConfig));
    return {
      levelId: config.id,
      title: config.title,
      sector: config.sector,
      sectorBadge: config.sectorBadge,
      parShots: config.parShots || CONSTANTS.DEFAULT_PAR_SHOTS,
      shotsUsed: 0,
      shotsRemaining: config.parShots || CONSTANTS.DEFAULT_PAR_SHOTS,
      wormhole: config.wormhole,
      planets: config.planets,
      hazards: config.hazards || [],
      crystals: config.crystals.map(c => ({ ...c, collected: false })),
      crystalsCollectedCount: 0,
      probe: {
        x: config.probeStart.x,
        y: config.probeStart.y,
        vx: 0,
        vy: 0,
        radius: CONSTANTS.PROBE_RADIUS,
        active: false,
        alive: true,
        escaped: false,
        won: false
      },
      probeStart: { ...config.probeStart },
      elapsedTime: 0,
      status: 'aiming' // 'aiming' | 'flying' | 'won' | 'crashed' | 'drifted'
    };
  }

  // --- 7. PURE STEP SIMULATION ---
  function simulateStep(state, dt) {
    if (!state.probe.active || !state.probe.alive || state.probe.won) {
      return { outcome: 'idle' };
    }

    state.elapsedTime += dt;
    const probe = state.probe;

    // 1. Calculate cumulative gravitational acceleration
    let ax = 0;
    let ay = 0;

    for (let i = 0; i < state.planets.length; i++) {
      const p = state.planets[i];
      const dx = p.x - probe.x;
      const dy = p.y - probe.y;
      const distSq = dx * dx + dy * dy;
      const rEff = Math.sqrt(distSq + CONSTANTS.SOFTENING * CONSTANTS.SOFTENING);
      const accel = (CONSTANTS.G * p.mass) / (rEff * rEff * rEff);
      ax += accel * dx;
      ay += accel * dy;
    }

    // 2. Integrate velocity & clamp
    probe.vx += ax * dt;
    probe.vy += ay * dt;
    const speed = Math.hypot(probe.vx, probe.vy);
    if (speed > CONSTANTS.MAX_VELOCITY) {
      probe.vx = (probe.vx / speed) * CONSTANTS.MAX_VELOCITY;
      probe.vy = (probe.vy / speed) * CONSTANTS.MAX_VELOCITY;
    }

    // 3. Integrate position
    probe.x += probe.vx * dt;
    probe.y += probe.vy * dt;

    // 4. Check collisions with Planets
    for (let i = 0; i < state.planets.length; i++) {
      const p = state.planets[i];
      const dist = Math.hypot(p.x - probe.x, p.y - probe.y);
      if (dist <= p.radius + probe.radius) {
        probe.alive = false;
        probe.active = false;
        state.status = 'crashed';
        return {
          outcome: 'crash',
          reason: `Atmospheric Vaporization: Crashed into ${p.name || 'planet'}!`,
          body: p
        };
      }
    }

    // 5. Check collisions with Hazards (Asteroids)
    for (let i = 0; i < state.hazards.length; i++) {
      const h = state.hazards[i];
      const dist = Math.hypot(h.x - probe.x, h.y - probe.y);
      if (dist <= h.radius + probe.radius) {
        probe.alive = false;
        probe.active = false;
        state.status = 'crashed';
        return {
          outcome: 'crash',
          reason: 'Asteroid Impact: Hull pulverized by space debris!',
          body: h
        };
      }
    }

    // 6. Check Star Crystal collection
    for (let i = 0; i < state.crystals.length; i++) {
      const c = state.crystals[i];
      if (!c.collected) {
        const dist = Math.hypot(c.x - probe.x, c.y - probe.y);
        if (dist <= c.radius + probe.radius) {
          c.collected = true;
          state.crystalsCollectedCount++;
          return {
            outcome: 'star',
            crystalId: c.id,
            totalCollected: state.crystalsCollectedCount
          };
        }
      }
    }

    // 7. Check Wormhole victory
    const distWormhole = Math.hypot(state.wormhole.x - probe.x, state.wormhole.y - probe.y);
    if (distWormhole <= state.wormhole.radius + probe.radius) {
      probe.active = false;
      probe.won = true;
      state.status = 'won';
      return {
        outcome: 'warp',
        reason: 'Jump coordinates locked! Hyperdrive jump successful.'
      };
    }

    // 8. Check Deep Space Drift (Out of Bounds)
    const bounds = CONSTANTS.STAGE_BOUNDS;
    if (probe.x < bounds.minX || probe.x > bounds.maxX || probe.y < bounds.minY || probe.y > bounds.maxY) {
      probe.alive = false;
      probe.active = false;
      state.status = 'drifted';
      return {
        outcome: 'drift',
        reason: 'Deep Space Drift: Trajectory escaped recovery envelope!'
      };
    }

    return { outcome: 'flying' };
  }

  // --- 8. TRAJECTORY PREDICTION SOLVER (Dotted Arc) ---
  function computeTrajectory(startPos, pullDelta, planets, hazards, maxSteps = CONSTANTS.MAX_TRAJECTORY_STEPS, dt = CONSTANTS.TRAJECTORY_DT) {
    const points = [];
    const pullDist = Math.hypot(pullDelta.x, pullDelta.y);
    if (pullDist < CONSTANTS.MIN_LAUNCH_PULL) {
      return points;
    }

    // Calculate initial launch velocity from inverted pull vector
    const launchVx = -pullDelta.x * CONSTANTS.SLINGSHOT_FORCE_SCALE;
    const launchVy = -pullDelta.y * CONSTANTS.SLINGSHOT_FORCE_SCALE;

    let x = startPos.x;
    let y = startPos.y;
    let vx = launchVx;
    let vy = launchVy;

    for (let step = 0; step < maxSteps; step++) {
      // 1. Gravity acceleration
      let ax = 0;
      let ay = 0;
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        const dx = p.x - x;
        const dy = p.y - y;
        const distSq = dx * dx + dy * dy;
        const rEff = Math.sqrt(distSq + CONSTANTS.SOFTENING * CONSTANTS.SOFTENING);
        const accel = (CONSTANTS.G * p.mass) / (rEff * rEff * rEff);
        ax += accel * dx;
        ay += accel * dy;
      }

      vx += ax * dt;
      vy += ay * dt;
      const speed = Math.hypot(vx, vy);
      if (speed > CONSTANTS.MAX_VELOCITY) {
        vx = (vx / speed) * CONSTANTS.MAX_VELOCITY;
        vy = (vy / speed) * CONSTANTS.MAX_VELOCITY;
      }

      x += vx * dt;
      y += vy * dt;

      // Check collision with planets
      let collided = false;
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        if (Math.hypot(p.x - x, p.y - y) <= p.radius + CONSTANTS.PROBE_RADIUS) {
          points.push({ x, y, hit: 'planet' });
          collided = true;
          break;
        }
      }
      if (collided) break;

      // Check collision with hazards
      for (let i = 0; i < hazards.length; i++) {
        const h = hazards[i];
        if (Math.hypot(h.x - x, h.y - y) <= h.radius + CONSTANTS.PROBE_RADIUS) {
          points.push({ x, y, hit: 'hazard' });
          collided = true;
          break;
        }
      }
      if (collided) break;

      // Check out of bounds
      const bounds = CONSTANTS.STAGE_BOUNDS;
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
        points.push({ x, y, hit: 'drift' });
        break;
      }

      points.push({ x, y });
    }

    return points;
  }

  // --- 9. PAR & STAR RATING CALCULATOR ---
  function calculateStars(shotsUsed, crystalsCollected, parShots = CONSTANTS.DEFAULT_PAR_SHOTS) {
    if (shotsUsed <= 0) return 0;
    // 3 Stars: Collected all 3 crystals and used <= par shots
    if (crystalsCollected >= 3 && shotsUsed <= parShots) {
      return 3;
    }
    // 2 Stars: Collected 2+ crystals OR used <= par shots
    if (crystalsCollected >= 2 || shotsUsed <= parShots) {
      return 2;
    }
    // 1 Star: Reached wormhole
    return 1;
  }

  function calculateScore(levelIndex, shotsUsed, crystalsCollected, elapsedTimeSec) {
    const baseScore = levelIndex * 1000;
    const crystalBonus = crystalsCollected * 500;
    const shotBonus = Math.max(0, 4 - shotsUsed) * 350;
    const timeBonus = Math.max(0, Math.floor((30 - elapsedTimeSec) * 20));
    return baseScore + crystalBonus + shotBonus + timeBonus;
  }

  // --- 10. LOCAL STORAGE SAVE / PROGRESSION SYSTEM ---
  const STORAGE_KEY = 'orbital_slingshot_save_v1';

  function getDefaultSaveData() {
    return {
      version: 1,
      unlockedLevels: [1],
      levelStars: { 1: 0 },
      levelScores: { 1: 0 },
      equippedTrail: 'cyan',
      unlockedTrails: ['cyan'],
      soundMuted: false,
      endlessUnlocked: false,
      endlessHighScore: 0
    };
  }

  function loadSaveData(storage) {
    try {
      if (!storage) return getDefaultSaveData();
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultSaveData();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return getDefaultSaveData();
      const def = getDefaultSaveData();
      return {
        ...def,
        ...parsed,
        unlockedLevels: Array.isArray(parsed.unlockedLevels) && parsed.unlockedLevels.length > 0 ? parsed.unlockedLevels : def.unlockedLevels,
        levelStars: (parsed.levelStars && typeof parsed.levelStars === 'object') ? { ...def.levelStars, ...parsed.levelStars } : def.levelStars,
        levelScores: (parsed.levelScores && typeof parsed.levelScores === 'object') ? { ...def.levelScores, ...parsed.levelScores } : def.levelScores,
        unlockedTrails: Array.isArray(parsed.unlockedTrails) && parsed.unlockedTrails.length > 0 ? parsed.unlockedTrails : def.unlockedTrails
      };
    } catch (e) {
      // Private browsing or quota exceeded fallback
      return getDefaultSaveData();
    }
  }

  function saveGameData(storage, data) {
    try {
      if (!storage) return false;
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function unlockNextLevel(saveData, currentLevelId, starsEarned, score) {
    const data = JSON.parse(JSON.stringify(saveData));
    data.levelStars[currentLevelId] = Math.max(data.levelStars[currentLevelId] || 0, starsEarned);
    data.levelScores[currentLevelId] = Math.max(data.levelScores[currentLevelId] || 0, score);

    const nextId = currentLevelId + 1;
    if (nextId <= LEVELS.length && !data.unlockedLevels.includes(nextId)) {
      data.unlockedLevels.push(nextId);
      data.levelStars[nextId] = 0;
      data.levelScores[nextId] = 0;
    }

    // Unlock Endless mode after completing Level 5
    if (currentLevelId >= 5) {
      data.endlessUnlocked = true;
    }

    // Check Trail unlocks
    const totalStars = Object.values(data.levelStars).reduce((sum, s) => sum + s, 0);
    TRAILS.forEach(trail => {
      if (totalStars >= trail.requiredStars && !data.unlockedTrails.includes(trail.id)) {
        data.unlockedTrails.push(trail.id);
      }
    });

    return data;
  }

  // --- 11. PUBLIC API EXPORT ---
  return {
    CONSTANTS,
    ASSETS,
    TRAILS,
    LEVELS,
    generateProceduralLevel,
    createGameState,
    simulateStep,
    computeTrajectory,
    calculateStars,
    calculateScore,
    getDefaultSaveData,
    loadSaveData,
    saveGameData,
    unlockNextLevel
  };
});
