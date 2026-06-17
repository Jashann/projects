/* STL Paint — browser-based 3D model painter for 3D printing
   - Renders a mesh in an interactive Three.js / WebGL scene (orbit controls)
   - Import .stl (STL carries geometry but not color)
   - Brush mode: paint per-vertex colors directly on the surface
   - Region fill: flood-fill connected faces within a normal-angle threshold
     (click a "hat" or "boot"-like region, fill it in one click)
   - Export .ply with vertex colors so color survives into slicing / multi-material printing
   Author: Jashanjot Gill */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const canvasEl = document.getElementById("canvas");

// ---- scene ----
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
camera.position.set(0, 40, 130);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0xf3f4f6, 1); // light viewport to match the white theme
canvasEl.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe4ea, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(40, 80, 60);
scene.add(key);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

let mesh = null;        // current THREE.Mesh (non-indexed, with color attr)
let faceAdj = null;     // adjacency list for region fill
let faceNormals = null; // per-face normal

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// ---- state ----
let mode = "brush";
let paintColor = new THREE.Color("#e23b3b");
let brushSize = 10;
let painting = false;

// ---- build a default "snowman" character from merged primitives ----
function defaultModel() {
  const parts = [];
  const body = new THREE.SphereGeometry(22, 40, 30); body.translate(0, 22, 0);
  const torso = new THREE.SphereGeometry(16, 36, 26); torso.translate(0, 52, 0);
  const head = new THREE.SphereGeometry(11, 32, 24); head.translate(0, 74, 0);
  const brim = new THREE.CylinderGeometry(13, 13, 2, 32); brim.translate(0, 80, 0);
  const hat = new THREE.CylinderGeometry(8, 8, 14, 32); hat.translate(0, 88, 0);
  const nose = new THREE.ConeGeometry(2, 8, 16); nose.rotateX(Math.PI / 2); nose.translate(0, 74, 11);
  [body, torso, head, brim, hat, nose].forEach((g) => parts.push(g.toNonIndexed()));
  // concat manually (avoid version-specific merge signatures)
  return concatGeometries(parts);
}

function concatGeometries(geoms) {
  let total = 0;
  geoms.forEach((g) => (total += g.attributes.position.count));
  const pos = new Float32Array(total * 3);
  let o = 0;
  geoms.forEach((g) => { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function loadGeometry(geo) {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  geo = geo.toNonIndexed ? (geo.index ? geo.toNonIndexed() : geo) : geo;
  geo.computeVertexNormals();
  centerAndScale(geo);

  // init white color attribute
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3).fill(1);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05, flatShading: false });
  mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  buildAdjacency(geo);
}

function centerAndScale(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, c = new THREE.Vector3();
  b.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
  const size = new THREE.Vector3(); b.getSize(size);
  const s = 80 / Math.max(size.x, size.y, size.z);
  geo.scale(s, s, s);
}

// ---- adjacency + face normals for region fill ----
function buildAdjacency(geo) {
  const pos = geo.attributes.position.array;
  const faceCount = pos.length / 9;
  faceNormals = new Array(faceCount);
  const vmap = new Map(); // quantized vertex -> id
  const faceVerts = new Array(faceCount);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();

  const key = (x, y, z) => Math.round(x * 100) + "_" + Math.round(y * 100) + "_" + Math.round(z * 100);
  for (let f = 0; f < faceCount; f++) {
    const i = f * 9;
    a.set(pos[i], pos[i + 1], pos[i + 2]);
    b.set(pos[i + 3], pos[i + 4], pos[i + 5]);
    c.set(pos[i + 6], pos[i + 7], pos[i + 8]);
    n.copy(c).sub(b).cross(a.clone().sub(b)).normalize();
    faceNormals[f] = n.clone();
    const ids = [key(a.x, a.y, a.z), key(b.x, b.y, b.z), key(c.x, c.y, c.z)];
    faceVerts[f] = ids;
    ids.forEach((id) => { if (!vmap.has(id)) vmap.set(id, []); vmap.get(id).push(f); });
  }
  // adjacency: faces sharing >= 2 quantized vertices
  faceAdj = new Array(faceCount);
  for (let f = 0; f < faceCount; f++) {
    const counts = new Map();
    faceVerts[f].forEach((id) => vmap.get(id).forEach((g) => { if (g !== f) counts.set(g, (counts.get(g) || 0) + 1); }));
    const adj = [];
    counts.forEach((v, g) => { if (v >= 2) adj.push(g); });
    faceAdj[f] = adj;
  }
}

// ---- painting ----
function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

function paintAt(e) {
  if (!mesh) return;
  setPointer(e);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(mesh, false);
  if (!hits.length) return;
  const hit = hits[0];
  if (mode === "brush") brushPaint(hit);
  else regionFill(hit.faceIndex);
}

