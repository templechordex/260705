// round2 page: SOUND controls and round visual copied from round.js
import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';
import { FontLoader } from 'https://unpkg.com/three@0.180.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://unpkg.com/three@0.180.0/examples/jsm/geometries/TextGeometry.js';

import { createSceneCameraRenderer } from './core/scene.js';
import { createLoadingManager } from './core/loadingScreen.js';
import { createSignBoardPlane as createSharedSignBoardPlane, attachSignText as attachSharedSignText } from './ui/signBoard.js';
import { createPsyAudioGraph } from './audio/psyAudio.js';

const { scene, camera, renderer } = createSceneCameraRenderer(THREE, {
  exposure: 0.9,
  cameraPosition: [0, 0, 24],
});
const loadingManager = createLoadingManager(THREE, renderer, { title: 'LOADING ROUND2' });
renderer.toneMapping = THREE.CineonToneMapping;
camera.lookAt(0, 0, 0);
renderer.domElement.style.touchAction = 'none';

scene.fog = new THREE.FogExp2(0x050510, 0.012);
scene.add(new THREE.HemisphereLight(0x9fdcff, 0x101827, 1.25));
const dirLight = new THREE.DirectionalLight(0xd8f7ff, 4.2);
dirLight.position.set(18, 24, 18);
scene.add(dirLight);
const fillLight = new THREE.PointLight(0x66ccff, 2.3, 140);
fillLight.position.set(-14, 8, 12);
scene.add(fillLight);
const backLight = new THREE.PointLight(0xff66cc, 2.4, 140);
backLight.position.set(12, -8, -18);
scene.add(backLight);

const _v2 = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
const textMatWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
const fontLoader = new FontLoader(loadingManager);
let uiFont = null;

function createSignBoardPlane(options = {}) {
  return createSharedSignBoardPlane(THREE, options);
}

function attachSignText(signMesh, text, size, material = textMatWhite, zOffset = 2) {
  return attachSharedSignText(THREE, TextGeometry, signMesh, uiFont, text, size, material, zOffset);
}

fontLoader.load('fonts/dela.json', (font) => {
  uiFont = font;
  buildPlaySoundText();
  buildSoundVariantTexts();
}, undefined, console.error);

// Streaming links: artist distribution pages.
const STREAMING_LINKS = {
  spotify: 'https://open.spotify.com/artist/31FfWVdW1IUmPgLoRbSGpS',
  apple: 'https://music.apple.com/us/artist/anji-teraoka/1538384131',
};

