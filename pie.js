//2026.7.5
//pie - STARSHIP PIE docking station

import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';
import { FontLoader } from 'https://unpkg.com/three@0.180.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://unpkg.com/three@0.180.0/examples/jsm/geometries/TextGeometry.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
import { createSceneCameraRenderer } from './core/scene.js';
import { createSignBoardPlane as createSharedSignBoardPlane, attachSignText as attachSharedSignText } from './ui/signBoard.js';

// --------------------------------------
// Core: Scene / Camera / Renderer
// --------------------------------------
const { scene, camera, renderer } = createSceneCameraRenderer(THREE, {
  exposure: 0.82,
  cameraPosition: [0, 24, 64],
  far: 4200,
});
renderer.toneMapping = THREE.CineonToneMapping;
scene.fog = new THREE.FogExp2(0x02040f, 0.00042);

const clock = new THREE.Clock();
const gltfLoader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// --------------------------------------
// Font + sign helpers (same pattern as at.js)
// --------------------------------------
const fontLoader = new FontLoader();
let uiFont = null;
const textMatWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
const textMatCyan = new THREE.MeshBasicMaterial({ color: 0x9ff4ff });

function createSignBoardPlane(options = {}) {
  return createSharedSignBoardPlane(THREE, options);
}

function attachSignText(signMesh, text, size, material = textMatWhite, zOffset = 2) {
  return attachSharedSignText(THREE, TextGeometry, signMesh, uiFont, text, size, material, zOffset);
}

// --------------------------------------
// Lighting
// --------------------------------------
scene.add(new THREE.HemisphereLight(0x9fdcff, 0x050711, 1.2));

const keyLight = new THREE.DirectionalLight(0xeaf8ff, 5.5);
keyLight.position.set(80, 120, 90);
scene.add(keyLight);

const stationGlow = new THREE.PointLight(0x66ddff, 4.2, 360);
stationGlow.position.set(0, 12, 0);
scene.add(stationGlow);

const magentaBeacon = new THREE.PointLight(0xff66cc, 2.8, 280);
magentaBeacon.position.set(-32, 24, -24);
scene.add(magentaBeacon);

// --------------------------------------
// Star field / PIE nebula
// --------------------------------------
function createStarField() {
  const starCount = 1200;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const radius = 260 + Math.random() * 1500;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i * 3 + 1] = Math.cos(phi) * radius * 0.55;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xdff8ff,
    size: 1.6,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

const starField = createStarField();
scene.add(starField);

const pieNebula = new THREE.Mesh(
  new THREE.TorusKnotGeometry(34, 7, 180, 18),
  new THREE.MeshBasicMaterial({
    color: 0xff66cc,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
  })
);
pieNebula.position.set(0, -4, -28);
pieNebula.scale.set(1.5, 0.62, 1.5);
scene.add(pieNebula);

// --------------------------------------
// Docking station for spaceships
// --------------------------------------
const stationGroup = new THREE.Group();
scene.add(stationGroup);

function createDockingStation() {
  const group = new THREE.Group();

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x28323f,
    metalness: 0.72,
    roughness: 0.28,
    emissive: 0x02080d,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b1020, metalness: 0.45, roughness: 0.35 });
  const cyanMat = new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.78 });
  const pinkMat = new THREE.MeshBasicMaterial({ color: 0xff66cc, transparent: true, opacity: 0.72 });

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 8, 64), metalMat);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);

  const dockingRing = new THREE.Mesh(new THREE.TorusGeometry(18, 0.8, 16, 128), cyanMat);
  dockingRing.rotation.x = Math.PI / 2;
  dockingRing.position.z = 8;
  group.add(dockingRing);

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(25, 0.45, 12, 128), pinkMat);
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.z = 4;
  group.add(outerRing);

  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 15, 48, 1, true), darkMat);
  tunnel.rotation.x = Math.PI / 2;
  tunnel.position.z = 8;
  group.add(tunnel);

  const armGeo = new THREE.BoxGeometry(4, 3, 28);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(armGeo, metalMat);
    arm.rotation.z = (Math.PI / 2) * i;
    arm.position.z = 2;
    arm.position.x = Math.cos(arm.rotation.z) * 15;
    arm.position.y = Math.sin(arm.rotation.z) * 15;
    group.add(arm);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 12), i % 2 ? pinkMat : cyanMat);
    beacon.position.set(arm.position.x * 1.55, arm.position.y * 1.55, 15);
    group.add(beacon);
  }

  const guideLineGeo = new THREE.BoxGeometry(0.18, 0.18, 58);
  for (let i = 0; i < 8; i++) {
    const guide = new THREE.Mesh(guideLineGeo, cyanMat);
    const a = (i / 8) * Math.PI * 2;
    guide.position.set(Math.cos(a) * 12.5, Math.sin(a) * 12.5, 30);
    guide.rotation.z = a;
    group.add(guide);
  }

  return group;
}

