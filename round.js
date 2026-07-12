// 2026.7.10
// round.js - orbital ROUND sound page

import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';
import { createSceneCameraRenderer } from './core/scene.js';
import { createLoadingManager } from './core/loadingScreen.js';
import { createPsyAudioGraph } from './audio/psyAudio.js';

const TRACKS = [
  { id: 'round', label: 'ROUND', url: 'audio/round.mp3', color: 0xd9e6ff },
  { id: 'round_dry', label: 'DRY', url: 'audio/round_dry.mp3', color: 0xc8c8c8 },
  { id: 'round_roomy', label: 'ROOMY', url: 'audio/round_roomy.mp3', color: 0x95d7ff },
];
const DEFAULT_TRACK = 'round';
const DRY_TRACK = 'round_dry';
const CROSSFADE_SEC = 2.4;

const { scene, camera, renderer } = createSceneCameraRenderer(THREE, { exposure: 0.86, far: 1800 });
const loadingManager = createLoadingManager(THREE, renderer, { title: 'LOADING ROUND' });
document.getElementById('round-initial-loading')?.remove();
loadingManager.itemStart('round-scene');
renderer.setClearColor(0x02040f, 1);
camera.position.set(0, 0, 22);
camera.lookAt(0, 0, 0);
scene.fog = new THREE.FogExp2(0x02040f, 0.024);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const mainButton = document.getElementById('round-main-button');
const stopButton = document.getElementById('round-stop-button');

function createStarField() {
  const starCount = 1200;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const radius = 260 + Math.random() * 1500;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i * 3 + 1] = Math.cos(phi) * radius * 0.55;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xdff8ff,
    size: 1.6,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Points(geo, mat);
}

const starField = createStarField();
scene.add(starField);

const pieNebula = new THREE.Mesh(
  new THREE.TorusKnotGeometry(34, 7, 180, 18),
  new THREE.MeshBasicMaterial({
    color: 0xff66cc,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    fog: false,
  })
);
pieNebula.position.set(0, -4, -28);
pieNebula.scale.set(1.5, 0.62, 1.5);
scene.add(pieNebula);

const hemiLight = new THREE.HemisphereLight(0xd7e8ff, 0x050611, 1.25);
scene.add(hemiLight);
const centerLight = new THREE.PointLight(0xdbe7ff, 8, 46);
centerLight.position.set(0, 0, 8);
scene.add(centerLight);

const orbitRoot = new THREE.Group();
orbitRoot.visible = false;
scene.add(orbitRoot);

const roundObjects = [];
const orbitLines = [];
let activeTrackId = DEFAULT_TRACK;
let hasStarted = false;
let isOrbiting = false;
let elapsed = 0;
let revealProgress = 0;
let roundModeProgress = 0;

const {
  actx,
  bgmElements,
  setBgmVariant,
  playBgmElements,
  pauseBgmElements,
  isBgmPlaying,
} = createPsyAudioGraph({
  bgmURL: 'audio/round.mp3',
  bgmTracks: TRACKS,
  initialBgmTrackId: DEFAULT_TRACK,
});
setBgmVariant(DEFAULT_TRACK, 0);

function createOrbitLine(radiusX, radiusY, tilt, color) {
  const points = [];
  for (let i = 0; i <= 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radiusX, Math.sin(a) * radiusY, 0));
  }
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.2 })
  );
  line.rotation.set(tilt.x, tilt.y, tilt.z);
  line.scale.setScalar(0.001);
  orbitRoot.add(line);
  orbitLines.push(line);
}

function createRoundObject(index, config) {
  createOrbitLine(config.radiusX, config.radiusY, config.tilt, config.color);

  const group = new THREE.Group();
  group.userData = {
    isRoundObject: true,
    trackId: config.trackId,
    phase: config.phase,
    speed: config.speed,
    radiusX: config.radiusX,
    radiusY: config.radiusY,
    tilt: config.tilt,
    baseScale: config.scale,
    currentSpread: 0,
  };

  const body = new THREE.Mesh(
    index % 3 === 0
      ? new THREE.SphereGeometry(0.42, 32, 16)
      : index % 3 === 1
        ? new THREE.IcosahedronGeometry(0.46, 1)
        : new THREE.TorusGeometry(0.36, 0.12, 16, 48),
    new THREE.MeshStandardMaterial({
      color: config.color,
      emissive: config.color,
      emissiveIntensity: 0.28,
      metalness: 0.18,
      roughness: 0.34,
    })
  );
  body.userData.roundRoot = group;
  group.add(body);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 24, 12),
    new THREE.MeshBasicMaterial({ color: config.color, transparent: true, opacity: 0.09, depthWrite: false })
  );
  halo.userData.roundRoot = group;
  group.add(halo);

  orbitRoot.add(group);
  group.position.set(0, 0, 0);
  group.scale.setScalar(0.001);
  roundObjects.push(group);
}

