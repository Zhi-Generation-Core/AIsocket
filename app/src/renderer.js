import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const viewer = document.querySelector('#viewer');
const fileInput = document.querySelector('#fileInput');
const sampleBtn = document.querySelector('#sampleBtn');
const generateBtn = document.querySelector('#generateBtn');
const geminiBtn = document.querySelector('#geminiBtn');
const exportBtn = document.querySelector('#exportBtn');
const recommendations = document.querySelector('#recommendations');
const semanticTags = document.querySelector('#semanticTags');
const versionDelta = document.querySelector('#versionDelta');
const aiState = document.querySelector('#aiState');
const hint = document.querySelector('#hint');
const geminiResult = document.querySelector('#geminiResult');
const currentStepTitle = document.querySelector('#currentStepTitle');
const currentStepNote = document.querySelector('#currentStepNote');
const workflowProgress = document.querySelector('#workflowProgress');
const workflowNext = document.querySelector('#workflowNext');
const versionTimeline = document.querySelector('#versionTimeline');
const addVersionBtn = document.querySelector('#addVersionBtn');
const deleteVersionBtn = document.querySelector('#deleteVersionBtn');
const userName = document.querySelector('#userName');
const userAvatar = document.querySelector('#userAvatar');
const interactionFeedback = document.querySelector('#interactionFeedback');
const sectionControls = document.querySelector('#sectionControls');
const sectionHeight = document.querySelector('#sectionHeight');
const sectionHeightOut = document.querySelector('#sectionHeightOut');
const resetViewBtn = document.querySelector('#resetViewBtn');
const fitViewBtn = document.querySelector('#fitViewBtn');
const undoPaintBtn = document.querySelector('#undoPaintBtn');

const controls = {
  offset: document.querySelector('#offset'),
  trim: document.querySelector('#trim'),
  relief: document.querySelector('#relief'),
  distal: document.querySelector('#distal'),
  brushStrength: document.querySelector('#brushStrength'),
  activityLevel: document.querySelector('#activityLevel'),
  bodyWeight: document.querySelector('#bodyWeight'),
  tissueFirmness: document.querySelector('#tissueFirmness'),
  semanticToggle: document.querySelector('#semanticToggle'),
  heatToggle: document.querySelector('#heatToggle') || { checked: false, addEventListener: () => {} },
  wireToggle: document.querySelector('#wireToggle')
};

const outputs = {
  offset: document.querySelector('#offsetOut'),
  trim: document.querySelector('#trimOut'),
  relief: document.querySelector('#reliefOut'),
  distal: document.querySelector('#distalOut'),
  brushStrength: document.querySelector('#brushStrengthOut'),
  weight: document.querySelector('#weightOut'),
  height: document.querySelector('#heightMetric'),
  circ: document.querySelector('#circMetric'),
  volume: document.querySelector('#volumeMetric'),
  delta: document.querySelector('#deltaMetric'),
  wall: document.querySelector('#wallMetric'),
  print: document.querySelector('#printMetric')
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f4ef);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0.52, 0.38, 0.78);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
viewer.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
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
  side: THREE.DoubleSide
});
const socketMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  vertexColors: true,
  transparent: true,
  opacity: 0.64,
  roughness: 0.38,
  metalness: 0.0,
  side: THREE.DoubleSide,
  depthWrite: false
});
const wireMaterial = new THREE.MeshBasicMaterial({
  color: 0x184f47,
  wireframe: true,
  transparent: true,
  opacity: 0.28,
  depthWrite: false
});
const heatMaterial = new THREE.MeshBasicMaterial({
  color: 0xd96d3a,
  transparent: true,
  opacity: 0.58,
  side: THREE.DoubleSide,
  depthWrite: false
});

let limbMesh = null;
let socketMesh = null;
let wireMesh = null;
let heatGroup = new THREE.Group();
let markerGroup = new THREE.Group();
let paintMode = false;
let sectionMode = false;
let modelProfile = null;
let metrics = null;
let currentRiskZones = [];
let semanticMap = null;
let currentGenerationMeta = null;
let socketVersions = [];
let selectedVersionId = null;
let nextVersionNumber = 1;
let geminiRefinement = null;
let currentViewMode = 'both';
let paintUndoStack = [];
let completedWorkflowSteps = new Set();

const sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const brushCursor = new THREE.Mesh(
  new THREE.TorusGeometry(0.055, 0.0012, 8, 72),
  new THREE.MeshBasicMaterial({
    color: 0xd96d3a,
    transparent: true,
    opacity: 0.86,
    depthWrite: false
  })
);
brushCursor.visible = false;
brushCursor.renderOrder = 5;

scene.add(heatGroup, markerGroup, brushCursor);

const PROFILE_SLICES = 72;
const PROFILE_SEGMENTS = 128;
const MIN_SECTION_RADIUS = 0.006;
const WORKFLOW_STEPS = [
  {
    id: 'scan',
    title: '导入扫描',
    note: '导入 STL/OBJ 或使用示例残肢，建立设计起点。',
    next: '下一步：识别解剖点与风险区。',
    progress: 20,
    pane: 'advice'
  },
  {
    id: 'landmarks',
    title: '识别解剖点',
    note: '检查语义标签、敏感区和承重区，确认 AI 对残肢区域的理解。',
    next: '下一步：生成 AI 初始参数建议。',
    progress: 40,
    pane: 'advice'
  },
  {
    id: 'ai',
    title: 'AI 参数建议',
    note: '根据几何、活动等级和软组织状态生成接受腔初版。',
    next: '下一步：进入参数与画笔精修。',
    progress: 60,
    pane: 'advice'
  },
  {
    id: 'edit',
    title: '手动精修',
    note: '调整包容量、修边高度、减压幅度，或用画笔做局部外扩。',
    next: '下一步：检查制造指标并导出。',
    progress: 80,
    pane: 'params'
  },
  {
    id: 'export',
    title: '制造输出',
    note: '复核体积 Delta、壁厚和打印预检，导出接受腔 STL。',
    next: '当前流程已到制造输出阶段。',
    progress: 100,
    pane: 'manufacture'
  }
];

const SEMANTIC_LABELS = {
  anterior_tibia: {
    label: '胫骨前缘',
    short: '胫前',
    color: 0xe94d5f,
    severity: 'high',
    offsetMm: 1.2,
    reliefMm: 2.2,
    description: '骨性突起敏感区，生成时增加局部减压。'
  },
  fibula_head: {
    label: '腓骨头/外侧骨突',
    short: '腓骨',
    color: 0xf08a38,
    severity: 'high',
    offsetMm: 0.9,
    reliefMm: 1.6,
    description: '外侧局部压力敏感区，保守外扩。'
  },
  distal_end: {
    label: '远端末端',
    short: '末端',
    color: 0xf2c94c,
    severity: 'medium',
    offsetMm: 1.8,
    reliefMm: 0.8,
    description: '末端承压与软组织形变区，增加包容和过渡。'
  },
  proximal_brim: {
    label: '近端修边区',
    short: '近端',
    color: 0x2f80ed,
    severity: 'medium',
    offsetMm: 0.8,
    reliefMm: 0.3,
    description: '靠近修边与悬吊区域，保留稳定包覆。'
  },
  posterior_soft_tissue: {
    label: '后侧软组织承重区',
    short: '后侧',
    color: 0x37aa6f,
    severity: 'low',
    offsetMm: -0.5,
    reliefMm: -0.2,
    description: '相对可承重区域，生成时略收紧以提升稳定。'
  },
  general_soft_tissue: {
    label: '一般软组织',
    short: '软组织',
    color: 0xd8b492,
    severity: 'low',
    offsetMm: 0,
    reliefMm: 0,
    description: '常规包容区域，沿用基础外扩参数。'
  }
};

const CLINICAL_RULES = {
  anterior_tibia: {
    actionType: 'relief',
    maxDeformationMm: 4.5,
    minWeight: 0.18,
    defaultWeight: 0.58,
    maxWeight: 1,
    axialSigma: 0.24,
    angularSigma: 0.15,
    spread: 0.72,
    releasePriority: 1.35,
    vectorDirection: 'normal_out'
  },
  fibula_head: {
    actionType: 'relief',
    maxDeformationMm: 5.0,
    minWeight: 0.16,
    defaultWeight: 0.52,
    maxWeight: 1,
    axialSigma: 0.21,
    angularSigma: 0.16,
    spread: 0.72,
    releasePriority: 1.18,
    vectorDirection: 'normal_out'
  },
  distal_end: {
    actionType: 'buffer',
    maxDeformationMm: 4.0,
    minWeight: 0.2,
    defaultWeight: 0.62,
    maxWeight: 0.92,
    axialSigma: 0.18,
    angularSigma: 0.55,
    spread: 0.55,
    releasePriority: 0.72,
    vectorDirection: 'normal_out'
  },
  proximal_brim: {
    actionType: 'stabilize',
    maxDeformationMm: 1.8,
    minWeight: 0.12,
    defaultWeight: 0.42,
    maxWeight: 0.78,
    axialSigma: 0.16,
    angularSigma: 0.55,
    spread: 0.38,
    releasePriority: 0.38,
    vectorDirection: 'normal_out'
  },
  posterior_soft_tissue: {
    actionType: 'load',
    maxDeformationMm: -2.2,
    minWeight: 0.18,
    defaultWeight: 0.4,
    maxWeight: 0.72,
    axialSigma: 0.38,
    angularSigma: 0.28,
    spread: 0.9,
    releasePriority: 0,
    vectorDirection: 'normal_in'
  },
  general_soft_tissue: {
    actionType: 'neutral',
    maxDeformationMm: 0,
    minWeight: 0,
    defaultWeight: 0,
    maxWeight: 0,
    axialSigma: 0.4,
    angularSigma: 0.5,
    releasePriority: 0,
    vectorDirection: 'normal_out'
  }
};

function resize() {
  const rect = viewer.getBoundingClientRect();
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height);
}
window.addEventListener('resize', resize);