stationGroup.add(createDockingStation());
stationGroup.position.set(0, 8, -18);
stationGroup.rotation.x = THREE.MathUtils.degToRad(8);

// --------------------------------------
// Dockable spaceship in holding pattern
// --------------------------------------
function fitModelToDockingScale(model, targetSize = 11) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z);
  if (maxAxis > 0) {
    const scale = targetSize / maxAxis;
    model.scale.multiplyScalar(scale);
  }

  const centeredBox = new THREE.Box3().setFromObject(model);
  const center = centeredBox.getCenter(new THREE.Vector3());
  model.position.sub(center);
}

function createSpaceship() {
  const group = new THREE.Group();

  gltfLoader.load('model/wpiessp.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    fitModelToDockingScale(model);
    model.rotation.y = Math.PI;
    group.add(model);
  }, undefined, (e) => console.error(e));

  return group;
}

const spaceship = createSpaceship();
scene.add(spaceship);

function createDistantUfo() {
  const group = new THREE.Group();
  group.position.set(-135, 76, -540);

  gltfLoader.load('model/wpieufo.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    fitModelToDockingScale(model, 34);
    model.rotation.set(THREE.MathUtils.degToRad(5), THREE.MathUtils.degToRad(-32), THREE.MathUtils.degToRad(-7));
    group.add(model);
  }, undefined, (e) => console.error(e));

  return group;
}

const distantUfo = createDistantUfo();
scene.add(distantUfo);

// --------------------------------------
// UI: title + navigation
// --------------------------------------
const titleSign = createSignBoardPlane({ width: 19, height: 3, bg: 'rgba(8,18,32,0.55)', glow: '#ff66cc' });
titleSign.position.set(0, 37, -18);
scene.add(titleSign);

const dockSign = createSignBoardPlane({ width: 15, height: 2.1, bg: 'rgba(5,10,18,0.48)', glow: '#66ddff' });
dockSign.position.set(0, -14, -10);
scene.add(dockSign);

const backSign = createSignBoardPlane({ width: 8, height: 2, bg: 'rgba(5,10,18,0.58)', glow: '#66ddff' });
backSign.position.set(0, -21, 3);
scene.add(backSign);

let titleText = null;
let dockText = null;
let backText = null;
function buildTexts() {
  if (!uiFont) return;
  if (!titleText) titleText = attachSignText(titleSign, 'STARSHIP PIE', 0.62, textMatWhite, 0.05);
  if (!dockText) dockText = attachSignText(dockSign, 'DOCKING STATION READY', 0.36, textMatCyan, 0.05);
  if (!backText) backText = attachSignText(backSign, 'BACK TO AT', 0.45, textMatWhite, 0.05);
}

fontLoader.load('fonts/dela.json', (font) => {
  uiFont = font;
  buildTexts();
}, undefined, (e) => console.error(e));
buildTexts();

// --------------------------------------
// Interaction
// --------------------------------------
const clickable = [backSign];
function handleClick(event) {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickable, true)[0];
  if (hit) window.location.assign('./at.html');
}
document.addEventListener('click', handleClick);

// --------------------------------------
// Resize / Animate
// --------------------------------------
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize, false);

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  starField.rotation.y += 0.0007;
  pieNebula.rotation.x += 0.0014;
  pieNebula.rotation.z -= 0.001;

  stationGroup.rotation.z = elapsed * 0.07;
  stationGlow.intensity = 3.2 + Math.sin(elapsed * 1.4) * 0.9;
  magentaBeacon.intensity = 2.2 + Math.cos(elapsed * 1.8) * 0.7;

  const dockProgress = (Math.sin(elapsed * 0.42) + 1) * 0.5;
  spaceship.position.set(
    Math.cos(elapsed * 0.42) * 28,
    8 + Math.sin(elapsed * 0.72) * 3,
    42 - dockProgress * 52
  );
  spaceship.rotation.y = -elapsed * 0.42 + Math.PI;
  spaceship.rotation.z = Math.sin(elapsed * 0.8) * 0.16;

  distantUfo.position.x = -135 + Math.sin(elapsed * 0.18) * 18;
  distantUfo.position.y = 76 + Math.sin(elapsed * 0.31) * 7;
  distantUfo.rotation.y = elapsed * 0.08;
  distantUfo.rotation.z = Math.sin(elapsed * 0.22) * 0.08;

  camera.position.x = Math.sin(elapsed * 0.12) * 5;
  camera.position.y = 24 + Math.sin(elapsed * 0.1) * 2;
  camera.lookAt(0, 8, -16);

  renderer.render(scene, camera);
}
animate();

window.addEventListener('beforeunload', () => {
  scene.traverse((obj) => {
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) obj.material.forEach((mat) => mat.dispose?.());
    else obj.material?.dispose?.();
  });
  renderer.dispose();
});
