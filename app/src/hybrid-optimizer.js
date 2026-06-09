const TWO_PI = Math.PI * 2;
const [OPENLIMB_DATA, SOCKETSENSE_DATA] = await Promise.all([
  fetch('../assets/reference-data/openlimbtt-pca.json').then((response) => response.json()),
  fetch('../assets/reference-data/socketsense-pilot.json').then((response) => response.json())
]);

const REGION_PRIORS = {
  anterior_tibia: { thicknessMm: 7, targetKpa: 42, sensitivity: 1.5, role: 'bony_relief' },
  fibula_head: { thicknessMm: 9, targetKpa: 44, sensitivity: 1.35, role: 'bony_relief' },
  distal_end: { thicknessMm: 16, targetKpa: 38, sensitivity: 1.2, role: 'distal_buffer' },
  proximal_brim: { thicknessMm: 18, targetKpa: 52, sensitivity: 0.9, role: 'stability' },
  posterior_soft_tissue: { thicknessMm: 27, targetKpa: 62, sensitivity: 0.68, role: 'load_tolerant' },
  general_soft_tissue: { thicknessMm: 21, targetKpa: 52, sensitivity: 0.85, role: 'neutral' }
};

const QUADRANTS = [
  { id: 'anterior', label: '前侧', theta: 0 },
  { id: 'lateral', label: '外侧', theta: 0.25 },
  { id: 'posterior', label: '后侧', theta: 0.5 },
  { id: 'medial', label: '内侧', theta: 0.75 }
];

export function fitOpenLimbPrior(profile, semanticMap, patient) {
  if (!profile?.length) return null;
  const target = resampleProfile(profile, OPENLIMB_DATA.sections, OPENLIMB_DATA.angles);
  const targetScale = mean(target.flat());
  const meanScale = mean(OPENLIMB_DATA.meanSkin.flat());
  const normalizedTarget = target.flat().map((value) => value / targetScale);
  const normalizedMean = OPENLIMB_DATA.meanSkin.flat().map((value) => value / meanScale);
  const basis = OPENLIMB_DATA.skinModes.map((mode) => mode.flat().map((value) => value / meanScale));
  const residual = normalizedTarget.map((value, index) => value - normalizedMean[index]);
  const coefficients = solveRidge(basis, residual, 0.035).map((value, index) => (
    clamp(value, OPENLIMB_DATA.modeRanges[index][0], OPENLIMB_DATA.modeRanges[index][1])
  ));
  const fitted = combineBasis(OPENLIMB_DATA.meanSkin, OPENLIMB_DATA.skinModes, coefficients);
  const fittedThickness = combineBasis(OPENLIMB_DATA.meanThickness, OPENLIMB_DATA.thicknessModes, coefficients);
  const scaleMeters = targetScale / meanScale;
  const error = rootMeanSquare(target.flat().map((value, index) => value - fitted.flat()[index] * scaleMeters));
  const landmarks = (semanticMap?.summary || []).map((entry) => {
    const prior = REGION_PRIORS[entry.id] || REGION_PRIORS.general_soft_tissue;
    const thicknessMm = clamp(sampleGrid(fittedThickness, entry.y, entry.theta) * scaleMeters * 1000, 3, 45);
    return {
      id: entry.id,
      y: entry.y,
      theta: entry.theta,
      thicknessMm: round(thicknessMm, 1),
      boneProximity: round(clamp(1 - thicknessMm / 34, 0.08, 0.92), 2),
      role: prior.role
    };
  });

  return {
    source: OPENLIMB_DATA.source,
    sourceUrl: OPENLIMB_DATA.sourceUrl,
    version: '2025-07',
    method: 'regularized_least_squares_on_real_pca_skin_basis',
    confidence: round(clamp(0.9 - error / Math.max(0.001, targetScale) * 1.8, 0.42, 0.92), 2),
    modes: {
      residualLength: round(coefficients[0], 2),
      bulbousConicalProfile: round(coefficients[1], 2)
    },
    coefficients: coefficients.map((value) => round(value, 3)),
    registrationRmseMm: round(error * 1000, 2),
    fittedThickness,
    landmarks,
    limitations: '使用 OpenLimbTT 真实 PCA 基底由外表面估计内部解剖，不替代 MRI/CT 或专业触诊。'
  };
}