function animate() {
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function createRevolvedGeometry(profile, segments = 96) {
  if (profile.some((p) => Array.isArray(p.radii))) {
    return createSectionedGeometry(profile, segments);
  }

  const positions = [];
  const normals = [];
  const indices = [];
  const radialData = [];

  for (let i = 0; i < profile.length; i += 1) {
    const p = profile[i];
    for (let j = 0; j <= segments; j += 1) {
      const theta = (j / segments) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const localRelief = p.relief || 0;
      const anterior = Math.max(0, cos);
      const radius = p.r + localRelief * anterior ** 8;
      positions.push(radius * cos, p.y, radius * sin);
      normals.push(cos, 0.16, sin);
      radialData.push({ y: p.y, theta, baseRadius: radius });
    }
  }

  const row = segments + 1;
  for (let i = 0; i < profile.length - 1; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.userData.radialData = radialData;
  geometry.computeVertexNormals();
  return geometry;
}

function createSectionedGeometry(profile, segments = PROFILE_SEGMENTS, options = {}) {
  const positions = [];
  const indices = [];
  const radialData = [];
  const row = segments + 1;

  profile.forEach((p) => {
    for (let j = 0; j <= segments; j += 1) {
      const theta = (j / segments) * Math.PI * 2;
      const radius = radiusAt(p, j, segments);
      const x = (p.centerX || 0) + Math.cos(theta) * radius;
      const z = (p.centerZ || 0) + Math.sin(theta) * radius;
      positions.push(x, p.y, z);
      radialData.push({ y: p.y, theta, baseRadius: radius });
    }
  });

  for (let i = 0; i < profile.length - 1; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  if (options.closeDistal && profile.length > 0) {
    const distal = profile[0];
    const centerX = distal.centerX || 0;
    const centerZ = distal.centerZ || 0;
    const distalRadii = Array.from({ length: segments }, (_value, j) => radiusAt(distal, j, segments));
    const averageRadius = distalRadii.reduce((sum, radius) => sum + radius, 0) / Math.max(1, distalRadii.length);
    const cupDepth = Math.min(0.018, Math.max(0.007, averageRadius * 0.22));
    const cupRings = [
      { y: distal.y - cupDepth * 0.25, scale: 0.88 },
      { y: distal.y - cupDepth * 0.55, scale: 0.62 },
      { y: distal.y - cupDepth * 0.82, scale: 0.34 }
    ];
    let previousStart = 0;

    cupRings.forEach((ring) => {
      const ringStart = positions.length / 3;
      for (let j = 0; j <= segments; j += 1) {
        const theta = (j / segments) * Math.PI * 2;
        const radius = radiusAt(distal, j, segments) * ring.scale;
        positions.push(centerX + Math.cos(theta) * radius, ring.y, centerZ + Math.sin(theta) * radius);
        radialData.push({ y: ring.y, theta, baseRadius: radius });
      }
      for (let j = 0; j < segments; j += 1) {
        const a = previousStart + j;
        const b = ringStart + j;
        indices.push(a + 1, b, a, a + 1, b + 1, b);
      }
      previousStart = ringStart;
    });

    const capIndex = positions.length / 3;
    positions.push(centerX, distal.y - cupDepth, centerZ);
    radialData.push({ y: distal.y - cupDepth, theta: 0, baseRadius: 0 });
    for (let j = 0; j < segments; j += 1) {
      indices.push(previousStart + j + 1, previousStart + j, capIndex);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.userData.radialData = radialData;
  geometry.computeVertexNormals();
  return geometry;
}

function radiusAt(profilePoint, angularIndex, segments = PROFILE_SEGMENTS) {
  const theta = (angularIndex / segments) * Math.PI * 2;
  const localRelief = (profilePoint.relief || 0) * Math.max(0, Math.cos(theta)) ** 8;
  if (!Array.isArray(profilePoint.radii) || profilePoint.radii.length === 0) {
    return Math.max(MIN_SECTION_RADIUS, (profilePoint.r || MIN_SECTION_RADIUS) + localRelief);
  }
  const t = (angularIndex / segments) * profilePoint.radii.length;
  const i0 = Math.floor(t) % profilePoint.radii.length;
  const i1 = (i0 + 1) % profilePoint.radii.length;
  const f = t - Math.floor(t);
  return Math.max(MIN_SECTION_RADIUS, THREE.MathUtils.lerp(profilePoint.radii[i0], profilePoint.radii[i1], f) + localRelief);
}

function sampleLimbProfile() {
  const h = 0.42;
  const profile = [];
  for (let i = 0; i < 58; i += 1) {
    const t = i / 57;
    const distalTaper = 0.43 + 0.57 * Math.sin(t * Math.PI * 0.82);
    const softTissue = 0.006 * Math.sin(t * Math.PI * 3.2);
    const condyle = 0.014 * Math.exp(-(((t - 0.76) / 0.11) ** 2));
    const r = 0.052 * distalTaper + softTissue + condyle;
    profile.push({ y: t * h, r: Math.max(0.018, r) });
  }
  return profile;
}

function profileFromGeometry(mesh) {
  const geometry = mesh.geometry;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const h = box.max.y - box.min.y || 1;
  const buckets = Array.from({ length: PROFILE_SLICES }, () => ({
    points: [],
    angular: Array.from({ length: PROFILE_SEGMENTS }, () => [])
  }));
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const idx = Math.min(PROFILE_SLICES - 1, Math.max(0, Math.floor(((y - box.min.y) / h) * (PROFILE_SLICES - 1))));
    buckets[idx].points.push({ x, y, z });
  }

  const sections = buckets.map((bucket, i) => {
    const y = box.min.y + (i / (PROFILE_SLICES - 1)) * h;
    if (!bucket.points.length) {
      return { y, r: 0.035, centerX: 0, centerZ: 0, radii: null, empty: true };
    }

    const centerX = trimmedAverage(bucket.points.map((p) => p.x), 0.12);
    const centerZ = trimmedAverage(bucket.points.map((p) => p.z), 0.12);
    bucket.points.forEach((p) => {
      const theta = (Math.atan2(p.z - centerZ, p.x - centerX) + Math.PI * 2) % (Math.PI * 2);
      const angularIndex = Math.min(PROFILE_SEGMENTS - 1, Math.floor((theta / (Math.PI * 2)) * PROFILE_SEGMENTS));
      bucket.angular[angularIndex].push(Math.hypot(p.x - centerX, p.z - centerZ));
    });

    const rawRadii = bucket.angular.map((values) => (values.length ? percentile(values, 0.9) : null));
    const fallback = percentile(bucket.points.map((p) => Math.hypot(p.x - centerX, p.z - centerZ)), 0.82);
    const radii = smoothCircular(fillCircularGaps(rawRadii, Math.max(MIN_SECTION_RADIUS, fallback)), 3);
    return {
      y,
      centerX,
      centerZ,
      radii,
      r: radii.reduce((sum, radius) => sum + radius, 0) / radii.length,
      empty: false
    };
  });

  return smoothProfileSections(interpolateMissingSections(sections), 2);
}

function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function trimmedAverage(values, trim = 0.1) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const start = Math.floor(sorted.length * trim);
  const end = Math.max(start + 1, Math.ceil(sorted.length * (1 - trim)));
  const slice = sorted.slice(start, end);
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

function fillCircularGaps(values, fallback) {
  const output = [...values];
  const known = output.map((value, index) => (value == null ? null : index)).filter((value) => value != null);
  if (!known.length) return output.map(() => fallback);

  for (let i = 0; i < output.length; i += 1) {
    if (output[i] != null) continue;
    let left = i;
    let right = i;
    for (let step = 1; step <= output.length; step += 1) {
      const li = (i - step + output.length) % output.length;
      const ri = (i + step) % output.length;
      if (output[li] != null) {
        left = li;
        break;
      }
      if (output[ri] != null) {
        left = ri;
        break;
      }
    }
    for (let step = 1; step <= output.length; step += 1) {
      const ri = (i + step) % output.length;
      const li = (i - step + output.length) % output.length;
      if (output[ri] != null) {
        right = ri;
        break;
      }
      if (output[li] != null) {
        right = li;
        break;
      }
    }
    output[i] = ((output[left] ?? fallback) + (output[right] ?? fallback)) / 2;
  }
  return output.map((value) => Math.max(MIN_SECTION_RADIUS, value ?? fallback));
}

function smoothCircular(values, passes = 1) {
  let smoothed = [...values];
  for (let pass = 0; pass < passes; pass += 1) {
    smoothed = smoothed.map((value, index) => {
      const prev = smoothed[(index - 1 + smoothed.length) % smoothed.length];
      const next = smoothed[(index + 1) % smoothed.length];
      return prev * 0.22 + value * 0.56 + next * 0.22;
    });
  }
  return smoothed;
}

function interpolateMissingSections(sections) {
  const known = sections.map((section, index) => (section.empty ? null : index)).filter((value) => value != null);
  if (!known.length) return sections;

  return sections.map((section, index) => {
    if (!section.empty) return section;
    const left = [...known].reverse().find((knownIndex) => knownIndex < index);
    const right = known.find((knownIndex) => knownIndex > index);
    const a = sections[left ?? right ?? known[0]];
    const b = sections[right ?? left ?? known[0]];
    const denom = Math.max(1, (right ?? left ?? index) - (left ?? right ?? index));
    const t = left != null && right != null ? (index - left) / denom : 0;
    const radii = a.radii.map((radius, j) => THREE.MathUtils.lerp(radius, b.radii[j], t));
    return {
      y: section.y,
      centerX: THREE.MathUtils.lerp(a.centerX, b.centerX, t),
      centerZ: THREE.MathUtils.lerp(a.centerZ, b.centerZ, t),
      radii,
      r: radii.reduce((sum, value) => sum + value, 0) / radii.length,
      empty: false
    };
  });
}

function smoothProfileSections(profile, passes = 1) {
  let result = profile.map((section) => ({
    ...section,
    radii: Array.isArray(section.radii) ? [...section.radii] : null
  }));

  for (let pass = 0; pass < passes; pass += 1) {
    result = result.map((section, index) => {
      const prev = result[Math.max(0, index - 1)];
      const next = result[Math.min(result.length - 1, index + 1)];
      const radii = section.radii
        ? section.radii.map((radius, j) => prev.radii[j] * 0.2 + radius * 0.6 + next.radii[j] * 0.2)
        : null;
      const r = radii ? radii.reduce((sum, value) => sum + value, 0) / radii.length : section.r;
      return {
        ...section,
        centerX: prev.centerX * 0.18 + section.centerX * 0.64 + next.centerX * 0.18,
        centerZ: prev.centerZ * 0.18 + section.centerZ * 0.64 + next.centerZ * 0.18,
        radii,
        r
      };
    });
  }
  return result;
}

function buildSemanticMap(profile, mesh = limbMesh) {
  const features = mesh ? extractMeshSemanticFeatures(mesh.geometry, profile) : [];
  const stats = {};
  const vertexLabels = [];
  const vertexGroups = {};
  const sectionLabels = buildSemanticSectionLabels(profile, features);
  const refinedSectionLabels = refineSemanticSectionLabels(sectionLabels, profile);
  refinedSectionLabels.forEach((row, i) => {
    row.forEach((labelId, j) => {
      sectionLabels[i][j] = labelId;
    });
  });

  if (features.length) {
    features.forEach((feature) => {
      const labelId = labelFromSectionGrid(sectionLabels, feature.yNorm, feature.thetaNorm);
      vertexLabels[feature.originalIndex] = labelId;
      if (!vertexGroups[labelId]) vertexGroups[labelId] = [];
      vertexGroups[labelId].push(feature.originalIndex);
    });
  }

  sectionLabels.forEach((row, i) => {
    row.forEach((labelId, j) => {
      addSemanticStat(stats, labelId, i / Math.max(1, profile.length - 1), j / PROFILE_SEGMENTS, 1);
    });
  });

  const total = Object.values(stats).reduce((sum, entry) => sum + entry.count, 0) || 1;
  const summary = Object.values(stats)
    .map((entry) => ({
      ...entry,
      ratio: entry.count / total,
      y: entry.ySum / entry.count,
      theta: ((Math.atan2(entry.sinSum, entry.cosSum) / (Math.PI * 2)) + 1) % 1,
      color: riskColorFromSeverity(entry.severity),
      description: SEMANTIC_LABELS[entry.id].description
    }))
    .sort((a, b) => b.count - a.count);

  return {
    sectionLabels,
    vertexLabels,
    vertexGroups,
    summary,
    labelCount: summary.length,
    confidence: features.length ? 0.82 : 0.68,
    method: features.length ? 'curvature_topology_vertex_groups' : 'profile_fallback'
  };
}

function buildSemanticSectionLabels(profile, features) {
  const featureGrid = aggregateSemanticFeatureGrid(profile, features);
  const seeds = semanticSeedCenters(features);
  return profile.map((section, i) => (
    Array.from({ length: PROFILE_SEGMENTS }, (_value, j) => {
      const feature = semanticFeatureForCell(featureGrid, profile, section, i, j);
      return labelFromSemanticScores(semanticLabelScores(feature, seeds));
    })
  ));
}

function aggregateSemanticFeatureGrid(profile, features) {
  const grid = Array.from({ length: profile.length }, () => (
    Array.from({ length: PROFILE_SEGMENTS }, () => ({
      count: 0,
      curvature: 0,
      normalVariation: 0,
      protrusion: 0,
      radialDrop: 0,
      boundaryScore: 0,
      bonyScore: 0,
      confidence: 0
    }))
  ));

  features.forEach((feature) => {
    const i = Math.min(profile.length - 1, Math.max(0, Math.round(feature.yNorm * (profile.length - 1))));
    const j = Math.min(PROFILE_SEGMENTS - 1, Math.max(0, Math.floor(feature.thetaNorm * PROFILE_SEGMENTS)));
    const cell = grid[i][j];
    const weight = Math.max(0.2, feature.confidence || 0.5);
    cell.count += weight;
    cell.curvature += feature.curvature * weight;
    cell.normalVariation += feature.normalVariation * weight;
    cell.protrusion += feature.protrusion * weight;
    cell.radialDrop += feature.radialDrop * weight;
    cell.boundaryScore += feature.boundaryScore * weight;
    cell.bonyScore += feature.bonyScore * weight;
    cell.confidence += weight;
  });
  return grid;
}

function semanticFeatureForCell(grid, profile, section, sectionIndex, angularIndex) {
  const cell = grid[sectionIndex]?.[angularIndex];
  const thetaNorm = angularIndex / PROFILE_SEGMENTS;
  const radius = Array.isArray(section.radii) ? section.radii[angularIndex] : section.r;
  const fallback = profileFeature(section, sectionIndex, thetaNorm, radius, profile);
  if (!cell?.count) return fallback;
  const inv = 1 / cell.count;
  return {
    ...fallback,
    curvature: clamp(cell.curvature * inv, 0, 1),
    normalVariation: clamp(cell.normalVariation * inv, 0, 1),
    protrusion: cell.protrusion * inv,
    radialDrop: cell.radialDrop * inv,
    boundaryScore: clamp(cell.boundaryScore * inv, 0, 1),
    bonyScore: clamp(cell.bonyScore * inv, 0, 1),
    confidence: clamp(cell.confidence * inv, 0.35, 0.95)
  };
}

function semanticSeedCenters(features) {
  const overrides = rankedBonyLabelOverrides(features);
  const seeds = {};
  ['anterior_tibia', 'fibula_head'].forEach((labelId) => {
    let count = 0;
    let ySum = 0;
    let sinSum = 0;
    let cosSum = 0;
    features.forEach((feature) => {
      if (overrides.get(feature.originalIndex) !== labelId) return;
      const weight = 0.2 + feature.bonyScore + Math.max(0, feature.protrusion) * 0.35;
      count += weight;
      ySum += feature.yNorm * weight;
      sinSum += Math.sin(feature.thetaNorm * Math.PI * 2) * weight;
      cosSum += Math.cos(feature.thetaNorm * Math.PI * 2) * weight;
    });
    if (count > 0) {
      seeds[labelId] = {
        y: ySum / count,
        theta: ((Math.atan2(sinSum, cosSum) / (Math.PI * 2)) + 1) % 1,
        strength: clamp(count / Math.max(80, features.length * 0.018), 0.35, 1)
      };
    }
  });
  return seeds;
}

function semanticLabelScores(feature, seeds = {}) {
  const y = feature.yNorm;
  const anterior = circularDistance(feature.thetaNorm, 0);
  const lateral = circularDistance(feature.thetaNorm, 0.23);
  const posterior = circularDistance(feature.thetaNorm, 0.5);
  const bony = clamp(feature.bonyScore * 0.62 + feature.normalVariation * 0.24 + Math.max(0, feature.protrusion) * 0.18, 0, 1);
  const soft = clamp(1 - bony * 0.75 - Math.max(0, feature.protrusion) * 0.18, 0, 1);
  const distalBand = Math.exp(-0.5 * ((y - 0.055) / 0.085) ** 2);
  const proximalBand = Math.exp(-0.5 * ((y - 0.94) / 0.075) ** 2);
  const midBand = Math.exp(-0.5 * ((y - 0.52) / 0.28) ** 2);
  const anteriorBand = Math.exp(-0.5 * ((y - 0.5) / 0.22) ** 2);
  const fibulaBand = Math.exp(-0.5 * ((y - 0.62) / 0.19) ** 2);
  const anteriorSeed = semanticSeedAffinity(feature, seeds.anterior_tibia, 0.18, 0.2);
  const fibulaSeed = semanticSeedAffinity(feature, seeds.fibula_head, 0.16, 0.18);

  return {
    general_soft_tissue: 0.76 + soft * 0.42 - feature.boundaryScore * 0.14,
    posterior_soft_tissue: 0.36 + soft * 0.38 + gaussianByDistance(posterior, 0.27) * midBand * 1.05,
    anterior_tibia: gaussianByDistance(anterior, 0.12) * anteriorBand * (0.6 + bony * 1.7) + anteriorSeed * 1.15,
    fibula_head: gaussianByDistance(lateral, 0.13) * fibulaBand * (0.5 + bony * 1.55 + Math.max(0, feature.protrusion) * 0.45) + fibulaSeed * 1.2,
    distal_end: distalBand * (1.55 + feature.boundaryScore * 0.38 + Math.max(0, feature.radialDrop) * 0.22),
    proximal_brim: proximalBand * (1.6 + feature.boundaryScore * 0.65)
  };
}

function semanticSeedAffinity(feature, seed, sigmaY, sigmaTheta) {
  if (!seed) return 0;
  const dy = (feature.yNorm - seed.y) / sigmaY;
  const dt = circularDistance(feature.thetaNorm, seed.theta) / sigmaTheta;
  return seed.strength * Math.exp(-0.5 * (dy * dy + dt * dt));
}

function gaussianByDistance(distance, sigma) {
  return Math.exp(-0.5 * (distance / sigma) ** 2);
}

function labelFromSemanticScores(scores) {
  return Object.entries(scores).reduce((best, [labelId, score]) => (
    score > best.score ? { labelId, score } : best
  ), { labelId: 'general_soft_tissue', score: -Infinity }).labelId;
}

function refineSemanticSectionLabels(labels, profile) {
  let refined = labels.map((row) => [...row]);
  refined = enforceAnatomicalBands(refined, profile);
  refined = smoothSemanticGrid(refined, 3);
  refined = removeSmallSemanticIslands(refined, 20);
  refined = enforceAnatomicalBands(refined, profile);
  refined = protectClinicalLandmarkPatches(refined, profile);
  return refined;
}

function protectClinicalLandmarkPatches(labels, profile) {
  const result = labels.map((row) => [...row]);
  const rows = result.length;
  const patches = [
    { labelId: 'anterior_tibia', y: 0.52, theta: 0, sigmaY: 0.11, sigmaTheta: 0.055, limitY: [0.25, 0.76] },
    { labelId: 'fibula_head', y: 0.62, theta: 0.23, sigmaY: 0.12, sigmaTheta: 0.078, limitY: [0.34, 0.84] }
  ];

  patches.forEach((patch) => {
    let best = null;
    for (let i = 0; i < rows; i += 1) {
      const yNorm = i / Math.max(1, rows - 1);
      if (yNorm < patch.limitY[0] || yNorm > patch.limitY[1]) continue;
      const section = profile[i];
      for (let j = 0; j < PROFILE_SEGMENTS; j += 1) {
        const thetaNorm = j / PROFILE_SEGMENTS;
        const radius = Array.isArray(section.radii) ? section.radii[j] : section.r;
        const feature = profileFeature(section, i, thetaNorm, radius, profile);
        const angleFit = gaussianByDistance(circularDistance(thetaNorm, patch.theta), patch.sigmaTheta * 1.45);
        const yFit = Math.exp(-0.5 * (((yNorm - patch.y) / (patch.sigmaY * 1.35)) ** 2));
        const bony = feature.bonyScore + Math.max(0, feature.protrusion) * 0.5 + feature.normalVariation * 0.25;
        const score = angleFit * yFit * (0.6 + bony);
        if (!best || score > best.score) best = { y: yNorm, theta: thetaNorm, score };
      }
    }
    const centerY = best?.score > 0.08 ? best.y : patch.y;
    const centerTheta = best?.score > 0.08 ? best.theta : patch.theta;
    for (let i = 0; i < rows; i += 1) {
      const yNorm = i / Math.max(1, rows - 1);
      if (yNorm < patch.limitY[0] || yNorm > patch.limitY[1]) continue;
      for (let j = 0; j < PROFILE_SEGMENTS; j += 1) {
        if (['distal_end', 'proximal_brim'].includes(result[i][j])) continue;
        const thetaNorm = j / PROFILE_SEGMENTS;
        const dy = (yNorm - centerY) / patch.sigmaY;
        const dt = circularDistance(thetaNorm, centerTheta) / patch.sigmaTheta;
        if (dy * dy + dt * dt < 1.1) result[i][j] = patch.labelId;
      }
    }
  });
  return result;
}

function enforceAnatomicalBands(labels, profile) {
  const result = labels.map((row) => [...row]);
  const rows = result.length;
  for (let i = 0; i < rows; i += 1) {
    const yNorm = i / Math.max(1, rows - 1);
    if (yNorm < 0.1) {
      result[i] = result[i].map((labelId) => (labelId === 'fibula_head' || labelId === 'anterior_tibia' ? 'distal_end' : labelId));
    }
    if (yNorm > 0.88) {
      result[i] = result[i].map((labelId) => (labelId === 'distal_end' || labelId === 'fibula_head' ? 'proximal_brim' : labelId));
    }
    for (let j = 0; j < PROFILE_SEGMENTS; j += 1) {
      const thetaNorm = j / PROFILE_SEGMENTS;
      if (result[i][j] === 'posterior_soft_tissue' && circularDistance(thetaNorm, 0.5) > 0.33) {
        result[i][j] = 'general_soft_tissue';
      }
      if (result[i][j] === 'anterior_tibia' && circularDistance(thetaNorm, 0) > 0.2) {
        result[i][j] = 'general_soft_tissue';
      }
      if (result[i][j] === 'fibula_head' && circularDistance(thetaNorm, 0.23) > 0.24) {
        result[i][j] = 'general_soft_tissue';
      }
    }
  }

  const distalRows = Math.max(3, Math.round(rows * 0.08));
  for (let i = 0; i < distalRows; i += 1) {
    const row = result[i];
    const distalVote = row.filter((labelId) => labelId === 'distal_end').length;
    if (distalVote > PROFILE_SEGMENTS * 0.12) {
      result[i] = row.map((labelId, j) => {
        const thetaNorm = j / PROFILE_SEGMENTS;
        return circularDistance(thetaNorm, 0.5) < 0.36 || labelId === 'distal_end' ? 'distal_end' : labelId;
      });
    }
  }
  return result;
}

function smoothSemanticGrid(labels, passes = 1) {
  let current = labels.map((row) => [...row]);
  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((row, i) => row.map((labelId, j) => {
      if (['distal_end', 'proximal_brim'].includes(labelId)) return labelId;
      const votes = new Map();
      for (let di = -1; di <= 1; di += 1) {
        const ii = Math.min(current.length - 1, Math.max(0, i + di));
        for (let dj = -2; dj <= 2; dj += 1) {
          const jj = (j + dj + PROFILE_SEGMENTS) % PROFILE_SEGMENTS;
          const neighbor = current[ii][jj];
          const weight = di === 0 && dj === 0 ? 2.4 : di === 0 ? 1.1 : 0.75;
          votes.set(neighbor, (votes.get(neighbor) || 0) + weight);
        }
      }
      return majorityLabel(votes);
    }));
  }
  return current;
}

function removeSmallSemanticIslands(labels, minCells = 10) {
  const rows = labels.length;
  const visited = Array.from({ length: rows }, () => Array(PROFILE_SEGMENTS).fill(false));
  const result = labels.map((row) => [...row]);
  const neighbors = (i, j) => [
    [Math.max(0, i - 1), j],
    [Math.min(rows - 1, i + 1), j],
    [i, (j - 1 + PROFILE_SEGMENTS) % PROFILE_SEGMENTS],
    [i, (j + 1) % PROFILE_SEGMENTS]
  ];

  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < PROFILE_SEGMENTS; j += 1) {
      if (visited[i][j]) continue;
      const labelId = labels[i][j];
      const stack = [[i, j]];
      const cells = [];
      visited[i][j] = true;
      while (stack.length) {
        const [ci, cj] = stack.pop();
        cells.push([ci, cj]);
        neighbors(ci, cj).forEach(([ni, nj]) => {
          if (!visited[ni][nj] && labels[ni][nj] === labelId) {
            visited[ni][nj] = true;
            stack.push([ni, nj]);
          }
        });
      }
      if (cells.length >= minCells || ['distal_end', 'proximal_brim'].includes(labelId)) continue;
      cells.forEach(([ci, cj]) => {
        const votes = new Map();
        neighbors(ci, cj).forEach(([ni, nj]) => {
          const neighborLabel = labels[ni][nj];
          if (neighborLabel !== labelId) votes.set(neighborLabel, (votes.get(neighborLabel) || 0) + 1);
        });
        result[ci][cj] = votes.size ? majorityLabel(votes) : 'general_soft_tissue';
      });
    }
  }
  return result;
}

function labelFromSectionGrid(labels, yNorm, thetaNorm) {
  const i = Math.min(labels.length - 1, Math.max(0, Math.round(yNorm * (labels.length - 1))));
  const j = Math.min(PROFILE_SEGMENTS - 1, Math.max(0, Math.floor(thetaNorm * PROFILE_SEGMENTS)));
  return labels[i]?.[j] || 'general_soft_tissue';
}

function addSemanticStat(stats, labelId, yNorm, thetaNorm, weight = 1) {
  const entry = stats[labelId] || {
    id: labelId,
    count: 0,
    ySum: 0,
    sinSum: 0,
    cosSum: 0,
    label: SEMANTIC_LABELS[labelId].label,
    severity: SEMANTIC_LABELS[labelId].severity,
    adjustmentMm: SEMANTIC_LABELS[labelId].offsetMm + SEMANTIC_LABELS[labelId].reliefMm
  };
  entry.count += weight;
  entry.ySum += yNorm * weight;
  entry.sinSum += Math.sin(thetaNorm * Math.PI * 2) * weight;
  entry.cosSum += Math.cos(thetaNorm * Math.PI * 2) * weight;
  stats[labelId] = entry;
}

function majorityLabel(votes) {
  let label = 'general_soft_tissue';
  let score = -Infinity;
  votes.forEach((value, key) => {
    if (value > score) {
      score = value;
      label = key;
    }
  });
  return label;
}

function classifySemanticFeature(feature) {
  const anterior = circularDistance(feature.thetaNorm, 0);
  const lateral = circularDistance(feature.thetaNorm, 0.23);
  const posterior = circularDistance(feature.thetaNorm, 0.5);

  if (feature.boundaryScore > 0.5 && feature.yNorm > 0.72) return 'proximal_brim';
  if (feature.yNorm < 0.16 && (feature.boundaryScore > 0.25 || feature.curvature > 0.48 || feature.radialDrop > 0.1)) return 'distal_end';
  if (feature.yNorm > 0.24 && feature.yNorm < 0.78 && anterior < 0.11 && feature.bonyScore > 0.46) return 'anterior_tibia';
  if (feature.yNorm > 0.36 && feature.yNorm < 0.82 && lateral < 0.14 && feature.protrusion > 0.08 && feature.bonyScore > 0.36) return 'fibula_head';
  if (feature.yNorm > 0.24 && feature.yNorm < 0.82 && posterior < 0.25 && feature.bonyScore < 0.55) return 'posterior_soft_tissue';
  return 'general_soft_tissue';
}

function rankedBonyLabelOverrides(features) {
  const overrides = new Map();
  const anterior = features
    .filter((feature) => feature.yNorm > 0.24 && feature.yNorm < 0.78 && circularDistance(feature.thetaNorm, 0) < 0.16)
    .map((feature) => ({
      feature,
      score: feature.bonyScore * 1.6 + feature.normalVariation + Math.max(0, feature.protrusion) * 0.42 - circularDistance(feature.thetaNorm, 0) * 1.8
    }))
    .filter((item) => item.score > 0.18)
    .sort((a, b) => b.score - a.score);
  const lateral = features
    .filter((feature) => feature.yNorm > 0.36 && feature.yNorm < 0.82 && circularDistance(feature.thetaNorm, 0.23) < 0.18)
    .map((feature) => ({
      feature,
      score: feature.bonyScore * 1.35 + Math.max(0, feature.protrusion) * 0.85 + feature.curvature * 0.35 - circularDistance(feature.thetaNorm, 0.23) * 1.4
    }))
    .filter((item) => item.score > 0.14)
    .sort((a, b) => b.score - a.score);

  markTopSemanticCandidates(overrides, anterior, 'anterior_tibia', features.length, 0.035);
  markTopSemanticCandidates(overrides, lateral, 'fibula_head', features.length, 0.026);
  return overrides;
}

function markTopSemanticCandidates(overrides, candidates, labelId, totalCount, ratio) {
  if (!candidates.length) return;
  const targetCount = Math.max(18, Math.floor(totalCount * ratio));
  const cutoffIndex = Math.min(candidates.length - 1, targetCount - 1);
  const cutoffScore = Math.max(candidates[cutoffIndex].score, candidates[0].score * 0.62);
  candidates.forEach((item, index) => {
    if (index < targetCount || item.score >= cutoffScore) {
      overrides.set(item.feature.originalIndex, labelId);
    }
  });
}

function profileFeature(section, sectionIndex, thetaNorm, radius, profile) {
  const prev = profile[Math.max(0, sectionIndex - 1)];
  const next = profile[Math.min(profile.length - 1, sectionIndex + 1)];
  const meanRadius = section.r || radius;
  const yNorm = sectionIndex / Math.max(1, profile.length - 1);
  const radialDrop = Math.max(0, (meanRadius - radius) / Math.max(meanRadius, 0.001));
  const yCurve = Math.abs((prev?.r || meanRadius) - 2 * meanRadius + (next?.r || meanRadius)) / Math.max(meanRadius, 0.001);
  return {
    yNorm,
    thetaNorm,
    curvature: clamp(yCurve, 0, 1),
    normalVariation: clamp(yCurve * 0.8, 0, 1),
    protrusion: Math.max(0, (radius - meanRadius) / Math.max(meanRadius, 0.001)),
    radialDrop,
    boundaryScore: yNorm > 0.86 || yNorm < 0.08 ? 0.6 : 0,
    bonyScore: clamp(yCurve + Math.max(0, (radius - meanRadius) / Math.max(meanRadius, 0.001)), 0, 1),
    confidence: 0.4,
    originalIndex: -1
  };
}

function extractMeshSemanticFeatures(geometry, profile) {
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!pos || pos.count < 6) return [];

  const box = geometry.boundingBox;
  const spanY = Math.max(0.001, box.max.y - box.min.y);
  const weld = weldGeometryForAnalysis(geometry);
  const boundary = boundaryVertexSet(weld.faces);
  const radiusBuckets = Array.from({ length: PROFILE_SLICES }, () => []);

  weld.vertices.forEach((vertex) => {
    const yNorm = (vertex.y - box.min.y) / spanY;
    const sectionIndex = Math.min(PROFILE_SLICES - 1, Math.max(0, Math.round(yNorm * (PROFILE_SLICES - 1))));
    const section = profile[Math.min(profile.length - 1, Math.max(0, Math.round(yNorm * (profile.length - 1))))];
    const centerX = section?.centerX || 0;
    const centerZ = section?.centerZ || 0;
    radiusBuckets[sectionIndex].push(Math.hypot(vertex.x - centerX, vertex.z - centerZ));
  });

  const bucketStats = radiusBuckets.map((values) => ({
    median: values.length ? percentile(values, 0.5) : 0.02,
    p82: values.length ? percentile(values, 0.82) : 0.025,
    p95: values.length ? percentile(values, 0.95) : 0.03
  }));

  const features = [];
  for (let i = 0; i < pos.count; i += 1) {
    const vertexId = weld.originalToUnified[i];
    const vertex = weld.vertices[vertexId];
    const neighbors = [...(weld.adjacency[vertexId] || [])];
    const yNorm = (pos.getY(i) - box.min.y) / spanY;
    const sectionIndex = Math.min(profile.length - 1, Math.max(0, Math.round(yNorm * (profile.length - 1))));
    const section = profile[sectionIndex];
    const centerX = section?.centerX || 0;
    const centerZ = section?.centerZ || 0;
    const thetaNorm = ((Math.atan2(pos.getZ(i) - centerZ, pos.getX(i) - centerX) / (Math.PI * 2)) + 1) % 1;
    const radius = Math.hypot(pos.getX(i) - centerX, pos.getZ(i) - centerZ);
    const statsIndex = Math.min(PROFILE_SLICES - 1, Math.max(0, Math.round(yNorm * (PROFILE_SLICES - 1))));
    const local = bucketStats[statsIndex];
    const neighborDistance = neighbors.length
      ? neighbors.reduce((sum, id) => sum + vertexDistance(vertex, weld.vertices[id]), 0) / neighbors.length
      : 0;
    const curvature = clamp(neighborDistance / Math.max(local.p82, 0.001), 0, 1);
    const n = new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)).normalize();
    const normalVariation = neighbors.length
      ? neighbors.reduce((sum, id) => sum + (1 - Math.max(-1, Math.min(1, n.dot(weld.normals[id])))), 0) / neighbors.length
      : 0;
    const protrusion = (radius - local.p82) / Math.max(local.p95 - local.median, 0.001);
    const radialDrop = (local.median - radius) / Math.max(local.median, 0.001);
    const boundaryScore = boundary.has(vertexId) ? 1 : 0;
    const bonyScore = clamp(
      normalVariation * 1.9 + Math.max(0, protrusion) * 0.42 + curvature * 0.35 + boundaryScore * 0.12,
      0,
      1
    );

    features.push({
      originalIndex: i,
      vertexId,
      yNorm,
      thetaNorm,
      radius,
      curvature,
      normalVariation,
      protrusion,
      radialDrop,
      boundaryScore,
      bonyScore,
      confidence: clamp(0.48 + bonyScore * 0.38 + boundaryScore * 0.12, 0.35, 0.95)
    });
  }
  return features;
}

