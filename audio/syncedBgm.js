// Sample-aligned looping and crossfading for alternate renders of one song.
// Only the active track is decoded. During a crossfade, the incoming track is
// decoded as well, then the outgoing AudioBuffer is released.
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
  const encodedTracks = new Map(tracks.map((track) => [
    track.id,
    { ...track, arrayBuffer: null },
  ]));
  const decodedBuffers = new Map();

  let activeTrackId = initialId;
  let actx = null;
  let masterGain = null;
  let preloadPromise = null;
  let loadPromise = null;
  let loopDuration = 0;
  let isPlaying = false;
  let pendingPlay = null;
  let transitionPromise = null;
  let transitionGeneration = 0;
  let requestedCrossfadeSec = defaultCrossfadeSec;
  let sourceEntries = [];
  let startOffset = 0;
  let startedAtContextTime = 0;
  let pausedOffset = 0;

  function ensureAudioGraph() {
    if (actx) return;
    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this browser.');
    }

    // This is called synchronously from the pointer handler.
    actx = new AudioContextClass();
    masterGain = actx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(actx.destination);
  }

  function unlockFromUserGesture() {
    ensureAudioGraph();

    // Starting a silent, one-sample buffer inside the first tap reliably
    // unlocks Web Audio on iOS/WebKit while the MP3 is decoded asynchronously.
    const source = actx.createBufferSource();
    source.buffer = actx.createBuffer(1, 1, actx.sampleRate);
    source.connect(masterGain);
    source.start(0);

    return actx.state === 'running' ? Promise.resolve() : actx.resume();
  }

  function normalizeOffset(seconds) {
    if (!(loopDuration > 0)) return 0;
    return ((seconds % loopDuration) + loopDuration) % loopDuration;
  }

  function getCurrentTimeAt(contextTime) {
    if (!isPlaying) return normalizeOffset(pausedOffset);
    const elapsed = Math.max(0, contextTime - startedAtContextTime);
    return normalizeOffset(startOffset + elapsed);
  }

  function getCurrentTime() {
    if (!actx || !isPlaying) return normalizeOffset(pausedOffset);
    return getCurrentTimeAt(actx.currentTime);
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

  async function decodeTrack(trackId) {
    const cached = decodedBuffers.get(trackId);
    if (cached) return cached;

    const encodedTrack = encodedTracks.get(trackId);
    if (!encodedTrack?.arrayBuffer) {
      await preload();
    }

    // Safari may detach the supplied ArrayBuffer while decoding, so decode a copy.
    const buffer = await actx.decodeAudioData(
      encodedTracks.get(trackId).arrayBuffer.slice(0)
    );
    decodedBuffers.set(trackId, buffer);

    if (!(loopDuration > 0)) {
      loopDuration = buffer.duration;
    } else {
      const durationDifference = Math.abs(buffer.duration - loopDuration);
      if (durationDifference > 1 / actx.sampleRate) {
        console.warn(
          `Synced BGM duration for ${trackId} differs by `
          + `${durationDifference.toFixed(6)} seconds.`
        );
      }
    }

    return buffer;
  }

  async function loadActiveTrack() {
    await preload();

    // The selected mode can change while preload/decode is pending.
    while (true) {
      const requestedTrackId = activeTrackId;
      const buffer = await decodeTrack(requestedTrackId);
      if (requestedTrackId === activeTrackId) return buffer;
      decodedBuffers.delete(requestedTrackId);
    }
  }

  function load() {
    ensureAudioGraph();
    if (loadPromise) return loadPromise;

    loadPromise = loadActiveTrack().then(() => ({
      duration: loopDuration,
    })).catch((error) => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  function createSourceEntry(trackId, buffer, startAt, offset, initialGain) {
    const gain = actx.createGain();
    gain.gain.setValueAtTime(initialGain, actx.currentTime);
    gain.connect(masterGain);

    const source = actx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = Math.min(loopDuration, buffer.duration);
    source.connect(gain);
    source.start(startAt, normalizeOffset(offset));
    return { source, gain, trackId };
  }

  function stopEntry(entry, when = 0) {
    try {
      entry.source.stop(when);
    } catch (error) {
      console.warn(error);
    }
    try {
      entry.source.disconnect();
      entry.gain.disconnect();
    } catch (error) {
      console.warn(error);
    }
  }

  function scheduleInitialSource(buffer) {
    const startAt = actx.currentTime + 0.04;
    const normalizedOffset = normalizeOffset(pausedOffset);
    masterGain.gain.cancelScheduledValues(actx.currentTime);
    masterGain.gain.setValueAtTime(1, actx.currentTime);

    sourceEntries = [
      createSourceEntry(activeTrackId, buffer, startAt, normalizedOffset, 1),
    ];
    startOffset = normalizedOffset;
    startedAtContextTime = startAt;
    isPlaying = true;
  }

  function waitUntilContextTime(contextTime) {
    const waitMs = Math.max(0, (contextTime - actx.currentTime) * 1000);
    return new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  async function crossfadeOnce(trackId, durationSec) {
    const generation = transitionGeneration;
    const buffer = await decodeTrack(trackId);
    if (!isPlaying || generation !== transitionGeneration || trackId !== activeTrackId) {
      if (!sourceEntries.some((entry) => entry.trackId === trackId)) {
        decodedBuffers.delete(trackId);
      }
      return;
    }

    const duration = Math.max(0, durationSec);
    const startAt = actx.currentTime + 0.04;
    const endAt = startAt + duration;
    const offsetAtStart = getCurrentTimeAt(startAt);
    const outgoingEntries = sourceEntries.slice();
    const incomingEntry = createSourceEntry(trackId, buffer, startAt, offsetAtStart, 0);
    sourceEntries.push(incomingEntry);

    outgoingEntries.forEach((entry) => {
      entry.gain.gain.cancelScheduledValues(startAt);
      entry.gain.gain.setValueAtTime(entry.gain.gain.value, startAt);
      entry.gain.gain.linearRampToValueAtTime(0, endAt);
      try {
        entry.source.stop(endAt + 0.03);
      } catch (error) {
        console.warn(error);
      }
    });
    incomingEntry.gain.gain.setValueAtTime(0, startAt);
    incomingEntry.gain.gain.linearRampToValueAtTime(1, endAt);

    await waitUntilContextTime(endAt + 0.04);
    if (!isPlaying || generation !== transitionGeneration) return;

    outgoingEntries.forEach((entry) => {
      try {
        entry.source.disconnect();
        entry.gain.disconnect();
      } catch (error) {
        console.warn(error);
      }
      decodedBuffers.delete(entry.trackId);
    });
    sourceEntries = [incomingEntry];
  }

  function requestTransition() {
    if (!isPlaying || transitionPromise) return;

    transitionPromise = (async () => {
      while (isPlaying) {
        const currentTrackId = sourceEntries.length === 1
          ? sourceEntries[0].trackId
          : null;
        if (currentTrackId === activeTrackId) break;

        const requestedTrackId = activeTrackId;
        await crossfadeOnce(requestedTrackId, requestedCrossfadeSec);
      }
    })().catch((error) => {
      console.error('Unable to crossfade synchronized ROUND audio.', error);
    }).finally(() => {
      transitionPromise = null;
      const currentTrackId = sourceEntries.length === 1
        ? sourceEntries[0].trackId
        : null;
      if (isPlaying && currentTrackId !== activeTrackId) {
        requestTransition();
      }
    });
  }

  async function play() {
    if (isPlaying) return;
    if (pendingPlay) return pendingPlay;

    // Both calls happen before the first async boundary.
    ensureAudioGraph();
    const unlockPromise = unlockFromUserGesture();

    pendingPlay = (async () => {
      await unlockPromise;
      const buffer = await loadActiveTrack();
      if (actx.state !== 'running') await actx.resume();
      if (!isPlaying) scheduleInitialSource(buffer);
    })().finally(() => {
      pendingPlay = null;
    });

    return pendingPlay;
  }

  function pause() {
    if (!actx || !isPlaying) return;

    pausedOffset = getCurrentTime();
    isPlaying = false;
    transitionGeneration += 1;
    const stopAt = actx.currentTime + 0.025;

    masterGain.gain.cancelScheduledValues(actx.currentTime);
    masterGain.gain.setValueAtTime(masterGain.gain.value, actx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, stopAt);
    sourceEntries.forEach((entry) => {
      try {
        entry.source.stop(stopAt);
      } catch (error) {
        console.warn(error);
      }
    });

    const retainedBuffer = decodedBuffers.get(activeTrackId);
    decodedBuffers.clear();
    if (retainedBuffer) decodedBuffers.set(activeTrackId, retainedBuffer);
    sourceEntries = [];
  }

  function setTrack(trackId, durationSec = defaultCrossfadeSec) {
    if (!trackIds.has(trackId)) return false;
    activeTrackId = trackId;
    requestedCrossfadeSec = Math.max(0, durationSec);

    if (isPlaying) {
      requestTransition();
    } else {
      const retainedBuffer = decodedBuffers.get(trackId);
      decodedBuffers.clear();
      if (retainedBuffer) decodedBuffers.set(trackId, retainedBuffer);
    }
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
    transitionGeneration += 1;
    sourceEntries.forEach((entry) => stopEntry(entry));
    sourceEntries = [];
    decodedBuffers.clear();
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
