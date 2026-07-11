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

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  starField.rotation.y += delta * 0.006;
  pieNebula.rotation.x += delta * 0.015;
  pieNebula.rotation.y += delta * 0.01;
  if (orbitRoot.visible) updateRoundObjects(delta);
  renderer.render(scene, camera);
}
updateButtonState();
requestAnimationFrame(() => loadingManager.itemEnd('round-scene'));
animate();

window.addEventListener('beforeunload', () => {
  try { pauseBgmElements(); } catch {}
  bgmElements.forEach(({ element }) => element.pause());
});
