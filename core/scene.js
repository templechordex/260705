// Shared Three.js scene/camera/renderer bootstrap.
export function createSceneCameraRenderer(THREE, {
  background = 0x000000,
  fov = 75,
  near = 0.1,
  far = 3000,
  cameraPosition = [0, 20, 20],
  exposure = 1,
  antialias = true,
  powerPreference = 'high-performance',
} = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(
    fov,
    window.innerWidth / window.innerHeight,
    near,
    far
  );
  camera.position.set(...cameraPosition);

  const renderer = new THREE.WebGLRenderer({ antialias, powerPreference });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = false;
  document.body.appendChild(renderer.domElement);

  return { scene, camera, renderer };
}