export function estimateSocketSensePressure({ semanticMap, anatomyPrior, patient, params, iteration = 0 }) {
  if (!semanticMap?.summary?.length || !anatomyPrior) return null;
  const activityFactor = { K2: 0.88, K3: 1, K4: 1.18 }[patient.activityLevel] || 1;
  const weightFactor = clamp(patient.bodyWeightKg / 70, 0.62, 1.7);
  const containment = clamp(1 + (3.5 - params.offsetMm) * 0.055, 0.72, 1.25);
  const reliefReduction = clamp(1 - params.reliefMm * 0.035, 0.65, 1);
  const distalReduction = clamp(1 - params.distalMm * 0.018, 0.7, 1);
  const iterationReduction = Math.max(0.7, 1 - iteration * 0.11);
  const walking = SOCKETSENSE_DATA.pressureTasks.walking;
  const zones = [];
  Object.entries(walking).forEach(([location, sensels]) => {
    const topology = SOCKETSENSE_DATA.topology[location];
    if (!topology) return;
    Object.entries(sensels).forEach(([sensel, stats]) => {
      if (stats.p95 < 1) return;
      const y = SOCKETSENSE_DATA.senselAxialPosition[sensel] ?? 0.5;
      const theta = topology.theta;
      const nearest = nearestSemanticEntry(semanticMap.summary, y, theta);
      const region = REGION_PRIORS[nearest.id] || REGION_PRIORS.general_soft_tissue;
      const thicknessMm = sampleGrid(anatomyPrior.fittedThickness, y, theta) * anatomyScaleFromLandmarks(anatomyPrior);
      const boneProximity = clamp(1 - thicknessMm / 34, 0.08, 0.92);
      const boneFactor = clamp(0.72 + boneProximity * 0.58, 0.76, 1.22);
      const regionReduction = ['anterior_tibia', 'fibula_head'].includes(nearest.id)
        ? reliefReduction
        : nearest.id === 'distal_end' ? distalReduction : 1;
      const pressureKpa = clamp(stats.p95 * weightFactor * activityFactor * containment * boneFactor * regionReduction * iterationReduction, 1, 500);
      const excess = pressureKpa - region.targetKpa;
      zones.push({
        id: `${location}_${sensel}`,
        labelId: nearest.id,
        sensor: { location, sensel, measuredP95Kpa: stats.p95 },
        y,
        theta,
        quadrant: nearestQuadrant(theta),
        pressureKpa: round(pressureKpa, 1),
        shearValue: shearReferenceP95(),
        shearUnit: SOCKETSENSE_DATA.shearUnit,
        targetKpa: region.targetKpa,
        reliefDeltaMm: round(clamp(excess / 24, nearest.id === 'posterior_soft_tissue' ? -0.5 : 0, 2.2), 2),
        severity: pressureKpa > region.targetKpa + 22 ? 'high' : pressureKpa > region.targetKpa + 6 ? 'medium' : 'low',
        radius: 0.11,
        iteration
      });
    });
  });
  zones.sort((a, b) => b.pressureKpa - a.pressureKpa);
  const selectedZones = zones.slice(0, 14);

  const peak = Math.max(...selectedZones.map((zone) => zone.pressureKpa));
  const meanPressure = mean(selectedZones.map((zone) => zone.pressureKpa));
  return {
    source: SOCKETSENSE_DATA.source,
    sourceRecords: SOCKETSENSE_DATA.sourceRecords,
    task: 'walking',
    pressureUnit: SOCKETSENSE_DATA.pressureUnit,
    shearUnit: SOCKETSENSE_DATA.shearUnit,
    iteration,
    zones: selectedZones,
    peakKpa: round(peak, 1),
    meanKpa: round(meanPressure, 1),
    highCount: selectedZones.filter((zone) => zone.severity === 'high').length,
    limitations: SOCKETSENSE_DATA.limitations
  };
}

export function pressureReliefAt(feedback, t, theta) {
  if (!feedback?.applied || !feedback?.zones?.length) return 0;
  const thetaNorm = normalizeTheta(theta / TWO_PI);
  const deltaMm = feedback.zones.reduce((sum, zone) => {
    const dy = (t - zone.y) / Math.max(0.055, zone.radius * 0.78);
    const dt = circularDistance(thetaNorm, zone.theta) / Math.max(0.045, zone.radius * 0.62);
    const falloff = Math.exp(-0.5 * (dy * dy + dt * dt));
    return sum + zone.reliefDeltaMm * falloff;
  }, 0);
  return clamp(deltaMm, -0.5, 2.4) / 1000;
}

