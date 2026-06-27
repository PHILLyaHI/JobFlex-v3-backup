"use client";
// Hero 3D viewport for the fence studio. Vanilla Three.js (mirrors RoofModel3D):
// build renderer/scene/lights ONCE in an effect keyed on [supported]; a second
// effect pushes spec changes through `applyRef` so the imperative scene mutates
// without tearing down the renderer.
//
// Posts / pickets / rails are each a single InstancedMesh authored at unit height
// and aligned by yaw (rotation.y = atan2(dy,dx) maps a member's local +X onto the
// run in three-space). Height changes only re-write matrices; material changes
// only swap the shared material; only a change in instance COUNT rebuilds.
// Gates, chain-link infill, and the selected-run highlight are small groups
// rebuilt on demand (few objects). `capture()` returns a PNG data URL.
import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { cn } from "@/lib/cn";
import { computeFenceLayout, type FenceLayout, type GateUnit } from "./fenceGeometry";
import { makeFenceTextures, makeChainLinkAlpha, type FenceMaterialTextures } from "./fenceTexture";
import type { PathPoint, FenceMaterial, GateSpec } from "./fenceTypes";

// Member authoring dimensions (feet). Horizontal axis is local +X so a single
// rotation.y = yaw aligns every member with its run.
const POST_SIZE = 0.34;
const POST_CAP = 0.25; // posts stand this much proud of the pickets
const PICKET_WIDTH = 0.46;
const PICKET_DEPTH = 0.09;
const RAIL_H = 0.12;
const RAIL_D = 0.3;
const RAIL_TOP_DROP = 0.55; // top rail sits this far below the fence top
const RAIL_BOTTOM = 0.5; // bottom rail centre height
const GATE_POST_SIZE = 0.42;
const BAR_T = 0.12; // gate frame bar thickness
const BAR_D = 0.13;
const DIAMOND_FT = 0.4; // chain-link diamond size for alpha tiling

const ACCENT = 0x1f7a52; // Pressed Sage (locked accent)

export interface FenceModel3DHandle {
  capture: () => string | null;
}

interface ViewSpec {
  points: PathPoint[];
  height: number;
  material: FenceMaterial;
  gates: GateSpec[];
  selectedSegment: number | null;
}

