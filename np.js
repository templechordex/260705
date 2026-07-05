//2026.06.30

import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';
import { Water }        from 'https://unpkg.com/three@0.180.0/examples/jsm/objects/Water.js';
import { GLTFLoader }   from 'https://unpkg.com/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
import { Sky }          from 'https://unpkg.com/three@0.180.0/examples/jsm/objects/Sky.js';
import { FontLoader }   from 'https://unpkg.com/three@0.180.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://unpkg.com/three@0.180.0/examples/jsm/geometries/TextGeometry.js';

// PostProcessing
import { EffectComposer } from 'https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }     from 'https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass }     from 'https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/ShaderPass.js';

import { addObjeToScene } from './obje.js';
import { createBubbles, createMenuBubbles } from './bubble.js';
import { createSceneCameraRenderer } from './core/scene.js';
import { animateCameraToPositionAndTarget as tweenCamera } from './core/cameraTween.js';
import { createSignBoardPlane as createSharedSignBoardPlane, attachSignText as attachSharedSignText } from './ui/signBoard.js';
import { createPsyAudioGraph } from './audio/psyAudio.js';

// --------------------------------------
// Core: Scene / Camera / Renderer
// --------------------------------------
const { scene, camera, renderer } = createSceneCameraRenderer(THREE, { exposure: 0.22 });

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

const RainbowShader = {
  uniforms: {
    tDiffuse: { value: null },
    time:     { value: 0.0 },
    strength: { value: 0.0 } // 0→1 に上げていく
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
    uniform float strength;

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

    void main(){
      vec2 uv = vUv;

      float band = sin( (uv.y + time*0.6) * 12.0 ) * 0.5 + 0.5;
      vec3 rainbow = vec3(
        sin(6.2831*(uv.x + time*0.10))*0.5 + 0.5,
        sin(6.2831*(uv.x + time*0.13) + 2.094)*0.5 + 0.5,
        sin(6.2831*(uv.x + time*0.16) + 4.188)*0.5 + 0.5
      );
      rainbow = mix(rainbow, vec3(1.0,0.9,0.9), 0.15);

      vec3 base = texture2D(tDiffuse, uv).rgb;
      base = hueShift(base, 0.7 * sin(time*0.4) * strength);
      vec3 col = mix(base, rainbow, clamp(strength * (0.4 + 0.6*band), 0.0, 1.0));

      col = pow(col, vec3(0.92));

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

let composer, renderPass, psyPass, rainbowPass;
let psyOn = false;           // elephant toggle
let rainbowOn = false;       // flag transition
let rainbowStartTime = 0;

function initPostFX(){
  composer   = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  psyPass = new ShaderPass(EuphoricShader);
  psyPass.enabled = false;
  composer.addPass(psyPass);

  rainbowPass = new ShaderPass(RainbowShader);
  rainbowPass.enabled = false;
  composer.addPass(rainbowPass);
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
const textureLoader = new THREE.TextureLoader();

// --------------------------------------
// Font (unified) + text helpers
// --------------------------------------
const fontLoader = new FontLoader();
let uiFont = null;

const textMatBlack = new THREE.MeshBasicMaterial({ color: 0x000000 });
const textMatWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });

function makeTextMesh(font, str, size) {
  const g = new TextGeometry(str, { font, size, depth: 0, bevelEnabled: false });
  g.center();
  const m = new THREE.Mesh(g, textMatBlack); 
  return m;
}

// 画面上部のテキスト（menu / top）
function buildTopTexts() {
  if (!uiFont) return;
  const menu = makeTextMesh(uiFont, 'menu', 1.4);
  menu.position.set(0, 3, -19);
  scene.add(menu);

  const top = makeTextMesh(uiFont, 'top', 1.4);
  top.position.set(0, -3, -19);
  scene.add(top);
}

// バブル用ラベル（TextGeometry版）
let musicLabel = null;
let webLabel   = null;
let igLabel3D  = null;

function buildBubbleLabels() {
  if (!uiFont || !bubble1 || !mBubble2 || !bubble3) return;

  if (!musicLabel) {
    musicLabel = makeTextMesh(uiFont, 'MUSIC', 0.9);
    musicLabel.material = textMatWhite;
    scene.add(musicLabel);
  }
  if (!webLabel) {
    webLabel = makeTextMesh(uiFont, 'WEB', 0.9);
    webLabel.material = textMatWhite;
    scene.add(webLabel);
  }
  if (!igLabel3D) {
    igLabel3D = makeTextMesh(uiFont, 'IG', 1.1);
    igLabel3D.material = textMatWhite; // IGは白
    scene.add(igLabel3D);
  }

  // 初期位置を各バブルの少し手前に（大きなバブルはさらに前）
  musicLabel.position.set(bubble1.position.x, bubble1.position.y, bubble1.position.z + 12);
  webLabel.position.set(mBubble2.position.x, mBubble2.position.y, mBubble2.position.z + 12);
  igLabel3D.position.set(bubble3.position.x, bubble3.position.y, bubble3.position.z + 6);
}

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
  buildTopTexts();
  tryBuildAllLabels();
}, undefined, (e) => console.error(e));

