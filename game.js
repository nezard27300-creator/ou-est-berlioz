const TIME_LIMIT = 15;
const PLAYER_SPEED = 6;
const CATCH_DISTANCE = 1.8;
const WORLD_BOUNDS = { minX: -5.5, maxX: 5.5, minZ: -4.5, maxZ: 4.5 };

const CHARS = {
  robin: { name: 'Robin', color: 0x4a90d9, skin: 0xf4c49c, hair: 0x3d2314 },
  maili: { name: 'Maili', color: 0xc77dff, skin: 0xf4c49c, hair: 0x5c3317 },
};

const HIDE_SPOTS = [
  { x: -3.2, z: -2.5, rot: 0.6, label: 'derrière le canapé' },
  { x: 3.8, z: 2.2, rot: -2.2, label: 'sous le lit' },
  { x: -4.5, z: 2.8, rot: 1.4, label: 'derrière le frigo' },
  { x: 4.2, z: -3.0, rot: -0.5, label: 'dans l\'armoire' },
  { x: 0.5, z: -3.8, rot: Math.PI, label: 'sous la table' },
  { x: -1.5, z: 3.5, rot: -1.0, label: 'derrière la plante' },
  { x: 2.5, z: -1.0, rot: 2.0, label: 'derrière le fauteuil' },
  { x: -0.5, z: 1.5, rot: 0.3, label: 'au milieu du tapis (malin)' },
];

class BerliozHunt {
  constructor() {
    this.state = 'menu';
    this.selectedChar = null;
    this.gameMode = 'hunt';
    this.timeLeft = TIME_LIMIT;
    this.clock = new THREE.Clock();
    this.keys = {};
    this.moveInput = { x: 0, z: 0 };
    this.clickTarget = null;
    this.colliders = [];
    this.attackers = [];
    this.npcs = [];

    this.container = document.getElementById('game-container');
    this.setupUI();

    if (typeof THREE === 'undefined') {
      this.showError('Three.js n\'a pas chargé. Vérifie ta connexion internet et recharge la page.');
      return;
    }

    try {
      this.initThree();
      this.buildApartment();
      this.setupInput();
      this.animate();
    } catch (err) {
      this.showError('Erreur au démarrage : ' + err.message);
    }
  }

