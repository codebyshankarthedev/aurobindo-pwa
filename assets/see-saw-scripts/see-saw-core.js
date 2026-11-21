/**
 * See Saw — Core Game Logic & Pure Mathematical Torque Balance Solver
 * Zero DOM dependencies. Safe for Node.js unit testing and browser runtime.
 */

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.SeeSawCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- 1. PHYSICS & GEOMETRY CONSTANTS ---
  const CONSTANTS = {
    FULCRUM: { x: 50, y: 58 }, // % coordinates on 9:16 stage
    BEAM_LENGTH_PCT: 72,
    MAX_TILT_DEG: 14.0,
    TILT_DAMPING: 0.85,
    EQUILIBRIUM_TOLERANCE: 0.05,
    SLOTS: [
      { id: 'L-3', side: 'left', distance: -3, x: 18, y: 58, label: '3x' },
      { id: 'L-2', side: 'left', distance: -2, x: 28, y: 58, label: '2x' },
      { id: 'L-1', side: 'left', distance: -1, x: 38, y: 58, label: '1x' },
      { id: 'R-1', side: 'right', distance: 1, x: 62, y: 58, label: '1x' },
      { id: 'R-2', side: 'right', distance: 2, x: 72, y: 58, label: '2x' },
      { id: 'R-3', side: 'right', distance: 3, x: 82, y: 58, label: '3x' }
    ]
  };

  // --- 2. ASSET PATH REGISTRY ---
  const ASSETS = {
    images: [
      'assets/see-saw-assets/page-1/page-1-bg.png',
      'assets/see-saw-assets/page-1/page-1-bg.webp',
      'assets/see-saw-assets/page-1/title-logo.png',
      'assets/see-saw-assets/page-1/emblem.png',
      'assets/see-saw-assets/page-2/story-bg.png',
      'assets/see-saw-assets/page-2/torque-guide.png',
      'assets/see-saw-assets/page-2/drag-guide.png',
      'assets/see-saw-assets/page-2/balance-guide.png',
      'assets/see-saw-assets/page-2/stars-guide.png',
      'assets/see-saw-assets/page-3/map-bg.png',
      'assets/see-saw-assets/page-3/lab-badge-1.png',
      'assets/see-saw-assets/page-3/lab-badge-2.png',
      'assets/see-saw-assets/page-3/lab-badge-3.png',
      'assets/see-saw-assets/page-3/lab-badge-4.png',
      'assets/see-saw-assets/page-3/lab-badge-5.png',
      'assets/see-saw-assets/page-3/lab-badge-6.png',
      'assets/see-saw-assets/page-3/star-badge-0.png',
      'assets/see-saw-assets/page-3/star-badge-1.png',
      'assets/see-saw-assets/page-3/star-badge-2.png',
      'assets/see-saw-assets/page-3/star-badge-3.png',
      'assets/see-saw-assets/page-3/lock-icon.png',
      'assets/see-saw-assets/page-4/lab-backdrop.png',
      'assets/see-saw-assets/page-4/seesaw-fulcrum.png',
      'assets/see-saw-assets/page-4/seesaw-beam.png',
      'assets/see-saw-assets/page-4/weight-1g.png',
      'assets/see-saw-assets/page-4/weight-2g.png',
      'assets/see-saw-assets/page-4/weight-3g.png',
      'assets/see-saw-assets/page-4/weight-5g.png',
      'assets/see-saw-assets/page-4/weight-10g.png',
      'assets/see-saw-assets/page-4/weight-20g.png',
      'assets/see-saw-assets/page-4/vial-blue.png',
      'assets/see-saw-assets/page-4/vial-green.png',
      'assets/see-saw-assets/page-4/vial-amber.png',
      'assets/see-saw-assets/page-4/indicator-needle.png',
      'assets/see-saw-assets/page-4/equilibrium-glow.png'
    ],
    audio: [
      'assets/see-saw-assets/audio/menu-bgm.wav',
      'assets/see-saw-assets/audio/game-bgm.wav',
      'assets/see-saw-assets/audio/drop.wav',
      'assets/see-saw-assets/audio/balance.wav',
      'assets/see-saw-assets/audio/star.wav',
      'assets/see-saw-assets/audio/fail.wav'
    ]
  };

  // --- 3. 12 PRECISION LAB BALANCE LEVELS ---
  const LEVELS = [
    {
      id: 1,
      title: 'Calibration Basics',
      labStation: 'Standardization Lab',
      badge: 'lab-badge-1',
      parMoves: 1,
      hint: 'Place a 5g weight on the right side at 2x distance to achieve balance.',
      preplaced: [
        { slotId: 'L-2', weight: { id: 'p-1', mass: 5, label: '5g', sprite: 'weight-5g.png', locked: true } }
      ],
      rack: [
        { id: 'w-1', mass: 5, label: '5g', sprite: 'weight-5g.png' }
      ]
    },
    {
      id: 2,
      title: 'Leverage Principle',
      labStation: 'Standardization Lab',
      badge: 'lab-badge-1',
      parMoves: 1,
      hint: 'A smaller mass placed further from the fulcrum balances a larger mass.',
      preplaced: [
        { slotId: 'L-1', weight: { id: 'p-2', mass: 10, label: '10g', sprite: 'weight-10g.png', locked: true } }
      ],
      rack: [
        { id: 'w-2', mass: 5, label: '5g', sprite: 'weight-5g.png' }
      ]
    },
    {
      id: 3,
      title: 'Reagent Counterbalance',
      labStation: 'Formulation Suite',
      badge: 'lab-badge-2',
      parMoves: 2,
      hint: 'Combine weights to match torque τ = mass × distance.',
      preplaced: [
        { slotId: 'L-3', weight: { id: 'p-3', mass: 6, label: '6g', sprite: 'vial-blue.png', locked: true } }
      ],
      rack: [
        { id: 'w-3a', mass: 5, label: '5g', sprite: 'weight-5g.png' },
        { id: 'w-3b', mass: 4, label: '4g', sprite: 'vial-green.png' }
      ]
    },
    {
      id: 4,
      title: 'Split Aliquot',
      labStation: 'Formulation Suite',
      badge: 'lab-badge-2',
      parMoves: 2,
      hint: 'Balance two preplaced vials by distributing weights on the right arm.',
      preplaced: [
        { slotId: 'L-2', weight: { id: 'p-4a', mass: 4, label: '4g', sprite: 'vial-amber.png', locked: true } },
        { slotId: 'L-3', weight: { id: 'p-4b', mass: 2, label: '2g', sprite: 'weight-2g.png', locked: true } }
      ],
      rack: [
        { id: 'w-4a', mass: 5, label: '5g', sprite: 'weight-5g.png' },
        { id: 'w-4b', mass: 2, label: '2g', sprite: 'weight-2g.png' }
      ]
    },
    {
      id: 5,
      title: 'Dual Asymmetry',
      labStation: 'Reagent Assay',
      badge: 'lab-badge-3',
      parMoves: 2,
      hint: 'Both sides have initial weights. Adjust balance to reach 0° tilt.',
      preplaced: [
        { slotId: 'L-3', weight: { id: 'p-5a', mass: 5, label: '5g', sprite: 'weight-5g.png', locked: true } },
        { slotId: 'R-1', weight: { id: 'p-5b', mass: 3, label: '3g', sprite: 'weight-3g.png', locked: true } }
      ],
      rack: [
        { id: 'w-5a', mass: 4, label: '4g', sprite: 'vial-blue.png' },
        { id: 'w-5b', mass: 1, label: '1g', sprite: 'weight-1g.png' }
      ]
    },
    {
      id: 6,
      title: 'Compound Assay',
      labStation: 'Reagent Assay',
      badge: 'lab-badge-3',
      parMoves: 3,
      hint: 'Distribute 3 weights across right arm slots to match left torque of 24.',
      preplaced: [
        { slotId: 'L-3', weight: { id: 'p-6', mass: 8, label: '8g', sprite: 'vial-green.png', locked: true } }
      ],
      rack: [
        { id: 'w-6a', mass: 3, label: '3g', sprite: 'weight-3g.png' },
        { id: 'w-6b', mass: 5, label: '5g', sprite: 'weight-5g.png' },
        { id: 'w-6c', mass: 2, label: '2g', sprite: 'weight-2g.png' }
      ]
    },
    {
      id: 7,
      title: 'Heavy Batch Verification',
      labStation: 'Titration Bay',
      badge: 'lab-badge-4',
      parMoves: 2,
      hint: 'Utilize 20g precision weights with leveraged placement.',
      preplaced: [
        { slotId: 'L-2', weight: { id: 'p-7', mass: 20, label: '20g', sprite: 'weight-20g.png', locked: true } }
      ],
      rack: [
        { id: 'w-7a', mass: 10, label: '10g', sprite: 'weight-10g.png' },
        { id: 'w-7b', mass: 5, label: '5g', sprite: 'weight-5g.png' }
      ]
    },
    {
      id: 8,
      title: 'Microgram Titration',
      labStation: 'Titration Bay',
      badge: 'lab-badge-4',
      parMoves: 3,
      hint: 'Fine-tune small aliquots across all slots.',
      preplaced: [
        { slotId: 'L-3', weight: { id: 'p-8a', mass: 3, label: '3g', sprite: 'weight-3g.png', locked: true } },
        { slotId: 'L-1', weight: { id: 'p-8b', mass: 7, label: '7g', sprite: 'vial-amber.png', locked: true } }
      ],
      rack: [
        { id: 'w-8a', mass: 4, label: '4g', sprite: 'weight-5g.png' },
        { id: 'w-8b', mass: 2, label: '2g', sprite: 'weight-2g.png' },
        { id: 'w-8c', mass: 2, label: '2g', sprite: 'weight-2g.png' }
      ]
    },
    {
      id: 9,
      title: 'Three-Point Fulcrum',
      labStation: 'Chromatography Wing',
      badge: 'lab-badge-5',
      parMoves: 3,
      hint: 'Spread weights across 1x, 2x, and 3x positions.',
      preplaced: [
        { slotId: 'L-3', weight: { id: 'p-9a', mass: 5, label: '5g', sprite: 'weight-5g.png', locked: true } },
        { slotId: 'L-2', weight: { id: 'p-9b', mass: 4, label: '4g', sprite: 'vial-blue.png', locked: true } }
      ],
      rack: [
        { id: 'w-9a', mass: 5, label: '5g', sprite: 'weight-5g.png' },
        { id: 'w-9b', mass: 4, label: '4g', sprite: 'vial-green.png' },
        { id: 'w-9c', mass: 2, label: '2g', sprite: 'weight-2g.png' }
      ]
    },
    {
      id: 10,
      title: 'Catalyst Symmetry',
      labStation: 'Chromatography Wing',
      badge: 'lab-badge-5',
      parMoves: 3,
      hint: 'Left torque is 30. Find the combination that balances perfectly.',
      preplaced: [
        { slotId: 'L-3', weight: { id: 'p-10', mass: 10, label: '10g', sprite: 'weight-10g.png', locked: true } }
      ],
      rack: [
        { id: 'w-10a', mass: 5, label: '5g', sprite: 'weight-5g.png' },
        { id: 'w-10b', mass: 5, label: '5g', sprite: 'weight-5g.png' },
        { id: 'w-10c', mass: 5, label: '5g', sprite: 'weight-5g.png' }
      ]
    },
    {
      id: 11,
      title: 'Cleanroom Calibration',
      labStation: 'Master QC Suite',
      badge: 'lab-badge-6',
      parMoves: 3,
      hint: 'Offset pre-loaded balances using precise aliquot distributions.',
      preplaced: [
        { slotId: 'L-3', weight: { id: 'p-11a', mass: 7, label: '7g', sprite: 'vial-amber.png', locked: true } },
        { slotId: 'R-1', weight: { id: 'p-11b', mass: 4, label: '4g', sprite: 'vial-blue.png', locked: true } }
      ],
      rack: [
        { id: 'w-11a', mass: 5, label: '5g', sprite: 'weight-5g.png' },
        { id: 'w-11b', mass: 3, label: '3g', sprite: 'weight-3g.png' },
        { id: 'w-11c', mass: 2, label: '2g', sprite: 'weight-2g.png' }
      ]
    },
    {
      id: 12,
      title: 'Master Pharmacopeia',
      labStation: 'Master QC Suite',
      badge: 'lab-badge-6',
      parMoves: 3,
      hint: 'The ultimate quality control torque puzzle! Total left torque: 36.',
      preplaced: [
        { slotId: 'L-3', weight: { id: 'p-12a', mass: 8, label: '8g', sprite: 'weight-10g.png', locked: true } },
        { slotId: 'L-2', weight: { id: 'p-12b', mass: 6, label: '6g', sprite: 'vial-green.png', locked: true } }
      ],
      rack: [
        { id: 'w-12a', mass: 8, label: '8g', sprite: 'weight-10g.png' },
        { id: 'w-12b', mass: 4, label: '4g', sprite: 'weight-5g.png' },
        { id: 'w-12c', mass: 2, label: '2g', sprite: 'weight-2g.png' }
      ]
    }
  ];

  // --- 4. PROCEDURAL ENDLESS GENERATOR ---
  function generateProceduralLevel(levelIndex) {
    const seed = (levelIndex * 7919 + 31337) % 99991;
    const leftDist = 1 + (seed % 3);
    const leftMass = 3 + ((seed * 7) % 8);
    const targetTorque = leftMass * leftDist;

    return {
      id: levelIndex,
      title: `Batch #${levelIndex} Assay`,
      labStation: 'Infinite QC Laboratory',
      badge: 'lab-badge-6',
      parMoves: 2,
      hint: `Target left torque: ${targetTorque}. Place matching counter-torques on the right arm.`,
      preplaced: [
        {
          slotId: `L-${leftDist}`,
          weight: { id: `proc-p-${levelIndex}`, mass: leftMass, label: `${leftMass}g`, sprite: 'vial-blue.png', locked: true }
        }
      ],
      rack: [
        { id: `proc-w-1-${levelIndex}`, mass: leftMass, label: `${leftMass}g`, sprite: 'weight-5g.png' },
        { id: `proc-w-2-${levelIndex}`, mass: Math.max(1, Math.floor(leftMass / 2)), label: `${Math.max(1, Math.floor(leftMass / 2))}g`, sprite: 'weight-2g.png' }
      ]
    };
  }

  // --- 5. GAME STATE INITIALIZER ---
  function createGameState(levelConfig) {
    const config = JSON.parse(JSON.stringify(levelConfig));
    const slotsMap = {};
    CONSTANTS.SLOTS.forEach(s => {
      slotsMap[s.id] = null;
    });

    if (config.preplaced) {
      config.preplaced.forEach(p => {
        if (slotsMap[p.slotId] !== undefined) {
          slotsMap[p.slotId] = p.weight;
        }
      });
    }

    const initialTorque = calculateTorque(slotsMap);

    return {
      levelId: config.id,
      title: config.title,
      labStation: config.labStation,
      badge: config.badge,
      parMoves: config.parMoves || 2,
      movesUsed: 0,
      slots: slotsMap,
      rack: config.rack || [],
      tiltAngleDeg: initialTorque.tiltAngleDeg,
      leftTorque: initialTorque.leftTorque,
      rightTorque: initialTorque.rightTorque,
      netTorque: initialTorque.netTorque,
      isBalanced: initialTorque.isBalanced,
      elapsedTime: 0,
      status: 'playing' // 'playing' | 'balanced'
    };
  }

  // --- 6. PURE TORQUE & TILT CALCULATION ---
  function calculateTorque(slots) {
    let leftTorque = 0;
    let rightTorque = 0;

    CONSTANTS.SLOTS.forEach(slot => {
      const weight = slots[slot.id];
      if (weight && typeof weight.mass === 'number') {
        const t = weight.mass * Math.abs(slot.distance);
        if (slot.side === 'left') {
          leftTorque += t;
        } else {
          rightTorque += t;
        }
      }
    });

    const netTorque = rightTorque - leftTorque;
    let tiltAngleDeg = netTorque * CONSTANTS.TILT_DAMPING;
    tiltAngleDeg = Math.max(-CONSTANTS.MAX_TILT_DEG, Math.min(CONSTANTS.MAX_TILT_DEG, tiltAngleDeg));

    // Balanced when net torque is 0 and at least one weight is present on both sides
    const isBalanced = Math.abs(netTorque) <= CONSTANTS.EQUILIBRIUM_TOLERANCE && (leftTorque > 0 && rightTorque > 0);

    return {
      leftTorque,
      rightTorque,
      netTorque,
      tiltAngleDeg,
      isBalanced
    };
  }

  // --- 7. WEIGHT PLACEMENT & REMOVAL ACTIONS ---
  function placeWeightInSlot(state, weight, slotId) {
    if (!state.slots.hasOwnProperty(slotId)) return false;
    if (state.slots[slotId] !== null) return false; // Slot already occupied

    state.slots[slotId] = weight;
    state.movesUsed++;

    const torqueData = calculateTorque(state.slots);
    state.leftTorque = torqueData.leftTorque;
    state.rightTorque = torqueData.rightTorque;
    state.netTorque = torqueData.netTorque;
    state.tiltAngleDeg = torqueData.tiltAngleDeg;
    state.isBalanced = torqueData.isBalanced;

    if (state.isBalanced) {
      state.status = 'balanced';
    }

    return true;
  }

  function removeWeightFromSlot(state, slotId) {
    if (!state.slots.hasOwnProperty(slotId)) return null;
    const weight = state.slots[slotId];
    if (!weight || weight.locked) return null; // Locked weights cannot be removed

    state.slots[slotId] = null;

    const torqueData = calculateTorque(state.slots);
    state.leftTorque = torqueData.leftTorque;
    state.rightTorque = torqueData.rightTorque;
    state.netTorque = torqueData.netTorque;
    state.tiltAngleDeg = torqueData.tiltAngleDeg;
    state.isBalanced = torqueData.isBalanced;

    return weight;
  }

  // --- 8. STAR RATING & SCORING ---
  function calculateStars(movesUsed, parMoves) {
    if (movesUsed <= parMoves) return 3;
    if (movesUsed <= parMoves + 1) return 2;
    return 1;
  }

  function calculateScore(levelId, movesUsed, elapsedTimeSec) {
    const base = levelId * 1000;
    const moveBonus = Math.max(0, 10 - movesUsed) * 200;
    const timeBonus = Math.max(0, Math.floor((30 - elapsedTimeSec) * 25));
    return base + moveBonus + timeBonus;
  }

  // --- 9. LOCAL STORAGE PERSISTENCE ---
  const STORAGE_KEY = 'see_saw_save_v1';

  function getDefaultSaveData() {
    return {
      version: 1,
      unlockedLevels: [1],
      levelStars: { 1: 0 },
      levelScores: { 1: 0 },
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
        levelScores: (parsed.levelScores && typeof parsed.levelScores === 'object') ? { ...def.levelScores, ...parsed.levelScores } : def.levelScores
      };
    } catch (e) {
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

    if (currentLevelId >= 5) {
      data.endlessUnlocked = true;
    }

    return data;
  }

  // --- 10. PUBLIC MODULE EXPORT ---
  return {
    CONSTANTS,
    ASSETS,
    LEVELS,
    generateProceduralLevel,
    createGameState,
    calculateTorque,
    placeWeightInSlot,
    removeWeightFromSlot,
    calculateStars,
    calculateScore,
    getDefaultSaveData,
    loadSaveData,
    saveGameData,
    unlockNextLevel
  };
});
