const MARD_COLOR_PALETTE_DATA = require("./mard-palette");

const COLOR_SERIES_COUNTS = {
  A: 26,
  B: 32,
  C: 29,
  D: 26,
  E: 24,
  F: 25,
  G: 21,
  H: 23,
  M: 15
};

const WHITE_RGB = { r: 255, g: 255, b: 255 };
const DEFAULT_COLOR_PACKAGE = 0;
const RULER_SIZE = 30;
const LABEL_GAP = 4;
const AUTO_PALETTE_POINT_DELTA = 4.8;
const AUTO_PALETTE_ESTIMATE_DELTA = 11.5;
const AUTO_PALETTE_FINAL_DELTA = 6.8;
const WHITE_DETAIL_LUMINANCE = 0.9;
const WHITE_DETAIL_CHROMA = 0.08;
const SOFT_COLOR_MIN_CHROMA = 0.04;
const SOFT_COLOR_MIN_COVERAGE = 0.04;

const COLOR_PACKAGES = [
  { size: 0, label: "自动匹配颜色", outputLimit: 72 },
  { size: 221, label: "A-M 全色号", outputLimit: 221 },
  { size: 72, label: "最多 72 色", outputLimit: 72 },
  { size: 48, label: "最多 48 色", outputLimit: 48 },
  { size: 24, label: "最多 24 色", outputLimit: 24 },
  { size: 12, label: "最多 12 色", outputLimit: 12 },
  { size: 8, label: "最多 8 色", outputLimit: 8 },
  { size: 6, label: "最多 6 色", outputLimit: 6 }
];

const SAMPLE_MODE_SETTINGS = {
  classic: { samplesPerAxis: 9, detailBoost: 2.6, colorBoost: 0.18, dominant: false },
  dominant: { samplesPerAxis: 9, detailBoost: 2.2, colorBoost: 0.1, dominant: true },
  average: { samplesPerAxis: 7, detailBoost: 0, colorBoost: 0.06, dominant: false },
  center: { samplesPerAxis: 1, detailBoost: 0, colorBoost: 0, dominant: false }
};

const MARD_COLOR_PALETTE = MARD_COLOR_PALETTE_DATA.map(({ code, rgb }) =>
  createColor(code, `${code.slice(0, 1)}系列色号`, rgb)
);

const MARD_COLOR_BY_CODE = new Map(MARD_COLOR_PALETTE.map((color) => [color.code, color]));
const PAINT_COLORS = MARD_COLOR_PALETTE.map((color) => ({
  code: color.code,
  name: color.name,
  hex: color.hex,
  rgb: { ...color.rgb }
}));
const KNOWN_COLOR_MATCHES = [
  {
    color: MARD_COLOR_BY_CODE.get("H2") || createColor("H2", "白色", WHITE_RGB),
    maxDelta: 6
  },
  {
    color: MARD_COLOR_BY_CODE.get("H7") || createColor("H7", "黑色", { r: 1, g: 1, b: 1 }),
    maxDelta: 12
  }
];

function parsePattern(imageData, options = {}) {
  const state = normalizeOptions(options);
  const cells = sampleImageCells(imageData, state);
  const mapped = mapCellsToPattern(cells, state);
  const stats = buildStats(mapped.colors);

  return {
    cells,
    colors: mapped.colors,
    pattern: toRows(mapped.colors, state.gridWidth),
    palette: mapped.palette,
    stats,
    gridWidth: state.gridWidth,
    gridHeight: state.gridHeight,
    activeColorLimit: mapped.activeColorLimit,
    averageDelta: mapped.averageDelta,
    colorLimitLabel: getColorLimitLabel(state.colorPackage, mapped.activeColorLimit)
  };
}

function normalizeOptions(options) {
  const gridWidth = normalizeNumber(options.gridWidth, 8, 160, 52);
  const gridHeight = normalizeNumber(options.gridHeight, 8, 160, 52);
  const sampleMode = SAMPLE_MODE_SETTINGS[options.sampleMode] ? options.sampleMode : "classic";
  const colorPackage = COLOR_PACKAGES.some((item) => item.size === Number(options.colorPackage))
    ? Number(options.colorPackage)
    : DEFAULT_COLOR_PACKAGE;

  return {
    gridWidth,
    gridHeight,
    sampleMode,
    colorPackage,
    mirrorX: Boolean(options.mirrorX),
    mirrorY: Boolean(options.mirrorY)
  };
}

