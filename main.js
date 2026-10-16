// Main Game Controller: Scene, Cameras (1st/3rd Person + Rear-View Mirror), Race Loop & UI
(function () {
  const TOTAL_LAPS = 3;

  // DOM Elements
  const canvas = document.getElementById('game-canvas');
  const mirrorFrame = document.getElementById('mirror-frame');
  const hudTop = document.getElementById('hud-top');
  const minimapContainer = document.getElementById('minimap-container');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimapCtx = minimapCanvas.getContext('2d');
  const hudBottomRight = document.getElementById('hud-bottom-right');

  const hudPos = document.getElementById('hud-pos');
  const hudLap = document.getElementById('hud-lap');
  const hudCurrentTime = document.getElementById('hud-current-time');
  const hudBestTime = document.getElementById('hud-best-time');
  const hudRpmBar = document.getElementById('hud-rpm-bar');
  const hudGear = document.getElementById('hud-gear');
  const hudSpeed = document.getElementById('hud-speed');
  const offroadWarning = document.getElementById('offroad-warning');

  const btnCamera = document.getElementById('btn-camera');
  const cameraModeText = document.getElementById('camera-mode-text');
  const btnSound = document.getElementById('btn-sound');
  const btnRestart = document.getElementById('btn-restart');

  const signalContainer = document.getElementById('signal-container');
  const countdownText = document.getElementById('countdown-text');
  const lamps = [
    document.getElementById('lamp-1'),
    document.getElementById('lamp-2'),
    document.getElementById('lamp-3'),
    document.getElementById('lamp-4'),
    document.getElementById('lamp-5')
  ];

  const lapBanner = document.getElementById('lap-banner');
  const lapBannerTitle = document.getElementById('lap-banner-title');
  const lapBannerTime = document.getElementById('lap-banner-time');

  const startScreen = document.getElementById('start-screen');
  const resultScreen = document.getElementById('result-screen');
  const btnStartRace = document.getElementById('btn-start-race');
  const btnRetryRace = document.getElementById('btn-retry-race');
  const diffButtons = document.querySelectorAll('.diff-btn');

  // Renderer & Scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x68a4f1);
  scene.fog = new THREE.FogExp2(0x8ab8f5, 0.00085);

  // Cameras
  const mainCamera = new THREE.PerspectiveCamera(
    68,
    window.innerWidth / window.innerHeight,
    0.1,
    1800
  );
  const mirrorCamera = new THREE.PerspectiveCamera(58, 340 / 92, 0.2, 700);

  // Lighting
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e3a2f, 0.75);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
  sunLight.position.set(160, 260, 120);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 850;
  const d = 320;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  scene.add(sunLight);

  // Build Track
  const track = new CircuitTrack(scene);

  // Build Cars (5 AI Rivals + 1 Player starting at P6 for exciting overtaking)
  const rivalConfigs = [
    { name: 'Vortex', color: 0x0ea5e9, accentColor: 0xffffff, baseSkill: 0.94 },
    { name: 'Solaris', color: 0xf59e0b, accentColor: 0x111827, baseSkill: 0.91 },
    { name: 'Venom', color: 0x10b981, accentColor: 0xffffff, baseSkill: 0.88 },
    { name: 'Phantom', color: 0x8b5cf6, accentColor: 0xfacc15, baseSkill: 0.85 },
    { name: 'Titan', color: 0xec4899, accentColor: 0xffffff, baseSkill: 0.82 }
  ];

  const allCars = [];
  const aiCars = [];

  rivalConfigs.forEach((cfg, idx) => {
    const aiCar = new RaceCar(scene, {
      isPlayer: false,
      name: cfg.name,
      color: cfg.color,
      accentColor: cfg.accentColor,
      carIndex: idx,
      maxSpeed: 74,
      accelRate: 26,
      aiSkill: cfg.baseSkill
    });
    aiCars.push(aiCar);
    allCars.push(aiCar);
  });

  const playerCar = new RaceCar(scene, {
    isPlayer: true,
    name: 'YOU',
    color: 0xe11d48,
    accentColor: 0xffffff,
    carIndex: 5,
    maxSpeed: 79,
    accelRate: 30
  });
  allCars.push(playerCar);

  // Game State
  let gameState = 'TITLE'; // TITLE | COUNTDOWN | RACING | FINISHED
  let cameraMode = 'cockpit'; // 'cockpit' (1st person) | 'chase' (3rd person)
  let difficulty = 'normal';
  let countdownTimer = 0;
  let lastBeepStep = -1;

  // Lap Timing State
  let currentLapStartTime = 0;
  let totalRaceTime = 0;
  let bestLapTime = Infinity;
  let lapTimes = [];
  let recordedCompletedLaps = 0;

  // Input State
  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    space: false
  };

  window.addEventListener('keydown', (e) => {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') input.up = true;
    if (code === 'KeyS' || code === 'ArrowDown') input.down = true;
    if (code === 'KeyA' || code === 'ArrowLeft') input.left = true;
    if (code === 'KeyD' || code === 'ArrowRight') input.right = true;
    if (code === 'Space') input.space = true;

    if (code === 'KeyV') {
      toggleCameraMode();
    } else if (code === 'KeyM') {
      toggleMute();
    } else if (code === 'KeyR' && (gameState === 'RACING' || gameState === 'FINISHED')) {
      startRace();
    }
  });

  window.addEventListener('keyup', (e) => {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') input.up = false;
    if (code === 'KeyS' || code === 'ArrowDown') input.down = false;
    if (code === 'KeyA' || code === 'ArrowLeft') input.left = false;
    if (code === 'KeyD' || code === 'ArrowRight') input.right = false;
    if (code === 'Space') input.space = false;
  });

  // UI Event Listeners
  diffButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      diffButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      difficulty = btn.dataset.diff;
    });
  });

  btnCamera.addEventListener('click', () => {
    toggleCameraMode();
    btnCamera.blur();
  });

  btnSound.addEventListener('click', () => {
    toggleMute();
    btnSound.blur();
  });

  btnRestart.addEventListener('click', () => {
    startRace();
    btnRestart.blur();
  });

  btnStartRace.addEventListener('click', () => {
    window.soundEngine.init();
    startRace();
  });

  btnRetryRace.addEventListener('click', () => {
    startRace();
  });

  function toggleCameraMode() {
    cameraMode = cameraMode === 'cockpit' ? 'chase' : 'cockpit';
    playerCar.setCameraMode(cameraMode === 'cockpit');
    cameraModeText.textContent = cameraMode === 'cockpit' ? 'コックピット (1人称)' : 'チェイス (3人称)';
  }

  function toggleMute() {
    window.soundEngine.init();
    const muted = window.soundEngine.toggleMute();
    btnSound.textContent = muted ? '🔇 音: OFF [M]' : '🔊 音: ON [M]';
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '--:--.---';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return (
      String(mins).padStart(2, '0') +
      ':' +
      String(secs).padStart(2, '0') +
      '.' +
      String(ms).padStart(3, '0')
    );
  }

  function resetCarsToGrid() {
    const diffMult = difficulty === 'easy' ? 0.84 : difficulty === 'pro' ? 1.03 : 0.94;

    allCars.forEach((car, idx) => {
      const grid = track.getGridTransform(idx);
      car.position.copy(grid.position);
      car.heading = grid.heading;
      car.speed = 0;
      car.steerAngle = 0;
      car.lateralVelocity = 0;
      car.pitchAngle = 0;
      car.rollAngle = 0;
      car.lap = 1;

      const info = track.getClosestTrackInfo(car.position);
      car.lastLapProgress = info.lapProgress;
      car.totalProgress = info.lapProgress - 1.0; // Slightly before start line
      car.finished = false;

      if (!car.isPlayer) {
        const baseCfg = rivalConfigs[idx];
        car.aiSkill = baseCfg.baseSkill * diffMult;
      }

      car._syncVisuals(0.016, 0);
    });

    playerCar.setCameraMode(cameraMode === 'cockpit');
    playerCar.updateDashboardCanvas();
  }

  function startRace() {
    startScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    hudTop.classList.remove('hud-hidden');
    minimapContainer.classList.remove('hud-hidden');
    hudBottomRight.classList.remove('hud-hidden');

    resetCarsToGrid();

    gameState = 'COUNTDOWN';
    countdownTimer = 0;
    lastBeepStep = -1;
    totalRaceTime = 0;
    currentLapStartTime = 0;
    bestLapTime = Infinity;
    lapTimes = [];
    recordedCompletedLaps = 0;

    hudBestTime.textContent = '--:--.---';
    hudCurrentTime.textContent = '00:00.000';
    hudLap.textContent = '1';

    lamps.forEach((l) => {
      l.classList.remove('red', 'green');
    });
    countdownText.textContent = 'READY';
    signalContainer.classList.remove('hidden');
  }

  function showLapBanner(title, timeStr) {
    lapBannerTitle.textContent = title;
    lapBannerTime.textContent = timeStr;
    lapBanner.classList.remove('hidden');
    setTimeout(() => {
      lapBanner.classList.add('hidden');
    }, 2600);
  }

  function finishRace(rank) {
    gameState = 'FINISHED';
    window.soundEngine.playFinishFanfare();
    window.soundEngine.stopContinuous();

    const suffixes = ['st', 'nd', 'rd', 'th', 'th', 'th'];
    const rankStr = `${rank}${suffixes[rank - 1] || 'th'} PLACE ${rank === 1 ? '🏆' : ''}`;
    document.getElementById('result-rank-text').textContent = rankStr;
    document.getElementById('result-total-time').textContent = formatTime(totalRaceTime);
    document.getElementById('result-best-lap').textContent = formatTime(bestLapTime);

    const lapListEl = document.getElementById('result-lap-list');
    lapListEl.innerHTML = lapTimes
      .map((t, i) => `<div><span>LAP ${i + 1}</span><strong>${formatTime(t)}</strong></div>`)
      .join('');

    setTimeout(() => {
      resultScreen.classList.remove('hidden');
    }, 1200);
  }

  function resolveCarCollisions() {
    const minDist = 2.35;
    for (let i = 0; i < allCars.length; i++) {
      for (let j = i + 1; j < allCars.length; j++) {
        const a = allCars[i];
        const b = allCars[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq > 0.0001 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;

          a.position.x -= nx * overlap;
          a.position.z -= nz * overlap;
          b.position.x += nx * overlap;
          b.position.z += nz * overlap;

          // Exchange slight speed
          const avgSpeed = (a.speed + b.speed) * 0.5;
          a.speed = a.speed * 0.65 + avgSpeed * 0.35;
          b.speed = b.speed * 0.65 + avgSpeed * 0.35;

          if (a.isPlayer || b.isPlayer) {
            window.soundEngine.playCollision();
          }
        }
      }
    }
  }

  // Smooth Chase Camera State
  const chaseCamPos = new THREE.Vector3();
  const chaseCamLook = new THREE.Vector3();
  let chaseInitialized = false;

  function updateCameras(dt, timeSec) {
    if (gameState === 'TITLE') {
      // Cinematic orbit around the starting grid
      const focus = playerCar.position;
      const radius = 14;
      const angle = timeSec * 0.35;
      mainCamera.position.set(
        focus.x + Math.sin(angle) * radius,
        4.5 + Math.sin(timeSec * 0.7) * 1.2,
        focus.z + Math.cos(angle) * radius
      );
      mainCamera.lookAt(focus.x, 1.0, focus.z - 6);
      return;
    }

    const forwardX = Math.sin(playerCar.heading);
    const forwardZ = Math.cos(playerCar.heading);
    const rightX = Math.cos(playerCar.heading);
    const rightZ = -Math.sin(playerCar.heading);

    // High-speed & curb vibration shake
    const speedRatio = Math.min(1, Math.abs(playerCar.speed) / playerCar.maxSpeed);
    const shakeAmp = (speedRatio * 0.006) + (playerCar.curbIntensity * 0.028);
    const shakeX = (Math.random() - 0.5) * shakeAmp;
    const shakeY = (Math.random() - 0.5) * shakeAmp;

    if (cameraMode === 'cockpit') {
      // First-Person Driver Eye Position inside Cockpit
      // Slightly behind the steering wheel (z = -0.32, y = 1.13 in car space)
      const eyeLocalZ = -0.32;
      const eyeLocalY = 1.13;

      const worldEyeX = playerCar.position.x + forwardX * eyeLocalZ + rightX * shakeX;
      const worldEyeY = eyeLocalY + shakeY + playerCar.pitchAngle * 0.25;
      const worldEyeZ = playerCar.position.z + forwardZ * eyeLocalZ;

      mainCamera.position.set(worldEyeX, worldEyeY, worldEyeZ);

      // Look forward along car heading, turning slightly into corners
      const cornerLookOffset = -playerCar.steerAngle * 2.2;
      const lookDist = 24;
      const targetX = playerCar.position.x + forwardX * lookDist + rightX * cornerLookOffset;
      const targetY = 0.85 - playerCar.pitchAngle * 8.0;
      const targetZ = playerCar.position.z + forwardZ * lookDist + rightZ * cornerLookOffset;

      mainCamera.up.set(
        Math.sin(playerCar.rollAngle * 0.65),
        Math.cos(playerCar.rollAngle * 0.65),
        0
      );
      mainCamera.lookAt(targetX, targetY, targetZ);

      // Dynamic FOV boost at high speed
      const targetFov = 66 + speedRatio * 12;
      mainCamera.fov += (targetFov - mainCamera.fov) * Math.min(1, dt * 8);
      mainCamera.updateProjectionMatrix();
    } else {
      // Third-Person Chase Camera
      mainCamera.up.set(0, 1, 0);
      const distBack = 6.4;
      const heightUp = 2.65;

      const desiredPos = new THREE.Vector3(
        playerCar.position.x - forwardX * distBack + rightX * shakeX * 2,
        heightUp + shakeY * 2,
        playerCar.position.z - forwardZ * distBack
      );
      const desiredLook = new THREE.Vector3(
        playerCar.position.x + forwardX * 6,
        1.0,
        playerCar.position.z + forwardZ * 6
      );

      if (!chaseInitialized) {
        chaseCamPos.copy(desiredPos);
        chaseCamLook.copy(desiredLook);
        chaseInitialized = true;
      } else {
        chaseCamPos.lerp(desiredPos, Math.min(1, dt * 12));
        chaseCamLook.lerp(desiredLook, Math.min(1, dt * 16));
      }

      mainCamera.position.copy(chaseCamPos);
      mainCamera.lookAt(chaseCamLook);

      const targetFov = 64 + speedRatio * 10;
      mainCamera.fov += (targetFov - mainCamera.fov) * Math.min(1, dt * 8);
      mainCamera.updateProjectionMatrix();
    }

    // Rear-View Mirror Camera (Mounted near rear of roof looking backward)
    const mirrorMountZ = -1.5;
    mirrorCamera.position.set(
      playerCar.position.x + forwardX * mirrorMountZ,
      1.38,
      playerCar.position.z + forwardZ * mirrorMountZ
    );
    mirrorCamera.lookAt(
      playerCar.position.x - forwardX * 35,
      1.05,
      playerCar.position.z - forwardZ * 35
    );
  }

  // Minimap Drawing
  let minimapBounds = null;
  function computeMinimapBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    track.trackPoints.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    const pad = 35;
    minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
    const scale = Math.min(
      minimapCanvas.width / (maxX - minX),
      minimapCanvas.height / (maxZ - minZ)
    );
    minimapBounds = { minX, maxX, minZ, maxZ, scale };
  }
  computeMinimapBounds();

  function drawMinimap() {
    const ctx = minimapCtx;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const { minX, minZ, scale } = minimapBounds;
    const toX = (x) => (x - minX) * scale;
    const toY = (z) => (z - minZ) * scale;

    // Track outline
    ctx.beginPath();
    track.trackPoints.forEach((p, idx) => {
      const mx = toX(p.x);
      const my = toY(p.z);
      if (idx === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Start/Finish marker
    const startPt = track.trackPoints[0];
    ctx.fillStyle = '#facc15';
    ctx.fillRect(toX(startPt.x) - 4, toY(startPt.z) - 4, 8, 8);

    // Rival dots
    aiCars.forEach((ai) => {
      ctx.beginPath();
      ctx.arc(toX(ai.position.x), toY(ai.position.z), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#' + ai.color.toString(16).padStart(6, '0');
      ctx.fill();
    });

    // Player dot (larger with heading arrow)
    const px = toX(playerCar.position.x);
    const py = toY(playerCar.position.z);
    ctx.beginPath();
    ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff2a2a';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function updateHUD() {
    // Sort cars by totalProgress descending to compute live race rank
    const sorted = [...allCars].sort((a, b) => b.totalProgress - a.totalProgress);
    const playerRank = sorted.indexOf(playerCar) + 1;
    hudPos.textContent = String(playerRank);

    const displayLap = Math.max(1, Math.min(TOTAL_LAPS, playerCar.lap));
    hudLap.textContent = String(displayLap);

    // Check lap completion
    const completedLaps = playerCar.lap - 1;
    if (completedLaps > recordedCompletedLaps && completedLaps > 0) {
      const lapDuration = totalRaceTime - currentLapStartTime;
      currentLapStartTime = totalRaceTime;
      recordedCompletedLaps = completedLaps;
      lapTimes.push(lapDuration);

      if (lapDuration < bestLapTime) {
        bestLapTime = lapDuration;
        hudBestTime.textContent = formatTime(bestLapTime);
      }

      if (completedLaps >= TOTAL_LAPS) {
        finishRace(playerRank);
        return;
      } else {
        window.soundEngine.playLapSound();
        showLapBanner(`LAP ${completedLaps + 1} / ${TOTAL_LAPS}`, formatTime(lapDuration));
      }
    }

    const currentLapElapsed = totalRaceTime - currentLapStartTime;
    hudCurrentTime.textContent = formatTime(currentLapElapsed);

    // Speed & RPM
    const kmh = Math.abs(Math.round(playerCar.speed * 3.6));
    hudSpeed.textContent = String(kmh);
    hudRpmBar.style.width = `${Math.round(playerCar.rpm * 100)}%`;
    hudGear.textContent =
      playerCar.speed < -1 ? 'R' : Math.abs(playerCar.speed) < 0.5 ? 'N' : String(playerCar.gear);

    if (playerCar.isOffTrack) {
      offroadWarning.classList.remove('hidden');
    } else {
      offroadWarning.classList.add('hidden');
    }
  }

  // Initialize Grid Positions for Title Screen Preview
  resetCarsToGrid();

  // Handle Window Resize
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    mainCamera.aspect = window.innerWidth / window.innerHeight;
    mainCamera.updateProjectionMatrix();
  });

  // Main Animation Loop
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const timeSec = now * 0.001;

    if (gameState === 'COUNTDOWN') {
      countdownTimer += dt;
      const step = Math.floor(countdownTimer / 0.85); // 0, 1, 2, 3, 4 -> GO at 4

      if (step !== lastBeepStep) {
        lastBeepStep = step;
        if (step >= 0 && step < 3) {
          // Light up lamps in pairs/sequence
          lamps[step].classList.add('red');
          if (step === 2) {
            lamps[3].classList.add('red');
            lamps[4].classList.add('red');
          }
          countdownText.textContent = String(3 - step);
          window.soundEngine.playCountdownBeep(false);
        } else if (step === 3) {
          lamps.forEach((l) => {
            l.classList.remove('red');
            l.classList.add('green');
          });
          countdownText.textContent = 'GO!';
          window.soundEngine.playCountdownBeep(true);
          gameState = 'RACING';
          setTimeout(() => {
            signalContainer.classList.add('hidden');
          }, 900);
        }
      }

      playerCar.updatePlayerPhysics(dt, input, track, false);
      aiCars.forEach((ai) => ai.updateAIPhysics(dt, track, allCars, false));
      window.soundEngine.update(playerCar.rpm, input.up, 0, 0, 0);
    } else if (gameState === 'RACING') {
      totalRaceTime += dt;

      playerCar.updatePlayerPhysics(dt, input, track, true);
      aiCars.forEach((ai) => ai.updateAIPhysics(dt, track, allCars, true));
      resolveCarCollisions();

      const speedRatio = Math.min(1, Math.abs(playerCar.speed) / playerCar.maxSpeed);
      window.soundEngine.update(
        playerCar.rpm,
        input.up,
        playerCar.skidIntensity,
        playerCar.curbIntensity,
        speedRatio
      );

      updateHUD();
      drawMinimap();
    } else if (gameState === 'FINISHED') {
      // Cooldown cruise after finishing
      playerCar.updateAIPhysics(dt, track, allCars, true);
      aiCars.forEach((ai) => ai.updateAIPhysics(dt, track, allCars, true));
      resolveCarCollisions();
    }

    updateCameras(dt, timeSec);

    // 1. Render Main Fullscreen Viewport
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setViewport(0, 0, width, height);
    renderer.setScissor(0, 0, width, height);
    renderer.setScissorTest(true);
    renderer.clear();
    renderer.render(scene, mainCamera);

    // 2. Render Rear-View Mirror Viewport at Top Center (when in countdown/racing/finished)
    if (gameState !== 'TITLE') {
      const rect = mirrorFrame.getBoundingClientRect();
      // Convert DOM top-left coordinates to WebGL bottom-left coordinates
      const mLeft = Math.floor(rect.left);
      const mBottom = Math.floor(height - rect.bottom);
      const mWidth = Math.floor(rect.width);
      const mHeight = Math.floor(rect.height);

      renderer.setViewport(mLeft, mBottom, mWidth, mHeight);
      renderer.setScissor(mLeft, mBottom, mWidth, mHeight);
      renderer.setScissorTest(true);
      renderer.clearDepth();
      renderer.render(scene, mirrorCamera);
    }
  }

  requestAnimationFrame(animate);
})();