function createStreamingButtons() {
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position: fixed;
    z-index: 10;
    left: 50%;
    bottom: max(26px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    justify-content: center;
    pointer-events: auto;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  const buttons = [
    ['Spotify', STREAMING_LINKS.spotify, 'linear-gradient(135deg, #1db954, #0b6b34)'],
    ['Apple Music', STREAMING_LINKS.apple, 'linear-gradient(135deg, #fa57c1, #674eff)'],
  ];
  buttons.forEach(([label, href, bg]) => {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    a.style.cssText = `
      min-width: 146px;
      padding: 13px 18px;
      border: 1px solid rgba(255,255,255,0.72);
      border-radius: 999px;
      color: #fff;
      background: ${bg};
      box-shadow: 0 0 24px rgba(102, 221, 255, 0.32), inset 0 0 18px rgba(255,255,255,0.14);
      text-align: center;
      text-decoration: none;
      font-weight: 800;
      letter-spacing: 0.03em;
    `;
    wrap.appendChild(a);
  });
  document.body.appendChild(wrap);
}
createStreamingButtons();

// SOUND button moved to the world origin. Other copied sound objects keep their relative offsets.
const signPlaySound = createSignBoardPlane({
  width: 8.8, height: 2.5, bg: 'rgba(8,18,32,0.28)', glow: '#ff66cc'
});
signPlaySound.material.opacity = 0.72;
signPlaySound.position.set(0, 0, 0);
scene.add(signPlaySound);

// round2 intentionally removes the round page headphone object so the surreal orbital wheel can become the main visual.

const soundProgressConfig = { width: 9.4, height: 0.16 };
const soundProgressGroup = new THREE.Group();
soundProgressGroup.position.set(signPlaySound.position.x, signPlaySound.position.y + 6.2, signPlaySound.position.z + 0.22);
scene.add(soundProgressGroup);
const soundProgressTrack = new THREE.Mesh(
  new THREE.PlaneGeometry(soundProgressConfig.width, soundProgressConfig.height),
  new THREE.MeshBasicMaterial({ color: 0x1b2532, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide })
);
soundProgressGroup.add(soundProgressTrack);
const soundProgressFill = new THREE.Mesh(
  new THREE.PlaneGeometry(soundProgressConfig.width, soundProgressConfig.height),
  new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
);
soundProgressFill.position.z = 0.02;
soundProgressFill.scale.x = 0.0001;
soundProgressGroup.add(soundProgressFill);

const soundVariantOptions = [
  { id: 'round', label: 'Original', url: 'audio/round.mp3' },
  { id: 'round_dry', label: 'Dry', url: 'audio/round_dry.mp3' },
  { id: 'round_roomy', label: 'Basic', url: 'audio/round_roomy.mp3' },
];
const DEFAULT_SOUND_VARIANT = 'round';
const SOUND_VARIANT_CROSSFADE_SEC = 3.2;
let activeSoundVariant = DEFAULT_SOUND_VARIANT;
let isSoundPlaying = false;

const soundVariantButtons = soundVariantOptions.map((option, index) => {
  const button = createSignBoardPlane({
    width: 5.6,
    height: 1.7,
    bg: 'rgba(8,18,32,0.42)',
    glow: index === 0 ? '#ff66cc' : '#66ddff',
  });
  button.position.set(signPlaySound.position.x + (index - 1) * 6.1, signPlaySound.position.y + 8.05, signPlaySound.position.z);
  button.userData.soundVariantId = option.id;
  scene.add(button);
  return button;
});
let soundVariantTexts = [];
function updateSoundVariantButtons() {
  soundVariantButtons.forEach((button) => {
    const active = button.userData.soundVariantId === activeSoundVariant;
    button.material.opacity = active ? 0.86 : 0.54;
    button.scale.setScalar(1.0);
  });
}
function setSoundVariantButtonsVisible(visible) {
  soundVariantButtons.forEach((button) => { button.visible = visible; });
}
function buildSoundVariantTexts() {
  if (!uiFont || soundVariantTexts.length) return;
  soundVariantTexts = soundVariantButtons.map((button, index) => attachSignText(button, soundVariantOptions[index].label, 0.5, textMatWhite, 0.05));
  setSoundVariantButtonsVisible(isSoundPlaying);
}
updateSoundVariantButtons();
setSoundVariantButtonsVisible(false);

function updateSoundProgressBar() {
  const currentBgmElement = getActiveBgmElement?.() ?? psyElement;
  const duration = Number.isFinite(currentBgmElement.duration) ? currentBgmElement.duration : 0;
  const progress = duration > 0 ? THREE.MathUtils.clamp(currentBgmElement.currentTime / duration, 0, 1) : 0;
  soundProgressFill.scale.x = Math.max(progress, 0.0001);
  soundProgressFill.position.x = (progress - 1) * soundProgressConfig.width * 0.5;
}

const ROUND_CONFIG = {
  position: { x: signPlaySound.position.x, y: signPlaySound.position.y, z: signPlaySound.position.z - 1.15 },
  scale: 1.0,
  activeScale: 5.4,
  scaleUpSpeed: 1.1,
  resetScaleSpeed: 1.6,
  particleCount: window.innerWidth < 768 ? 54 : 96,
  ringCount: 6,
  fragmentCount: 12,
  animationSpeed: 1,
  centerGlowIntensity: 1.05,
};
const roundGroup = new THREE.Group();
roundGroup.position.set(ROUND_CONFIG.position.x, ROUND_CONFIG.position.y, ROUND_CONFIG.position.z);
roundGroup.scale.setScalar(ROUND_CONFIG.scale);
scene.add(roundGroup);

let roundAnimationTime = 0;
const roundRings = [];
const roundParticles = [];
const roundFragments = [];
let roundCore;
let roundCoreShell;
let roundMist;
let roundGlowLight;
let roundBasicShapesGroup;
let roundOrbitWheel;
let roundSpokesGroup;
let roundPlanetGroup;
let roundGateGroup;
const ROUND_DRY_GRAY = 0x9a9a9a;

function rememberRoundMaterialColor(material) {
  if (material?.color && material.userData.originalColor === undefined) material.userData.originalColor = material.color.getHex();
}
function setRoundMaterialDry(material, dry) {
  if (!material?.color) return;
  rememberRoundMaterialColor(material);
  material.color.setHex(dry ? ROUND_DRY_GRAY : material.userData.originalColor);
}
function createRoundVisual() {
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff4dd, transparent: true, opacity: 0.86 });
  roundCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), coreMat);
  roundGroup.add(roundCore);
  const shellMat = new THREE.MeshBasicMaterial({ color: 0xff77aa, transparent: true, opacity: 0.22, depthWrite: false, wireframe: true });
  roundCoreShell = new THREE.Mesh(new THREE.OctahedronGeometry(0.82, 2), shellMat);
  roundGroup.add(roundCoreShell);
  const mistMat = new THREE.MeshBasicMaterial({ color: 0x233052, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, wireframe: true });
  roundMist = new THREE.Mesh(new THREE.TorusKnotGeometry(2.22, 0.032, 180, 8, 2, 7), mistMat);
  roundMist.scale.set(1.14, 0.86, 0.58);
  roundGroup.add(roundMist);
  roundGlowLight = new THREE.PointLight(0xffc477, ROUND_CONFIG.centerGlowIntensity, 12);
  roundGlowLight.userData.originalColor = roundGlowLight.color.getHex();
  roundGlowLight.position.set(0, 0, 1.4);
  roundGroup.add(roundGlowLight);

  roundOrbitWheel = new THREE.Group();
  roundSpokesGroup = new THREE.Group();
  roundPlanetGroup = new THREE.Group();
  roundGateGroup = new THREE.Group();
  roundGroup.add(roundOrbitWheel, roundSpokesGroup, roundPlanetGroup, roundGateGroup);

  const ringColors = [0x6f5cff, 0xff6d9f, 0xffd166, 0x50f0d0, 0x8bd3ff, 0xffffff];
  for (let i = 0; i < ROUND_CONFIG.ringCount; i++) {
    const arc = Math.PI * 2;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1 + i * 0.32, 0.014 + i * 0.002, 8, 128, arc),
      new THREE.MeshBasicMaterial({ color: ringColors[i % ringColors.length], transparent: true, opacity: 0.3 + i * 0.04, depthWrite: false })
    );
    ring.rotation.set(THREE.MathUtils.degToRad(63 + i * 8), THREE.MathUtils.degToRad(i * 37), THREE.MathUtils.degToRad(i * 21));
    ring.userData.speed = (i % 2 === 0 ? 1 : -1) * (0.055 + i * 0.014);
    ring.userData.wobble = 0.16 + i * 0.035;
    roundRings.push(ring);
    roundOrbitWheel.add(ring);
  }

  const spokeMat = new THREE.MeshBasicMaterial({ color: 0xfff2b3, transparent: true, opacity: 0.48, depthWrite: false });
  const spokeGeo = new THREE.PlaneGeometry(0.018, 4.75);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(spokeGeo, spokeMat.clone());
    spoke.rotation.z = (Math.PI / 6) + i * (Math.PI / 3);
    spoke.userData.phase = i * 0.9;
    roundSpokesGroup.add(spoke);
  }

  const gateColors = [0x5522aa, 0x2266ff, 0x22ccaa, 0xf2d64b, 0xff8844, 0xff446e];
  for (let i = 0; i < 6; i++) {
    const gate = new THREE.Group();
    const angle = i * Math.PI / 3;
    const radius = 2.38;
    const gateMat = new THREE.MeshBasicMaterial({ color: gateColors[i], transparent: true, opacity: 0.64, depthWrite: false });
    const capsule = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 6, 24), gateMat);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.58), gateMat.clone());
    bar.position.y = -0.12;
    gate.add(capsule, bar);
    gate.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.32);
    gate.userData.angle = angle;
    gate.userData.radius = radius;
    gate.userData.phase = i * 1.13;
    roundGateGroup.add(gate);
  }

  const particleMat = new THREE.MeshBasicMaterial({ color: 0xf7fbff, transparent: true, opacity: 0.58, depthWrite: false });
  const particleGeo = new THREE.SphereGeometry(0.032, 8, 6);
  for (let i = 0; i < ROUND_CONFIG.particleCount; i++) {
    const p = new THREE.Mesh(particleGeo, particleMat);
    p.userData.phase = i * 2.399963;
    p.userData.radius = 1.0 + (i % 17) * 0.12;
    p.userData.speed = 0.055 + (i % 9) * 0.012;
    p.userData.incline = -0.55 + (i % 11) * 0.11;
    roundParticles.push(p);
    roundPlanetGroup.add(p);
  }
  const fragmentColors = [0xffd166, 0xff6d9f, 0x50f0d0, 0x6f5cff, 0xeeeeee];
  for (let i = 0; i < ROUND_CONFIG.fragmentCount; i++) {
    const frag = new THREE.Mesh(
      new THREE.ConeGeometry(0.08 + (i % 3) * 0.018, 0.28 + (i % 2) * 0.09, 5),
      new THREE.MeshBasicMaterial({ color: fragmentColors[i % fragmentColors.length], transparent: true, opacity: 0.62, depthWrite: false })
    );
    frag.userData.phase = i * 0.91;
    frag.userData.radiusX = 1.45 + (i % 4) * 0.34;
    frag.userData.radiusY = 0.58 + (i % 3) * 0.17;
    frag.userData.speed = 0.12 + (i % 5) * 0.025;
    frag.userData.tilt = THREE.MathUtils.degToRad(16 + i * 13);
    roundFragments.push(frag);
    roundPlanetGroup.add(frag);
  }
  roundBasicShapesGroup = new THREE.Group();
  roundBasicShapesGroup.visible = false;
  const basicShapeMat = new THREE.MeshBasicMaterial({ color: 0xf0f2f4, transparent: true, opacity: 0.74, depthWrite: false, side: THREE.DoubleSide });
  [
    { geo: new THREE.CircleGeometry(0.42, 48), x: -1.1 },
    { geo: new THREE.CircleGeometry(0.48, 3), x: 0 },
    { geo: new THREE.PlaneGeometry(0.82, 0.82), x: 1.1 },
  ].forEach(({ geo, x }, index) => {
    const shape = new THREE.Mesh(geo, basicShapeMat.clone());
    shape.position.set(x, 0, 0.18);
    shape.userData.phase = index * 2.1;
    roundBasicShapesGroup.add(shape);
  });
  roundGroup.add(roundBasicShapesGroup);
}
function updateRoundVisualMode() {
  const dry = activeSoundVariant === 'round_dry';
  const basic = activeSoundVariant === 'round_roomy';
  roundGroup.traverse((obj) => {
    if (!obj.isMesh) return;
    if (Array.isArray(obj.material)) obj.material.forEach((mat) => setRoundMaterialDry(mat, dry));
    else setRoundMaterialDry(obj.material, dry);
  });
  if (roundGlowLight) roundGlowLight.color.setHex(dry ? ROUND_DRY_GRAY : roundGlowLight.userData.originalColor);
  roundBasicShapesGroup.visible = basic;
  roundCore.visible = !basic;
  roundCoreShell.visible = !basic;
  roundMist.visible = !basic;
  roundRings.forEach((ring) => { ring.visible = !basic; });
  roundParticles.forEach((p) => { p.visible = !basic; });
  roundFragments.forEach((frag) => { frag.visible = !basic; });
  roundOrbitWheel.visible = !basic;
  roundSpokesGroup.visible = !basic;
  roundPlanetGroup.visible = !basic;
  roundGateGroup.visible = !basic;
}
function updateRoundAnimation(elapsedTime, deltaTime) {
  const slowPulse = Math.sin(elapsedTime * 0.75) * 0.5 + 0.5;
  const shellPulse = Math.sin(elapsedTime * 0.52 + 1.2) * 0.5 + 0.5;
  const mistPulse = Math.sin(elapsedTime * 0.33 + 2.1) * 0.5 + 0.5;
  const targetScale = ROUND_CONFIG.activeScale + slowPulse * 0.24;
  const scaleStep = Math.min(1, deltaTime * ROUND_CONFIG.scaleUpSpeed);
  roundGroup.scale.setScalar(THREE.MathUtils.lerp(roundGroup.scale.x, targetScale, scaleStep));
  roundCore.scale.setScalar(0.9 + slowPulse * 0.14);
  roundCore.material.opacity = 0.58 + slowPulse * 0.22;
  roundCoreShell.scale.setScalar(0.92 + shellPulse * 0.28);
  roundCoreShell.material.opacity = 0.09 + shellPulse * 0.12;
  roundMist.rotation.y += deltaTime * 0.045;
  roundMist.rotation.z -= deltaTime * 0.036;
  roundMist.material.opacity = 0.055 + mistPulse * 0.055;
  roundGlowLight.intensity = ROUND_CONFIG.centerGlowIntensity * (0.65 + slowPulse * 0.45);
  roundOrbitWheel.rotation.z += deltaTime * 0.08;
  roundOrbitWheel.rotation.x = Math.sin(elapsedTime * 0.22) * 0.11;
  roundSpokesGroup.rotation.z -= deltaTime * 0.14;
  roundSpokesGroup.children.forEach((spoke) => {
    spoke.material.opacity = 0.32 + (Math.sin(elapsedTime * 1.35 + spoke.userData.phase) * 0.5 + 0.5) * 0.22;
  });
  roundGateGroup.rotation.z += deltaTime * 0.18;
  roundGateGroup.children.forEach((gate, index) => {
    const wheelAngle = gate.userData.angle + roundGateGroup.rotation.z;
    const sway = Math.sin(elapsedTime * 0.9 + gate.userData.phase) * 0.16;
    gate.position.set(Math.cos(wheelAngle) * gate.userData.radius, Math.sin(wheelAngle) * gate.userData.radius, 0.32 + sway);
    gate.rotation.z = -roundGateGroup.rotation.z + Math.sin(elapsedTime * 0.7 + index) * 0.18;
    gate.scale.setScalar(0.86 + (Math.sin(elapsedTime * 1.1 + index) * 0.5 + 0.5) * 0.22);
  });
  roundRings.forEach((ring, i) => {
    ring.rotation.x += ring.userData.speed * deltaTime;
    ring.rotation.y += ring.userData.speed * deltaTime * (0.55 + i * 0.08);
    ring.rotation.z += Math.sin(elapsedTime * 0.18 + i) * ring.userData.wobble * deltaTime * 0.12;
  });
  roundParticles.forEach((p, i) => {
    const phase = p.userData.phase;
    const orbit = phase + elapsedTime * p.userData.speed;
    const orbitBand = i % 6;
    const pull = Math.sin(elapsedTime * 0.41 + phase) * 0.24;
    let radius = 1.02 + orbitBand * 0.33 + pull;
    if (radius > 3.15) radius = 2.1 + (i % 7) * 0.07;
    const tilt = -0.72 + orbitBand * 0.25;
    const x = Math.cos(orbit) * radius;
    const y = Math.sin(orbit) * radius * Math.cos(tilt);
    const z = Math.sin(orbit) * radius * Math.sin(tilt) + Math.sin(orbit * 2 + phase) * 0.16;
    p.position.set(x, y, z);
    p.scale.setScalar(0.72 + (Math.sin(elapsedTime * 1.6 + phase) * 0.5 + 0.5) * 0.74);
  });
  if (roundBasicShapesGroup?.visible) {
    roundBasicShapesGroup.children.forEach((shape, index) => {
      const pulse = Math.sin(elapsedTime * 1.4 + shape.userData.phase) * 0.5 + 0.5;
      shape.scale.setScalar(0.88 + pulse * 0.22);
      shape.rotation.z += deltaTime * (index === 1 ? -0.32 : 0.24);
    });
  }
  roundFragments.forEach((frag) => {
    const phase = frag.userData.phase;
    const orbit = phase + elapsedTime * frag.userData.speed;
    const breathe = 0.78 + Math.sin(orbit * 1.7) * 0.18;
    const x = Math.cos(orbit) * frag.userData.radiusX * breathe;
    const y = Math.sin(orbit * 1.21) * frag.userData.radiusY;
    const z = Math.sin(orbit) * frag.userData.radiusX * 0.42 * breathe;
    const tilt = frag.userData.tilt;
    frag.position.set(x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt));
    frag.rotation.x += deltaTime * 0.21;
    frag.rotation.y -= deltaTime * 0.16;
  });
}
function updateRoundStopped(deltaTime) {
  const resetStep = Math.min(1, deltaTime * ROUND_CONFIG.resetScaleSpeed);
  roundGroup.scale.setScalar(THREE.MathUtils.lerp(roundGroup.scale.x, ROUND_CONFIG.scale, resetStep));
}
function setRoundAnimationPlaying(playing) {
  isSoundPlaying = playing;
}
createRoundVisual();
updateRoundVisualMode();
updateRoundAnimation(roundAnimationTime, 0);