function weldGeometryForAnalysis(geometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = source.attributes.position;
  const normal = source.attributes.normal;
  const keyToIndex = new Map();
  const vertices = [];
  const normalSums = [];
  const originalToUnified = [];
  const faces = [];
  const adjacency = [];
  const quantize = (value) => Math.round(value * 100000);

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${quantize(x)},${quantize(y)},${quantize(z)}`;
    let id = keyToIndex.get(key);
    if (id == null) {
      id = vertices.length;
      keyToIndex.set(key, id);
      vertices.push({ x, y, z });
      normalSums.push(new THREE.Vector3());
      adjacency.push(new Set());
    }
    if (normal) normalSums[id].add(new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)));
    originalToUnified[i] = id;
  }

  for (let i = 0; i < pos.count; i += 3) {
    const face = [originalToUnified[i], originalToUnified[i + 1], originalToUnified[i + 2]];
    faces.push(face);
    [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
      if (face[a] === face[b]) return;
      adjacency[face[a]].add(face[b]);
      adjacency[face[b]].add(face[a]);
    });
  }

  if (source !== geometry) source.dispose();
  const normals = normalSums.map((sum) => (sum.lengthSq() > 0 ? sum.normalize() : new THREE.Vector3(0, 1, 0)));
  return { vertices, faces, adjacency, normals, originalToUnified };
}

function boundaryVertexSet(faces) {
  const edges = new Map();
  faces.forEach((face) => {
    [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
      const lo = Math.min(face[a], face[b]);
      const hi = Math.max(face[a], face[b]);
      const key = `${lo}|${hi}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    });
  });
  const boundary = new Set();
  edges.forEach((count, key) => {
    if (count !== 1) return;
    const [a, b] = key.split('|').map(Number);
    boundary.add(a);
    boundary.add(b);
  });
  return boundary;
}

function vertexDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function semanticLabelAt(sectionIndex, angularIndex) {
  if (!semanticMap?.sectionLabels?.length) return 'general_soft_tissue';
  const i = Math.min(semanticMap.sectionLabels.length - 1, Math.max(0, Math.round(sectionIndex)));
  const row = semanticMap.sectionLabels[i] || [];
  const j = ((Math.round(angularIndex) % PROFILE_SEGMENTS) + PROFILE_SEGMENTS) % PROFILE_SEGMENTS;
  return row[j] || 'general_soft_tissue';
}

function semanticAdjustment(labelId, t, theta) {
  return semanticFieldDeformation(labelId, t, theta).meters;
}

function semanticDeformation(labelId, t, theta, spreadMultiplier = 1) {
  const rule = clinicalRuleFor(labelId);
  const weight = semanticRuleWeight(labelId);
  const falloff = semanticGaussianFalloff(labelId, t, theta, spreadMultiplier);
  const valueMm = rule.maxDeformationMm * weight * falloff;
  return {
    labelId,
    actionType: rule.actionType,
    weight,
    falloff,
    valueMm,
    meters: valueMm / 1000,
    releaseWeight: Math.max(0, rule.releasePriority * falloff)
  };
}

