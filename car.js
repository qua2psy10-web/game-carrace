// 3D Racing Car (Exterior + 1st-Person Cockpit Interior + Physics + AI)
class RaceCar {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.isPlayer = !!options.isPlayer;
    this.name = options.name || 'Driver';
    this.color = options.color || 0xe11d48;
    this.accentColor = options.accentColor || 0xffffff;
    this.carIndex = options.carIndex || 0;

    // Transform & Physics State
    this.position = new THREE.Vector3();
    this.heading = 0; // Radians around Y axis (0 = +Z, PI = -Z)
    this.speed = 0;   // m/s (1 m/s = 3.6 km/h)
    this.maxSpeed = options.maxSpeed || 76; // ~273 km/h
    this.accelRate = options.accelRate || 28;
    this.brakeRate = 48;
    this.steerAngle = 0;
    this.angularVelocity = 0;
    this.lateralVelocity = 0;

    // Suspension visual tilt
    this.pitchAngle = 0;
    this.rollAngle = 0;

    // Engine & Transmission state
    this.gear = 1;
    this.rpm = 0.15; // 0.0 to 1.0
    this.skidIntensity = 0;
    this.curbIntensity = 0;
    this.isOffTrack = false;

    // Race Progress State
    this.lap = 1;
    this.lastLapProgress = 0;
    this.totalProgress = 0;
    this.finished = false;
    this.finishTime = 0;

    // AI specific
    this.aiTargetOffset = (Math.random() - 0.5) * 8;
    this.aiSkill = options.aiSkill || 1.0;

    // Root 3D Group
    this.root = new THREE.Group();
    this.bodyTiltGroup = new THREE.Group();
    this.root.add(this.bodyTiltGroup);
    this.scene.add(this.root);

    this.wheels = [];
    this.frontWheelPivots = [];
    this.brakeLightMaterials = [];

