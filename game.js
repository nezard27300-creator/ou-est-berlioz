const TIME_LIMIT = 15;
const PLAYER_SPEED = 8;
const CATCH_DISTANCE = 2;
const WORLD_BOUNDS = { minX: -10.5, maxX: 10.5, minZ: -8.5, maxZ: 8.5 };

const CHARS = {
  robin: { name: 'Robin', color: 0x4a90d9, skin: 0xf4c49c, hair: 0x3d2314 },
  maili: { name: 'Maili', color: 0xc77dff, skin: 0xf4c49c, hair: 0x5c3317 },
};

const HIDE_SPOTS = [
  { x: -5.5, z: -1.5, rot: 0.6, label: 'derrière le canapé' },
  { x: 7.5, z: 2.5, rot: -2.2, label: 'sous le lit' },
  { x: -8.5, z: 6.0, rot: 1.4, label: 'derrière le frigo' },
  { x: 8.5, z: 5.5, rot: -0.5, label: 'dans l\'armoire' },
  { x: -2.0, z: -1.0, rot: Math.PI, label: 'sous la table basse' },
  { x: 1.5, z: -2.5, rot: 2.0, label: 'derrière le fauteuil' },
  { x: -7.0, z: 6.5, rot: 1.0, label: 'sous la baignoire' },
  { x: 8.0, z: -5.0, rot: 0.3, label: 'sous le bureau' },
  { x: -3.5, z: 5.5, rot: -1.0, label: 'coin cuisine' },
  { x: 5.0, z: 6.0, rot: 0.8, label: 'derrière la commode' },
  { x: -0.5, z: -6.5, rot: 0, label: 'derrière la TV' },
  { x: 3.0, z: 0.5, rot: 1.5, label: 'sous le tapis' },
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
    this.joy = { active: false, pointerId: null, originX: 0, originY: 0 };
    this.tapStart = null;
    this.reveal = { active: false, time: 0, duration: 2.8 };
    this._inputDir = new THREE.Vector3();
    this.audio = { ctx: null, master: null, musicGain: null, playing: false, timer: null };
    this.colliders = [];
    this.attackers = [];
    this.npcs = [];
    this.container = document.getElementById('game-container');
    this.setupUI();

    if (typeof THREE === 'undefined') {
      this.showError('Three.js n\'a pas chargé. Vérifie ta connexion et recharge.');
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

  ensureAudio() {
    if (!this.audio.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.audio.ctx = new Ctx();
      this.audio.master = this.audio.ctx.createGain();
      this.audio.master.gain.value = 0.5;
      this.audio.master.connect(this.audio.ctx.destination);
      this.audio.musicGain = this.audio.ctx.createGain();
      this.audio.musicGain.gain.value = 0.14;
      this.audio.musicGain.connect(this.audio.master);
    }
    if (this.audio.ctx?.state === 'suspended') {
      this.audio.ctx.resume();
    }
  }

  startMusic() {
    this.ensureAudio();
    if (!this.audio.ctx || this.audio.playing) return;
    this.audio.playing = true;
    const melody = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 329.63];
    let i = 0;
    const playNote = () => {
      if (!this.audio.playing || !this.audio.ctx) return;
      const t = this.audio.ctx.currentTime;
      const osc = this.audio.ctx.createOscillator();
      const g = this.audio.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = melody[i % melody.length];
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(g);
      g.connect(this.audio.musicGain);
      osc.start(t);
      osc.stop(t + 0.6);
      i++;
      this.audio.timer = setTimeout(playNote, 480);
    };
    playNote();
  }

  stopMusic() {
    this.audio.playing = false;
    if (this.audio.timer) {
      clearTimeout(this.audio.timer);
      this.audio.timer = null;
    }
  }

  playMeow() {
    this.ensureAudio();
    if (!this.audio.ctx) return;
    const t = this.audio.ctx.currentTime;

    const meow = (freqStart, freqEnd, start, dur, vol) => {
      const osc = this.audio.ctx.createOscillator();
      const g = this.audio.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freqStart, t + start);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, t + start + dur);
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(vol, t + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.connect(g);
      g.connect(this.audio.master);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.05);
    };

    meow(800, 450, 0, 0.12, 0.2);
    meow(650, 520, 0.1, 0.15, 0.28);
    meow(720, 400, 0.22, 0.28, 0.25);
  }

  playGrowl() {
    this.ensureAudio();
    if (!this.audio.ctx) return;
    const t = this.audio.ctx.currentTime;
    const len = this.audio.ctx.sampleRate * 0.9;
    const buffer = this.audio.ctx.createBuffer(1, len, this.audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
    }
    const noise = this.audio.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + 0.7);
    const g = this.audio.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.audio.master);
    noise.start(t);
    noise.stop(t + 0.9);

    const osc = this.audio.ctx.createOscillator();
    const og = this.audio.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.6);
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.3, t + 0.08);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    osc.connect(og);
    og.connect(this.audio.master);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  showError(msg) {
    const el = document.getElementById('load-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  getViewSize() {
    return {
      w: window.innerWidth || document.documentElement.clientWidth || 800,
      h: window.innerHeight || document.documentElement.clientHeight || 600,
    };
  }

  initThree() {
    this.camOffset = new THREE.Vector3(9, 18, 9);
    this.camLookHeight = 0;
    this.orthoZoom = 11;
    this.camLookAt = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6ba3d6);

    const { w, h } = this.getViewSize();
    const aspect = w / h;
    this.camera = new THREE.OrthographicCamera(
      -this.orthoZoom * aspect,
      this.orthoZoom * aspect,
      this.orthoZoom,
      -this.orthoZoom,
      0.5,
      200
    );
    this.setCameraView(0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const { w, h } = this.getViewSize();
    const aspect = w / h;
    this.camera.left = -this.orthoZoom * aspect;
    this.camera.right = this.orthoZoom * aspect;
    this.camera.top = this.orthoZoom;
    this.camera.bottom = -this.orthoZoom;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setCameraView(targetX, targetZ) {
    this.camera.position.set(
      targetX + this.camOffset.x,
      this.camOffset.y,
      targetZ + this.camOffset.z
    );
    this.camLookAt.set(targetX, this.camLookHeight, targetZ);
    this.camera.lookAt(this.camLookAt);
  }

  floorColor(type) {
    if (type === 'wood') return 0xc9a66b;
    if (type === 'tile') return 0xdddddd;
    return 0x8b6e4e;
  }

  makeFloor(w, d, x, z, texType) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: this.floorColor(texType) })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0, z);
    this.scene.add(floor);
  }

  makeBox(w, h, d, color, x, y, z, collider = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.set(x, y + h / 2, z);
    this.scene.add(mesh);
    if (collider) {
      this.colliders.push({ x, z, hw: w / 2 + 0.2, hd: d / 2 + 0.2 });
    }
    return mesh;
  }

  makeWall(w, h, d, color, x, y, z) {
    return this.makeBox(w, h, d, color, x, y, z, false);
  }

  makePartition(w, d, x, z, collider = true) {
    this.makeBox(w, 1.1, d, 0xf0ebe3, x, 0, z, collider);
  }

  buildApartment() {
    const W = 22, D = 18;

    this.makeFloor(W, D, 0, 0, 'wood');
    this.makeFloor(10, 5, -5.5, 6, 'tile');
    this.makeFloor(6, 10, 7.5, 1, 'wood');
    this.makeFloor(4, 4, -8, 6.5, 'tile');

    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 4),
      new THREE.MeshBasicMaterial({ color: 0x7a4f32 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-1, 0.02, -0.5);
    this.scene.add(rug);

    const wallH = 2.8;
    const wallColor = 0xf5f0e8;
    this.makeWall(W, wallH, 0.25, wallColor, 0, 0, -D / 2);
    this.makeWall(W, wallH, 0.25, wallColor, 0, 0, D / 2);
    this.makeWall(0.25, wallH, D, wallColor, -W / 2, 0, 0);
    this.makeWall(0.25, wallH, D, wallColor, W / 2, 0, 0);

    this.makePartition(0.25, 11, 3.5, -1.5);
    this.makePartition(11, 0.25, -5.5, 3.5);
    this.makePartition(6, 0.25, -8, 5.5);

    const addWindow = (x, z, rotY = 0) => {
      const frame = this.makeBox(2.2, 1.4, 0.12, 0xdddddd, x, 1.4, z, false);
      frame.rotation.y = rotY;
      const glass = this.makeBox(1.8, 1.1, 0.06, 0x88ccee, x, 1.4, z, false);
      glass.rotation.y = rotY;
    };
    addWindow(-10.8, 0, 0);
    addWindow(0, -8.8, 0);
    addWindow(10.8, 2, 0);

    // Salon
    this.makeBox(3.2, 0.75, 1.1, 0x4a6fa5, -5.5, 0, -1.5, true);
    this.makeBox(1.1, 0.75, 2.2, 0x4a6fa5, -6.8, 0, -2.5, true);
    this.makeBox(2.4, 0.4, 1.2, 0x5c3d2e, -2, 0, -1, true);
    this.makeBox(0.9, 0.55, 0.9, 0xc45c3e, 1.5, 0, -2.5, true);
    this.makeBox(2.8, 0.55, 0.5, 0x3d2817, -5, 0, -7, true);
    this.makeBox(1.6, 0.9, 0.15, 0x111111, -5, 0.55, -7.8, false);
    this.makeBox(0.8, 1.6, 0.35, 0x5c3d2e, 8.5, 0, -6, true);
    this.makeBox(0.5, 0.9, 0.5, 0x2d6a4f, -1, 0, 1.5, true);

    // Cuisine
    this.makeBox(0.85, 1.9, 0.85, 0xeeeeee, -8.5, 0, 6, true);
    this.makeBox(4.5, 0.92, 0.65, 0xd4c4a8, -6, 0, 5.2, true);
    this.makeBox(0.6, 0.92, 0.6, 0x888888, -4, 0.92, 5.2, false);
    this.makeBox(1.6, 0.75, 1.6, 0x8b6914, -2.5, 0, 5.8, true);
    this.makeBox(0.45, 0.45, 0.45, 0x6b4423, -3.2, 0, 5.2, true);
    this.makeBox(0.45, 0.45, 0.45, 0x6b4423, -1.8, 0, 5.2, true);

    // Salle de bain
    this.makeBox(1.8, 0.55, 0.9, 0xf0f0f0, -7, 0, 6.5, true);
    this.makeBox(0.5, 0.75, 0.5, 0xffffff, -9, 0, 5, true);
    this.makeBox(0.7, 0.85, 0.45, 0xdddddd, -5, 0, 7.2, true);

    // Chambre
    this.makeBox(2.2, 0.55, 2.8, 0xf8f4ef, 7.5, 0, 2.5, true);
    this.makeBox(2.4, 0.25, 0.15, 0x6d4c2a, 7.5, 0.35, 3.8, false);
    this.makeBox(0.55, 0.45, 0.55, 0xffffff, 5.5, 0, 2.5, true);
    this.makeBox(1.4, 2.0, 0.65, 0x6d4c2a, 8.5, 0, 5.5, true);
    this.makeBox(1.8, 0.75, 0.9, 0x5c3d2e, 8, 0, -5, true);
    this.makeBox(1.2, 0.55, 0.6, 0xffffff, 6, 0, 6, true);

  }

  makePart(geo, color, x, y, z, group, opts = {}) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.set(x, y, z);
    if (opts.rx) mesh.rotation.x = opts.rx;
    if (opts.ry) mesh.rotation.y = opts.ry;
    if (opts.rz) mesh.rotation.z = opts.rz;
    group.add(mesh);
    return mesh;
  }

  createHumanoid(type) {
    const cfg = CHARS[type];
    const group = new THREE.Group();
    const isMaili = type === 'maili';

    this.makePart(new THREE.BoxGeometry(0.5, 0.3, 0.28), 0x1a1a1a, 0, 0.15, 0, group);
    this.makePart(new THREE.BoxGeometry(0.46, 0.5, 0.28), cfg.color, 0, 0.55, 0, group);
    this.makePart(new THREE.BoxGeometry(0.52, 0.22, 0.32), cfg.color, 0, 0.92, 0, group);
    const head = this.makePart(new THREE.BoxGeometry(0.28, 0.3, 0.26), cfg.skin, 0, 1.22, 0.04, group);
    this.makePart(new THREE.BoxGeometry(0.3, 0.1, 0.28), cfg.hair, 0, 1.38, 0, group);
    this.makePart(new THREE.BoxGeometry(0.08, 0.06, 0.04), 0x111111, -0.08, 1.24, 0.18, group);
    this.makePart(new THREE.BoxGeometry(0.08, 0.06, 0.04), 0x111111, 0.08, 1.24, 0.18, group);
    if (isMaili) {
      this.makePart(new THREE.BoxGeometry(0.36, 0.28, 0.2), cfg.color, 0, 0.78, -0.1, group);
    }

    const armGeo = new THREE.BoxGeometry(0.14, 0.42, 0.14);
    const legGeo = new THREE.BoxGeometry(0.16, 0.46, 0.16);
    const armL = this.makePart(armGeo, cfg.color, -0.34, 0.72, 0, group);
    const armR = this.makePart(armGeo, cfg.color, 0.34, 0.72, 0, group);
    const legL = this.makePart(legGeo, 0x2d3142, -0.14, 0.28, 0.02, group);
    const legR = this.makePart(legGeo, 0x2d3142, 0.14, 0.28, 0.02, group);
    this.makePart(new THREE.BoxGeometry(0.18, 0.1, 0.28), 0xeeeeee, -0.14, 0.05, 0.08, group);
    this.makePart(new THREE.BoxGeometry(0.18, 0.1, 0.28), 0xeeeeee, 0.14, 0.05, 0.08, group);

    group.userData.type = type;
    group.userData.parts = { head, armL, armR, legL, legR };
    return group;
  }

  createBerlioz() {
    const group = new THREE.Group();
    const fur = 0xff9f43;
    const stripe = 0xe67e22;
    const belly = 0xffd4a8;

    this.makePart(new THREE.SphereGeometry(0.22, 10, 8), fur, 0, 0.22, 0.04, group);
    this.makePart(new THREE.SphereGeometry(0.16, 10, 8), belly, 0, 0.16, 0.1, group);
    this.makePart(new THREE.SphereGeometry(0.19, 10, 8), fur, 0, 0.44, 0.12, group);

    const earGeo = new THREE.ConeGeometry(0.07, 0.14, 5);
    this.makePart(earGeo, fur, -0.11, 0.58, 0.08, group, { rz: -0.2 });
    this.makePart(earGeo, fur, 0.11, 0.58, 0.08, group, { rz: 0.2 });
    this.makePart(new THREE.SphereGeometry(0.05, 6, 6), 0xffb6c8, -0.11, 0.54, 0.1, group);
    this.makePart(new THREE.SphereGeometry(0.05, 6, 6), 0xffb6c8, 0.11, 0.54, 0.1, group);

    const tail = this.makePart(new THREE.CylinderGeometry(0.04, 0.05, 0.35, 6), fur, 0, 0.34, -0.28, group, { rx: -1.1 });
    this.makePart(new THREE.SphereGeometry(0.045, 6, 6), 0x111111, -0.07, 0.46, 0.24, group);
    this.makePart(new THREE.SphereGeometry(0.045, 6, 6), 0x111111, 0.07, 0.46, 0.24, group);
    this.makePart(new THREE.SphereGeometry(0.025, 6, 6), 0x66ccff, -0.07, 0.46, 0.27, group);
    this.makePart(new THREE.SphereGeometry(0.025, 6, 6), 0x66ccff, 0.07, 0.46, 0.27, group);
    this.makePart(new THREE.SphereGeometry(0.03, 6, 6), 0xff8fab, 0, 0.42, 0.26, group);

    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6);
    this.makePart(legGeo, fur, -0.1, 0.08, 0.08, group);
    this.makePart(legGeo, fur, 0.1, 0.08, 0.08, group);
    this.makePart(legGeo, fur, -0.1, 0.08, -0.06, group);
    this.makePart(legGeo, fur, 0.1, 0.08, -0.06, group);

    group.userData.tail = tail;
    return group;
  }

  createHideHint(x, z) {
    const hint = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.42, 12),
      new THREE.MeshBasicMaterial({ color: 0xff9f43 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    hint.add(ring);
    hint.position.set(x, 0, z);
    hint.visible = false;
    this.scene.add(hint);
    return hint;
  }

  createAttacker(x, z) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.45, 1.3, 6),
      new THREE.MeshBasicMaterial({ color: 0x2d2d2d })
    );
    body.position.y = 0.85;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
    );
    head.position.y = 1.65;
    group.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
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
    if (this.hideHint) { this.scene.remove(this.hideHint); this.hideHint = null; }
    this.npcs.forEach(n => this.scene.remove(n));
    this.npcs = [];
    this.attackers.forEach(a => this.scene.remove(a));
    this.attackers = [];
    this.reveal.active = false;
    this.reveal.time = 0;
  }

  startGame() {
    if (!this.selectedChar) return;

    this.state = 'playing';
    this.timeLeft = TIME_LIMIT;
    this.clickTarget = null;
    this.moveInput.x = 0;
    this.moveInput.z = 0;
    this.joy.active = false;
    this.joy.pointerId = null;
    this.tapStart = null;
    document.getElementById('joystick-base')?.classList.remove('joy-visible');
    this.gameMode = this.selectedChar === 'berlioz' ? 'hide' : 'hunt';
    this.clearEntities();

    const spot = HIDE_SPOTS[Math.floor(Math.random() * HIDE_SPOTS.length)];

    try {
    if (this.gameMode === 'hunt') {
      this.player = this.createHumanoid(this.selectedChar);
      this.player.position.set(0, 0, 0);
      this.scene.add(this.player);

      this.berlioz = this.createBerlioz();
      this.berlioz.position.set(spot.x, 0, spot.z);
      this.berlioz.rotation.y = spot.rot;
      this.berlioz.visible = false;
      this.berlioz.scale.set(1, 1, 1);
      this.scene.add(this.berlioz);
      this.hideHint = this.createHideHint(spot.x, spot.z);
      this.hideSpotLabel = spot.label;

      document.querySelector('.objective').textContent = 'Trouve Berlioz !';
      document.getElementById('player-name').textContent = CHARS[this.selectedChar].name;
    } else {
      this.player = this.createBerlioz();
      this.player.position.set(spot.x, 0, spot.z);
      this.player.scale.set(1.2, 1.2, 1.2);
      this.scene.add(this.player);

      const robin = this.createHumanoid('robin');
      robin.position.set(-3, 0, -2);
      this.scene.add(robin);
      const maili = this.createHumanoid('maili');
      maili.position.set(3, 0, -2);
      this.scene.add(maili);
      this.npcs = [robin, maili];

      document.querySelector('.objective').textContent = 'Cache-toi 15 sec !';
      document.getElementById('player-name').textContent = 'Berlioz 🐱';
    }
    } catch (err) {
      this.showError('Erreur 3D : ' + err.message);
      this.resetToMenu();
      return;
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
    this.onResize();
    this.snapCamera();
    this.ensureAudio();
    this.startMusic();
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

  getMovementFromInput(inputX, inputZ) {
    if (Math.abs(inputX) < 0.01 && Math.abs(inputZ) < 0.01) {
      return { x: 0, z: 0 };
    }
    this.camera.updateMatrixWorld();
    this._inputDir.set(inputX, 0, -inputZ);
    this._inputDir.applyQuaternion(this.camera.quaternion);
    this._moveDir.set(this._inputDir.x, 0, this._inputDir.z);
    if (this._moveDir.lengthSq() < 1e-6) {
      return { x: 0, z: 0 };
    }
    this._moveDir.normalize();
    return { x: this._moveDir.x, z: this._moveDir.z };
  }

  snapCamera() {
    if (!this.player) return;
    this.setCameraView(this.player.position.x, this.player.position.z);
  }

  updateCamera(focus = null) {
    if (!this.player && !focus) return;
    const p = focus || this.player.position;
    this.setCameraView(p.x, p.z);
  }

  updateProximityHint() {
    if (this.gameMode !== 'hunt' || !this.player || !this.berlioz || this.reveal.active) return;
    const dist = this.player.position.distanceTo(this.berlioz.position);
    const objective = document.querySelector('.objective');
    if (this.hideHint) {
      this.hideHint.visible = dist < 5.5;
      if (this.hideHint.visible) {
        this.hideHint.rotation.y += 0.02;
        const pulse = 0.9 + Math.sin(performance.now() * 0.006) * 0.1;
        this.hideHint.scale.set(pulse, pulse, pulse);
      }
    }
    if (dist < 4) {
      objective.textContent = 'Tu le sens proche… 🐾';
    } else if (dist < 7) {
      objective.textContent = 'Berlioz est dans le coin…';
    } else {
      objective.textContent = 'Trouve Berlioz !';
    }
  }

  startReveal() {
    if (this.reveal.active) return;
    this.state = 'reveal';
    this.reveal.active = true;
    this.reveal.time = 0;
    this.moveInput.x = 0;
    this.moveInput.z = 0;
    this.clickTarget = null;
    if (this.hideHint) this.hideHint.visible = false;

    this.berlioz.visible = true;
    this.berlioz.position.y = 0.15;
    this.berlioz.scale.set(0.2, 0.2, 0.2);

    document.querySelector('.objective').textContent = 'Berlioz trouvé ! 🐱';
    this.playGrowl();
    setTimeout(() => this.playMeow(), 450);
  }

  finishRevealWin() {
    this.win('found', true);
  }

  checkWin() {
    if (!this.player || this.state !== 'playing') return;

    if (this.gameMode === 'hunt' && this.berlioz) {
      const dist = this.player.position.distanceTo(this.berlioz.position);
      if (dist < CATCH_DISTANCE) this.startReveal();
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

  win(reason = 'found', skipRevealSounds = false) {
    this.state = 'win';
    this.reveal.active = false;
    this.stopMusic();
    const winTitle = document.querySelector('#win-screen h1');
    const winMsg = document.getElementById('win-msg');
    if (reason === 'survived') {
      winTitle.textContent = 'Berlioz a survécu ! 🐱';
      winMsg.innerHTML = 'Robin et Maili n\'ont pas trouvé le chat !';
      this.playMeow();
    } else {
      winTitle.textContent = 'Berlioz trouvé ! 🎉';
      const spotText = this.hideSpotLabel ? ` (${this.hideSpotLabel})` : '';
      winMsg.innerHTML = `Tu l'as attrapé${spotText} avec <span id="win-time">${Math.ceil(this.timeLeft)}</span>s restantes !`;
      if (!skipRevealSounds) {
        this.playGrowl();
        setTimeout(() => this.playMeow(), 450);
      }
    }
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('joystick-zone').classList.add('hidden');
    document.getElementById('controls-hint').classList.add('hidden');
    this.container.classList.remove('playing');
    document.getElementById('win-screen').classList.remove('hidden');
  }

  triggerAttack() {
    this.state = 'attack';
    this.playGrowl();
    const positions = [
      [-10, -7], [10, -7], [-10, 7], [10, 7], [0, -8]
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
    this.stopMusic();
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('joystick-zone').classList.add('hidden');
    document.getElementById('controls-hint').classList.add('hidden');
    this.container.classList.remove('playing');
    document.getElementById('lose-screen').classList.remove('hidden');
    this.renderer.domElement.style.filter = 'brightness(0.4) saturate(0.3)';
  }

  resetToMenu() {
    this.state = 'menu';
    this.stopMusic();
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
      this.setCameraView(0, 0);
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
      this.ensureAudio();
      this.startGame();
    });
    document.getElementById('btn-replay-win').addEventListener('click', () => this.resetToMenu());
    document.getElementById('btn-replay-lose').addEventListener('click', () => this.resetToMenu());
  }

  setupInput() {
    const keyMap = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      z: 'up', q: 'left', s: 'down', d: 'right',
      w: 'up', a: 'left', Z: 'up', Q: 'left', S: 'down', D: 'right',
      W: 'up', A: 'left',
    };

    window.addEventListener('keydown', (e) => {
      const k = keyMap[e.key.toLowerCase()] || keyMap[e.key];
      if (k) { this.keys[k] = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      const k = keyMap[e.key.toLowerCase()] || keyMap[e.key];
      if (k) this.keys[k] = false;
    });

    this.setupTapToMove();
    this.setupJoystick();
  }

  setupTapToMove() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const goToPoint = (clientX, clientY) => {
      if (this.state !== 'playing' || this.joy.active) return;
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

    const canvas = this.renderer.domElement;

    canvas.addEventListener('click', (e) => {
      if (window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches) return;
      goToPoint(e.clientX, e.clientY);
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return;
      if (e.clientX < window.innerWidth * 0.5) return;
      this.tapStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!this.tapStart || e.pointerId !== this.tapStart.id) return;
      const dx = e.clientX - this.tapStart.x;
      const dy = e.clientY - this.tapStart.y;
      if (Math.hypot(dx, dy) < 18) {
        goToPoint(e.clientX, e.clientY);
      }
      this.tapStart = null;
    });

    canvas.addEventListener('pointercancel', () => {
      this.tapStart = null;
    });
  }

  setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const stick = document.getElementById('joystick-stick');
    const maxRadius = 52;
    const baseRadius = 65;

    const showJoystick = (x, y) => {
      base.classList.add('joy-visible');
      base.style.left = `${x - baseRadius}px`;
      base.style.top = `${y - baseRadius}px`;
      this.joy.originX = x;
      this.joy.originY = y;
    };

    const updateJoystick = (x, y) => {
      let dx = x - this.joy.originX;
      let dy = y - this.joy.originY;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.moveInput.x = dx / maxRadius;
      this.moveInput.z = -(dy / maxRadius);
      const len = Math.hypot(this.moveInput.x, this.moveInput.z);
      if (len > 1) {
        this.moveInput.x /= len;
        this.moveInput.z /= len;
      }
    };

    const endJoystick = (pointerId) => {
      if (pointerId !== undefined && this.joy.pointerId !== pointerId) return;
      this.joy.active = false;
      this.joy.pointerId = null;
      base.classList.remove('joy-visible');
      stick.style.transform = 'translate(-50%, -50%)';
      this.moveInput.x = 0;
      this.moveInput.z = 0;
      if (pointerId != null) {
        try { zone.releasePointerCapture(pointerId); } catch (_) {}
      }
    };

    const onJoyMove = (e) => {
      if (!this.joy.active || e.pointerId !== this.joy.pointerId) return;
      e.preventDefault();
      updateJoystick(e.clientX, e.clientY);
    };

    const onJoyEnd = (e) => {
      if (!this.joy.active || e.pointerId !== this.joy.pointerId) return;
      endJoystick(e.pointerId);
    };

    zone.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return;
      e.preventDefault();
      this.joy.active = true;
      this.joy.pointerId = e.pointerId;
      this.clickTarget = null;
      this.tapStart = null;
      try { zone.setPointerCapture(e.pointerId); } catch (_) {}
      showJoystick(e.clientX, e.clientY);
      updateJoystick(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', onJoyMove);
    window.addEventListener('pointermove', onJoyMove);
    zone.addEventListener('pointerup', onJoyEnd);
    window.addEventListener('pointerup', onJoyEnd);
    zone.addEventListener('pointercancel', onJoyEnd);
    window.addEventListener('pointercancel', onJoyEnd);
  }

  getKeyboardInput() {
    let x = 0, z = 0;
    if (this.keys.up) z += 1;
    if (this.keys.down) z -= 1;
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

      if (joyLen > 0.08) {
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
        const world = this.getMovementFromInput(dx, dz);
        moveX = world.x;
        moveZ = world.z;
      }

      const speedMul = this.gameMode === 'hide' ? 1.3 : 1;
      this.movePlayer(moveX * speedMul, moveZ * speedMul, dt);
      this.updateCamera();
      this.updateProximityHint();
      this.checkWin();
      this.checkHideMode(dt);
      this.animateCharacters(dt);
    }

    if (this.state === 'reveal' && this.berlioz) {
      this.reveal.time += dt;
      const t = this.reveal.time;
      const bounce = 1 + Math.sin(t * 8) * 0.08 * Math.max(0, 1 - t / 1.2);
      const grow = Math.min(1, t * 2.5) * bounce;
      this.berlioz.scale.set(grow, grow, grow);
      this.berlioz.position.y = 0.15 + Math.sin(t * 6) * 0.06 * Math.max(0, 1 - t / 1.5);
      this.berlioz.rotation.y += dt * 2.5;
      if (this.berlioz.userData.tail) {
        this.berlioz.userData.tail.rotation.z = Math.sin(t * 12) * 0.5;
      }
      this.updateCamera(this.berlioz.position);
      if (t >= this.reveal.duration) {
        this.finishRevealWin();
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

  animateCharacters(dt) {
    const t = performance.now() * 0.001;
    const walk = this.moveInput.x ** 2 + this.moveInput.z ** 2 > 0.04
      || this.keys.up || this.keys.down || this.keys.left || this.keys.right
      || !!this.clickTarget;

    const animateHuman = (human) => {
      const parts = human.userData.parts;
      if (!parts) return;
      const swing = walk ? Math.sin(t * 10) * 0.35 : 0;
      parts.armL.rotation.x = swing;
      parts.armR.rotation.x = -swing;
      parts.legL.rotation.x = -swing * 0.7;
      parts.legR.rotation.x = swing * 0.7;
      parts.head.position.y = 1.22 + (walk ? Math.abs(Math.sin(t * 10)) * 0.03 : 0);
    };

    if (this.player?.userData.type) animateHuman(this.player);
    this.npcs.forEach(animateHuman);

    const cat = this.berlioz?.visible ? this.berlioz : (this.gameMode === 'hide' ? this.player : null);
    if (cat?.userData.tail) {
      cat.userData.tail.rotation.z = Math.sin(t * 5) * 0.35;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new BerliozHunt();
});