export function pressureZonesForHeatmap(feedback, labels = {}) {
  if (!feedback?.zones) return [];
  return feedback.zones.map((zone) => ({
    id: `pressure_${zone.id}`,
    label: `${labels[zone.labelId] || zone.labelId} · ${zone.pressureKpa} kPa`,
    severity: zone.severity,
    color: zone.severity === 'high' ? 'red' : zone.severity === 'medium' ? 'yellow' : 'green',
    y: zone.y,
    theta: zone.theta,
    radius: zone.radius,
    reason: `${zone.sensor.location}/${zone.sensor.sensel} 实测 P95 基线 ${zone.sensor.measuredP95Kpa} kPa；映射值 ${zone.pressureKpa} kPa，剪切参考 ${zone.shearValue} ${zone.shearUnit}。`
  }));
}

function nearestQuadrant(theta) {
  return QUADRANTS.reduce((best, item) => (
    circularDistance(theta, item.theta) < circularDistance(theta, best.theta) ? item : best
  ), QUADRANTS[0]);
}

function resampleProfile(profile, sections, angles) {
  return Array.from({ length: sections }, (_unused, sectionIndex) => {
    const sourceIndex = Math.round((sectionIndex / Math.max(1, sections - 1)) * (profile.length - 1));
    const source = profile[sourceIndex];
    return Array.from({ length: angles }, (_value, angleIndex) => {
      if (!Array.isArray(source.radii)) return source.r;
      const radiusIndex = Math.round((angleIndex / angles) * source.radii.length) % source.radii.length;
      return source.radii[radiusIndex];
    });
  });
}

function solveRidge(basis, target, lambda) {
  const size = basis.length;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const vector = Array(size).fill(0);
  for (let i = 0; i < size; i += 1) {
    for (let feature = 0; feature < target.length; feature += 1) {
      vector[i] += basis[i][feature] * target[feature];
    }
    for (let j = i; j < size; j += 1) {
      let value = 0;
      for (let feature = 0; feature < target.length; feature += 1) {
        value += basis[i][feature] * basis[j][feature];
      }
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
    matrix[i][i] += lambda;
  }
  return gaussianSolve(matrix, vector);
}

function gaussianSolve(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column] || 1e-9;
    for (let item = column; item <= size; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= size; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  return augmented.map((row) => row[size]);
}

function combineBasis(meanGrid, modeGrids, coefficients) {
  return meanGrid.map((row, section) => row.map((value, angle) => (
    Math.max(0, value + modeGrids.reduce((sum, mode, index) => sum + mode[section][angle] * coefficients[index], 0))
  )));
}

function sampleGrid(grid, y, theta) {
  if (!grid?.length) return 0;
  const section = Math.min(grid.length - 1, Math.max(0, Math.round(y * (grid.length - 1))));
  const row = grid[section];
  const angle = Math.min(row.length - 1, Math.max(0, Math.round(normalizeTheta(theta) * (row.length - 1))));
  return row[angle];
}

function nearestSemanticEntry(entries, y, theta) {
  return entries.reduce((best, entry) => {
    const score = Math.abs(entry.y - y) * 1.3 + circularDistance(entry.theta, theta);
    const bestScore = Math.abs(best.y - y) * 1.3 + circularDistance(best.theta, theta);
    return score < bestScore ? entry : best;
  }, entries[0]);
}

function anatomyScaleFromLandmarks(prior) {
  const ratios = prior.landmarks
    .map((item) => {
      const normalized = sampleGrid(prior.fittedThickness, item.y, item.theta);
      return normalized > 1e-5 ? item.thicknessMm / normalized : null;
    })
    .filter(Number.isFinite);
  return mean(ratios) || 378.52;
}

function shearReferenceP95() {
  const values = [];
  Object.values(SOCKETSENSE_DATA.pressureShearRuns).forEach((run) => {
    Object.values(run.shearMicroSiemens || {}).forEach((stats) => values.push(stats.p95));
  });
  return round(mean(values), 1);
}

function rootMeanSquare(values) {
  return Math.sqrt(mean(values.map((value) => value * value)));
}

function averageRadius(section) {
  if (Array.isArray(section.radii) && section.radii.length) return mean(section.radii);
  return section.r || 0;
}

function mean(values) {
  if (!values?.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function circularDistance(a, b) {
  const d = Math.abs(normalizeTheta(a) - normalizeTheta(b));
  return Math.min(d, 1 - d);
}

function normalizeTheta(value) {
  return ((value % 1) + 1) % 1;
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
