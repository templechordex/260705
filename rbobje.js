//2026.2.23
// rbobje.js (three r180 compatible + optimized)

import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';

export function addObjeToScene(scene) {
  // まとめて扱う親グループ（管理・破棄が楽）
  const group = new THREE.Group();
  scene.add(group);

  // ----------------------------------
  // ルーム（透明箱）&#8212; 透明描画の破綻を抑える
  // ----------------------------------
  const RoomGeo = new THREE.BoxGeometry(100, 100, 100);
  const RoomMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    shininess: 0,
    specular: 0xffffff,
    //depthWrite: false, // 透明のZ競合を軽減
  });

  const Room = new THREE.Mesh(RoomGeo, RoomMat);
  Room.position.set(0,0,-300);
  Room.matrixAutoUpdate = false; Room.updateMatrix();
  //group.add(Room);

//
// ===== 鳥居 =====
//
const torii = new THREE.Group();

// 柱（左右）
const pillarGeo = new THREE.CylinderGeometry(1, 1, 20, 16);
const redMat = new THREE.MeshPhongMaterial({ color: 0xff3300 });

const leftPillar = new THREE.Mesh(pillarGeo, redMat);
leftPillar.position.set(-6, 0, 0);

const rightPillar = new THREE.Mesh(pillarGeo, redMat);
rightPillar.position.set(6, 0, 0);

// 上の柱
const topBeam = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 4), redMat);
topBeam.position.set(0, 10, 0);

// 床
const topBeam2 = new THREE.Mesh(new THREE.BoxGeometry(36, 2, 80), redMat);
topBeam2.position.set(0, -10, 0);

torii.add(leftPillar, rightPillar, topBeam, topBeam2);
torii.position.set(0, 20, -30);

scene.add(torii);


// 複製してzだけ変える
for (let i = 1; i <= 20; i++) {
  const t = torii.clone();

  t.position.z = -30 - (i * -80); // 間隔を-80ずつ

  scene.add(t);
}


  // 外から参照したい場合に返す
  return group;
}