function sampleImageCells(imageData, state) {
  const { data, width, height } = imageData;
  const cellWidth = width / state.gridWidth;
  const cellHeight = height / state.gridHeight;
  const settings = SAMPLE_MODE_SETTINGS[state.sampleMode] || SAMPLE_MODE_SETTINGS.classic;
  const cells = [];

  for (let y = 0; y < state.gridHeight; y += 1) {
    for (let x = 0; x < state.gridWidth; x += 1) {
      const cell = sampleCellColor(data, width, height, cellWidth, cellHeight, x, y, settings, state);
      cells.push({
        rgb: cell.rgb,
        hex: rgbToHex(cell.rgb),
        lab: rgbToLab(cell.rgb),
        isBackground: cell.isBackground,
        paletteWeight: cell.paletteWeight
      });
    }
  }

  return cells;
}

function sampleCellColor(data, width, height, cellWidth, cellHeight, gridX, gridY, settings, state) {
  const samples = collectCellSamples(data, width, height, cellWidth, cellHeight, gridX, gridY, settings, state);
  const sampleCount = samples.length || 1;
  let baseR = 0;
  let baseG = 0;
  let baseB = 0;
  let alphaTotal = 0;
  let whiteDetailSamples = 0;

  for (const sample of samples) {
    baseR += sample.rgb.r;
    baseG += sample.rgb.g;
    baseB += sample.rgb.b;
    alphaTotal += sample.alpha;
    if (getRgbLuminance(sample.rgb) >= WHITE_DETAIL_LUMINANCE && getRgbChroma(sample.rgb) <= WHITE_DETAIL_CHROMA) {
      whiteDetailSamples += 1;
    }
  }

  const baseRgb = {
    r: Math.round(baseR / sampleCount),
    g: Math.round(baseG / sampleCount),
    b: Math.round(baseB / sampleCount)
  };

  const alphaCoverage = alphaTotal / sampleCount;
  const softColor = getSoftColorSample(samples);
  const hasSoftColor = softColor.coverage >= SOFT_COLOR_MIN_COVERAGE && softColor.chroma >= SOFT_COLOR_MIN_CHROMA;

  if (alphaCoverage < 0.025 && isNearWhite(baseRgb, 18)) {
    return { rgb: WHITE_RGB, isBackground: true, paletteWeight: 0.04 };
  }

  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;
  let totalWeight = 0;
  let detailTotal = 0;
  let maxSalience = 0;

  for (const sample of samples) {
    const salience = getPixelSalience(sample.rgb, baseRgb, sample.alpha);
    const alphaWeight = Math.max(0.08, sample.alpha);
    const weight = alphaWeight * (1 + settings.detailBoost * salience);
    weightedR += sample.rgb.r * weight;
    weightedG += sample.rgb.g * weight;
    weightedB += sample.rgb.b * weight;
    totalWeight += weight;
    detailTotal += salience;
    maxSalience = Math.max(maxSalience, salience);
  }

  const detailScore = Math.max(detailTotal / sampleCount, maxSalience * 0.32);
  let rgb = totalWeight
    ? {
        r: Math.round(weightedR / totalWeight),
        g: Math.round(weightedG / totalWeight),
        b: Math.round(weightedB / totalWeight)
      }
    : baseRgb;

  if (settings.dominant) {
    const dominant = getDominantColorSample(samples, baseRgb);
    if (dominant.coverage >= 0.2) {
      rgb = blendRgb(rgb, dominant.rgb, clamp01(0.5 + dominant.coverage * 0.7));
    }
  }

  if (hasSoftColor && softColor.chroma >= getRgbChroma(rgb) + 0.012 && getRgbLuminance(rgb) >= 0.7) {
    rgb = blendRgb(rgb, softColor.rgb, clamp01(0.42 + softColor.coverage * 1.6));
  }

  const whiteDetailCoverage = whiteDetailSamples / sampleCount;
  const isBackground = isNearWhite(rgb, 16) && detailScore < 0.055 && !hasSoftColor && whiteDetailCoverage > 0.72;
  if (isBackground) {
    rgb = WHITE_RGB;
  } else if (settings.colorBoost > 0) {
    rgb = boostPatternColor(rgb, settings.colorBoost, detailScore);
  }

  return {
    rgb,
    isBackground,
    paletteWeight: isBackground ? 0.08 : 1 + Math.min(2.8, detailScore * 7) + (hasSoftColor ? softColor.coverage * 4 : 0)
  };
}