    this._buildExteriorModel();
    this._buildCockpitInterior();
    this.setCameraMode(false);
  }

  _buildExteriorModel() {
    this.exteriorGroup = new THREE.Group();
    this.bodyTiltGroup.add(this.exteriorGroup);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.25,
      metalness: 0.45
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x161922,
      roughness: 0.6,
      metalness: 0.2
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: this.accentColor,
      roughness: 0.3,
      metalness: 0.3
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.1,
      metalness: 0.85,
      transparent: true,
      opacity: 0.82
    });

    // Lower Chassis / Floor
    const floorGeo = new THREE.BoxGeometry(2.05, 0.25, 4.5);
    const floorMesh = new THREE.Mesh(floorGeo, darkMat);
    floorMesh.position.set(0, 0.32, 0);
    floorMesh.castShadow = true;
    this.exteriorGroup.add(floorMesh);

    // Main Sleek Body
    const mainBodyGeo = new THREE.BoxGeometry(1.92, 0.48, 4.1);
    const mainBody = new THREE.Mesh(mainBodyGeo, bodyMat);
    mainBody.position.set(0, 0.62, -0.05);
    mainBody.castShadow = true;
    this.exteriorGroup.add(mainBody);

    // Front Hood / Nose Slope (also visible from cockpit)
    const hoodGeo = new THREE.BoxGeometry(1.68, 0.32, 1.55);
    const hoodMesh = new THREE.Mesh(hoodGeo, bodyMat);
    hoodMesh.position.set(0, 0.68, 1.45);
    hoodMesh.rotation.x = 0.14;
    this.exteriorGroup.add(hoodMesh);

    // Racing Stripe on Hood
    const stripeGeo = new THREE.BoxGeometry(0.42, 0.33, 4.12);
    const stripeMesh = new THREE.Mesh(stripeGeo, accentMat);
    stripeMesh.position.set(0, 0.64, -0.04);
    this.exteriorGroup.add(stripeMesh);

    // Front Splitter
    const splitterGeo = new THREE.BoxGeometry(2.08, 0.1, 0.6);
    const splitter = new THREE.Mesh(splitterGeo, darkMat);
    splitter.position.set(0, 0.24, 2.15);
    this.exteriorGroup.add(splitter);

    // Cabin / Canopy (Hidden in 1st person so camera inside isn't blocked)
    this.cabinGroup = new THREE.Group();
    const cabinGeo = new THREE.BoxGeometry(1.45, 0.46, 1.85);
    const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
    cabinMesh.position.set(0, 1.02, -0.2);
    this.cabinGroup.add(cabinMesh);

    const roofGeo = new THREE.BoxGeometry(1.25, 0.08, 1.1);
    const roofMesh = new THREE.Mesh(roofGeo, bodyMat);
    roofMesh.position.set(0, 1.26, -0.3);
    this.cabinGroup.add(roofMesh);
    this.exteriorGroup.add(this.cabinGroup);

    // Rear Wing Spoiler
    const wingSupportGeo = new THREE.BoxGeometry(0.1, 0.55, 0.35);
    const leftSupport = new THREE.Mesh(wingSupportGeo, darkMat);
    leftSupport.position.set(-0.65, 1.02, -1.95);
    const rightSupport = new THREE.Mesh(wingSupportGeo, darkMat);
    rightSupport.position.set(0.65, 1.02, -1.95);

    const wingBladeGeo = new THREE.BoxGeometry(2.05, 0.1, 0.48);
    const wingBlade = new THREE.Mesh(wingBladeGeo, accentMat);
    wingBlade.position.set(0, 1.28, -2.02);
    wingBlade.rotation.x = -0.15;

    this.exteriorGroup.add(leftSupport, rightSupport, wingBlade);

    // Brake Lights
    const brakeMat = new THREE.MeshBasicMaterial({ color: 0x660000 });
    this.brakeLightMaterials.push(brakeMat);
    const brakeGeo = new THREE.BoxGeometry(0.55, 0.14, 0.08);
    const leftBrake = new THREE.Mesh(brakeGeo, brakeMat);
    leftBrake.position.set(-0.58, 0.68, -2.12);
    const rightBrake = new THREE.Mesh(brakeGeo, brakeMat);
    rightBrake.position.set(0.58, 0.68, -2.12);
    this.exteriorGroup.add(leftBrake, rightBrake);

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.34, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111318 });
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.35, 10);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.7, roughness: 0.3 });

    const wheelPositions = [
      { x: -0.98, y: 0.38, z: 1.38, front: true },
      { x: 0.98, y: 0.38, z: 1.38, front: true },
      { x: -0.98, y: 0.38, z: -1.38, front: false },
      { x: 0.98, y: 0.38, z: -1.38, front: false }
    ];

    wheelPositions.forEach((wp) => {
      const pivot = new THREE.Group();
      pivot.position.set(wp.x, wp.y, wp.z);
      this.exteriorGroup.add(pivot);

      const wheelMesh = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      wheelMesh.add(tire, rim);
      pivot.add(wheelMesh);

      this.wheels.push(wheelMesh);
      if (wp.front) {
        this.frontWheelPivots.push(pivot);
      }
    });
  }

  _buildCockpitInterior() {
    this.cockpitGroup = new THREE.Group();
    this.bodyTiltGroup.add(this.cockpitGroup);

    const dashMat = new THREE.MeshStandardMaterial({
      color: 0x14171f,
      roughness: 0.75,
      metalness: 0.15
    });
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x1f2430,
      roughness: 0.4,
      metalness: 0.4
    });

    // Main Dashboard Console across front
    const dashTopGeo = new THREE.BoxGeometry(1.55, 0.22, 0.65);
    const dashTop = new THREE.Mesh(dashTopGeo, dashMat);
    dashTop.position.set(0, 0.85, 0.56);
    this.cockpitGroup.add(dashTop);

    // Instrument Binnacle Hood
    const hoodGeo = new THREE.BoxGeometry(0.56, 0.22, 0.32);
    const hood = new THREE.Mesh(hoodGeo, carbonMat);
    hood.position.set(0, 0.96, 0.46);
    this.cockpitGroup.add(hood);

    // Dynamic Canvas Digital Dashboard Display (RPM, Speed, Gear, Lap)
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashCtx = this.dashCanvas.getContext('2d');
    this.dashTexture = new THREE.CanvasTexture(this.dashCanvas);

    const screenGeo = new THREE.PlaneGeometry(0.48, 0.23);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.dashTexture });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    // Face backward toward the driver (-Z is behind, +Z is forward, so rotate Y by PI)
    screenMesh.position.set(0, 0.94, 0.31);
    screenMesh.rotation.y = Math.PI;
    screenMesh.rotation.x = 0.12;
    this.cockpitGroup.add(screenMesh);

    // A-Pillars (Left and Right Windshield Frames)
    const pillarGeo = new THREE.BoxGeometry(0.08, 0.68, 0.1);
    const leftPillar = new THREE.Mesh(pillarGeo, dashMat);
    leftPillar.position.set(-0.72, 1.14, 0.52);
    leftPillar.rotation.x = -0.58;
    leftPillar.rotation.z = -0.14;
    this.cockpitGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, dashMat);
    rightPillar.position.set(0.72, 1.14, 0.52);
    rightPillar.rotation.x = -0.58;
    rightPillar.rotation.z = 0.14;
    this.cockpitGroup.add(rightPillar);

    // Top Roof Windshield Header
    const headerGeo = new THREE.BoxGeometry(1.5, 0.08, 0.25);
    const header = new THREE.Mesh(headerGeo, dashMat);
    header.position.set(0, 1.42, 0.32);
    this.cockpitGroup.add(header);

    // Steering Column & Interactive 3D Steering Wheel
    const columnGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 12);
    columnGeo.rotateX(Math.PI / 2);
    const column = new THREE.Mesh(columnGeo, carbonMat);
    column.position.set(0, 0.87, 0.25);
    this.cockpitGroup.add(column);

    this.steeringWheel = new THREE.Group();
    this.steeringWheel.position.set(0, 0.88, 0.12);
    // Tilt slightly toward driver
    this.steeringWheel.rotation.x = 0.22;
    this.cockpitGroup.add(this.steeringWheel);

    // Steering wheel outer rim (Torus)
    const rimGeo = new THREE.TorusGeometry(0.185, 0.024, 14, 36);
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x111318,
      roughness: 0.6,
      metalness: 0.1
    });
    const wheelRim = new THREE.Mesh(rimGeo, leatherMat);
    this.steeringWheel.add(wheelRim);

    // Top center red stripe marker on the steering wheel
    const markerGeo = new THREE.TorusGeometry(0.185, 0.026, 12, 12, 0.28);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const marker = new THREE.Mesh(markerGeo, redMat);
    marker.rotation.z = Math.PI / 2 - 0.14;
    this.steeringWheel.add(marker);

    // Left/Right Red Sport Grips
    const leftGripGeo = new THREE.TorusGeometry(0.185, 0.025, 12, 12, 0.7);
    const leftGrip = new THREE.Mesh(leftGripGeo, new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 }));
    leftGrip.rotation.z = -0.35;
    const rightGrip = new THREE.Mesh(leftGripGeo, new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 }));
    rightGrip.rotation.z = Math.PI - 0.35;
    this.steeringWheel.add(leftGrip, rightGrip);

    // Steering Wheel Spokes & Center Hub
    const spokeHGeo = new THREE.BoxGeometry(0.34, 0.038, 0.02);
    const spokeH = new THREE.Mesh(spokeHGeo, carbonMat);
    this.steeringWheel.add(spokeH);

    const spokeVGeo = new THREE.BoxGeometry(0.042, 0.17, 0.02);
    const spokeV = new THREE.Mesh(spokeVGeo, carbonMat);
    spokeV.position.y = -0.085;
    this.steeringWheel.add(spokeV);

    const hubGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.03, 16);
    hubGeo.rotateX(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, carbonMat);
    this.steeringWheel.add(hub);

    const emblemGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.034, 12);
    emblemGeo.rotateX(Math.PI / 2);
    const emblem = new THREE.Mesh(emblemGeo, redMat);
    this.steeringWheel.add(emblem);

    this.updateDashboardCanvas();
  }

  setCameraMode(isFirstPerson) {
    if (this.cockpitGroup) {
      this.cockpitGroup.visible = isFirstPerson;
    }
    if (this.cabinGroup) {
      this.cabinGroup.visible = !isFirstPerson;
    }
  }

  updateDashboardCanvas() {
    if (!this.dashCtx) return;
    const ctx = this.dashCtx;
    const w = 512;
    const h = 256;

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    // Outer border
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // Top Shift Light LEDs (10 LEDs)
    const numLeds = 10;
    const activeLeds = Math.floor(this.rpm * (numLeds + 1));
    for (let i = 0; i < numLeds; i++) {
      const lx = 56 + i * 42;
      const ly = 28;
      if (i < activeLeds) {
        if (i < 5) ctx.fillStyle = '#22c55e';
        else if (i < 8) ctx.fillStyle = '#facc15';
        else ctx.fillStyle = '#ef4444';
      } else {
        ctx.fillStyle = '#1e293b';
      }
      ctx.beginPath();
      ctx.arc(lx, ly, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // RPM Bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(42, 54, 428, 22);

    const grad = ctx.createLinearGradient(42, 0, 470, 0);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(0.65, '#22c55e');
    grad.addColorStop(0.85, '#facc15');
    grad.addColorStop(1.0, '#ef4444');
    ctx.fillStyle = grad;
    ctx.fillRect(42, 54, Math.min(1, this.rpm) * 428, 22);

    // Center Gear Box
    ctx.fillStyle = '#161f33';
    ctx.fillRect(206, 94, 100, 128);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(206, 94, 100, 128);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GEAR', 256, 116);

    const gearText = this.speed < -1 ? 'R' : (Math.abs(this.speed) < 0.5 ? 'N' : String(this.gear));
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 78px sans-serif';
    ctx.fillText(gearText, 256, 198);

    // Left: Speedometer (km/h)
    const kmh = Math.abs(Math.round(this.speed * 3.6));
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('SPEED', 180, 122);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'italic 900 64px monospace';
    ctx.fillText(String(kmh), 182, 186);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('km/h', 180, 214);

    // Right: RPM & Lap
    const rpmVal = Math.round(1200 + this.rpm * 7800);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('RPM', 330, 122);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(String(rpmVal), 330, 162);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`LAP ${Math.min(3, this.lap)}/3`, 330, 208);

    this.dashTexture.needsUpdate = true;
  }

  updatePlayerPhysics(dt, input, track, canMove) {
    if (!canMove) {
      // Rev engine at the start line before GO!
      if (input.up) {
        this.rpm = Math.min(0.92, this.rpm + dt * 2.5);
      } else {
        this.rpm = Math.max(0.15, this.rpm - dt * 1.8);
      }
      this._syncVisuals(dt, 0);
      if (this.isPlayer) this.updateDashboardCanvas();
      return;
    }

    const trackInfo = track.getClosestTrackInfo(this.position);
    const halfRoad = track.roadWidth * 0.5;
    const onCurb = trackInfo.distance >= halfRoad - 0.6 && trackInfo.distance <= halfRoad + track.curbWidth + 0.5;
    this.isOffTrack = trackInfo.distance > halfRoad + track.curbWidth;

    // Target steering angle (supports digital buttons + analog touch/gyro steering)
    const digitalSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerInput = Math.max(-1, Math.min(1, digitalSteer + (input.analogSteer || 0)));
    const speedRatio = Math.min(1, Math.abs(this.speed) / this.maxSpeed);
    const maxSteer = 0.68 - speedRatio * 0.34;
    const targetSteer = steerInput * maxSteer;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 11);

    // Throttle / Brake
    let longitudinalAccel = 0;
    let braking = false;

    if (input.up) {
      // Gear-adjusted acceleration curve
      const accelFactor = 1.0 - speedRatio * 0.35;
      longitudinalAccel = this.accelRate * accelFactor;
    }

    if (input.down) {
      if (this.speed > 1.0) {
        longitudinalAccel = -this.brakeRate;
        braking = true;
      } else {
        // Reverse
        longitudinalAccel = -16;
      }
    }

    // Handbrake (Space)
    const handbrake = !!input.space;
    if (handbrake && Math.abs(this.speed) > 4) {
      longitudinalAccel -= 18 * Math.sign(this.speed);
      braking = true;
    }

    // Aerodynamic drag & rolling resistance
    const drag = 0.0045 * this.speed * Math.abs(this.speed) + 0.35 * this.speed;
    longitudinalAccel -= drag;

    // Off-track grass penalty
    if (this.isOffTrack) {
      longitudinalAccel -= this.speed * 1.45;
    }

    this.speed += longitudinalAccel * dt;
    this.speed = Math.max(-18, Math.min(this.maxSpeed, this.speed));
    if (!input.up && !input.down && Math.abs(this.speed) < 0.3) {
      this.speed = 0;
    }

    // Turning & Drift Physics
    const turnDir = this.speed >= -0.1 ? 1 : -1;
    const effectiveSpeed = Math.min(1, Math.abs(this.speed) / 8);
    const turnRate = this.steerAngle * (2.35 - speedRatio * 0.55) * effectiveSpeed * turnDir;

    this.heading += turnRate * dt;

    // Lateral slip / drift effect
    const targetLateral = -turnRate * this.speed * (handbrake ? 0.32 : 0.12);
    this.lateralVelocity += (targetLateral - this.lateralVelocity) * Math.min(1, dt * (handbrake ? 4 : 9));

    // Move car in world XZ
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);

    this.position.x += (forwardX * this.speed + rightX * this.lateralVelocity) * dt;
    this.position.z += (forwardZ * this.speed + rightZ * this.lateralVelocity) * dt;

    // Guardrail Boundary Collision
    const updatedInfo = track.getClosestTrackInfo(this.position);
    const maxWallDist = track.wallOffset - 1.25;
    if (updatedInfo.distance > maxWallDist) {
      const sign = Math.sign(updatedInfo.lateralOffset);
      this.position.copy(updatedInfo.point).addScaledVector(updatedInfo.normal, sign * maxWallDist);
      this.speed *= 0.78;

      // Gently align car heading toward track tangent to help player recover
      const tanAngle = Math.atan2(updatedInfo.tangent.x, updatedInfo.tangent.z);
      let angleDiff = tanAngle - this.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      this.heading += angleDiff * 0.35;

      if (window.soundEngine) window.soundEngine.playCollision();
    }

    // Compute Automatic 6-Speed Gear & RPM
    const gearThresholds = [0, 0.16, 0.32, 0.50, 0.68, 0.85, 1.05];
    let g = 1;
    for (let i = 1; i <= 6; i++) {
      if (speedRatio >= gearThresholds[i - 1]) g = i;
    }
    this.gear = g;
    const low = gearThresholds[g - 1];
    const high = gearThresholds[g];
    const gearProgress = (speedRatio - low) / (high - low);
    this.rpm = Math.max(0.16, Math.min(0.98, 0.28 + gearProgress * 0.7));

    // Skid & Curb intensities for audio and camera shake
    const lateralSlip = Math.abs(this.lateralVelocity) / 10;
    const hardCornering = Math.abs(this.steerAngle) * speedRatio;
    this.skidIntensity = (handbrake && speedRatio > 0.2)
      ? 0.9
      : (hardCornering > 0.32 ? (hardCornering - 0.32) * 2.5 + lateralSlip : 0);

    this.curbIntensity = (onCurb || this.isOffTrack) ? Math.min(1, speedRatio * 1.4) : 0;

    // Brake lights
    const brakeColor = braking ? 0xff1111 : 0x550000;
    this.brakeLightMaterials.forEach((m) => m.color.setHex(brakeColor));

    // Suspension pitch & roll
    const targetPitch = -longitudinalAccel * 0.0018;
    const targetRoll = -turnRate * speedRatio * 0.045;
    this.pitchAngle += (targetPitch - this.pitchAngle) * Math.min(1, dt * 10);
    this.rollAngle += (targetRoll - this.rollAngle) * Math.min(1, dt * 10);

    this._updateRaceProgress(updatedInfo.lapProgress);
    this._syncVisuals(dt, turnRate);
    this.updateDashboardCanvas();
  }

  updateAIPhysics(dt, track, allCars, canMove) {
    if (!canMove) {
      this.rpm = 0.22 + Math.sin(performance.now() * 0.01 + this.carIndex) * 0.08;
      this._syncVisuals(dt, 0);
      if (this.cockpitGroup && this.cockpitGroup.visible) {
        this.updateDashboardCanvas();
      }
      return;
    }

    const info = track.getClosestTrackInfo(this.position);

    // Look ahead along the spline
    const lookAheadT = (info.t + 0.028) % 1.0;
    const farLookAheadT = (info.t + 0.065) % 1.0;

    const targetPt = track.curve.getPointAt(lookAheadT);
    const targetTan = track.curve.getTangentAt(lookAheadT).normalize();
    const farTan = track.curve.getTangentAt(farLookAheadT).normalize();
    const norm = new THREE.Vector3().crossVectors(targetTan, new THREE.Vector3(0, 1, 0)).normalize();

    // Check upcoming curvature to modulate AI speed
    const curvature = 1.0 - Math.max(0, targetTan.dot(farTan));
    const cornerSpeedLimit = this.maxSpeed * (1.0 - Math.min(0.52, curvature * 3.2));
    const desiredSpeed = Math.max(26, cornerSpeedLimit * this.aiSkill);

    // Simple obstacle avoidance with nearby cars
    let avoidOffset = this.aiTargetOffset;
    for (const other of allCars) {
      if (other === this) continue;
      const dist = this.position.distanceTo(other.position);
      if (dist < 10) {
        const toOther = new THREE.Vector3().subVectors(other.position, this.position);
        const forwardDot = toOther.x * Math.sin(this.heading) + toOther.z * Math.cos(this.heading);
        if (forwardDot > 0 && forwardDot < 9) {
          const sideDot = toOther.x * norm.x + toOther.z * norm.z;
          avoidOffset += sideDot > 0 ? -3.5 : 3.5;
        }
      }
    }
    avoidOffset = Math.max(-7.5, Math.min(7.5, avoidOffset));
    this.aiTargetOffset += (avoidOffset - this.aiTargetOffset) * dt * 2;

    const aimPoint = targetPt.clone().addScaledVector(norm, this.aiTargetOffset);
    const dx = aimPoint.x - this.position.x;
    const dz = aimPoint.z - this.position.z;
    const desiredHeading = Math.atan2(dx, dz);

    let angleDiff = desiredHeading - this.heading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const targetSteer = Math.max(-0.55, Math.min(0.55, angleDiff * 1.9));
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 9);
    const turnRate = this.steerAngle * 3.1;
    this.heading += turnRate * dt;

    let longitudinalAccel = 0;
    let braking = false;
    if (this.speed < desiredSpeed) {
      longitudinalAccel = this.accelRate * 0.92;
    } else {
      longitudinalAccel = -this.brakeRate * 0.65;
      braking = this.speed - desiredSpeed > 2.5;
    }

    this.speed += longitudinalAccel * dt;
    this.speed = Math.max(0, Math.min(this.maxSpeed, this.speed));

    this.position.x += Math.sin(this.heading) * this.speed * dt;
    this.position.z += Math.cos(this.heading) * this.speed * dt;

    const updatedInfo = track.getClosestTrackInfo(this.position);
    const halfRoad = track.roadWidth * 0.5;
    const onCurb = updatedInfo.distance >= halfRoad - 0.6 && updatedInfo.distance <= halfRoad + track.curbWidth + 0.5;
    this.isOffTrack = updatedInfo.distance > halfRoad + track.curbWidth;

    // Compute Automatic 6-Speed Gear & RPM for AI / Demo Car
    const speedRatio = Math.min(1, Math.abs(this.speed) / this.maxSpeed);
    const gearThresholds = [0, 0.16, 0.32, 0.50, 0.68, 0.85, 1.05];
    let g = 1;
    for (let i = 1; i <= 6; i++) {
      if (speedRatio >= gearThresholds[i - 1]) g = i;
    }
    this.gear = g;
    const low = gearThresholds[g - 1];
    const high = gearThresholds[g];
    const gearProgress = (speedRatio - low) / (high - low);
    this.rpm = Math.max(0.18, Math.min(0.98, 0.28 + gearProgress * 0.7));

    // Skid & Curb intensities
    const hardCornering = Math.abs(this.steerAngle) * speedRatio;
    this.skidIntensity = hardCornering > 0.34 ? (hardCornering - 0.34) * 2.2 : 0;
    this.curbIntensity = onCurb ? Math.min(1, speedRatio * 1.2) : 0;

    // Brake lights
    const brakeColor = braking ? 0xff1111 : 0x550000;
    this.brakeLightMaterials.forEach((m) => m.color.setHex(brakeColor));

    // Suspension pitch & roll
    const targetPitch = -longitudinalAccel * 0.0016;
    const targetRoll = -turnRate * speedRatio * 0.04;
    this.pitchAngle += (targetPitch - this.pitchAngle) * Math.min(1, dt * 10);
    this.rollAngle += (targetRoll - this.rollAngle) * Math.min(1, dt * 10);

    this._updateRaceProgress(updatedInfo.lapProgress);
    this._syncVisuals(dt, turnRate);
    if (this.cockpitGroup && this.cockpitGroup.visible) {
      this.updateDashboardCanvas();
    }
  }

  _updateRaceProgress(currentLapProgress) {
    // Detect crossing start/finish line forward or backward
    const delta = currentLapProgress - this.lastLapProgress;
    if (delta < -0.65) {
      // Crossed finish line moving forward
      this.lap++;
    } else if (delta > 0.65) {
      // Crossed backward
      this.lap--;
    }
    this.lastLapProgress = currentLapProgress;
    this.totalProgress = (this.lap - 1) + currentLapProgress;
  }

  _syncVisuals(dt, turnRate) {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;

    this.bodyTiltGroup.rotation.x = this.pitchAngle;
    this.bodyTiltGroup.rotation.z = this.rollAngle;

    // Spin wheels & rotate front wheels for steering
    const wheelSpin = this.speed * dt * 2.4;
    this.wheels.forEach((w) => {
      w.rotation.x += wheelSpin;
    });
    this.frontWheelPivots.forEach((p) => {
      p.rotation.y = this.steerAngle * 0.7;
    });

    // Rotate 3D cockpit steering wheel
    if (this.steeringWheel) {
      this.steeringWheel.rotation.z = -this.steerAngle * 2.1;
    }
  }
}

window.RaceCar = RaceCar;