function semanticFieldDeformation(localLabelId, t, theta) {
  if (!semanticMap?.summary?.length) return semanticDeformation(localLabelId, t, theta);
  const field = semanticMap.summary
    .map((entry) => {
      const rule = clinicalRuleFor(entry.id);
      if (rule.actionType === 'neutral') return null;
      const influence = semanticDeformation(entry.id, t, theta, semanticFieldSpreadMultiplier(entry.id));
      const scale = semanticFieldContributionScale(entry.id);
      return {
        valueMm: influence.valueMm * scale,
        releaseWeight: influence.releaseWeight * scale,
        falloff: influence.falloff
      };
    })
    .filter(Boolean);

  const negativeMm = field.filter((item) => item.valueMm < 0).reduce((sum, item) => sum + item.valueMm, 0);
  const positiveMm = field.filter((item) => item.valueMm > 0).reduce((sum, item) => sum + item.valueMm, 0);
  const protectedPositiveMm = negativeMm < 0 ? Math.min(positiveMm, Math.abs(negativeMm) * 0.38) : positiveMm;
  const totalMm = clamp(negativeMm + protectedPositiveMm, -2.4, 6.2);
  const totalReleaseWeight = field.reduce((sum, item) => sum + item.releaseWeight, 0);
  return {
    labelId: localLabelId,
    actionType: clinicalRuleFor(localLabelId).actionType,
    weight: semanticRuleWeight(localLabelId),
    falloff: 1,
    valueMm: totalMm,
    meters: totalMm / 1000,
    releaseWeight: totalReleaseWeight
  };
}

function semanticSocketGeometryDeformation(localLabelId, t, theta) {
  if (!semanticMap?.summary?.length) return semanticDeformation(localLabelId, t, theta);
  const geometryLabels = new Set(['anterior_tibia', 'fibula_head', 'distal_end']);
  const field = semanticMap.summary
    .filter((entry) => geometryLabels.has(entry.id))
    .map((entry) => {
      const influence = semanticDeformation(entry.id, t, theta, semanticFieldSpreadMultiplier(entry.id));
      const scale = semanticFieldContributionScale(entry.id);
      return {
        valueMm: Math.max(0, influence.valueMm) * scale,
        releaseWeight: influence.releaseWeight * scale,
        falloff: influence.falloff
      };
    });
  const totalMm = clamp(field.reduce((sum, item) => sum + item.valueMm, 0), 0, 5.8);
  return {
    labelId: localLabelId,
    actionType: clinicalRuleFor(localLabelId).actionType,
    weight: semanticRuleWeight(localLabelId),
    falloff: 1,
    valueMm: totalMm,
    meters: totalMm / 1000,
    releaseWeight: field.reduce((sum, item) => sum + item.releaseWeight, 0)
  };
}

function semanticFieldSpreadMultiplier(labelId) {
  if (labelId === 'posterior_soft_tissue') return 2.75;
  if (['anterior_tibia', 'fibula_head'].includes(labelId)) return 2.05;
  if (labelId === 'distal_end') return 1.45;
  return 1.4;
}

function semanticFieldContributionScale(labelId) {
  if (labelId === 'posterior_soft_tissue') return 0.86;
  if (['anterior_tibia', 'fibula_head'].includes(labelId)) return 0.92;
  return 1;
}

function clinicalRuleFor(labelId) {
  return CLINICAL_RULES[labelId] || CLINICAL_RULES.general_soft_tissue;
}

function semanticSummaryEntry(labelId) {
  return semanticMap?.summary?.find((entry) => entry.id === labelId) || null;
}

function semanticGaussianFalloff(labelId, t, theta, spreadMultiplier = 1) {
  const rule = clinicalRuleFor(labelId);
  const entry = semanticSummaryEntry(labelId);
  if (!entry || rule.actionType === 'neutral') return 0;

  let centerY = entry.y;
  if (labelId === 'distal_end') centerY = Math.min(centerY, 0.08);
  if (labelId === 'proximal_brim') centerY = Math.max(centerY, 0.88);

  const thetaNorm = ((theta / (Math.PI * 2)) % 1 + 1) % 1;
  const dy = (t - centerY) / Math.max(0.04, rule.axialSigma * spreadMultiplier);
  const dTheta = circularDistance(thetaNorm, entry.theta) / Math.max(0.03, rule.angularSigma * spreadMultiplier);
  const axial = Math.exp(-0.5 * dy * dy);
  const angular = ['distal_end', 'proximal_brim'].includes(labelId) ? 1 : Math.exp(-0.5 * dTheta * dTheta);
  return clamp(axial * angular, 0, 1);
}

function semanticRuleWeight(labelId) {
  const rule = clinicalRuleFor(labelId);
  if (rule.actionType === 'neutral') return 0;
  const patient = patientContext();
  const uiReliefWeight = clamp(Number(controls.relief?.value || 0) / Math.max(1, Math.abs(rule.maxDeformationMm)), 0, 1);
  const geminiWeight = geminiRefinement?.semanticWeights?.[labelId];
  let weight = Number.isFinite(geminiWeight) ? geminiWeight : rule.defaultWeight;

  if (['anterior_tibia', 'fibula_head'].includes(labelId)) {
    weight *= patient.sensitivityCoeff;
    weight = Math.max(weight, 0.28 + uiReliefWeight * 0.38);
  }
  if (labelId === 'posterior_soft_tissue') weight *= patient.stabilityCoeff;
  if (labelId === 'distal_end') weight *= patient.distalContainmentCoeff;
  if (labelId === 'proximal_brim') weight *= patient.proximalStabilityCoeff;

  return clamp(weight, rule.minWeight, rule.maxWeight);
}

function semanticActionEstimate(labelId) {
  const rule = clinicalRuleFor(labelId);
  const weight = semanticRuleWeight(labelId);
  const geometryMaxMm = labelId === 'posterior_soft_tissue' ? 0 : rule.maxDeformationMm;
  return {
    target_region: labelId,
    label: SEMANTIC_LABELS[labelId]?.label || labelId,
    action: labelId === 'posterior_soft_tissue' ? 'support_reference' : rule.actionType,
    maxDeformationMm: geometryMaxMm,
    weight,
    valueMm: Number((geometryMaxMm * weight).toFixed(1)),
    vectorDirection: rule.vectorDirection
  };
}

function patientContext() {
  const activityLevel = controls.activityLevel?.value || 'K3';
  const bodyWeightKg = Number(controls.bodyWeight?.value || 70);
  const tissueFirmness = controls.tissueFirmness?.value || 'balanced';
  const weightLoad = clamp((bodyWeightKg - 65) / 45, -0.35, 0.9);
  const activityMap = {
    K2: { stability: 0.82, containment: 0.2, proximal: 0.88 },
    K3: { stability: 1.0, containment: -0.15, proximal: 1.0 },
    K4: { stability: 1.16, containment: -0.35, proximal: 1.12 }
  };
  const tissueMap = {
    firm: { sensitivity: 0.86, distal: 0.88, stability: 1.1, containment: -0.2 },
    balanced: { sensitivity: 1.0, distal: 1.0, stability: 1.0, containment: 0 },
    fleshy: { sensitivity: 1.22, distal: 1.26, stability: 0.86, containment: 0.45 }
  };
  const activity = activityMap[activityLevel] || activityMap.K3;
  const tissue = tissueMap[tissueFirmness] || tissueMap.balanced;
  return {
    activityLevel,
    bodyWeightKg,
    tissueFirmness,
    stabilityCoeff: activity.stability * tissue.stability,
    sensitivityCoeff: tissue.sensitivity + Math.max(0, weightLoad) * 0.16,
    distalContainmentCoeff: tissue.distal + Math.max(0, weightLoad) * 0.1,
    proximalStabilityCoeff: activity.proximal,
    globalContainmentMm: activity.containment + tissue.containment - Math.max(0, weightLoad) * 0.12,
    weightLoad: Number(weightLoad.toFixed(2))
  };
}

function applySemanticColorsToLimb(mesh, map = semanticMap) {
  if (!mesh || !map) return;
  const geometry = mesh.geometry;
  const pos = geometry.attributes.position;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const spanY = Math.max(0.001, box.max.y - box.min.y);
  const colors = [];

  for (let i = 0; i < pos.count; i += 1) {
    let labelId = map.vertexLabels?.[i];
    if (!labelId) {
      const yNorm = (pos.getY(i) - box.min.y) / spanY;
      const sectionIndex = Math.round(yNorm * (map.sectionLabels.length - 1));
      const row = map.sectionLabels[Math.min(map.sectionLabels.length - 1, Math.max(0, sectionIndex))] || [];
      const section = modelProfile?.[sectionIndex];
      const centerX = section?.centerX || 0;
      const centerZ = section?.centerZ || 0;
      const thetaNorm = ((Math.atan2(pos.getZ(i) - centerZ, pos.getX(i) - centerX) / (Math.PI * 2)) + 1) % 1;
      const angularIndex = Math.min(PROFILE_SEGMENTS - 1, Math.floor(thetaNorm * PROFILE_SEGMENTS));
      labelId = row[angularIndex] || 'general_soft_tissue';
    }
    const target = new THREE.Color(SEMANTIC_LABELS[labelId].color);
    const base = new THREE.Color(0xd7b18f);
    const color = controls.semanticToggle?.checked ? base.lerp(target, 0.62) : base;
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.attributes.color.needsUpdate = true;
  mesh.material.needsUpdate = true;
}

function renderSemanticTags() {
  if (!semanticTags) return;
  if (!semanticMap) {
    semanticTags.innerHTML = '<div class="empty">导入残肢模型后，系统会自动完成语义标签分割。</div>';
    return;
  }

  const rows = semanticMap.summary
    .filter((entry) => entry.ratio > 0.01 || ['anterior_tibia', 'fibula_head'].includes(entry.id))
    .map((entry) => {
      const config = SEMANTIC_LABELS[entry.id];
      const action = semanticActionEstimate(entry.id);
      return `
        <div class="semantic-chip">
          <span class="semantic-swatch" style="background:#${config.color.toString(16).padStart(6, '0')}"></span>
          <span>
            <strong>${escapeHtml(config.label)} · ${Math.round(entry.ratio * 100)}%</strong>
            <br>${escapeHtml(config.description)}
            <br><em>${action.action} · W=${action.weight.toFixed(2)} · ${action.valueMm >= 0 ? '+' : ''}${action.valueMm.toFixed(1)} mm</em>
          </span>
        </div>
      `;
    })
    .join('');

  semanticTags.innerHTML = `
    <div class="semantic-status">
      <strong>曲率拓扑语义分割完成</strong>
      <span>置信度 ${Math.round(semanticMap.confidence * 100)}% · ${semanticMap.labelCount} 类标签 · 平滑 Vertex Groups</span>
    </div>
    <div class="semantic-list">${rows}</div>
  `;
}

function recordSocketVersion(source, options = {}) {
  if (!socketMesh) return null;
  const previous = selectedVersion() || socketVersions.at(-1) || null;
  const snapshot = {
    id: `V${nextVersionNumber++}`,
    source,
    createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    geometry: socketMesh.geometry.clone(),
    params: {
      offsetMm: Number(controls.offset.value),
      trimPercent: Number(controls.trim.value),
      reliefMm: Number(controls.relief.value),
      distalMm: Number(controls.distal.value)
    },
    patient: patientContext(),
    semanticActions: currentGenerationMeta?.semanticActions || [],
    volumeConservation: currentGenerationMeta?.volumeConservation || null,
    generationMeta: structuredCloneSafe(currentGenerationMeta),
    geminiRefinement: structuredCloneSafe(geminiRefinement),
    riskZones: structuredCloneSafe(currentRiskZones),
    manual: Boolean(options.manual)
  };
  snapshot.delta = previous ? {
    offsetMm: snapshot.params.offsetMm - previous.params.offsetMm,
    trimPercent: snapshot.params.trimPercent - previous.params.trimPercent,
    reliefMm: snapshot.params.reliefMm - previous.params.reliefMm,
    distalMm: snapshot.params.distalMm - previous.params.distalMm,
    volumeMm3: (snapshot.volumeConservation?.releasedMm3 || 0) - (previous.volumeConservation?.releasedMm3 || 0)
  } : null;
  socketVersions.push(snapshot);
  while (socketVersions.length > 8) {
    const removed = socketVersions.shift();
    removed.geometry?.dispose?.();
  }
  selectedVersionId = snapshot.id;
  renderVersionDelta();
  renderSidebarVersions();
  updateMetrics(true);
  return snapshot;
}

function selectedVersion() {
  return socketVersions.find((version) => version.id === selectedVersionId) || socketVersions.at(-1) || null;
}

function structuredCloneSafe(value) {
  if (!value) return value;
  try {
    return structuredClone(value);
  } catch (_error) {
    return JSON.parse(JSON.stringify(value));
  }
}

function disposeSocketVersions() {
  socketVersions.forEach((version) => version.geometry?.dispose?.());
  socketVersions = [];
  selectedVersionId = null;
  nextVersionNumber = 1;
}

function renderVersionDelta() {
  if (!versionDelta) return;
  const latest = selectedVersion();
  if (!latest) {
    versionDelta.innerHTML = '<div class="empty">生成接受腔后，系统会记录版本参数与体积补偿 Delta。</div>';
    return;
  }

  const delta = latest.delta;
  const volume = latest.volumeConservation || { removedMm3: 0, releasedMm3: 0, compensationMm: 0 };
  const deltaText = delta
    ? `包容 ${signed(delta.offsetMm)} mm；减压 ${signed(delta.reliefMm)} mm；末端 ${signed(delta.distalMm)} mm；补偿体积 ${signed(delta.volumeMm3)} mm³`
    : '首版基线已建立，后续版本会显示与上一版的差异。';
  const actions = latest.semanticActions
    .filter((action) => Math.abs(action.valueMm) > 0.1)
    .slice(0, 4)
    .map((action) => `<span>${escapeHtml(action.label)} ${action.action} ${signed(action.valueMm)} mm</span>`)
    .join('');

  versionDelta.innerHTML = `
    <div class="delta-head">
      <strong>${latest.id} · ${escapeHtml(latest.source)}</strong>
      <span>${latest.createdAt}</span>
    </div>
    <div class="delta-body">
      <p>${deltaText}</p>
      <p>体积守恒：承重区回收 ${volume.removedMm3} mm³，减压/边缘释放 ${volume.releasedMm3} mm³，平均补偿 ${volume.compensationMm} mm。</p>
      <div class="delta-tags">${actions}</div>
    </div>
  `;
}

function normalizeImportedMesh(mesh) {
  const targetMesh = mesh.isMesh ? mesh : firstMesh(mesh);
  if (!targetMesh) return mesh;
  const geometry = targetMesh.geometry.clone();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();

  alignPrincipalAxisToY(geometry);

  geometry.computeBoundingBox();
  const ySize = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
  const scale = 0.42 / Math.max(ySize, 0.001);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();

  const normalizedBox = geometry.boundingBox;
  const normalizedCenter = normalizedBox.getCenter(new THREE.Vector3());
  geometry.translate(-normalizedCenter.x, -normalizedBox.min.y, -normalizedCenter.z);
  orientOpenEndUp(geometry);
  geometry.computeVertexNormals();

  const normalized = new THREE.Mesh(geometry, limbMaterial);
  normalized.name = mesh.name || '导入残肢扫描';
  normalized.castShadow = true;
  normalized.receiveShadow = true;
  normalized.renderOrder = 1;
  return normalized;
}

function firstMesh(object) {
  let found = null;
  object.traverse((child) => {
    if (!found && child.isMesh) found = child;
  });
  return found;
}

function alignPrincipalAxisToY(geometry) {
  const axis = principalAxis(geometry);
  if (!axis || axis.lengthSq() < 0.001) return;
  axis.normalize();
  const target = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, target);
  geometry.applyQuaternion(quaternion);
}

function principalAxis(geometry) {
  const pos = geometry.attributes.position;
  const stride = Math.max(1, Math.floor(pos.count / 9000));
  const points = [];
  const mean = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += stride) {
    const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    points.push(p);
    mean.add(p);
  }
  if (!points.length) return new THREE.Vector3(0, 1, 0);
  mean.multiplyScalar(1 / points.length);

  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  points.forEach((p) => {
    const x = p.x - mean.x;
    const y = p.y - mean.y;
    const z = p.z - mean.z;
    cov[0][0] += x * x; cov[0][1] += x * y; cov[0][2] += x * z;
    cov[1][0] += y * x; cov[1][1] += y * y; cov[1][2] += y * z;
    cov[2][0] += z * x; cov[2][1] += z * y; cov[2][2] += z * z;
  });

  let v = new THREE.Vector3(0.43, 0.71, 0.56).normalize();
  for (let i = 0; i < 28; i += 1) {
    const next = new THREE.Vector3(
      cov[0][0] * v.x + cov[0][1] * v.y + cov[0][2] * v.z,
      cov[1][0] * v.x + cov[1][1] * v.y + cov[1][2] * v.z,
      cov[2][0] * v.x + cov[2][1] * v.y + cov[2][2] * v.z
    );
    if (next.lengthSq() < 1e-12) break;
    v = next.normalize();
  }
  return v;
}

