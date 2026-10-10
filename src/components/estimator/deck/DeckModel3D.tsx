"use client";
// THE DECK STUDIO'S 3D (2026-10-04; roofs 2026-10-10). Vanilla Three.js, like
// FenceModel3D and RoofModel3D: the renderer, the sky, the lights and the
// ground are built ONCE; the deck itself is a group rebuilt whenever the
// scene's data changes, and the two things that change many times a second —
// how much of the deck is standing, and whether the boards are faded — only
// touch instance counts and material opacity.
//
// The data is lib/deck/scene.ts's box list, in feet: x along the house, y out
// from it, z up. Here x stays X, z becomes Y (up) and y becomes Z, with the
// deck's middle at the origin, so the house is behind the deck and the
// camera stands in the yard.
//
// One InstancedMesh per layer: a unit box placed per piece — square to the
// axes for the deck, turned by its yaw and tilt for a rafter, a hip or a
// header around a polygon (version 2 boxes carry those two angles). The
// roof's faces, the ceiling, the soffit and a slab are flat polygons, one
// geometry per layer. `built` stands the layers up in build order, piece by
// piece — the studio's build-up slider and its Play button drive it. `xray`
// fades the boards, the roofing and the ground so the frame can be read.
//
// Drawn only when something moved: the loop asks the orbit whether the
// camera changed and otherwise leaves the last frame up, so an open studio
// does not spin a phone's fan.
import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { SCENE_LAYERS, sceneBuildLayers, type DeckScene, type SceneLayer } from "@/lib/deck/scene";

export interface DeckModel3DProps {
  scene: DeckScene;
  /** Layers standing, counted in build order over the layers this scene has (lib/deck/scene sceneBuildLayers): 0 … n. A fraction stands part of a layer, piece by piece. Left out: everything stands. */
  built?: number;
  /** Fade the boards, the roofing, the ceiling and the ground. */
  xray?: boolean;
  className?: string;
  /** Read out for the canvas. */
  label?: string;
  /** Change it to put the camera back on the three-quarter view from the yard. */
  resetToken?: number;
}

const LAYER_COUNT = SCENE_LAYERS.length;
const layerIndex = (name: SceneLayer) => SCENE_LAYERS.indexOf(name);
const DECKING = layerIndex("decking");
const FASCIA = layerIndex("fascia");
const FOOTING = layerIndex("footing");
const BRACE = layerIndex("brace");
const SHEATHING = layerIndex("sheathing");
const ROOFING = layerIndex("roofing");
const CEILING = layerIndex("ceiling");
const TRIM = layerIndex("trim");
const GUTTER = layerIndex("gutter");
const SLAB = layerIndex("slab");
/** Layers the x-ray fades. */
const FADES = new Set([DECKING, FASCIA, SHEATHING, ROOFING, CEILING, TRIM]);

const CONCRETE = 0xb9b6ad;
const GRASS = 0x9fa886;
const SIDING = 0xe9e5db;
const FOUNDATION = 0xa9a69d;
const ROOF = 0x55524c;
const GLASS = 0x2f3a44;
const TRIM_WHITE = 0xf7f5ef;
const OSB = 0xd6bf90;
const CEILING_WOOD = 0xe6d5b2;
const ALUMINUM = 0xd9d6cf;
const INK = 0x0f1419;

function webglSupported(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** A little lighter or darker, the same for the same piece every time. */
function jitter(base: THREE.Color, i: number, amount: number): THREE.Color {
  const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const t = (n - Math.floor(n) - 0.5) * 2 * amount;
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + t)));
}

/** Lap siding: a pale board with a shadow line under it, tiled up the wall. */
function sidingTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 8, 64);
    g.fillStyle = "rgba(0,0,0,0.16)";
    g.fillRect(0, 60, 8, 4);
    g.fillStyle = "rgba(0,0,0,0.05)";
    g.fillRect(0, 52, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A dimension's figure on a small white tag. */
function tagSprite(text: string): { sprite: THREE.Sprite; dispose: () => void } {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const pad = 14;
  const font = "700 44px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  let w = 160;
  if (g) {
    g.font = font;
    w = Math.ceil(g.measureText(text).width) + pad * 2;
  }
  c.width = w;
  c.height = 72;
  if (g) {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, 72);
    g.strokeStyle = "#0f1419";
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, 68);
    g.font = font;
    g.fillStyle = "#0f1419";
    g.textBaseline = "middle";
    g.fillText(text, pad, 38);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 10;
  sprite.userData.aspect = w / 72;
  return { sprite, dispose: () => { tex.dispose(); mat.dispose(); } };
}