function collectCellSamples(data, width, height, cellWidth, cellHeight, gridX, gridY, settings, state) {
  const samples = [];
  const samplesX = settings.samplesPerAxis;
  const samplesY = settings.samplesPerAxis;

  for (let sy = 0; sy < samplesY; sy += 1) {
    for (let sx = 0; sx < samplesX; sx += 1) {
      const offsetX = samplesX === 1 ? 0.5 : (sx + 0.5) / samplesX;
      const offsetY = samplesY === 1 ? 0.5 : (sy + 0.5) / samplesY;
      const sampleX = getSourceCoordinate(gridX, offsetX, cellWidth, state.gridWidth, state.mirrorX);
      const sampleY = getSourceCoordinate(gridY, offsetY, cellHeight, state.gridHeight, state.mirrorY);
      samples.push(getPixel(data, width, height, sampleX, sampleY));
    }
  }

  return samples;
}

function getSourceCoordinate(gridIndex, offset, cellSize, gridSize, mirrored) {
  const cellPosition = mirrored ? gridSize - gridIndex - offset : gridIndex + offset;
  return cellPosition * cellSize;
}

function getPixel(data, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const index = (py * width + px) * 4;
  const alpha = data[index + 3] / 255;
  const rgb = blendAgainstWhite(data[index], data[index + 1], data[index + 2], alpha);
  return { rgb, alpha };
}

function mapCellsToPattern(cells, state) {
  const activeColorLimit = getActivePaletteLimit(cells, state.colorPackage);
  const palette = assignBeadColorCodes(ensureMandatoryColors(buildAutoPalette(cells, activeColorLimit), cells, activeColorLimit));
  const colors = [];
  let totalDistance = 0;

  for (const cell of cells) {
    const match = findClosestColor(cell.lab, palette);
    colors.push(match.color);
    totalDistance += Math.sqrt(match.distance);
  }

  return {
    colors,
    palette,
    activeColorLimit,
    averageDelta: colors.length ? totalDistance / colors.length : 0
  };
}

function getActivePaletteLimit(cells, colorPackage) {
  const currentPackage = COLOR_PACKAGES.find((item) => item.size === colorPackage) || COLOR_PACKAGES[0];
  const cellCount = Array.isArray(cells) ? cells.length : Number(cells) || 1;
  if (currentPackage.size === 0 && Array.isArray(cells)) {
    return Math.min(cellCount, getAdaptiveColorLimit(cells));
  }
  return Math.max(1, Math.min(currentPackage.outputLimit, cellCount));
}

function getAdaptiveColorLimit(cells) {
  const rawPoints = buildWeightedPoints(cells);
  const points = mergeWeightedPoints(compactWeightedPoints(rawPoints, AUTO_PALETTE_POINT_DELTA * 0.75), AUTO_PALETTE_POINT_DELTA);
  const estimatedCount = mergeWeightedPoints(points, AUTO_PALETTE_ESTIMATE_DELTA).length;
  if (estimatedCount <= 22) return 8;
  if (estimatedCount <= 34) return 24;
  if (estimatedCount <= 54) return 48;
  return 72;
}