function orientOpenEndUp(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const boundaryY = detectOpenBoundaryY(geometry);
  if (boundaryY != null && boundaryY < (box.min.y + box.max.y) / 2) {
    flipGeometryY(geometry);
    return;
  }

  const pos = geometry.attributes.position;
  const bottom = [];
  const top = [];
  const span = box.max.y - box.min.y;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (y < box.min.y + span * 0.08) bottom.push(r);
    if (y > box.max.y - span * 0.08) top.push(r);
  }
  const bottomRadius = bottom.length ? percentile(bottom, 0.82) : 0;
  const topRadius = top.length ? percentile(top, 0.82) : 0;
  if (bottomRadius > topRadius * 1.04) flipGeometryY(geometry);
}

function detectOpenBoundaryY(geometry) {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = nonIndexed.attributes.position;
  const edges = new Map();
  const quantize = (value) => Math.round(value * 100000);
  const vertexKey = (i) => `${quantize(pos.getX(i))},${quantize(pos.getY(i))},${quantize(pos.getZ(i))}`;

  for (let i = 0; i < pos.count; i += 3) {
    const keys = [vertexKey(i), vertexKey(i + 1), vertexKey(i + 2)];
    [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
      const edgeKey = keys[a] < keys[b] ? `${keys[a]}|${keys[b]}` : `${keys[b]}|${keys[a]}`;
      const edge = edges.get(edgeKey) || { count: 0, y: [] };
      edge.count += 1;
      edge.y.push(pos.getY(i + a), pos.getY(i + b));
      edges.set(edgeKey, edge);
    });
  }

  if (nonIndexed !== geometry) nonIndexed.dispose();
  const boundaryY = [];
  edges.forEach((edge) => {
    if (edge.count === 1) boundaryY.push(...edge.y);
  });
  if (boundaryY.length < 12) return null;
  return percentile(boundaryY, 0.5);
}

function flipGeometryY(geometry) {
  geometry.rotateZ(Math.PI);
  geometry.computeBoundingBox();
  const nextBox = geometry.boundingBox;
  const nextCenter = nextBox.getCenter(new THREE.Vector3());
  geometry.translate(-nextCenter.x, -nextBox.min.y, -nextCenter.z);
}

function setLimb(mesh, profile = null) {
  if (limbMesh) scene.remove(limbMesh);
  if (socketMesh) scene.remove(socketMesh);
  if (wireMesh) scene.remove(wireMesh);
  heatGroup.clear();
  clearPaintMarkers();
  socketMesh = null;
  wireMesh = null;
  currentRiskZones = [];
  semanticMap = null;
  currentGenerationMeta = null;
  disposeSocketVersions();
  geminiRefinement = null;
  completedWorkflowSteps = new Set();
  limbMesh = mesh;
  scene.add(limbMesh);
  modelProfile = profile || profileFromGeometry(mesh);
  semanticMap = buildSemanticMap(modelProfile, limbMesh);
  applySmartDefaultTrim(modelProfile);
  applySemanticColorsToLimb(limbMesh, semanticMap);
  renderSemanticTags();
  renderVersionDelta();
  renderSidebarVersions();
  metrics = calculateMetrics(modelProfile);
  updateMetrics(false);
  setAiState('待生成');
  recommendations.innerHTML = '<div class="empty">残肢模型已载入，AI 语义标签已生成。点击“算法生成接受腔”，系统会按不同标签自动匹配包容、减压和承重调整。</div>';
  geminiResult.innerHTML = '<span class="eyebrow">大模型复核</span><div class="empty">生成初版后，可调用 Gemini 分析参数、预览图和风险区，返回结构化校正结果。</div>';
  activateStep('landmarks', { complete: ['scan'] });
}

function applySmartDefaultTrim(profile) {
  if (!controls.trim || controls.trim.dataset.userChanged === 'true') return;
  controls.trim.min = '50';
  controls.trim.max = '90';
  const suggested = suggestTrimPercent(profile);
  controls.trim.value = String(suggested);
  updateOutputs();
}

function suggestTrimPercent(profile) {
  if (!profile?.length) return 70;
  const upper = profile.slice(Math.floor(profile.length * 0.62));
  if (upper.length < 6) return 70;
  const radii = upper.map((section) => section.r || averageSectionRadius(section));
  const maxR = Math.max(...radii);
  const lastR = radii.at(-1) || maxR;
  const taper = maxR > 0 ? lastR / maxR : 1;
  if (taper < 0.68) return 66;
  if (taper > 0.9) return 74;
  return 70;
}

function loadSample() {
  const profile = sampleLimbProfile();
  const geometry = createRevolvedGeometry(profile, 96);
  const mesh = new THREE.Mesh(geometry, limbMaterial);
  mesh.name = '示例残肢扫描';
  setLimb(mesh, profile);
}

function calculateMetrics(profile) {
  const height = profile.at(-1).y - profile[0].y;
  const allRadii = profile.flatMap((p) => (Array.isArray(p.radii) ? p.radii : [p.r]));
  const maxRadius = Math.max(...allRadii);
  const avgRadius = allRadii.reduce((sum, r) => sum + r, 0) / allRadii.length;
  return {
    height,
    maxRadius,
    avgRadius,
    circumference: Math.PI * 2 * maxRadius
  };
}

function generateSocket() {
  if (!modelProfile) loadSample();
  setAiState('分析中');
  activateStep('ai');
  clearPaintMarkers();

  window.setTimeout(() => {
    const geometry = createSocketGeometry();
    if (socketMesh) scene.remove(socketMesh);
    if (wireMesh) scene.remove(wireMesh);
    socketMesh = new THREE.Mesh(geometry, socketMaterial);
    socketMesh.renderOrder = 2;
    socketMesh.name = 'AI 初始接受腔';
    wireMesh = new THREE.Mesh(geometry.clone(), wireMaterial);
    wireMesh.renderOrder = 3;
    wireMesh.visible = controls.wireToggle.checked;
    scene.add(socketMesh, wireMesh);
    currentRiskZones = defaultRiskZones();
    clearPaintUndoStack();
    buildHeatZones();
    if (sectionMode) applySectionClipping();
    setAiState('已生成');
    updateRecommendations();
    updateMetrics(true);
    recordSocketVersion('算法生成');
    activateStep('ai', { complete: ['scan', 'landmarks'], uncomplete: ['ai', 'edit', 'export'] });
    hint.textContent = 'AI 初版已生成。打开“局部减压画笔”后，在接受腔表面点击可添加局部外扩修形。';
  }, 420);
}

function refreshSocketGeometry() {
  if (!socketMesh) return;
  const geometry = createSocketGeometry();
  socketMesh.geometry.dispose();
  socketMesh.geometry = geometry;
  clearPaintUndoStack();
  clearPaintMarkers();
  if (wireMesh) {
    wireMesh.geometry.dispose();
    wireMesh.geometry = geometry.clone();
  }
  buildHeatZones();
  if (sectionMode) applySectionClipping();
  updateRecommendations();
  updateMetrics(true);
}

function createSocketGeometry() {
  const offset = Number(controls.offset.value) / 1000;
  const completedLimbProfile = completeLimbEnvelopeProfile(modelProfile);
  const socketProfileSource = prepareSocketBaseProfile(completedLimbProfile);
  const requestedTrim = Number(controls.trim.value) / 100;
  const trim = effectiveSocketTrimRatio(socketProfileSource, requestedTrim);
  const relief = Number(controls.relief.value) / 1000;
  const distal = Number(controls.distal.value) / 1000;
  const minY = socketProfileSource[0]?.y || 0;
  const height = Math.max(0.001, socketProfileSource.at(-1).y - minY);
  const maxY = minY + height * trim;
  const usable = socketProfileSource.filter((p) => p.y <= maxY);
  const patient = patientContext();
  const sectionStep = maxY / Math.max(1, usable.length - 1);
  const angleStep = (Math.PI * 2) / PROFILE_SEGMENTS;
  let removedVolume = 0;
  let releaseDenominator = 0;
  const rawSections = usable.map((p, sectionIndex) => {
    const t = p.y / Math.max(maxY, 0.001);
    const brimClearance = 0.00035 * smoothStep(0.82, 1, t);
    const distalCup = distal * Math.max(0, 1 - t / 0.22) ** 2;
    const reliefBand = relief * Math.exp(-(((t - 0.52) / 0.19) ** 2));
    const sourceRadii = Array.isArray(p.radii)
      ? p.radii
      : Array.from({ length: PROFILE_SEGMENTS }, () => p.r);
    const samples = sourceRadii.map((r, index) => {
      const theta = (index / sourceRadii.length) * Math.PI * 2;
      const anteriorRelief = reliefBand * Math.max(0, Math.cos(theta)) ** 8;
      const medialLateralEase = relief * 0.16 * Math.max(0, Math.sin(theta) ** 2) * Math.exp(-(((t - 0.62) / 0.24) ** 2));
      const labelId = semanticLabelAt(sectionIndex, Math.round((index / sourceRadii.length) * PROFILE_SEGMENTS));
      const semanticRule = semanticSocketGeometryDeformation(labelId, t, theta);
      const semanticBias = Math.max(0, semanticRule.meters);
      const releaseWeight = volumeReleaseWeight(labelId, t, semanticRule);
      if (semanticBias < 0) removedVolume += Math.max(0, -r * semanticBias * angleStep * sectionStep);
      if (releaseWeight > 0) releaseDenominator += Math.max(MIN_SECTION_RADIUS, r) * angleStep * sectionStep * releaseWeight;
      return {
        radius: r,
        theta,
        labelId,
        releaseWeight,
        ruleWeight: semanticRule.weight,
        baseRadius: r + offset + brimClearance + distalCup + anteriorRelief + medialLateralEase + semanticBias
      };
    });
    return {
      y: p.y,
      centerX: p.centerX || 0,
      centerZ: p.centerZ || 0,
      samples
    };
  });

  const compensationUnit = releaseDenominator > 0 ? removedVolume / releaseDenominator : 0;
  const unsmoothedProfile = rawSections.map((section) => {
    const radii = section.samples.map((sample) => {
      const compensation = clamp(compensationUnit * sample.releaseWeight, 0, 0.0024);
      return Math.max(MIN_SECTION_RADIUS, sample.baseRadius + compensation);
    });
    return {
      y: section.y,
      centerX: section.centerX,
      centerZ: section.centerZ,
      radii,
      r: radii.reduce((sum, value) => sum + value, 0) / radii.length
    };
  });
  const envelopeProfile = preventInwardProximalTaper(unsmoothedProfile);
  const contourProfile = extendProximalAlongLimbContour(envelopeProfile, socketProfileSource, trim);
  const fairedProfile = fairClinicalSocketProfile(contourProfile);
  const smoothedProfile = smoothSocketProfileRadii(fairedProfile, 8);
  const profile = enforceSocketContainsLimb(smoothedProfile, completedLimbProfile, offset);

  currentGenerationMeta = {
    patient,
    volumeConservation: {
      removedMm3: Math.round(removedVolume * 1e9),
      releasedMm3: Math.round(Math.min(removedVolume, releaseDenominator * compensationUnit) * 1e9),
      compensationMm: Number((compensationUnit * 1000).toFixed(2))
    },
    trim: {
      requestedPercent: Math.round(requestedTrim * 100),
      appliedPercent: Math.round(trim * 100)
    },
    semanticActions: summarizeSemanticActions()
  };
  return createSectionedGeometry(profile, PROFILE_SEGMENTS, { closeDistal: true });
}

function effectiveSocketTrimRatio(profile, requestedTrim) {
  if (!profile?.length) return clamp(requestedTrim, 0.5, 0.9);
  const hardCap = 0.9;
  const softFloor = 0.5;
  return clamp(requestedTrim, softFloor, hardCap);
}

function completeLimbEnvelopeProfile(profile) {
  let result = profile.map((section) => ({
    ...section,
    radii: Array.isArray(section.radii)
      ? [...section.radii]
      : Array.from({ length: PROFILE_SEGMENTS }, () => section.r)
  }));

  result = result.map((section) => {
    const closed = smoothCircular(maxFilterCircular(section.radii, 7), 4);
    const localMean = closed.reduce((sum, radius) => sum + radius, 0) / closed.length;
    const radii = section.radii.map((radius, j) => {
      const completed = Math.max(radius, closed[j] * 0.965, localMean * 0.84);
      return Math.max(MIN_SECTION_RADIUS, completed);
    });
    return {
      ...section,
      radii,
      r: radii.reduce((sum, radius) => sum + radius, 0) / radii.length
    };
  });

  for (let pass = 0; pass < 4; pass += 1) {
    result = result.map((section, i) => {
      const prev = result[Math.max(0, i - 1)];
      const next = result[Math.min(result.length - 1, i + 1)];
      const radii = section.radii.map((radius, j) => {
        const axialEnvelope = Math.max(prev.radii[j], radius, next.radii[j]) * 0.982;
        return Math.max(radius, axialEnvelope);
      });
      return {
        ...section,
        centerX: prev.centerX * 0.18 + section.centerX * 0.64 + next.centerX * 0.18,
        centerZ: prev.centerZ * 0.18 + section.centerZ * 0.64 + next.centerZ * 0.18,
        radii,
        r: radii.reduce((sum, value) => sum + value, 0) / radii.length
      };
    });
  }

  result = smoothProfileSections(result, 4);
  return result.map((section) => {
    const closed = smoothCircular(maxFilterCircular(section.radii, 4), 3);
    const radii = section.radii.map((radius, j) => Math.max(radius, closed[j] * 0.975));
    return {
      ...section,
      radii,
      r: radii.reduce((sum, value) => sum + value, 0) / radii.length
    };
  });
}

function maxFilterCircular(values, radius = 3) {
  return values.map((_value, index) => {
    let maxValue = -Infinity;
    for (let step = -radius; step <= radius; step += 1) {
      const j = (index + step + values.length) % values.length;
      maxValue = Math.max(maxValue, values[j]);
    }
    return maxValue;
  });
}

function prepareSocketBaseProfile(profile) {
  let result = profile.map((section) => ({
    ...section,
    radii: Array.isArray(section.radii)
      ? [...section.radii]
      : Array.from({ length: PROFILE_SEGMENTS }, () => section.r)
  }));
  result = smoothProfileSections(result, 10);
  result = result.map((section, i) => {
    const t = i / Math.max(1, result.length - 1);
    const preserveProximalContour = smoothStep(0.55, 1, t);
    const fairStrength = smoothStep(0.12, 0.92, t);
    const circular = smoothCircular(section.radii, preserveProximalContour > 0.35 ? 3 : 8);
    const mean = circular.reduce((sum, radius) => sum + radius, 0) / circular.length;
    const meanBlend = fairStrength * THREE.MathUtils.lerp(0.24, 0.06, preserveProximalContour);
    const radii = circular.map((radius) => THREE.MathUtils.lerp(radius, mean, meanBlend));
    return {
      ...section,
      radii,
      r: radii.reduce((sum, radius) => sum + radius, 0) / radii.length
    };
  });
  result = smoothProfileSections(result, 5);
  return result;
}

