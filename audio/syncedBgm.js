// Sample-aligned looping and crossfading for alternate renders of one song.
export function createSyncedBgmPlayer({
  tracks,
  initialTrackId,
  defaultCrossfadeSec = 3.2,
} = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new TypeError('createSyncedBgmPlayer requires at least one track.');
  }

  const trackIds = new Set(tracks.map(({ id }) => id));
  if (trackIds.size !== tracks.length || tracks.some(({ id, url }) => !id || !url)) {
    throw new TypeError('Every synced BGM track requires a unique id and a url.');
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const initialId = trackIds.has(initialTrackId) ? initialTrackId : tracks[0].id;
  let activeTrackId = initialId;
  let actx = null;
  let masterGain = null;
  let trackStates = null;
  let preloadPromise = null;
  let loadPromise = null;
  let loopDuration = 0;
  let isPlaying = false;
  let pendingPlay = null;
  let sourceEntries = [];
  let startOffset = 0;
  let startedAtContextTime = 0;
  let pausedOffset = 0;

  const encodedTracks = new Map(tracks.map((track) => [
    track.id,
    { ...track, arrayBuffer: null },
  ]));

  function ensureAudioGraph() {
    if (actx) return;
    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this browser.');
    }

    // iOS/WebKit requires the AudioContext to be created from a user gesture.
    actx = new AudioContextClass();
    masterGain = actx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(actx.destination);

    trackStates = new Map(tracks.map((track) => {
      const gain = actx.createGain();
      gain.gain.value = track.id === activeTrackId ? 1 : 0;
      gain.connect(masterGain);
      return [track.id, { ...track, buffer: null, gain }];
    }));
  }

  function normalizeOffset(seconds) {
    if (!(loopDuration > 0)) return 0;
    return ((seconds % loopDuration) + loopDuration) % loopDuration;
  }

  function holdParamAtCurrentValue(param, time) {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(time);
      return;
    }
    const currentValue = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(currentValue, time);
  }

  function setTrackGains(durationSec = 0) {
    if (!actx || !trackStates) return;
    const now = actx.currentTime;
    const duration = Math.max(0, durationSec);

    trackStates.forEach((track) => {
      const target = track.id === activeTrackId ? 1 : 0;
      holdParamAtCurrentValue(track.gain.gain, now);
      if (duration === 0 || !isPlaying) {
        track.gain.gain.setValueAtTime(target, now);
      } else {
        track.gain.gain.linearRampToValueAtTime(target, now + duration);
      }
    });
  }

  async function fetchTrack(track) {
    const response = await fetch(track.url);
    if (!response.ok) {
      throw new Error(`Failed to load ${track.url}: HTTP ${response.status}`);
    }
    track.arrayBuffer = await response.arrayBuffer();
    return track.arrayBuffer;
  }

  function preload() {
    if (preloadPromise) return preloadPromise;

    preloadPromise = Promise.all(
      [...encodedTracks.values()].map((track) => (
        track.arrayBuffer ? track.arrayBuffer : fetchTrack(track)
      ))
    ).then(() => ({ preloaded: true })).catch((error) => {
      preloadPromise = null;
      throw error;
    });

    return preloadPromise;
  }

  async function decodeTrack(track) {
    const encodedTrack = encodedTracks.get(track.id);
    if (!encodedTrack?.arrayBuffer) {
      throw new Error(`Track data was not preloaded for ${track.id}.`);
    }
    // Safari may detach the supplied ArrayBuffer while decoding, so decode a copy.
    return actx.decodeAudioData(encodedTrack.arrayBuffer.slice(0));
  }

  function load() {
    ensureAudioGraph();
    if (loadPromise) return loadPromise;

    loadPromise = preload().then(() => Promise.all(
      [...trackStates.values()].map(async (track) => {
        track.buffer = await decodeTrack(track);
        return track.buffer;
      })
    )).then((buffers) => {
      loopDuration = Math.min(...buffers.map(({ duration }) => duration));
      if (!(loopDuration > 0)) {
        throw new Error('The synced BGM tracks contain no playable audio.');
      }

      const durationSpread = Math.max(...buffers.map(({ duration }) => duration)) - loopDuration;
      if (durationSpread > 1 / actx.sampleRate) {
        console.warn(
          `Synced BGM durations differ by ${durationSpread.toFixed(6)} seconds. `
          + `All tracks will loop at ${loopDuration.toFixed(6)} seconds.`
        );
      }

      return { duration: loopDuration };
    }).catch((error) => {
      loadPromise = null;
      throw error;
    });

    return loadPromise;
  }

  function getCurrentTime() {
    if (!isPlaying) return normalizeOffset(pausedOffset);
    const elapsed = Math.max(0, actx.currentTime - startedAtContextTime);
    return normalizeOffset(startOffset + elapsed);
  }

  function scheduleSources(offset) {
    const normalizedOffset = normalizeOffset(offset);
    const startAt = actx.currentTime + 0.04;

    masterGain.gain.cancelScheduledValues(actx.currentTime);
    masterGain.gain.setValueAtTime(0, actx.currentTime);
    masterGain.gain.setValueAtTime(1, startAt);
    setTrackGains(0);

    sourceEntries = [...trackStates.values()].map((track) => {
      const source = actx.createBufferSource();
      source.buffer = track.buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = loopDuration;
      source.connect(track.gain);
      source.start(startAt, normalizedOffset);
      return { source, trackId: track.id };
    });

    startOffset = normalizedOffset;
    startedAtContextTime = startAt;
    isPlaying = true;
  }

  async function play() {
    if (isPlaying) return;
    if (pendingPlay) return pendingPlay;

    // This function is called directly by the pointer handler. Create and resume
    // the context before the first async boundary so iOS recognizes the gesture.
    ensureAudioGraph();
    pendingPlay = (async () => {
      if (actx.state !== 'running') await actx.resume();
      await load();
      if (actx.state !== 'running') await actx.resume();
      if (!isPlaying) scheduleSources(pausedOffset);
    })().finally(() => {
      pendingPlay = null;
    });

    return pendingPlay;
  }

  function pause() {
    if (!actx || !isPlaying) return;

    pausedOffset = getCurrentTime();
    isPlaying = false;
    const stopAt = actx.currentTime + 0.025;

    holdParamAtCurrentValue(masterGain.gain, actx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, stopAt);
    sourceEntries.forEach(({ source }) => {
      try {
        source.stop(stopAt);
      } catch (error) {
        console.warn(error);
      }
    });
    sourceEntries = [];
  }

  function setTrack(trackId, durationSec = defaultCrossfadeSec) {
    if (!trackIds.has(trackId)) return false;
    activeTrackId = trackId;
    setTrackGains(durationSec);
    return true;
  }

  function reset() {
    const wasPlaying = isPlaying;
    if (wasPlaying) pause();
    pausedOffset = 0;
    startOffset = 0;
    if (wasPlaying) play().catch(console.warn);
  }

  function destroy() {
    if (!actx) return;
    if (isPlaying) pause();
    trackStates.forEach(({ gain }) => gain.disconnect());
    masterGain.disconnect();
    if (actx.state !== 'closed') actx.close().catch(console.warn);
  }

  return {
    get actx() { return actx; },
    preload,
    load,
    play,
    pause,
    reset,
    destroy,
    setTrack,
    getCurrentTime,
    getDuration: () => loopDuration,
    getActiveTrackId: () => activeTrackId,
    isPlaying: () => isPlaying,
  };
}
