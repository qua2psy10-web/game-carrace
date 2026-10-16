// 3D Circuit Track Generator & Spatial Query System
class CircuitTrack {
  constructor(scene) {
    this.scene = scene;
    this.roadWidth = 22; // Total width of asphalt
    this.curbWidth = 2.0;
    this.wallOffset = this.roadWidth * 0.5 + 3.8;
    this.samples = 500;
    this.trackPoints = [];
    this.trackTangents = [];
    this.trackNormals = [];
    this.totalLength = 0;

    this._buildCurve();
    this._generateTrackMeshes();
    this._generateStartFinishGantry();
    this._generateEnvironment();
  }

  _buildCurve() {
    // Grand Prix style circuit control points (clockwise loop)
    // Start/Finish is at (0, 0, 0) heading toward -Z (North)
    const rawPoints = [
      new THREE.Vector3(0, 0, 60),      // Before start line
      new THREE.Vector3(0, 0, 0),       // Start / Finish line
      new THREE.Vector3(0, 0, -140),    // End of main straight
      new THREE.Vector3(45, 0, -240),   // Turn 1 entry
      new THREE.Vector3(140, 0, -265),  // Turn 1 apex
      new THREE.Vector3(240, 0, -210),  // Turn 2 exit
      new THREE.Vector3(270, 0, -110),  // S-curve 1
      new THREE.Vector3(220, 0, -20),   // S-curve 2
      new THREE.Vector3(295, 0, 75),    // Approach to hairpin
      new THREE.Vector3(340, 0, 180),   // Hairpin entry
      new THREE.Vector3(275, 0, 255),   // Hairpin apex
      new THREE.Vector3(175, 0, 220),   // Hairpin exit onto back straight
      new THREE.Vector3(60, 0, 260),    // Sweeper
      new THREE.Vector3(-45, 0, 240),   // Final corner entry
      new THREE.Vector3(-55, 0, 150),   // Chicane
    ];

    this.curve = new THREE.CatmullRomCurve3(rawPoints, true, 'catmullrom', 0.5);
    this.totalLength = this.curve.getLength();

    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.samples; i++) {
      const t = i / this.samples;
      const pt = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      // Right-hand normal vector in XZ plane
      const norm = new THREE.Vector3().crossVectors(tan, up).normalize();

      this.trackPoints.push(pt);
      this.trackTangents.push(tan);
      this.trackNormals.push(norm);
    }
  }

  _createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base dark asphalt
    ctx.fillStyle = '#252932';
    ctx.fillRect(0, 0, 512, 512);

    // Asphalt noise grain
    for (let i = 0; i < 14000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = 30 + Math.floor(Math.random() * 26);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Subtle tire racing groove
    ctx.fillStyle = 'rgba(15, 17, 22, 0.25)';
    ctx.fillRect(110, 0, 90, 512);
    ctx.fillRect(312, 0, 90, 512);

    // White edge lines
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(14, 0, 10, 512);
    ctx.fillRect(488, 0, 10, 512);

    // Center dashed line
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(252, 0, 8, 240);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 90);
    tex.anisotropy = 8;
    return tex;
  }

  _createCurbTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Red and white rumble strips
    ctx.fillStyle = '#e11d48';
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 128, 64, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 180);
    tex.anisotropy = 4;
    return tex;
  }

  _createGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e4620';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#255427' : '#183a1a';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(80, 80);
    return tex;
  }

  _generateTrackMeshes() {
    // Ground plane
    const grassGeo = new THREE.PlaneGeometry(2400, 2400);
    const grassMat = new THREE.MeshLambertMaterial({ map: this._createGrassTexture() });
    const grassMesh = new THREE.Mesh(grassGeo, grassMat);
    grassMesh.rotation.x = -Math.PI / 2;
    grassMesh.position.y = -0.08;
    grassMesh.receiveShadow = true;
    this.scene.add(grassMesh);

    // Build custom ribbon geometry for Road, Left Curb, Right Curb, and Guardrails
    const roadPositions = [];
    const roadUVs = [];
    const roadIndices = [];

    const curbPositions = [];
    const curbUVs = [];
    const curbIndices = [];

    const railPositions = [];
    const railColors = [];
    const railIndices = [];

    const halfW = this.roadWidth * 0.5;
    const curbW = this.curbWidth;
    const wallW = this.wallOffset;

    for (let i = 0; i <= this.samples; i++) {
      const idx = i % this.samples;
      const pt = this.trackPoints[idx];
      const norm = this.trackNormals[idx];
      const vCoord = i / this.samples;

      // Road vertices
      const leftRoad = pt.clone().addScaledVector(norm, -halfW);
      const rightRoad = pt.clone().addScaledVector(norm, halfW);
      roadPositions.push(leftRoad.x, 0.02, leftRoad.z);
      roadPositions.push(rightRoad.x, 0.02, rightRoad.z);
      roadUVs.push(0, vCoord);
      roadUVs.push(1, vCoord);

      // Left & Right Curbs (slightly raised)
      const leftCurbOuter = pt.clone().addScaledVector(norm, -(halfW + curbW));
      const rightCurbOuter = pt.clone().addScaledVector(norm, halfW + curbW);

      curbPositions.push(
        leftCurbOuter.x, 0.05, leftCurbOuter.z,
        leftRoad.x, 0.03, leftRoad.z,
        rightRoad.x, 0.03, rightRoad.z,
        rightCurbOuter.x, 0.05, rightCurbOuter.z
      );
      curbUVs.push(0, vCoord, 1, vCoord, 0, vCoord, 1, vCoord);

      // Guardrails (Left and Right barriers)
      const leftWall = pt.clone().addScaledVector(norm, -wallW);
      const rightWall = pt.clone().addScaledVector(norm, wallW);

      railPositions.push(
        leftWall.x, 0, leftWall.z,
        leftWall.x, 1.1, leftWall.z,
        rightWall.x, 0, rightWall.z,
        rightWall.x, 1.1, rightWall.z
      );

      const stripe = (i % 4 < 2) ? 0.85 : 0.25;
      railColors.push(
        stripe, stripe, 0.9,
        0.9, 0.9, 0.95,
        stripe, stripe, 0.9,
        0.9, 0.9, 0.95
      );

      if (i < this.samples) {
        // Road triangles
        const rBase = i * 2;
        roadIndices.push(rBase, rBase + 1, rBase + 2);
        roadIndices.push(rBase + 1, rBase + 3, rBase + 2);

        // Curb triangles (left and right)
        const cBase = i * 4;
        curbIndices.push(cBase, cBase + 1, cBase + 4);
        curbIndices.push(cBase + 1, cBase + 5, cBase + 4);

        curbIndices.push(cBase + 2, cBase + 3, cBase + 6);
        curbIndices.push(cBase + 3, cBase + 7, cBase + 6);

        // Guardrail triangles
        const wBase = i * 4;
        railIndices.push(wBase, wBase + 1, wBase + 4);
        railIndices.push(wBase + 1, wBase + 5, wBase + 4);

        railIndices.push(wBase + 2, wBase + 6, wBase + 3);
        railIndices.push(wBase + 3, wBase + 6, wBase + 7);
      }
    }

    // Create Road Mesh
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2));
    roadGeo.setIndex(roadIndices);
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      map: this._createAsphaltTexture(),
      roughness: 0.85,
      metalness: 0.1
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    // Create Curb Mesh
    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPositions, 3));
    curbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(curbUVs, 2));
    curbGeo.setIndex(curbIndices);
    curbGeo.computeVertexNormals();

    const curbMat = new THREE.MeshLambertMaterial({
      map: this._createCurbTexture()
    });
    const curbMesh = new THREE.Mesh(curbGeo, curbMat);
    curbMesh.receiveShadow = true;
    this.scene.add(curbMesh);

    // Create Guardrail Mesh
    const railGeo = new THREE.BufferGeometry();
    railGeo.setAttribute('position', new THREE.Float32BufferAttribute(railPositions, 3));
    railGeo.setAttribute('color', new THREE.Float32BufferAttribute(railColors, 3));
    railGeo.setIndex(railIndices);
    railGeo.computeVertexNormals();

    const railMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });
    const railMesh = new THREE.Mesh(railGeo, railMat);
    this.scene.add(railMesh);
  }

  _generateStartFinishGantry() {
    // Find point near (0, 0, 0) on the main straight
    const info = this.getClosestTrackInfo(new THREE.Vector3(0, 0, 0));
    this.startT = info.t;
    const startPt = info.point;
    const startTan = info.tangent;
    const startNorm = info.normal;

    const gantryGroup = new THREE.Group();
    gantryGroup.position.copy(startPt);
    const angle = Math.atan2(startTan.x, startTan.z);
    gantryGroup.rotation.y = angle;

    // Checkered Line on Road
    const checkerCanvas = document.createElement('canvas');
    checkerCanvas.width = 256;
    checkerCanvas.height = 64;
    const cctx = checkerCanvas.getContext('2d');
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 4; y++) {
        cctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#111111';
        cctx.fillRect(x * 16, y * 16, 16, 16);
      }
    }
    const checkerTex = new THREE.CanvasTexture(checkerCanvas);
    const lineGeo = new THREE.PlaneGeometry(this.roadWidth, 3.6);
    const lineMat = new THREE.MeshBasicMaterial({ map: checkerTex });
    const lineMesh = new THREE.Mesh(lineGeo, lineMat);
    lineMesh.rotation.x = -Math.PI / 2;
    lineMesh.position.y = 0.04;
    gantryGroup.add(lineMesh);

    // Overhead Gantry Pillars & Banner
    const pillarGeo = new THREE.BoxGeometry(1.2, 9.5, 1.2);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.4 });

    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-this.roadWidth * 0.58, 4.75, 0);
    gantryGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(this.roadWidth * 0.58, 4.75, 0);
    gantryGroup.add(rightPillar);

    // Top Banner with "APEX CIRCUIT"
    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512;
    bannerCanvas.height = 96;
    const bctx = bannerCanvas.getContext('2d');
    bctx.fillStyle = '#0f172a';
    bctx.fillRect(0, 0, 512, 96);
    bctx.fillStyle = '#e11d48';
    bctx.fillRect(0, 0, 512, 12);
    bctx.fillRect(0, 84, 512, 12);
    bctx.fillStyle = '#ffffff';
    bctx.font = 'italic 900 44px sans-serif';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.fillText('APEX CIRCUIT GP', 256, 48);

    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    const bannerGeo = new THREE.BoxGeometry(this.roadWidth * 1.22, 2.4, 1.4);
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });
    const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
    bannerMesh.position.set(0, 8.6, 0);
    gantryGroup.add(bannerMesh);

    this.scene.add(gantryGroup);

    // Grandstands along the main straight
    this._createGrandstand(new THREE.Vector3(-24, 0, -35), 0);
    this._createGrandstand(new THREE.Vector3(24, 0, -55), Math.PI);
  }

  _createGrandstand(pos, rotY) {
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = rotY;

    const baseGeo = new THREE.BoxGeometry(10, 6, 65);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 3;
    group.add(base);

    const roofGeo = new THREE.BoxGeometry(12, 0.6, 67);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(1, 8.5, 0);
    roof.rotation.z = -0.15;
    group.add(roof);

    this.scene.add(group);
  }

  _generateEnvironment() {
    // Low-poly trees around the circuit (avoiding the road)
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 2.8, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    const leavesGeo = new THREE.ConeGeometry(2.6, 6.5, 7);
    const leavesMat1 = new THREE.MeshLambertMaterial({ color: 0x2d6a4f });
    const leavesMat2 = new THREE.MeshLambertMaterial({ color: 0x1b4332 });

    for (let i = 0; i < 160; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 50 + Math.random() * 420;
      const x = 120 + Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const info = this.getClosestTrackInfo(new THREE.Vector3(x, 0, z));
      if (info.distance < this.roadWidth * 0.5 + 14) continue; // Keep clear of road

      const tree = new THREE.Group();
      const scale = 0.8 + Math.random() * 0.9;
      tree.position.set(x, 0, z);
      tree.scale.set(scale, scale, scale);

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.4;
      tree.add(trunk);

      const leaves = new THREE.Mesh(leavesGeo, i % 2 === 0 ? leavesMat1 : leavesMat2);
      leaves.position.y = 5.2;
      tree.add(leaves);

      this.scene.add(tree);
    }

    // Distant Mountains on the horizon
    const mountainMat = new THREE.MeshLambertMaterial({ color: 0x3b4d6b });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const dist = 750 + Math.random() * 180;
      const h = 90 + Math.random() * 130;
      const r = 90 + Math.random() * 90;
      const mGeo = new THREE.ConeGeometry(r, h, 5);
      const mMesh = new THREE.Mesh(mGeo, mountainMat);
      mMesh.position.set(140 + Math.cos(a) * dist, h * 0.45, Math.sin(a) * dist);
      mMesh.rotation.y = Math.random() * Math.PI;
      this.scene.add(mMesh);
    }

    // Braking distance markers before sharp corners
    const cornerIndices = [55, 195, 395];
    cornerIndices.forEach((baseIdx) => {
      [100, 50].forEach((mDist, idx) => {
        const sampleIdx = (baseIdx - idx * 8 + this.samples) % this.samples;
        const pt = this.trackPoints[sampleIdx];
        const norm = this.trackNormals[sampleIdx];
        const signPos = pt.clone().addScaledVector(norm, -(this.roadWidth * 0.5 + 2.8));

        const signGeo = new THREE.BoxGeometry(1.6, 1.2, 0.2);
        const signMat = new THREE.MeshBasicMaterial({ color: idx === 0 ? 0xfacc15 : 0xef4444 });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(signPos.x, 1.2, signPos.z);
        this.scene.add(sign);
      });
    });
  }

  // Fast spatial lookup for any world position
  getClosestTrackInfo(pos) {
    let bestIdx = 0;
    let minSqDist = Infinity;

    for (let i = 0; i < this.samples; i++) {
      const pt = this.trackPoints[i];
      const dx = pos.x - pt.x;
      const dz = pos.z - pt.z;
      const sq = dx * dx + dz * dz;
      if (sq < minSqDist) {
        minSqDist = sq;
        bestIdx = i;
      }
    }

    const pt = this.trackPoints[bestIdx];
    const tan = this.trackTangents[bestIdx];
    const norm = this.trackNormals[bestIdx];

    const diffX = pos.x - pt.x;
    const diffZ = pos.z - pt.z;
    const lateralOffset = diffX * norm.x + diffZ * norm.z;
    const distance = Math.abs(lateralOffset);
    const t = bestIdx / this.samples;

    // Normalized progress starting from startT (0.0 to 1.0 along a lap)
    const lapProgress = (t - (this.startT || 0) + 1.0) % 1.0;

    return {
      index: bestIdx,
      t,
      lapProgress,
      point: pt,
      tangent: tan,
      normal: norm,
      distance,
      lateralOffset
    };
  }

  getGridTransform(gridIndex) {
    // Place 6 cars in 2-by-2 staggered grid behind start line
    const row = Math.floor(gridIndex / 2);
    const col = (gridIndex % 2 === 0) ? -1 : 1;

    const startT = this.startT || 0;
    // Slightly behind the start line
    const gridT = (startT - 0.012 - row * 0.016 + 1.0) % 1.0;
    const pt = this.curve.getPointAt(gridT);
    const tan = this.curve.getTangentAt(gridT).normalize();
    const norm = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();

    const lateral = col * 4.2;
    const spawnPos = pt.clone().addScaledVector(norm, lateral);
    const heading = Math.atan2(tan.x, tan.z);

    return { position: spawnPos, heading };
  }
}

window.CircuitTrack = CircuitTrack;
