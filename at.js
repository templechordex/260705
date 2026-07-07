//2026.7.5
//at

import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';
import { FontLoader }   from 'https://unpkg.com/three@0.180.0/examples/jsm/loaders/FontLoader.js';
import { GLTFLoader }   from 'https://unpkg.com/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
import { TextGeometry } from 'https://unpkg.com/three@0.180.0/examples/jsm/geometries/TextGeometry.js';

// PostProcessing
import { EffectComposer } from 'https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }     from 'https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass }     from 'https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/ShaderPass.js';

import { addObjeToScene } from './atobje.js';
import { createSceneCameraRenderer } from './core/scene.js';
import { createLoadingManager } from './core/loadingScreen.js';
import { animateCameraToPositionAndTarget as tweenCamera } from './core/cameraTween.js';
import { createSignBoardPlane as createSharedSignBoardPlane, attachSignText as attachSharedSignText } from './ui/signBoard.js';
import { createPsyAudioGraph } from './audio/psyAudio.js';

// --------------------------------------
// Core: Scene / Camera / Renderer
// --------------------------------------
const { scene, camera, renderer } = createSceneCameraRenderer(THREE, { exposure: 0.78 });
const loadingManager = createLoadingManager(THREE, renderer, { title: 'LOADING SCENE' });
renderer.toneMapping = THREE.CineonToneMapping;