const orbitConfigs = [
  { radiusX: 3.2, radiusY: 0.95, phase: 0.1, speed: 0.42, scale: 1.0, tilt: new THREE.Euler(0.22, 0.04, 0.08), trackId: 'round', color: 0xd9e6ff },
  { radiusX: 4.7, radiusY: 1.4, phase: 1.7, speed: -0.32, scale: 0.84, tilt: new THREE.Euler(-0.18, 0.12, -0.18), trackId: 'round_dry', color: 0xc8c8c8 },
  { radiusX: 6.1, radiusY: 1.95, phase: 3.0, speed: 0.28, scale: 1.12, tilt: new THREE.Euler(0.34, -0.2, 0.2), trackId: 'round_roomy', color: 0x95d7ff },
  { radiusX: 7.3, radiusY: 2.55, phase: 4.2, speed: -0.22, scale: 0.74, tilt: new THREE.Euler(-0.26, -0.08, 0.34), trackId: 'round', color: 0xf0f2ff },
  { radiusX: 8.8, radiusY: 3.1, phase: 5.4, speed: 0.18, scale: 0.92, tilt: new THREE.Euler(0.14, 0.28, -0.28), trackId: 'round_dry', color: 0xa8a8a8 },
  { radiusX: 10.1, radiusY: 3.7, phase: 2.4, speed: -0.15, scale: 1.06, tilt: new THREE.Euler(-0.34, 0.18, 0.16), trackId: 'round_roomy', color: 0x75c7ff },
];
orbitConfigs.forEach((config, index) => createRoundObject(index, config));


const samsaraConfig = {
  radius: 3.35,
  rotationSpeed: 0.035,
  objectScale: 0.46,
  particleCount: 84,
  satelliteSpeed: 0.42,
  desktopPosition: new THREE.Vector3(-7.4, 2.2, -13.5),
  mobilePosition: new THREE.Vector3(-3.9, 3.25, -14.5),
  desktopScale: 0.88,
  mobileScale: 0.54,
};

function createSamsaraRing(radius, tilt, color, opacity = 0.18) {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
  const points = curve.getPoints(144).map((point) => new THREE.Vector3(point.x, point.y, 0));
  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  ring.rotation.set(tilt.x, tilt.y, tilt.z);
  return ring;
}

function createRealmObject(realm, shared) {
  const group = new THREE.Group();
  group.userData = { realmName: realm.name, baseScale: realm.scale, phase: realm.phase };

  const material = realm.material.clone();
  const haloMaterial = new THREE.MeshBasicMaterial({ color: realm.halo, transparent: true, opacity: realm.haloOpacity, depthWrite: false });
  realm.meshes.forEach(({ geometry, position, rotation, scale }) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.rotation.copy(rotation);
    mesh.scale.copy(scale);
    group.add(mesh);
  });

  const halo = new THREE.Mesh(shared.haloGeometry, haloMaterial);
  halo.scale.copy(realm.haloScale);
  group.add(halo);

  const satellite = new THREE.Mesh(shared.satelliteGeometry, realm.satelliteMaterial.clone());
  satellite.userData = { phase: realm.phase, radius: realm.satelliteRadius, speed: realm.satelliteSpeed };
  group.add(satellite);
  group.userData.satellite = satellite;
  return group;
}

