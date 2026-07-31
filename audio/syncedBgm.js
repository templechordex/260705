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
  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const actx = new AudioContextClass();
  const masterGain = actx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(actx.destination);

  const initialId = trackIds.has(initialTrackId) ? initialTrackId : tracks[0].id;
  let activeTrackId = initialId;
  let loadPromise = null;
  let loopDuration = 0;
  let isPlaying = false;
  let pendingPlay = null;
  let sourceEntries = [];
  let startOffset = 0;
  let startedAtContextTime = 0;
  let pausedOffset = 0;

  const trackStates = new Map(tracks.map((track) => {
    const gain = actx.createGain();
    gain.gain.value = track.id === activeTrackId ? 1 : 0;
    gain.connect(masterGain);
    return [track.id, { ...track, buffer: null, gain }];
  }));

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

  async function decodeTrack(track) {
    const response = await fetch(track.url);
    if (!response.ok) {
      throw new Error(`Failed to load ${track.url}: HTTP ${response.status}`);
    }
    return actx.decodeAudioData(await response.arrayBuffer());
  }

  function load() {
    if (loadPromise) return loadPromise;

    loadPromise = Promise.all(
      [...trackStates.values()].map(async (track) => {
        track.buffer = await decodeTrack(track);
        return track.buffer;
      })
    ).then((buffers) => {
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

    pendingPlay = (async () => {
      // Resume immediately while this call is still inside the user gesture.
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
    if (!isPlaying) return;

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
    if (!trackStates.has(trackId)) return false;
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
    if (isPlaying) pause();
    trackStates.forEach(({ gain }) => gain.disconnect());
    masterGain.disconnect();
    if (actx.state !== 'closed') actx.close().catch(console.warn);
  }

  return {
    actx,
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
