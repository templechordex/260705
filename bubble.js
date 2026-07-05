//2026.2.22
// bubble.js (three r180 compatible + optimized)
import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';

/**
 * ランダムに上昇する泡の生成
 * - 1つの SphereGeometry を共有し、mesh.scale でサイズを付与
 * - 透明マテリアルは depthWrite:false でZ競合のチラつきを抑制
 * - 返り値は { bubbles, bubbleMaterial }（np.jsの既存コード互換）
 */
export function createBubbles(scene, { count = 20 } = {}) {
  const bubbleMaterial = new THREE.MeshPhongMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.6,
    shininess: 100,
    specular: 0xffffff,
    depthWrite: false,
  });

  // 共有ジオメトリ（分割数は負荷と見た目のバランス）
  const sharedGeo = new THREE.SphereGeometry(1, 24, 16);

  const bubbles = [];
  for (let i = 0; i < count; i++) {
    // 元の (0.5&#12316;0.53程度) に相当するレンジ
    const size = Math.random() * 0.06 + 0.5;

    const bubble = new THREE.Mesh(sharedGeo, bubbleMaterial);
    bubble.scale.set(size, size, size);

    // 初期位置
    const startY = Math.random() * 40 - 100;
    bubble.position.set(
      (Math.random() - 0.5) * 40,
      startY,
      (Math.random() - 0.5) * 40
    );

    // アニメ用メタデータ
    bubble.userData.targetY = 0;       // 到達でリセット
    bubble.userData.resetRange = 40;   // X/Z再配置のレンジ
    // 将来個別速度を使うときは以下を利用:
    // bubble.userData.speed = 0.3 + Math.random() * 0.1;

    bubbles.push(bubble);
    scene.add(bubble);
  }

  return { bubbles, bubbleMaterial };
}

/**
 * メニュー用の大きいバブル群
 * - ジオメトリ共有
 * - 返り値は { bubble1..bubble5 }（np.jsの既存コード互換）
 */
export function createMenuBubbles(scene, bubbleMaterial) {
  // 透明マテリアルの一貫性（他から渡された場合でもチラつき対策）
  if (bubbleMaterial && bubbleMaterial.transparent && bubbleMaterial.depthWrite !== false) {
    bubbleMaterial.depthWrite = false;
  }

  const bigGeo   = new THREE.SphereGeometry(12, 32, 24);
  const smallGeo = new THREE.SphereGeometry(5, 32, 24);

  const bubble1 = new THREE.Mesh(bigGeo, bubbleMaterial);
  bubble1.position.set(-10, -14, -40);
  scene.add(bubble1);

  const bubble2 = new THREE.Mesh(bigGeo, bubbleMaterial);
  bubble2.position.set(8, -50, -40);
  scene.add(bubble2);

  const bubble3 = new THREE.Mesh(smallGeo, bubbleMaterial);
  bubble3.position.set(-12, -43, -40);
  scene.add(bubble3);

  const bubble4 = new THREE.Mesh(smallGeo, bubbleMaterial);
  bubble4.position.set(-8, -53, -40);
  scene.add(bubble4);

  const bubble5 = new THREE.Mesh(smallGeo, bubbleMaterial);
  bubble5.position.set(2, -57, -40);
  scene.add(bubble5);

  return { bubble1, bubble2, bubble3, bubble4, bubble5 };
}