// --------------------------------------
// GLTF: elephant
// --------------------------------------
const gltfLoader = new GLTFLoader();
let ele = null;
gltfLoader.load('model/ele.glb', (gltf) => {
  ele = gltf.scene;
  ele.scale.set(200, 200, 200);
  ele.position.set(-200, 240, -700);
  ele.rotation.y = Math.PI / 2;
  ele.castShadow = true;
  ele.receiveShadow = true;
  scene.add(ele);

  const sLight = new THREE.SpotLight(0xffff00, 10, 300);
  sLight.position.set(-200, 400, -500);
  sLight.target = ele;
  //scene.add(sLight);
}, undefined, (e) => console.error(e));

// --------------------------------------
// Fog 大きくすると遠くが見えなくなる
// --------------------------------------
scene.fog = new THREE.FogExp2(0x050510, 0.0005);

// --------------------------------------
// From obje.js  (musicRoom設置)
// --------------------------------------
addObjeToScene(scene);

// --------------------------------------
// Panes / planes
// --------------------------------------
const windowGlass1 = (() => {
  const geo = new THREE.PlaneGeometry();
  const mat = new THREE.MeshPhongMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.5,
    shininess: 100,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, -3, -19);
  mesh.scale.set(10, 5, 1);
  scene.add(mesh);
  return mesh;
})();

const menuPlane = (() => {
  const geo = new THREE.PlaneGeometry();
  const mat = new THREE.MeshBasicMaterial({ color: 0xe6e6fa });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -20);
  mesh.scale.set(10, 10, 1);
  scene.add(mesh);
  return mesh;
})();

// --------------------------------------
// Flag (psychedelic shader for mesh surface)
// --------------------------------------
const flagMaterial = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.DoubleSide,
  uniforms: { time: { value: 0.0 } },
  vertexShader: `
    uniform float time;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 pos = position;
      pos.z += sin(pos.x * 10.0 + time) * 40.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform float time;

    vec3 psychedelic(float t) {
      float r = sin(t * 3.0 + 0.0) * 0.5 + 0.5;
      float g = sin(t * 3.0 + 2.0) * 0.5 + 0.5;
      float b = sin(t * 3.0 + 4.0) * 0.5 + 0.5;
      return vec3(r, g, b);
    }

    void main() {
      float wave = vUv.y * 6.28318 + time * 0.5;
      vec3 color = psychedelic(wave);
      gl_FragColor = vec4(color, 0.8);
    }
  `
});

const flagGeometry = new THREE.PlaneGeometry(800, 80, 12, 6);
const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
flagMesh.position.set(100, 500, -1000);
flagMesh.rotateX(Math.PI / 4);
flagMesh.rotateY(Math.PI / 4);
scene.add(flagMesh);

// --------------------------------------
// Bubbles (from bubble.js)
// --------------------------------------
const { bubbles, bubbleMaterial } = createBubbles(scene);
const { bubble1, bubble2: mBubble2, bubble3, bubble4, bubble5 } =
  createMenuBubbles(scene, bubbleMaterial);

// bubble3 を Instagram ピンクに
if (bubble3) {
  bubble3.material = new THREE.MeshPhongMaterial({
    color: 0xE1306C,
    transparent: true,
    opacity: 0.8,
    shininess: 150,
    specular: 0xffffff,
    depthWrite: false
  });
}

// --------------------------------------
// Lights (fantasy / psychedelic + warm boost)
// --------------------------------------
const dirLight = new THREE.DirectionalLight(0xb0d8ff, 100);
dirLight.position.set(200, 1000, -100);
scene.add(dirLight);

const fillLight = new THREE.PointLight(0xff66cc, 1.0, 2000);
fillLight.position.set(-800, 400, -600);
//scene.add(fillLight);

