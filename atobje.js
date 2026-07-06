//2026.6.16
// atobje.js (three r180 compatible + optimized)

import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';

export function addObjeToScene(scene) {
  // まとめて扱う親グループ（管理・破棄が楽）
  const group = new THREE.Group();
  const ceilingObjects = [];
  scene.add(group);

  // ----------------------------------
  // Spaceship interior: dark hull shell
  // ----------------------------------
  const hullMat = new THREE.MeshPhongMaterial({
    color: 0x101827,
    emissive: 0x020812,
    shininess: 80,
    specular: 0x66ddff,
    side: THREE.DoubleSide,
  });
  const accentMat = new THREE.MeshPhongMaterial({
    color: 0x1f3344,
    emissive: 0x031a26,
    shininess: 100,
    specular: 0x88eeff,
  });
  const darkPanelMat = new THREE.MeshPhongMaterial({
    color: 0x050912,
    emissive: 0x01040a,
    shininess: 40,
    specular: 0x334455,
  });
  const cyanLightMat = new THREE.MeshBasicMaterial({ color: 0x66ddff });
  const magentaLightMat = new THREE.MeshBasicMaterial({ color: 0xff55cc });

  // 外殻は透明な普通の部屋ではなく、濃紺の金属製シリンダーとして見せる
  // 直径110・奥行き300で、元のボックス内装と同じくらいのサイズ感にする
  const roomGeo = new THREE.CylinderGeometry(55, 55, 300, 64, 1, true);
  const room = new THREE.Mesh(roomGeo, hullMat);
  room.position.set(0, 0, 0);
  room.rotation.x = Math.PI / 2;
  group.add(room);

  // ----------------------------------
  // Floor: metal deck panels + glowing center lane
  // ----------------------------------
  const floorBase = new THREE.Mesh(
    new THREE.BoxGeometry(72, 2.2, 286),
    darkPanelMat
  );
  floorBase.position.set(0, -46, 0);
  group.add(floorBase);

  const deckPanelGeo = new THREE.BoxGeometry(30, 1, 24);
  const deckLineGeo = new THREE.BoxGeometry(2, 0.9, 20);
  for (let z = -132; z <= 132; z += 24) {
    [-18, 18].forEach((x) => {
      const panel = new THREE.Mesh(deckPanelGeo, accentMat);
      panel.position.set(x, -44.4, z);
      group.add(panel);
    });

    const centerLine = new THREE.Mesh(deckLineGeo, cyanLightMat);
    centerLine.position.set(0, -43.8, z);
    group.add(centerLine);
  }

  // ----------------------------------
  // Side walls: ribbed bulkheads, pipes, neon strips
  // ----------------------------------
  const ribGeo = new THREE.BoxGeometry(4, 86, 5);
  const sidePanelGeo = new THREE.BoxGeometry(3, 32, 22);
  const pipeGeo = new THREE.CylinderGeometry(1.2, 1.2, 280, 16);
  const pipeMat = new THREE.MeshPhongMaterial({
    color: 0x26394a,
    emissive: 0x020912,
    shininess: 70,
    specular: 0x88eeff,
  });

  [-52, 52].forEach((x) => {
    for (let z = -135; z <= 135; z += 30) {
      const rib = new THREE.Mesh(ribGeo, accentMat);
      rib.position.set(x, -2, z);
      group.add(rib);

      const wallPanel = new THREE.Mesh(sidePanelGeo, darkPanelMat);
      wallPanel.position.set(x * 0.985, -4, z + 14);
      group.add(wallPanel);
    }

    [-22, 24].forEach((y) => {
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x * 0.94, y, 0);
      group.add(pipe);
    });

    const neonStrip = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2, 270),
      cyanLightMat
    );
    neonStrip.position.set(x * 0.96, 28, 0);
    group.add(neonStrip);
  });

  // ----------------------------------
  // Ceiling: segmented light rails
  // ----------------------------------
  const ceilingPanel = new THREE.Mesh(
    new THREE.BoxGeometry(82, 2, 286),
    hullMat
  );
  ceilingPanel.position.set(0, 46, 0);
  ceilingObjects.push(ceilingPanel);
  group.add(ceilingPanel);

  const ceilingLightGeo = new THREE.BoxGeometry(18, 1.2, 16);
  for (let z = -126; z <= 126; z += 36) {
    const lamp = new THREE.Mesh(ceilingLightGeo, cyanLightMat);
    lamp.position.set(0, 44.4, z);
    ceilingObjects.push(lamp);
    group.add(lamp);

    const sideLampL = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10), magentaLightMat);
    sideLampL.position.set(-28, 44.2, z + 12);
    ceilingObjects.push(sideLampL);
    group.add(sideLampL);

    const sideLampR = sideLampL.clone();
    sideLampR.position.x = 28;
    ceilingObjects.push(sideLampR);
    group.add(sideLampR);
  }

  // ----------------------------------
  // Console blocks near monitor area
  // ----------------------------------
  const consoleMat = new THREE.MeshPhongMaterial({
    color: 0x14202e,
    emissive: 0x031522,
    shininess: 90,
    specular: 0x66ddff,
  });
  const consoleGeo = new THREE.BoxGeometry(14, 8, 10);
  [-28, 28].forEach((x) => {
    const consoleBlock = new THREE.Mesh(consoleGeo, consoleMat);
    consoleBlock.position.set(x, -26, 48);
    group.add(consoleBlock);

    const consoleGlow = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 6), cyanLightMat);
    consoleGlow.position.set(x, -21.7, 48);
    group.add(consoleGlow);
  });

  // グループ全体をZ方向へ60移動
  group.position.z = -60;
  group.userData.ceilingObjects = ceilingObjects;


  // 外から参照したい場合に返す
  return group;
}