function createSixRealms(shared) {
  const standard = ({ color, emissive, intensity, metalness = 0.1, roughness = 0.45 }) => new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    metalness,
    roughness,
    transparent: true,
    opacity: 0.92,
  });

  const realms = [
    {
      name: 'deva', phase: 0, scale: 0.92, halo: 0xdfffff, haloOpacity: 0.18, haloScale: new THREE.Vector3(0.88, 0.88, 0.88), satelliteRadius: 0.62, satelliteSpeed: 1.2,
      material: standard({ color: 0xdfffff, emissive: 0x9fffff, intensity: 0.5, roughness: 0.18 }), satelliteMaterial: new THREE.MeshBasicMaterial({ color: 0xeaffff }),
      meshes: [{ geometry: shared.octaGeometry, position: new THREE.Vector3(0, 0.08, 0), rotation: new THREE.Euler(0.42, 0.1, 0.78), scale: new THREE.Vector3(0.58, 0.78, 0.58) }],
    },
    {
      name: 'human', phase: Math.PI / 3, scale: 0.86, halo: 0xffe0aa, haloOpacity: 0.09, haloScale: new THREE.Vector3(0.74, 0.74, 0.74), satelliteRadius: 0.54, satelliteSpeed: 0.86,
      material: standard({ color: 0xf0c38a, emissive: 0x6a4a25, intensity: 0.18, metalness: 0.22 }), satelliteMaterial: new THREE.MeshBasicMaterial({ color: 0xffd79a }),
      meshes: [{ geometry: shared.boxGeometry, position: new THREE.Vector3(0, 0, 0), rotation: new THREE.Euler(0.22, 0.58, 0.12), scale: new THREE.Vector3(0.58, 0.58, 0.58) }],
    },
    {
      name: 'asura', phase: Math.PI * 2 / 3, scale: 0.88, halo: 0xff5a9d, haloOpacity: 0.13, haloScale: new THREE.Vector3(0.82, 0.82, 0.82), satelliteRadius: 0.7, satelliteSpeed: -1.45,
      material: standard({ color: 0xff4b9c, emissive: 0xff1148, intensity: 0.46, metalness: 0.34, roughness: 0.36 }), satelliteMaterial: new THREE.MeshBasicMaterial({ color: 0xff80c0 }),
      meshes: [
        { geometry: shared.coneGeometry, position: new THREE.Vector3(0.12, 0, 0), rotation: new THREE.Euler(0, 0, -0.45), scale: new THREE.Vector3(0.38, 0.9, 0.38) },
        { geometry: shared.coneGeometry, position: new THREE.Vector3(-0.12, 0, 0), rotation: new THREE.Euler(Math.PI, 0.25, 0.42), scale: new THREE.Vector3(0.32, 0.72, 0.32) },
      ],
    },
    {
      name: 'animal', phase: Math.PI, scale: 0.9, halo: 0x78d28a, haloOpacity: 0.08, haloScale: new THREE.Vector3(0.86, 0.52, 0.72), satelliteRadius: 0.48, satelliteSpeed: 0.74,
      material: standard({ color: 0x6f9f65, emissive: 0x183b18, intensity: 0.24, roughness: 0.68 }), satelliteMaterial: new THREE.MeshBasicMaterial({ color: 0xa8e49a }),
      meshes: [{ geometry: shared.dodecaGeometry, position: new THREE.Vector3(0, -0.18, 0), rotation: new THREE.Euler(0.12, 0.8, -0.08), scale: new THREE.Vector3(0.72, 0.42, 0.52) }],
    },
    {
      name: 'preta', phase: Math.PI * 4 / 3, scale: 0.88, halo: 0xb690ff, haloOpacity: 0.1, haloScale: new THREE.Vector3(0.52, 1.04, 0.52), satelliteRadius: 0.58, satelliteSpeed: -0.96,
      material: standard({ color: 0x8d72d9, emissive: 0x2c145a, intensity: 0.3, roughness: 0.5 }), satelliteMaterial: new THREE.MeshBasicMaterial({ color: 0xc7a8ff }),
      meshes: [{ geometry: shared.torusGeometry, position: new THREE.Vector3(0, 0, 0), rotation: new THREE.Euler(Math.PI / 2, 0, 0), scale: new THREE.Vector3(0.5, 0.5, 1.65) }],
    },
    {
      name: 'hell', phase: Math.PI * 5 / 3, scale: 0.92, halo: 0xff2211, haloOpacity: 0.16, haloScale: new THREE.Vector3(0.76, 0.76, 0.76), satelliteRadius: 0.52, satelliteSpeed: 1.05,
      material: standard({ color: 0x16080a, emissive: 0xaa1608, intensity: 0.56, metalness: 0.26, roughness: 0.72 }), satelliteMaterial: new THREE.MeshBasicMaterial({ color: 0xff3b22 }),
      meshes: [{ geometry: shared.icosaGeometry, position: new THREE.Vector3(0, -0.04, 0), rotation: new THREE.Euler(0.3, 0.2, 0.2), scale: new THREE.Vector3(0.62, 0.62, 0.62) }],
    },
  ];

  return realms.map((realm) => createRealmObject(realm, shared));
}

