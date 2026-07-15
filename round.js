// round page: SOUND controls and round visual copied from at.js
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
createLoadingManager(THREE, renderer, { title: 'LOADING ROUND' });
renderer.toneMapping = THREE.CineonToneMapping;
camera.lookAt(0, 0, 0);

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
const fontLoader = new FontLoader();
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

function createRainbowHeadphoneGeometry() {
  const group = new THREE.Group();
  const cupGeo = new THREE.SphereGeometry(1, 32, 16);
  const cupMat = new THREE.MeshBasicMaterial({ color: 0x66ddff });
  const leftCup = new THREE.Mesh(cupGeo, cupMat);
  leftCup.scale.set(0.85, 1.25, 0.42);
  leftCup.position.set(-3.15, -0.25, 0.08);
  group.add(leftCup);
  const rightCup = leftCup.clone();
  rightCup.position.x = 3.15;
  group.add(rightCup);
  const rainbowColors = [0xff3344, 0xff9933, 0xffee44, 0x44ff66, 0x33ddff, 0x5577ff, 0xbb66ff];
  const rainbowMats = rainbowColors.map((color) => new THREE.MeshBasicMaterial({ color }));
  const rainbowGeos = [];
  rainbowMats.forEach((mat, i) => {
    const geo = new THREE.TorusGeometry(3.05 + i * 0.13, 0.055, 8, 64, Math.PI);
    rainbowGeos.push(geo);
    const arc = new THREE.Mesh(geo, mat);
    arc.rotation.z = Math.PI;
    arc.position.set(0, -0.55 + i * 0.02, 0.08 + i * 0.01);
    group.add(arc);
  });
  group.position.set(signPlaySound.position.x, signPlaySound.position.y, signPlaySound.position.z - 0.35);
  group.userData._dispose = () => {
    cupGeo.dispose();
    cupMat.dispose();
    rainbowGeos.forEach((geo) => geo.dispose());
    rainbowMats.forEach((mat) => mat.dispose());
  };
  return group;
}
const headphoneGroup = createRainbowHeadphoneGeometry();
headphoneGroup.rotation.x = Math.PI;
headphoneGroup.scale.setScalar(1.18);
scene.add(headphoneGroup);

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
  activeScale: 8.1,
  scaleUpSpeed: 1.1,
  resetScaleSpeed: 1.6,
  particleCount: window.innerWidth < 768 ? 48 : 84,
  ringCount: 5,
  fragmentCount: 9,
  animationSpeed: 1,
  centerGlowIntensity: 0.75,
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
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xf5f0ff, transparent: true, opacity: 0.78 });
  roundCore = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), coreMat);
  roundGroup.add(roundCore);
  const shellMat = new THREE.MeshBasicMaterial({ color: 0xb9a7d8, transparent: true, opacity: 0.18, depthWrite: false });
  roundCoreShell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16), shellMat);
  roundGroup.add(roundCoreShell);
  const mistMat = new THREE.MeshBasicMaterial({ color: 0x334050, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  roundMist = new THREE.Mesh(new THREE.SphereGeometry(3.9, 32, 16), mistMat);
  roundMist.scale.set(1.18, 0.76, 0.5);
  roundGroup.add(roundMist);
  roundGlowLight = new THREE.PointLight(0xcfc4ff, ROUND_CONFIG.centerGlowIntensity, 9);
  roundGlowLight.userData.originalColor = roundGlowLight.color.getHex();
  roundGlowLight.position.set(0, 0, 1.4);
  roundGroup.add(roundGlowLight);
  const ringColors = [0x2b3445, 0x8e83a8, 0x6da8a6, 0xd8b582, 0xf0f2f4];
  for (let i = 0; i < ROUND_CONFIG.ringCount; i++) {
    const arc = i % 2 === 0 ? Math.PI * (1.35 + i * 0.11) : Math.PI * 2;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15 + i * 0.42, 0.018 + i * 0.002, 8, 96, arc),
      new THREE.MeshBasicMaterial({ color: ringColors[i % ringColors.length], transparent: true, opacity: 0.28 + i * 0.045, depthWrite: false })
    );
    ring.rotation.set(THREE.MathUtils.degToRad(18 + i * 21), THREE.MathUtils.degToRad(i * 33), THREE.MathUtils.degToRad(i * 17));
    ring.userData.speed = (i % 2 === 0 ? 1 : -1) * (0.045 + i * 0.012);
    ring.userData.wobble = 0.18 + i * 0.03;
    roundRings.push(ring);
    roundGroup.add(ring);
  }
  const particleMat = new THREE.MeshBasicMaterial({ color: 0xd9e8e5, transparent: true, opacity: 0.52, depthWrite: false });
  const particleGeo = new THREE.SphereGeometry(0.035, 8, 6);
  for (let i = 0; i < ROUND_CONFIG.particleCount; i++) {
    const p = new THREE.Mesh(particleGeo, particleMat);
    p.userData.phase = i * 2.399963;
    p.userData.radius = 1.0 + (i % 17) * 0.12;
    p.userData.speed = 0.055 + (i % 9) * 0.012;
    p.userData.incline = -0.55 + (i % 11) * 0.11;
    roundParticles.push(p);
    roundGroup.add(p);
  }
  const fragmentColors = [0xa7a0b8, 0x617b83, 0xd1b184, 0xeeeeee];
  for (let i = 0; i < ROUND_CONFIG.fragmentCount; i++) {
    const frag = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.11 + (i % 3) * 0.025, 0),
      new THREE.MeshBasicMaterial({ color: fragmentColors[i % fragmentColors.length], transparent: true, opacity: 0.62, depthWrite: false })
    );
    frag.userData.phase = i * 0.91;
    frag.userData.radiusX = 1.45 + (i % 4) * 0.34;
    frag.userData.radiusY = 0.58 + (i % 3) * 0.17;
    frag.userData.speed = 0.12 + (i % 5) * 0.025;
    frag.userData.tilt = THREE.MathUtils.degToRad(16 + i * 13);
    roundFragments.push(frag);
    roundGroup.add(frag);
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
  roundMist.material.opacity = 0.055 + mistPulse * 0.055;
  roundGlowLight.intensity = ROUND_CONFIG.centerGlowIntensity * (0.65 + slowPulse * 0.45);
  roundRings.forEach((ring, i) => {
    ring.rotation.x += ring.userData.speed * deltaTime;
    ring.rotation.y += ring.userData.speed * deltaTime * (0.55 + i * 0.08);
    ring.rotation.z += Math.sin(elapsedTime * 0.18 + i) * ring.userData.wobble * deltaTime * 0.12;
  });
  roundParticles.forEach((p, i) => {
    const phase = p.userData.phase;
    const orbit = phase + elapsedTime * p.userData.speed;
    const pull = Math.sin(elapsedTime * 0.27 + phase) * 0.22;
    let radius = p.userData.radius + pull;
    if (radius > 3.45) radius = 2.35 + (i % 7) * 0.08;
    p.position.set(Math.cos(orbit) * radius, Math.sin(orbit * 0.7 + p.userData.incline) * 0.55, Math.sin(orbit) * radius * 0.38);
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
function handleClick(event) {
  _v2.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
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
window.addEventListener('click', handleClick, false);
window.addEventListener('touchend', (event) => {
  const touch = event.changedTouches?.[0];
  if (touch) handleClick({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: true });

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
  headphoneGroup.rotation.z = Math.sin(tnow * 0.72) * 0.045;
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