// --------------------------------------
// Post FX
// 1) Euphoric pastel glow (elephant toggle)
// 2) Rainbow fullscreen (flag click transition)
// --------------------------------------
const EuphoricShader = {
  uniforms: {
    tDiffuse: { value: null },
    time:     { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float time;

    vec3 hueShift(vec3 color, float shift){
      const mat3 toYIQ = mat3(
        0.299,     0.587,     0.114,
        0.595716, -0.274453, -0.321263,
        0.211456, -0.522591,  0.311135
      );
      const mat3 toRGB = mat3(
        1.0,  0.9563,  0.6210,
        1.0, -0.2721, -0.6474,
        1.0, -1.1070,  1.7046
      );
      vec3 yiq = toYIQ * color;
      float hue = atan(yiq.z, yiq.y) + shift;
      float chroma = sqrt(yiq.y*yiq.y + yiq.z*yiq.z);
      vec3 yiq2 = vec3(yiq.x, chroma * cos(hue), chroma * sin(hue));
      return clamp(toRGB * yiq2, 0.0, 1.0);
    }

    vec3 softGlow(sampler2D tex, vec2 uv, float r){
      vec2 o1 = vec2( r, 0.0);
      vec2 o2 = vec2(0.0,  r);
      vec2 o3 = vec2( r,  r);
      vec2 o4 = vec2(-r,  r);

      vec3 c  = texture2D(tex, uv).rgb * 0.36;
      c += texture2D(tex, uv + o1).rgb * 0.12;
      c += texture2D(tex, uv - o1).rgb * 0.12;
      c += texture2D(tex, uv + o2).rgb * 0.12;
      c += texture2D(tex, uv - o2).rgb * 0.12;
      c += texture2D(tex, uv + o3).rgb * 0.08;
      c += texture2D(tex, uv - o3).rgb * 0.08;
      c += texture2D(tex, uv + o4).rgb * 0.08;
      c += texture2D(tex, uv - o4).rgb * 0.08;
      return c;
    }

    void main(){
      float t = time;

      vec2 uv = vUv;
      uv.x += 0.003 * sin( (uv.y + t*0.4) * 6.0 );
      uv.y += 0.003 * cos( (uv.x + t*0.4) * 6.0 );

      vec3 base = texture2D(tDiffuse, uv).rgb;

      vec3 glow = softGlow(tDiffuse, uv, 0.004 + 0.002*sin(t*0.6));
      vec3 mixed = mix(base, glow, 0.55);

      mixed = hueShift(mixed, 0.25 * sin(t * 0.35));

      vec2  center = vec2(0.5, 0.5);
      float r = distance(uv, center);
      float warmMix = smoothstep(0.9, 0.2, r);
      vec3 warmTint = vec3(1.0, 0.88, 0.72);
      vec3 coolTint = vec3(0.92, 0.98, 1.0);
      vec3 tint = mix(coolTint, warmTint, 1.0 - warmMix);
      mixed *= tint;

      mixed = pow(mixed, vec3(0.95));

      gl_FragColor = vec4(mixed, 1.0);
    }
  `
};



let composer, renderPass, psyPass;
let psyOn = false;           

function initPostFX(){
  composer   = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  psyPass = new ShaderPass(EuphoricShader);
  psyPass.enabled = false;
  composer.addPass(psyPass);

}
initPostFX();


// --------------------------------------
// Utilities
// --------------------------------------
const _v2  = new THREE.Vector2();
const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v3c = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
const textureLoader = new THREE.TextureLoader(loadingManager);
const gltfLoader = new GLTFLoader(loadingManager);

// --------------------------------------
// Font (unified) + text helpers
// --------------------------------------
const fontLoader = new FontLoader(loadingManager);
let uiFont = null;

const textMatWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });

// 看板の板（Canvasで背景とフレームのみ）+ テキストはTextGeometryで前面に
function createSignBoardPlane(options = {}) {
  return createSharedSignBoardPlane(THREE, options);
}

// 看板テキスト（TextGeometry）を看板メッシュに子として取り付け
function attachSignText(signMesh, text, size, material = textMatWhite, zOffset = 2) {
  return attachSharedSignText(THREE, TextGeometry, signMesh, uiFont, text, size, material, zOffset);
}

// フォントの読み込み（統一フォント）
fontLoader.load('fonts/dela.json', (font) => {
  uiFont = font;
  tryBuildAllLabels();
}, undefined, (e) => console.error(e));

// --------------------------------------
// Fog 大きくすると遠くが見えなくなる
// --------------------------------------
scene.fog = new THREE.FogExp2(0x050510, 0.0005);

// --------------------------------------
// From obje.js  (musicRoom設置)
// --------------------------------------
const spaceshipInterior = addObjeToScene(scene);

// atページではバブルUIを使わず、室内オブジェクトとモニター操作に絞る。

// --------------------------------------
// Lights (spaceship interior / cool neon)
// --------------------------------------

// 宇宙船内をイメージした、少し暗めの青白い環境光
const hemiLight = new THREE.HemisphereLight(
  0x9fdcff,
  0x101827,
  1.25
);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xd8f7ff, 6);
dirLight.position.set(160, 120, -140);
scene.add(dirLight);

const fillLight = new THREE.PointLight(0x66ccff, 2.2, 260);
fillLight.position.set(-35, 18, -25);
scene.add(fillLight);

const backLight = new THREE.PointLight(0x55f6ff, 3.2, 360);
backLight.position.set(0, 28, 70);
scene.add(backLight);

// --------------------------------------
// Spaceship Monitor: 新規シーン + imgbox1&#12316;3
// --------------------------------------

// モニター専用の独立シーン（メインsceneとは別）
const monitorScene = new THREE.Scene();

// レンダーターゲット（前回の例と同じ）
const monitorRenderTarget = new THREE.WebGLRenderTarget(512, 512, {
  colorSpace: THREE.SRGBColorSpace
});

// モニター用カメラ（monitorSceneを撮影）
const monitorCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
monitorCamera.position.set(0, 0, 30);
monitorCamera.lookAt(0, 0, 0);

// 画像を貼ったジオメトリを3つ作成するヘルパー
function createImgBox(url, width = 12, height = 12) {
  const tex = textureLoader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

// 3つとも同じ位置に重ねて配置し、visibleで切り替える
const imgbox1 = createImgBox('img/10do.jpg');
const imgbox2 = createImgBox('img/ssp.jpg');
const imgbox3 = createImgBox('img/mz.png');
const imgbox4 = createImgBox('img/pm.jpg');

imgbox1.position.set(0, 1.25, 0);
imgbox2.position.set(0, 1.25, 0);
imgbox3.position.set(0, 1.25, 0);
imgbox4.position.set(0, 1.25, 0);

monitorScene.add(imgbox1, imgbox2, imgbox3,imgbox4);

const imgboxes = [imgbox1, imgbox2, imgbox3,imgbox4];
const imgboxLabels = [
  { title: '1stEP : 10ド', releaseDate: '2022.12.09' },
  { title: '2ndAlbum : STARSHIP PIE', releaseDate: '2022.09.08' },
  { title: '1stSingle : Muzak', releaseDate: '2021.05.18' },
  { title: '1stAlbum : PARK MINDS', releaseDate: '2020.10.30' }
];
const imgboxLabelMeshes = imgboxLabels.map(({ title, releaseDate }) => createMonitorLabel(title, releaseDate));
const aboutTextPlane = createMonitorAboutText();
aboutTextPlane.visible = false;
monitorScene.add(...imgboxLabelMeshes, aboutTextPlane);
let currentImgIndex = 0;
let monitorMode = 'releases';

function showImgbox(index) {
  currentImgIndex = (index + imgboxes.length) % imgboxes.length; // 範囲外をループさせる
  if (monitorMode === 'releases') {
    showReleasesView(false);
  }
}

function showReleasesView(syncButtonText = true) {
  monitorMode = 'releases';
  imgboxes.forEach((box, i) => {
    box.visible = (i === currentImgIndex);
  });
  imgboxLabelMeshes.forEach((label, i) => {
    label.visible = (i === currentImgIndex);
  });
  aboutTextPlane.visible = false;
  if (syncButtonText) updateAboutButtonText();
}

function showAboutView() {
  monitorMode = 'about';
  imgboxes.forEach((box) => {
    box.visible = false;
  });
  imgboxLabelMeshes.forEach((label) => {
    label.visible = false;
  });
  aboutTextPlane.visible = true;
  updateAboutButtonText();
}

function toggleMonitorMode() {
  if (monitorMode === 'about') {
    showReleasesView();
  } else {
    showAboutView();
  }
}

showImgbox(0); // 初期表示はimgbox1

function createMonitorLabel(title, releaseDate, width = 24, height = 4) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 320;
  const ctx2d = canvas.getContext('2d');

  const gradient = ctx2d.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, 'rgba(2, 10, 20, 0.72)');
  gradient.addColorStop(0.5, 'rgba(8, 28, 48, 0.88)');
  gradient.addColorStop(1, 'rgba(2, 10, 20, 0.72)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);

  ctx2d.strokeStyle = '#66ddff';
  ctx2d.lineWidth = 10;
  ctx2d.shadowColor = '#66ddff';
  ctx2d.shadowBlur = 34;
  ctx2d.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  ctx2d.shadowBlur = 0;
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  const monitorLabelFont = 'bold 76px sans-serif';
  ctx2d.fillStyle = '#f8fdff';
  ctx2d.font = monitorLabelFont;
  ctx2d.fillText(title, canvas.width / 2, canvas.height * 0.42);

  ctx2d.fillStyle = '#9feeff';
  ctx2d.font = monitorLabelFont;
  ctx2d.fillText(releaseDate, canvas.width / 2, canvas.height * 0.68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const geo = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, -7.35, 0.35);
  mesh.userData._dispose = () => { tex.dispose(); geo.dispose(); mat.dispose(); };
  return mesh;
}


function createMonitorAboutText(width = 22, height = 15) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 820;
  const ctx2d = canvas.getContext('2d');

  const gradient = ctx2d.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(2, 10, 20, 0.92)');
  gradient.addColorStop(0.5, 'rgba(8, 28, 48, 0.96)');
  gradient.addColorStop(1, 'rgba(2, 10, 20, 0.92)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);

  ctx2d.strokeStyle = '#66ddff';
  ctx2d.lineWidth = 10;
  ctx2d.shadowColor = '#66ddff';
  ctx2d.shadowBlur = 34;
  ctx2d.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
  ctx2d.shadowBlur = 0;

  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillStyle = '#f8fdff';
  ctx2d.font = 'bold 82px sans-serif';
  ctx2d.fillText('ANJI TERAOKA', canvas.width / 2, 125);

  ctx2d.fillStyle = '#9feeff';
  ctx2d.font = 'bold 44px sans-serif';
  ctx2d.fillText('ABOUT', canvas.width / 2, 195);

  ctx2d.textAlign = 'left';
  ctx2d.fillStyle = '#f8fdff';
  const lines = [
    { text: '音楽と音楽を再生できるWebページの制作をしています。', font: '38px sans-serif' },
    { text: '', gap: 56 },
    { text: 'I create music and web pages', font: '44px sans-serif' },
    { text: 'where music can be played.', font: '44px sans-serif' },
  ];
  const startX = 80;
  let y = 315;
  lines.forEach((line) => {
    if (!line.text) {
      y += line.gap ?? 42;
      return;
    }
    ctx2d.font = line.font;
    ctx2d.fillText(line.text, startX, y);
    y += 68;
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const geo = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, 0.4);
  mesh.userData._dispose = () => { tex.dispose(); geo.dispose(); mat.dispose(); };
  return mesh;
}

// --------------------------------------
// モニター画面（メインsceneに設置）
// --------------------------------------
const monitorWidth  = 20;
const monitorHeight = 20;

const monitorGeometry = new THREE.PlaneGeometry(monitorWidth, monitorHeight);
const monitorMaterial = new THREE.MeshBasicMaterial({
  map: monitorRenderTarget.texture,
  transparent: true,
  opacity: 0.85,
  depthWrite: false
});
const monitorScreen = new THREE.Mesh(monitorGeometry, monitorMaterial);
monitorScreen.position.set(0, 24, -10);
scene.add(monitorScreen);

// フレーム（画面の少し奥に配置）
// const monitorFrame = createMonitorFrame(monitorWidth, monitorHeight);
// monitorFrame.position.set(
//   monitorScreen.position.x,
//   monitorScreen.position.y,
//   monitorScreen.position.z - 0.2
// );
// scene.add(monitorFrame);

// 走査線オーバーレイ（画面の少し手前に配置）
const monitorOverlay = createScreenOverlay(monitorWidth, monitorHeight);
monitorOverlay.position.set(
  monitorScreen.position.x,
  monitorScreen.position.y,
  monitorScreen.position.z + 0.05
);
scene.add(monitorOverlay);

// --------------------------------------
// モニターフレーム（金属ベゼル + コーナーディテール）
// --------------------------------------
function createMonitorFrame(width, height, {
  bezelColor = '#1a1d24',
  panelColor = '#2a2e38',
  accentColor = '#66ddff',
  rivetColor = '#0a0c10'
} = {}) {
  const cw = 1024, ch = Math.round(1024 * (height / width));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx2d = canvas.getContext('2d');

  const bezel = 60; // フレームの太さ(px)

  // 外側の金属パネル
  ctx2d.fillStyle = bezelColor;
  ctx2d.fillRect(0, 0, cw, ch);

  // パネルのグラデーション（金属っぽい光沢）
  const grad = ctx2d.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, '#3a3f4a');
  grad.addColorStop(0.5, panelColor);
  grad.addColorStop(1, '#15171c');
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(0, 0, cw, ch);

  // 内側の黒い画面用くり抜き(枠線のみ描画。実際の透過はジオメトリ側で処理)
  ctx2d.fillStyle = '#000000';
  ctx2d.fillRect(bezel, bezel, cw - bezel * 2, ch - bezel * 2);

  // アクセントのネオンライン(画面の縁取り)
  ctx2d.lineWidth = 4;
  ctx2d.strokeStyle = accentColor;
  ctx2d.shadowColor = accentColor;
  ctx2d.shadowBlur = 20;
  ctx2d.strokeRect(bezel - 4, bezel - 4, cw - (bezel - 4) * 2, ch - (bezel - 4) * 2);
  ctx2d.shadowBlur = 0;

  // コーナーのリベット(ネジ風の丸)
  const rivetR = 8;
  const rivetMargin = 24;
  const corners = [
    [rivetMargin, rivetMargin],
    [cw - rivetMargin, rivetMargin],
    [rivetMargin, ch - rivetMargin],
    [cw - rivetMargin, ch - rivetMargin]
  ];
  corners.forEach(([x, y]) => {
    ctx2d.beginPath();
    ctx2d.arc(x, y, rivetR, 0, Math.PI * 2);
    ctx2d.fillStyle = rivetColor;
    ctx2d.fill();
    ctx2d.beginPath();
    ctx2d.arc(x - 2, y - 2, rivetR * 0.4, 0, Math.PI * 2);
    ctx2d.fillStyle = '#555a66';
    ctx2d.fill();
  });

  // 左下にステータスランプ風の小さい丸
  ctx2d.beginPath();
  ctx2d.arc(bezel * 0.5, ch - bezel * 0.5, 10, 0, Math.PI * 2);
  ctx2d.fillStyle = accentColor;
  ctx2d.shadowColor = accentColor;
  ctx2d.shadowBlur = 15;
  ctx2d.fill();
  ctx2d.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  // フレーム本体はリングジオメトリではなく、内側を透過させた板1枚で代用
  // → 画面より一回り大きいPlaneを screenの裏に配置するだけでOK
  const geo = new THREE.PlaneGeometry(width * 1.25, height * 1.3);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData._dispose = () => { tex.dispose(); geo.dispose(); mat.dispose(); };
  return mesh;
}

// --------------------------------------
// モニターフレーム（立体）
// --------------------------------------
function createMonitorFrame3D(width, height, {
  frameColor = 0x1a1d24,
  accentColor = 0x66ddff,
  depth = 0.6,
  bezel = 2.2
} = {}) {

  const group = new THREE.Group();

  const mat = new THREE.MeshPhongMaterial({
    color: frameColor,
    shininess: 40,
    specular: 0x444444
  });

  // 上
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(width + bezel * 2, bezel, depth),
    mat
  );
  top.position.set(0, height / 2 + bezel / 2, 0);
  group.add(top);

  // 下
  const bottom = top.clone();
  bottom.position.y = -height / 2 - bezel / 2;
  group.add(bottom);

  // 左
  const left = new THREE.Mesh(
    new THREE.BoxGeometry(bezel, height, depth),
    mat
  );
  left.position.set(-width / 2 - bezel / 2, 0, 0);
  group.add(left);

  // 右
  const right = left.clone();
  right.position.x = width / 2 + bezel / 2;
  group.add(right);

  // 四隅のネジ
  const screwGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
  const screwMat = new THREE.MeshPhongMaterial({
    color: 0x555555
  });

  const corners = [
    [-width/2-0.8,  height/2+0.8],
    [ width/2+0.8,  height/2+0.8],
    [-width/2-0.8, -height/2-0.8],
    [ width/2+0.8, -height/2-0.8],
  ];

  corners.forEach(([x, y]) => {
    const screw = new THREE.Mesh(screwGeo, screwMat);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, y, depth / 2 + 0.05);
    group.add(screw);
  });

  // 左下のLED
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 16),
    new THREE.MeshBasicMaterial({
      color: accentColor
    })
  );

  led.position.set(
    -width / 2 - bezel / 2 + 0.8,
    -height / 2 - bezel / 2 + 0.8,
    depth / 2 + 0.05
  );

  group.add(led);

  return group;
}

const monitorFrame = createMonitorFrame3D(
    monitorWidth,
    monitorHeight
);

monitorFrame.position.set(
    monitorScreen.position.x,
    monitorScreen.position.y,
    monitorScreen.position.z - 0.4
);

scene.add(monitorFrame);

// --------------------------------------
// 画面オーバーレイ（走査線 + ビネット）
// --------------------------------------
function createScreenOverlay(width, height) {
  const cw = 512, ch = Math.round(512 * (height / width));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx2d = canvas.getContext('2d');

  // 走査線
  ctx2d.clearRect(0, 0, cw, ch);
  ctx2d.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < ch; y += 4) {
    ctx2d.fillRect(0, y, cw, 1);
  }

  // ビネット(四隅を暗く)
  const grad = ctx2d.createRadialGradient(
    cw / 2, ch / 2, Math.min(cw, ch) * 0.25,
    cw / 2, ch / 2, Math.min(cw, ch) * 0.75
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(0, 0, cw, ch);

  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData._dispose = () => { tex.dispose(); geo.dispose(); mat.dispose(); };
  return mesh;
}

// --------------------------------------
// 左右ボタン（ネオン風・矢印アイコン）
// --------------------------------------
function createNeonArrowButton({
  direction = 'left', // 'left' | 'right'
  size = 4,
  bg = 'rgba(10,10,20,0.4)',
  glow = '#bb66ff',
  arrowColor = '#ffffff'
} = {}) {
  const cw = 256, ch = 256;
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx2d = canvas.getContext('2d');

  const cx = cw / 2, cy = ch / 2, r = cw / 2 - 20;

  // 背景円
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
  ctx2d.fillStyle = bg;
  ctx2d.fill();

  // ネオン枠線
  ctx2d.lineWidth = 10;
  ctx2d.strokeStyle = glow;
  ctx2d.shadowColor = glow;
  ctx2d.shadowBlur = 30;
  ctx2d.stroke();

  // 矢印アイコン
  ctx2d.shadowBlur = 0;
  ctx2d.fillStyle = arrowColor;
  ctx2d.strokeStyle = arrowColor;
  ctx2d.lineWidth = 16;
  ctx2d.lineCap = 'round';
  ctx2d.lineJoin = 'round';

  const a = 30; // 矢印の大きさ
  ctx2d.beginPath();
  if (direction === 'left') {
    ctx2d.moveTo(cx + a * 0.4, cy - a);
    ctx2d.lineTo(cx - a * 0.6, cy);
    ctx2d.lineTo(cx + a * 0.4, cy + a);
  } else {
    ctx2d.moveTo(cx - a * 0.4, cy - a);
    ctx2d.lineTo(cx + a * 0.6, cy);
    ctx2d.lineTo(cx - a * 0.4, cy + a);
  }
  ctx2d.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const geo = new THREE.PlaneGeometry(size, size);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.direction = direction;
  mesh.userData._dispose = () => { tex.dispose(); geo.dispose(); mat.dispose(); };
  return mesh;
}

const arrowButtonStyle = { size: 3.4, bg: 'rgba(8,18,32,0.55)', glow: '#66ddff' };
const buttonLeft  = createNeonArrowButton({ ...arrowButtonStyle, direction: 'left' });
const buttonRight = createNeonArrowButton({ ...arrowButtonStyle, direction: 'right' });

// モニター(幅20)の左右に少し離して配置
buttonLeft.position.set(
  monitorScreen.position.x - 9,
  monitorScreen.position.y,
  -10
);
buttonRight.position.set(
  monitorScreen.position.x + 9,
  monitorScreen.position.y,
  -10
);

scene.add(buttonLeft, buttonRight);


// --------------------------------------
// NEW SONG neon button (center-top UI)
// --------------------------------------
const signNewSong = createSignBoardPlane({
  width: 8.8, height: 2.5, bg: 'rgba(8,18,32,0.55)', glow: '#66ddff'
});
signNewSong.position.set(
  monitorScreen.position.x,
  monitorScreen.position.y + monitorHeight * 0.5 + 3.8,
  -10
);
scene.add(signNewSong);

let signNewSongText = null;
function buildNewSongText() {
  if (!uiFont || signNewSongText) return;
  signNewSongText = attachSignText(signNewSong, 'NEW SONG', 0.5, textMatWhite, 0.05);
}

// --------------------------------------
// Playback SOUND button (upper song area)
// --------------------------------------
const signPlaySound = createSignBoardPlane({
  width: 8.8, height: 2.5, bg: 'rgba(8,18,32,0.28)', glow: '#ff66cc'
});
signPlaySound.material.opacity = 0.72;
signPlaySound.position.set(0, 100, -10);
scene.add(signPlaySound);

const signSongBack = createSignBoardPlane({
  width: 5.6, height: 1.7, bg: 'rgba(5,10,18,0.48)', glow: '#9fb7ff'
});
signSongBack.position.set(
  signPlaySound.position.x,
  signPlaySound.position.y - 20,
  -10
);
scene.add(signSongBack);

function createRainbowHeadphoneGeometry() {
  const group = new THREE.Group();

  const cupGeo = new THREE.SphereGeometry(1, 32, 16);
  const cupMat = new THREE.MeshBasicMaterial({ color: 0x66ddff });

  const leftCup = new THREE.Mesh(cupGeo, cupMat);
  leftCup.scale.set(0.85, 1.25, 0.42);
  leftCup.position.set(-3.15, -0.25, 0.08);
  group.add(leftCup);

  const rightCup = leftCup.clone();
  rightCup.position.x = 3.15;
  group.add(rightCup);

  const rainbowColors = [
    0xff3344,
    0xff9933,
    0xffee44,
    0x44ff66,
    0x33ddff,
    0x5577ff,
    0xbb66ff,
  ];
  const rainbowMats = rainbowColors.map((color) => new THREE.MeshBasicMaterial({ color }));
  const rainbowGeos = [];

  rainbowMats.forEach((mat, i) => {
    const geo = new THREE.TorusGeometry(3.05 + i * 0.13, 0.055, 8, 64, Math.PI);
    rainbowGeos.push(geo);
    const arc = new THREE.Mesh(geo, mat);
    arc.rotation.z = Math.PI;
    arc.position.set(0, -0.55 + i * 0.02, 0.08 + i * 0.01);
    group.add(arc);
  });

  group.position.set(
    signPlaySound.position.x,
    signPlaySound.position.y,
    signPlaySound.position.z - 0.35
  );
  group.userData._dispose = () => {
    cupGeo.dispose();
    cupMat.dispose();
    rainbowGeos.forEach((geo) => geo.dispose());
    rainbowMats.forEach((mat) => mat.dispose());
  };
  return group;
}

const headphoneGroup = createRainbowHeadphoneGeometry();
headphoneGroup.rotation.x = Math.PI;
headphoneGroup.scale.setScalar(1.18);
scene.add(headphoneGroup);

// --------------------------------------
// SOUND playback position bar
// --------------------------------------
const soundProgressConfig = {
  width: 9.4,
  height: 0.16,
};
const soundProgressGroup = new THREE.Group();
soundProgressGroup.position.set(
  signPlaySound.position.x,
  signPlaySound.position.y + 6.2,
  signPlaySound.position.z + 0.22
);
scene.add(soundProgressGroup);

const soundProgressTrack = new THREE.Mesh(
  new THREE.PlaneGeometry(soundProgressConfig.width, soundProgressConfig.height),
  new THREE.MeshBasicMaterial({
    color: 0x1b2532,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
soundProgressGroup.add(soundProgressTrack);

const soundProgressFill = new THREE.Mesh(
  new THREE.PlaneGeometry(soundProgressConfig.width, soundProgressConfig.height),
  new THREE.MeshBasicMaterial({
    color: 0xff3344,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
soundProgressFill.position.z = 0.02;
soundProgressFill.scale.x = 0.0001;
soundProgressGroup.add(soundProgressFill);


// --------------------------------------
// SOUND source switch (above playback position bar)
// --------------------------------------
const soundVariantOptions = [
  { id: 'round', label: 'Original', url: 'audio/round.mp3' },
  { id: 'round_dry', label: 'Dry', url: 'audio/round_dry.mp3' },
  { id: 'round_roomy', label: 'Basic', url: 'audio/round_roomy.mp3' },
];
const DEFAULT_SOUND_VARIANT = 'round';
let activeSoundVariant = DEFAULT_SOUND_VARIANT;
const soundVariantButtons = soundVariantOptions.map((option, index) => {
  const button = createSignBoardPlane({
    width: 5.6,
    height: 1.7,
    bg: 'rgba(8,18,32,0.42)',
    glow: index === 0 ? '#ff66cc' : '#66ddff',
  });
  button.position.set(
    signPlaySound.position.x + (index - 1) * 6.1,
    signPlaySound.position.y + 8.05,
    signSongBack.position.z
  );
  button.userData.soundVariantId = option.id;
  scene.add(button);
  return button;
});
let soundVariantTexts = [];
function updateSoundVariantButtons() {
  soundVariantButtons.forEach((button) => {
    const active = button.userData.soundVariantId === activeSoundVariant;
    button.material.opacity = active ? 0.86 : 0.54;
    button.scale.setScalar(1.0);
  });
}
function buildSoundVariantTexts() {
  if (!uiFont || soundVariantTexts.length) return;
  soundVariantTexts = soundVariantButtons.map((button, index) => (
    attachSignText(button, soundVariantOptions[index].label, 0.5, textMatWhite, 0.05)
  ));
}
updateSoundVariantButtons();

function updateSoundProgressBar() {
  const currentBgmElement = getActiveBgmElement?.() ?? psyElement;
  const duration = Number.isFinite(currentBgmElement.duration) ? currentBgmElement.duration : 0;
  const progress = duration > 0 ? THREE.MathUtils.clamp(currentBgmElement.currentTime / duration, 0, 1) : 0;
  soundProgressFill.scale.x = Math.max(progress, 0.0001);
  soundProgressFill.position.x = (progress - 1) * soundProgressConfig.width * 0.5;
}

// --------------------------------------
// ROUND visual: quiet orbital sculpture tied to SOUND playback
// --------------------------------------
const ROUND_CONFIG = {
  position: {
    x: signPlaySound.position.x,
    y: signPlaySound.position.y,
    z: signPlaySound.position.z - 1.15,
  },
  scale: 1.0,
  activeScale: 8.1,
  scaleUpSpeed: 1.1,
  resetScaleSpeed: 1.6,
  particleCount: window.innerWidth < 768 ? 48 : 84,
  ringCount: 5,
  fragmentCount: 9,
  animationSpeed: 1,
  centerGlowIntensity: 0.75,
};

const roundGroup = new THREE.Group();
roundGroup.position.set(ROUND_CONFIG.position.x, ROUND_CONFIG.position.y, ROUND_CONFIG.position.z);
roundGroup.scale.setScalar(ROUND_CONFIG.scale);
scene.add(roundGroup);

let isSoundPlaying = false;
let roundAnimationTime = 0;
const roundRings = [];
const roundParticles = [];
const roundFragments = [];

let roundCore;
let roundCoreShell;
let roundMist;
let roundGlowLight;

function createRoundVisual() {
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xf5f0ff,
    transparent: true,
    opacity: 0.78,
  });
  roundCore = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), coreMat);
  roundGroup.add(roundCore);

  const shellMat = new THREE.MeshBasicMaterial({
    color: 0xb9a7d8,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  roundCoreShell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16), shellMat);
  roundGroup.add(roundCoreShell);

  const mistMat = new THREE.MeshBasicMaterial({
    color: 0x334050,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  roundMist = new THREE.Mesh(new THREE.SphereGeometry(3.9, 32, 16), mistMat);
  roundMist.scale.set(1.18, 0.76, 0.5);
  roundGroup.add(roundMist);

  roundGlowLight = new THREE.PointLight(0xcfc4ff, ROUND_CONFIG.centerGlowIntensity, 9);
  roundGlowLight.position.set(0, 0, 1.4);
  roundGroup.add(roundGlowLight);

  const ringColors = [0x2b3445, 0x8e83a8, 0x6da8a6, 0xd8b582, 0xf0f2f4];
  for (let i = 0; i < ROUND_CONFIG.ringCount; i++) {
    const arc = i % 2 === 0 ? Math.PI * (1.35 + i * 0.11) : Math.PI * 2;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15 + i * 0.42, 0.018 + i * 0.002, 8, 96, arc),
      new THREE.MeshBasicMaterial({
        color: ringColors[i % ringColors.length],
        transparent: true,
        opacity: 0.28 + i * 0.045,
        depthWrite: false,
      })
    );
    ring.rotation.set(
      THREE.MathUtils.degToRad(18 + i * 21),
      THREE.MathUtils.degToRad(i * 33),
      THREE.MathUtils.degToRad(i * 17)
    );
    ring.userData.speed = (i % 2 === 0 ? 1 : -1) * (0.045 + i * 0.012);
    ring.userData.wobble = 0.18 + i * 0.03;
    roundRings.push(ring);
    roundGroup.add(ring);
  }

  const particleMat = new THREE.MeshBasicMaterial({
    color: 0xd9e8e5,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const particleGeo = new THREE.SphereGeometry(0.035, 8, 6);
  for (let i = 0; i < ROUND_CONFIG.particleCount; i++) {
    const p = new THREE.Mesh(particleGeo, particleMat);
    p.userData.phase = i * 2.399963;
    p.userData.radius = 1.0 + (i % 17) * 0.12;
    p.userData.speed = 0.055 + (i % 9) * 0.012;
    p.userData.incline = -0.55 + (i % 11) * 0.11;
    roundParticles.push(p);
    roundGroup.add(p);
  }

  const fragmentColors = [0xa7a0b8, 0x617b83, 0xd1b184, 0xeeeeee];
  for (let i = 0; i < ROUND_CONFIG.fragmentCount; i++) {
    const frag = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.11 + (i % 3) * 0.025, 0),
      new THREE.MeshBasicMaterial({
        color: fragmentColors[i % fragmentColors.length],
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })
    );
    frag.userData.phase = i * 0.91;
    frag.userData.radiusX = 1.45 + (i % 4) * 0.34;
    frag.userData.radiusY = 0.58 + (i % 3) * 0.17;
    frag.userData.speed = 0.12 + (i % 5) * 0.025;
    frag.userData.tilt = THREE.MathUtils.degToRad(16 + i * 13);
    roundFragments.push(frag);
    roundGroup.add(frag);
  }
}

function updateRoundAnimation(elapsedTime, deltaTime) {
  const slowPulse = Math.sin(elapsedTime * 0.75) * 0.5 + 0.5;
  const shellPulse = Math.sin(elapsedTime * 0.52 + 1.2) * 0.5 + 0.5;
  const mistPulse = Math.sin(elapsedTime * 0.33 + 2.1) * 0.5 + 0.5;

  const targetScale = ROUND_CONFIG.activeScale + slowPulse * 0.24;
  const scaleStep = Math.min(1, deltaTime * ROUND_CONFIG.scaleUpSpeed);
  roundGroup.scale.setScalar(THREE.MathUtils.lerp(roundGroup.scale.x, targetScale, scaleStep));

  roundCore.scale.setScalar(0.9 + slowPulse * 0.14);
  roundCore.material.opacity = 0.58 + slowPulse * 0.22;
  roundCoreShell.scale.setScalar(0.92 + shellPulse * 0.28);
  roundCoreShell.material.opacity = 0.09 + shellPulse * 0.12;
  roundMist.rotation.y += deltaTime * 0.045;
  roundMist.material.opacity = 0.055 + mistPulse * 0.055;
  roundGlowLight.intensity = ROUND_CONFIG.centerGlowIntensity * (0.65 + slowPulse * 0.45);

  roundRings.forEach((ring, i) => {
    ring.rotation.x += ring.userData.speed * deltaTime;
    ring.rotation.y += ring.userData.speed * deltaTime * (0.55 + i * 0.08);
    ring.rotation.z += Math.sin(elapsedTime * 0.18 + i) * ring.userData.wobble * deltaTime * 0.12;
  });

  roundParticles.forEach((p, i) => {
    const phase = p.userData.phase;
    const orbit = phase + elapsedTime * p.userData.speed;
    const pull = Math.sin(elapsedTime * 0.27 + phase) * 0.22;
    let radius = p.userData.radius + pull;
    if (radius > 3.45) radius = 2.35 + (i % 7) * 0.08;
    p.position.set(
      Math.cos(orbit) * radius,
      Math.sin(orbit * 0.7 + p.userData.incline) * 0.55,
      Math.sin(orbit) * radius * 0.38
    );
  });

  roundFragments.forEach((frag) => {
    const phase = frag.userData.phase;
    const orbit = phase + elapsedTime * frag.userData.speed;
    const breathe = 0.78 + Math.sin(orbit * 1.7) * 0.18;
    const x = Math.cos(orbit) * frag.userData.radiusX * breathe;
    const y = Math.sin(orbit * 1.21) * frag.userData.radiusY;
    const z = Math.sin(orbit) * frag.userData.radiusX * 0.42 * breathe;
    const tilt = frag.userData.tilt;
    frag.position.set(
      x,
      y * Math.cos(tilt) - z * Math.sin(tilt),
      y * Math.sin(tilt) + z * Math.cos(tilt)
    );
    frag.rotation.x += deltaTime * 0.21;
    frag.rotation.y -= deltaTime * 0.16;
  });
}


function updateRoundStopped(deltaTime) {
  const resetStep = Math.min(1, deltaTime * ROUND_CONFIG.resetScaleSpeed);
  roundGroup.scale.setScalar(THREE.MathUtils.lerp(roundGroup.scale.x, ROUND_CONFIG.scale, resetStep));
}

function setRoundAnimationPlaying(playing) {
  isSoundPlaying = playing;
}

function disposeRoundVisual() {
  roundGroup.traverse((obj) => {
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) {
      obj.material.forEach((mat) => mat.dispose?.());
    } else {
      obj.material?.dispose?.();
    }
  });
}

createRoundVisual();
updateRoundAnimation(roundAnimationTime, 0);

let signPlaySoundText = null;
let signSongBackText = null;
function buildPlaySoundText() {
  if (!uiFont) return;
  if (!signPlaySoundText) {
    signPlaySoundText = attachSignText(signPlaySound, 'SOUND', 0.5, textMatWhite, 0.05);
  }
  if (!signSongBackText) {
    signSongBackText = attachSignText(signSongBack, 'BACK', 0.5, textMatWhite, 0.05);
  }
}

let newSongViewOpen = false;

function openNewSongView() {
  if (newSongViewOpen) return;
  newSongViewOpen = true;
  animateCameraToPositionAndTarget(
    camera,
    new THREE.Vector3(0, 100, 20),
    new THREE.Vector3(0, 100, -1000),
    1600
  );
}

function closeNewSongView() {
  newSongViewOpen = false;
  animateCameraToPositionAndTarget(
    camera,
    new THREE.Vector3(0, 20, 20),
    new THREE.Vector3(0, 20, -1000),
    1600
  );
}

function toggleSongPlayback() {
  if (actx.state !== 'running') actx.resume();
  if (!isBgmPlaying()) {
    playBgmElements().catch(console.warn);
  } else {
    pauseBgmElements();
  }
}

function selectSoundVariant(variantId) {
  if (!soundVariantOptions.some((option) => option.id === variantId)) return;
  activeSoundVariant = variantId;
  setBgmVariant(activeSoundVariant);
  updateSoundVariantButtons();
}

// --------------------------------------
// BACK TO TOP button (bottom UI)
// --------------------------------------
const signBackTop = createSignBoardPlane({
  width: 8, height: 2, bg: 'rgba(5,10,18,0.6)', glow: '#66ddff'
});
signBackTop.position.set(0, 0, -10);
scene.add(signBackTop);

const signAbout = createSignBoardPlane({
  width: 6.4, height: 2.1, bg: 'rgba(5,10,18,0.52)', glow: '#66ddff'
});
signAbout.position.set(-3.7, 3.0, -10);
scene.add(signAbout);

const signPie = createSignBoardPlane({
  width: 6.4, height: 2.1, bg: 'rgba(5,10,18,0.52)', glow: '#66ddff'
});
signPie.position.set(3.7, 3.0, -10);
scene.add(signPie);

let signBackTopText = null;
function buildBackTopText() {
  if (!uiFont || signBackTopText) return;
  signBackTopText = attachSignText(signBackTop, 'BACK TO TOP', 0.5, textMatWhite, 0.05);
}

let signAboutText = null;
let signReleasesText = null;
let signPieText = null;
function buildBottomMenuTexts() {
  if (!uiFont) return;
  if (!signAboutText) {
    signAboutText = attachSignText(signAbout, 'ABOUT', 0.5, textMatWhite, 0.05);
  }
  if (!signReleasesText) {
    signReleasesText = attachSignText(signAbout, 'RELEASES', 0.38, textMatWhite, 0.05);
    signReleasesText.visible = false;
  }
  if (!signPieText) {
    signPieText = attachSignText(signPie, 'PIE', 0.5, textMatWhite, 0.05);
  }
  updateAboutButtonText();
}

function updateAboutButtonText() {
  if (!signAboutText || !signReleasesText) return;
  const isAboutView = monitorMode === 'about';
  signAboutText.visible = !isAboutView;
  signReleasesText.visible = isAboutView;
}

// --------------------------------------
// PIE button animation: Three.js neon burst
// --------------------------------------
const pieFxGroup = new THREE.Group();
pieFxGroup.position.set(signPie.position.x, signPie.position.y, -12.8);
pieFxGroup.visible = false;
scene.add(pieFxGroup);

const pieCoreMat = new THREE.MeshBasicMaterial({
  color: 0xff66cc,
  transparent: true,
  opacity: 0.95,
});
const pieCore = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.9, 0.18, 96, 12),
  pieCoreMat
);
pieFxGroup.add(pieCore);

const pieRingMats = [0x66ddff, 0xffee44, 0xbb66ff].map((color) => (
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  })
));
const pieRings = pieRingMats.map((mat, i) => {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.35 + i * 0.45, 0.035, 8, 96),
    mat
  );
  ring.rotation.x = Math.PI / 2;
  pieFxGroup.add(ring);
  return ring;
});

const pieParticleMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.9,
});
const pieParticles = [];
for (let i = 0; i < 16; i++) {
  const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), pieParticleMat);
  p.userData.angle = (i / 16) * Math.PI * 2;
  p.userData.radius = 1.8 + (i % 4) * 0.35;
  p.userData.speed = 0.8 + (i % 5) * 0.18;
  pieParticles.push(p);
  pieFxGroup.add(p);
}

let pieFxStartTime = -1;
let pieNavigationStarted = false;
const pieFxDuration = 3.0;
const pieFxFullScreenScale = 18;

function triggerPieAnimation() {
  if (pieNavigationStarted) return;
  pieNavigationStarted = true;
  pieFxStartTime = performance.now() * 0.001;
  pieFxGroup.position.set(signPie.position.x, signPie.position.y, -12.8);
  pieFxGroup.scale.setScalar(0.18);
  pieFxGroup.visible = true;
}

function updatePieAnimation(nowSec) {
  if (pieFxStartTime < 0) return;

  const elapsed = nowSec - pieFxStartTime;
  const progress = Math.min(elapsed / pieFxDuration, 1);
  const easedProgress = 1 - Math.pow(1 - progress, 3);
  const pulse = Math.sin(progress * Math.PI);

  pieFxGroup.scale.setScalar(THREE.MathUtils.lerp(0.18, pieFxFullScreenScale, easedProgress));

  pieCore.rotation.x += 0.035;
  pieCore.rotation.y += 0.052;
  pieCore.scale.setScalar(0.9 + pulse * 0.7);
  pieCoreMat.opacity = 0.25 + pulse * 0.7;

  pieRings.forEach((ring, i) => {
    ring.rotation.z += 0.012 + i * 0.01;
    ring.scale.setScalar(0.75 + easedProgress * (1.4 + i * 0.35));
    ring.material.opacity = Math.max(0.24, (1 - progress) * 0.8);
  });

  pieParticles.forEach((p, i) => {
    const a = p.userData.angle + elapsed * p.userData.speed;
    const r = p.userData.radius + easedProgress * 2.2;
    p.position.set(
      Math.cos(a) * r,
      Math.sin(a * 1.3 + i) * 0.9,
      Math.sin(a) * 0.35
    );
    p.scale.setScalar(0.8 + pulse * 1.6);
  });
  pieParticleMat.opacity = Math.max(0.15, 1 - progress);

  if (progress >= 1) {
    window.location.assign('./pie.html');
  }
}

// --------------------------------------
// Audio graph (deep reverb & echo when psyOn)
// --------------------------------------
const {
  actx,
  audio1Element,
  audio2Element,
  psyElement,
  bgmElements,
  setBgmVariant,
  playBgmElements,
  pauseBgmElements,
  getActiveBgmElement,
  isBgmPlaying,
  setPsyAudio,
} = createPsyAudioGraph({
  bgmURL: 'audio/round.mp3',
  bgmTracks: soundVariantOptions,
  initialBgmTrackId: DEFAULT_SOUND_VARIANT,
});
setBgmVariant(DEFAULT_SOUND_VARIANT);

function refreshSoundPlaybackState() {
  setRoundAnimationPlaying(isBgmPlaying());
}

[...new Set([psyElement, ...bgmElements.map(({ element }) => element)])].forEach((element) => {
  element.addEventListener('play', refreshSoundPlaybackState);
  element.addEventListener('playing', refreshSoundPlaybackState);
  element.addEventListener('pause', refreshSoundPlaybackState);
  element.addEventListener('ended', refreshSoundPlaybackState);
  element.addEventListener('error', refreshSoundPlaybackState);
});

// --------------------------------------
// Camera tween
// --------------------------------------
function animateCameraToPositionAndTarget(cam, targetPos, targetLookAt, durationMs, onDone) {
  tweenCamera(cam, targetPos, targetLookAt, durationMs, onDone, {
    THREE,
    startPos: _v3a,
    startLookAt: _v3b,
    lerpedPos: _v3c,
    worldDir: new THREE.Vector3(),
  });
}

// --------------------------------------
// Raycast / Interaction
// --------------------------------------

const clickableA = [
  signNewSong,
  signPlaySound,
  signSongBack,
  signBackTop,
  signAbout,
  signPie,
  buttonLeft,
  buttonRight,
  ...soundVariantButtons
];
const clickableSet = new Set(clickableA);

function getClickableRoot(object) {
  let current = object;
  while (current && !clickableSet.has(current)) {
    current = current.parent;
  }
  return current;
}


function handleClick(event) {
  _v2.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  _raycaster.setFromCamera(_v2, camera);

  let handled = false;

  const intersects1 = _raycaster.intersectObjects(clickableA, true);
  if (intersects1.length) {
    const obj = getClickableRoot(intersects1[0].object);

    if (soundVariantButtons.includes(obj)) {
      selectSoundVariant(obj.userData.soundVariantId);
      handled = true;

    } else if (obj === buttonLeft) {
      if (monitorMode === 'releases') showImgbox(currentImgIndex - 1);
      handled = true;

    } else if (obj === buttonRight) {
      if (monitorMode === 'releases') showImgbox(currentImgIndex + 1);
      handled = true;

    } else if (obj === signNewSong) {
      openNewSongView();
      handled = true;

    } else if (obj === signPlaySound) {
      // 上部エリアの SOUND ネオンで round 系トラックを再生/停止
      toggleSongPlayback();
      handled = true;

    } else if (obj === signSongBack) {
      closeNewSongView();
      handled = true;

    } else if (obj === signAbout) {
      toggleMonitorMode();
      handled = true;

    } else if (obj === signPie) {
      triggerPieAnimation();
      handled = true;

    } else if (obj === signBackTop) {
      window.location.assign('./index.html');
      handled = true;
    }
  }

}
document.addEventListener('click', handleClick);

// --------------------------------------
// Build orchestrator (font/targets readiness)
// --------------------------------------
function tryBuildAllLabels() {
  buildNewSongText();
  buildPlaySoundText();
  buildSoundVariantTexts();
  buildBackTopText();
  buildBottomMenuTexts();
}
tryBuildAllLabels();

// --------------------------------------
// Resize
// --------------------------------------
let resizePending = false;
function onWindowResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  });
}
window.addEventListener('resize', onWindowResize, false);

// --------------------------------------
// Animate loop
// --------------------------------------
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  // optional breathing lights
  const tnow = performance.now() * 0.001;
  fillLight.intensity    = 0.8 + Math.cos(tnow * 0.3) * 0.3;
  updatePieAnimation(tnow);
  updateSoundProgressBar();
  const roundFrameDelta = Math.min(dt, 0.05);
  if (isSoundPlaying) {
    const roundDelta = roundFrameDelta * ROUND_CONFIG.animationSpeed;
    roundAnimationTime += roundDelta;
    updateRoundAnimation(roundAnimationTime, roundDelta);
  } else {
    updateRoundStopped(roundFrameDelta);
  }

  // ★ モニターへのレンダリング
renderer.setRenderTarget(monitorRenderTarget);
renderer.render(monitorScene, monitorCamera); // ← scene ではなく monitorScene
renderer.setRenderTarget(null);

  // PostFX path

  
    if (psyOn) {
    psyPass.uniforms.time.value += dt;
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}
animate();

// フォント/ターゲットが揃った後の最終確認呼び出し
tryBuildAllLabels();

// --------------------------------------
// Cleanup on unload
// --------------------------------------
function disposeScene() {
  try { pauseBgmElements(); } catch {}
  try { audio1Element.pause(); audio2Element.pause(); } catch {}
  disposeRoundVisual();
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => { m.map?.dispose?.(); m.dispose?.(); });
      } else {
        obj.material.map?.dispose?.();
        obj.material.dispose?.();
      }
    }
  });
  renderer.dispose();
  composer?.dispose?.();
}
window.addEventListener('beforeunload', disposeScene);