function extendProximalAlongLimbContour(socketProfile, sourceProfile, trimRatio) {
  if (!socketProfile.length || !sourceProfile?.length) return socketProfile;
  const result = socketProfile.map((section) => ({ ...section, radii: [...section.radii] }));
  const startRatio = trimRatio > 0.74 ? 0.66 : 0.72;
  const startIndex = Math.min(result.length - 1, Math.max(2, Math.round((result.length - 1) * startRatio)));
  const anchor = result[startIndex];
  const prev = result[Math.max(0, startIndex - 5)];
  const centerSlopeX = ((anchor.centerX || 0) - (prev.centerX || 0)) / Math.max(1, startIndex - Math.max(0, startIndex - 5));
  const centerSlopeZ = ((anchor.centerZ || 0) - (prev.centerZ || 0)) / Math.max(1, startIndex - Math.max(0, startIndex - 5));
  const anchorMean = averageSectionRadius(anchor);
  const prevMean = averageSectionRadius(prev);
  const meanSlope = (anchorMean - prevMean) / Math.max(1, startIndex - Math.max(0, startIndex - 5));
  const anchorRadii = smoothCircular(anchor.radii, 5);

  for (let i = startIndex + 1; i < result.length; i += 1) {
    const t = i / Math.max(1, result.length - 1);
    const follow = smoothStep(startRatio, 1, t) * 0.24;
    const steps = i - startIndex;
    const projectedMean = Math.max(MIN_SECTION_RADIUS, anchorMean + meanSlope * steps);
    const sectionMean = averageSectionRadius(result[i]);
    const meanScale = projectedMean / Math.max(anchorMean, MIN_SECTION_RADIUS);
    const projectedRadii = anchorRadii.map((radius) => radius * meanScale);
    const radii = result[i].radii.map((radius, j) => {
      const contourRadius = projectedRadii[j % projectedRadii.length];
      const blended = THREE.MathUtils.lerp(radius, contourRadius, follow);
      const maxJump = Math.max(0.0035, sectionMean * 0.07);
      return clamp(blended, radius - maxJump * 0.55, radius + maxJump);
    });
    result[i] = {
      ...result[i],
      centerX: THREE.MathUtils.lerp(result[i].centerX || 0, (anchor.centerX || 0) + centerSlopeX * steps, follow * 0.75),
      centerZ: THREE.MathUtils.lerp(result[i].centerZ || 0, (anchor.centerZ || 0) + centerSlopeZ * steps, follow * 0.75),
      radii,
      r: radii.reduce((sum, radius) => sum + radius, 0) / radii.length
    };
  }
  return result;
}

function averageSectionRadius(section) {
  if (!section) return MIN_SECTION_RADIUS;
  const radii = Array.isArray(section.radii) && section.radii.length ? section.radii : [section.r || MIN_SECTION_RADIUS];
  return radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
}

function preventInwardProximalTaper(profile) {
  if (!profile.length) return profile;
  const result = profile.map((section) => ({ ...section, radii: [...section.radii] }));
  const startT = 0.58;

  for (let i = 1; i < result.length; i += 1) {
    const t = i / Math.max(1, result.length - 1);
    const guard = smoothStep(startT, 0.92, t);
    const section = result[i];
    const radii = section.radii.map((radius, j) => {
      if (guard <= 0) return radius;
      const prev = result[i - 1].radii[j];
      const localMin = prev - 0.012;
      return Math.max(radius, THREE.MathUtils.lerp(radius, localMin, guard * 0.05));
    });
    result[i] = {
      ...section,
      radii,
      r: radii.reduce((sum, value) => sum + value, 0) / radii.length
    };
  }
  return result;
}

function fairClinicalSocketProfile(profile) {
  let result = profile.map((section) => ({ ...section, radii: [...section.radii] }));
  result = smoothSocketProfileRadii(result, 3);
  result = result.map((section, i) => {
    const t = i / Math.max(1, result.length - 1);
    const preserveProximalContour = smoothStep(0.66, 1, t);
    const upperBlend = smoothStep(0.38, 0.86, t) * (1 - preserveProximalContour * 0.72);
    const sectionMean = section.radii.reduce((sum, radius) => sum + radius, 0) / section.radii.length;
    const circumferentialEnvelope = smoothCircular(section.radii, preserveProximalContour > 0.35 ? 2 : 5);
    const radii = section.radii.map((radius, j) => {
      const fairRadius = circumferentialEnvelope[j] * 0.86 + sectionMean * 0.14;
      return THREE.MathUtils.lerp(radius, fairRadius, upperBlend * 0.48);
    });
    return {
      ...section,
      radii,
      r: radii.reduce((sum, value) => sum + value, 0) / radii.length
    };
  });

  for (let i = 1; i < result.length; i += 1) {
    const t = i / Math.max(1, result.length - 1);
    const preserveProximalContour = smoothStep(0.66, 1, t);
    const upperGuard = smoothStep(0.42, 0.9, t) * (1 - preserveProximalContour * 0.85);
    const prev = result[i - 1];
    const radii = result[i].radii.map((radius, j) => {
      const localMin = (prev.radii[j] || radius) - 0.011;
      const guarded = Math.max(radius, THREE.MathUtils.lerp(radius, localMin, upperGuard * 0.08));
      return Math.max(MIN_SECTION_RADIUS, guarded);
    });
    result[i] = {
      ...result[i],
      radii,
      r: radii.reduce((sum, value) => sum + value, 0) / radii.length
    };
  }
  return result;
}

function enforceSocketContainsLimb(socketProfile, limbProfile, offsetMeters) {
  if (!socketProfile.length || !limbProfile?.length) return socketProfile;
  const clearance = clamp(offsetMeters * 0.18, 0.00035, 0.0012);
  return socketProfile.map((section) => {
    const limbSection = nearestProfileSection(limbProfile, section.y);
    const limbRadii = Array.isArray(limbSection.radii)
      ? limbSection.radii
      : Array.from({ length: section.radii.length }, () => limbSection.r || 0);
    const limbMean = limbRadii.reduce((sum, value) => sum + value, 0) / limbRadii.length;
    const limbFair = smoothCircular(limbRadii, 6);
    const radii = section.radii.map((radius, j) => {
      const limbIndex = Math.min(
        limbRadii.length - 1,
        Math.round((j / Math.max(1, section.radii.length - 1)) * Math.max(0, limbRadii.length - 1))
      );
      const theta = (j / section.radii.length) * Math.PI * 2;
      const limbTheta = (limbIndex / limbRadii.length) * Math.PI * 2;
      const labelId = semanticLabelAt(
        profileSectionIndexFromY(limbProfile, limbSection.y),
        Math.round((j / section.radii.length) * PROFILE_SEGMENTS)
      );
      const isPosteriorSupport = labelId === 'posterior_soft_tissue';
      const isSensitiveRelief = labelId === 'anterior_tibia' || labelId === 'fibula_head' || labelId === 'distal_end';
      const isProximal = section.y > socketProfile[Math.floor(socketProfile.length * 0.62)]?.y;
      const rawLimbRadius = limbRadii[limbIndex] || limbSection.r || 0;
      const fairLimbRadius = THREE.MathUtils.lerp(limbFair[limbIndex] || rawLimbRadius, limbMean, isPosteriorSupport ? 0.62 : 0.12);
      const limbRadius = isPosteriorSupport
        ? Math.min(rawLimbRadius, fairLimbRadius + 0.0015)
        : rawLimbRadius;
      const limbX = (limbSection.centerX || 0) + Math.cos(limbTheta) * limbRadius;
      const limbZ = (limbSection.centerZ || 0) + Math.sin(limbTheta) * limbRadius;
      const projectedRadius = Math.hypot(limbX - (section.centerX || 0), limbZ - (section.centerZ || 0));
      const directionalGuard = (isPosteriorSupport ? 0.00005 : 0.00022) * Math.max(0, Math.cos(theta - limbTheta));
      const minRadius = projectedRadius + clearance + directionalGuard;
      if (isPosteriorSupport) return Math.max(radius, Math.min(minRadius, radius + 0.00035));
      if (isProximal && !isSensitiveRelief) return Math.max(radius, Math.min(minRadius, radius + 0.00055));
      return Math.max(radius, minRadius);
    });
    const faired = smoothCircular(radii, 2).map((radius, j) => {
      const labelId = semanticLabelAt(
        profileSectionIndexFromY(limbProfile, limbSection.y),
        Math.round((j / section.radii.length) * PROFILE_SEGMENTS)
      );
      return labelId === 'posterior_soft_tissue' ? Math.max(radius, radii[j] - 0.0008) : Math.max(radius, radii[j]);
    });
    return {
      ...section,
      radii: faired,
      r: faired.reduce((sum, value) => sum + value, 0) / faired.length
    };
  });
}

function profileSectionIndexFromY(profile, y) {
  if (!profile?.length) return 0;
  let bestIndex = 0;
  let bestDistance = Math.abs((profile[0]?.y || 0) - y);
  for (let i = 1; i < profile.length; i += 1) {
    const distance = Math.abs(profile[i].y - y);
    if (distance < bestDistance) {
      bestIndex = i;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function nearestProfileSection(profile, y) {
  let best = profile[0];
  let bestDistance = Math.abs((best?.y || 0) - y);
  for (let i = 1; i < profile.length; i += 1) {
    const distance = Math.abs(profile[i].y - y);
    if (distance < bestDistance) {
      best = profile[i];
      bestDistance = distance;
    }
  }
  return best;
}

function smoothSocketProfileRadii(profile, passes = 1) {
  let current = profile.map((section) => ({ ...section, radii: [...section.radii] }));
  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((section, i) => {
      const radii = section.radii.map((value, j) => {
        const prevJ = (j - 1 + section.radii.length) % section.radii.length;
        const nextJ = (j + 1) % section.radii.length;
        const prevSection = current[Math.max(0, i - 1)];
        const nextSection = current[Math.min(current.length - 1, i + 1)];
        const angularAvg = (section.radii[prevJ] + section.radii[nextJ]) * 0.5;
        const axialAvg = (prevSection.radii[j] + nextSection.radii[j]) * 0.5;
        return Math.max(MIN_SECTION_RADIUS, value * 0.56 + angularAvg * 0.28 + axialAvg * 0.16);
      });
      return {
        ...section,
        radii,
        r: radii.reduce((sum, radius) => sum + radius, 0) / radii.length
      };
    });
  }
  return current;
}

function volumeReleaseWeight(labelId, t, semanticRule = null) {
  const rule = clinicalRuleFor(labelId);
  if (semanticRule) return semanticRule.releaseWeight;
  if (rule.actionType === 'relief') return rule.releasePriority;
  if (labelId === 'distal_end') return rule.releasePriority * Math.max(0, 1 - t / 0.22);
  if (labelId === 'proximal_brim') return rule.releasePriority * Math.max(0, (t - 0.78) / 0.22);
  return 0;
}

function summarizeSemanticActions() {
  if (!semanticMap?.summary) return [];
  return semanticMap.summary.map((entry) => {
    const action = semanticActionEstimate(entry.id);
    return {
      target_region: entry.id,
      label: action.label,
      action: action.action,
      maxDeformationMm: action.maxDeformationMm,
      weight: Number(action.weight.toFixed(2)),
      valueMm: action.valueMm,
      vectorDirection: action.vectorDirection,
      ratio: Number(entry.ratio.toFixed(3))
    };
  });
}

function defaultRiskZones() {
  if (semanticMap?.summary?.length) {
    const selected = ['anterior_tibia', 'fibula_head', 'distal_end', 'posterior_soft_tissue'];
    return semanticMap.summary
      .filter((entry) => selected.includes(entry.id))
      .map((entry) => ({
        id: entry.id,
        label: SEMANTIC_LABELS[entry.id].label,
        severity: SEMANTIC_LABELS[entry.id].severity,
        color: riskColorFromSeverity(SEMANTIC_LABELS[entry.id].severity),
        y: clamp(entry.y, 0.06, 0.94),
        theta: entry.theta,
        radius: entry.id === 'distal_end' ? 0.18 : entry.id === 'posterior_soft_tissue' ? 0.22 : 0.13,
        reason: SEMANTIC_LABELS[entry.id].description
      }));
  }

  return [
    {
      id: 'anterior_tibia',
      label: '胫骨前缘',
      severity: 'high',
      color: 'red',
      y: 0.52,
      theta: 0,
      radius: 0.15,
      reason: '骨性突起附近压力集中，优先进行局部减压。'
    },
    {
      id: 'distal_end',
      label: '末端承压',
      severity: 'medium',
      color: 'yellow',
      y: 0.11,
      theta: 0.5,
      radius: 0.18,
      reason: '远端区域容易形成集中承压，需要增加包容并保守试穿。'
    },
    {
      id: 'posterior_soft_tissue',
      label: '腓肠肌/软组织区',
      severity: 'low',
      color: 'green',
      y: 0.44,
      theta: 0.5,
      radius: 0.22,
      reason: '软组织可承重区域，可作为相对安全承重区。'
    }
  ];
}

function buildHeatZones() {
  heatGroup.clear();
  if (!socketMesh || !metrics) return;
  applyHeatMapToGeometry(socketMesh.geometry, controls.heatToggle.checked ? currentRiskZones : []);
  currentRiskZones.forEach((zone) => {
    const surface = surfacePointForZone(socketMesh.geometry, zone);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), heatMaterial);
    mesh.position.copy(surface.point);
    mesh.position.addScaledVector(surface.outward, 0.004);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), surface.outward);
    const zoneSize = Math.max(0.018, metrics.height * Math.max(0.06, zone.radius * 0.5));
    mesh.scale.set(zoneSize * 0.55, zoneSize, 0.009);
    mesh.material = new THREE.MeshBasicMaterial({
      color: riskColorHex(zone.color),
      transparent: true,
      opacity: zone.severity === 'high' ? 0.55 : 0.38,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    mesh.name = zone.label;
    mesh.renderOrder = 4;
    heatGroup.add(mesh);
  });
  heatGroup.visible = controls.heatToggle.checked;
}