const backLight = new THREE.PointLight(0x66ffff, 1.5, 3000);
backLight.position.set(0, 800, 800);
//scene.add(backLight);

const ambientLight = new THREE.AmbientLight(0xcc99ff, 0.6);
//scene.add(ambientLight);

const s1Light = new THREE.SpotLight(0xffffff, 10, 200);
s1Light.position.set(0, -10, 20);
s1Light.target = windowGlass1;
s1Light.penumbra = 0.8;
//scene.add(s1Light);

// 暖色ライト群
const hemiLight = new THREE.HemisphereLight(0xfff2cc, 0x1a1030, 0.6);
//scene.add(hemiLight);

const warmKey = new THREE.DirectionalLight(0xffcc66, 1.6);
warmKey.position.set(-800, 1200, 800);
//scene.add(warmKey);

const warmFill = new THREE.PointLight(0xffa84c, 1.2, 3000);
warmFill.position.set(300, 400, -600);
//scene.add(warmFill);

// --------------------------------------
// Water
// --------------------------------------
const waterGeometry = new THREE.PlaneGeometry(3000, 3000);
const water = new Water(
  waterGeometry,
  {
    textureWidth:  (window.devicePixelRatio > 1 ? 256 : 128),
    textureHeight: (window.devicePixelRatio > 1 ? 256 : 128),
    waterNormals: new THREE.TextureLoader().load('img/waternormals.jpg', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    }),
    alpha: 1.0,
    sunDirection: dirLight.position.clone().normalize(),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.0,
    fog: scene.fog !== undefined,
    side: THREE.DoubleSide
  }
);
water.rotation.x = -Math.PI / 2;
water.position.y = 0;
scene.add(water);

// --------------------------------------
// Sky
// --------------------------------------
// Sky
const sky = new Sky();
sky.scale.setScalar(5000);
scene.add(sky);

const skyUniforms = sky.material.uniforms;

// 空のパラメータ設定
skyUniforms.turbidity.value        = 0.1;    // 大気の濁り
skyUniforms.rayleigh.value         = 0.080;  // 青さ
skyUniforms.mieCoefficient.value   = 0.1;  // Mie散乱係数
skyUniforms.mieDirectionalG.value  = 0.988;      // 太陽方向への集中度

// 太陽の位置
const sun = new THREE.Vector3();
const elevation = 20; // 天空の角度（度）
const azimuth   = 180; // 方位（度）
sun.setFromSphericalCoords(
  1, 
  THREE.MathUtils.degToRad(90 - elevation), // 天空用は90-elevation
  THREE.MathUtils.degToRad(azimuth)
);
skyUniforms.sunPosition.value.copy(sun);


// --------------------------------------
// Signs inside musicRoom
// --------------------------------------
const signA = createSignBoardPlane({
  width: 10, height: 3, bg: 'rgba(30,10,30,0.25)', glow: '#bb66ff'
});
signA.position.set(-102, -16, 0);
signA.rotation.y = THREE.MathUtils.degToRad(20);
scene.add(signA);

const signB = createSignBoardPlane({
  width: 10, height: 3, bg: 'rgba(30,10,30,0.25)', glow: '#bb66ff'
});
signB.position.set(-102, -24, 0);
signB.rotation.y = THREE.MathUtils.degToRad(20);
scene.add(signB);

const signReturn = createSignBoardPlane({
  width: 10, height: 3, bg: 'rgba(30,10,30,0.25)', glow: '#bb66ff'
});
signReturn.position.set(-100, -38, -10);
scene.add(signReturn);


const signReturn2 = createSignBoardPlane({
  width: 10, height: 3, bg: 'rgba(30,10,30,0.25)', glow: '#bb66ff'
});
signReturn2.position.set(-100, 42, 270);
scene.add(signReturn2);


const signBIGA = createSignBoardPlane({
  width: 100, height: 200, bg: 'rgba(240,240,240,0.95)', glow: '#bb66ff'
});
signBIGA.position.set(-100, 60, 230);
scene.add(signBIGA);


// 看板テキスト（TextGeometryで統一フォント）
let signAText = null;
let signBText = null;
let signReturnText = null;
let signReturn2Text = null;