let signPlaySoundText = null;
function buildPlaySoundText() {
  if (!uiFont || signPlaySoundText) return;
  signPlaySoundText = attachSignText(signPlaySound, 'SOUND', 0.5, textMatWhite, 0.05);
}

const {
  actx,
  psyElement,
  bgmElements,
  setBgmVariant,
  playBgmElements,
  pauseBgmElements,
  getActiveBgmElement,
  isBgmPlaying,
} = createPsyAudioGraph({
  bgmURL: 'audio/round.mp3',
  bgmTracks: soundVariantOptions,
  initialBgmTrackId: DEFAULT_SOUND_VARIANT,
});
setBgmVariant(DEFAULT_SOUND_VARIANT, 0);

function refreshSoundPlaybackState() {
  const playing = isBgmPlaying();
  setRoundAnimationPlaying(playing);
  setSoundVariantButtonsVisible(playing);
}
[...new Set([psyElement, ...bgmElements.map(({ element }) => element)])].forEach((element) => {
  element.addEventListener('play', refreshSoundPlaybackState);
  element.addEventListener('playing', refreshSoundPlaybackState);
  element.addEventListener('pause', refreshSoundPlaybackState);
  element.addEventListener('ended', refreshSoundPlaybackState);
  element.addEventListener('error', refreshSoundPlaybackState);
});

