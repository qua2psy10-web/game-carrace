// Main Game Controller: Scene, Cameras (1st/3rd Person + TV Broadcast + Orbit + Rear-View Mirror), Demo Mode & Race Loop
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

  const btnDemoToggle = document.getElementById('btn-demo-toggle');
  const demoModeText = document.getElementById('demo-mode-text');
  const btnCamera = document.getElementById('btn-camera');
  const cameraModeText = document.getElementById('camera-mode-text');
  const btnSound = document.getElementById('btn-sound');
  const btnRestart = document.getElementById('btn-restart');
  const btnHome = document.getElementById('btn-home');

  // Demo Spectator Bar Elements
  const demoControlBar = document.getElementById('demo-control-bar');
  const btnPrevCar = document.getElementById('btn-prev-car');
  const btnNextCar = document.getElementById('btn-next-car');
  const demoTargetCarEl = document.getElementById('demo-target-car');
  const btnDemoCam = document.getElementById('btn-demo-cam');
  const demoCamLabel = document.getElementById('demo-cam-label');
  const btnAutoCam = document.getElementById('btn-auto-cam');
  const autoCamStatus = document.getElementById('auto-cam-status');
  const btnTakeover = document.getElementById('btn-takeover');

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
  const btnStartDemo = document.getElementById('btn-start-demo');
  const btnRetryRace = document.getElementById('btn-retry-race');
  const btnResultDemo = document.getElementById('btn-result-demo');
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

  // Build Trackside TV Broadcast Camera Positions around the circuit
  const tvCameraStations = [];
  const numStations = 12;
  for (let i = 0; i < numStations; i++) {
    const t = i / numStations;
    const pt = track.curve.getPointAt(t);
    const tan = track.curve.getTangentAt(t).normalize();
    const norm = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
    const side = i % 2 === 0 ? 1 : -1;
    const camPos = pt
      .clone()
      .addScaledVector(norm, side * (track.roadWidth * 0.5 + 8))
      .add(new THREE.Vector3(0, 3.8 + (i % 3) * 1.6, 0));
    tvCameraStations.push(camPos);
  }

  // Build Cars (5 AI Rivals + 1 Player starting at P6)
  const rivalConfigs = [
    { name: 'Vortex (Blue)', color: 0x0ea5e9, accentColor: 0xffffff, baseSkill: 0.94 },
    { name: 'Solaris (Gold)', color: 0xf59e0b, accentColor: 0x111827, baseSkill: 0.91 },
    { name: 'Venom (Green)', color: 0x10b981, accentColor: 0xffffff, baseSkill: 0.88 },
    { name: 'Phantom (Purple)', color: 0x8b5cf6, accentColor: 0xfacc15, baseSkill: 0.85 },
    { name: 'Titan (Pink)', color: 0xec4899, accentColor: 0xffffff, baseSkill: 0.82 }
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
    name: 'YOU (Red)',
    color: 0xe11d48,
    accentColor: 0xffffff,
    carIndex: 5,
    maxSpeed: 79,
    accelRate: 30,
    aiSkill: 0.98
  });
  allCars.push(playerCar);

  // Camera Modes List
  const CAMERA_MODES = [
    { id: 'cockpit', label: 'コックピット (1人称)' },
    { id: 'tv', label: 'TV中継カメラ' },
    { id: 'chase', label: 'チェイス (3人称)' },
    { id: 'orbit', label: 'シネマティック' }
  ];

  // Game & Demo State
  let gameState = 'TITLE'; // TITLE | COUNTDOWN | RACING | FINISHED
  let isDemoMode = false;
  let cameraModeIndex = 0; // 0: cockpit, 1: tv, 2: chase, 3: orbit
  let autoCameraSwitch = true;
  let autoCamTimer = 0;
  let spectateCarIndex = 5; // Default to playerCar (index 5 in allCars)
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

  function getActiveCar() {
    return isDemoMode ? allCars[spectateCarIndex] : playerCar;
  }

  function getCameraModeId() {
    return CAMERA_MODES[cameraModeIndex].id;
  }

  function syncCarCockpitVisibility() {
    const activeCar = getActiveCar();
    const isCockpit = gameState !== 'TITLE' && getCameraModeId() === 'cockpit';
    allCars.forEach((car) => {
      car.setCameraMode(isCockpit && car === activeCar);
      if (isCockpit && car === activeCar) {
        car.updateDashboardCanvas();
      }
    });
  }

  function updateCameraUI() {
    const modeObj = CAMERA_MODES[cameraModeIndex];
    cameraModeText.textContent = modeObj.label;
    demoCamLabel.textContent = modeObj.label;
    syncCarCockpitVisibility();
  }

  function updateDemoUI() {
    demoModeText.textContent = isDemoMode ? 'ON' : 'OFF';
    if (isDemoMode && (gameState === 'RACING' || gameState === 'COUNTDOWN')) {
      demoControlBar.classList.remove('hidden');
      btnDemoToggle.style.borderColor = '#38bdf8';
    } else {
      demoControlBar.classList.add('hidden');
      btnDemoToggle.style.borderColor = '';
    }

    const activeCar = getActiveCar();
    demoTargetCarEl.textContent = `🏎️ ${activeCar.name}`;
    autoCamStatus.textContent = autoCameraSwitch ? 'ON' : 'OFF';
    btnAutoCam.classList.toggle('active', autoCameraSwitch);
    updateCameraUI();
  }

  window.addEventListener('keydown', (e) => {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') input.up = true;
    if (code === 'KeyS' || code === 'ArrowDown') input.down = true;
    if (code === 'KeyA' || code === 'ArrowLeft') input.left = true;
    if (code === 'KeyD' || code === 'ArrowRight') input.right = true;
    if (code === 'Space') input.space = true;

    if (code === 'KeyV') {
      cycleCameraMode(true);
    } else if (code === 'KeyC' && isDemoMode) {
      toggleAutoCam();
    } else if (code === 'KeyP' && (gameState === 'RACING' || gameState === 'COUNTDOWN')) {
      toggleDemoMode();
    } else if (code === 'Tab' && isDemoMode) {
      e.preventDefault();
      switchSpectateCar(1);
    } else if (code === 'KeyM') {
      toggleMute();
    } else if (code === 'KeyR' && (gameState === 'RACING' || gameState === 'FINISHED')) {
      if (isDemoMode) startDemoRun();
      else startRace();
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

  btnDemoToggle.addEventListener('click', () => {
    toggleDemoMode();
    btnDemoToggle.blur();
  });

  btnCamera.addEventListener('click', () => {
    cycleCameraMode(true);
    btnCamera.blur();
  });

  btnDemoCam.addEventListener('click', () => {
    cycleCameraMode(true);
    btnDemoCam.blur();
  });

  btnAutoCam.addEventListener('click', () => {
    toggleAutoCam();
    btnAutoCam.blur();
  });

  btnPrevCar.addEventListener('click', () => {
    switchSpectateCar(-1);
    btnPrevCar.blur();
  });

  btnNextCar.addEventListener('click', () => {
    switchSpectateCar(1);
    btnNextCar.blur();
  });

  btnTakeover.addEventListener('click', () => {
    if (isDemoMode) {
      toggleDemoMode(); // Switches to manual control of playerCar
    }
    btnTakeover.blur();
  });

  btnSound.addEventListener('click', () => {
    toggleMute();
    btnSound.blur();
  });

  btnRestart.addEventListener('click', () => {
    if (isDemoMode) startDemoRun();
    else startRace();
    btnRestart.blur();
  });

  btnHome.addEventListener('click', () => {
    returnToTitle();
    btnHome.blur();
  });

  btnStartRace.addEventListener('click', () => {
    window.soundEngine.init();
    startRace();
  });

  btnStartDemo.addEventListener('click', () => {
    window.soundEngine.init();
    startDemoRun();
  });

  btnRetryRace.addEventListener('click', () => {
    startRace();
  });

  btnResultDemo.addEventListener('click', () => {
    window.soundEngine.init();
    startDemoRun();
  });

  function cycleCameraMode(manual = false) {
    cameraModeIndex = (cameraModeIndex + 1) % CAMERA_MODES.length;
    if (manual) {
      autoCamTimer = 0;
    }
    updateCameraUI();
  }

  function toggleAutoCam() {
    autoCameraSwitch = !autoCameraSwitch;
    autoCamTimer = 0;
    updateDemoUI();
  }

  function switchSpectateCar(dir) {
    spectateCarIndex = (spectateCarIndex + dir + allCars.length) % allCars.length;
    chaseInitialized = false;
    updateDemoUI();
  }

  function toggleDemoMode() {
    isDemoMode = !isDemoMode;
    if (!isDemoMode) {
      // Returning to manual control: focus playerCar and use Cockpit or Chase view
      spectateCarIndex = 5;
      if (cameraModeIndex > 2) cameraModeIndex = 0;
    } else {
      autoCamTimer = 0;
    }
    updateDemoUI();
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
      car.totalProgress = info.lapProgress - 1.0;
      car.finished = false;

      if (!car.isPlayer) {
        const baseCfg = rivalConfigs[idx];
        car.aiSkill = baseCfg.baseSkill * diffMult;
      } else {
        car.aiSkill = 1.02; // Fast and clean line when in Demo Mode
      }

      car._syncVisuals(0.016, 0);
    });

    syncCarCockpitVisibility();
  }

  function returnToTitle() {
    window.soundEngine.stopContinuous();
    gameState = 'TITLE';
    isDemoMode = false;
    signalContainer.classList.add('hidden');
    resultScreen.classList.add('hidden');
    hudTop.classList.add('hud-hidden');
    minimapContainer.classList.add('hud-hidden');
    hudBottomRight.classList.add('hud-hidden');
    demoControlBar.classList.add('hidden');
    startScreen.classList.remove('hidden');
    syncCarCockpitVisibility();
  }

  function startRace() {
    isDemoMode = false;
    spectateCarIndex = 5;
    if (cameraModeIndex === 1 || cameraModeIndex === 3) {
      cameraModeIndex = 0; // Start in 1st-person cockpit by default
    }

    startScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    hudTop.classList.remove('hud-hidden');
    minimapContainer.classList.remove('hud-hidden');
    hudBottomRight.classList.remove('hud-hidden');

    resetCarsToGrid();
    updateDemoUI();

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

  function startDemoRun() {
    isDemoMode = true;
    spectateCarIndex = 5; // Start watching player's red car
    cameraModeIndex = 0;  // Start in 1st-person cockpit view
    autoCamTimer = 0;

    startScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    signalContainer.classList.add('hidden');
    hudTop.classList.remove('hud-hidden');
    minimapContainer.classList.remove('hud-hidden');
    hudBottomRight.classList.remove('hud-hidden');

    resetCarsToGrid();
    // Give cars a rolling start in Demo Mode so action begins immediately!
    allCars.forEach((car, idx) => {
      car.speed = 32 + idx * 1.5;
    });

    gameState = 'RACING';
    totalRaceTime = 0;
    currentLapStartTime = 0;
    bestLapTime = Infinity;
    lapTimes = [];
    recordedCompletedLaps = 0;

    hudBestTime.textContent = '--:--.---';
    hudCurrentTime.textContent = '00:00.000';
    hudLap.textContent = '1';

    updateDemoUI();
    showLapBanner('🎬 DEMO RUN', 'AI AUTO-DRIVE');
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
    demoControlBar.classList.add('hidden');

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

          const avgSpeed = (a.speed + b.speed) * 0.5;
          a.speed = a.speed * 0.65 + avgSpeed * 0.35;
          b.speed = b.speed * 0.65 + avgSpeed * 0.35;

          const activeCar = getActiveCar();
          if ((a === activeCar || b === activeCar) && gameState === 'RACING') {
            window.soundEngine.playCollision();
          }
        }
      }
    }
  }

  // Smooth Chase & TV Camera State
  const chaseCamPos = new THREE.Vector3();
  const chaseCamLook = new THREE.Vector3();
  const tvCamLook = new THREE.Vector3();
  let chaseInitialized = false;

  function findClosestTVStation(pos) {
    let bestStation = tvCameraStations[0];
    let minSq = Infinity;
    for (let i = 0; i < tvCameraStations.length; i++) {
      const st = tvCameraStations[i];
      const sq = st.distanceToSquared(pos);
      if (sq < minSq) {
        minSq = sq;
        bestStation = st;
      }
    }
    return { station: bestStation, distance: Math.sqrt(minSq) };
  }

  function updateCameras(dt, timeSec) {
    const targetCar = getActiveCar();

    if (gameState === 'TITLE') {
      // Live background demo TV broadcast on Title Screen
      const { station, distance } = findClosestTVStation(playerCar.position);
      mainCamera.up.set(0, 1, 0);
      mainCamera.position.copy(station);
      tvCamLook.lerp(
        new THREE.Vector3(playerCar.position.x, 0.9, playerCar.position.z),
        Math.min(1, dt * 10)
      );
      mainCamera.lookAt(tvCamLook);
      mainCamera.fov = Math.max(32, Math.min(62, 72 - distance * 0.32));
      mainCamera.updateProjectionMatrix();
      return;
    }

    const forwardX = Math.sin(targetCar.heading);
    const forwardZ = Math.cos(targetCar.heading);
    const rightX = Math.cos(targetCar.heading);
    const rightZ = -Math.sin(targetCar.heading);

    const speedRatio = Math.min(1, Math.abs(targetCar.speed) / targetCar.maxSpeed);
    const shakeAmp = speedRatio * 0.006 + targetCar.curbIntensity * 0.026;
    const shakeX = (Math.random() - 0.5) * shakeAmp;
    const shakeY = (Math.random() - 0.5) * shakeAmp;

    const modeId = getCameraModeId();

    if (modeId === 'cockpit') {
      // 1. First-Person Driver Eye Position inside Cockpit
      const eyeLocalZ = -0.32;
      const eyeLocalY = 1.13;

      const worldEyeX = targetCar.position.x + forwardX * eyeLocalZ + rightX * shakeX;
      const worldEyeY = eyeLocalY + shakeY + targetCar.pitchAngle * 0.25;
      const worldEyeZ = targetCar.position.z + forwardZ * eyeLocalZ;

      mainCamera.position.set(worldEyeX, worldEyeY, worldEyeZ);

      const cornerLookOffset = -targetCar.steerAngle * 2.2;
      const lookDist = 24;
      const targetX = targetCar.position.x + forwardX * lookDist + rightX * cornerLookOffset;
      const targetY = 0.85 - targetCar.pitchAngle * 8.0;
      const targetZ = targetCar.position.z + forwardZ * lookDist + rightZ * cornerLookOffset;

      mainCamera.up.set(
        Math.sin(targetCar.rollAngle * 0.65),
        Math.cos(targetCar.rollAngle * 0.65),
        0
      );
      mainCamera.lookAt(targetX, targetY, targetZ);

      const targetFov = 66 + speedRatio * 12;
      mainCamera.fov += (targetFov - mainCamera.fov) * Math.min(1, dt * 8);
      mainCamera.updateProjectionMatrix();
    } else if (modeId === 'tv') {
      // 2. Trackside TV Broadcast Camera with Auto-Zoom
      mainCamera.up.set(0, 1, 0);
      const { station, distance } = findClosestTVStation(targetCar.position);
      mainCamera.position.copy(station);

      const lookAhead = new THREE.Vector3(
        targetCar.position.x + forwardX * 2.2,
        0.95,
        targetCar.position.z + forwardZ * 2.2
      );
      tvCamLook.lerp(lookAhead, Math.min(1, dt * 15));
      mainCamera.lookAt(tvCamLook);

      // Dynamic telephoto zoom as car approaches/leaves station
      const targetFov = Math.max(26, Math.min(64, 70 - distance * 0.38));
      mainCamera.fov += (targetFov - mainCamera.fov) * Math.min(1, dt * 6);
      mainCamera.updateProjectionMatrix();
    } else if (modeId === 'chase') {
      // 3. Third-Person Chase Camera
      mainCamera.up.set(0, 1, 0);
      const distBack = 6.4;
      const heightUp = 2.65;

      const desiredPos = new THREE.Vector3(
        targetCar.position.x - forwardX * distBack + rightX * shakeX * 2,
        heightUp + shakeY * 2,
        targetCar.position.z - forwardZ * distBack
      );
      const desiredLook = new THREE.Vector3(
        targetCar.position.x + forwardX * 6,
        1.0,
        targetCar.position.z + forwardZ * 6
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
    } else if (modeId === 'orbit') {
      // 4. Cinematic Dynamic Orbit Camera
      mainCamera.up.set(0, 1, 0);
      const orbitAngle = targetCar.heading + Math.sin(timeSec * 0.55) * 2.2 + 0.6;
      const radius = 5.4;
      mainCamera.position.set(
        targetCar.position.x + Math.sin(orbitAngle) * radius,
        1.45 + Math.sin(timeSec * 0.9) * 0.45,
        targetCar.position.z + Math.cos(orbitAngle) * radius
      );
      mainCamera.lookAt(targetCar.position.x, 0.85, targetCar.position.z);
      mainCamera.fov = 60;
      mainCamera.updateProjectionMatrix();
    }

    // Rear-View Mirror Camera (Mounted on the currently active car looking backward)
    const mirrorMountZ = -1.5;
    mirrorCamera.position.set(
      targetCar.position.x + forwardX * mirrorMountZ,
      1.38,
      targetCar.position.z + forwardZ * mirrorMountZ
    );
    mirrorCamera.lookAt(
      targetCar.position.x - forwardX * 35,
      1.05,
      targetCar.position.z - forwardZ * 35
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

    const activeCar = getActiveCar();

    // Draw all cars
    allCars.forEach((car) => {
      if (car === activeCar) return;
      ctx.beginPath();
      ctx.arc(toX(car.position.x), toY(car.position.z), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#' + car.color.toString(16).padStart(6, '0');
      ctx.fill();
    });

    // Active / Focused car dot (highlighted)
    const px = toX(activeCar.position.x);
    const py = toY(activeCar.position.z);
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#' + activeCar.color.toString(16).padStart(6, '0');
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  function updateHUD() {
    const activeCar = getActiveCar();
    const sorted = [...allCars].sort((a, b) => b.totalProgress - a.totalProgress);
    const activeRank = sorted.indexOf(activeCar) + 1;
    hudPos.textContent = String(activeRank);

    const displayLap = isDemoMode
      ? Math.max(1, activeCar.lap)
      : Math.max(1, Math.min(TOTAL_LAPS, activeCar.lap));
    hudLap.textContent = String(displayLap);

    // Check lap completion on playerCar (or activeCar in Demo Mode)
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

      if (!isDemoMode && completedLaps >= TOTAL_LAPS) {
        const playerRank = sorted.indexOf(playerCar) + 1;
        finishRace(playerRank);
        return;
      } else {
        window.soundEngine.playLapSound();
        const bannerLabel = isDemoMode
          ? `DEMO LAP ${completedLaps + 1}`
          : `LAP ${completedLaps + 1} / ${TOTAL_LAPS}`;
        showLapBanner(bannerLabel, formatTime(lapDuration));
      }
    }

    const currentLapElapsed = totalRaceTime - currentLapStartTime;
    hudCurrentTime.textContent = formatTime(currentLapElapsed);

    // Speed & RPM of active car
    const kmh = Math.abs(Math.round(activeCar.speed * 3.6));
    hudSpeed.textContent = String(kmh);
    hudRpmBar.style.width = `${Math.round(activeCar.rpm * 100)}%`;
    hudGear.textContent =
      activeCar.speed < -1 ? 'R' : Math.abs(activeCar.speed) < 0.5 ? 'N' : String(activeCar.gear);

    if (activeCar.isOffTrack) {
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

    if (gameState === 'TITLE') {
      // Background AI demo race while Title Screen is open
      playerCar.updateAIPhysics(dt, track, allCars, true);
      aiCars.forEach((ai) => ai.updateAIPhysics(dt, track, allCars, true));
      resolveCarCollisions();
    } else if (gameState === 'COUNTDOWN') {
      countdownTimer += dt;
      const step = Math.floor(countdownTimer / 0.85);

      if (step !== lastBeepStep) {
        lastBeepStep = step;
        if (step >= 0 && step < 3) {
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
          updateDemoUI();
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

      if (isDemoMode) {
        // AI drives playerCar as well!
        playerCar.updateAIPhysics(dt, track, allCars, true);

        // Auto-Camera Switcher in Demo Mode
        if (autoCameraSwitch) {
          autoCamTimer += dt;
          if (autoCamTimer > 7.5) {
            autoCamTimer = 0;
            cycleCameraMode(false);
          }
        }
      } else {
        playerCar.updatePlayerPhysics(dt, input, track, true);
      }

      aiCars.forEach((ai) => ai.updateAIPhysics(dt, track, allCars, true));
      resolveCarCollisions();

      const activeCar = getActiveCar();
      const speedRatio = Math.min(1, Math.abs(activeCar.speed) / activeCar.maxSpeed);
      const isThrottle = isDemoMode ? activeCar.speed > 10 : input.up;
      window.soundEngine.update(
        activeCar.rpm,
        isThrottle,
        activeCar.skidIntensity,
        activeCar.curbIntensity,
        speedRatio
      );

      updateHUD();
      drawMinimap();
    } else if (gameState === 'FINISHED') {
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

    // 2. Render Rear-View Mirror Viewport at Top Center
    if (gameState !== 'TITLE') {
      const rect = mirrorFrame.getBoundingClientRect();
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