function buildSignTexts() {
  if (!uiFont) return;
  if (!signAText)     signAText     = attachSignText(signA, 'ANJI TERAOKA', 0.5, textMatWhite, 0.5);
  if (!signBText)     signBText     = attachSignText(signB, 'ISH NURAS',    0.5, textMatWhite, 0.5);
  if (!signReturnText)signReturnText= attachSignText(signReturn, 'BACK TO TOP', 0.5, textMatWhite, 0.5);
  if (!signReturn2Text)signReturn2Text= attachSignText(signReturn2, 'BACK', 0.5, textMatWhite, 0.5);
}







// --------------------------------------
// SOUND neon button (center-top UI)
// --------------------------------------
const signS = createSignBoardPlane({
  width: 280, height: 90, bg: 'rgba(30,10,30,0.25)', glow: '#bb66ff'
});
signS.position.set(0, 600, -900);
scene.add(signS);

let signSoundText = null;
function buildSoundText() {
  if (!uiFont || signSoundText) return;
  signSoundText = attachSignText(signS, 'SOUND', 18, textMatWhite, 2);
}

// --------------------------------------
// Audio graph (deep reverb & echo when psyOn)
// --------------------------------------
const {
  actx,
  audio1Element,
  audio2Element,
  psyElement,
  setPsyAudio,
} = createPsyAudioGraph();

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
  menuPlane, windowGlass1,
  signReturn,signReturn2,
  flagMesh,
  signS,
  signA   // ←追加
];
const clickableObjects = clickableA.concat([bubble1, mBubble2, bubble3, bubble4, bubble5]);
const clickableSet = new Set(clickableObjects);

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

  const intersects1 = _raycaster.intersectObjects(clickableObjects, true);
  if (intersects1.length) {
    const obj = getClickableRoot(intersects1[0].object);
    if (!obj) return;

    if (obj === menuPlane) {
      animateCameraToPositionAndTarget(camera, new THREE.Vector3(0, -20, 20), new THREE.Vector3(0, -20, -1000), 3000);
      handled = true;

    } else if (obj === windowGlass1) {
     changeSky();
      animateCameraToPositionAndTarget(camera, new THREE.Vector3(0, 20, 20), new THREE.Vector3(0, 0, -1000), 3000);
      handled = true;

    } else if (obj === bubble1) {
      // MUSICのバブル
      animateCameraToPositionAndTarget(camera, new THREE.Vector3(-100, -20, 20), new THREE.Vector3(-100, -20, -1000), 3000);
      handled = true;

    } else if (obj === mBubble2) {
      // bubble2 → サイトへ
      window.location.assign('https://anjiteraoka.com/');
      handled = true;

    } else if (obj === bubble3) {
      // bubble3 → Instagram（新しいタブ）
      window.open('https://www.instagram.com/anji_teraoka/', '_blank');
      handled = true;

    } else if (obj === signReturn) {
      // ルーム内から地上（y&#8776;0）へ戻る
     animateCameraToPositionAndTarget(camera, new THREE.Vector3(0, 20, 20), new THREE.Vector3(0, 0, -1000), 3000);
      handled = true;

    } else if (obj === flagMesh) {
      // フラッグに近づく → レインボー全面 → 遷移
      const toPos    = new THREE.Vector3(100, 500, -940);
      const toLookAt = new THREE.Vector3(100, 500, -1000);
      animateCameraToPositionAndTarget(camera, toPos, toLookAt, 3000, () => {
        rainbowOn = true;
        rainbowPass.enabled = true;
        rainbowStartTime = performance.now();
        setTimeout(() => {
          window.location.assign('./rb.html');
        }, 2200);
      });
      handled = true;

    } else if (obj === signS) {
      if (actx.state !== 'running') actx.resume();
      if (psyElement.paused) {
        psyElement.play().catch(console.warn);
      } else {
        psyElement.pause();
      }
      handled = true;

    // ANJI TERAOKAをクリック
    } else if (obj === signA) {
      // フラッグに近づく → レインボー全面 → 遷移
      const toPos    = new THREE.Vector3(100, 500, -940);
      const toLookAt = new THREE.Vector3(100, 500, -1000);
      animateCameraToPositionAndTarget(camera, toPos, toLookAt, 3000, () => {
        rainbowOn = true;
        rainbowPass.enabled = true;
        rainbowStartTime = performance.now();
        setTimeout(() => {
          window.location.assign('./at.html');
        }, 2200);
      });
      handled = true;
    }
  }

  // Elephant click → euphoric toggle + audio FX link
  if (!handled && ele) {
    const hitEle = _raycaster.intersectObject(ele, true);
    if (hitEle.length) {
      psyOn = !psyOn;
      psyPass.enabled = psyOn;
      setPsyAudio(psyOn); // ← 音も連動
      handled = true;
    }
  }
}
document.addEventListener('click', handleClick);


