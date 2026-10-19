// round2 diagnostic page: a static, single-frame 3D visual with the stable DOM audio controls.
import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';
import { createPsyAudioGraph } from './audio/psyAudio.js';

const soundVariantOptions = [
  { id: 'round', label: 'Center', url: 'audio/round.mp3' },
  { id: 'round_dry', label: 'Round A', url: 'audio/round_dry.mp3' },
  { id: 'round_roomy', label: 'Round B', url: 'audio/round_roomy.mp3' },
];

const DEFAULT_SOUND_VARIANT = 'round';
const SOUND_VARIANT_CROSSFADE_SEC = 3.2;

const soundButton = document.querySelector('#sound-button');
const modeControls = document.querySelector('#mode-controls');
const modeButtons = [...document.querySelectorAll('.mode-button')];
const progressFill = document.querySelector('#progress-fill');
const timeLabel = document.querySelector('#time-label');
const status = document.querySelector('#status');
const visualStage = document.querySelector('#visual-stage');

let activeSoundVariant = DEFAULT_SOUND_VARIANT;
let scene = null;
let camera = null;
let renderer = null;
let roundVisual = null;

function renderStaticVisual() {
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function resizeStaticVisual() {
  if (!renderer || !camera) return;
  const width = Math.max(1, visualStage.clientWidth);
  const height = Math.max(1, visualStage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderStaticVisual();
}

function initializeStaticVisual() {
  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.z = 5.4;

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    visualStage.appendChild(renderer.domElement);

    roundVisual = new THREE.Group();
    roundVisual.rotation.set(-0.36, 0.5, 0.08);
    scene.add(roundVisual);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.72, 1),
      new THREE.MeshBasicMaterial({ color: 0xf4f4f4, wireframe: true })
    );
    roundVisual.add(core);

    [
      { radius: 1.15, tube: 0.018, rotation: [0.35, 0.1, 0] },
      { radius: 1.48, tube: 0.014, rotation: [1.05, 0.3, 0.55] },
      { radius: 1.82, tube: 0.01, rotation: [0.6, 1.2, 0.25] },
    ].forEach(({ radius, tube, rotation }, index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 5, 72),
        new THREE.MeshBasicMaterial({
          color: index === 0 ? 0xffffff : 0x777777,
          transparent: true,
          opacity: 0.9 - index * 0.18,
        })
      );
      ring.rotation.set(...rotation);
      roundVisual.add(ring);
    });

    new ResizeObserver(resizeStaticVisual).observe(visualStage);
    resizeStaticVisual();
  } catch (error) {
    renderer = null;
    visualStage.hidden = true;
    console.warn('Minimal 3D is unavailable; audio controls will continue without it.', error);
  }
}

initializeStaticVisual();

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

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateProgress() {
  const element = getActiveBgmElement?.() ?? psyElement;
  const duration = Number.isFinite(element.duration) ? element.duration : 0;
  const currentTime = Number.isFinite(element.currentTime) ? element.currentTime : 0;
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  progressFill.style.width = `${progress * 100}%`;
  timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
}

function updateModeButtons() {
  modeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.variant === activeSoundVariant));
  });

  const rotations = {
    round: [-0.36, 0.5, 0.08],
    round_dry: [-0.18, -0.42, -0.08],
    round_roomy: [0.38, 0.26, 0.5],
  };
  if (roundVisual) {
    roundVisual.rotation.set(...rotations[activeSoundVariant]);
    renderStaticVisual();
  }
}

function refreshSoundPlaybackState() {
  const playing = isBgmPlaying();
  soundButton.textContent = playing ? 'STOP' : 'SOUND';
  soundButton.setAttribute('aria-pressed', String(playing));
  modeControls.hidden = !playing;
  updateProgress();
}

function selectSoundVariant(variantId, crossfadeSec = SOUND_VARIANT_CROSSFADE_SEC) {
  const selectedOption = soundVariantOptions.find((option) => option.id === variantId);
  if (!selectedOption) return;

  activeSoundVariant = variantId;
  setBgmVariant(activeSoundVariant, crossfadeSec);
  updateModeButtons();
  updateProgress();
  status.textContent = `${selectedOption.label} mode`;
}

async function toggleSongPlayback() {
  status.textContent = '';

  if (actx.state !== 'running') {
    await actx.resume();
  }

  if (!isBgmPlaying()) {
    const results = await playBgmElements();
    if (results.every(({ status: resultStatus }) => resultStatus === 'rejected')) {
      status.textContent = 'Audio could not be played.';
    }
  } else {
    pauseBgmElements();
    selectSoundVariant(DEFAULT_SOUND_VARIANT, 0);
    status.textContent = '';
  }

  refreshSoundPlaybackState();
}

const audioElements = [...new Set([psyElement, ...bgmElements.map(({ element }) => element)])];

audioElements.forEach((element) => {
  ['play', 'playing', 'pause', 'ended', 'error'].forEach((eventName) => {
    element.addEventListener(eventName, refreshSoundPlaybackState);
  });
  ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked'].forEach((eventName) => {
    element.addEventListener(eventName, () => {
      if (element === getActiveBgmElement()) updateProgress();
    });
  });
});

soundButton.addEventListener('click', () => {
  toggleSongPlayback().catch((error) => {
    console.warn(error);
    status.textContent = 'Audio could not be played.';
    refreshSoundPlaybackState();
  });
});

modeButtons.forEach((button) => {
  button.addEventListener('click', () => selectSoundVariant(button.dataset.variant));
});

updateModeButtons();
refreshSoundPlaybackState();
