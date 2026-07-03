"use client";
import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RoofModel } from "@/lib/eagleview";
import {
  LINE_COLORS,
  PRIMARY_LINE_TYPES,
  pitchNumber,
  areaNumber,
  feetWhole,
  type LabelMode,
} from "./roofViz";
import {
  buildIndexes,
  ringOf,
  centroid,
  faceNormal,
  groundZ,
  worldToThree,
  triangulateRing,
  synthesizeWalls,
  type Vec3,
} from "./roofGeometry";
import { makeShingleTextures } from "./shingleTexture";

// Probed once (lazily) so the effect never has to setState on failure.
function webglSupported(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// Immersive 3D roof model. Orbit by default; CLICK the canvas to enter
// first-person fly (pointer lock): mouse looks, WASD moves, Q/E + Space/Shift go
// up/down, Esc returns to orbit. Ground + synthesized walls make it read as a
// house; `showHouse` toggles them. `labelMode` mirrors the 2D blueprint filters.
export function RoofModel3D({
  model,
  labelMode,
  showHouse,
  className,
}: {
  model: RoofModel;
  labelMode: LabelMode;
  showHouse: boolean;
  className?: string;
}) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const [supported] = React.useState(webglSupported);
  const [mode, setMode] = React.useState<"orbit" | "fly">("orbit");

  const modeRef = React.useRef<"orbit" | "fly">("orbit");
  React.useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Scene-control callbacks, set during the build effect, called by prop effects.
  const applyLabelRef = React.useRef<(m: LabelMode) => void>(() => {});
  const applyHouseRef = React.useRef<(b: boolean) => void>(() => {});
  React.useEffect(() => {
    applyLabelRef.current(labelMode);
  }, [labelMode]);
  React.useEffect(() => {
    applyHouseRef.current(showHouse);
  }, [showHouse]);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !supported) return;

    const idx = buildIndexes(model);
    const b = model.totals.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const gz = groundZ(model);
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
    const toThree = worldToThree(cx, cy, cz);
    const v3 = (p: Vec3) => {
      const q = toThree(p);
      return new THREE.Vector3(q.x, q.y, q.z);
    };
    const groundThreeY = toThree({ x: 0, y: 0, z: gz }).y;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      return;
    }
    const w = mount.clientWidth || 600;
    const h = mount.clientHeight || 380;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    mount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(w, h);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.inset = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    mount.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, span * 30);
    camera.position.set(span * 0.85, span * 0.95, span * 0.85);

    const disposables: (() => void)[] = [];
    const track = (g: THREE.BufferGeometry, m: THREE.Material) =>
      disposables.push(() => {
        g.dispose();
        m.dispose();
      });

    // ── Sky + lighting (warm sun, soft shadows, ACES) ──
    const sky = new Sky();
    sky.scale.setScalar(span * 20);
    scene.add(sky);
    // Evening / golden-hour: a low warm sun + hazy sunset sky.
    const sun = new THREE.Vector3().setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(66), // ≈24° elevation — warm, but shorter/softer shadows
      THREE.MathUtils.degToRad(125),
    );
    const skyMat = sky.material as THREE.ShaderMaterial;
    skyMat.uniforms.sunPosition.value.copy(sun);
    skyMat.uniforms.turbidity.value = 10;
    skyMat.uniforms.rayleigh.value = 2.4;
    skyMat.uniforms.mieCoefficient.value = 0.005;
    skyMat.uniforms.mieDirectionalG.value = 0.86;

    scene.add(new THREE.HemisphereLight(0xf6dcc0, 0x6a5949, 0.85)); // brighter fill
    const key = new THREE.DirectionalLight(0xffc488, 2.3);
    key.position.copy(sun).multiplyScalar(span * 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -span * 1.3;
    sc.right = span * 1.3;
    sc.top = span * 1.3;
    sc.bottom = -span * 1.3;
    sc.near = 0.1;
    sc.far = span * 8;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = span * 0.002;
    scene.add(key);
    scene.add(key.target);

    const houseGroup = new THREE.Group();
    scene.add(houseGroup);

    // Sky-reflection environment (PMREM) — gives the glass skylights real
    // reflections and the shingles a subtle sheen. Optional; guarded.
    let envTex: THREE.Texture | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const skyScene = new THREE.Scene();
      const skyEnv = new Sky();
      skyEnv.scale.setScalar(span * 20);
      const sem = skyEnv.material as THREE.ShaderMaterial;
      sem.uniforms.sunPosition.value.copy(sun);
      sem.uniforms.turbidity.value = 10;
      sem.uniforms.rayleigh.value = 2.4;
      sem.uniforms.mieCoefficient.value = 0.005;
      sem.uniforms.mieDirectionalG.value = 0.86;
      skyScene.add(skyEnv);
      envTex = pmrem.fromScene(skyScene).texture;
      scene.environment = envTex;
      skyEnv.geometry.dispose();
      sem.dispose();
      pmrem.dispose();
    } catch {
      /* environment is optional */
    }

    // Build a merged mesh from world-space triangle vertices.
    function meshFromTris(tris: Vec3[], mat: THREE.Material, cast = true): THREE.Mesh | null {
      if (!tris.length) {
        mat.dispose();
        return null;
      }
      const pos = new Float32Array(tris.length * 3);
      for (let i = 0; i < tris.length; i++) {
        const q = toThree(tris[i]);
        pos[i * 3] = q.x;
        pos[i * 3 + 1] = q.y;
        pos[i * 3 + 2] = q.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      track(geo, mat);
      return mesh;
    }

    // Roof — procedural architectural asphalt shingles (the default material,
    // since the sandbox reports none). Per-facet planar UVs: U runs along the
    // eave, V up the slope, scaled to real feet so the courses look right.
    const shingle = makeShingleTextures();
    disposables.push(() => shingle.dispose());
    const TILE_FEET = 6;
    const roofPos: number[] = [];
    const roofUV: number[] = [];
    const upW = new THREE.Vector3(0, 0, 1);
    const nv = new THREE.Vector3();
    const uAxis = new THREE.Vector3();
    const vAxis = new THREE.Vector3();
    for (const f of model.faces) {
      const ring = ringOf(f.lineIds, idx);
      if (!ring) continue;
      const n = faceNormal(ring) ?? { x: 0, y: 0, z: 1 };
      nv.set(n.x, n.y, n.z);
      uAxis.crossVectors(upW, nv); // horizontal, along the eave
      if (uAxis.lengthSq() < 1e-8) uAxis.set(1, 0, 0); // flat facet fallback
      uAxis.normalize();
      vAxis.crossVectors(nv, uAxis).normalize(); // up the slope
      const o = ring[0];
      const uvOf = (p: Vec3): [number, number] => {
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const dz = p.z - o.z;
        return [
          (dx * uAxis.x + dy * uAxis.y + dz * uAxis.z) / TILE_FEET,
          (dx * vAxis.x + dy * vAxis.y + dz * vAxis.z) / TILE_FEET,
        ];
      };
      for (let i = 1; i < ring.length - 1; i++) {
        for (const p of [ring[0], ring[i], ring[i + 1]]) {
          const q = toThree(p);
          roofPos.push(q.x, q.y, q.z);
          const uv = uvOf(p);
          roofUV.push(uv[0], uv[1]);
        }
      }
    }
    const roofGeo = new THREE.BufferGeometry();
    roofGeo.setAttribute("position", new THREE.Float32BufferAttribute(roofPos, 3));
    roofGeo.setAttribute("uv", new THREE.Float32BufferAttribute(roofUV, 2));
    roofGeo.computeVertexNormals();
    const roofMat = new THREE.MeshStandardMaterial({
      map: shingle.map,
      bumpMap: shingle.bump,
      bumpScale: 0.22,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.35,
    });
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    houseGroup.add(roofMesh);
    track(roofGeo, roofMat);

    // Typed colored edges.
    const edgePos: number[] = [];
    const edgeCol: number[] = [];
    const tmp = new THREE.Color();
    for (const l of model.lines) {
      const a = idx.pointsById.get(l.aId);
      const bb = idx.pointsById.get(l.bId);
      if (!a || !bb) continue;
      const va = v3(a);
      const vb = v3(bb);
      tmp.set(LINE_COLORS[l.type]);
      edgePos.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      edgeCol.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgePos, 3));
    edgeGeo.setAttribute("color", new THREE.Float32BufferAttribute(edgeCol, 3));
    const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 });
    houseGroup.add(new THREE.LineSegments(edgeGeo, edgeMat));
    track(edgeGeo, edgeMat);

    // Ground.
    const groundGeo = new THREE.PlaneGeometry(span * 8, span * 8);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xb9ab95, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = groundThreeY;
    ground.receiveShadow = true;
    scene.add(ground);
    track(groundGeo, groundMat);

    // Synthesized walls (sandbox-only; replaceable in production).
    const wallsMesh = meshFromTris(
      synthesizeWalls(model, gz),
      new THREE.MeshStandardMaterial({ color: 0xd8d0c4, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    );
    if (wallsMesh) houseGroup.add(wallsMesh);

    // Penetrations, split by size. Real skylights (≳4.5 sq ft) get a LOW curb +
    // a reflective glass pane. The many small vents/pipes (the majority) render
    // as flat dark markers flush with the roof — no tall boxes cluttering it.
    const SKYLIGHT_MIN = 4.5;
    const frameTris: Vec3[] = [];
    const glassTris: Vec3[] = [];
    const ventCenters: Vec3[] = [];
    for (const p of model.penetrations) {
      const ring = ringOf(p.lineIds, idx);
      if (!ring) continue;
      const n = faceNormal(ring) ?? { x: 0, y: 0, z: 1 };
      if (p.areaSqft >= SKYLIGHT_MIN) {
        const h = span * 0.0028; // short curb
        const top = ring.map((pt) => ({ ...pt, x: pt.x + n.x * h, y: pt.y + n.y * h, z: pt.z + n.z * h }));
        // Curb walls (base → raised top).
        for (let i = 0; i < ring.length; i++) {
          const j = (i + 1) % ring.length;
          frameTris.push(ring[i], ring[j], top[j]);
          frameTris.push(ring[i], top[j], top[i]);
        }
        // Inset the glass so a dark frame BORDER shows on top from above too —
        // makes the skylight read from every angle, not only from the side.
        const cen = centroid(top);
        const inset = 0.8;
        const inner = top.map((pt) => ({
          ...pt,
          x: cen.x + (pt.x - cen.x) * inset,
          y: cen.y + (pt.y - cen.y) * inset,
          z: cen.z + (pt.z - cen.z) * inset,
        }));
        for (let i = 0; i < top.length; i++) {
          const j = (i + 1) % top.length;
          frameTris.push(top[i], top[j], inner[j]); // flat frame border on top
          frameTris.push(top[i], inner[j], inner[i]);
        }
        glassTris.push(...triangulateRing(inner));
      } else {
        // Small vents/pipes → collect the center; rendered as pipe stubs below.
        ventCenters.push(centroid(ring));
      }
    }
    const frame = meshFromTris(
      frameTris,
      // DoubleSide so the OUTER curb walls render (their winding faces inward).
      new THREE.MeshStandardMaterial({
        color: 0x0a0b0d,
        roughness: 0.42,
        metalness: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    if (frame) houseGroup.add(frame);
    const glass = meshFromTris(
      glassTris,
      new THREE.MeshPhysicalMaterial({
        color: 0xc2dbee,
        metalness: 0,
        roughness: 0.02, //          mirror-smooth → clearly reflective glass
        transmission: 0.3,
        thickness: span * 0.02,
        ior: 1.45,
        transparent: true,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        reflectivity: 0.7,
        envMapIntensity: 2.6, //      strong sky reflection so it reads as a skylight
        side: THREE.DoubleSide, //    so the glass top shows from above (winding-proof)
      }),
      false,
    );
    if (glass) houseGroup.add(glass);
    // Vents/pipes → short vertical pipe stubs with a cap, so the many small
    // penetrations clearly read as plumbing vents (not flat tiles). Pipes are
    // vertical (gravity-true), regardless of the roof slope they emerge from.
    if (ventCenters.length) {
      const pipeR = span * 0.0016;
      const pipeH = span * 0.011;
      const pipeGeos: THREE.BufferGeometry[] = [];
      const capGeos: THREE.BufferGeometry[] = [];
      for (const cw of ventCenters) {
        const ct = toThree(cw);
        const pg = new THREE.CylinderGeometry(pipeR, pipeR, pipeH, 12);
        pg.translate(ct.x, ct.y + pipeH * 0.4, ct.z); // base embedded a touch in the roof
        pipeGeos.push(pg);
        const cg = new THREE.CylinderGeometry(pipeR * 1.7, pipeR * 1.7, pipeH * 0.16, 12);
        cg.translate(ct.x, ct.y + pipeH * 0.82, ct.z); // cap near the top
        capGeos.push(cg);
      }
      const pipeGeo = mergeGeometries(pipeGeos);
      const capGeo = mergeGeometries(capGeos);
      pipeGeos.forEach((g) => g.dispose());
      capGeos.forEach((g) => g.dispose());
      if (pipeGeo && capGeo) {
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.55, metalness: 0.35 });
        const capMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.6, metalness: 0.3 });
        const pipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
        pipeMesh.castShadow = true;
        houseGroup.add(pipeMesh);
        track(pipeGeo, pipeMat);
        const capMesh = new THREE.Mesh(capGeo, capMat);
        capMesh.castShadow = true;
        houseGroup.add(capMesh);
        track(capGeo, capMat);
      }
    }

    // ── Labels (CSS2D), built once; visibility toggled per labelMode ──
    const labelGroup = new THREE.Group();
    scene.add(labelGroup);
    const pitchGroup = new THREE.Group();
    const areaGroup = new THREE.Group();
    const lengthGroup = new THREE.Group();
    labelGroup.add(pitchGroup, areaGroup, lengthGroup);
    const arrows: THREE.ArrowHelper[] = [];
    const addLabel = (group: THREE.Group, text: string, pos: THREE.Vector3) => {
      const el = document.createElement("div");
      el.textContent = text;
      el.style.cssText =
        "color:#14181f;font:600 11px Geist,system-ui,sans-serif;text-shadow:0 0 2px #fff,0 0 3px #fff;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none";
      const obj = new CSS2DObject(el);
      obj.position.copy(pos);
      group.add(obj);
    };
    for (const f of model.faces) {
      const ring = ringOf(f.lineIds, idx);
      if (!ring) continue;
      const cThree = v3(centroid(ring));
      addLabel(pitchGroup, pitchNumber(f.pitch), cThree);
      addLabel(areaGroup, areaNumber(f.areaSqft), cThree);
      const n = faceNormal(ring);
      if (n) {
        // Steepest descent on the facet plane (world z-up), mapped to three.
        const dot = -n.z;
        const d = { x: -dot * n.x, y: -dot * n.y, z: -1 - dot * n.z };
        const dl = Math.hypot(d.x, d.y, d.z);
        if (dl > 1e-3) {
          const dir = new THREE.Vector3(d.x / dl, d.z / dl, -(d.y / dl)).normalize();
          const arrow = new THREE.ArrowHelper(dir, cThree, span * 0.05, 0x4a5263, span * 0.018, span * 0.011);
          pitchGroup.add(arrow);
          arrows.push(arrow);
        }
      }
    }
    for (const l of model.lines) {
      if (!PRIMARY_LINE_TYPES.includes(l.type) || l.lengthFt < span * 0.08) continue;
      const a = idx.pointsById.get(l.aId);
      const bb = idx.pointsById.get(l.bId);
      if (!a || !bb) continue;
      addLabel(
        lengthGroup,
        feetWhole(l.lengthFt),
        v3({ x: (a.x + bb.x) / 2, y: (a.y + bb.y) / 2, z: (a.z + bb.z) / 2 }),
      );
    }

    applyLabelRef.current = (m: LabelMode) => {
      pitchGroup.visible = m === "pitch";
      areaGroup.visible = m === "area";
      lengthGroup.visible = m === "length";
      edgeMat.opacity = m === "shaded" ? 0.3 : 0.7;
    };
    applyHouseRef.current = (b: boolean) => {
      if (wallsMesh) wallsMesh.visible = b;
      ground.visible = b;
    };
    applyLabelRef.current(labelMode);
    applyHouseRef.current(showHouse);

    // ── Controls: orbit (default) ⇄ fly (pointer lock) ──
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.target.set(0, 0, 0);
    orbit.maxDistance = span * 10;
    orbit.update();

    const plc = new PointerLockControls(camera, renderer.domElement);
    plc.enabled = false;
    plc.minPolarAngle = Math.PI * 0.04;
    plc.maxPolarAngle = Math.PI * 0.96;
    plc.pointerSpeed = 0.9;
    const keys = new Set<string>();

    const onLock = () => {
      orbit.enabled = false;
      plc.enabled = true;
      modeRef.current = "fly";
      setMode("fly");
    };
    const onUnlock = () => {
      plc.enabled = false;
      orbit.enabled = true;
      keys.clear();
      modeRef.current = "orbit";
      setMode("orbit");
      const dir = new THREE.Vector3();
      plc.getDirection(dir);
      orbit.target.copy(camera.position).addScaledVector(dir, span * 0.3);
      orbit.update();
    };
    plc.addEventListener("lock", onLock);
    plc.addEventListener("unlock", onUnlock);

    const onClick = () => {
      if (modeRef.current === "orbit") {
        try {
          plc.lock();
        } catch {
          /* gesture/permission */
        }
      }
    };
    renderer.domElement.addEventListener("click", onClick);
    const onKeyDown = (e: KeyboardEvent) => {
      if (modeRef.current !== "fly") return;
      if (e.code === "Space") e.preventDefault();
      if (e.code === "Escape") {
        plc.unlock();
        return;
      }
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onBlur = () => keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    // ── Render loop ──
    let raf = 0;
    let prev = performance.now();
    const baseSpeed = span * 0.6;
    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      if (modeRef.current === "fly" && plc.isLocked) {
        const v = baseSpeed * dt;
        if (keys.has("KeyW")) plc.moveForward(v);
        if (keys.has("KeyS")) plc.moveForward(-v);
        if (keys.has("KeyD")) plc.moveRight(v);
        if (keys.has("KeyA")) plc.moveRight(-v);
        let dy = 0;
        if (keys.has("KeyE") || keys.has("Space")) dy += v;
        if (keys.has("KeyQ") || keys.has("ShiftLeft")) dy -= v;
        camera.position.y = Math.max(camera.position.y + dy, groundThreeY + span * 0.02);
      } else if (modeRef.current === "orbit") {
        orbit.update();
      }
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    animate(prev);

    const ro = new ResizeObserver(() => {
      const nw = mount.clientWidth || w;
      const nh = mount.clientHeight || h;
      renderer.setSize(nw, nh);
      labelRenderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      plc.removeEventListener("lock", onLock);
      plc.removeEventListener("unlock", onUnlock);
      renderer.domElement.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (document.pointerLockElement === renderer.domElement) plc.unlock();
      ro.disconnect();
      orbit.dispose();
      plc.dispose();
      for (const a of arrows) a.dispose();
      for (const d of disposables) d();
      scene.environment = null;
      envTex?.dispose();
      (sky.material as THREE.Material).dispose();
      sky.geometry.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      labelRenderer.domElement.remove();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [model, supported]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supported) {
    return (
      <div className={`grid place-items-center text-[12px] text-[color:var(--ink-faint)] ${className ?? ""}`}>
        3D view unavailable (WebGL not supported)
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={mountRef} className="absolute inset-0" />
      {mode === "orbit" ? (
        <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
          <span className="rounded-full bg-white/85 backdrop-blur hairline px-3 py-1 text-[11px] text-[color:var(--ink-muted)]">
            Click to fly through · WASD move · Q/E up·down · Esc exit · drag to orbit
          </span>
        </div>
      ) : (
        <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none">
          <span className="rounded-full bg-[color:var(--accent)] text-white px-3 py-1 text-[11px] shadow-[var(--shadow-sm)]">
            Flying · move mouse to look · WASD · Esc to exit
          </span>
        </div>
      )}
    </div>
  );
}
