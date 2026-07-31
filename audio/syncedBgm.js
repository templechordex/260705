// Streaming, position-synchronised playback for alternate renders of one song.
// Media elements keep compressed audio out of the JS/PCM heap. Only the current
// track plays normally; a second track is started and aligned on demand while
// crossfading.
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
  const mediaById = new Map(tracks.map((track) => {
    const media = new Audio();
    media.preload = 'auto';
    media.loop = true;
    media.playsInline = true;
    media.src = track.url;
    return [track.id, media];
  }));

  let activeTrackId = initialId;
  let currentTrackId = initialId;
  let actx = null;
  let masterGain = null;
  let gainsById = new Map();
  let preloadPromise = null;
  const primingPromises = new Map();
  let isPlaying = false;
  let pendingPlay = null;
  let transitionPromise = null;
  let transitionGeneration = 0;
  let requestedCrossfadeSec = defaultCrossfadeSec;
  let pausedOffset = 0;

  function mediaFor(trackId) {
    return mediaById.get(trackId);
  }

  function durationFor(trackId = currentTrackId) {
    const duration = mediaFor(trackId)?.duration;
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  function normalizeOffset(seconds, trackId = currentTrackId) {
    const duration = durationFor(trackId);
    if (!(duration > 0)) return Math.max(0, seconds || 0);
    return ((seconds % duration) + duration) % duration;
  }

  function waitForMediaEvent(media, successEvents, timeoutMs = 15000) {
    if (media.error) {
      return Promise.reject(new Error(`Failed to load ${media.currentSrc || media.src}.`));
    }

    return new Promise((resolve, reject) => {
      let timeoutId;
      const cleanup = () => {
        successEvents.forEach((eventName) => media.removeEventListener(eventName, onSuccess));
        media.removeEventListener('error', onError);
        clearTimeout(timeoutId);
      };
      const onSuccess = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load ${media.currentSrc || media.src}.`));
      };

      successEvents.forEach((eventName) => media.addEventListener(eventName, onSuccess, { once: true }));
      media.addEventListener('error', onError, { once: true });
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out loading ${media.currentSrc || media.src}.`));
      }, timeoutMs);
    });
  }

  async function ensureMetadata(media) {
    if (media.readyState >= 1 && Number.isFinite(media.duration)) return;
    media.load();
    await waitForMediaEvent(media, ['loadedmetadata', 'durationchange']);
  }

  function preload() {
    if (preloadPromise) return preloadPromise;

    // Start compressed-media loading without decoding entire songs into memory.
    mediaById.forEach((media) => media.load());
    const initialMedia = mediaFor(activeTrackId);
    preloadPromise = ensureMetadata(initialMedia)
      .then(() => ({ preloaded: true }))
      .catch((error) => {
        preloadPromise = null;
        throw error;
      });
    return preloadPromise;
  }

  function ensureAudioGraph() {
    if (actx) return;
    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this browser.');
    }

    // This runs synchronously inside the pointer event on the first play.
    actx = new AudioContextClass();
    masterGain = actx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(actx.destination);

    tracks.forEach(({ id }) => {
      const gain = actx.createGain();
      gain.gain.value = id === currentTrackId ? 1 : 0;
      gain.connect(masterGain);
      actx.createMediaElementSource(mediaFor(id)).connect(gain);
      gainsById.set(id, gain);
    });
  }

  function setGainImmediately(trackId, value) {
    const gain = gainsById.get(trackId);
    if (!gain || !actx) return;
    gain.gain.cancelScheduledValues(actx.currentTime);
    gain.gain.setValueAtTime(value, actx.currentTime);
  }

  function silenceAndPauseExcept(trackId) {
    mediaById.forEach((media, id) => {
      setGainImmediately(id, id === trackId ? 1 : 0);
      if (id !== trackId) media.pause();
    });
  }

  function primeInactiveMediaFromGesture(activeId) {
    mediaById.forEach((media, id) => {
      if (id === activeId || primingPromises.has(id)) return;

      // Calling play() here, synchronously inside the first SOUND tap, grants
      // every variant permission to start later even when iOS ignored preload.
      const promise = media.play()
        .then(() => {
          if (id !== activeTrackId && id !== currentTrackId) media.pause();
        })
        .catch(() => {
          // The selected track still starts normally. A later mode-button tap
          // gets another user gesture and can retry this variant.
        })
        .finally(() => {
          primingPromises.delete(id);
        });
      primingPromises.set(id, promise);
    });
  }

  async function play() {
    if (isPlaying) return;
    if (pendingPlay) return pendingPlay;

    ensureAudioGraph();
    const media = mediaFor(activeTrackId);
    const normalizedOffset = normalizeOffset(pausedOffset, activeTrackId);

    // Both calls are made before an async boundary so iOS treats them as part
    // of the user's tap. The media element provides the audible unlock.
    const resumePromise = actx.state === 'running' ? Promise.resolve() : actx.resume();
    if (media.readyState >= 1 && Math.abs(media.currentTime - normalizedOffset) > 0.001) {
      media.currentTime = normalizedOffset;
    }
    const mediaPlayPromise = media.play();
    primeInactiveMediaFromGesture(activeTrackId);

    pendingPlay = (async () => {
      await Promise.all([resumePromise, mediaPlayPromise]);
      if (media.readyState < 1) await ensureMetadata(media);
      if (Math.abs(media.currentTime - normalizedOffset) > 0.012) {
        media.currentTime = normalizedOffset;
        if (media.seeking) {
          await waitForMediaEvent(media, ['seeked'], 5000);
        }
      }
      currentTrackId = activeTrackId;
      silenceAndPauseExcept(currentTrackId);
      pausedOffset = media.currentTime;
      isPlaying = true;
    })().catch((error) => {
      media.pause();
      throw error;
    }).finally(() => {
      pendingPlay = null;
    });

    return pendingPlay;
  }

  function getCurrentTime() {
    if (!isPlaying) return normalizeOffset(pausedOffset, currentTrackId);
    return normalizeOffset(mediaFor(currentTrackId).currentTime, currentTrackId);
  }

  function waitForContextTime(contextTime) {
    const waitMs = Math.max(0, (contextTime - actx.currentTime) * 1000);
    return new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  async function alignIncomingMedia(incoming, outgoing) {
    await ensureMetadata(incoming);
    incoming.currentTime = normalizeOffset(outgoing.currentTime, activeTrackId);
    await incoming.play();

    // Correct once after playback has actually begun. Inactive tracks no
    // longer run in the background, so there is no accumulated drift.
    const correction = normalizeOffset(outgoing.currentTime, activeTrackId);
    if (Math.abs(incoming.currentTime - correction) > 0.012) {
      incoming.currentTime = correction;
      if (incoming.seeking) {
        await waitForMediaEvent(incoming, ['seeked'], 5000);
      }
    }
  }

  async function crossfadeOnce(trackId, durationSec) {
    const generation = transitionGeneration;
    const outgoingId = currentTrackId;
    const outgoing = mediaFor(outgoingId);
    const incoming = mediaFor(trackId);

    await alignIncomingMedia(incoming, outgoing);
    if (!isPlaying || generation !== transitionGeneration || trackId !== activeTrackId) {
      incoming.pause();
      setGainImmediately(trackId, 0);
      return;
    }

    const duration = Math.max(0, durationSec);
    const startAt = actx.currentTime + 0.04;
    const endAt = startAt + duration;
    const outgoingGain = gainsById.get(outgoingId).gain;
    const incomingGain = gainsById.get(trackId).gain;

    outgoingGain.cancelScheduledValues(startAt);
    outgoingGain.setValueAtTime(outgoingGain.value, startAt);
    outgoingGain.linearRampToValueAtTime(0, endAt);
    incomingGain.cancelScheduledValues(startAt);
    incomingGain.setValueAtTime(0, startAt);
    incomingGain.linearRampToValueAtTime(1, endAt);

    await waitForContextTime(endAt + 0.04);
    if (!isPlaying || generation !== transitionGeneration) return;

    outgoing.pause();
    setGainImmediately(outgoingId, 0);
    setGainImmediately(trackId, 1);
    currentTrackId = trackId;
    pausedOffset = incoming.currentTime;
  }

  function requestTransition() {
    if (!isPlaying || transitionPromise) return;

    transitionPromise = (async () => {
      while (isPlaying && currentTrackId !== activeTrackId) {
        const requestedTrackId = activeTrackId;
        await crossfadeOnce(requestedTrackId, requestedCrossfadeSec);
      }
    })().catch((error) => {
      console.error('Unable to crossfade synchronized ROUND audio.', error);
      silenceAndPauseExcept(currentTrackId);
    }).finally(() => {
      transitionPromise = null;
      if (isPlaying && currentTrackId !== activeTrackId) requestTransition();
    });
  }

  function pause() {
    if (!actx || !isPlaying) return;

    pausedOffset = getCurrentTime();
    isPlaying = false;
    transitionGeneration += 1;
    mediaById.forEach((media, id) => {
      media.pause();
      setGainImmediately(id, id === activeTrackId ? 1 : 0);
    });
    currentTrackId = activeTrackId;
  }

  function setTrack(trackId, durationSec = defaultCrossfadeSec) {
    if (!trackIds.has(trackId)) return false;
    activeTrackId = trackId;
    requestedCrossfadeSec = Math.max(0, durationSec);
    if (isPlaying) requestTransition();
    return true;
  }

  function reset() {
    pausedOffset = 0;
    mediaById.forEach((media) => {
      try {
        media.currentTime = 0;
      } catch {
        // Metadata may not be ready yet; play() will apply the offset.
      }
    });
  }

  function destroy() {
    if (isPlaying) pause();
    transitionGeneration += 1;
    mediaById.forEach((media) => {
      media.pause();
      media.removeAttribute('src');
      media.load();
    });
    gainsById.forEach((gain) => gain.disconnect());
    gainsById.clear();
    masterGain?.disconnect();
    if (actx && actx.state !== 'closed') actx.close().catch(console.warn);
  }

  return {
    get actx() { return actx; },
    preload,
    load: preload,
    play,
    pause,
    reset,
    destroy,
    setTrack,
    getCurrentTime,
    getDuration: () => durationFor(),
    getActiveTrackId: () => activeTrackId,
    isPlaying: () => isPlaying,
  };
}
