// Shared Web Audio graph used by the 3D pages.
export function createPsyAudioGraph({
  audio1URL = 'audio/roku1.mp3',
  audio2URL = 'audio/roku2.mp3',
  bgmURL = 'audio/psy.mp3',
  bgmTracks = null,
  initialBgmTrackId = null,
  equalPowerBgmCrossfade = false,
  synchronizeBgmVariants = false,
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
  const OPEN_LOWPASS_FREQ = 22050;
  const MUTED_LOWPASS_FREQ = 0;

  const roundAudioURL = bgmTrackConfigs.find(({ id }) => id === 'round')?.url ?? bgmURL;
  const roundDryAudioURL = bgmTrackConfigs.find(({ id }) => id === 'round_dry')?.url ?? 'audio/round_dry.mp3';
  const roundRoomyAudioURL = bgmTrackConfigs.find(({ id }) => id === 'round_roomy')?.url ?? 'audio/round_roomy.mp3';

  const roundAudioElement = new Audio(roundAudioURL);
  const roundDryAudioElement = new Audio(roundDryAudioURL);
  const roundRoomyAudioElement = new Audio(roundRoomyAudioURL);
  const bgmElementById = new Map([
    ['round', roundAudioElement],
    ['round_dry', roundDryAudioElement],
    ['round_roomy', roundRoomyAudioElement],
  ]);

  const bgmElements = bgmTrackConfigs.map((track) => {
    const element = bgmElementById.get(track.id) ?? new Audio(track.url);
    element.loop = true;
    element.preload = 'auto';
    element.crossOrigin = 'anonymous';
    element.volume = 1.0;
    element.load();
    return { ...track, element, source: null, filter: null, gain: null };
  });
  const psyElement = bgmElements[0].element;

  const Track1 = actx.createMediaElementSource(audio1Element);
  const Track2 = actx.createMediaElementSource(audio2Element);
  const roundSourceNode = actx.createMediaElementSource(roundAudioElement);
  const roundDrySourceNode = actx.createMediaElementSource(roundDryAudioElement);
  const roundRoomySourceNode = actx.createMediaElementSource(roundRoomyAudioElement);
  const bgmSourceById = new Map([
    ['round', roundSourceNode],
    ['round_dry', roundDrySourceNode],
    ['round_roomy', roundRoomySourceNode],
  ]);

  const busTrack1 = actx.createGain();
  Track1.connect(busTrack1);
  Track2.connect(busTrack1);

  const lowpassFilter1 = actx.createBiquadFilter();
  lowpassFilter1.type = 'lowpass';
  lowpassFilter1.frequency.value = 22050;
  const lowpassFilter2 = actx.createBiquadFilter();
  lowpassFilter2.type = 'lowpass';
  lowpassFilter2.frequency.value = 0;

  const roundLowpassFilter = actx.createBiquadFilter();
  roundLowpassFilter.type = 'lowpass';
  roundLowpassFilter.frequency.value = equalPowerBgmCrossfade || activeBgmTrackId === 'round'
    ? OPEN_LOWPASS_FREQ
    : MUTED_LOWPASS_FREQ;
  const bgmFilterById = new Map([
    ['round', roundLowpassFilter],
    ['round_dry', lowpassFilter1],
    ['round_roomy', lowpassFilter2],
  ]);

  bgmElements.forEach((track) => {
    const source = bgmSourceById.get(track.id) ?? actx.createMediaElementSource(track.element);
    const filter = bgmFilterById.get(track.id) ?? actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = equalPowerBgmCrossfade || track.id === activeBgmTrackId
      ? OPEN_LOWPASS_FREQ
      : MUTED_LOWPASS_FREQ;
    filter.Q.value = 0.0001;
    const gain = actx.createGain();
    gain.gain.value = track.id === activeBgmTrackId ? 1.0 : 0.0;
    track.source = source;
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

  const isIOSAudio = /iP(ad|hone|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const manualRampTokens = new WeakMap();

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

  function equalPowerGain(startValue, targetValue, progress) {
    const start = Math.min(1, Math.max(0, startValue));
    const target = Math.min(1, Math.max(0, targetValue));
    const amount = Math.min(1, Math.max(0, progress));
    const power = start * start + (target * target - start * start) * amount;
    return Math.sqrt(Math.max(0, power));
  }

  function manuallyRampGainEqualPower(param, targetValue, durationSec) {
    const token = Symbol('equalPowerRamp');
    manualRampTokens.set(param, token);
    const startValue = param.value;
    const startMs = performance.now();
    const durationMs = Math.max(1, durationSec * 1000);

    function step(nowMs) {
      if (manualRampTokens.get(param) !== token) return;
      const progress = Math.min((nowMs - startMs) / durationMs, 1);
      param.setValueAtTime(equalPowerGain(startValue, targetValue, progress), actx.currentTime);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        param.setValueAtTime(targetValue, actx.currentTime);
      }
    }

    requestAnimationFrame(step);
  }

  function rampGainEqualPower(param, targetValue, durationSec) {
    const t0 = actx.currentTime;
    if (durationSec <= 0) {
      manualRampTokens.delete(param);
      param.cancelScheduledValues(t0);
      param.setValueAtTime(targetValue, t0);
      return;
    }

    cancelParamAutomation(param, t0);
    const startValue = param.value;
    if (isIOSAudio) {
      manuallyRampGainEqualPower(param, targetValue, durationSec);
      return;
    }

    manualRampTokens.delete(param);
    const sampleCount = 128;
    const curve = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      curve[i] = equalPowerGain(startValue, targetValue, i / (sampleCount - 1));
    }
    param.setValueCurveAtTime(curve, t0, Math.max(0.001, durationSec));
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
        if (equalPowerBgmCrossfade) {
          element.volume = equalPowerGain(startValue, clampedTarget, rawProgress);
        } else {
          const easedProgress = rawProgress * rawProgress * (3 - 2 * rawProgress);
          element.volume = startValue + (clampedTarget - startValue) * easedProgress;
        }
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

  let nextBgmStartTime = null;
  let bgmCrossfadeEndsAtMs = 0;
  let nextBgmSyncCheckMs = 0;
  const BGM_SYNC_INTERVAL_MS = 500;
  const BGM_SYNC_TOLERANCE_SEC = 0.025;

  function getSafeBgmSeekTime(element, time) {
    const seekTime = Math.max(0, time);
    if (Number.isFinite(element.duration) && element.duration > 0) {
      return Math.min(seekTime, Math.max(0, element.duration - 0.001));
    }
    return seekTime;
  }

  function seekBgmElement(element, time, { precise = false } = {}) {
    const seekTime = getSafeBgmSeekTime(element, time);
    try {
      if (!precise && typeof element.fastSeek === 'function') {
        element.fastSeek(seekTime);
      } else {
        element.currentTime = seekTime;
      }
    } catch (error) {
      console.warn(error);
    }
  }

  function getBgmTimeOffset(element, referenceTime) {
    let offset = element.currentTime - referenceTime;
    if (Number.isFinite(element.duration) && element.duration > 0 && Math.abs(offset) > element.duration / 2) {
      offset -= Math.sign(offset) * element.duration;
    }
    return offset;
  }

  function syncBgmElement(element, referenceTime, toleranceSec = 0) {
    if (!Number.isFinite(referenceTime)) return false;
    const offset = getBgmTimeOffset(element, referenceTime);
    if (Number.isFinite(offset) && Math.abs(offset) <= toleranceSec) return false;
    seekBgmElement(element, referenceTime, { precise: true });
    return true;
  }

  function fadeBgmTrack(track, targetFrequency, targetGain, durationSec) {
    track.element.volume = 1.0;
    if (track.gain) {
      if (equalPowerBgmCrossfade) {
        rampGainEqualPower(track.gain.gain, targetGain, durationSec);
      } else {
        rampParam(track.gain.gain, targetGain, durationSec);
      }
    }
    if (track.filter) {
      rampParam(
        track.filter.frequency,
        equalPowerBgmCrossfade ? OPEN_LOWPASS_FREQ : targetFrequency,
        equalPowerBgmCrossfade ? 0 : durationSec,
      );
      return Promise.resolve();
    }
    return fadeElementVolume(track.element, targetGain, durationSec);
  }

  function setBgmVariant(activeId, durSec = 3.2) {
    if (!bgmElements.some(({ id }) => id === activeId)) return;

    const wasPlaying = isBgmPlaying();
    const previousActiveElement = getActiveBgmElement();
    const nextActiveTrack = bgmElements.find(({ id }) => id === activeId);
    if (
      synchronizeBgmVariants
      && wasPlaying
      && nextActiveTrack?.element !== previousActiveElement
    ) {
      // The incoming track is still silent here, so an exact seek can finish
      // underneath the start of the fade without exposing a seek artifact.
      syncBgmElement(nextActiveTrack.element, previousActiveElement.currentTime);
    }
    activeBgmTrackId = activeId;
    if (synchronizeBgmVariants) {
      const nowMs = performance.now();
      bgmCrossfadeEndsAtMs = nowMs + Math.max(0, durSec) * 1000;
      nextBgmSyncCheckMs = bgmCrossfadeEndsAtMs + BGM_SYNC_INTERVAL_MS;
    }

    bgmElements.forEach((track) => {
      const isActive = track.id === activeId;
      const targetFrequency = isActive ? OPEN_LOWPASS_FREQ : MUTED_LOWPASS_FREQ;
      const targetGain = isActive ? 1.0 : 0.0;
      track.element.volume = 1.0;
      if (wasPlaying && track.element.paused) track.element.play().catch(console.warn);
      fadeBgmTrack(track, targetFrequency, targetGain, durSec);
    });
  }

  function syncBgmElements(
    time = getActiveBgmElement().currentTime,
    { precise = synchronizeBgmVariants, toleranceSec = 0 } = {},
  ) {
    bgmElements.forEach(({ element }) => {
      if (precise) {
        syncBgmElement(element, time, toleranceSec);
      } else {
        seekBgmElement(element, time);
      }
    });
  }

  function maintainBgmSync(nowMs = performance.now()) {
    if (!synchronizeBgmVariants || !isBgmPlaying()) return 0;
    if (nowMs < bgmCrossfadeEndsAtMs || nowMs < nextBgmSyncCheckMs) return 0;

    nextBgmSyncCheckMs = nowMs + BGM_SYNC_INTERVAL_MS;
    const activeElement = getActiveBgmElement();
    const referenceTime = activeElement.currentTime;
    let correctionCount = 0;
    bgmElements.forEach(({ element }) => {
      if (element === activeElement) return;
      if (element.paused) element.play().catch(console.warn);
      if (syncBgmElement(element, referenceTime, BGM_SYNC_TOLERANCE_SEC)) {
        correctionCount += 1;
      }
    });
    return correctionCount;
  }

  function playBgmElements() {
    const activeElement = getActiveBgmElement();
    const startTime = nextBgmStartTime ?? activeElement.currentTime;
    syncBgmElements(startTime);
    nextBgmStartTime = null;
    if (synchronizeBgmVariants) {
      nextBgmSyncCheckMs = performance.now() + BGM_SYNC_INTERVAL_MS;
    }
    const playPromises = bgmElements.map((track) => {
      const active = track.element === activeElement;
      track.element.volume = 1.0;
      if (track.gain) track.gain.gain.setValueAtTime(active ? 1.0 : 0.0, actx.currentTime);
      if (track.filter) {
        track.filter.frequency.setValueAtTime(
          equalPowerBgmCrossfade || active ? OPEN_LOWPASS_FREQ : MUTED_LOWPASS_FREQ,
          actx.currentTime,
        );
      }
      return track.element.play();
    });
    return Promise.allSettled(playPromises);
  }

  function pauseBgmElements() {
    nextBgmStartTime = 0;
    bgmCrossfadeEndsAtMs = 0;
    nextBgmSyncCheckMs = 0;
    bgmElements.forEach((track) => {
      track.element.pause();
      if (track.gain) track.gain.gain.setValueAtTime(0.0, actx.currentTime);
      if (track.filter) track.filter.frequency.setValueAtTime(MUTED_LOWPASS_FREQ, actx.currentTime);
      seekBgmElement(track.element, 0);

      if (isIOSAudio) {
        // iOS Safari can defer a media element seek while paused. Reloading after
        // the reset discards the old decode position so the next user-triggered
        // play cannot briefly output audio from the pre-pause timestamp.
        track.element.load();
      }
    });
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
    maintainBgmSync,
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