function createSamsaraOrbit() {
  const root = new THREE.Group();
  root.name = 'samsaraOrbit';
  root.position.copy(samsaraConfig.desktopPosition);
  root.rotation.set(-0.08, 0.34, -0.12);
  root.scale.setScalar(samsaraConfig.desktopScale);

  const wheel = new THREE.Group();
  root.add(wheel);

  const shared = {
    octaGeometry: new THREE.OctahedronGeometry(0.55, 0),
    boxGeometry: new THREE.BoxGeometry(0.72, 0.72, 0.72),
    coneGeometry: new THREE.ConeGeometry(0.38, 0.92, 5, 1),
    dodecaGeometry: new THREE.DodecahedronGeometry(0.58, 0),
    torusGeometry: new THREE.TorusGeometry(0.34, 0.085, 12, 42),
    icosaGeometry: new THREE.IcosahedronGeometry(0.58, 1),
    haloGeometry: new THREE.SphereGeometry(0.72, 18, 10),
    satelliteGeometry: new THREE.SphereGeometry(0.055, 10, 6),
  };

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.43, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xff8f35, emissiveIntensity: 0.78, roughness: 0.28 })
  );
  const coreAura = new THREE.Mesh(
    new THREE.SphereGeometry(0.86, 24, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb84f, transparent: true, opacity: 0.12, depthWrite: false })
  );
  root.add(core, coreAura);

  wheel.add(createSamsaraRing(samsaraConfig.radius, new THREE.Euler(0, 0, 0), 0x9deeff, 0.24));
  root.add(createSamsaraRing(samsaraConfig.radius * 0.78, new THREE.Euler(0.72, 0.1, 0.18), 0x66ddff, 0.13));
  root.add(createSamsaraRing(samsaraConfig.radius * 1.08, new THREE.Euler(-0.54, 0.26, -0.2), 0xff66cc, 0.11));
  root.add(createSamsaraRing(samsaraConfig.radius * 0.52, new THREE.Euler(1.22, -0.16, 0.4), 0xffd889, 0.1));

  const particlePositions = new Float32Array(samsaraConfig.particleCount * 3);
  for (let i = 0; i < samsaraConfig.particleCount; i++) {
    const angle = (i / samsaraConfig.particleCount) * Math.PI * 2;
    const radius = 0.65 + Math.random() * 1.05;
    particlePositions[i * 3] = Math.cos(angle) * radius;
    particlePositions[i * 3 + 1] = Math.sin(angle) * radius * 0.62;
    particlePositions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(0.42);
  }
  const coreParticles = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(particlePositions, 3)),
    new THREE.PointsMaterial({ color: 0xffdf9a, size: 0.035, transparent: true, opacity: 0.62, depthWrite: false })
  );
  root.add(coreParticles);

  const realms = createSixRealms(shared);
  realms.forEach((realm) => {
    wheel.add(realm);
    realm.position.set(
      Math.cos(realm.userData.phase) * samsaraConfig.radius,
      Math.sin(realm.userData.phase) * samsaraConfig.radius,
      0
    );
    realm.scale.setScalar(samsaraConfig.objectScale * realm.userData.baseScale);
  });

  root.userData = { wheel, realms, core, coreAura, coreParticles };
  return root;
}

const samsaraOrbit = createSamsaraOrbit();
scene.add(samsaraOrbit);

function updateSamsaraLayout() {
  const isMobile = window.innerWidth < 700;
  samsaraOrbit.position.copy(isMobile ? samsaraConfig.mobilePosition : samsaraConfig.desktopPosition);
  samsaraOrbit.scale.setScalar(isMobile ? samsaraConfig.mobileScale : samsaraConfig.desktopScale);
}
updateSamsaraLayout();

const core = new THREE.Mesh(
  new THREE.SphereGeometry(0.32, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 })
);
orbitRoot.add(core);

function updateButtonState() {
  mainButton.textContent = hasStarted ? 'ROUND' : 'SOUND';
  stopButton.classList.toggle('is-visible', hasStarted);
  stopButton.setAttribute('aria-hidden', String(!hasStarted));
  stopButton.tabIndex = hasStarted ? 0 : -1;
  mainButton.setAttribute('aria-pressed', String(isOrbiting));
}

function selectTrack(trackId, fadeSec = CROSSFADE_SEC) {
  if (!TRACKS.some((track) => track.id === trackId)) return;
  activeTrackId = trackId;
  setBgmVariant(trackId, fadeSec);
  roundObjects.forEach((obj) => {
    const active = obj.userData.trackId === trackId;
    obj.children.forEach((child) => {
      if (child.material?.emissiveIntensity !== undefined) child.material.emissiveIntensity = active ? 0.62 : 0.22;
      if (child.material?.opacity !== undefined) child.material.opacity = active ? 0.18 : 0.08;
    });
  });
}

