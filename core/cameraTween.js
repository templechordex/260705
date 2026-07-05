// Shared camera tween helper.
export function animateCameraToPositionAndTarget(
  cam,
  targetPos,
  targetLookAt,
  durationMs,
  onDone,
  scratch = {}
) {
  const { THREE } = scratch;
  const startPos = (scratch.startPos || new THREE.Vector3()).copy(cam.position);
  const startLookAt = (scratch.startLookAt || new THREE.Vector3()).copy(cam.getWorldDirection(scratch.worldDir || new THREE.Vector3()).add(cam.position));
  const lerpedPos = scratch.lerpedPos || new THREE.Vector3();
  let startTime = null;

  function update(t) {
    if (!startTime) startTime = t;
    const p = Math.min((t - startTime) / durationMs, 1);
    lerpedPos.copy(startPos).lerp(targetPos, p);
    const look = startLookAt.clone().lerp(targetLookAt, p);
    cam.position.copy(lerpedPos);
    cam.lookAt(look);
    if (p < 1) requestAnimationFrame(update);
    else onDone && onDone();
  }
  requestAnimationFrame(update);
}
