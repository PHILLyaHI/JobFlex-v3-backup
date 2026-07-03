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
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { cn } from "@/lib/cn";
import { computeFenceLayout, type FenceLayout, type GateUnit } from "./fenceGeometry";
import { makeFenceTextures, makeChainLinkAlpha, type FenceMaterialTextures } from "./fenceTexture";
import { isBuiltinMaterial, type PathPoint, type GateSpec } from "./fenceTypes";

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
  material: string; // MaterialId — built-in key or custom id
  materialColor: string; // resolved swatch/colour (used for custom materials)
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
    material: string;
    materialColor: string;
    gates: GateSpec[];
    selectedSegment: number | null;
    active?: boolean;
    className?: string;
  }
>(function FenceModel3D(
  { points, height, material, materialColor, gates, selectedSegment, active = true, className },
  ref,
) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const [supported] = React.useState(webglSupported);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const [mode, setMode] = React.useState<"orbit" | "fly">("orbit");
  const modeRef = React.useRef<"orbit" | "fly">("orbit");
  React.useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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
    applyRef.current({ points, height, material, materialColor, gates, selectedSegment });
  }, [points, height, material, materialColor, gates, selectedSegment]);

  // When the studio hides this panel (Draw view), release pointer-lock/keys so a
  // fly session can't keep driving an invisible scene; on re-show, re-frame if the
  // fence changed size while hidden.
  const activateRef = React.useRef<() => void>(() => {});
  const suspendRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    if (active) activateRef.current();
    else suspendRef.current();
  }, [active]);

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

    // Cache keyed by material id. Built-in materials get authored textures; custom
    // materials render as a solid MeshStandardMaterial tinted to their swatch colour.
    const matCache = new Map<string, { mat: THREE.MeshStandardMaterial; tex: FenceMaterialTextures | null }>();
    const getMaterial = (id: string, color: string): THREE.MeshStandardMaterial => {
      let entry = matCache.get(id);
      if (!entry) {
        if (isBuiltinMaterial(id)) {
          const tex = makeFenceTextures(id);
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
        } else {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color || "#8a8f97"),
            roughness: 0.82,
            metalness: 0.05,
            envMapIntensity: 0.5,
          });
          entry = { mat, tex: null };
        }
        matCache.set(id, entry);
      }
      return entry.mat;
    };
    const gatePostMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.4 });
    // Gates and doors read in their OWN colours so they stand apart from the fence
    // and from each other: gates a warm bronze, doors a cool slate blue.
    const gateLeafMat = new THREE.MeshStandardMaterial({ color: 0x9a5a2b, roughness: 0.55, metalness: 0.25 });
    const doorLeafMat = new THREE.MeshStandardMaterial({ color: 0x42607f, roughness: 0.5, metalness: 0.2 });
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
    let curMaterial: string | null = null;
    let framed = false;
    // Last geometry-affecting inputs (by reference). selectedSegment is NOT here:
    // a selection change only moves the highlight, never rebuilds geometry.
    let prevPts: PathPoint[] | null = null;
    let prevGates: GateSpec[] | null = null;
    let prevH = -1;
    let prevMat: string | null = null;

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

    const buildInstances = (l: FenceLayout, m: string, color: string) => {
      const mat = getMaterial(m, color);
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

    // ── Contextual scenery: an approximate home in the parcel + trees + neighbours.
    // Deliberately rough (the user asked for "something to show", not accuracy) and
    // cheap: a handful of meshes with shared materials, rebuilt only on big size
    // changes and placed deterministically so it never jitters.
    const sceneryGroup = new THREE.Group();
    scene.add(sceneryGroup);
    const houseWallMat = new THREE.MeshStandardMaterial({ color: 0xd8cdba, roughness: 0.85 });
    const houseRoofMat = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.8 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x4d7a46, roughness: 1, flatShading: true });
    const neighborWallMat = new THREE.MeshStandardMaterial({ color: 0xc7c0b4, roughness: 0.9 });
    const sceneryMats = [houseWallMat, houseRoofMat, trunkMat, foliageMat, neighborWallMat];

    const mulberry32 = (seed: number) => () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    const addRoofedBox = (
      w: number,
      d: number,
      wallH: number,
      roofH: number,
      wallMat: THREE.Material,
      roofMat: THREE.Material,
      x: number,
      z: number,
      rotY: number,
    ) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
      body.position.set(x, wallH / 2, z);
      body.rotation.y = rotY;
      body.castShadow = true;
      body.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2, roofH, 4), roofMat);
      roof.position.set(x, wallH + roofH / 2, z);
      roof.rotation.y = Math.PI / 4 + rotY;
      roof.castShadow = true;
      sceneryGroup.add(body, roof);
    };
    const addTree = (x: number, z: number, s: number) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.4 * s, 3.2 * s, 6), trunkMat);
      trunk.position.set(x, 1.6 * s, z);
      trunk.castShadow = true;
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 * s, 0), foliageMat);
      canopy.position.set(x, 4.0 * s, z);
      canopy.castShadow = true;
      sceneryGroup.add(trunk, canopy);
    };

    let scenerySpan = -1;
    const buildScenery = (l: FenceLayout) => {
      clearGroup(sceneryGroup, false); // dispose geometries, keep shared materials
      const w = Math.max(6, l.bounds.maxX - l.bounds.minX);
      const d = Math.max(6, l.bounds.maxY - l.bounds.minY);
      const span = Math.max(w, d);
      const minDim = Math.min(w, d);
      const rnd = mulberry32(1337);
      // Main house, centred in the parcel (the fence is centred at scene origin).
      addRoofedBox(
        clampN(minDim * 0.5, 8, 60),
        clampN(minDim * 0.42, 8, 50),
        clampN(minDim * 0.35, 9, 16),
        clampN(minDim * 0.2, 5, 10),
        houseWallMat,
        houseRoofMat,
        0,
        0,
        0,
      );
      const trees = 6;
      for (let i = 0; i < trees; i++) {
        const ang = (i / trees) * Math.PI * 2 + rnd() * 0.7;
        const r = span * (0.62 + rnd() * 0.2);
        addTree(Math.cos(ang) * r, Math.sin(ang) * r, 0.8 + rnd() * 0.7);
      }
      const neighbors = 3;
      for (let i = 0; i < neighbors; i++) {
        const ang = (i / neighbors) * Math.PI * 2 + 0.8 + rnd() * 0.5;
        const r = span * (1.25 + rnd() * 0.5);
        const nw = clampN(minDim * (0.4 + rnd() * 0.3), 8, 40);
        addRoofedBox(
          nw,
          nw * 0.8,
          clampN(minDim * 0.3, 8, 14),
          6,
          neighborWallMat,
          houseRoofMat,
          Math.cos(ang) * r,
          Math.sin(ang) * r,
          rnd() * Math.PI,
        );
      }
      scenerySpan = span;
    };
    const buildSceneryIfNeeded = (l: FenceLayout) => {
      const span = Math.max(6, l.bounds.maxX - l.bounds.minX, l.bounds.maxY - l.bounds.minY);
      if (scenerySpan < 0 || Math.abs(span - scenerySpan) > scenerySpan * 0.15) buildScenery(l);
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

    const rebuildGates = (l: FenceLayout, fenceH: number, cx: number, cy: number) => {
      // Geometries are unique per build (dispose them); materials are shared.
      clearGroup(gateGroup, false);
      const postH = fenceH + POST_CAP;
      for (const gu of l.gateUnits) {
        buildOpening(gu, fenceH, postH, cx, cy);
      }
    };

    // A framed rectangular leaf (top/bottom rails, two stiles, diagonal brace),
    // centred at the leaf-group origin. Local x = along run, y = up, z = depth.
    const framedLeaf = (W: number, H: number, leafMat: THREE.Material) => {
      const g = new THREE.Group();
      addBox(g, new THREE.BoxGeometry(W, BAR_T, BAR_D), leafMat, 0, H / 2 - BAR_T / 2, 0);
      addBox(g, new THREE.BoxGeometry(W, BAR_T, BAR_D), leafMat, 0, -H / 2 + BAR_T / 2, 0);
      addBox(g, new THREE.BoxGeometry(BAR_T, H, BAR_D), leafMat, -W / 2 + BAR_T / 2, 0, 0);
      addBox(g, new THREE.BoxGeometry(BAR_T, H, BAR_D), leafMat, W / 2 - BAR_T / 2, 0, 0);
      const diagLen = Math.hypot(W, H) * 0.96;
      const brace = addBox(g, new THREE.BoxGeometry(diagLen, BAR_T, BAR_D * 0.8), leafMat, 0, 0, 0);
      brace.rotation.z = Math.atan2(H, W);
      return g;
    };

    const buildGateLeaf = (W: number, H: number, variant: GateUnit["variant"], leafMat: THREE.Material) => {
      if (variant === "double") {
        const g = new THREE.Group();
        const lw = W * 0.43;
        const lh = H * 0.84;
        const a = framedLeaf(lw, lh, leafMat);
        a.position.x = -W * 0.22;
        const b = framedLeaf(lw, lh, leafMat);
        b.position.x = W * 0.22;
        g.add(a, b);
        return g;
      }
      if (variant === "arched") {
        const g = new THREE.Group();
        const lw = W * 0.86;
        const lh = H * 0.78;
        g.add(framedLeaf(lw, lh, leafMat));
        const peakY = lh / 2 - BAR_T / 2;
        const rise = H * 0.16;
        const span = lw / 2;
        const barLen = Math.hypot(span, rise) * 1.04;
        const left = addBox(g, new THREE.BoxGeometry(barLen, BAR_T, BAR_D), leafMat, -span / 2, peakY + rise / 2, 0);
        left.rotation.z = Math.atan2(rise, span);
        const right = addBox(g, new THREE.BoxGeometry(barLen, BAR_T, BAR_D), leafMat, span / 2, peakY + rise / 2, 0);
        right.rotation.z = -Math.atan2(rise, span);
        return g;
      }
      return framedLeaf(W * 0.86, H * 0.84, leafMat); // single
    };

    const buildDoorLeaf = (W: number, H: number, variant: GateUnit["variant"], leafMat: THREE.Material) => {
      if (variant === "slatted") {
        const g = new THREE.Group();
        const lw = W * 0.9;
        const lh = H * 0.9;
        g.add(framedLeaf(lw, lh, leafMat));
        const slats = 6;
        for (let k = 1; k < slats; k++) {
          const y = -lh / 2 + (lh * k) / slats;
          addBox(g, new THREE.BoxGeometry(lw - BAR_T * 2, BAR_T * 0.7, BAR_D * 0.7), leafMat, 0, y, 0);
        }
        return g;
      }
      const g = new THREE.Group(); // solid slab
      addBox(g, new THREE.BoxGeometry(W * 0.9, H * 0.9, BAR_D * 1.6), leafMat, 0, 0, 0);
      return g;
    };

    const buildOpening = (gu: GateUnit, fenceH: number, postH: number, cx: number, cy: number) => {
      const leafMat = gu.kind === "door" ? doorLeafMat : gateLeafMat;
      const cos = Math.cos(gu.yaw);
      const sin = Math.sin(gu.yaw);
      const half = gu.widthFt / 2;
      const tx = (x: number) => x - cx;
      const tz = (y: number) => -(y - cy);

      // Two heavier posts at the opening edges (own geometry per build).
      for (const sEdge of [-half, half]) {
        const px = gu.x + cos * sEdge;
        const py = gu.y + sin * sEdge;
        const geo = new THREE.BoxGeometry(GATE_POST_SIZE, postH, GATE_POST_SIZE);
        const mesh = addBox(gateGroup, geo, gatePostMat, tx(px), postH / 2, tz(py));
        mesh.rotation.y = gu.yaw;
      }

      const leaf =
        gu.kind === "door"
          ? buildDoorLeaf(gu.widthFt, fenceH, gu.variant, leafMat)
          : buildGateLeaf(gu.widthFt, fenceH, gu.variant, leafMat);
      leaf.position.set(tx(gu.x), fenceH / 2, tz(gu.y));
      leaf.rotation.y = gu.yaw;
      gateGroup.add(leaf);
    };

    const rebuildChain = (l: FenceLayout, fenceH: number, m: string, cx: number, cy: number) => {
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

    const applyVisibility = (m: string) => {
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

    // Resize the whole view envelope to a span so a fence larger than the seed
    // path isn't clipped (shadow frustum, sky, ground, far plane, zoom limits).
    let worldSpan = span;
    let lastFramedSpan = span;
    const layoutSpan = (l: FenceLayout) =>
      Math.max(l.bounds.maxX - l.bounds.minX, l.bounds.maxY - l.bounds.minY, 10);
    const applyWorldScale = (sp: number) => {
      camera.far = sp * 40;
      camera.updateProjectionMatrix();
      sky.scale.setScalar(sp * 20);
      key.position.set(sp * 1.0, sp * 1.7, sp * 0.7);
      const shadowCam = key.shadow.camera as THREE.OrthographicCamera;
      shadowCam.left = -sp * 1.3;
      shadowCam.right = sp * 1.3;
      shadowCam.top = sp * 1.3;
      shadowCam.bottom = -sp * 1.3;
      shadowCam.far = sp * 8;
      shadowCam.updateProjectionMatrix();
      key.shadow.normalBias = sp * 0.0015;
      ground.scale.setScalar(sp / span);
      orbit.minDistance = sp * 0.25;
      orbit.maxDistance = sp * 12;
      worldSpan = sp;
    };

    const frameCamera = (l: FenceLayout) => {
      const sp = layoutSpan(l);
      applyWorldScale(sp);
      lastFramedSpan = sp;
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

    // First-person fly-through: click the canvas to enter pointer lock, WASD to
    // move, Q/E (or Space/Shift) up·down, mouse to look, Esc to exit to orbit.
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
      dir.y = 0; // flatten so the orbit handoff respects the horizon clamp (no snap)
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
      dir.normalize();
      orbit.target.copy(camera.position).addScaledVector(dir, worldSpan * 0.3);
      orbit.update();
    };
    plc.addEventListener("lock", onLock);
    plc.addEventListener("unlock", onUnlock);
    // Track pointer travel so a drag-to-orbit that ends as a click doesn't drop
    // the user into fly mode — only a near-stationary click enters pointer lock.
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onCanvasClick = (e: MouseEvent) => {
      if (modeRef.current !== "orbit") return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      try {
        plc.lock();
      } catch {
        /* needs a user gesture / pointer-lock permission */
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("click", onCanvasClick);
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
          buildInstances(l, next.material, next.materialColor);
        } else if (next.material !== curMaterial) {
          const mat = getMaterial(next.material, next.materialColor);
          if (postMesh) postMesh.material = mat;
          if (picketMesh) picketMesh.material = mat;
          if (railMesh) railMesh.material = mat;
          curMaterial = next.material;
        }
        writeMatrices(l, next.height, cx, cy);
        applyVisibility(next.material);
        rebuildGates(l, next.height, cx, cy);
        rebuildChain(l, next.height, next.material, cx, cy);
        buildSceneryIfNeeded(l);
        built = l;
        prevPts = next.points;
        prevGates = next.gates;
        prevH = next.height;
        prevMat = next.material;
        if (!framed) {
          frameCamera(l);
          framed = true;
        } else {
          // Keep the view envelope (shadows/ground/zoom) in step as the fence grows.
          const sp = layoutSpan(l);
          if (sp > worldSpan * 1.05 || sp < worldSpan * 0.6) applyWorldScale(sp);
        }
      }

      // Highlight is cheap and depends on selection — always refresh it.
      if (built) {
        const { cx, cy } = center(built);
        updateHighlight(next.points, next.selectedSegment, next.height, cx, cy);
      }
    };

    applySpec({ points, height, material, materialColor, gates, selectedSegment });
    applyRef.current = applySpec;

    activateRef.current = () => {
      if (!built) return;
      const sp = layoutSpan(built);
      // Re-frame only when the fence size changed meaningfully since last framing,
      // so toggling back to 3D without edits keeps the user's camera.
      if (Math.abs(sp - lastFramedSpan) > lastFramedSpan * 0.12) frameCamera(built);
    };
    suspendRef.current = () => {
      keys.clear();
      if (document.pointerLockElement === renderer.domElement) plc.unlock();
    };

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
        camera.position.y = Math.max(camera.position.y + dy, span * 0.02);
      } else if (modeRef.current === "orbit") {
        orbit.update();
      }
      renderer.render(scene, camera);
    };
    animate(prev);

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
      plc.removeEventListener("lock", onLock);
      plc.removeEventListener("unlock", onUnlock);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (document.pointerLockElement === renderer.domElement) plc.unlock();
      plc.dispose();
      disposeInstances();
      clearGroup(gateGroup, false);
      clearGroup(chainGroup, true);
      clearGroup(sceneryGroup, false);
      for (const m of sceneryMats) m.dispose();
      postGeo.dispose();
      picketGeo.dispose();
      railGeo.dispose();
      highlightGeo.dispose();
      highlightMat.dispose();
      gatePostMat.dispose();
      gateLeafMat.dispose();
      doorLeafMat.dispose();
      chainAlphaBase.dispose();
      for (const { mat, tex } of matCache.values()) {
        mat.dispose();
        tex?.dispose();
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
      {mode === "orbit" ? (
        <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
          <span className="rounded-full bg-white/85 backdrop-blur hairline px-3 py-1 text-[11px] text-[color:var(--ink-muted)]">
            Click to walk through · WASD move · Q/E up·down · Esc exit · drag to orbit
          </span>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
          <span className="rounded-full bg-[color:var(--accent)] text-white px-3 py-1 text-[11px] shadow-[var(--shadow-sm)]">
            Walking · move mouse to look · WASD · Esc to exit
          </span>
        </div>
      )}
    </div>
  );
});