  showError(msg) {
    const el = document.getElementById('load-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  initThree() {
    this.camOffset = new THREE.Vector3(0, 4.5, 7);
    this.camLookAt = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 25, 55);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 100);
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0xc4a882, 0.5);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff5e6, 1.0);
    sun.position.set(8, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 30;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    this.scene.add(sun);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  makeBox(w, h, d, color, x, y, z, collider = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collider) {
      this.colliders.push({ x, z, hw: w / 2 + 0.35, hd: d / 2 + 0.35 });
    }
    return mesh;
  }

  buildApartment() {
    // Sol
    const floorGeo = new THREE.PlaneGeometry(14, 12);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xc4a882 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 3),
      new THREE.MeshLambertMaterial({ color: 0x8b5e3c })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.01, 1);
    this.scene.add(rug);

    // Murs
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e8 });
    const wallH = 3;
    this.makeBox(14, wallH, 0.2, 0xf5f0e8, 0, 0, -5.5, false);
    this.makeBox(14, wallH, 0.2, 0xf5f0e8, 0, 0, 5.5, false);
    this.makeBox(0.2, wallH, 12, 0xf5f0e8, -6.5, 0, 0, false);
    this.makeBox(0.2, wallH, 12, 0xf5f0e8, 6.5, 0, 0, false);

    // Meubles
    this.makeBox(3, 0.8, 1.2, 0x5c7cfa, -3, 0, -2, true);   // Canapé
    this.makeBox(2.5, 0.5, 1.8, 0xffffff, 3.5, 0, 2, true);  // Lit
    this.makeBox(1.8, 0.75, 1.0, 0x8b6914, 0, 0, -3.2, true); // Table
    this.makeBox(0.8, 1.8, 0.8, 0xcccccc, -4.5, 0, 2.5, true); // Frigo
    this.makeBox(1.2, 2.2, 0.6, 0x6d4c2a, 4.5, 0, -3, true);  // Armoire
    this.makeBox(1, 0.6, 0.8, 0xe17055, 2.5, 0, -0.8, true);  // Fauteuil
    this.makeBox(0.4, 1.2, 0.4, 0x2d6a4f, -1.5, 0, 3.2, true); // Plante

    // Décoration
    const tv = this.makeBox(1.5, 0.9, 0.1, 0x222222, -3, 1.2, -4.8, false);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xffeaa7, emissive: 0xffeaa7, emissiveIntensity: 0.3 })
    );
    lamp.position.set(0, 2.5, 0);
    this.scene.add(lamp);
  }

  createHumanoid(type) {
    const cfg = CHARS[type];
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: cfg.color })
    );
    body.position.y = 0.75;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshLambertMaterial({ color: cfg.skin })
    );
    head.position.y = 1.45;
    head.castShadow = true;
    group.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: cfg.hair })
    );
    hair.position.y = 1.55;
    group.add(hair);

    const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.15, 0.25, 0);
    const legR = legL.clone();
    legR.position.x = 0.15;
    group.add(legL, legR);

    group.userData.type = type;
    return group;
  }

  createBerlioz() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xff9f43 })
    );
    body.position.y = 0.25;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xff9f43 })
    );
    head.position.set(0, 0.45, 0.1);
    group.add(head);

    const earGeo = new THREE.ConeGeometry(0.08, 0.15, 4);
    const earMat = new THREE.MeshLambertMaterial({ color: 0xff9f43 });
    const earL = new THREE.Mesh(earGeo, earMat);
    earL.position.set(-0.12, 0.6, 0.05);
    const earR = earL.clone();
    earR.position.x = 0.12;
    group.add(earL, earR);

    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 0.4, 6),
      new THREE.MeshLambertMaterial({ color: 0xff9f43 })
    );
    tail.position.set(0, 0.35, -0.3);
    tail.rotation.x = -0.8;
    group.add(tail);

    // Yeux
    const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.08, 0.48, 0.22);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.08;
    group.add(eyeL, eyeR);

    return group;
  }

  createAttacker(x, z) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.45, 1.3, 6),
      new THREE.MeshLambertMaterial({ color: 0x2d2d2d })
    );
    body.position.y = 0.85;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    );
    head.position.y = 1.65;
    group.add(head);
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
    eye.position.set(0, 1.7, 0.25);
    group.add(eye);
    group.position.set(x, 0, z);
    this.scene.add(group);
    return group;
  }

  clearEntities() {
    if (this.player) { this.scene.remove(this.player); this.player = null; }
    if (this.berlioz) { this.scene.remove(this.berlioz); this.berlioz = null; }
    this.npcs.forEach(n => this.scene.remove(n));
    this.npcs = [];
    this.attackers.forEach(a => this.scene.remove(a));
    this.attackers = [];
  }

  startGame() {
    if (!this.selectedChar) return;

    this.state = 'playing';
    this.timeLeft = TIME_LIMIT;
    this.clickTarget = null;
    this.gameMode = this.selectedChar === 'berlioz' ? 'hide' : 'hunt';
    this.clearEntities();

    const spot = HIDE_SPOTS[Math.floor(Math.random() * HIDE_SPOTS.length)];

    if (this.gameMode === 'hunt') {
      this.player = this.createHumanoid(this.selectedChar);
      this.player.position.set(0, 0, 4);
      this.scene.add(this.player);

      this.berlioz = this.createBerlioz();
      this.berlioz.position.set(spot.x, 0, spot.z);
      this.berlioz.rotation.y = spot.rot;
      this.scene.add(this.berlioz);

      document.querySelector('.objective').textContent = 'Trouve Berlioz !';
      document.getElementById('player-name').textContent = CHARS[this.selectedChar].name;
    } else {
      this.player = this.createBerlioz();
      this.player.position.set(spot.x, 0, spot.z);
      this.player.scale.set(1.2, 1.2, 1.2);
      this.scene.add(this.player);

      const robin = this.createHumanoid('robin');
      robin.position.set(-2, 0, 3);
      this.scene.add(robin);
      const maili = this.createHumanoid('maili');
      maili.position.set(2, 0, 3);
      this.scene.add(maili);
      this.npcs = [robin, maili];

      document.querySelector('.objective').textContent = 'Cache-toi 15 sec !';
      document.getElementById('player-name').textContent = 'Berlioz 🐱';
    }

    document.getElementById('menu').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    document.getElementById('lose-screen').classList.add('hidden');
    this.container.classList.add('playing');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('joystick-zone').classList.remove('hidden');
    document.getElementById('controls-hint').classList.remove('hidden');
    this.updateTimer();

    this.clock.start();
    this.clock.getDelta();
    this.lastTimerUpdate = performance.now();
    this.snapCamera();
  }

  updateTimer() {
    const el = document.getElementById('timer');
    el.textContent = Math.ceil(this.timeLeft);
    el.classList.toggle('urgent', this.timeLeft <= 5);
  }

  checkCollision(x, z) {
    if (x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ) {
      return true;
    }
    for (const c of this.colliders) {
      if (Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd) return true;
    }
    return false;
  }

  movePlayer(dx, dz, dt) {
    if (!this.player || this.state !== 'playing') return;

    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) return;

    dx /= len;
    dz /= len;

    const speed = PLAYER_SPEED * dt;
    const nx = this.player.position.x + dx * speed;
    const nz = this.player.position.z + dz * speed;

    if (!this.checkCollision(nx, this.player.position.z)) {
      this.player.position.x = nx;
    }
    if (!this.checkCollision(this.player.position.x, nz)) {
      this.player.position.z = nz;
    }

    this.player.rotation.y = Math.atan2(dx, dz);
  }

  getCameraAngle() {
    return Math.atan2(
      this.camera.position.x - this.player.position.x,
      this.camera.position.z - this.player.position.z
    );
  }

  toWorldDirection(dx, dz) {
    if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) return { x: 0, z: 0 };
    const angle = this.getCameraAngle();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: dx * cos - dz * sin,
      z: dx * sin + dz * cos,
    };
  }

  snapCamera() {
    if (!this.player) return;
    const p = this.player.position;
    this.camera.position.set(
      p.x + this.camOffset.x,
      p.y + this.camOffset.y,
      p.z + this.camOffset.z
    );
    this.camLookAt.set(p.x, p.y + 1.2, p.z);
    this.camera.lookAt(this.camLookAt);
  }

  updateCamera() {
    if (!this.player) return;
    const p = this.player.position;
    this._camTarget.set(
      p.x + this.camOffset.x,
      p.y + this.camOffset.y,
      p.z + this.camOffset.z
    );
    this.camera.position.lerp(this._camTarget, 0.15);
    this.camLookAt.set(p.x, p.y + 1.2, p.z);
    this.camera.lookAt(this.camLookAt);
  }

  checkWin() {
    if (!this.player || this.state !== 'playing') return;

    if (this.gameMode === 'hunt' && this.berlioz) {
      const dist = this.player.position.distanceTo(this.berlioz.position);
      if (dist < CATCH_DISTANCE) this.win('found');
    }
  }

  checkHideMode(dt) {
    if (this.gameMode !== 'hide' || !this.player) return;

    this.npcs.forEach((npc) => {
      const dir = new THREE.Vector3()
        .subVectors(this.player.position, npc.position);
      const dist = dir.length();
      dir.normalize();
      const speed = dist > 3 ? 2.5 : 4.5;
      const nx = npc.position.x + dir.x * speed * dt;
      const nz = npc.position.z + dir.z * speed * dt;
      if (!this.checkCollision(nx, npc.position.z)) npc.position.x = nx;
      if (!this.checkCollision(npc.position.x, nz)) npc.position.z = nz;
      npc.rotation.y = Math.atan2(dir.x, dir.z);

      if (dist < 1.5) this.triggerAttack();
    });
  }

  win(reason = 'found') {
    this.state = 'win';
    const winTitle = document.querySelector('#win-screen h1');
    const winMsg = document.getElementById('win-msg');
    if (reason === 'survived') {
      winTitle.textContent = 'Berlioz a survécu ! 🐱';
      winMsg.innerHTML = 'Robin et Maili n\'ont pas trouvé le chat !';
    } else {
      winTitle.textContent = 'Berlioz trouvé ! 🎉';
      winMsg.innerHTML = `Tu l'as eu avec <span id="win-time">${Math.ceil(this.timeLeft)}</span>s restantes !`;
    }
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('joystick-zone').classList.add('hidden');
    document.getElementById('controls-hint').classList.add('hidden');
    this.container.classList.remove('playing');
    document.getElementById('win-screen').classList.remove('hidden');
  }

  triggerAttack() {
    this.state = 'attack';
    const positions = [
      [-6, -4], [6, -4], [-6, 4], [6, 4], [0, -5]
    ];
    positions.forEach(([x, z]) => {
      const a = this.createAttacker(x, z);
      a.userData.attacker = true;
      this.attackers.push(a);
    });

    setTimeout(() => this.lose(), 1500);
  }

  lose() {
    this.state = 'lose';
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('joystick-zone').classList.add('hidden');
    document.getElementById('controls-hint').classList.add('hidden');
    this.container.classList.remove('playing');
    document.getElementById('lose-screen').classList.remove('hidden');
    this.renderer.domElement.style.filter = 'brightness(0.4) saturate(0.3)';
  }

  resetToMenu() {
    this.state = 'menu';
    this.renderer.domElement.style.filter = '';
    this.clearEntities();
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('joystick-zone').classList.add('hidden');
    document.getElementById('controls-hint').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    document.getElementById('lose-screen').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
    this.container.classList.remove('playing');
    if (this.camera) {
      this.camera.position.set(0, 8, 12);
      this.camera.lookAt(0, 0, 0);
    }
  }

  selectChar(char) {
    const cards = document.querySelectorAll('.char-card');
    const hint = document.getElementById('char-hint');
    const btnStart = document.getElementById('btn-start');

    cards.forEach(c => c.classList.toggle('selected', c.dataset.char === char));
    this.selectedChar = char;

    if (char === 'berlioz') {
      hint.textContent = '🐱 Mode cache-cache : survie 15 sec, évite Robin & Maili !';
    } else {
      hint.textContent = `Tu joues ${CHARS[char].name}. Trouve Berlioz en 15 secondes !`;
    }
    btnStart.disabled = false;
  }

  setupUI() {
    const cards = document.querySelectorAll('.char-card');
    const btnStart = document.getElementById('btn-start');

    this.selectChar('robin');

    cards.forEach((card) => {
      card.addEventListener('click', () => this.selectChar(card.dataset.char));
    });

    btnStart.addEventListener('click', () => {
      if (!this.renderer) {
        this.showError('Le jeu n\'est pas prêt. Recharge la page avec une connexion internet.');
        return;
      }
      this.startGame();
    });
    document.getElementById('btn-replay-win').addEventListener('click', () => this.resetToMenu());
    document.getElementById('btn-replay-lose').addEventListener('click', () => this.resetToMenu());
  }

  setupInput() {
    const keyMap = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      z: 'up', q: 'left', s: 'down', d: 'right',
      w: 'up', a: 'left',
    };

    window.addEventListener('keydown', (e) => {
      const k = keyMap[e.key.toLowerCase()] || keyMap[e.key];
      if (k) { this.keys[k] = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      const k = keyMap[e.key.toLowerCase()] || keyMap[e.key];
      if (k) this.keys[k] = false;
    });

    // Clic / tap pour se déplacer
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const onPointer = (clientX, clientY) => {
      if (this.state !== 'playing') return;
      mouse.x = (clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);
      const target = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floorPlane, target)) {
        if (!this.checkCollision(target.x, target.z)) {
          this.clickTarget = { x: target.x, z: target.z };
        }
      }
    };

    this.renderer.domElement.addEventListener('click', (e) => onPointer(e.clientX, e.clientY));
    this.renderer.domElement.addEventListener('touchstart', (e) => {
      if (e.target.closest('#joystick-zone')) return;
      const t = e.touches[0];
      onPointer(t.clientX, t.clientY);
    }, { passive: true });

    // Joystick tactile
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const stick = document.getElementById('joystick-stick');
    let joyActive = false;
    let joyOrigin = { x: 0, y: 0 };
    const maxRadius = 35;

    const handleJoy = (cx, cy) => {
      let dx = cx - joyOrigin.x;
      let dy = cy - joyOrigin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.moveInput.x = dx / maxRadius;
      this.moveInput.z = -dy / maxRadius;
    };

    const endJoy = () => {
      joyActive = false;
      stick.style.transform = 'translate(-50%, -50%)';
      this.moveInput.x = 0;
      this.moveInput.z = 0;
    };

    base.addEventListener('touchstart', (e) => {
      e.preventDefault();
      joyActive = true;
      const rect = base.getBoundingClientRect();
      joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      handleJoy(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!joyActive) return;
      e.preventDefault();
      handleJoy(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener('touchend', endJoy);
  }

  getKeyboardInput() {
    let x = 0, z = 0;
    if (this.keys.up) z -= 1;
    if (this.keys.down) z += 1;
    if (this.keys.left) x -= 1;
    if (this.keys.right) x += 1;
    return { x, z };
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state === 'playing') {
      const now = performance.now();
      if (now - this.lastTimerUpdate >= 1000) {
        this.timeLeft -= 1;
        this.lastTimerUpdate = now;
        this.updateTimer();
        if (this.timeLeft <= 0) {
          if (this.gameMode === 'hide') {
            this.win('survived');
          } else {
            this.triggerAttack();
          }
        }
      }

      let dx = 0, dz = 0;
      let cameraRelative = false;
      const kb = this.getKeyboardInput();
      const joyLen = Math.sqrt(this.moveInput.x ** 2 + this.moveInput.z ** 2);

      if (joyLen > 0.15) {
        dx = this.moveInput.x;
        dz = this.moveInput.z;
        cameraRelative = true;
        this.clickTarget = null;
      } else if (kb.x !== 0 || kb.z !== 0) {
        dx = kb.x;
        dz = kb.z;
        cameraRelative = true;
        this.clickTarget = null;
      } else if (this.clickTarget && this.player) {
        const px = this.player.position.x;
        const pz = this.player.position.z;
        dx = this.clickTarget.x - px;
        dz = this.clickTarget.z - pz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.3) {
          this.clickTarget = null;
          dx = 0; dz = 0;
        } else {
          dx /= dist;
          dz /= dist;
        }
      }

      let moveX = dx;
      let moveZ = dz;
      if (cameraRelative) {
        const world = this.toWorldDirection(dx, dz);
        moveX = world.x;
        moveZ = world.z;
      }

      const speedMul = this.gameMode === 'hide' ? 1.3 : 1;
      this.movePlayer(moveX * speedMul, moveZ * speedMul, dt);
      this.updateCamera();
      this.checkWin();
      this.checkHideMode(dt);

      const t = performance.now();
      const cat = this.berlioz || (this.gameMode === 'hide' ? this.player : null);
      if (cat?.children[3]) {
        cat.children[3].rotation.z = Math.sin(t * 0.005) * 0.3;
      }
    }

    if (this.state === 'attack' && this.player) {
      this.attackers.forEach((a) => {
        const dir = new THREE.Vector3()
          .subVectors(this.player.position, a.position)
          .normalize();
        a.position.add(dir.multiplyScalar(dt * 4));
        a.lookAt(this.player.position);
      });
      this.updateCamera();
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new BerliozHunt();
});