async function startSound() {
  if (actx.state !== 'running') await actx.resume();
  hasStarted = true;
  isOrbiting = false;
  orbitRoot.visible = true;
  revealProgress = 0;
  roundModeProgress = 0;
  roundObjects.forEach((obj) => {
    obj.userData.currentSpread = 0;
    obj.position.set(0, 0, 0);
    obj.scale.setScalar(0.001);
  });
  orbitLines.forEach((line) => line.scale.setScalar(0.001));
  selectTrack(DEFAULT_TRACK, 0);
  await playBgmElements();
  updateButtonState();
}

function startRound() {
  if (!hasStarted) {
    startSound().then(() => startRound()).catch(console.warn);
    return;
  }
  isOrbiting = true;
  selectTrack(DRY_TRACK, CROSSFADE_SEC);
  updateButtonState();
}

function stopRound() {
  pauseBgmElements();
  hasStarted = false;
  isOrbiting = false;
  orbitRoot.visible = false;
  revealProgress = 0;
  roundModeProgress = 0;
  roundObjects.forEach((obj) => {
    obj.userData.currentSpread = 0;
    obj.position.set(0, 0, 0);
    obj.scale.setScalar(0.001);
  });
  orbitLines.forEach((line) => line.scale.setScalar(0.001));
  selectTrack(DEFAULT_TRACK, 0);
  updateButtonState();
}

mainButton.addEventListener('click', () => {
  if (!hasStarted || !isBgmPlaying()) {
    startSound().catch(console.warn);
  } else {
    startRound();
  }
});
stopButton.addEventListener('click', stopRound);

function getRoundRoot(object) {
  let current = object;
  while (current) {
    if (current.userData?.isRoundObject) return current;
    if (current.userData?.roundRoot) return current.userData.roundRoot;
    current = current.parent;
  }
  return null;
}

window.addEventListener('click', (event) => {
  if (!hasStarted) return;
  if (event.target === mainButton || event.target === stopButton) return;
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(roundObjects, true);
  const root = hits.length ? getRoundRoot(hits[0].object) : null;
  if (root) selectTrack(root.userData.trackId);
});

function updateRoundObjects(delta) {
  elapsed += delta;
  const revealTarget = hasStarted ? 1 : 0;
  const roundTarget = isOrbiting ? 1 : 0;
  revealProgress = THREE.MathUtils.damp(revealProgress, revealTarget, 1.55, delta);
  roundModeProgress = THREE.MathUtils.damp(roundModeProgress, roundTarget, 1.35, delta);

  const revealEase = revealProgress * revealProgress * (3 - 2 * revealProgress);
  const roundEase = roundModeProgress * roundModeProgress * (3 - 2 * roundModeProgress);
  const spreadBreath = 1 + Math.sin(elapsed * 0.9) * 0.018 * revealEase;
  const spinBoost = THREE.MathUtils.lerp(0.45, 4.6, roundEase);
  const rootSpin = THREE.MathUtils.lerp(0.025, 0.18, roundEase);
  orbitRoot.rotation.z += delta * rootSpin;
  core.scale.setScalar((0.35 + revealEase * 0.65) * (1 + Math.sin(elapsed * 2.2) * (0.1 + roundEase * 0.12)));
  core.material.opacity = 0.18 + revealEase * (0.48 + roundEase * 0.18);
  centerLight.intensity = THREE.MathUtils.lerp(3.2, 10 + Math.sin(elapsed * 5) * 2.2, roundEase) * (0.35 + revealEase * 0.65);

  roundObjects.forEach((obj, index) => {
    const data = obj.userData;
    const orbit = data.phase + elapsed * data.speed * spinBoost;
    const stagger = THREE.MathUtils.clamp((revealEase - index * 0.055) / 0.72, 0, 1);
    const staggerEase = stagger * stagger * (3 - 2 * stagger);
    const roundExpansion = 1 + roundEase * (0.28 + index * 0.022);
    const spread = staggerEase * roundExpansion * spreadBreath;
    data.currentSpread = THREE.MathUtils.damp(data.currentSpread, spread, 3.4, delta);

    const local = new THREE.Vector3(
      Math.cos(orbit) * data.radiusX * data.currentSpread,
      Math.sin(orbit) * data.radiusY * data.currentSpread,
      Math.sin(orbit * 0.7 + index) * roundEase * 0.52
    );
    local.applyEuler(data.tilt);
    obj.position.copy(local);
    obj.rotation.x += delta * (0.28 + index * 0.03) * spinBoost;
    obj.rotation.y += delta * (0.36 + index * 0.02) * spinBoost;
    const activePulse = data.trackId === activeTrackId ? 0.18 + Math.sin(elapsed * 5.5) * 0.08 : 0;
    const roundPulse = roundEase * (0.22 + Math.sin(elapsed * 3.2 + index) * 0.06);
    obj.scale.setScalar(Math.max(0.001, data.baseScale * staggerEase * (1 + activePulse + roundPulse)));
  });

  orbitLines.forEach((line, index) => {
    const stagger = THREE.MathUtils.clamp((revealEase - index * 0.045) / 0.7, 0, 1);
    const staggerEase = stagger * stagger * (3 - 2 * stagger);
    const roundExpansion = 1 + roundEase * (0.28 + index * 0.022);
    line.scale.setScalar(Math.max(0.001, staggerEase * roundExpansion * spreadBreath));
    line.material.opacity = staggerEase * THREE.MathUtils.lerp(0.14, 0.28 + Math.sin(elapsed * 2 + index) * 0.08, roundEase);
  });
}


