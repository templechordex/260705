// round2 diagnostic page: the audio controls remain, but all 3D rendering is disabled.
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

let activeSoundVariant = DEFAULT_SOUND_VARIANT;

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
