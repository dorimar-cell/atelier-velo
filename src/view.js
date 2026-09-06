import * as THREE from "three";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function framing() {
  const mobile = window.innerWidth < 860;
  return {
    camera: new THREE.Vector3(mobile ? 0.06 : 0.92, mobile ? 0.52 : 0.4, mobile ? 4.45 : 3.7),
    target: new THREE.Vector3(mobile ? 0.04 : 0.96, mobile ? 0.28 : 0.14, 0),
  };
}

export function createObjectView(canvas, camera) {
  const desired = { yaw: 0, pitch: 0, zoom: 1 };
  const current = { yaw: 0, pitch: 0, zoom: 1 };
  const pointers = new Map();
  const look = new THREE.Vector3();
  const offset = new THREE.Vector3();

  let pinchStart = 0;
  let pinchZoom = 1;
  let dragging = false;

  const MIN_PITCH = -0.62;
  const MAX_PITCH = 0.7;
  const MIN_ZOOM = 0.46;
  const MAX_ZOOM = 1.62;

  function setDragging(value) {
    dragging = value;
    canvas.classList.toggle("is-dragging", value);
  }

  function fromChrome(event) {
    return Boolean(event.target.closest?.("button, .dock, .reset, a, input, textarea"));
  }

  function onPointerDown(event) {
    if (fromChrome(event)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail if the event didn't originate on the canvas.
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      setDragging(true);
      return;
    }
    if (pointers.size === 2) {
      const [a, b] = pointers.values();
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchZoom = desired.zoom;
      setDragging(true);
    }
  }

  function onPointerMove(event) {
    const prev = pointers.get(event.pointerId);
    if (!prev) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);

    if (pointers.size >= 2) {
      const [a, b] = pointers.values();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart > 8) {
        desired.zoom = clamp(pinchZoom * (pinchStart / dist), MIN_ZOOM, MAX_ZOOM);
      }
      return;
    }

    if (!dragging) return;
    desired.yaw += (next.x - prev.x) * 0.0054;
    desired.pitch = clamp(desired.pitch + (next.y - prev.y) * 0.0036, MIN_PITCH, MAX_PITCH);
  }

  function onPointerUp(event) {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    pointers.delete(event.pointerId);
    if (pointers.size === 0) {
      setDragging(false);
      pinchStart = 0;
    } else if (pointers.size === 1) {
      pinchStart = 0;
    }
  }

  function onWheel(event) {
    if (fromChrome(event)) return;
    event.preventDefault();
    desired.zoom = clamp(desired.zoom * Math.exp(event.deltaY * 0.00115), MIN_ZOOM, MAX_ZOOM);
  }

  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function reset() {
    desired.yaw = 0;
    desired.pitch = 0;
    desired.zoom = 1;
    current.yaw = 0;
    current.pitch = 0;
    current.zoom = 1;
  }

  function set(yaw = 0, pitch = 0, zoom = 1) {
    desired.yaw = yaw;
    desired.pitch = clamp(pitch, MIN_PITCH, MAX_PITCH);
    desired.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    current.yaw = desired.yaw;
    current.pitch = desired.pitch;
    current.zoom = desired.zoom;
  }

  function update(dt) {
    const k = 1 - Math.exp(-12 * dt);
    current.yaw += (desired.yaw - current.yaw) * k;
    current.pitch += (desired.pitch - current.pitch) * k;
    current.zoom += (desired.zoom - current.zoom) * k;
    return current;
  }

  function apply(root) {
    const pose = framing();
    look.copy(pose.target);
    offset.copy(pose.camera).sub(look).multiplyScalar(current.zoom);
    camera.position.copy(look).add(offset);
    camera.lookAt(look);
    if (root) {
      root.rotation.y += current.yaw;
      root.rotation.x += current.pitch;
    }
  }

  return { update, apply, reset, set };
}
