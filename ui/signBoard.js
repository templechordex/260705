// Shared neon sign board helpers.
export function createSignBoardPlane(THREE, {
  width = 200,
  height = 80,
  bg = 'rgba(10,10,20,0.25)',
  glow = '#bb66ff',
  corner = 18
} = {}) {
  const cw = 1024, ch = 512;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx2d = canvas.getContext('2d');

  ctx2d.clearRect(0, 0, cw, ch);
  ctx2d.fillStyle = bg;
  const r = corner;
  ctx2d.beginPath();
  ctx2d.moveTo(r, 0);
  ctx2d.arcTo(cw, 0, cw, ch, r);
  ctx2d.arcTo(cw, ch, 0, ch, r);
  ctx2d.arcTo(0, ch, 0, 0, r);
  ctx2d.arcTo(0, 0, cw, 0, r);
  ctx2d.closePath();
  ctx2d.fill();

  if (glow) {
    ctx2d.lineWidth = 14;
    ctx2d.strokeStyle = glow;
    ctx2d.shadowColor = glow;
    ctx2d.shadowBlur = 40;
    ctx2d.stroke();
  }

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
  mesh.userData._dispose = () => { tex.dispose(); geo.dispose(); mat.dispose(); };
  return mesh;
}

export function attachSignText(THREE, TextGeometry, signMesh, font, text, size, material, zOffset = 2) {
  if (!font) return null;
  const g = new TextGeometry(text, { font, size, depth: 0, bevelEnabled: false });
  g.center();
  const m = new THREE.Mesh(g, material);
  m.position.set(0, 0, zOffset);
  signMesh.add(m);
  return m;
}
