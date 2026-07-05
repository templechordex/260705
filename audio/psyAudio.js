// Shared Web Audio graph used by the 3D pages.
export function createPsyAudioGraph({
  audio1URL = 'audio/roku1.mp3',
  audio2URL = 'audio/roku2.mp3',
  bgmURL = 'audio/psy.mp3',
  bgmTracks = null,
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
  const bgmElements = bgmTrackConfigs.map((track) => {
    const element = new Audio(track.url);
    element.loop = true;
    element.preload = 'auto';
    element.crossOrigin = 'anonymous';
    return { ...track, element };
  });
  const psyElement = bgmElements[0].element;

  const Track1 = actx.createMediaElementSource(audio1Element);
  const Track2 = actx.createMediaElementSource(audio2Element);

  const busTrack1 = actx.createGain();
  Track1.connect(busTrack1);
  Track2.connect(busTrack1);

  const bgmGainNodes = new Map();
  bgmElements.forEach(({ id, element }, index) => {
    const source = actx.createMediaElementSource(element);
    const gain = actx.createGain();
    gain.gain.value = index === 0 ? 1.0 : 0.0;
    source.connect(gain).connect(busTrack1);
    bgmGainNodes.set(id, gain);
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

  function rampParam(param, targetValue, durationSec) {
    const t0 = actx.currentTime;
    param.cancelScheduledValues(t0);
    param.setValueAtTime(param.value, t0);
    param.linearRampToValueAtTime(targetValue, t0 + Math.max(0.001, durationSec));
  }

  const ctrLowpassFilter1 = (freq, dur) => rampParam(lowpassFilter1.frequency, freq, dur);
  const ctrLowpassFilter2 = (freq, dur) => rampParam(lowpassFilter2.frequency, freq, dur);
  const setEchoSend = (v, durSec = 0.8) => rampParam(echoSendGain.gain, v, durSec);

  function setBgmVariant(activeId, durSec = 0.85) {
    bgmGainNodes.forEach((gain, id) => {
      rampParam(gain.gain, id === activeId ? 1.0 : 0.0, durSec);
    });
  }

  function syncBgmElements(time = psyElement.currentTime) {
    bgmElements.forEach(({ element }) => {
      if (Number.isFinite(element.duration) && element.duration > 0) {
        element.currentTime = Math.min(time, Math.max(0, element.duration - 0.05));
      } else {
        element.currentTime = time;
      }
    });
  }

  function playBgmElements() {
    syncBgmElements(psyElement.currentTime);
    return Promise.allSettled(bgmElements.map(({ element }) => element.play()));
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
    ctrLowpassFilter1,
    ctrLowpassFilter2,
    setEchoSend,
    setPsyAudio,
  };
}
