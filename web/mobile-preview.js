import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const params = new URLSearchParams(window.location.search);
const bindingId = params.get('bindingId');
const apiRoot = `${window.location.origin}/socketai/api/mobile`;

const stateEl = document.querySelector('#state');
const viewerEl = document.querySelector('#viewer');
const hintEl = document.querySelector('#hint');
const legendEl = document.querySelector('#legend');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f4ef);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0.52, 0.38, 0.78);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
viewerEl.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.enablePan = false;
orbit.target.set(0, 0.18, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c6bd, 1.7));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(0.7, 1.2, 0.8);
keyLight.castShadow = true;
scene.add(keyLight);

const grid = new THREE.GridHelper(0.86, 12, 0xcfd8d4, 0xe4e7e3);
grid.position.y = -0.015;
scene.add(grid);

const limbMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.72,
  metalness: 0.02,
});
const socketMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.64,
  roughness: 0.38,
  metalness: 0.0,
  side: THREE.DoubleSide,
  depthWrite: true,
});

let limbMesh = null;
let socketMesh = null;
let modelBox = new THREE.Box3();
let selectedRegion = params.get('region') || null;

function setState(message, isError = false) {
  stateEl.textContent = message;
  stateEl.classList.toggle('error', isError);
  stateEl.hidden = false;
  viewerEl.hidden = true;
  hintEl.hidden = true;
}

function showViewer(message) {
  stateEl.hidden = true;
  viewerEl.hidden = false;
  hintEl.hidden = false;
  hintEl.innerHTML = message;
}

async function apiFetch(path) {
  const res = await fetch(`${apiRoot}${path}`, {
    headers: { 'X-Binding-Id': bindingId },
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      msg = JSON.parse(text).error || text;
    } catch {
      /* ignore */
    }
    throw new Error(msg || `请求失败 (${res.status})`);
  }
  return res;
}

function centerGroup(meshes) {
  const box = new THREE.Box3();
  meshes.forEach((mesh) => box.expandByObject(mesh));
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  meshes.forEach((mesh) => mesh.position.sub(center));
  modelBox.copy(box).translate(center.clone().multiplyScalar(-1));
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  camera.position.set(maxDim * 0.9, maxDim * 0.65, maxDim * 1.05);
  orbit.target.set(0, size.y * 0.08, 0);
  orbit.update();
}

async function loadGeometry(url, format) {
  const res = await apiFetch(url);
  const buffer = await res.arrayBuffer();
  if (format === 'obj') {
    const text = new TextDecoder().decode(buffer);
    const group = new OBJLoader().parse(text);
    const geometries = [];
    group.traverse((child) => {
      if (child.isMesh && child.geometry) geometries.push(child.geometry);
    });
    if (!geometries.length) throw new Error('OBJ 无有效网格');
    return mergeGeometries(geometries);
  }
  return new STLLoader().parse(buffer);
}

function mergeGeometries(geometries) {
  const merged = new THREE.BufferGeometry();
  const positions = [];
  for (const geo of geometries) {
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    geo.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

function buildFallbackSocket(limbGeometry, parameters = {}) {
  const geo = limbGeometry.clone();
  geo.computeVertexNormals();
  const offsetMm = Number(parameters.offsetMm ?? parameters.offset ?? 3);
  const offset = offsetMm / 1000;
  const pos = geo.attributes.position;
  const normal = geo.attributes.normal;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(
      i,
      pos.getX(i) + normal.getX(i) * offset,
      pos.getY(i) + normal.getY(i) * offset * 0.85,
      pos.getZ(i) + normal.getZ(i) * offset
    );
  }
  geo.computeVertexNormals();
  return geo;
}

function regionHit(x, y, z, regionId) {
  if (!modelBox.isEmpty()) {
    const size = modelBox.getSize(new THREE.Vector3());
    const min = modelBox.min;
    const ny = size.y > 0 ? (y - min.y) / size.y : 0.5;
    const angle = Math.atan2(x, z);
    const deg = (angle * 180) / Math.PI;
    switch (regionId) {
      case 'distal':
        return ny < 0.18;
      case 'rim':
        return ny > 0.82;
      case 'anterior':
        return Math.abs(deg) <= 55;
      case 'posterior':
        return Math.abs(deg) >= 125;
      case 'medial':
        return deg > 55 && deg < 125;
      case 'lateral':
        return deg < -55 || deg > -125;
      default:
        return false;
    }
  }
  return false;
}

function applyRegionHighlight(regionId) {
  if (!limbMesh || !regionId) {
    if (limbMesh) limbMesh.geometry.setAttribute('color', null);
    limbMesh?.material.needsUpdate && (limbMesh.material.vertexColors = false);
    return;
  }
  const geo = limbMesh.geometry;
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0xffffff);
  const tint = new THREE.Color(0xd96d3a);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const c = regionHit(x, y, z, regionId) ? tint : base;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  limbMesh.material.vertexColors = true;
  limbMesh.material.needsUpdate = true;
}