function updateSamsaraOrbit(delta) {
  const data = samsaraOrbit.userData;
  const samsaraTime = clock.elapsedTime;
  const cycle = samsaraTime * samsaraConfig.rotationSpeed;
  data.wheel.rotation.z += delta * samsaraConfig.rotationSpeed;
  data.core.rotation.y += delta * 0.18;
  data.core.scale.setScalar(1 + Math.sin(samsaraTime * 1.35) * 0.06);
  data.core.material.emissiveIntensity = 0.62 + Math.sin(samsaraTime * 1.8) * 0.12 + (hasStarted ? 0.12 : 0);
  data.coreAura.scale.setScalar(1 + Math.sin(samsaraTime * 1.1) * 0.08);
  data.coreAura.material.opacity = 0.09 + Math.sin(samsaraTime * 1.4) * 0.025 + (hasStarted ? 0.025 : 0);
  data.coreParticles.rotation.z -= delta * 0.16;
  data.coreParticles.rotation.x = Math.sin(cycle * 2.1) * 0.18;

  const inverseWheelQuaternion = data.wheel.quaternion.clone().invert();
  data.realms.forEach((realm, index) => {
    const phase = realm.userData.phase;
    const pulse = 1 + Math.sin(samsaraTime * (0.8 + index * 0.09) + phase) * (0.025 + index * 0.004);
    realm.quaternion.copy(inverseWheelQuaternion);
    realm.scale.setScalar(samsaraConfig.objectScale * realm.userData.baseScale * pulse);
    realm.position.set(
      Math.cos(phase) * samsaraConfig.radius,
      Math.sin(phase) * samsaraConfig.radius,
      Math.sin(samsaraTime * 0.52 + phase) * 0.12
    );

    if (realm.userData.realmName === 'asura') {
      realm.position.x += Math.sin(samsaraTime * 8.5) * 0.04;
      realm.rotation.z += Math.sin(samsaraTime * 6.2) * 0.004;
    } else if (realm.userData.realmName === 'preta') {
      realm.rotation.y += delta * 0.22;
    } else if (realm.userData.realmName === 'deva') {
      realm.rotation.z += delta * 0.08;
    }

    const satellite = realm.userData.satellite;
    const satAngle = samsaraTime * samsaraConfig.satelliteSpeed * satellite.userData.speed + satellite.userData.phase;
    satellite.position.set(
      Math.cos(satAngle) * satellite.userData.radius,
      Math.sin(satAngle) * satellite.userData.radius * 0.58,
      Math.sin(satAngle * 1.7) * 0.08
    );
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateSamsaraLayout();
}
window.addEventListener('resize', onResize);

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  starField.rotation.y += delta * 0.006;
  pieNebula.rotation.x += delta * 0.015;
  pieNebula.rotation.y += delta * 0.01;
  if (orbitRoot.visible) updateRoundObjects(delta);
  updateSamsaraOrbit(delta);
  renderer.render(scene, camera);
}
updateButtonState();
requestAnimationFrame(() => loadingManager.itemEnd('round-scene'));
animate();

window.addEventListener('beforeunload', () => {
  try { pauseBgmElements(); } catch {}
  bgmElements.forEach(({ element }) => element.pause());
});