function webglSupported(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export const FenceModel3D = React.forwardRef<
  FenceModel3DHandle,
  {
    points: PathPoint[];
    height: number;
    material: FenceMaterial;
    gates: GateSpec[];
    selectedSegment: number | null;
    className?: string;
  }
>(function FenceModel3D({ points, height, material, gates, selectedSegment, className }, ref) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const [supported] = React.useState(webglSupported);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);

  React.useImperativeHandle(ref, () => ({
    capture: () => {
      const r = rendererRef.current;
      if (!r) return null;
      try {
        return r.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    },
  }));

  const applyRef = React.useRef<(s: ViewSpec) => void>(() => {});
  React.useEffect(() => {
    applyRef.current({ points, height, material, gates, selectedSegment });
  }, [points, height, material, gates, selectedSegment]);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !supported) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      return;
    }
    rendererRef.current = renderer;
    const w = mount.clientWidth || 800;
    const h0 = mount.clientHeight || 480;
    renderer.setSize(w, h0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const init = computeFenceLayout(points, gates);
    const span = Math.max(init.bounds.maxX - init.bounds.minX, init.bounds.maxY - init.bounds.minY, 12);

    const camera = new THREE.PerspectiveCamera(50, w / h0, 0.1, span * 40);
    camera.position.set(span * 0.95, span * 0.8, span * 0.95);

    // ── Sky + lighting (warm sun, soft shadows, ACES) ──
    const sky = new Sky();
    sky.scale.setScalar(span * 20);
    scene.add(sky);
    const sun = new THREE.Vector3().setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(58),
      THREE.MathUtils.degToRad(135),
    );
    const skyMat = sky.material as THREE.ShaderMaterial;
    skyMat.uniforms.sunPosition.value.copy(sun);
    skyMat.uniforms.turbidity.value = 6;
    skyMat.uniforms.rayleigh.value = 1.5;
    skyMat.uniforms.mieCoefficient.value = 0.005;
    skyMat.uniforms.mieDirectionalG.value = 0.8;

    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x8a8468, 0.65));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
    key.position.set(span * 1.0, span * 1.7, span * 0.7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -span * 1.3;
    sc.right = span * 1.3;
    sc.top = span * 1.3;
    sc.bottom = -span * 1.3;
    sc.near = 0.1;
    sc.far = span * 8;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = span * 0.0015;
    scene.add(key);
    scene.add(key.target);

    let envTex: THREE.Texture | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const skyScene = new THREE.Scene();
      const skyEnv = new Sky();
      skyEnv.scale.setScalar(span * 20);
      const sem = skyEnv.material as THREE.ShaderMaterial;
      sem.uniforms.sunPosition.value.copy(sun);
      sem.uniforms.turbidity.value = 6;
      sem.uniforms.rayleigh.value = 1.5;
      sem.uniforms.mieCoefficient.value = 0.005;
      sem.uniforms.mieDirectionalG.value = 0.8;
      skyScene.add(skyEnv);
      envTex = pmrem.fromScene(skyScene).texture;
      scene.environment = envTex;
      skyEnv.geometry.dispose();
      sem.dispose();
      pmrem.dispose();
    } catch {
      /* environment is optional */
    }

    const groundGeo = new THREE.PlaneGeometry(span * 8, span * 8);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x9fa886, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Fence assets ──
    const postGeo = new THREE.BoxGeometry(POST_SIZE, 1, POST_SIZE);
    const picketGeo = new THREE.BoxGeometry(PICKET_WIDTH, 1, PICKET_DEPTH);
    const railGeo = new THREE.BoxGeometry(1, RAIL_H, RAIL_D);

    const matCache = new Map<FenceMaterial, { mat: THREE.MeshStandardMaterial; tex: FenceMaterialTextures }>();
    const getMaterial = (m: FenceMaterial): THREE.MeshStandardMaterial => {
      let entry = matCache.get(m);
      if (!entry) {
        const tex = makeFenceTextures(m);
        const mat = new THREE.MeshStandardMaterial({
          map: tex.map ?? undefined,
          bumpMap: tex.bump ?? undefined,
          bumpScale: 0.4,
          color: tex.color,
          roughness: tex.roughness,
          metalness: tex.metalness,
          envMapIntensity: 0.55,
        });
        entry = { mat, tex };
        matCache.set(m, entry);
      }
      return entry.mat;
    };
    const gatePostMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.4 });
    const chainAlphaBase = makeChainLinkAlpha();

    const fenceGroup = new THREE.Group();
    scene.add(fenceGroup);
    const chainGroup = new THREE.Group();
    const gateGroup = new THREE.Group();
    fenceGroup.add(chainGroup, gateGroup);
    const dummy = new THREE.Object3D();

    const highlightGeo = new THREE.BoxGeometry(1, 0.14, 0.14);
    const highlightMat = new THREE.MeshBasicMaterial({ color: ACCENT });
    const highlight = new THREE.Mesh(highlightGeo, highlightMat);
    highlight.visible = false;
    scene.add(highlight);

    let postMesh: THREE.InstancedMesh | null = null;
    let picketMesh: THREE.InstancedMesh | null = null;
    let railMesh: THREE.InstancedMesh | null = null;
    let built: FenceLayout | null = null;
    let curMaterial: FenceMaterial | null = null;
    let framed = false;
    // Last geometry-affecting inputs (by reference). selectedSegment is NOT here:
    // a selection change only moves the highlight, never rebuilds geometry.
    let prevPts: PathPoint[] | null = null;
    let prevGates: GateSpec[] | null = null;
    let prevH = -1;
    let prevMat: FenceMaterial | null = null;

    const center = (l: FenceLayout) => ({
      cx: (l.bounds.minX + l.bounds.maxX) / 2,
      cy: (l.bounds.minY + l.bounds.maxY) / 2,
    });

    const disposeInstances = () => {
      for (const m of [postMesh, picketMesh, railMesh]) {
        if (m) {
          fenceGroup.remove(m);
          m.dispose();
        }
      }
      postMesh = picketMesh = railMesh = null;
    };

    const buildInstances = (l: FenceLayout, m: FenceMaterial) => {
      const mat = getMaterial(m);
      postMesh = new THREE.InstancedMesh(postGeo, mat, Math.max(1, l.postCount));
      picketMesh = new THREE.InstancedMesh(picketGeo, mat, Math.max(1, l.picketCount));
      railMesh = new THREE.InstancedMesh(railGeo, mat, Math.max(1, l.railCount));
      for (const mm of [postMesh, picketMesh, railMesh]) {
        mm.castShadow = true;
        mm.receiveShadow = true;
        fenceGroup.add(mm);
      }
      curMaterial = m;
    };

    const writeMatrices = (l: FenceLayout, fenceH: number, cx: number, cy: number) => {
      if (!postMesh || !picketMesh || !railMesh) return;
      const tx = (x: number) => x - cx;
      const tz = (y: number) => -(y - cy);

      const postH = fenceH + POST_CAP;
      postMesh.count = l.postCount;
      for (let i = 0; i < l.postCount; i++) {
        dummy.position.set(tx(l.posts[i * 3]), postH / 2, tz(l.posts[i * 3 + 1]));
        dummy.rotation.set(0, l.posts[i * 3 + 2], 0);
        dummy.scale.set(1, postH, 1);
        dummy.updateMatrix();
        postMesh.setMatrixAt(i, dummy.matrix);
      }
      postMesh.instanceMatrix.needsUpdate = true;
      postMesh.computeBoundingSphere();

      picketMesh.count = l.picketCount;
      for (let i = 0; i < l.picketCount; i++) {
        dummy.position.set(tx(l.pickets[i * 3]), fenceH / 2, tz(l.pickets[i * 3 + 1]));
        dummy.rotation.set(0, l.pickets[i * 3 + 2], 0);
        dummy.scale.set(1, fenceH, 1);
        dummy.updateMatrix();
        picketMesh.setMatrixAt(i, dummy.matrix);
      }
      picketMesh.instanceMatrix.needsUpdate = true;
      picketMesh.computeBoundingSphere();

      railMesh.count = l.railCount;
      for (let i = 0; i < l.railCount; i++) {
        const len = l.rails[i * 5 + 3];
        const top = l.rails[i * 5 + 4] > 0.5;
        const railY = top ? Math.max(RAIL_BOTTOM + 0.4, fenceH - RAIL_TOP_DROP) : RAIL_BOTTOM;
        dummy.position.set(tx(l.rails[i * 5]), railY, tz(l.rails[i * 5 + 1]));
        dummy.rotation.set(0, l.rails[i * 5 + 2], 0);
        dummy.scale.set(len, 1, 1);
        dummy.updateMatrix();
        railMesh.setMatrixAt(i, dummy.matrix);
      }
      railMesh.instanceMatrix.needsUpdate = true;
      railMesh.computeBoundingSphere();
    };

    // Recursively dispose every Mesh geometry (+ optional UNIQUE material/alphaMap)
    // under a group, then empty it. Shared/cached materials must NOT be disposed.
    const clearGroup = (g: THREE.Group, disposeMaterials: boolean) => {
      g.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (disposeMaterials) {
            const m = obj.material as THREE.MeshStandardMaterial;
            m?.alphaMap?.dispose();
            m?.dispose();
          }
        }
      });
      while (g.children.length) g.remove(g.children[0]);
    };

    const addBox = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      px: number,
      py: number,
      pz: number,
    ) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const rebuildGates = (l: FenceLayout, fenceH: number, m: FenceMaterial, cx: number, cy: number) => {
      // Geometries are unique per build (dispose them); materials are shared/cached.
      clearGroup(gateGroup, false);
      const leafMat = getMaterial(m);
      const postH = fenceH + POST_CAP;
      for (const gu of l.gateUnits) {
        buildGate(gu, fenceH, postH, leafMat, cx, cy);
      }
    };

    const buildGate = (
      gu: GateUnit,
      fenceH: number,
      postH: number,
      leafMat: THREE.Material,
      cx: number,
      cy: number,
    ) => {
      const cos = Math.cos(gu.yaw);
      const sin = Math.sin(gu.yaw);
      const half = gu.widthFt / 2;
      const tx = (x: number) => x - cx;
      const tz = (y: number) => -(y - cy);

      // Two heavier gate posts at the opening edges (own geometry per build).
      for (const s of [-half, half]) {
        const px = gu.x + cos * s;
        const py = gu.y + sin * s;
        const geo = new THREE.BoxGeometry(GATE_POST_SIZE, postH, GATE_POST_SIZE);
        const mesh = addBox(gateGroup, geo, gatePostMat, tx(px), postH / 2, tz(py));
        mesh.rotation.y = gu.yaw;
      }

      // Braced gate leaf: a framed rectangle that clearly reads as a gate.
      const leaf = new THREE.Group();
      leaf.position.set(tx(gu.x), fenceH / 2, tz(gu.y));
      leaf.rotation.y = gu.yaw;
      const W = gu.widthFt * 0.86;
      const H = fenceH * 0.84;
      // frame: top, bottom, two stiles (local x = along run, y = up, z = depth)
      addBox(leaf, new THREE.BoxGeometry(W, BAR_T, BAR_D), leafMat, 0, H / 2 - BAR_T / 2, 0);
      addBox(leaf, new THREE.BoxGeometry(W, BAR_T, BAR_D), leafMat, 0, -H / 2 + BAR_T / 2, 0);
      addBox(leaf, new THREE.BoxGeometry(BAR_T, H, BAR_D), leafMat, -W / 2 + BAR_T / 2, 0, 0);
      addBox(leaf, new THREE.BoxGeometry(BAR_T, H, BAR_D), leafMat, W / 2 - BAR_T / 2, 0, 0);
      // diagonal brace
      const diagLen = Math.hypot(W, H) * 0.96;
      const brace = addBox(leaf, new THREE.BoxGeometry(diagLen, BAR_T, BAR_D * 0.8), leafMat, 0, 0, 0);
      brace.rotation.z = Math.atan2(H, W);
      gateGroup.add(leaf);
    };

    const rebuildChain = (l: FenceLayout, fenceH: number, m: FenceMaterial, cx: number, cy: number) => {
      clearGroup(chainGroup, true);
      if (m !== "chain-link") return;
      const tx = (x: number) => x - cx;
      const tz = (y: number) => -(y - cy);
      for (let i = 0; i < l.segCount; i++) {
        const mx = l.segments[i * 4];
        const my = l.segments[i * 4 + 1];
        const yaw = l.segments[i * 4 + 2];
        const len = l.segments[i * 4 + 3];
        const alpha = chainAlphaBase.clone();
        alpha.needsUpdate = true;
        alpha.wrapS = THREE.RepeatWrapping;
        alpha.wrapT = THREE.RepeatWrapping;
        alpha.repeat.set(Math.max(1, len / DIAMOND_FT), Math.max(1, fenceH / DIAMOND_FT));
        const mat = new THREE.MeshStandardMaterial({
          color: 0xb8bcc0,
          metalness: 0.55,
          roughness: 0.5,
          alphaMap: alpha,
          transparent: true,
          alphaTest: 0.5,
          side: THREE.DoubleSide,
          envMapIntensity: 0.6,
        });
        const geo = new THREE.PlaneGeometry(len, fenceH);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(tx(mx), fenceH / 2, tz(my));
        mesh.rotation.y = yaw;
        chainGroup.add(mesh);
      }
    };

    const applyVisibility = (m: FenceMaterial) => {
      const isChain = m === "chain-link";
      if (picketMesh) picketMesh.visible = !isChain;
      chainGroup.visible = isChain;
    };

    const updateHighlight = (pts: PathPoint[], sel: number | null, fenceH: number, cx: number, cy: number) => {
      if (sel == null || sel < 0 || sel >= pts.length - 1) {
        highlight.visible = false;
        return;
      }
      const a = pts[sel];
      const b = pts[sel + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) {
        highlight.visible = false;
        return;
      }
      highlight.visible = true;
      highlight.position.set((a.x + dx / 2) - cx, fenceH + POST_CAP + 0.2, -((a.y + dy / 2) - cy));
      highlight.rotation.set(0, Math.atan2(dy, dx), 0);
      highlight.scale.set(len, 1, 1);
    };

    const frameCamera = (l: FenceLayout) => {
      const sp = Math.max(l.bounds.maxX - l.bounds.minX, l.bounds.maxY - l.bounds.minY, 10);
      camera.position.set(sp * 0.95, sp * 0.8, sp * 0.95);
      camera.updateProjectionMatrix();
      orbit.target.set(0, 2, 0);
      orbit.update();
    };

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.minDistance = span * 0.25;
    orbit.maxDistance = span * 12;
    orbit.maxPolarAngle = Math.PI * 0.495;
    orbit.target.set(0, 2, 0);
    orbit.update();

    const applySpec = (next: ViewSpec) => {
      const geoChanged =
        next.points !== prevPts ||
        next.gates !== prevGates ||
        next.height !== prevH ||
        next.material !== prevMat;

      if (geoChanged) {
        const l = computeFenceLayout(next.points, next.gates);
        const { cx, cy } = center(l);
        const countsChanged =
          !built ||
          !postMesh ||
          built.postCount !== l.postCount ||
          built.picketCount !== l.picketCount ||
          built.railCount !== l.railCount;
        if (countsChanged) {
          disposeInstances();
          buildInstances(l, next.material);
        } else if (next.material !== curMaterial) {
          const mat = getMaterial(next.material);
          if (postMesh) postMesh.material = mat;
          if (picketMesh) picketMesh.material = mat;
          if (railMesh) railMesh.material = mat;
          curMaterial = next.material;
        }
        writeMatrices(l, next.height, cx, cy);
        applyVisibility(next.material);
        rebuildGates(l, next.height, next.material, cx, cy);
        rebuildChain(l, next.height, next.material, cx, cy);
        built = l;
        prevPts = next.points;
        prevGates = next.gates;
        prevH = next.height;
        prevMat = next.material;
        if (!framed) {
          frameCamera(l);
          framed = true;
        }
      }

      // Highlight is cheap and depends on selection — always refresh it.
      if (built) {
        const { cx, cy } = center(built);
        updateHighlight(next.points, next.selectedSegment, next.height, cx, cy);
      }
    };

    applySpec({ points, height, material, gates, selectedSegment });
    applyRef.current = applySpec;

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const nw = mount.clientWidth || w;
      const nh = mount.clientHeight || h0;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      orbit.dispose();
      disposeInstances();
      clearGroup(gateGroup, false);
      clearGroup(chainGroup, true);
      postGeo.dispose();
      picketGeo.dispose();
      railGeo.dispose();
      highlightGeo.dispose();
      highlightMat.dispose();
      gatePostMat.dispose();
      chainAlphaBase.dispose();
      for (const { mat, tex } of matCache.values()) {
        mat.dispose();
        tex.dispose();
      }
      matCache.clear();
      groundGeo.dispose();
      groundMat.dispose();
      scene.environment = null;
      envTex?.dispose();
      (sky.material as THREE.Material).dispose();
      sky.geometry.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      rendererRef.current = null;
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [supported]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supported) {
    return (
      <div
        className={cn(
          "grid place-items-center text-[12px] text-[color:var(--ink-faint)] bg-[color:var(--paper)]",
          className,
        )}
      >
        3D view unavailable (WebGL not supported)
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute left-3 top-3 pointer-events-none">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 backdrop-blur hairline px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] font-medium text-[color:var(--ink-soft)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
          Live · 3D
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
        <span className="rounded-full bg-white/85 backdrop-blur hairline px-3 py-1 text-[11px] text-[color:var(--ink-muted)]">
          Drag to orbit · scroll to zoom
        </span>
      </div>
    </div>
  );
});