function buildAutoPalette(cells, targetSize) {
  const rawPoints = buildWeightedPoints(cells);
  const points = mergeWeightedPoints(compactWeightedPoints(rawPoints, AUTO_PALETTE_POINT_DELTA * 0.75), AUTO_PALETTE_POINT_DELTA);
  const colorCount = Math.max(1, Math.min(targetSize, points.length));

  if (points.length <= colorCount) {
    return mergePaletteColors(points.map((point) => createWeightedAutoColor(point)).sort(compareColorForDisplay), AUTO_PALETTE_FINAL_DELTA);
  }

  let centroids = initializeCentroids(points, colorCount);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const clusters = centroids.map(() => createEmptyColorCluster());
    for (const point of points) {
      addPointToColorCluster(clusters[nearestCentroidIndex(point.lab, centroids)], point);
    }
    centroids = centroids.map((centroid, index) => {
      const cluster = clusters[index];
      return cluster.weight ? finalizeColorCluster(cluster) : farthestPoint(points, centroids);
    });
  }

  return mergePaletteColors(centroids.map((point) => createWeightedAutoColor(point)).sort(compareColorForDisplay), AUTO_PALETTE_FINAL_DELTA);
}

function mergePaletteColors(palette, maxDelta) {
  if (palette.length <= 1) return palette;
  return mergeWeightedPoints(palette.map((color) => ({ rgb: color.rgb, lab: color.lab, weight: color.weight || 1 })), maxDelta)
    .map((point) => createWeightedAutoColor(point))
    .sort(compareColorForDisplay);
}

function ensureMandatoryColors(palette, cells, targetSize) {
  const needsWhite = cells.some((cell) => cell.isBackground || isNearWhite(cell.rgb, 12));
  if (!needsWhite) return palette;
  const white = cloneColor(KNOWN_COLOR_MATCHES[0].color);
  const paletteWithoutWhite = palette.filter((color) => color.code !== white.code && color.hex !== white.hex);
  return [white, ...paletteWithoutWhite].slice(0, Math.max(1, targetSize)).sort(compareColorForDisplay);
}

function buildWeightedPoints(cells) {
  const map = new Map();
  for (const cell of cells) {
    const key = cell.hex;
    const existing = map.get(key);
    const weight = Math.max(0.03, cell.paletteWeight || 1);
    if (existing) {
      existing.weight += weight;
    } else {
      map.set(key, { rgb: cell.rgb, lab: cell.lab, weight });
    }
  }
  return [...map.values()];
}

function mergeWeightedPoints(points, maxDelta) {
  if (points.length <= 1 || maxDelta <= 0) return points;
  const maxDistance = maxDelta * maxDelta;
  const groups = [];
  const sortedPoints = [...points].sort((a, b) => b.weight - a.weight);
  for (const point of sortedPoints) {
    let closestGroup = null;
    let closestDistance = maxDistance;
    for (const group of groups) {
      const distance = labDistanceSquared(point.lab, group.lab);
      if (distance <= closestDistance) {
        closestGroup = group;
        closestDistance = distance;
      }
    }
    if (closestGroup) {
      addPointToColorCluster(closestGroup, point);
    } else {
      const group = createEmptyColorCluster();
      addPointToColorCluster(group, point);
      groups.push(group);
    }
  }
  return groups.map(finalizeColorCluster);
}

function compactWeightedPoints(points, bucketSize) {
  if (points.length <= 1 || bucketSize <= 0) return points;
  const buckets = new Map();
  for (const point of points) {
    const key = [
      Math.round(point.lab.l / bucketSize),
      Math.round((point.lab.a + 128) / bucketSize),
      Math.round((point.lab.b + 128) / bucketSize)
    ].join(":");
    const bucket = buckets.get(key);
    if (bucket) {
      addPointToColorCluster(bucket, point);
    } else {
      const group = createEmptyColorCluster();
      addPointToColorCluster(group, point);
      buckets.set(key, group);
    }
  }
  return [...buckets.values()].map(finalizeColorCluster);
}

function initializeCentroids(points, count) {
  const centroids = [];
  centroids.push(pointClosestToAverage(points));
  while (centroids.length < count) {
    centroids.push(farthestPoint(points, centroids));
  }
  return centroids;
}

