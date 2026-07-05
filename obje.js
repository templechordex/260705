//2026.2.22
// obje.js (three r180 compatible + optimized)
import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';

export function addObjeToScene(scene) {
  // まとめて扱う親グループ（管理・破棄が楽）
  const group = new THREE.Group();
  scene.add(group);

  // ----------------------------------
  // 共通ジオメトリ／マテリアル（再利用）
  // ----------------------------------
  const matMount   = new THREE.MeshLambertMaterial({ color: 0x594255 });
  const geoBall    = new THREE.SphereGeometry(500, 32, 32);
  const geoCone    = new THREE.ConeGeometry(400, 1000, 32);
  const geoTk      = new THREE.TorusKnotGeometry(100, 60, 60, 10, 8, 18);

  // ----------------------------------
  // 山ボール（静的 → 行列固定）
  // ----------------------------------
  const mountBall1 = new THREE.Mesh(geoBall, matMount);
  mountBall1.position.set(-200, -200, -1500);
  mountBall1.matrixAutoUpdate = false; mountBall1.updateMatrix();
  group.add(mountBall1);

  const mountBall2 = mountBall1.clone();
  mountBall2.position.set(-400, -200, -1400);
  mountBall2.updateMatrix();
  //group.add(mountBall2);

  // 元コードでは mountBall3 は未追加（scene.add がコメントアウト）なので同様に未追加
  // 追加したい場合は下記を有効化してください
  // const mountBall3 = mountBall1.clone();
  // mountBall3.position.set(-300, 60, -1000);
  // mountBall3.updateMatrix();
  // group.add(mountBall3);

  // ----------------------------------
  // 山コーン
  // ----------------------------------
  const mountCone1 = new THREE.Mesh(geoCone, matMount);
  mountCone1.position.set(-80, 0, -1800);
  mountCone1.matrixAutoUpdate = false; mountCone1.updateMatrix();
  group.add(mountCone1);

  const mountCone2 = mountCone1.clone();
  mountCone2.position.set(-200, 0, -1700);
  mountCone2.updateMatrix();
  group.add(mountCone2);

  // ----------------------------------
  // 山 TorusKnot
  // ----------------------------------
  const mountTk1 = new THREE.Mesh(geoTk, matMount);
  mountTk1.position.set(-300, 100, -600);
  mountTk1.matrixAutoUpdate = false; mountTk1.updateMatrix();
  group.add(mountTk1);

  const mountTk2 = mountTk1.clone();
  mountTk2.position.set(200, -160, -300);
  mountTk2.updateMatrix();
  group.add(mountTk2);

  // ----------------------------------
  // ルーム（透明箱）&#8212; 透明描画の破綻を抑える
  // ----------------------------------
  const musicRoomGeo = new THREE.BoxGeometry(3000, 3000, 3000);
  const musicRoomMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    shininess: 0,
    specular: 0xffffff,
    depthWrite: false, // 透明のZ競合を軽減
  });

  const musicRoom = new THREE.Mesh(musicRoomGeo, musicRoomMat);
  musicRoom.position.set(0, -3000, 0);
  musicRoom.matrixAutoUpdate = false; musicRoom.updateMatrix();
  //group.add(musicRoom);

  // ----------------------------------
  // ルーム内部ライト（シャドウ未使用前提）
  // ----------------------------------
  const roomLightFront = new THREE.PointLight(0x00ffff, 1.2, 800);
  roomLightFront.position.set(0, -950, 400);
  //group.add(roomLightFront);

  const roomLightBack = new THREE.PointLight(0x00ffff, 0.6, 800);
  roomLightBack.position.set(0, -1000, -500);
  //group.add(roomLightBack);

  // 環境光（全体を少しだけシアン寄りに）
  const ambientLight = new THREE.AmbientLight(0x00ffff, 5);
  //group.add(ambientLight);

  // 外から参照したい場合に返す
  return group;
}
