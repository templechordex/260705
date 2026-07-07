// Shared Web Audio graph used by the 3D pages.
export function createPsyAudioGraph({
  audio1URL = 'audio/roku1.mp3',
  audio2URL = 'audio/roku2.mp3',
  bgmURL = 'audio/psy.mp3',
  bgmTracks = null,
  initialBgmTrackId = null,
  reverbURL = 'audio/WireGrind2.wav',
} = {}) {
  const actx = new (window.AudioContext || window.webkitAudioContext)();
  const resumeCtxOnce = () => actx.state !== 'running' && actx.resume();
  ['click', 'touchstart', 'keydown'].forEach(evt =>
    document.addEventListener(evt, resumeCtxOnce, { once: true, passive: true })
  );

  const audio1Element = new Audio(audio1URL);
  const audio2Element = new Audio(audio2URL);
  const bgmTrackConfigs = (Array.isArray(bgmTracks) && bgmTracks.length)
    ? bgmTracks
    : [{ id: 'default', url: bgmURL }];
  const initialActiveBgmTrackId = initialBgmTrackId ?? bgmTrackConfigs[0].id;
  let activeBgmTrackId = initialActiveBgmTrackId;
  const OPEN_LOWPASS_FREQ = 20000;
  const MUTED_LOWPASS_FREQ = 10;
  const bgmElements = bgmTrackConfigs.map((track) => {
    const element = new Audio(track.url);
    element.loop = true;
    element.preload = 'auto';
    element.crossOrigin = 'anonymous';
    element.volume = 1.0;
    element.load();
    return { ...track, element, gain: null };
  });
  const psyElement = bgmElements[0].element;

  const Track1 = actx.createMediaElementSource(audio1Element);
  const Track2 = actx.createMediaElementSource(audio2Element);

  const busTrack1 = actx.createGain();
  Track1.connect(busTrack1);
  Track2.connect(busTrack1);

  bgmElements.forEach((track) => {
    const source = actx.createMediaElementSource(track.element);
    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = track.id === activeBgmTrackId ? OPEN_LOWPASS_FREQ : MUTED_LOWPASS_FREQ;
    filter.Q.value = 0.0001;
    const gain = actx.createGain();
    gain.gain.value = 1.0;
    track.filter = filter;
    track.gain = gain;
    source.connect(filter).connect(gain).connect(busTrack1);
  });

  const reverb1 = actx.createConvolver();
  fetch(reverbURL)
    .then(r => r.arrayBuffer())
    .then(b => actx.decodeAudioData(b))
    .then(buf => { reverb1.buffer = buf; })
    .catch(console.warn);

  const gainReverb1 = actx.createGain();
  gainReverb1.gain.value = 0.0;

  const echoDelay = actx.createDelay(2.0);
  echoDelay.delayTime.value = 0.28;
  const echoFeedback = actx.createGain();
  echoFeedback.gain.value = 0.35;
  echoDelay.connect(echoFeedback).connect(echoDelay);

  const echoTone = actx.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 5000;

  const echoSendGain = actx.createGain();
  echoSendGain.gain.value = 0.0;
  busTrack1.connect(echoSendGain).connect(echoDelay);
  echoDelay.connect(echoTone).connect(actx.destination);

  const gainBus1 = actx.createGain();
  gainBus1.gain.value = 1.0;
  const compressor1 = actx.createDynamicsCompressor();
  compressor1.threshold.value = -0.01;
  compressor1.knee.value = 0;
  compressor1.ratio.value = 20;
  compressor1.attack.value = 0.001;
  compressor1.release.value = 0.001;

  busTrack1.connect(gainBus1);
  gainBus1.connect(compressor1).connect(actx.destination);
  busTrack1.connect(reverb1).connect(gainReverb1).connect(actx.destination);

  const lowpassFilter1 = actx.createBiquadFilter();
  lowpassFilter1.type = 'lowpass';
  lowpassFilter1.frequency.value = 22050;
  const lowpassFilter2 = actx.createBiquadFilter();
  lowpassFilter2.type = 'lowpass';
  lowpassFilter2.frequency.value = 0;

  const isIOSAudio = /iP(ad|hone|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const manualRampTokens = new WeakMap();
  const filterRampTokens = new WeakMap();

  function cancelParamAutomation(param, time) {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(time);
    } else {
      param.cancelScheduledValues(time);
      param.setValueAtTime(param.value, time);
    }
  }

  function manuallyRampParam(param, targetValue, durationSec) {
    const token = Symbol('manualRamp');
    manualRampTokens.set(param, token);
    const startValue = param.value;
    const startMs = performance.now();
    const durationMs = Math.max(1, durationSec * 1000);

    function step(nowMs) {
      if (manualRampTokens.get(param) !== token) return;
      const progress = Math.min((nowMs - startMs) / durationMs, 1);
      const value = startValue + (targetValue - startValue) * progress;
      param.setValueAtTime(value, actx.currentTime);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        param.setValueAtTime(targetValue, actx.currentTime);
      }
    }

    requestAnimationFrame(step);
  }

  function rampParam(param, targetValue, durationSec) {
    const t0 = actx.currentTime;
    if (durationSec <= 0) {
      manualRampTokens.delete(param);
      param.cancelScheduledValues(t0);
      param.setValueAtTime(targetValue, t0);
      return;
    }

    if (isIOSAudio) {
      // iOS Safari can miss AudioParam linearRamp automation on MediaElement gain
      // nodes during user-triggered playback. A short rAF-driven ramp keeps BGM
      // crossfades audible and smooth on iPhone/iPad while preserving desktop
      // sample-accurate automation elsewhere.
      param.cancelScheduledValues(t0);
      manuallyRampParam(param, targetValue, durationSec);
      return;
    }

    manualRampTokens.delete(param);
    cancelParamAutomation(param, t0);
    param.linearRampToValueAtTime(targetValue, t0 + Math.max(0.001, durationSec));
  }

  function rampLowpassFrequency(filter, targetFrequency, durationSec) {
    const param = filter.frequency;
    const now = actx.currentTime;
    const safeTarget = Math.max(1, targetFrequency);
    filterRampTokens.delete(filter);
    if (durationSec <= 0) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(safeTarget, now);
      return;
    }

    const token = Symbol('filterRamp');
    filterRampTokens.set(filter, token);
    param.cancelScheduledValues(now);
    const startFrequency = Math.max(1, param.value || safeTarget);
    const startLog = Math.log(startFrequency);
    const targetLog = Math.log(safeTarget);
    const startMs = performance.now();
    const durationMs = Math.max(1, durationSec * 1000);

    function step(nowMs) {
      if (filterRampTokens.get(filter) !== token) return;
      const progress = Math.min((nowMs - startMs) / durationMs, 1);
      const easedProgress = progress * progress * (3 - 2 * progress);
      const frequency = Math.exp(startLog + (targetLog - startLog) * easedProgress);
      param.setValueAtTime(frequency, actx.currentTime);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        param.setValueAtTime(safeTarget, actx.currentTime);
      }
    }

    requestAnimationFrame(step);
  }

  const ctrLowpassFilter1 = (freq, dur) => rampParam(lowpassFilter1.frequency, freq, dur);
  const ctrLowpassFilter2 = (freq, dur) => rampParam(lowpassFilter2.frequency, freq, dur);
  const setEchoSend = (v, durSec = 0.8) => rampParam(echoSendGain.gain, v, durSec);

  const bgmVolumeFadeTokens = new WeakMap();

  function fadeElementVolume(element, targetValue, durationSec) {
    const clampedTarget = Math.min(1, Math.max(0, targetValue));
    if (durationSec <= 0) {
      bgmVolumeFadeTokens.delete(element);
      element.volume = clampedTarget;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const token = Symbol('bgmVolumeFade');
      bgmVolumeFadeTokens.set(element, token);
      const startValue = element.volume;
      const startMs = performance.now();
      const durationMs = Math.max(1, durationSec * 1000);

      function step(nowMs) {
        if (bgmVolumeFadeTokens.get(element) !== token) return;
        const rawProgress = Math.min((nowMs - startMs) / durationMs, 1);
        const easedProgress = rawProgress * rawProgress * (3 - 2 * rawProgress);
        element.volume = startValue + (clampedTarget - startValue) * easedProgress;
        if (rawProgress < 1) {
          requestAnimationFrame(step);
        } else {
          element.volume = clampedTarget;
          resolve();
        }
      }

      requestAnimationFrame(step);
    });
  }

  function isBgmPlaying() {
    return bgmElements.some(({ element }) => !element.paused && !element.ended);
  }

  function getActiveBgmElement() {
    return bgmElements.find(({ id }) => id === activeBgmTrackId)?.element ?? psyElement;
  }

  function fadeBgmTrack(track, targetFrequency, durationSec) {
    track.element.volume = 1.0;
    if (track.gain) track.gain.gain.setValueAtTime(1.0, actx.currentTime);
    if (track.filter) {
      rampLowpassFrequency(track.filter, targetFrequency, durationSec);
      return Promise.resolve();
    }
    const fallbackVolume = targetFrequency === OPEN_LOWPASS_FREQ ? 1.0 : 0.0;
    return fadeElementVolume(track.element, fallbackVolume, durationSec);
  }

  function setBgmVariant(activeId, durSec = 1.45) {
    if (!bgmElements.some(({ id }) => id === activeId)) return;

    const wasPlaying = isBgmPlaying();
    const referenceTime = getActiveBgmElement().currentTime;
    activeBgmTrackId = activeId;

    if (wasPlaying && Number.isFinite(referenceTime)) {
      syncBgmElements(referenceTime);
    }

    const filterFadeDurationSec = durSec;
    bgmElements.forEach((track) => {
      const isActive = track.id === activeId;
      const targetFrequency = isActive ? OPEN_LOWPASS_FREQ : MUTED_LOWPASS_FREQ;
      track.element.volume = 1.0;
      if (wasPlaying && track.element.paused) track.element.play().catch(console.warn);
      fadeBgmTrack(track, targetFrequency, filterFadeDurationSec);
    });
  }

  function syncBgmElements(time = getActiveBgmElement().currentTime) {
    bgmElements.forEach(({ element }) => {
      if (Number.isFinite(element.duration) && element.duration > 0) {
        element.currentTime = Math.min(time, Math.max(0, element.duration - 0.05));
      } else {
        element.currentTime = time;
      }
    });
  }

  function playBgmElements() {
    const activeElement = getActiveBgmElement();
    syncBgmElements(activeElement.currentTime);
    const playPromises = bgmElements.map((track) => {
      const active = track.element === activeElement;
      track.element.volume = 1.0;
      if (track.gain) track.gain.gain.setValueAtTime(1.0, actx.currentTime);
      if (track.filter) {
        track.filter.frequency.setValueAtTime(active ? OPEN_LOWPASS_FREQ : MUTED_LOWPASS_FREQ, actx.currentTime);
      }
      return track.element.play();
    });
    return Promise.allSettled(playPromises);
  }

  function pauseBgmElements() {
    bgmElements.forEach(({ element }) => element.pause());
  }

  function setPsyAudio(isOn) {
    if (isOn) {
      rampParam(gainReverb1.gain, 0.6, 1.2);
      setEchoSend(0.45, 1.2);
      rampParam(echoFeedback.gain, 0.4, 1.0);
    } else {
      rampParam(gainReverb1.gain, 0.0, 1.0);
      setEchoSend(0.0, 1.0);
      rampParam(echoFeedback.gain, 0.3, 1.0);
    }
  }

  return {
    actx,
    audio1Element,
    audio2Element,
    psyElement,
    bgmElements,
    setBgmVariant,
    syncBgmElements,
    playBgmElements,
    pauseBgmElements,
    getActiveBgmElement,
    isBgmPlaying,
    ctrLowpassFilter1,
    ctrLowpassFilter2,
    setEchoSend,
    setPsyAudio,
  };
}