function selectSoundVariant(variantId, crossfadeSec = SOUND_VARIANT_CROSSFADE_SEC) {
  if (!soundVariantOptions.some((option) => option.id === variantId)) return;
  activeSoundVariant = variantId;
  setBgmVariant(activeSoundVariant, crossfadeSec);
  updateSoundVariantButtons();
  updateRoundVisualMode();
}
function toggleSongPlayback() {
  if (actx.state !== 'running') actx.resume();
  if (!isBgmPlaying()) {
    playBgmElements().catch(console.warn);
  } else {
    pauseBgmElements();
    selectSoundVariant(DEFAULT_SOUND_VARIANT, 0);
    setRoundAnimationPlaying(false);
    setSoundVariantButtonsVisible(false);
  }
}

const clickableA = [signPlaySound, ...soundVariantButtons];
const clickableSet = new Set(clickableA);
function getClickableRoot(object) {
  let current = object;
  while (current && !clickableSet.has(current)) current = current.parent;
  return current;
}
function setPointerFromCanvasEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  _v2.set(x * 2 - 1, -(y * 2 - 1));
}

function handlePointerUp(event) {
  if (event.pointerType && event.isPrimary === false) return;
  setPointerFromCanvasEvent(event);
  _raycaster.setFromCamera(_v2, camera);
  const intersects = _raycaster.intersectObjects(clickableA, true);
  if (!intersects.length) return;
  const obj = getClickableRoot(intersects[0].object);
  if (isSoundPlaying && soundVariantButtons.includes(obj)) {
    selectSoundVariant(obj.userData.soundVariantId);
  } else if (obj === signPlaySound) {
    toggleSongPlayback();
  }
}
renderer.domElement.addEventListener('pointerup', handlePointerUp, false);

let resizePending = false;
function onWindowResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
window.addEventListener('resize', onWindowResize, false);

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const tnow = performance.now() * 0.001;
  fillLight.intensity = 1.1 + Math.cos(tnow * 0.6) * 0.35;
  backLight.intensity = 2.1 + Math.sin(tnow * 0.7) * 0.45;
  updateSoundProgressBar();
  const roundFrameDelta = Math.min(dt, 0.05);
  if (isSoundPlaying) {
    const roundDelta = roundFrameDelta * ROUND_CONFIG.animationSpeed;
    roundAnimationTime += roundDelta;
    updateRoundAnimation(roundAnimationTime, roundDelta);
  } else {
    updateRoundStopped(roundFrameDelta);
  }
  renderer.render(scene, camera);
}
animate();