const feetInches = (ft: number) => {
  const inches = Math.round(ft * 12);
  return `${Math.floor(inches / 12)}'-${inches % 12}"`;
};

interface Built {
  group: THREE.Group;
  /** Per layer: the instanced meshes and how many pieces each holds. */
  layers: Array<Array<{ mesh: THREE.InstancedMesh; total: number }>>;
  /** Per layer: the flat polygons as one geometry, with the index end of each. */
  polys: Array<{ mesh: THREE.Mesh; ends: number[] } | null>;
  /** Braces, drawn one mesh each. */
  braces: THREE.Mesh[];
  /** Boards on the diagonal: one geometry, a range of it per board. */
  diagonal: { mesh: THREE.Mesh; ends: number[] } | null;
  /** Each layer's step in this scene's build-up (−1 = not in the scene). */
  rank: number[];
  fade: THREE.Material[];
  dispose: () => void;
}

export function DeckModel3D({ scene, built = Number.POSITIVE_INFINITY, xray = false, className, label, resetToken = 0 }: DeckModel3DProps) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const [supported] = React.useState(webglSupported);
  const sceneRef = React.useRef(scene);
  const builtRef = React.useRef(built);
  const xrayRef = React.useRef(xray);
  /** Set by the mount effect: rebuild from the scene, re-apply what is standing, go back to the first view. */
  const api = React.useRef<{ rebuild: () => void; apply: () => void; reset: () => void } | null>(null);

  React.useEffect(() => {
    if (resetToken) api.current?.reset();
  }, [resetToken]);

  React.useEffect(() => {
    sceneRef.current = scene;
    api.current?.rebuild();
  }, [scene]);
  React.useEffect(() => {
    builtRef.current = built;
    xrayRef.current = xray;
    api.current?.apply();
  }, [built, xray]);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !supported) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      return;
    }
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches;
    } catch {
      coarse = false;
    }
    const w0 = mount.clientWidth || 800;
    const h0 = mount.clientHeight || 480;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w0, h0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // A touch under the fence's exposure: a deck is a big flat face turned to the sky, and boards read washed out at 1.0.
    renderer.toneMappingExposure = 0.9;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w0 / h0, 0.1, 4000);

    // Sky and light: a warm sun over the yard, soft shadows under the deck.
    const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(140));
    const tuneSky = (s: Sky) => {
      const u = (s.material as THREE.ShaderMaterial).uniforms;
      u.sunPosition.value.copy(sun);
      u.turbidity.value = 5;
      u.rayleigh.value = 1.3;
      u.mieCoefficient.value = 0.005;
      u.mieDirectionalG.value = 0.8;
    };
    const sky = new Sky();
    sky.scale.setScalar(3000);
    tuneSky(sky);
    world.add(sky);
    world.add(new THREE.HemisphereLight(0xcfe0ff, 0x8a8468, 0.75));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.3);
    key.castShadow = true;
    key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    key.shadow.bias = -0.0004;
    world.add(key);
    world.add(key.target);
    let envTex: THREE.Texture | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      const envSky = new Sky();
      envSky.scale.setScalar(3000);
      tuneSky(envSky);
      envScene.add(envSky);
      envTex = pmrem.fromScene(envScene).texture;
      world.environment = envTex;
      // The sky's light is half the story here: at full strength every board top facing it went pale.
      world.environmentIntensity = 0.45;
      envSky.geometry.dispose();
      (envSky.material as THREE.Material).dispose();
      pmrem.dispose();
    } catch {
      /* the environment is optional */
    }

    const groundGeo = new THREE.PlaneGeometry(1, 1);
    const groundMat = new THREE.MeshStandardMaterial({ color: GRASS, roughness: 1, metalness: 0, transparent: true, opacity: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    world.add(ground);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI * 0.495;
    orbit.minDistance = 3;

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    const siding = sidingTexture();
    let dirty = true;
    let content: Built | null = null;
    let span = 20;
    let fitted: { w: number; d: number; h: number } | null = null;

    /** The camera's first view for this deck, or the same angle refitted to a new size. */
    const frame = (reset: boolean) => {
      const s = sceneRef.current;
      const peak = Math.max(s.heightFt, s.peakFt ?? s.heightFt);
      const next = Math.max(s.widthFt, s.depthFt, peak * 1.4, 10);
      const target = new THREE.Vector3(0, Math.max(1, peak * 0.45), 0);
      // A narrow frame (a phone) sees less across, so the camera stands farther back.
      const narrow = Math.max(1, 1.4 / Math.max(0.3, camera.aspect));
      if (reset || !fitted) {
        camera.position.set(target.x + next * 0.9 * narrow, target.y + (next * 0.5 + peak * 0.3) * narrow, target.z + next * 1.2 * narrow);
      } else {
        // Keep the angle the contractor chose; step back or in with the deck's size.
        const offset = camera.position.clone().sub(orbit.target).multiplyScalar(next / span);
        camera.position.copy(target).add(offset);
      }
      span = next;
      orbit.target.copy(target);
      orbit.maxDistance = span * 6;
      camera.near = Math.max(0.1, span / 400);
      camera.far = span * 60 + 4000;
      camera.updateProjectionMatrix();
      ground.scale.set(span * 14, span * 14, 1);
      key.position.set(span * 0.9, span * 1.6 + peak, span * 0.75);
      key.target.position.set(0, 0, 0);
      const sc = key.shadow.camera as THREE.OrthographicCamera;
      sc.left = -span * 1.5;
      sc.right = span * 1.5;
      sc.top = span * 1.5;
      sc.bottom = -span * 1.5;
      sc.near = 0.1;
      sc.far = span * 6 + peak * 4;
      sc.updateProjectionMatrix();
      key.shadow.normalBias = span * 0.0012;
      fitted = { w: s.widthFt, d: s.depthFt, h: peak };
      orbit.update();
      dirty = true;
    };

    const build = (): Built => {
      const s = sceneRef.current;
      const group = new THREE.Group();
      const ox = s.widthFt / 2;
      const oz = s.depthFt / 2;
      const owned: Array<{ dispose: () => void }> = [];
      const fade: THREE.Material[] = [];
      const frameColor = new THREE.Color(s.colors.frame);
      const deckColor = new THREE.Color(s.colors.decking);
      const roofColor = new THREE.Color(s.colors.roofing ?? "#565250");
      const tone = (c: THREE.Color, by: number) => jitter(c, 1, 0).offsetHSL(0, 0, by);
      const baseOf = (name: SceneLayer): THREE.Color => {
        switch (name) {
          case "decking":
            return deckColor;
          case "fascia":
            return tone(deckColor, -0.05);
          case "footing":
          case "slab":
            return new THREE.Color(CONCRETE);
          case "beam":
          case "header":
            return tone(frameColor, -0.05);
          case "post":
          case "roof-post":
            return tone(frameColor, -0.08);
          case "ridge":
            return tone(frameColor, -0.03);
          case "sheathing":
            return new THREE.Color(OSB);
          case "roofing":
            return roofColor;
          case "trim":
            return new THREE.Color(TRIM_WHITE);
          case "gutter":
            return new THREE.Color(ALUMINUM);
          case "ceiling":
            return new THREE.Color(CEILING_WOOD);
          default:
            return frameColor;
        }
      };
      const mats: THREE.MeshStandardMaterial[] = SCENE_LAYERS.map((name, i) => {
        const base = baseOf(name);
        // Decking and framing take a per-piece tint, so the material itself stays white for those.
        const tinted = i !== FOOTING && i !== SLAB;
        const m = new THREE.MeshStandardMaterial({ color: tinted ? 0xffffff : base, roughness: i === DECKING ? 0.72 : i === GUTTER ? 0.5 : i === ROOFING ? 0.85 : 0.9, metalness: i === GUTTER ? 0.4 : 0 });
        m.userData.base = base;
        owned.push(m);
        if (FADES.has(i)) fade.push(m);
        return m;
      });

      const order = sceneBuildLayers(s);
      const rank = SCENE_LAYERS.map((name) => order.indexOf(name));

      const layers: Built["layers"] = SCENE_LAYERS.map(() => []);
      const braces: THREE.Mesh[] = [];
      const dummy = new THREE.Object3D();
      const basis = new THREE.Matrix4();
      const ax = new THREE.Vector3();
      const ay = new THREE.Vector3();
      const az = new THREE.Vector3();
      for (let L = 0; L < LAYER_COUNT; L++) {
        if (L === FOOTING) continue;
        const boxes = s.boxes.filter((b) => b[0] === L && b[7] === 0);
        if (boxes.length) {
          const mesh = new THREE.InstancedMesh(unitBox, mats[L], boxes.length);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const base = mats[L].userData.base as THREE.Color;
          boxes.forEach((b, i) => {
            dummy.position.set(b[1] - ox, b[3], b[2] - oz);
            if (b.length >= 10 && (b[8] !== 0 || b[9] !== 0)) {
              // A turned member: its axis points `yaw` from +x in plan and rises `tilt`.
              const yaw = b[8];
              const tilt = b[9];
              ax.set(Math.cos(yaw) * Math.cos(tilt), Math.sin(tilt), Math.sin(yaw) * Math.cos(tilt));
              ay.set(-Math.cos(yaw) * Math.sin(tilt), Math.cos(tilt), -Math.sin(yaw) * Math.sin(tilt));
              az.set(-Math.sin(yaw), 0, Math.cos(yaw));
              basis.makeBasis(ax, ay, az);
              dummy.quaternion.setFromRotationMatrix(basis);
            } else dummy.quaternion.identity();
            dummy.scale.set(b[4], b[6], b[5]);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, jitter(base, i + L * 97, L === DECKING ? 0.045 : L === TRIM || L === GUTTER ? 0.01 : 0.03));
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          group.add(mesh);
          layers[L].push({ mesh, total: boxes.length });
        }
      }
      // Knee braces: a 2x4 on the diagonal of its box.
      const braceMat = new THREE.MeshStandardMaterial({ color: tone(frameColor, -0.02), roughness: 0.9 });
      owned.push(braceMat);
      for (const b of s.boxes.filter((x) => x[0] === BRACE && x[7] !== 0)) {
        const alongX = b[7] === 1 || b[7] === 2;
        const run = alongX ? b[4] : b[5];
        const rise = b[6];
        const length = Math.hypot(run, rise);
        const angle = Math.atan2(rise, run);
        const mesh = new THREE.Mesh(unitBox, braceMat);
        mesh.castShadow = true;
        mesh.position.set(b[1] - ox, b[3], b[2] - oz);
        if (alongX) {
          mesh.scale.set(length, 3.5 / 12, 1.5 / 12);
          mesh.rotation.z = b[7] === 1 ? angle : -angle;
        } else {
          mesh.scale.set(1.5 / 12, 3.5 / 12, length);
          mesh.rotation.x = b[7] === 3 ? -angle : angle;
        }
        group.add(mesh);
        braces.push(mesh);
      }

      // Footings: the pad at the bottom of the hole, the pier up to its top.
      if (s.footings.length) {
        const mat = mats[FOOTING];
        const pads = new THREE.InstancedMesh(unitCyl, mat, s.footings.length);
        const piers = new THREE.InstancedMesh(unitCyl, mat, s.footings.length);
        s.footings.forEach((f, i) => {
          const [x, y, pad, thick, pier, depth, top] = f;
          dummy.quaternion.identity();
          dummy.position.set(x - ox, -depth + thick / 2, y - oz);
          dummy.scale.set(pad, thick, pad);
          dummy.updateMatrix();
          pads.setMatrixAt(i, dummy.matrix);
          const pierHeight = Math.max(0.05, depth - thick + top);
          dummy.position.set(x - ox, top - pierHeight / 2, y - oz);
          dummy.scale.set(pier, pierHeight, pier);
          dummy.updateMatrix();
          piers.setMatrixAt(i, dummy.matrix);
        });
        pads.instanceMatrix.needsUpdate = true;
        piers.instanceMatrix.needsUpdate = true;
        piers.castShadow = true;
        piers.receiveShadow = true;
        group.add(pads, piers);
        layers[FOOTING].push({ mesh: pads, total: s.footings.length }, { mesh: piers, total: s.footings.length });
      }

      /** Flat rings into one geometry: a fan per ring, both faces, a range of the index per ring. */
      const fanGeometry = (rings: Array<{ pts: Array<[number, number, number]>; color: THREE.Color }>): { geo: THREE.BufferGeometry; ends: number[] } => {
        const positions: number[] = [];
        const colors: number[] = [];
        const index: number[] = [];
        const ends: number[] = [];
        for (const ring of rings) {
          const start = positions.length / 3;
          for (const p of ring.pts) {
            positions.push(p[0], p[1], p[2]);
            colors.push(ring.color.r, ring.color.g, ring.color.b);
          }
          for (let k = 1; k + 1 < ring.pts.length; k++) index.push(start, start + k, start + k + 1);
          ends.push(index.length);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(index);
        geo.computeVertexNormals();
        return { geo, ends };
      };

      // Boards on the diagonal: each ring a thin prism, all in one geometry.
      let diagonal: Built["diagonal"] = null;
      if (s.diagonal && s.diagonal.boards.length) {
        const positions: number[] = [];
        const colors: number[] = [];
        const index: number[] = [];
        const ends: number[] = [];
        const top = s.heightFt;
        const bottom = top - s.diagonal.thickFt;
        s.diagonal.boards.forEach((ring, bi) => {
          const n = ring.length / 2;
          const start = positions.length / 3;
          const c = jitter(deckColor, bi, 0.045);
          for (const y of [top, bottom]) {
            for (let k = 0; k < n; k++) {
              positions.push(ring[k * 2] - ox, y, ring[k * 2 + 1] - oz);
              colors.push(c.r, c.g, c.b);
            }
          }
          // The top face, the bottom face (wound the other way), then the sides.
          for (let k = 1; k + 1 < n; k++) {
            index.push(start, start + k + 1, start + k);
            index.push(start + n, start + n + k, start + n + k + 1);
          }
          for (let k = 0; k < n; k++) {
            const a = start + k;
            const b2 = start + ((k + 1) % n);
            index.push(a, b2, a + n, b2, b2 + n, a + n);
          }
          ends.push(index.length);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(index);
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, flatShading: true, side: THREE.DoubleSide });
        owned.push(geo, mat);
        fade.push(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        diagonal = { mesh, ends };
      }

      // The roof's faces, the ceiling, the soffit, a slab: flat polygons, one geometry per layer.
      const polys: Built["polys"] = SCENE_LAYERS.map(() => null);
      for (let L = 0; L < LAYER_COUNT; L++) {
        const mine = s.polys.filter((p) => p[0] === L);
        if (!mine.length) continue;
        const base = mats[L].userData.base as THREE.Color;
        const rings = mine.map((p, i) => {
          const pts: Array<[number, number, number]> = [];
          for (let k = 1; k + 2 < p.length; k += 3) pts.push([p[k] - ox, p[k + 2], p[k + 1] - oz]);
          return { pts, color: jitter(base, i + L * 31, L === ROOFING ? 0.03 : 0.015) };
        });
        const { geo, ends } = fanGeometry(rings);
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: L === ROOFING ? 0.85 : 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide });
        owned.push(geo, mat);
        if (FADES.has(L)) fade.push(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        polys[L] = { mesh, ends };
      }

      // The house: wall, foundation band, a roof slab, a door onto the deck and a window each side.
      if (s.house) {
        const wallMat = new THREE.MeshStandardMaterial({ color: SIDING, roughness: 0.95, map: siding });
        const baseMat = new THREE.MeshStandardMaterial({ color: FOUNDATION, roughness: 1 });
        const roofMat = new THREE.MeshStandardMaterial({ color: ROOF, roughness: 0.9 });
        const glassMat = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.4 });
        const trimMat = new THREE.MeshStandardMaterial({ color: TRIM_WHITE, roughness: 0.8 });
        owned.push(wallMat, baseMat, roofMat, glassMat, trimMat);
        const height = s.house.heightFt;
        const band = Math.min(1.5, Math.max(0.5, s.heightFt - 0.6));
        siding.repeat.set(1, height / 0.5);
        for (const [x0, y0, x1, y1] of s.house.blocks) {
          const w = x1 - x0;
          const d = y1 - y0;
          const cx = (x0 + x1) / 2 - ox;
          const cz = (y0 + y1) / 2 - oz;
          const wall = new THREE.Mesh(unitBox, wallMat);
          wall.scale.set(w, height - band, d);
          wall.position.set(cx, band + (height - band) / 2, cz);
          wall.castShadow = true;
          wall.receiveShadow = true;
          const base = new THREE.Mesh(unitBox, baseMat);
          base.scale.set(w + 0.02, band, d + 0.02);
          base.position.set(cx, band / 2, cz);
          base.receiveShadow = true;
          const roof = new THREE.Mesh(unitBox, roofMat);
          roof.scale.set(w + 2, 0.5, d + 2);
          roof.position.set(cx, height + 0.25, cz);
          roof.castShadow = true;
          group.add(wall, base, roof);
        }
        if (s.house.door) {
          const [dx, dw, dh] = s.house.door;
          const sill = s.heightFt;
          const opening = (x: number, w: number, h: number, y: number) => {
            const trim = new THREE.Mesh(unitBox, trimMat);
            trim.scale.set(w + 0.5, h + 0.5, 0.12);
            trim.position.set(x - ox, y + h / 2, -oz + 0.03);
            const glass = new THREE.Mesh(unitBox, glassMat);
            glass.scale.set(w, h, 0.14);
            glass.position.set(x - ox, y + h / 2, -oz + 0.04);
            group.add(trim, glass);
          };
          opening(dx, dw, dh, sill);
          // A window each side, where the wall the deck is on has room for one.
          const main = s.house.blocks[0];
          for (const side of [-1, 1]) {
            const wx = dx + side * (dw / 2 + 4.5);
            if (wx - 1.5 > Math.max(main[0], 0) && wx + 1.5 < Math.min(main[2], s.widthFt)) opening(wx, 3, 4, sill + 2.7);
          }
        }
      }

      // The overall dimensions, drawn on the ground a little outside the deck, and the height at the corner.
      const lineMat = new THREE.LineBasicMaterial({ color: INK });
      owned.push(lineMat);
      const dims = new THREE.Group();
      const dim = (a: THREE.Vector3, b: THREE.Vector3, text: string, tick: THREE.Vector3) => {
        const pts = [a, b, a.clone().add(tick), a.clone().sub(tick), b.clone().add(tick), b.clone().sub(tick)];
        const geo = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]]);
        owned.push(geo);
        dims.add(new THREE.LineSegments(geo, lineMat));
        const tag = tagSprite(text);
        owned.push(tag);
        tag.sprite.position.copy(a).add(b).multiplyScalar(0.5);
        tag.sprite.userData.dim = true;
        dims.add(tag.sprite);
      };
      const out = 2.2;
      const tall = Math.max(s.heightFt, s.peakFt ?? 0);
      dim(new THREE.Vector3(-ox, 0.05, oz + out), new THREE.Vector3(ox, 0.05, oz + out), feetInches(s.widthFt), new THREE.Vector3(0, 0, 0.4));
      dim(new THREE.Vector3(ox + out, 0.05, -oz), new THREE.Vector3(ox + out, 0.05, oz), feetInches(s.depthFt), new THREE.Vector3(0.4, 0, 0));
      if (s.heightFt > 0.5) dim(new THREE.Vector3(ox + out, 0, oz + out), new THREE.Vector3(ox + out, s.heightFt, oz + out), feetInches(s.heightFt), new THREE.Vector3(0.3, 0, 0.3));
      if (tall > s.heightFt + 1) dim(new THREE.Vector3(-ox - out, 0, oz + out), new THREE.Vector3(-ox - out, tall, oz + out), feetInches(tall), new THREE.Vector3(0.3, 0, 0.3));
      group.add(dims);

      return {
        group,
        layers,
        polys,
        braces,
        diagonal,
        rank,
        fade,
        dispose: () => {
          for (const o of owned) o.dispose();
          for (const l of layers) for (const { mesh } of l) mesh.dispose();
        },
      };
    };

    const apply = () => {
      if (!content) return;
      const b = builtRef.current;
      const x = xrayRef.current;
      const share = (L: number) => (content!.rank[L] < 0 ? 1 : Math.min(1, Math.max(0, b - content!.rank[L])));
      content.layers.forEach((meshes, L) => {
        const f = share(L);
        for (const { mesh, total } of meshes) {
          mesh.count = Math.round(f * total);
          mesh.visible = mesh.count > 0;
        }
      });
      const braceShare = share(BRACE);
      content.braces.forEach((m, i) => (m.visible = i < Math.round(braceShare * content!.braces.length)));
      if (content.diagonal) {
        const f = share(DECKING);
        const boards = Math.round(f * content.diagonal.ends.length);
        content.diagonal.mesh.visible = boards > 0;
        content.diagonal.mesh.geometry.setDrawRange(0, boards > 0 ? content.diagonal.ends[boards - 1] : 0);
      }
      content.polys.forEach((p, L) => {
        if (!p) return;
        const f = share(L);
        const n = Math.round(f * p.ends.length);
        p.mesh.visible = n > 0;
        p.mesh.geometry.setDrawRange(0, n > 0 ? p.ends[n - 1] : 0);
      });
      for (const m of content.fade) {
        m.transparent = x;
        m.opacity = x ? 0.2 : 1;
        m.depthWrite = !x;
        m.needsUpdate = true;
      }
      groundMat.opacity = x ? 0.55 : 1;
      groundMat.depthWrite = !x;
      groundMat.needsUpdate = true;
      dirty = true;
    };

    const rebuild = () => {
      if (content) {
        world.remove(content.group);
        content.dispose();
      }
      content = build();
      world.add(content.group);
      const s = sceneRef.current;
      const peak = Math.max(s.heightFt, s.peakFt ?? s.heightFt);
      const resized = !fitted || fitted.w !== s.widthFt || fitted.d !== s.depthFt || fitted.h !== peak;
      if (resized) frame(false);
      apply();
    };

    api.current = { rebuild, apply, reset: () => frame(true) };
    rebuild();

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const moved = orbit.update();
      if (!moved && !dirty) return;
      dirty = false;
      // A tag keeps its size on the screen's scale of the deck, wherever the camera stands.
      if (content) {
        const size = Math.max(0.55, span * 0.035);
        content.group.traverse((o) => {
          if (o instanceof THREE.Sprite && o.userData.dim) o.scale.set(size * (o.userData.aspect as number), size, 1);
        });
      }
      renderer.render(world, camera);
    };
    tick();

    let measured = mount.clientWidth > 0 && mount.clientHeight > 0;
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth || w0;
      const h = mount.clientHeight || h0;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // The first real size: frame the deck for it.
      if (!measured && mount.clientWidth > 0 && mount.clientHeight > 0) {
        measured = true;
        frame(true);
      }
      dirty = true;
    });
    ro.observe(mount);

    return () => {
      api.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      orbit.dispose();
      if (content) {
        world.remove(content.group);
        content.dispose();
      }
      unitBox.dispose();
      unitCyl.dispose();
      siding.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      envTex?.dispose();
      (sky.material as THREE.Material).dispose();
      sky.geometry.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [supported]);

  if (!supported) {
    return (
      <div className={className} data-deck3d="unsupported" style={{ display: "grid", placeItems: "center" }}>
        <span>The 3D view is not available on this device</span>
      </div>
    );
  }
  // The host's class places and sizes the box (an absolute fill, in every host so far); the
  // canvas follows it. No inline position here: it beat the class and the canvas kept its
  // first size (480 px tall in a 220 px frame on a phone).
  return <div ref={mountRef} className={className} data-deck3d="canvas" role="img" aria-label={label ?? "The deck in 3D"} style={{ overflow: "hidden" }} />;
}