function brushPaint(hit) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const local = mesh.worldToLocal(hit.point.clone());
  const r2 = brushSize * brushSize;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.distanceToSquared(local) <= r2) col.setXYZ(i, paintColor.r, paintColor.g, paintColor.b);
  }
  col.needsUpdate = true;
}

function regionFill(faceIndex) {
  if (faceIndex == null || !faceAdj) return;
  const geo = mesh.geometry;
  const col = geo.attributes.color;
  const threshold = Math.cos(THREE.MathUtils.degToRad(35));
  const start = faceIndex;
  const seen = new Set([start]);
  const stack = [start];
  const startN = faceNormals[start];
  while (stack.length) {
    const f = stack.pop();
    // color the 3 vertices of face f
    for (let k = 0; k < 3; k++) col.setXYZ(f * 3 + k, paintColor.r, paintColor.g, paintColor.b);
    faceAdj[f].forEach((g) => {
      if (seen.has(g)) return;
      if (faceNormals[g].dot(startN) >= threshold) { seen.add(g); stack.push(g); }
    });
  }
  col.needsUpdate = true;
}

// ---- export PLY (ascii) with vertex colors ----
function exportPly() {
  if (!mesh) return;
  const pos = mesh.geometry.attributes.position;
  const col = mesh.geometry.attributes.color;
  const n = pos.count;
  const faces = n / 3;
  let v = "";
  for (let i = 0; i < n; i++) {
    v += pos.getX(i).toFixed(4) + " " + pos.getY(i).toFixed(4) + " " + pos.getZ(i).toFixed(4) + " " +
      Math.round(col.getX(i) * 255) + " " + Math.round(col.getY(i) * 255) + " " + Math.round(col.getZ(i) * 255) + "\n";
  }
  let f = "";
  for (let i = 0; i < faces; i++) f += "3 " + (i * 3) + " " + (i * 3 + 1) + " " + (i * 3 + 2) + "\n";
  const header =
    "ply\nformat ascii 1.0\ncomment created with STL Paint by Jashanjot Gill\n" +
    "element vertex " + n + "\nproperty float x\nproperty float y\nproperty float z\n" +
    "property uchar red\nproperty uchar green\nproperty uchar blue\n" +
    "element face " + faces + "\nproperty list uchar int vertex_indices\nend_header\n";
  const blob = new Blob([header + v + f], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "painted-model.ply"; a.click();
  URL.revokeObjectURL(url);
}

// ---- UI wiring ----
const SWATCHES = ["#e23b3b", "#2f7de1", "#1fad5a", "#f2b01e", "#9b51e0", "#ffffff", "#222831"];
const swEl = document.getElementById("swatches");
SWATCHES.forEach((hex, idx) => {
  const b = document.createElement("button");
  b.className = "sw" + (idx === 0 ? " active" : "");
  b.style.background = hex;
  b.title = hex;
  b.addEventListener("click", () => {
    paintColor = new THREE.Color(hex);
    document.getElementById("color").value = hex;
    swEl.querySelectorAll(".sw").forEach((s) => s.classList.remove("active"));
    b.classList.add("active");
  });
  swEl.appendChild(b);
});
document.getElementById("color").addEventListener("input", (e) => {
  paintColor = new THREE.Color(e.target.value);
  swEl.querySelectorAll(".sw").forEach((s) => s.classList.remove("active"));
});
document.getElementById("brush").addEventListener("input", (e) => (brushSize = +e.target.value));

function setMode(m) {
  mode = m;
  document.getElementById("mBrush").classList.toggle("active", m === "brush");
  document.getElementById("mRegion").classList.toggle("active", m === "region");
  document.getElementById("brushTool").style.opacity = m === "brush" ? "1" : ".4";
}
document.getElementById("mBrush").addEventListener("click", () => setMode("brush"));
document.getElementById("mRegion").addEventListener("click", () => setMode("region"));

document.getElementById("reset").addEventListener("click", () => {
  if (!mesh) return;
  const col = mesh.geometry.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, 1, 1, 1);
  col.needsUpdate = true;
});
document.getElementById("exportPly").addEventListener("click", exportPly);

document.getElementById("file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      let geo = new STLLoader().parse(reader.result);
      if (geo.index) geo = geo.toNonIndexed();
      loadGeometry(geo);
    } catch (err) { alert("Could not parse that STL file."); }
  };
  reader.readAsArrayBuffer(file);
});

// paint interaction (disable orbit while painting on the model)
const dom = renderer.domElement;
dom.addEventListener("pointerdown", (e) => {
  if (!mesh) return;
  setPointer(e);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.intersectObject(mesh, false).length) {
    painting = true; controls.enabled = false; paintAt(e);
  }
});
dom.addEventListener("pointermove", (e) => { if (painting) paintAt(e); });
window.addEventListener("pointerup", () => { painting = false; controls.enabled = true; });

// ---- resize + render loop ----
function resize() {
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

loadGeometry(defaultModel());
resize();
(function loop() {
  requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
})();