function surfacePointForZone(geometry, zone) {
  const pos = geometry.attributes.position;
  const radialData = geometry.userData.radialData || [];
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const spanY = Math.max(0.001, box.max.y - box.min.y);
  const targetY = box.min.y + spanY * zone.y;
  let bestIndex = 0;
  let bestScore = Infinity;

  for (let i = 0; i < pos.count; i += 1) {
    const data = radialData[i] || {};
    const y = data.y ?? pos.getY(i);
    const thetaNorm = (((data.theta ?? Math.atan2(pos.getZ(i), pos.getX(i))) / (Math.PI * 2)) + 1) % 1;
    const yScore = Math.abs(y - targetY) / spanY;
    const thetaScore = circularDistance(thetaNorm, zone.theta);
    const score = yScore * 1.35 + thetaScore;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  const point = new THREE.Vector3(pos.getX(bestIndex), pos.getY(bestIndex), pos.getZ(bestIndex));
  const outward = new THREE.Vector3(point.x, 0, point.z);
  if (outward.lengthSq() < 1e-8) outward.set(Math.cos(zone.theta * Math.PI * 2), 0, Math.sin(zone.theta * Math.PI * 2));
  outward.normalize();
  return { point, outward };
}

function applyHeatMapToGeometry(geometry, zones) {
  const pos = geometry.attributes.position;
  const radialData = geometry.userData.radialData || [];
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const spanY = Math.max(0.001, box.max.y - box.min.y);
  const base = new THREE.Color(0x77b7a7);
  const safe = new THREE.Color(0x38b36f);
  const yellow = new THREE.Color(0xf3c23f);
  const red = new THREE.Color(0xe9414f);
  const colors = [];

  for (let i = 0; i < pos.count; i += 1) {
    const v = radialData[i] || {};
    const yNorm = ((v.y ?? pos.getY(i)) - box.min.y) / spanY;
    const thetaNorm = (((v.theta ?? Math.atan2(pos.getZ(i), pos.getX(i))) / (Math.PI * 2)) + 1) % 1;
    let color = base.clone();
    let strongest = 0;
    zones.forEach((zone) => {
      const dy = yNorm - zone.y;
      const dt = circularDistance(thetaNorm, zone.theta);
      const radius = Math.max(0.04, zone.radius);
      const influence = Math.exp(-((dy / radius) ** 2 + (dt / (radius * 0.8)) ** 2) * 2.4);
      if (influence > strongest) {
        strongest = influence;
        const target = zone.color === 'red' ? red : zone.color === 'yellow' ? yellow : safe;
        color = base.clone().lerp(target, Math.min(1, influence * 1.15));
      }
    });
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.attributes.color.needsUpdate = true;
}

function circularDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function riskColorHex(color) {
  if (color === 'red') return 0xe9414f;
  if (color === 'yellow') return 0xf3c23f;
  return 0x38b36f;
}

function riskColorFromSeverity(severity) {
  if (severity === 'high') return 'red';
  if (severity === 'medium') return 'yellow';
  return 'green';
}

function updateRecommendations() {
  const offset = Number(controls.offset.value);
  const relief = Number(controls.relief.value);
  const distal = Number(controls.distal.value);
  const trim = Number(controls.trim.value);
  const patient = patientContext();
  const volume = currentGenerationMeta?.volumeConservation;
  const highLabels = semanticMap?.summary
    ?.filter((entry) => entry.severity === 'high')
    .map((entry) => SEMANTIC_LABELS[entry.id].short)
    .join('、') || '当前无明显高曲率骨突';
  const baseCards = [
    ['整体包容量', `残肢最大围度约 ${Math.round(metrics.circumference * 1000)} mm，初始外扩 ${offset.toFixed(1)} mm，用于预留软组织形变与袜套空间。`, false],
    ['语义标签驱动', `AI 已识别 ${semanticMap?.labelCount || 0} 类残肢标签；${highLabels} 等高风险区会自动增加局部减压，后侧软组织区作为承重参考，不再对初版几何做向内收缩。`, true],
    ['患者画像系数', `${patient.activityLevel} 活动等级、${patient.bodyWeightKg} kg、${tissueLabel(patient.tissueFirmness)}软组织：稳定系数 ${patient.stabilityCoeff.toFixed(2)}，敏感区减压系数 ${patient.sensitivityCoeff.toFixed(2)}。`, false],
    ['体积守恒补偿', volume ? `承重区回收 ${volume.removedMm3} mm³，系统自动在减压区和近端边缘释放 ${volume.releasedMm3} mm³，避免局部收紧后整体过压。` : '生成后将计算承重区回收体积，并在减压区或边缘区进行补偿释放。', false],
    ['胫骨前缘减压', `识别为高压敏感区，基础减压 ${relief.toFixed(1)} mm，并叠加语义标签对应的局部调整量。`, true],
    ['末端包容', `远端区域增加 ${distal.toFixed(1)} mm 包容，减少末端集中承压，适合作为初版试穿前方案。`, false],
    ['近端修边', `修边高度设置为残肢扫描高度的 ${trim}%；AI 保留较高包覆以保证悬吊与稳定性。`, false]
  ].map(([title, body, warn]) => `<div class="rec ${warn ? 'warn' : ''}"><strong>${title}</strong>${body}</div>`).join('');

  const riskCards = currentRiskZones.map((zone) => (
    `<div class="rec ${zone.severity}"><strong>${zone.label} · ${riskLabel(zone.severity)}</strong>${zone.reason}</div>`
  )).join('');
  recommendations.innerHTML = baseCards + riskCards;
}

function riskLabel(severity) {
  if (severity === 'high') return '高风险';
  if (severity === 'medium') return '中风险';
  return '低风险';
}

function tissueLabel(value) {
  if (value === 'firm') return '紧实';
  if (value === 'fleshy') return '松软';
  return '中等';
}

function updateMetrics(hasSocket) {
  if (!metrics) return;
  outputs.height.textContent = `${Math.round(metrics.height * 1000)} mm`;
  outputs.circ.textContent = `${Math.round(metrics.circumference * 1000)} mm`;
  if (outputs.volume) {
    const volume = currentGenerationMeta?.volumeConservation;
    outputs.volume.textContent = hasSocket && volume ? `${volume.releasedMm3} mm³` : '--';
  }
  if (outputs.delta) {
    const latest = socketVersions.at(-1);
    outputs.delta.textContent = latest?.delta ? `${signed(latest.delta.offsetMm)} mm` : '--';
  }
  outputs.wall.textContent = hasSocket ? '3.5 mm' : '--';
  outputs.print.textContent = hasSocket ? '通过' : '--';
}

function updateOutputs() {
  outputs.offset.textContent = `${Number(controls.offset.value).toFixed(1)} mm`;
  outputs.trim.textContent = `${controls.trim.value}%`;
  outputs.relief.textContent = `${Number(controls.relief.value).toFixed(1)} mm`;
  outputs.distal.textContent = `${Number(controls.distal.value).toFixed(1)} mm`;
  if (outputs.brushStrength) outputs.brushStrength.textContent = `${brushStrengthMm().toFixed(1)} mm`;
  if (outputs.weight) outputs.weight.textContent = `${controls.bodyWeight?.value || 70} kg`;
}

function syncUserAvatar() {
  if (!userName || !userAvatar) return;
  const firstChar = Array.from(userName.textContent.trim()).find((char) => char.trim());
  userAvatar.textContent = firstChar || '用';
}

async function refineWithGemini() {
  if (!socketMesh) {
    generateSocket();
    window.setTimeout(refineWithGemini, 620);
    return;
  }
  if (!metrics) return;
  setAiState('Gemini 复核中');
  geminiResult.innerHTML = '<span class="eyebrow">大模型复核</span><div class="empty">正在把当前参数、几何摘要和3D预览交给 Gemini 分析...</div>';

  const payload = {
    summary: buildModelSummary(),
    imageDataUrl: renderer.domElement.toDataURL('image/png')
  };

  try {
    await ensureBackendReady();
    const response = await fetch(apiUrl('/api/gemini-refine'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Gemini request failed');
    applyGeminiRefinement(data.result, data.model);
    setAiState('Gemini 已复核');
  } catch (error) {
    const fallback = localRefinementFallback();
    applyGeminiRefinement(fallback, '本地规则兜底');
    setAiState('本地兜底');
    geminiResult.insertAdjacentHTML(
      'beforeend',
      `<div class="empty">Gemini 调用未成功，已使用本地规则兜底。错误摘要：${escapeHtml(explainFetchError(error))}</div>`
    );
  }
}

function apiUrl(path) {
  if (window.location.protocol === 'file:') {
    throw new Error('当前页面是以 file:// 打开的，没有本地后端。请从 SocketAI-Designer-Demo.exe 启动。');
  }
  return new URL(path, window.location.origin).toString();
}

async function ensureBackendReady() {
  const response = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`本地后端健康检查失败：HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error('本地后端未就绪');
  if (!data.hasGeminiKey) throw new Error('本机环境变量 GEMINI_API_KEY 未设置');
}

function explainFetchError(error) {
  const message = String(error.message || error);
  if (message === 'Failed to fetch') {
    return '浏览器没有连到本地后端。请关闭旧标签页，重新运行新版 exe；不要关闭启动后的本地服务进程。';
  }
  return message.slice(0, 220);
}

function buildModelSummary() {
  const latest = socketVersions.at(-1);
  const patient = patientContext();
  return {
    patient: {
      side: 'right_lower_limb',
      activityLevel: patient.activityLevel,
      bodyWeightKg: patient.bodyWeightKg,
      tissueFirmness: patient.tissueFirmness,
      coefficients: patient
    },
    geometry: {
      scanHeightMm: Math.round(metrics.height * 1000),
      maxCircumferenceMm: Math.round(metrics.circumference * 1000),
      maxRadiusMm: Math.round(metrics.maxRadius * 1000),
      profileSamples: modelProfile
        .filter((_p, i) => i % 6 === 0)
        .map((p) => ({ yMm: Math.round(p.y * 1000), radiusMm: Math.round(p.r * 1000) }))
    },
    currentParameters: {
      offsetMm: Number(controls.offset.value),
      trimPercent: Number(controls.trim.value),
      reliefMm: Number(controls.relief.value),
      distalMm: Number(controls.distal.value)
    },
    semanticSegmentation: {
      method: semanticMap?.method || 'unknown',
      confidence: semanticMap?.confidence ?? 0,
      labels: semanticMap?.summary?.map((entry) => ({
        id: entry.id,
        label: SEMANTIC_LABELS[entry.id].label,
        severity: entry.severity,
        ratio: Number(entry.ratio.toFixed(3)),
        y: Number(entry.y.toFixed(3)),
        theta: Number(entry.theta.toFixed(3)),
        rule: semanticActionEstimate(entry.id),
        description: SEMANTIC_LABELS[entry.id].description
      })) || []
    },
    clinicalRuleBase: Object.fromEntries(
      Object.entries(CLINICAL_RULES).map(([key, rule]) => [key, {
        actionType: rule.actionType,
        maxDeformationMm: rule.maxDeformationMm,
        vectorDirection: rule.vectorDirection,
        gaussianSigma: {
          axial: rule.axialSigma,
          angular: rule.angularSigma
        }
      }])
    ),
    vertexGroups: Object.fromEntries(
      Object.entries(semanticMap?.vertexGroups || {}).map(([key, indices]) => [key, indices.length])
    ),
    semanticTopologyActions: currentGenerationMeta?.semanticActions || [],
    volumeConservation: currentGenerationMeta?.volumeConservation || null,
    versionDelta: latest?.delta || null,
    currentRiskZones
  };
}

function applyGeminiRefinement(result, modelName) {
  geminiRefinement = sanitizeRefinement(result);
  const c = geminiRefinement.parameterCorrections;
  controls.offset.value = clamp(Number(controls.offset.value) + c.offsetDeltaMm, 0.5, 14);
  controls.trim.value = clamp(Number(controls.trim.value) + c.trimDeltaPercent, 50, 90);
  controls.relief.value = clamp(Number(controls.relief.value) + c.reliefDeltaMm, 0, 10);
  controls.distal.value = clamp(Number(controls.distal.value) + c.distalDeltaMm, 0, 18);
  currentRiskZones = geminiRefinement.riskZones;
  updateOutputs();
  refreshSocketGeometry();
  recordSocketVersion('Gemini 复核');
  renderGeminiResult(modelName);
  activateStep('edit', { complete: ['scan', 'landmarks', 'ai'], uncomplete: ['edit', 'export'] });
  setInspectorPane('params');
  hint.textContent = 'Gemini 复核完成：参数已保守校正，风险热图已按红/黄/绿等级重新标注。';
}

function sanitizeRefinement(result) {
  const corrections = result?.parameterCorrections || {};
  const zones = Array.isArray(result?.riskZones) && result.riskZones.length
    ? result.riskZones
    : defaultRiskZones();
  const semanticWeights = {};
  Object.keys(CLINICAL_RULES).forEach((labelId) => {
    const raw = result?.semanticWeights?.[labelId];
    if (Number.isFinite(Number(raw))) {
      const rule = clinicalRuleFor(labelId);
      semanticWeights[labelId] = clamp(Number(raw), rule.minWeight, rule.maxWeight);
    }
  });
  return {
    parameterCorrections: {
      offsetDeltaMm: clamp(Number(corrections.offsetDeltaMm) || 0, -2, 2),
      trimDeltaPercent: clamp(Number(corrections.trimDeltaPercent) || 0, -6, 6),
      reliefDeltaMm: clamp(Number(corrections.reliefDeltaMm) || 0, -2.5, 2.5),
      distalDeltaMm: clamp(Number(corrections.distalDeltaMm) || 0, -3, 3)
    },
    riskZones: zones.slice(0, 6).map((zone, index) => ({
      id: zone.id || `zone_${index}`,
      label: zone.label || '风险区',
      severity: ['high', 'medium', 'low'].includes(zone.severity) ? zone.severity : 'medium',
      color: ['red', 'yellow', 'green'].includes(zone.color) ? zone.color : 'yellow',
      y: clamp(Number(zone.y) || 0.5, 0.04, 0.96),
      theta: ((Number(zone.theta) || 0) % 1 + 1) % 1,
      radius: clamp(Number(zone.radius) || 0.14, 0.06, 0.28),
      reason: zone.reason || '需要假肢师结合触诊和试穿反馈确认。'
    })),
    semanticWeights,
    clinicalNotes: Array.isArray(result?.clinicalNotes) ? result.clinicalNotes.slice(0, 4) : [],
    confidence: clamp(Number(result?.confidence) || 0.62, 0, 1)
  };
}

function localRefinementFallback() {
  return {
    parameterCorrections: {
      offsetDeltaMm: 0.5,
      trimDeltaPercent: -1,
      reliefDeltaMm: 0.8,
      distalDeltaMm: 0.5
    },
    riskZones: defaultRiskZones(),
    semanticWeights: {
      anterior_tibia: 0.72,
      fibula_head: 0.66,
      distal_end: 0.7,
      posterior_soft_tissue: 0.52
    },
    clinicalNotes: [
      '优先复核胫骨前缘和末端承压区，保守增加减压与远端包容。',
      '绿色区域可作为相对安全承重区，但仍需结合患者软组织状态确认。'
    ],
    confidence: 0.58
  };
}

function renderGeminiResult(modelName) {
  const c = geminiRefinement.parameterCorrections;
  const notes = geminiRefinement.clinicalNotes.map((note) => `<div class="empty">${escapeHtml(note)}</div>`).join('');
  const chips = geminiRefinement.riskZones.map((zone) => (
    `<div class="risk-chip"><span class="risk-dot ${zone.color}"></span><span><strong>${escapeHtml(zone.label)} · ${riskLabel(zone.severity)}</strong><br>${escapeHtml(zone.reason)}</span></div>`
  )).join('');
  geminiResult.innerHTML = `
    <span class="eyebrow">大模型复核 · ${escapeHtml(modelName)}</span>
    <div class="rec">
      <strong>参数校正</strong>
      包容量 ${signed(c.offsetDeltaMm)} mm；修边 ${signed(c.trimDeltaPercent)}%；减压 ${signed(c.reliefDeltaMm)} mm；末端 ${signed(c.distalDeltaMm)} mm。
    </div>
    <div class="risk-legend">${chips}</div>
    ${notes}
  `;
}

function signed(value) {
  return `${value >= 0 ? '+' : ''}${Number(value).toFixed(1)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothStep(edge0, edge1, value) {
  const x = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setAiState(text) {
  aiState.textContent = text;
}

function activateStep(stepName, options = {}) {
  (options.complete || []).forEach((stepId) => completedWorkflowSteps.add(stepId));
  (options.uncomplete || []).forEach((stepId) => completedWorkflowSteps.delete(stepId));
  const activeIndex = Math.max(0, WORKFLOW_STEPS.findIndex((step) => step.id === stepName));
  document.querySelectorAll('.step').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.step === stepName);
    btn.classList.toggle('done', completedWorkflowSteps.has(btn.dataset.step));
  });
  const active = WORKFLOW_STEPS[activeIndex] || WORKFLOW_STEPS[0];
  if (currentStepTitle) currentStepTitle.textContent = active.title;
  if (currentStepNote) currentStepNote.textContent = active.note;
  if (workflowProgress) workflowProgress.style.width = `${active.progress}%`;
  if (workflowNext) workflowNext.textContent = active.next;
}

function renderSidebarVersions() {
  if (!versionTimeline) return;
  if (!socketVersions.length) {
    versionTimeline.innerHTML = '<div class="timeline-empty">生成接受腔后，这里会记录真实版本。</div>';
    if (deleteVersionBtn) deleteVersionBtn.disabled = true;
    return;
  }
  if (!selectedVersionId || !socketVersions.some((version) => version.id === selectedVersionId)) {
    selectedVersionId = socketVersions.at(-1).id;
  }
  versionTimeline.innerHTML = socketVersions
    .slice()
    .reverse()
    .map((version, index) => {
      const delta = version.delta ? `Delta ${signed(version.delta.offsetMm)} mm` : '初始版本';
      const active = version.id === selectedVersionId;
      return `
        <button class="version ${active ? 'active' : ''}" type="button" data-version-id="${version.id}">
          <strong>${version.id} ${escapeHtml(version.source)}</strong>
          <small>${version.createdAt} · ${delta}</small>
        </button>
      `;
    })
    .join('');
  if (deleteVersionBtn) deleteVersionBtn.disabled = socketVersions.length === 0;
}

function applyVersionParams(version) {
  if (!version?.params) return;
  controls.offset.value = String(version.params.offsetMm);
  controls.trim.value = String(version.params.trimPercent);
  controls.relief.value = String(version.params.reliefMm);
  controls.distal.value = String(version.params.distalMm);
  updateOutputs();
}

function restoreSocketVersion(versionId) {
  const version = socketVersions.find((item) => item.id === versionId);
  if (!version?.geometry || !socketMesh) return;
  selectedVersionId = version.id;
  socketMesh.geometry.dispose();
  socketMesh.geometry = version.geometry.clone();
  if (wireMesh) {
    wireMesh.geometry.dispose();
    wireMesh.geometry = socketMesh.geometry.clone();
  }
  applyVersionParams(version);
  currentGenerationMeta = structuredCloneSafe(version.generationMeta) || {
    volumeConservation: version.volumeConservation,
    semanticActions: version.semanticActions
  };
  geminiRefinement = structuredCloneSafe(version.geminiRefinement);
  currentRiskZones = structuredCloneSafe(version.riskZones) || [];
  clearPaintUndoStack();
  clearPaintMarkers();
  buildHeatZones();
  if (sectionMode) applySectionClipping();
  renderVersionDelta();
  renderSidebarVersions();
  updateRecommendations();
  updateMetrics(true);
  hint.textContent = `已切换到 ${version.id} · ${version.source}。`;
}

function addManualVersion() {
  if (!socketMesh) {
    hint.textContent = '请先生成接受腔，再手动新增版本。';
    return;
  }
  recordSocketVersion('手动新增', { manual: true });
  activateStep('edit', { complete: ['scan', 'landmarks'] });
  setInspectorPane('params');
  hint.textContent = `已基于上一版新增 ${selectedVersionId}，可继续调整参数或画笔。`;
}

function deleteSelectedVersion() {
  const version = selectedVersion();
  if (!version) return;
  const index = socketVersions.findIndex((item) => item.id === version.id);
  if (index < 0) return;
  const [removed] = socketVersions.splice(index, 1);
  removed.geometry?.dispose?.();
  selectedVersionId = socketVersions[Math.max(0, index - 1)]?.id || socketVersions.at(-1)?.id || null;
  if (selectedVersionId) {
    restoreSocketVersion(selectedVersionId);
  } else {
    if (socketMesh) {
      scene.remove(socketMesh);
      socketMesh.geometry.dispose();
      socketMesh = null;
    }
    if (wireMesh) {
      scene.remove(wireMesh);
      wireMesh.geometry.dispose();
      wireMesh = null;
    }
    currentGenerationMeta = null;
    renderVersionDelta();
    renderSidebarVersions();
    updateMetrics(false);
    activateStep('landmarks', { complete: ['scan'], uncomplete: ['landmarks', 'ai', 'edit', 'export'] });
  }
  hint.textContent = `已删除 ${removed.id}。`;
}

async function importModel(file) {
  fileInput.disabled = true;
  hint.textContent = `正在导入 ${file.name}...`;
  activateStep('scan', { uncomplete: ['scan', 'landmarks', 'ai', 'edit', 'export'] });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const buffer = await file.arrayBuffer();
    let mesh = null;
    if (ext === 'stl') {
      const geometry = new STLLoader().parse(buffer);
      mesh = new THREE.Mesh(geometry, limbMaterial);
    } else if (ext === 'obj') {
      const text = new TextDecoder().decode(buffer);
      const obj = new OBJLoader().parse(text);
      const meshes = [];
      obj.traverse((child) => {
        if (child.isMesh) meshes.push(child);
      });
      if (meshes.length === 1) {
        mesh = meshes[0];
      } else {
        mesh = obj;
      }
    }
    if (!mesh) throw new Error('未找到可用网格');
    const normalized = normalizeImportedMesh(mesh);
    setLimb(normalized);
    hint.textContent = `已导入 ${file.name}`;
  } catch (error) {
    hint.textContent = `模型导入失败：${error?.message || error}`;
    console.error(error);
  } finally {
    fileInput.disabled = false;
    fileInput.value = '';
  }
}

function setVisibility(mode) {
  currentViewMode = mode;
  if (limbMesh) limbMesh.visible = mode !== 'socket';
  if (socketMesh) socketMesh.visible = mode !== 'limb';
  if (wireMesh) wireMesh.visible = mode !== 'limb' && controls.wireToggle.checked;
  heatGroup.visible = mode !== 'limb' && controls.heatToggle.checked;
  limbMaterial.transparent = mode === 'both';
  limbMaterial.opacity = mode === 'both' ? 0.32 : 1;
  limbMaterial.depthWrite = mode !== 'both';
  limbMaterial.needsUpdate = true;
  socketMaterial.opacity = mode === 'both' ? 0.82 : 0.72;
  socketMaterial.depthWrite = false;
  socketMaterial.needsUpdate = true;
  if (mode === 'limb') brushCursor.visible = false;
}

function setToolButton(id) {
  document.querySelectorAll('#viewBoth, #viewSocket, #viewLimb').forEach((btn) => btn.classList.remove('active'));
  document.querySelector(id).classList.add('active');
}

function updateSectionPlane() {
  const source = socketMesh || limbMesh;
  if (!source) return;
  const box = new THREE.Box3().setFromObject(source);
  const ratio = clamp(Number(sectionHeight?.value || 50) / 100, 0, 1);
  const y = THREE.MathUtils.lerp(box.min.y, box.max.y, ratio);
  sectionPlane.constant = y;
  if (sectionHeightOut) sectionHeightOut.textContent = `${Math.round(ratio * 100)}%`;
}

function applySectionClipping() {
  updateSectionPlane();
  renderer.localClippingEnabled = sectionMode;
  [limbMaterial, socketMaterial, wireMaterial, heatMaterial].forEach((mat) => {
    mat.clippingPlanes = sectionMode ? [sectionPlane] : [];
    mat.needsUpdate = true;
  });
}

function applySectionMode() {
  sectionMode = !sectionMode;
  if (sectionControls) sectionControls.hidden = !sectionMode;
  applySectionClipping();
  document.querySelector('#sectionBtn').classList.toggle('active', sectionMode);
  hint.textContent = sectionMode
    ? '剖切预览已开启：拖动高度滑条查看接受腔与残肢的截面关系。'
    : '剖切预览已关闭。';
}

function togglePaintMode() {
  paintMode = !paintMode;
  document.querySelector('#paintBtn').classList.toggle('active', paintMode);
  viewer.classList.toggle('painting', paintMode);
  brushCursor.visible = false;
  hint.textContent = paintMode
    ? '局部减压画笔已开启：移动到接受腔表面可预览画笔半径，点击后添加局部外扩修形。'
    : '可拖拽旋转、滚轮缩放。点击“算法生成接受腔”后，可用画笔在模型上添加局部减压。';
}

function brushStrengthMm() {
  return Number(controls.brushStrength?.value || 1.5);
}

function brushRadiusMeters() {
  return 0.025 + brushStrengthMm() * 0.02;
}

function updateBrushCursorGeometry() {
  const radius = brushRadiusMeters();
  brushCursor.geometry.dispose();
  brushCursor.geometry = new THREE.TorusGeometry(radius, Math.max(0.0008, radius * 0.022), 8, 72);
}

function pointerToSocketHit(event) {
  if (!socketMesh) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  return raycaster.intersectObject(socketMesh)[0] || null;
}

function updateBrushCursor(event) {
  if (!paintMode || !socketMesh || currentViewMode === 'limb') {
    brushCursor.visible = false;
    return;
  }
  const hit = pointerToSocketHit(event);
  if (!hit) {
    brushCursor.visible = false;
    return;
  }
  const normal = hit.face?.normal
    ? hit.face.normal.clone().transformDirection(socketMesh.matrixWorld).normalize()
    : camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1).normalize();
  brushCursor.position.copy(hit.point).addScaledVector(normal, 0.002);
  brushCursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  brushCursor.visible = true;
}

function clearPaintMarkers() {
  markerGroup.children.forEach((marker) => {
    marker.geometry?.dispose?.();
  });
  markerGroup.clear();
}

function clearPaintUndoStack() {
  paintUndoStack.forEach((item) => item.geometry.dispose());
  paintUndoStack = [];
  if (undoPaintBtn) undoPaintBtn.disabled = true;
}

function pushPaintUndoSnapshot() {
  if (!socketMesh) return null;
  const snapshot = {
    geometry: socketMesh.geometry.clone(),
    marker: null
  };
  paintUndoStack.push(snapshot);
  if (paintUndoStack.length > 12) {
    const dropped = paintUndoStack.shift();
    dropped.geometry.dispose();
  }
  if (undoPaintBtn) undoPaintBtn.disabled = paintUndoStack.length === 0;
  return snapshot;
}

function undoPaintStep() {
  const snapshot = paintUndoStack.pop();
  if (!snapshot || !socketMesh) return;
  socketMesh.geometry.dispose();
  socketMesh.geometry = snapshot.geometry;
  if (snapshot.marker) {
    markerGroup.remove(snapshot.marker);
    snapshot.marker.geometry.dispose();
  }
  if (wireMesh) {
    wireMesh.geometry.dispose();
    wireMesh.geometry = socketMesh.geometry.clone();
  }
  if (undoPaintBtn) undoPaintBtn.disabled = paintUndoStack.length === 0;
  updateMetrics(true);
  if (interactionFeedback) {
    interactionFeedback.textContent = '已撤销上一步局部减压编辑。';
    interactionFeedback.classList.add('active');
  }
  hint.textContent = '已撤销上一步局部减压编辑。';
}

function paintRelief(event) {
  if (!paintMode || !socketMesh || currentViewMode === 'limb') return;
  const hit = pointerToSocketHit(event);
  if (!hit) return;

  const undoSnapshot = pushPaintUndoSnapshot();
  const pos = socketMesh.geometry.attributes.position;
  const center = hit.point.clone();
  const radius = brushRadiusMeters();
  const displacement = brushStrengthMm() / 1000;
  for (let i = 0; i < pos.count; i += 1) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const d = v.distanceTo(center);
    if (d < radius) {
      const falloff = (1 + Math.cos((d / radius) * Math.PI)) / 2;
      const outward = new THREE.Vector3(v.x, 0, v.z).normalize();
      v.addScaledVector(outward, displacement * falloff);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate = true;
  socketMesh.geometry.computeVertexNormals();
  if (wireMesh) {
    wireMesh.geometry.dispose();
    wireMesh.geometry = socketMesh.geometry.clone();
  }
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), heatMaterial);
  marker.position.copy(center);
  markerGroup.add(marker);
  if (undoSnapshot) undoSnapshot.marker = marker;
  updateMetrics(true);
  if (interactionFeedback) {
    interactionFeedback.textContent = `本次局部减压 +${brushStrengthMm().toFixed(1)} mm，影响半径约 ${Math.round(radius * 1000)} mm。`;
    interactionFeedback.classList.add('active');
  }
  setInspectorPane('params');
  updateBrushCursor(event);
  activateStep('edit', { complete: ['scan', 'landmarks'] });
}

function resetView() {
  camera.position.set(0.52, 0.38, 0.78);
  orbit.target.set(0, 0.18, 0);
  camera.near = 0.01;
  camera.far = 100;
  camera.updateProjectionMatrix();
  orbit.update();
  hint.textContent = '视角已重置。';
}

function fitViewToModel() {
  const objects = [limbMesh, socketMesh].filter(Boolean);
  if (!objects.length) return;
  const box = new THREE.Box3();
  objects.forEach((object) => box.expandByObject(object));
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const direction = camera.position.clone().sub(orbit.target).normalize();
  const distance = Math.max(0.18, sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.18);
  orbit.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction.lengthSq() ? direction : new THREE.Vector3(0.55, 0.42, 0.78).normalize(), distance);
  camera.near = Math.max(0.001, distance / 100);
  camera.far = Math.max(10, distance * 100);
  camera.updateProjectionMatrix();
  orbit.update();
  hint.textContent = '模型已适配到视图中央。';
}

