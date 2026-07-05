// Shared loading overlay that keeps the Three.js canvas hidden until tracked assets are ready.
export function createLoadingManager(THREE, renderer, {
  title = 'LOADING',
  minDisplayMs = 450,
  fadeMs = 450,
} = {}) {
  const startedAt = performance.now();
  const manager = new THREE.LoadingManager();

  renderer.domElement.style.visibility = 'hidden';

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at center, rgba(18, 56, 72, 0.96), rgba(0, 0, 0, 0.98) 62%);
    color: #eaffff;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    letter-spacing: 0.18em;
    transition: opacity ${fadeMs}ms ease;
  `;

  overlay.innerHTML = `
    <div style="width:min(72vw,360px); text-align:center;">
      <div style="font-size:14px; margin-bottom:18px; opacity:.82;">${title}</div>
      <div style="height:3px; width:100%; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.18); box-shadow:0 0 24px rgba(102,221,255,.28);">
        <div data-loading-bar style="height:100%; width:0%; border-radius:inherit; background:linear-gradient(90deg,#66ddff,#ff66cc); transition:width 180ms ease;"></div>
      </div>
      <div data-loading-count style="margin-top:14px; font-size:11px; letter-spacing:.08em; color:rgba(234,255,255,.62);">preparing scene...</div>
    </div>
  `;

  document.body.appendChild(overlay);
  const bar = overlay.querySelector('[data-loading-bar]');
  const count = overlay.querySelector('[data-loading-count]');

  function setProgress(loaded, total) {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    bar.style.width = `${Math.max(6, pct)}%`;
    count.textContent = total > 0 ? `${loaded} / ${total} assets` : 'preparing scene...';
  }

  manager.onStart = (_url, loaded, total) => setProgress(loaded, total);
  manager.onProgress = (_url, loaded, total) => setProgress(loaded, total);
  manager.onError = (url) => {
    console.warn(`Failed to load asset: ${url}`);
  };
  manager.onLoad = () => {
    setProgress(1, 1);
    const wait = Math.max(0, minDisplayMs - (performance.now() - startedAt));
    window.setTimeout(() => {
      renderer.domElement.style.visibility = 'visible';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      window.setTimeout(() => overlay.remove(), fadeMs);
    }, wait);
  };

  return manager;
}
