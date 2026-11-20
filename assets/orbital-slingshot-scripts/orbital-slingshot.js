/**
 * Orbital Slingshot — Client Controller & Canvas Renderer
 * Adheres strictly to iOS Safari touch compliance, 9:16 portrait layout,
 * concurrent asset preloading with memory retention, and smooth state transitions.
 */

(function () {
  'use strict';

  const Core = window.OrbitalSlingshotCore;
  const AudioManager = window.OrbitalSlingshotAudio;

  if (!Core || !AudioManager) {
    console.error('Orbital Slingshot: Missing Core or Audio module.');
    return;
  }

  // Helper to resolve asset path relative to this script directory
  function resolveAssetUrl(p) {
    if (!p) return '';
    if (p.startsWith('../') || p.startsWith('http') || p.startsWith('data:')) return p;
    if (p.startsWith('assets/orbital-slingshot-assets/')) {
      return '../' + p.slice('assets/'.length);
    }
    return '../orbital-slingshot-assets/' + p;
  }

  // Persistent in-memory array to prevent mobile Safari decoded image eviction
  window.__ORBITAL_PRELOADED_IMAGES__ = [];
  const imageCache = new Map();

  // Audio & Save System
  const audio = new AudioManager();
  let saveData = Core.loadSaveData(window.localStorage);

  // App State
  let currentScreen = 'landing';
  let activeLevel = Core.LEVELS[0];
  let isEndlessMode = false;
  let endlessIndex = 13;
  let gameState = null;
  let animFrameId = null;
  let lastFrameTime = performance.now();
  let activeTimeouts = [];

  // Slingshot Aiming Pointer State
  let isAiming = false;
  let activePointerId = null;
  let pullStart = { x: 0, y: 0 };
  let pullCurrent = { x: 0, y: 0 };
  let pullDeltaPct = { x: 0, y: 0 };

  // Particles & Thruster Trails
  let particles = [];
  let trailPoints = [];

  // DOM Elements
  const stage = document.getElementById('stage');
  const screens = {
    landing: document.getElementById('screen-landing'),
    tutorial: document.getElementById('screen-tutorial'),
    map: document.getElementById('screen-map'),
    game: document.getElementById('screen-game')
  };

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const slingshotHitpad = document.getElementById('slingshot-hitpad');

  // Modals & HUD
  const modalVictory = document.getElementById('modal-victory');
  const modalDefeat = document.getElementById('modal-defeat');
  const defeatReason = document.getElementById('defeat-reason');
  const hudLevelName = document.getElementById('hud-level-name');
  const hudShotsPill = document.getElementById('hud-shots-pill');
  const hudCrystals = [
    document.getElementById('hud-crystal-1'),
    document.getElementById('hud-crystal-2'),
    document.getElementById('hud-crystal-3')
  ];

  function setSafeTimeout(fn, ms) {
    const id = setTimeout(() => {
      const idx = activeTimeouts.indexOf(id);
      if (idx !== -1) activeTimeouts.splice(idx, 1);
      fn();
    }, ms);
    activeTimeouts.push(id);
    return id;
  }

  function clearAllTimeouts() {
    activeTimeouts.forEach(id => clearTimeout(id));
    activeTimeouts = [];
  }

  // --- Dynamic Viewport Proportional Unit ---
  function updateViewportUnits() {
    const vw = window.innerWidth || 360;
    const vh = window.innerHeight || 640;
    const u = Math.max(2.8, Math.min(vw, vh * 9 / 16) / 100);
    document.documentElement.style.setProperty('--u', `${u}px`);
    if (stage) stage.style.setProperty('--u', `${u}px`);
  }

  // --- 1. ASSET PRELOADER ---
  function preloadAllAssets() {
    const percentEl = document.getElementById('preloader-percent');
    const barFill = document.getElementById('preloader-bar-fill');
    const statusEl = document.getElementById('preloader-status');
    const startWrap = document.getElementById('start-btn-wrap');

    const assetList = Core.ASSETS.images;
    const total = assetList.length;
    let completed = 0;

    function updateProgress() {
      const pct = Math.floor((completed / total) * 100);
      if (percentEl) percentEl.textContent = `${pct}%`;
      if (barFill) barFill.style.width = `${pct}%`;
      if (statusEl) statusEl.textContent = `Aligning celestial coordinates... ${pct}%`;

      if (completed >= total) {
        if (statusEl) statusEl.textContent = 'Orbital systems nominal. Ready for launch.';
        if (startWrap) startWrap.style.display = 'flex';
      }
    }

    assetList.forEach(rawSrc => {
      const resolved = resolveAssetUrl(rawSrc);
      const img = new Image();
      img.src = resolved;

      let finished = false;
      const timeoutId = setTimeout(() => {
        if (!finished) {
          finished = true;
          completed++;
          updateProgress();
        }
      }, 3000);

      const onDone = () => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          window.__ORBITAL_PRELOADED_IMAGES__.push(img);
          // Store under both raw path, resolved url, and basename
          imageCache.set(rawSrc, img);
          imageCache.set(resolved, img);
          const fname = rawSrc.split('/').pop();
          imageCache.set(fname, img);
          completed++;
          updateProgress();
        }
      };

      if (img.decode) {
        img.decode().then(onDone).catch(onDone);
      } else {
        img.onload = onDone;
        img.onerror = onDone;
      }
    });

    // Make sure start controls are accessible immediately
    if (startWrap) startWrap.style.display = 'flex';
  }

  // --- 2. SCREEN ROUTER & BGM CROSSFADER ---
  function showScreen(screenName) {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    clearAllTimeouts();

    Object.keys(screens).forEach(name => {
      screens[name].classList.remove('active');
    });

    const target = screens[screenName];
    if (target) {
      target.classList.add('active');
      currentScreen = screenName;
    }

    updateViewportUnits();

    if (screenName === 'game') {
      audio.playBgm('game');
    } else {
      audio.playBgm('menu');
    }

    if (screenName === 'map') {
      renderSectorMap();
    }
  }

  // --- 3. SECTOR MAP & TRAIL HANGAR RENDERING ---
  function renderSectorMap() {
    const container = document.getElementById('levels-container');
    const totalStarsEl = document.getElementById('total-stars-count');
    container.innerHTML = '';

    const totalStars = Object.values(saveData.levelStars).reduce((sum, s) => sum + s, 0);
    totalStarsEl.textContent = `${totalStars} / 36`;

    Core.LEVELS.forEach(level => {
      const isUnlocked = saveData.unlockedLevels.includes(level.id);
      const starsEarned = saveData.levelStars[level.id] || 0;
      const card = document.createElement('div');
      card.className = `level-card ${isUnlocked ? '' : 'locked'}`;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Sector ${level.id}: ${level.title}`);

      card.innerHTML = `
        <div class="level-card-left">
          <img src="../orbital-slingshot-assets/page-3/${level.sectorBadge}.png" alt="${level.sector}" class="sector-badge">
          <div class="level-info">
            <span class="level-number">Sector ${level.id}</span>
            <span class="level-name">${level.title}</span>
            <span class="level-sector-name">${level.sector}</span>
          </div>
        </div>
        <div class="level-card-right">
          ${isUnlocked
            ? `<img src="../orbital-slingshot-assets/page-3/star-badge-${starsEarned}.png" alt="${starsEarned} stars" class="level-star-badge">`
            : `<img src="../orbital-slingshot-assets/page-3/lock-icon.png" alt="Locked" class="level-lock-badge">`
          }
        </div>
      `;

      if (isUnlocked) {
        addTapListener(card, () => {
          isEndlessMode = false;
          startLevel(level);
        });
      }
      container.appendChild(card);
    });

    // Endless Mode Card
    if (saveData.endlessUnlocked) {
      const endlessCard = document.createElement('div');
      endlessCard.className = 'level-card';
      endlessCard.style.borderColor = 'var(--color-warp)';
      endlessCard.innerHTML = `
        <div class="level-card-left">
          <img src="../orbital-slingshot-assets/page-3/sector-void.png" alt="Endless" class="sector-badge">
          <div class="level-info">
            <span class="level-number">Endless Void</span>
            <span class="level-name">Procedural Cosmos</span>
            <span class="level-sector-name">High Score: ${saveData.endlessHighScore || 0}</span>
          </div>
        </div>
        <div class="level-card-right">
          <button class="btn-secondary" style="padding: 6px 12px; font-size: 11px;">WARP</button>
        </div>
      `;
      addTapListener(endlessCard, () => {
        isEndlessMode = true;
        endlessIndex = 13;
        const procedural = Core.generateProceduralLevel(endlessIndex);
        startLevel(procedural);
      });
      container.appendChild(endlessCard);
    }

    renderHangarTrails();
  }

  function renderHangarTrails() {
    const grid = document.getElementById('trails-grid');
    if (!grid) return;
    grid.innerHTML = '';

    Core.TRAILS.forEach(trail => {
      const isUnlocked = saveData.unlockedTrails.includes(trail.id);
      const isEquipped = saveData.equippedTrail === trail.id;
      const item = document.createElement('div');
      item.className = `trail-item ${isEquipped ? 'active' : ''} ${isUnlocked ? '' : 'locked'}`;

      item.innerHTML = `
        <div class="trail-preview-swatch" style="background: ${trail.color}; box-shadow: 0 0 10px ${trail.glow};"></div>
        <span class="trail-name">${trail.name}</span>
        <span class="trail-requirement">${isUnlocked ? (isEquipped ? 'EQUIPPED' : 'READY') : `Unlock: ${trail.requiredStars}★`}</span>
      `;

      if (isUnlocked) {
        addTapListener(item, () => {
          saveData.equippedTrail = trail.id;
          Core.saveGameData(window.localStorage, saveData);
          renderHangarTrails();
        });
      }

      grid.appendChild(item);
    });
  }

  // --- 4. GAMEPLAY START & RESIZING ---
  function resizeCanvas() {
    const rect = stage ? stage.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width) || Math.round(window.innerWidth) || 360;
    const h = Math.round(rect.height) || Math.round(window.innerHeight) || 640;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    if (ctx.setTransform) {
      ctx.setTransform(canvas.width / 100, 0, 0, canvas.height / 100, 0, 0);
    } else {
      ctx.scale(canvas.width / 100, canvas.height / 100);
    }
  }

  function startLevel(levelConfig) {
    activeLevel = levelConfig;
    gameState = Core.createGameState(levelConfig);
    particles = [];
    trailPoints = [];
    activePointerId = null;

    // Provide initial intuitive launch trajectory pointing towards the wormhole
    const toWormholeX = levelConfig.wormhole.x - levelConfig.probeStart.x;
    pullDeltaPct = {
      x: Math.max(-12, Math.min(12, -toWormholeX * 0.15)),
      y: 9.0
    };
    isAiming = false;

    modalVictory.classList.remove('active');
    modalDefeat.classList.remove('active');
    const modalRules = document.getElementById('modal-rules');
    if (modalRules) modalRules.classList.remove('active');

    hudLevelName.textContent = `Sector ${levelConfig.id}: ${levelConfig.title}`;
    updateHud();
    updateTelemetry();

    // Position Slingshot Hit-Pad over Probe Start
    slingshotHitpad.style.left = `${gameState.probeStart.x}%`;
    slingshotHitpad.style.top = `${gameState.probeStart.y}%`;

    showScreen('game');
    resizeCanvas();

    lastFrameTime = performance.now();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function updateHud() {
    if (!gameState) return;
    hudShotsPill.textContent = `SHOT ${gameState.shotsUsed + 1}/${gameState.parShots}`;
    hudCrystals.forEach((icon, i) => {
      const c = gameState.crystals[i];
      if (c && c.collected) {
        icon.classList.add('collected');
      } else {
        icon.classList.remove('collected');
      }
    });
  }

  // --- 5. TOUCH & POINTER HANDLING ---
  function getStageCoords(clientX, clientY, isTouch) {
    const rect = stage.getBoundingClientRect();
    const touchLift = isTouch ? -14 : 0;
    const px = clientX - rect.left;
    const py = (clientY + touchLift) - rect.top;
    return {
      x: (px / rect.width) * 100,
      y: (py / rect.height) * 100
    };
  }

  slingshotHitpad.addEventListener('pointerdown', (e) => {
    if (!gameState || gameState.probe.active || gameState.status !== 'aiming') return;
    if (e.cancelable) e.preventDefault();
    isAiming = true;
    activePointerId = e.pointerId;

    const isTouch = e.pointerType === 'touch';
    pullStart = getStageCoords(e.clientX, e.clientY, isTouch);
    pullCurrent = { ...pullStart };
    // Keep existing pullDeltaPct so trajectory arc stays visible while adjusting
  });

  window.addEventListener('pointermove', (e) => {
    if (!isAiming || e.pointerId !== activePointerId) return;
    if (e.cancelable) e.preventDefault();

    const isTouch = e.pointerType === 'touch';
    pullCurrent = getStageCoords(e.clientX, e.clientY, isTouch);

    let dx = pullCurrent.x - pullStart.x;
    let dy = pullCurrent.y - pullStart.y;
    const dist = Math.hypot(dx, dy);

    const maxR = Core.CONSTANTS.MAX_PULL_RADIUS;
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }

    pullDeltaPct = { x: dx, y: dy };
    updateTelemetry();
  });

  window.addEventListener('pointerup', (e) => {
    if (!isAiming || e.pointerId !== activePointerId) return;
    if (e.cancelable) e.preventDefault();
    isAiming = false;
    activePointerId = null;

    const pullDist = Math.hypot(pullDeltaPct.x, pullDeltaPct.y);
    const dragMovement = Math.hypot(pullCurrent.x - pullStart.x, pullCurrent.y - pullStart.y);

    if (dragMovement >= Core.CONSTANTS.MIN_LAUNCH_PULL && pullDist >= Core.CONSTANTS.MIN_LAUNCH_PULL) {
      // Intentional drag launch
      launchProbe();
    } else {
      // Tap without drag: If tapped above probe, point trajectory toward tapped target!
      const isTouch = e.pointerType === 'touch';
      const tapCoords = getStageCoords(e.clientX, e.clientY, isTouch);
      if (tapCoords.y < (gameState.probeStart.y - 3)) {
        const targetDx = tapCoords.x - gameState.probeStart.x;
        const targetDy = tapCoords.y - gameState.probeStart.y;
        // Launch velocity will be -pullDeltaPct * SLINGSHOT_FORCE_SCALE
        const scale = 0.22;
        const maxR = Core.CONSTANTS.MAX_PULL_RADIUS;
        let px = -targetDx * scale;
        let py = -targetDy * scale;
        const d = Math.hypot(px, py);
        if (d > maxR) {
          px = (px / d) * maxR;
          py = (py / d) * maxR;
        }
        pullDeltaPct = { x: px, y: Math.max(Core.CONSTANTS.MIN_LAUNCH_PULL, py) };
        updateTelemetry();
      } else if (pullDist < Core.CONSTANTS.MIN_LAUNCH_PULL) {
        pullDeltaPct = { x: 0, y: 9.0 };
        updateTelemetry();
      }
    }
  });

  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointerId) {
      isAiming = false;
      activePointerId = null;
      if (Math.hypot(pullDeltaPct.x, pullDeltaPct.y) < Core.CONSTANTS.MIN_LAUNCH_PULL) {
        pullDeltaPct = { x: 0, y: 9.0 };
      }
      updateTelemetry();
    }
  });

  window.addEventListener('touchmove', (e) => {
    if (activePointerId !== null) e.preventDefault();
  }, { passive: false });

  // --- 6. GAME ANIMATION LOOP & PHYSICS ---
  function gameLoop(now) {
    const dtMs = Math.min(80, now - lastFrameTime);
    lastFrameTime = now;
    const dt = dtMs / 1000;

    if (currentScreen === 'game' && gameState) {
      updatePhysics(dt);
      renderGameCanvas();
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  function updatePhysics(dt) {
    if (gameState.status === 'flying') {
      const stepResult = Core.simulateStep(gameState, dt);
      const equipped = Core.TRAILS.find(t => t.id === saveData.equippedTrail) || Core.TRAILS[0];

      trailPoints.push({
        x: gameState.probe.x,
        y: gameState.probe.y,
        life: 1.0,
        color: equipped.color
      });

      if (Math.random() > 0.4) {
        particles.push({
          x: gameState.probe.x + (Math.random() - 0.5) * 1.5,
          y: gameState.probe.y + (Math.random() - 0.5) * 1.5,
          vx: -gameState.probe.vx * 0.2 + (Math.random() - 0.5) * 5,
          vy: -gameState.probe.vy * 0.2 + (Math.random() - 0.5) * 5,
          life: 1.0,
          decay: 2.2,
          color: equipped.color,
          size: 1.5
        });
      }

      if (stepResult.outcome === 'star') {
        audio.playSfx('star');
        updateHud();
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          particles.push({
            x: gameState.probe.x,
            y: gameState.probe.y,
            vx: Math.cos(ang) * (8 + Math.random() * 8),
            vy: Math.sin(ang) * (8 + Math.random() * 8),
            life: 1.0,
            decay: 1.8,
            color: '#ffd700',
            size: 2.0
          });
        }
      } else if (stepResult.outcome === 'crash' || stepResult.outcome === 'drift') {
        audio.playSfx('crash');
        for (let i = 0; i < 24; i++) {
          const ang = (i / 24) * Math.PI * 2;
          particles.push({
            x: gameState.probe.x,
            y: gameState.probe.y,
            vx: Math.cos(ang) * (12 + Math.random() * 12),
            vy: Math.sin(ang) * (12 + Math.random() * 12),
            life: 1.0,
            decay: 2.0,
            color: stepResult.outcome === 'crash' ? '#ff3366' : '#00f0ff',
            size: 2.2
          });
        }

        setSafeTimeout(() => {
          handleDefeat(stepResult.reason);
        }, 600);
      } else if (stepResult.outcome === 'warp') {
        audio.playSfx('warp');
        for (let i = 0; i < 30; i++) {
          const ang = Math.random() * Math.PI * 2;
          particles.push({
            x: gameState.wormhole.x + Math.cos(ang) * 6,
            y: gameState.wormhole.y + Math.sin(ang) * 6,
            vx: -Math.cos(ang) * 15,
            vy: -Math.sin(ang) * 15,
            life: 1.0,
            decay: 1.5,
            color: '#00f0ff',
            size: 2.5
          });
        }

        setSafeTimeout(() => {
          handleVictory();
        }, 800);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = trailPoints.length - 1; i >= 0; i--) {
      trailPoints[i].life -= 0.6 * dt;
      if (trailPoints[i].life <= 0) trailPoints.splice(i, 1);
    }
  }

  // --- 7. VICTORY & DEFEAT WORKFLOWS ---
  function handleVictory() {
    const stars = Core.calculateStars(gameState.shotsUsed, gameState.crystalsCollectedCount, gameState.parShots);
    const score = Core.calculateScore(activeLevel.id, gameState.shotsUsed, gameState.crystalsCollectedCount, gameState.elapsedTime);

    saveData = Core.unlockNextLevel(saveData, activeLevel.id, stars, score);
    if (isEndlessMode && score > (saveData.endlessHighScore || 0)) {
      saveData.endlessHighScore = score;
    }
    Core.saveGameData(window.localStorage, saveData);

    document.getElementById('victory-crystals').textContent = `${gameState.crystalsCollectedCount}/3`;
    document.getElementById('victory-shots').textContent = `${gameState.shotsUsed}`;
    document.getElementById('victory-score').textContent = score.toLocaleString();

    const starImgs = document.querySelectorAll('#victory-stars-row .modal-star-img');
    starImgs.forEach((img, i) => {
      img.classList.remove('show');
      if (i < stars) {
        setSafeTimeout(() => {
          img.classList.add('show');
          audio.playSfx('star');
        }, 200 + i * 250);
      }
    });

    modalVictory.classList.add('active');
  }

  function handleDefeat(reason) {
    defeatReason.textContent = reason || 'Probe signal lost in cosmic void.';
    modalDefeat.classList.add('active');
  }

  // --- 8. CANVAS RENDERING WITH GUARANTEED VIBRANT VISUALS ---
  function renderGameCanvas() {
    if (ctx.setTransform) {
      ctx.setTransform(canvas.width / 100, 0, 0, canvas.height / 100, 0, 0);
    }
    ctx.clearRect(0, 0, 100, 100);

    // 1. Draw Space Arena Backdrop
    const backdrop = imageCache.get('space-backdrop.png') || imageCache.get('assets/orbital-slingshot-assets/page-4/space-backdrop.png');
    if (backdrop && backdrop.complete && backdrop.naturalWidth > 0) {
      ctx.drawImage(backdrop, 0, 0, 100, 100);
    } else {
      // High-contrast Procedural Cosmic Nebula Backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, 100, 100);
      bgGrad.addColorStop(0, '#040714');
      bgGrad.addColorStop(0.5, '#091228');
      bgGrad.addColorStop(1, '#050a1a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 100, 100);

      // Starfield
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 37) % 100;
        const sy = (i * 59) % 100;
        ctx.fillRect(sx, sy, 0.4, 0.4);
      }
    }

    // 2. Draw Celestial Bodies (Planets & Pulsars)
    gameState.planets.forEach(p => {
      const isPulsar = p.type === 'pulsar' || p.mass < 0;

      // Gravity field glow
      const grad = ctx.createRadialGradient(p.x, p.y, p.radius * 0.5, p.x, p.y, p.radius * 2.0);
      if (isPulsar) {
        grad.addColorStop(0, 'rgba(255, 40, 200, 0.45)');
        grad.addColorStop(1, 'rgba(255, 40, 200, 0)');
      } else {
        grad.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
        grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 2.0, 0, Math.PI * 2);
      ctx.fill();

      // Planet Image or Rich Procedural Vector Orb
      const pImg = imageCache.get(p.texture) || imageCache.get(`assets/orbital-slingshot-assets/page-4/${p.texture}`);
      if (pImg && pImg.complete && pImg.naturalWidth > 0) {
        ctx.drawImage(pImg, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
      } else {
        // High-contrast vector orb
        const pGrad = ctx.createRadialGradient(p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.1, p.x, p.y, p.radius);
        if (isPulsar) {
          pGrad.addColorStop(0, '#ffffff');
          pGrad.addColorStop(0.4, '#ff28c8');
          pGrad.addColorStop(1, '#7000ff');
        } else if (p.type === 'gas-giant') {
          pGrad.addColorStop(0, '#ffeaa7');
          pGrad.addColorStop(0.6, '#e17055');
          pGrad.addColorStop(1, '#d63031');
        } else if (p.type === 'lava') {
          pGrad.addColorStop(0, '#ff7675');
          pGrad.addColorStop(0.7, '#d63031');
          pGrad.addColorStop(1, '#2d3436');
        } else if (p.type === 'ice') {
          pGrad.addColorStop(0, '#ffffff');
          pGrad.addColorStop(0.5, '#74b9ff');
          pGrad.addColorStop(1, '#0984e3');
        } else {
          pGrad.addColorStop(0, '#55efc4');
          pGrad.addColorStop(0.5, '#00cec9');
          pGrad.addColorStop(1, '#0984e3');
        }
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }

      if (p.rings) {
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.radius * 2.2, p.radius * 0.7, Math.PI / 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // 3. Draw Hazards (Asteroids)
    gameState.hazards.forEach(h => {
      const astImg = imageCache.get('asteroid.png') || imageCache.get('assets/orbital-slingshot-assets/page-4/asteroid.png');
      if (astImg && astImg.complete && astImg.naturalWidth > 0) {
        ctx.drawImage(astImg, h.x - h.radius, h.y - h.radius, h.radius * 2, h.radius * 2);
      } else {
        ctx.fillStyle = '#a4b0be';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#57606f';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
    });

    // 4. Draw Wormhole Portal
    const wh = gameState.wormhole;
    const whImg = imageCache.get('wormhole.png') || imageCache.get('assets/orbital-slingshot-assets/page-4/wormhole.png');
    if (whImg && whImg.complete && whImg.naturalWidth > 0) {
      ctx.drawImage(whImg, wh.x - wh.radius, wh.y - wh.radius, wh.radius * 2, wh.radius * 2);
    } else {
      // Procedural glowing event horizon
      const whGrad = ctx.createRadialGradient(wh.x, wh.y, wh.radius * 0.2, wh.x, wh.y, wh.radius * 1.5);
      whGrad.addColorStop(0, '#000000');
      whGrad.addColorStop(0.5, '#9d4edd');
      whGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = whGrad;
      ctx.beginPath();
      ctx.arc(wh.x, wh.y, wh.radius * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(wh.x, wh.y, wh.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 5. Draw Star Crystals
    gameState.crystals.forEach(c => {
      if (!c.collected) {
        const cImg = imageCache.get('star-crystal.png') || imageCache.get('assets/orbital-slingshot-assets/page-4/star-crystal.png');
        if (cImg && cImg.complete && cImg.naturalWidth > 0) {
          ctx.drawImage(cImg, c.x - c.radius, c.y - c.radius, c.radius * 2, c.radius * 2);
        } else {
          // 8-point gold star
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      }
    });

    // 6. Draw Ship Trails
    if (trailPoints.length > 1) {
      for (let i = 1; i < trailPoints.length; i++) {
        const ptA = trailPoints[i - 1];
        const ptB = trailPoints[i];
        ctx.strokeStyle = ptB.color || '#00f0ff';
        ctx.lineWidth = 1.4 * ptB.life;
        ctx.globalAlpha = ptB.life * 0.85;
        ctx.beginPath();
        ctx.moveTo(ptA.x, ptA.y);
        ctx.lineTo(ptB.x, ptB.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    }

    // 7. Draw Thruster Particles
    particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (p.size || 1.5) * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // 8. Draw Predictive Trajectory Arc (While Aiming or Pre-aimed)
    if (!gameState.probe.active && gameState.status === 'aiming' && Math.hypot(pullDeltaPct.x, pullDeltaPct.y) >= Core.CONSTANTS.MIN_LAUNCH_PULL) {
      const trajectory = Core.computeTrajectory(
        gameState.probeStart,
        pullDeltaPct,
        gameState.planets,
        gameState.hazards
      );

      ctx.setLineDash([0.8, 1.4]);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      trajectory.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Slingshot Band & Reticle
      if (isAiming) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(gameState.probeStart.x, gameState.probeStart.y);
        ctx.lineTo(gameState.probeStart.x + pullDeltaPct.x, gameState.probeStart.y + pullDeltaPct.y);
        ctx.stroke();

        // Drag Reticle
        ctx.fillStyle = '#00f0ff';
        ctx.beginPath();
        ctx.arc(gameState.probeStart.x + pullDeltaPct.x, gameState.probeStart.y + pullDeltaPct.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 9. Draw Probe Spacecraft
    if (gameState.probe.alive) {
      const probeX = gameState.probe.active ? gameState.probe.x : gameState.probeStart.x;
      const probeY = gameState.probe.active ? gameState.probe.y : gameState.probeStart.y;
      const probeImg = imageCache.get('probe.png') || imageCache.get('assets/orbital-slingshot-assets/page-4/probe.png');
      const pr = gameState.probe.radius;
      if (probeImg && probeImg.complete && probeImg.naturalWidth > 0) {
        ctx.drawImage(probeImg, probeX - pr * 1.5, probeY - pr * 1.5, pr * 3, pr * 3);
      } else {
        // High-contrast triangle spacecraft
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(probeX, probeY, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  // --- 9. NAVIGATION & BUTTONS ---
  function exitGame() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    if (from === 'games') {
      window.location.href = '../../index.html#games';
    } else if (from === 'rc-games') {
      window.location.href = '../../index.html#rc-games';
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '../../index.html';
    }
  }

  function updateTelemetry() {
    if (!gameState) return;
    const angleEl = document.getElementById('telemetry-angle');
    const powerEl = document.getElementById('telemetry-power');
    const statusEl = document.getElementById('telemetry-status');

    const pullDist = Math.hypot(pullDeltaPct.x, pullDeltaPct.y);
    const maxR = Core.CONSTANTS.MAX_PULL_RADIUS;
    const powerPct = Math.round(Math.min(100, (pullDist / maxR) * 100));
    const angleDeg = Math.round((Math.atan2(-pullDeltaPct.x, pullDeltaPct.y) * 180) / Math.PI);

    if (angleEl) angleEl.textContent = `ANGLE: ${angleDeg}°`;
    if (powerEl) powerEl.textContent = `THRUST: ${powerPct}%`;
    if (statusEl) {
      if (gameState.status === 'aiming') {
        statusEl.textContent = 'STATUS: LOCKED';
        statusEl.style.color = '#00f0ff';
      } else if (gameState.status === 'flying') {
        statusEl.textContent = 'STATUS: IN FLIGHT';
        statusEl.style.color = '#ffd700';
      } else {
        statusEl.textContent = `STATUS: ${gameState.status.toUpperCase()}`;
      }
    }
  }

  function triggerScreenRumble() {
    if (!stage) return;
    stage.style.transition = 'transform 0.05s ease';
    stage.style.transform = `translate(${(Math.random() - 0.5) * 6}px, ${(Math.random() - 0.5) * 6}px)`;
    setTimeout(() => {
      stage.style.transform = 'translate(0, 0)';
    }, 120);
  }

  function launchProbe() {
    if (!gameState || gameState.probe.active || gameState.status !== 'aiming') return;

    let pullDist = Math.hypot(pullDeltaPct.x, pullDeltaPct.y);
    if (pullDist < Core.CONSTANTS.MIN_LAUNCH_PULL) {
      pullDeltaPct = { x: 0, y: 9.0 };
      pullDist = 9.0;
    }

    gameState.probe.active = true;
    gameState.probe.alive = true;
    gameState.probe.vx = -pullDeltaPct.x * Core.CONSTANTS.SLINGSHOT_FORCE_SCALE;
    gameState.probe.vy = -pullDeltaPct.y * Core.CONSTANTS.SLINGSHOT_FORCE_SCALE;
    gameState.shotsUsed++;
    gameState.status = 'flying';
    trailPoints = [];
    isAiming = false;

    audio.playSfx('launch');
    updateHud();
    updateTelemetry();
    triggerScreenRumble();

    // Launch thruster fire particle burst
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: gameState.probe.x,
        y: gameState.probe.y,
        vx: (Math.random() - 0.5) * 12 - gameState.probe.vx * 0.1,
        vy: (Math.random() - 0.5) * 12 - gameState.probe.vy * 0.1,
        life: 1.0,
        decay: 2.5,
        color: '#00f0ff',
        size: 2.2
      });
    }

    pullDeltaPct = { x: 0, y: 0 };
  }

  function flashButton(btnId) {
    const el = document.getElementById(btnId);
    if (el) {
      el.classList.add('active-press');
      setTimeout(() => el.classList.remove('active-press'), 140);
    }
  }

  // --- UNIVERSAL MOBILE TOUCH & TAP ENGINE ---
  function addTapListener(el, callback) {
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let lastTime = 0;

    function fire(e) {
      const now = Date.now();
      if (now - lastTime < 180) return;
      lastTime = now;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      callback(e);
    }

    el.addEventListener('pointerdown', (e) => {
      isDown = true;
      startX = e.clientX;
      startY = e.clientY;
      el.classList.add('active-press');
    }, { passive: true });

    el.addEventListener('pointerup', (e) => {
      if (!isDown) return;
      isDown = false;
      el.classList.remove('active-press');
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist < 28) {
        fire(e);
      }
    });

    el.addEventListener('pointercancel', () => {
      isDown = false;
      el.classList.remove('active-press');
    });

    el.addEventListener('click', (e) => {
      fire(e);
    });
  }

  function addRepeatTapListener(el, onStep) {
    if (!el) return;
    let timer = null;
    let isDown = false;

    function startHolding(e) {
      isDown = true;
      el.classList.add('active-press');
      onStep();
      timer = setTimeout(() => {
        timer = setInterval(onStep, 90);
      }, 240);
    }

    function stopHolding() {
      if (!isDown) return;
      isDown = false;
      el.classList.remove('active-press');
      if (timer) {
        clearTimeout(timer);
        clearInterval(timer);
      }
      timer = null;
    }

    el.addEventListener('pointerdown', (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      startHolding(e);
    });

    window.addEventListener('pointerup', stopHolding);
    window.addEventListener('pointercancel', stopHolding);
  }

  function setupEventListeners() {
    // Page 1: Landing Exit & Direct Play
    addTapListener(document.getElementById('btn-landing-exit'), exitGame);
    addTapListener(document.getElementById('btn-quick-play'), () => startLevel(Core.LEVELS[0]));
    addTapListener(document.getElementById('btn-start'), () => showScreen('tutorial'));

    // Any tap on landing screen immediately starts Level 1!
    const landingSection = document.getElementById('screen-landing');
    if (landingSection) {
      addTapListener(landingSection, (e) => {
        if (e.target.closest('#btn-landing-exit') || e.target.closest('.btn-mute') || e.target.closest('#btn-start')) {
          return;
        }
        startLevel(Core.LEVELS[0]);
      });
    }

    // Page 2: Tutorial
    addTapListener(document.getElementById('btn-tutorial-back'), () => showScreen('landing'));
    addTapListener(document.getElementById('btn-tutorial-continue'), () => showScreen('map'));

    // Page 3: Map
    addTapListener(document.getElementById('btn-map-exit'), exitGame);

    const hangarDrawer = document.getElementById('hangar-drawer');
    addTapListener(document.getElementById('btn-open-hangar'), () => {
      hangarDrawer.classList.add('open');
    });
    addTapListener(document.getElementById('btn-close-hangar'), () => {
      hangarDrawer.classList.remove('open');
    });

    // Page 4: Game HUD & Direct Exit
    addTapListener(document.getElementById('btn-game-map'), () => showScreen('map'));
    addTapListener(document.getElementById('btn-game-exit'), exitGame);
    addTapListener(document.getElementById('btn-game-retry'), () => startLevel(activeLevel));

    // Flight Deck Auxiliary Key Buttons
    addTapListener(document.getElementById('btn-game-retry-deck'), () => {
      flashButton('btn-game-retry-deck');
      startLevel(activeLevel);
    });
    addTapListener(document.getElementById('btn-game-map-deck'), () => {
      flashButton('btn-game-map-deck');
      showScreen('map');
    });
    addTapListener(document.getElementById('btn-game-exit-deck'), () => {
      flashButton('btn-game-exit-deck');
      exitGame();
    });

    // Tactile Flight Deck Buttons (Continuous Steering & Instant Fire)
    addTapListener(document.getElementById('btn-launch-fire'), () => {
      flashButton('btn-launch-fire');
      launchProbe();
    });

    addRepeatTapListener(document.getElementById('btn-steer-left'), () => {
      const maxR = Core.CONSTANTS.MAX_PULL_RADIUS;
      pullDeltaPct.x = Math.min(maxR, pullDeltaPct.x + 3.0);
      updateTelemetry();
      flashButton('btn-steer-left');
    });

    addRepeatTapListener(document.getElementById('btn-steer-right'), () => {
      const maxR = Core.CONSTANTS.MAX_PULL_RADIUS;
      pullDeltaPct.x = Math.max(-maxR, pullDeltaPct.x - 3.0);
      updateTelemetry();
      flashButton('btn-steer-right');
    });

    addRepeatTapListener(document.getElementById('btn-power-up'), () => {
      const maxR = Core.CONSTANTS.MAX_PULL_RADIUS;
      pullDeltaPct.y = Math.min(maxR, pullDeltaPct.y + 3.0);
      updateTelemetry();
      flashButton('btn-power-up');
    });

    addRepeatTapListener(document.getElementById('btn-power-down'), () => {
      pullDeltaPct.y = Math.max(Core.CONSTANTS.MIN_LAUNCH_PULL, pullDeltaPct.y - 3.0);
      updateTelemetry();
      flashButton('btn-power-down');
    });

    addTapListener(document.getElementById('btn-recenter-aim'), () => {
      pullDeltaPct = { x: 0, y: 9.0 };
      updateTelemetry();
      flashButton('btn-recenter-aim');
    });

    // Canvas click-to-aim for full screen responsiveness
    canvas.addEventListener('pointerdown', (e) => {
      if (!gameState || gameState.probe.active || gameState.status !== 'aiming') return;
      const coords = getStageCoords(e.clientX, e.clientY, e.pointerType === 'touch');
      if (coords.y >= 8 && coords.y <= 92) {
        if (e.cancelable) e.preventDefault();
        isAiming = true;
        activePointerId = e.pointerId;
        pullStart = coords;
        pullCurrent = { ...pullStart };
      }
    });

    // Modals
    addTapListener(document.getElementById('btn-next-level'), () => {
      if (isEndlessMode) {
        endlessIndex++;
        startLevel(Core.generateProceduralLevel(endlessIndex));
      } else {
        const nextLevel = Core.LEVELS.find(l => l.id === activeLevel.id + 1);
        if (nextLevel) {
          startLevel(nextLevel);
        } else {
          showScreen('map');
        }
      }
    });

    addTapListener(document.getElementById('btn-replay-level'), () => startLevel(activeLevel));
    addTapListener(document.getElementById('btn-victory-map'), () => showScreen('map'));
    addTapListener(document.getElementById('btn-defeat-retry'), () => startLevel(activeLevel));
    addTapListener(document.getElementById('btn-defeat-map'), () => showScreen('map'));

    // Mute Toggles
    document.querySelectorAll('.btn-mute').forEach(btn => {
      addTapListener(btn, () => {
        const muted = audio.toggleMute();
        saveData.soundMuted = muted;
        Core.saveGameData(window.localStorage, saveData);
        document.querySelectorAll('.btn-mute').forEach(b => {
          b.textContent = muted ? '🔇' : '🔊';
        });
      });
    });

    window.addEventListener('resize', () => {
      updateViewportUnits();
      if (currentScreen === 'game') {
        resizeCanvas();
      }
    });

    // Rules Modal Toggle
    const modalRules = document.getElementById('modal-rules');
    const btnInfo = document.getElementById('btn-info-toggle');
    const btnCloseRules = document.getElementById('btn-close-rules');
    if (btnInfo && modalRules) {
      addTapListener(btnInfo, () => modalRules.classList.add('active'));
    }
    if (btnCloseRules && modalRules) {
      addTapListener(btnCloseRules, () => modalRules.classList.remove('active'));
    }

    // Keyboard Controls (Desktop & Accessibility)
    window.addEventListener('keydown', (e) => {
      // 1. Global Mute Hotkey
      if (e.key === 'm' || e.key === 'M') {
        const muted = audio.toggleMute();
        saveData.soundMuted = muted;
        Core.saveGameData(window.localStorage, saveData);
        document.querySelectorAll('.btn-mute').forEach(b => {
          b.textContent = muted ? '🔇' : '🔊';
        });
        return;
      }

      // 2. Rules Toggle Hotkey
      if (e.key === 'i' || e.key === 'I') {
        if (modalRules) {
          modalRules.classList.toggle('active');
        }
        return;
      }

      // 3. Escape: Close modals or navigate back
      if (e.key === 'Escape') {
        if (modalRules && modalRules.classList.contains('active')) {
          modalRules.classList.remove('active');
          return;
        }
        if (currentScreen === 'game') {
          showScreen('map');
        } else if (currentScreen === 'map' || currentScreen === 'tutorial') {
          showScreen('landing');
        }
        return;
      }

      // 4. Any key pressed on landing page automatically launches Level 1!
      if (currentScreen === 'landing') {
        e.preventDefault();
        startLevel(Core.LEVELS[0]);
        return;
      } else if (currentScreen === 'tutorial') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          showScreen('map');
          return;
        }
      } else if (currentScreen === 'map') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          const targetLvl = Core.LEVELS.find(l => saveData.unlockedLevels.includes(l.id)) || Core.LEVELS[0];
          startLevel(targetLvl);
          return;
        }
      }

      // 5. Active Gameplay Controls
      if (currentScreen === 'game' && gameState) {
        // Retry Level Hotkey
        if (e.key === 'r' || e.key === 'R') {
          startLevel(activeLevel);
          return;
        }

        // Modal Space/Enter Handlers
        if (modalVictory && modalVictory.classList.contains('active')) {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            const nextLevel = Core.LEVELS.find(l => l.id === activeLevel.id + 1);
            if (nextLevel) startLevel(nextLevel);
            else showScreen('map');
            return;
          }
        }

        if (modalDefeat && modalDefeat.classList.contains('active')) {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            startLevel(activeLevel);
            return;
          }
        }

        // Slingshot Aim & Launch Controls
        if (gameState.status === 'aiming' && !gameState.probe.active) {
          const step = 2.5;
          const maxR = Core.CONSTANTS.MAX_PULL_RADIUS;
          let changed = false;

          // ArrowUp / W = Aim Higher / More Launch Power Upward
          if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            pullDeltaPct.y = Math.min(maxR, pullDeltaPct.y + step);
            changed = true;
            flashButton('btn-power-up');
          }
          // ArrowDown / S = Aim Lower / Shorter Shot
          else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            pullDeltaPct.y = Math.max(Core.CONSTANTS.MIN_LAUNCH_PULL, pullDeltaPct.y - step);
            changed = true;
            flashButton('btn-power-down');
          }
          // ArrowLeft / A = Curve Left (pulls slingshot right)
          else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            pullDeltaPct.x = Math.min(maxR, pullDeltaPct.x + step);
            changed = true;
            flashButton('btn-steer-left');
          }
          // ArrowRight / D = Curve Right (pulls slingshot left)
          else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            pullDeltaPct.x = Math.max(-maxR, pullDeltaPct.x - step);
            changed = true;
            flashButton('btn-steer-right');
          }

          if (changed) {
            e.preventDefault();
            isAiming = true;
            updateTelemetry();
          }

          // Launch Probe
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            flashButton('btn-launch-fire');
            launchProbe();
          }
        }
      }
    });
  }

  // --- 10. INITIALIZATION ---
  function init() {
    updateViewportUnits();
    setupEventListeners();
    if (saveData.soundMuted) {
      audio.setMuted(true);
      document.querySelectorAll('.btn-mute').forEach(b => {
        b.textContent = '🔇';
      });
    }

    preloadAllAssets();
    audio.playBgm('menu');
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