// --------------------------------------
// 空変更アニメーション
// --------------------------------------
function animateSky(target, duration = 3000) {
  const start = performance.now();

  // 初期値を保持
  const from = {
    turbidity: skyUniforms.turbidity.value,
    rayleigh: skyUniforms.rayleigh.value,
    mieCoefficient: skyUniforms.mieCoefficient.value,
    mieDirectionalG: skyUniforms.mieDirectionalG.value,
    sunPosition: skyUniforms.sunPosition.value.clone()
  };

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function update(now) {
    const t = Math.min((now - start) / duration, 1);

    // --- Skyパラメータ ---
    skyUniforms.turbidity.value =
      lerp(from.turbidity, target.turbidity, t);

    skyUniforms.rayleigh.value =
      lerp(from.rayleigh, target.rayleigh, t);

    skyUniforms.mieCoefficient.value =
      lerp(from.mieCoefficient, target.mieCoefficient, t);

    skyUniforms.mieDirectionalG.value =
      lerp(from.mieDirectionalG, target.mieDirectionalG, t);

    // --- 太陽位置（Vector3） ---
    skyUniforms.sunPosition.value.lerpVectors(
      from.sunPosition,
      target.sunPosition,
      t
    );

    if (t < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// --------------------------------------
// 空変更
// --------------------------------------
function changeSky() {

  const elevation = 80;
  const azimuth   = 180;

  const targetSun = new THREE.Vector3();
  targetSun.setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - elevation),
    THREE.MathUtils.degToRad(azimuth)
  );

  animateSky({
    turbidity: 4,
    rayleigh: 2,
    mieCoefficient: 0.1,
    mieDirectionalG: 0.988,
    sunPosition: targetSun
  }, 3000); // ←3秒
}

// --------------------------------------
// Build orchestrator (font/targets readiness)
// --------------------------------------
function tryBuildAllLabels() {
  buildBubbleLabels();
  buildSignTexts();
  buildSoundText();
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
let time = 0;
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  time += dt;

  // menu bubbles bounce
  if (bubble1)  bubble1.position.y  = Math.abs(Math.sin(time * 1.5) * 3) - 14;
  if (mBubble2) mBubble2.position.y = Math.abs(Math.sin(time * 1.0) * 3) - 30;
  if (bubble3)  bubble3.position.y  = Math.abs(Math.sin(time * 1.0) * 3) - 38;
  if (bubble4)  bubble4.position.y  = Math.abs(Math.sin(time * 1.2) * 3) - 48;
  if (bubble5)  bubble5.position.y  = Math.abs(Math.sin(time * 1.5) * 3) - 52;

  // バブルラベル追従
  if (uiFont) {
    if (bubble1 && musicLabel)  musicLabel.position.set(bubble1.position.x,  bubble1.position.y,  bubble1.position.z  + 12);
    if (mBubble2 && webLabel)   webLabel.position.set(mBubble2.position.x,   mBubble2.position.y,   mBubble2.position.z + 12);
    if (bubble3 && igLabel3D)   igLabel3D.position.set(bubble3.position.x,   bubble3.position.y,    bubble3.position.z  + 6);
  }

  // rising bubbles
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    b.position.y += 0.3;
    if (b.position.y >= b.userData.targetY) {
      b.position.y = -60;
      b.position.x = (Math.random() - 0.5) * 40;
      b.position.z = (Math.random() - 0.5) * 40;
    }
  }

  // water & flag animation
  water.material.uniforms.time.value += 1 / 60;
  flagMaterial.uniforms.time.value  += 0.05;

  // optional breathing lights
  const tnow = performance.now() * 0.001;
  ambientLight.intensity = 0.5 + Math.sin(tnow * 0.5) * 0.2;
  fillLight.intensity    = 0.8 + Math.cos(tnow * 0.3) * 0.3;

  // PostFX path
  if (rainbowOn) {
    const elapsed = (performance.now() - rainbowStartTime) * 0.001;
    rainbowPass.uniforms.time.value += dt;
    rainbowPass.uniforms.strength.value = Math.min(1.0, elapsed / 1.2);
    composer.render();
  } else if (psyOn) {
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
  try { psyElement.pause(); } catch {}
  try { audio1Element.pause(); audio2Element.pause(); } catch {}
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