function pointClosestToAverage(points) {
  const average = points.reduce((acc, point) => {
    acc.weight += point.weight;
    acc.l += point.lab.l * point.weight;
    acc.a += point.lab.a * point.weight;
    acc.b += point.lab.b * point.weight;
    return acc;
  }, { weight: 0, l: 0, a: 0, b: 0 });
  const averageLab = { l: average.l / average.weight, a: average.a / average.weight, b: average.b / average.weight };
  let best = points[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = labDistanceSquared(point.lab, averageLab);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return { rgb: best.rgb, lab: best.lab };
}

function farthestPoint(points, centroids) {
  let best = points[0];
  let bestDistance = -1;
  for (const point of points) {
    const distance = nearestCentroidDistance(point.lab, centroids) * Math.sqrt(point.weight);
    if (distance > bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return { rgb: best.rgb, lab: best.lab };
}

function nearestCentroidIndex(lab, centroids) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centroids.length; index += 1) {
    const distance = labDistanceSquared(lab, centroids[index].lab);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function nearestCentroidDistance(lab, centroids) {
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const centroid of centroids) {
    bestDistance = Math.min(bestDistance, labDistanceSquared(lab, centroid.lab));
  }
  return bestDistance;
}

function createEmptyColorCluster() {
  return { weight: 0, l: 0, a: 0, b: 0, r: 0, g: 0, blue: 0, rgb: WHITE_RGB, lab: rgbToLab(WHITE_RGB) };
}

function addPointToColorCluster(cluster, point) {
  cluster.weight += point.weight;
  cluster.l += point.lab.l * point.weight;
  cluster.a += point.lab.a * point.weight;
  cluster.b += point.lab.b * point.weight;
  cluster.r += point.rgb.r * point.weight;
  cluster.g += point.rgb.g * point.weight;
  cluster.blue += point.rgb.b * point.weight;
  updateColorClusterCenter(cluster);
}

function updateColorClusterCenter(cluster) {
  if (!cluster.weight) return;
  cluster.rgb = { r: Math.round(cluster.r / cluster.weight), g: Math.round(cluster.g / cluster.weight), b: Math.round(cluster.blue / cluster.weight) };
  cluster.lab = { l: cluster.l / cluster.weight, a: cluster.a / cluster.weight, b: cluster.b / cluster.weight };
}

function finalizeColorCluster(cluster) {
  return {
    rgb: { r: clampChannel(cluster.r / cluster.weight), g: clampChannel(cluster.g / cluster.weight), b: clampChannel(cluster.blue / cluster.weight) },
    lab: { l: cluster.l / cluster.weight, a: cluster.a / cluster.weight, b: cluster.b / cluster.weight },
    weight: cluster.weight
  };
}

function createWeightedAutoColor(point) {
  return { ...createAutoColor(point.rgb), weight: point.weight || 1 };
}

function createAutoColor(rgb) {
  const knownColor = findKnownColorMatch(rgb);
  return knownColor ? cloneColor(knownColor) : createColor("", "", rgb);
}

function assignBeadColorCodes(colors) {
  return colors.map((color) => {
    if (isFixedColorCode(color.code)) return cloneColor(color);
    const knownColor = findKnownColorMatch(color.rgb);
    if (knownColor) return cloneColor(knownColor);
    return cloneColor(findClosestMardColor(color.rgb) || color);
  });
}

function findClosestColor(lab, palette) {
  let color = palette[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const candidateDistance = labDistanceSquared(lab, candidate.lab);
    if (candidateDistance < distance) {
      color = candidate;
      distance = candidateDistance;
    }
  }
  return { color, distance };
}

function findClosestMardColor(rgb) {
  if (!MARD_COLOR_PALETTE.length) return null;
  const lab = rgbToLab(rgb);
  let closest = MARD_COLOR_PALETTE[0];
  let closestDistance = labDistanceSquared(lab, closest.lab);
  for (const candidate of MARD_COLOR_PALETTE.slice(1)) {
    const distance = labDistanceSquared(lab, candidate.lab);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

function buildStats(colors) {
  const counts = new Map();
  for (const color of assignBeadColorCodes(colors)) {
    const existing = counts.get(color.code);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(color.code, { ...color, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function drawPattern(ctx, result, options = {}) {
  const cell = options.cellSize || 8;
  const showCodes = Boolean(options.showCodes);
  const showGrid = options.showGrid !== false;
  const width = result.gridWidth * cell;
  const height = result.gridHeight * cell;
  ctx.clearRect(0, 0, width + RULER_SIZE, height + RULER_SIZE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width + RULER_SIZE, height + RULER_SIZE);
  drawRulers(ctx, result, cell, width, height);
  for (let y = 0; y < result.gridHeight; y += 1) {
    for (let x = 0; x < result.gridWidth; x += 1) {
      const color = result.pattern[y][x];
      ctx.fillStyle = color.hex;
      ctx.fillRect(RULER_SIZE + x * cell, RULER_SIZE + y * cell, cell, cell);
      if (showCodes && cell >= 13) {
        ctx.fillStyle = readableTextColor(color.rgb);
        ctx.font = `${Math.max(8, Math.floor(cell * 0.34))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(color.code, RULER_SIZE + x * cell + cell / 2, RULER_SIZE + y * cell + cell / 2);
      }
    }
  }
  if (showGrid) drawGrid(ctx, result, RULER_SIZE, RULER_SIZE, width, height, cell);
}

function getPaintColors() {
  return PAINT_COLORS.map((color) => ({
    ...color,
    rgb: { ...color.rgb }
  }));
}

function getPaintColorByCode(code) {
  const color = MARD_COLOR_BY_CODE.get(code);
  return color ? cloneColor(color) : null;
}

function drawRulers(ctx, result, cell, width, height) {
  ctx.save();
  ctx.fillStyle = "#f5f8f8";
  ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
  ctx.fillRect(RULER_SIZE, 0, width, RULER_SIZE);
  ctx.fillRect(0, RULER_SIZE, RULER_SIZE, height);
  ctx.strokeStyle = "rgba(28, 37, 41, 0.16)";
  ctx.strokeRect(0.5, 0.5, width + RULER_SIZE - 1, height + RULER_SIZE - 1);
  ctx.fillStyle = "rgba(28, 37, 41, 0.72)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let x = 0; x < result.gridWidth; x += 1) {
    if (x % 5 === 0 || x === result.gridWidth - 1) {
      ctx.fillText(String(x + 1), RULER_SIZE + x * cell + cell / 2, Math.max(10, RULER_SIZE / 2));
    }
  }
  ctx.textAlign = "right";
  for (let y = 0; y < result.gridHeight; y += 1) {
    if (y % 5 === 0 || y === result.gridHeight - 1) {
      ctx.fillText(String(y + 1), Math.max(10, RULER_SIZE - LABEL_GAP), RULER_SIZE + y * cell + cell / 2);
    }
  }
  ctx.restore();
}

function drawGrid(ctx, result, offsetX, offsetY, width, height, cell) {
  ctx.save();
  for (let x = 0; x <= result.gridWidth; x += 1) {
    ctx.strokeStyle = x % 10 === 0 ? "rgba(28,37,41,.48)" : x % 5 === 0 ? "rgba(15,143,134,.58)" : "rgba(28,37,41,.12)";
    ctx.lineWidth = x % 10 === 0 ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(offsetX + x * cell + 0.5, offsetY);
    ctx.lineTo(offsetX + x * cell + 0.5, offsetY + height);
    ctx.stroke();
  }
  for (let y = 0; y <= result.gridHeight; y += 1) {
    ctx.strokeStyle = y % 10 === 0 ? "rgba(28,37,41,.48)" : y % 5 === 0 ? "rgba(15,143,134,.58)" : "rgba(28,37,41,.12)";
    ctx.lineWidth = y % 10 === 0 ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + y * cell + 0.5);
    ctx.lineTo(offsetX + width, offsetY + y * cell + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function getDominantColorSample(samples, baseRgb) {
  const clusters = new Map();
  for (const sample of samples) {
    if (sample.alpha < 0.08) continue;
    const distance = getRgbDistance(sample.rgb, baseRgb);
    const key = [Math.round(sample.rgb.r / 16), Math.round(sample.rgb.g / 16), Math.round(sample.rgb.b / 16)].join(":");
    const weight = Math.max(0.35, sample.alpha * (1 + Math.min(1.8, distance / 120)));
    const cluster = clusters.get(key);
    if (cluster) {
      cluster.count += 1;
      cluster.weight += weight;
      cluster.r += sample.rgb.r * weight;
      cluster.g += sample.rgb.g * weight;
      cluster.b += sample.rgb.b * weight;
    } else {
      clusters.set(key, { count: 1, weight, r: sample.rgb.r * weight, g: sample.rgb.g * weight, b: sample.rgb.b * weight });
    }
  }
  const clusterList = [...clusters.values()].map((cluster) => ({
    ...cluster,
    rgb: { r: Math.round(cluster.r / cluster.weight), g: Math.round(cluster.g / cluster.weight), b: Math.round(cluster.b / cluster.weight) }
  }));
  const coloredClusters = clusterList.filter((cluster) => getRgbDistance(cluster.rgb, WHITE_RGB) >= 28 && getRgbChroma(cluster.rgb) >= 0.035);
  const dominant = (coloredClusters.length ? coloredClusters : clusterList).sort((a, b) => b.weight - a.weight)[0];
  return dominant ? { coverage: dominant.count / Math.max(1, samples.length), rgb: dominant.rgb } : { coverage: 0, rgb: baseRgb };
}

function getSoftColorSample(samples) {
  let count = 0;
  let totalWeight = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const sample of samples) {
    const luminance = getRgbLuminance(sample.rgb);
    const chroma = getRgbChroma(sample.rgb);
    const whiteDistance = getRgbDistance(sample.rgb, WHITE_RGB) / 441.7;
    if (luminance < 0.7 || chroma < SOFT_COLOR_MIN_CHROMA || whiteDistance < 0.025) continue;
    const weight = 0.45 + clamp01((chroma - SOFT_COLOR_MIN_CHROMA) / 0.18) * 1.4 + clamp01((whiteDistance - 0.025) / 0.22) * 0.8;
    red += sample.rgb.r * weight;
    green += sample.rgb.g * weight;
    blue += sample.rgb.b * weight;
    totalWeight += weight;
    count += 1;
  }
  if (!totalWeight) return { coverage: 0, chroma: 0, rgb: WHITE_RGB };
  const rgb = { r: Math.round(red / totalWeight), g: Math.round(green / totalWeight), b: Math.round(blue / totalWeight) };
  return { coverage: count / Math.max(1, samples.length), chroma: getRgbChroma(rgb), rgb };
}

function getPixelSalience(rgb, baseRgb, alpha) {
  if (alpha < 0.02 && isNearWhite(rgb, 12)) return 0;
  const chroma = getRgbChroma(rgb);
  const whiteDistance = getRgbDistance(rgb, WHITE_RGB) / 441.7;
  const localContrast = getRgbDistance(rgb, baseRgb) / 441.7;
  const darkness = 1 - getRgbLuminance(rgb);
  return clamp01(alpha * (0.38 * chroma + 0.28 * whiteDistance + 0.24 * localContrast + 0.1 * darkness));
}

function boostPatternColor(rgb, boost, detailScore) {
  if (isNearWhite(rgb, 12)) return rgb;
  const hsl = rgbToHsl(rgb);
  const detailFactor = clamp01(0.45 + detailScore * 2.4);
  hsl.s = clamp01(hsl.s * (1 + boost * (0.8 + detailFactor)));
  hsl.l = clamp01((hsl.l - 0.5) * (1 + boost * 0.32) + 0.5);
  if (hsl.s > 0.08 && hsl.l > 0.78) hsl.l = Math.max(0.72, hsl.l - boost * 0.18);
  return hslToRgb(hsl);
}

function findKnownColorMatch(rgb) {
  const hex = rgbToHex(rgb).toUpperCase();
  const exactMatch = KNOWN_COLOR_MATCHES.find((entry) => entry.color.hex.toUpperCase() === hex);
  if (exactMatch) return exactMatch.color;
  const lab = rgbToLab(rgb);
  const closeMatch = KNOWN_COLOR_MATCHES.find((entry) => Math.sqrt(labDistanceSquared(lab, entry.color.lab)) <= entry.maxDelta);
  return closeMatch ? closeMatch.color : null;
}

function createColor(code, name, rgb) {
  const normalized = { r: clampChannel(rgb.r), g: clampChannel(rgb.g), b: clampChannel(rgb.b) };
  return { code, name, rgb: normalized, hex: rgbToHex(normalized), lab: rgbToLab(normalized) };
}

function cloneColor(color) {
  return { ...color, rgb: { ...color.rgb }, lab: { ...color.lab } };
}

function isFixedColorCode(code) {
  return Boolean(code) && !String(code).startsWith("AUTO-");
}

function compareColorForDisplay(a, b) {
  const hueA = Math.atan2(a.lab.b, a.lab.a);
  const hueB = Math.atan2(b.lab.b, b.lab.a);
  return a.lab.l - b.lab.l || hueA - hueB || String(a.code || "").localeCompare(String(b.code || ""));
}

function getColorLimitLabel(colorPackage, activeColorLimit) {
  return colorPackage === 0 ? `自动上限 ${activeColorLimit} 色` : `上限 ${colorPackage} 色`;
}

function getRgbDistance(first, second) {
  return Math.sqrt(Math.pow(first.r - second.r, 2) + Math.pow(first.g - second.g, 2) + Math.pow(first.b - second.b, 2));
}

function getRgbChroma(rgb) {
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  return max <= 0 ? 0 : (max - min) / max;
}

function getRgbLuminance(rgb) {
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

function isNearWhite(rgb, tolerance) {
  return getRgbDistance(rgb, WHITE_RGB) <= tolerance;
}

function rgbToHex({ r, g, b }) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value) {
  return clampChannel(value).toString(16).padStart(2, "0");
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  if (delta !== 0) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  const hueToRgb = (p, q, t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  if (s === 0) {
    const gray = clampChannel(l * 255);
    return { r: gray, g: gray, b: gray };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: clampChannel(hueToRgb(p, q, h + 1 / 3) * 255),
    g: clampChannel(hueToRgb(p, q, h) * 255),
    b: clampChannel(hueToRgb(p, q, h - 1 / 3) * 255)
  };
}

function rgbToLab({ r, g, b }) {
  const [x, y, z] = rgbToXyz(r, g, b);
  const fx = pivotXyz(x / 95.047);
  const fy = pivotXyz(y / 100);
  const fz = pivotXyz(z / 108.883);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function rgbToXyz(r, g, b) {
  const srgb = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel > 0.04045 ? Math.pow((channel + 0.055) / 1.055, 2.4) : channel / 12.92;
  });
  const red = srgb[0] * 100;
  const green = srgb[1] * 100;
  const blue = srgb[2] * 100;
  return [
    red * 0.4124 + green * 0.3576 + blue * 0.1805,
    red * 0.2126 + green * 0.7152 + blue * 0.0722,
    red * 0.0193 + green * 0.1192 + blue * 0.9505
  ];
}

function pivotXyz(value) {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

function labDistanceSquared(first, second) {
  return Math.pow(first.l - second.l, 2) + Math.pow(first.a - second.a, 2) + Math.pow(first.b - second.b, 2);
}

function blendAgainstWhite(r, g, b, alpha) {
  return { r: Math.round(r * alpha + 255 * (1 - alpha)), g: Math.round(g * alpha + 255 * (1 - alpha)), b: Math.round(b * alpha + 255 * (1 - alpha)) };
}

function blendRgb(first, second, amount) {
  const weight = clamp01(amount);
  return { r: Math.round(first.r * (1 - weight) + second.r * weight), g: Math.round(first.g * (1 - weight) + second.g * weight), b: Math.round(first.b * (1 - weight) + second.b * weight) };
}

function readableTextColor(rgb) {
  const luminance = getRgbLuminance(rgb);
  return luminance > 0.58 ? "rgba(20, 26, 29, 0.82)" : "rgba(255, 255, 255, 0.9)";
}

function toRows(colors, width) {
  const rows = [];
  for (let index = 0; index < colors.length; index += width) {
    rows.push(colors.slice(index, index + width));
  }
  return rows;
}

function normalizeNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

module.exports = {
  COLOR_PACKAGES,
  SAMPLE_MODE_SETTINGS,
  RULER_SIZE,
  getPaintColors,
  getPaintColorByCode,
  parsePattern,
  drawPattern,
  readableTextColor
};