function resize() {
  const width = viewerEl.clientWidth || window.innerWidth;
  const height = viewerEl.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function animate() {
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function regionLabel(id) {
  const map = {
    rim: '口缘',
    anterior: '前侧',
    medial: '内侧',
    lateral: '外侧',
    posterior: '后侧',
    distal: '末端',
  };
  return map[id] || id;
}

function handleExternalMessage(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data?.type === 'highlight') {
      selectedRegion = data.regionId || null;
      applyRegionHighlight(selectedRegion);
      if (selectedRegion) {
        hintEl.innerHTML = `当前选中：<em>${regionLabel(selectedRegion)}</em> · 拖动旋转对照模型`;
      }
    }
  } catch {
    /* ignore malformed messages */
  }
}

window.addEventListener('message', (event) => handleExternalMessage(event.data));
document.addEventListener('message', (event) => handleExternalMessage(event.data));

async function boot() {
  if (!bindingId) {
    setState('缺少 bindingId，无法加载模型', true);
    return;
  }

  try {
    const metaRes = await apiFetch('/preview/models');
    const meta = await metaRes.json();

    if (!meta.limb) {
      setState('假肢师尚未上传残肢扫描，暂无法 3D 预览', true);
      return;
    }

    const limbGeometry = await loadGeometry('/models/limb', meta.limb.format);
    limbMesh = new THREE.Mesh(limbGeometry, limbMaterial.clone());
    scene.add(limbMesh);

    let socketNote = '';
    if (meta.socket) {
      try {
        const socketGeometry = await loadGeometry('/models/socket', 'stl');
        socketMesh = new THREE.Mesh(socketGeometry, socketMaterial);
        scene.add(socketMesh);
        socketNote = '已加载导出的接受腔';
      } catch {
        socketNote = '接受腔导出不可用，显示示意外轮廓';
      }
    }

    if (!socketMesh && meta.socketFallback) {
      const fallback = buildFallbackSocket(limbGeometry, meta.parameters);
      socketMesh = new THREE.Mesh(fallback, socketMaterial);
      scene.add(socketMesh);
      socketNote = socketNote || '接受腔为基于参数的示意预览（与桌面端导出可能略有差异）';
    }

    centerGroup([limbMesh, socketMesh].filter(Boolean));
    applyRegionHighlight(selectedRegion);
    legendEl.innerHTML = socketMesh
      ? '<strong>残肢</strong> + <strong>接受腔</strong>'
      : '<strong>残肢</strong>';
    showViewer(
      selectedRegion
        ? `当前选中：<em>${regionLabel(selectedRegion)}</em> · ${socketNote || '拖动旋转对照模型'}`
        : socketNote || '拖动旋转，对照模型选择疼痛区域'
    );
    resize();
    animate();
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' }));
  } catch (error) {
    setState(error.message || '模型加载失败', true);
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ type: 'error', message: error.message || 'load failed' })
    );
  }
}

window.addEventListener('resize', resize);
boot();