function geometryToStl(mesh) {
  if (!mesh) return '';
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  let stl = 'solid socket_ai_initial\n';
  for (let i = 0; i < pos.count; i += 3) {
    const n = normal
      ? new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i))
      : new THREE.Vector3();
    stl += `facet normal ${n.x} ${n.y} ${n.z}\n outer loop\n`;
    for (let j = 0; j < 3; j += 1) {
      const v = new THREE.Vector3(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j));
      stl += `  vertex ${v.x} ${v.y} ${v.z}\n`;
    }
    stl += ' endloop\nendfacet\n';
  }
  stl += 'endsolid socket_ai_initial\n';
  geometry.dispose();
  return stl;
}

fileInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) importModel(file);
});
sampleBtn.addEventListener('click', loadSample);
generateBtn.addEventListener('click', generateSocket);
geminiBtn.addEventListener('click', refineWithGemini);
userName?.addEventListener('input', syncUserAvatar);
exportBtn.addEventListener('click', async () => {
  if (!socketMesh) generateSocket();
  if (!socketMesh) return;
  const stl = geometryToStl(socketMesh);
  if (window.socketAI?.saveStl) {
    const result = await window.socketAI.saveStl(stl);
    if (result.canceled) return;
  } else {
    const blob = new Blob([stl], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'socket_ai_initial.stl';
    link.click();
    URL.revokeObjectURL(url);
  }
  activateStep('export', { complete: ['scan', 'landmarks', 'ai', 'edit', 'export'] });
  setInspectorPane('manufacture');
  outputs.print.textContent = '已导出';
});

resetViewBtn?.addEventListener('click', resetView);
fitViewBtn?.addEventListener('click', fitViewToModel);
undoPaintBtn?.addEventListener('click', undoPaintStep);
addVersionBtn?.addEventListener('click', addManualVersion);
deleteVersionBtn?.addEventListener('click', deleteSelectedVersion);
sectionHeight?.addEventListener('input', () => {
  applySectionClipping();
});
controls.brushStrength?.addEventListener('input', () => {
  updateOutputs();
  updateBrushCursorGeometry();
});

['offset', 'trim', 'relief', 'distal'].forEach((key) => {
  controls[key].addEventListener('input', () => {
    if (key === 'trim') controls.trim.dataset.userChanged = 'true';
    updateOutputs();
    if (socketMesh) {
      refreshSocketGeometry();
    }
  });
});

['activityLevel', 'bodyWeight', 'tissueFirmness'].forEach((key) => {
  controls[key]?.addEventListener('input', () => {
    updateOutputs();
    if (socketMesh) {
      refreshSocketGeometry();
      hint.textContent = '患者画像已更新：语义标签对应的减压、收紧和体积补偿系数已重新计算。';
    } else {
      updateRecommendations();
    }
  });
});

controls.heatToggle.addEventListener('change', () => {
  heatGroup.visible = controls.heatToggle.checked;
  if (socketMesh) {
    applyHeatMapToGeometry(socketMesh.geometry, controls.heatToggle.checked ? currentRiskZones : []);
    if (wireMesh) {
      wireMesh.geometry.dispose();
      wireMesh.geometry = socketMesh.geometry.clone();
    }
  }
});
controls.wireToggle.addEventListener('change', () => {
  if (wireMesh) wireMesh.visible = controls.wireToggle.checked;
});
controls.semanticToggle.addEventListener('change', () => {
  applySemanticColorsToLimb(limbMesh, semanticMap);
  document.querySelector('#semanticBtn')?.classList.toggle('active', controls.semanticToggle.checked);
});

function setInspectorPane(paneId) {
  document.querySelectorAll('.inspector-tab').forEach((tab) => {
    const isActive = tab.dataset.pane === paneId;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  document.querySelectorAll('.inspector-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.dataset.pane === paneId);
    pane.hidden = pane.dataset.pane !== paneId;
  });
}

document.querySelectorAll('.inspector-tab').forEach((tab) => {
  tab.addEventListener('click', () => setInspectorPane(tab.dataset.pane));
});

document.querySelectorAll('.step').forEach((stepButton) => {
  stepButton.addEventListener('click', () => {
    const step = WORKFLOW_STEPS.find((item) => item.id === stepButton.dataset.step);
    if (!step) return;
    activateStep(step.id);
    setInspectorPane(step.pane);
  });
});

versionTimeline?.addEventListener('click', (event) => {
  const button = event.target.closest('.version');
  if (!button) return;
  restoreSocketVersion(button.dataset.versionId);
  activateStep('export', { complete: ['scan', 'landmarks', 'ai', 'edit', 'export'] });
  setInspectorPane('manufacture');
});

document.querySelector('#viewBoth').addEventListener('click', () => {
  setToolButton('#viewBoth');
  setVisibility('both');
});
document.querySelector('#viewSocket').addEventListener('click', () => {
  setToolButton('#viewSocket');
  setVisibility('socket');
});
document.querySelector('#viewLimb').addEventListener('click', () => {
  setToolButton('#viewLimb');
  setVisibility('limb');
});
document.querySelector('#semanticBtn').addEventListener('click', () => {
  controls.semanticToggle.checked = !controls.semanticToggle.checked;
  applySemanticColorsToLimb(limbMesh, semanticMap);
  document.querySelector('#semanticBtn').classList.toggle('active', controls.semanticToggle.checked);
});
document.querySelector('#sectionBtn').addEventListener('click', applySectionMode);
document.querySelector('#paintBtn').addEventListener('click', togglePaintMode);
renderer.domElement.addEventListener('pointermove', updateBrushCursor);
renderer.domElement.addEventListener('pointerleave', () => {
  brushCursor.visible = false;
});
renderer.domElement.addEventListener('click', paintRelief);

updateOutputs();
updateBrushCursorGeometry();
syncUserAvatar();
renderSidebarVersions();
resize();
loadSample();
animate();
