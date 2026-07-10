// 2026.7.10
// round.js - orbital ROUND sound page

import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';
import { createSceneCameraRenderer } from './core/scene.js';
import { createPsyAudioGraph } from './audio/psyAudio.js';

const TRACKS = [
  { id: 'round', label: 'ROUND', url: 'audio/round.mp3', color: 0xd9e6ff },
  { id: 'round_dry', label: 'DRY', url: 'audio/round_dry.mp3', color: 0xc8c8c8 },
  { id: 'round_roomy', label: 'ROOMY', url: 'audio/round_roomy.mp3', color: 0x95d7ff },
];
const DEFAULT_TRACK = 'round';
const DRY_TRACK = 'round_dry';
const CROSSFADE_SEC = 2.4;

const { scene, camera, renderer } = createSceneCameraRenderer(THREE, { exposure: 0.86 });
renderer.setClearColor(0x02030a, 1);
camera.position.set(0, 0, 22);
camera.lookAt(0, 0, 0);
scene.fog = new THREE.FogExp2(0x02030a, 0.024);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const mainButton = document.getElementById('round-main-button');
const stopButton = document.getElementById('round-stop-button');

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
  stopButton.hidden = !hasStarted;
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
  const spinBoost = isOrbiting ? 4.6 : 0.45;
  orbitRoot.rotation.z += delta * (isOrbiting ? 0.18 : 0.025);
  core.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.16);
  centerLight.intensity = isOrbiting ? 10 + Math.sin(elapsed * 5) * 2.2 : 5.5;

  roundObjects.forEach((obj, index) => {
    const data = obj.userData;
    const orbit = data.phase + elapsed * data.speed * spinBoost;
    const local = new THREE.Vector3(Math.cos(orbit) * data.radiusX, Math.sin(orbit) * data.radiusY, 0);
    local.applyEuler(data.tilt);
    obj.position.copy(local);
    obj.rotation.x += delta * (0.28 + index * 0.03) * spinBoost;
    obj.rotation.y += delta * (0.36 + index * 0.02) * spinBoost;
    const activePulse = data.trackId === activeTrackId ? 0.22 + Math.sin(elapsed * 5.5) * 0.08 : 0;
    obj.scale.setScalar(data.baseScale * (1 + activePulse));
  });

  orbitLines.forEach((line, index) => {
    line.material.opacity = isOrbiting ? 0.28 + Math.sin(elapsed * 2 + index) * 0.08 : 0.14;
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
  if (orbitRoot.visible) updateRoundObjects(delta);
  renderer.render(scene, camera);
}
updateButtonState();
animate();

window.addEventListener('beforeunload', () => {
  try { pauseBgmElements(); } catch {}
  bgmElements.forEach(({ element }) => element.pause());
});
