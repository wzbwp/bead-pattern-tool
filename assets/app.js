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

const BEAD_COLOR_CODES = Object.entries(COLOR_SERIES_COUNTS).flatMap(([series, count]) =>
  Array.from({ length: count }, (_, index) => `${series}${index + 1}`)
);

const COLOR_PACKAGES = [
  {
    size: BEAD_COLOR_CODES.length,
    label: `A-M 全色号 (最多 ${BEAD_COLOR_CODES.length})`,
    outputLimit: BEAD_COLOR_CODES.length
  },
  { size: 72, label: "最多 72 色", outputLimit: 72 },
  { size: 48, label: "最多 48 色", outputLimit: 48 },
  { size: 24, label: "最多 24 色", outputLimit: 24 },
  { size: 12, label: "最多 12 色", outputLimit: 12 },
  { size: 8, label: "最多 8 色", outputLimit: 8 },
  { size: 6, label: "最多 6 色", outputLimit: 6 }
];

const PANEL_PRESETS = [52, 78, 104];

const KNOWN_COLOR_MATCHES = [
  {
    color: createColor("H2", "白色", { r: 255, g: 255, b: 255 }),
    maxDelta: 6
  }
];

const RESERVED_MATCH_CODES = new Set(KNOWN_COLOR_MATCHES.map((entry) => entry.color.code));
const WHITE_RGB = { r: 255, g: 255, b: 255 };
// Package choices are maximums; these thresholds collapse sampling noise into real bead colors.
const AUTO_PALETTE_POINT_DELTA = 4.8;
const AUTO_PALETTE_ESTIMATE_DELTA = 11.5;
const AUTO_PALETTE_FINAL_DELTA = 6.8;
const OUTLINE_COLOR_DISTANCE = 36;
const OUTLINE_EDGE_BAND = 2;
const RULER_SIZE = 30;
const LABEL_GAP = 4;
const SAMPLE_MODE_SETTINGS = {
  enhanced: {
    samplesPerAxis: 13,
    detailBoost: 3.2,
    colorBoost: 0.2
  },
  average: {
    samplesPerAxis: 9,
    detailBoost: 0.2,
    colorBoost: 0.08
  },
  center: {
    samplesPerAxis: 1,
    detailBoost: 0,
    colorBoost: 0
  }
};

const state = {
  image: null,
  imageName: "",
  pattern: [],
  sourceCells: [],
  activePalette: [],
  stats: [],
  gridWidth: 80,
  gridHeight: 80,
  cellSize: 18,
  colorPackage: BEAD_COLOR_CODES.length,
  sampleMode: "enhanced",
  lockRatio: true,
  mirrorX: false,
  mirrorY: false,
  imageScale: 1,
  imageOffsetX: 0,
  imageOffsetY: 0,
  showGrid: true,
  showCodes: false,
  averageDelta: 0
};

const els = {
  imageInput: document.querySelector("#imageInput"),
  dropzone: document.querySelector("#dropzone"),
  fileMeta: document.querySelector("#fileMeta"),
  sourcePreview: document.querySelector("#sourcePreview"),
  imageScale: document.querySelector("#imageScale"),
  imageOffsetX: document.querySelector("#imageOffsetX"),
  imageOffsetY: document.querySelector("#imageOffsetY"),
  panelPresets: document.querySelector("#panelPresets"),
  boardMeta: document.querySelector("#boardMeta"),
  gridWidth: document.querySelector("#gridWidth"),
  gridHeight: document.querySelector("#gridHeight"),
  lockRatio: document.querySelector("#lockRatio"),
  mirrorX: document.querySelector("#mirrorX"),
  mirrorY: document.querySelector("#mirrorY"),
  sampleMode: document.querySelector("#sampleMode"),
  packageOptions: document.querySelector("#packageOptions"),
  requiredTitle: document.querySelector("#requiredTitle"),
  requiredList: document.querySelector("#requiredList"),
  cellSize: document.querySelector("#cellSize"),
  showGrid: document.querySelector("#showGrid"),
  showCodes: document.querySelector("#showCodes"),
  patternCanvas: document.querySelector("#patternCanvas"),
  canvasStage: document.querySelector("#canvasStage"),
  resultTitle: document.querySelector("#resultTitle"),
  statusPill: document.querySelector("#statusPill"),
  summaryStrip: document.querySelector("#summaryStrip"),
  paletteMeta: document.querySelector("#paletteMeta"),
  paletteList: document.querySelector("#paletteList"),
  exportPng: document.querySelector("#exportPng"),
  exportCsv: document.querySelector("#exportCsv"),
  exportJson: document.querySelector("#exportJson")
};

const ctx = els.patternCanvas.getContext("2d");
let parseTimer = 0;

renderPackageOptions();
bindEvents();
drawEmptyCanvas();
updateBoardMeta();

function renderPackageOptions() {
  els.packageOptions.innerHTML = COLOR_PACKAGES.map(
    (item) => `
      <button class="package-option" type="button" data-package="${item.size}">
        ${item.label}
      </button>
    `
  ).join("");
  selectColorPackage(state.colorPackage);
}

function bindEvents() {
  els.imageInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      loadFile(file);
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropzone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove("dragging");
    });
  });

  els.dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      loadFile(file);
    }
  });

  els.gridWidth.addEventListener("input", () => {
    state.gridWidth = normalizeNumber(els.gridWidth.value, 8, 240, 80);
    syncHeightFromRatio();
    updateBoardMeta();
    scheduleParse();
  });

  els.gridHeight.addEventListener("input", () => {
    state.gridHeight = normalizeNumber(els.gridHeight.value, 8, 240, 80);
    state.lockRatio = false;
    els.lockRatio.checked = false;
    updateBoardMeta();
    scheduleParse();
  });

  els.lockRatio.addEventListener("change", () => {
    state.lockRatio = els.lockRatio.checked;
    syncHeightFromRatio();
    updateBoardMeta();
    scheduleParse();
  });

  els.mirrorX.addEventListener("change", () => {
    state.mirrorX = els.mirrorX.checked;
    updateSourcePreviewTransform();
    scheduleParse(0);
  });

  els.mirrorY.addEventListener("change", () => {
    state.mirrorY = els.mirrorY.checked;
    updateSourcePreviewTransform();
    scheduleParse(0);
  });

  els.imageScale.addEventListener("input", () => {
    state.imageScale = normalizeNumber(els.imageScale.value, 50, 300, 100) / 100;
    updateSourcePreviewTransform();
    scheduleParse();
  });

  els.imageOffsetX.addEventListener("input", () => {
    state.imageOffsetX = normalizeNumber(els.imageOffsetX.value, -100, 100, 0);
    updateSourcePreviewTransform();
    scheduleParse();
  });

  els.imageOffsetY.addEventListener("input", () => {
    state.imageOffsetY = normalizeNumber(els.imageOffsetY.value, -100, 100, 0);
    updateSourcePreviewTransform();
    scheduleParse();
  });

  els.sampleMode.addEventListener("change", () => {
    state.sampleMode = els.sampleMode.value;
    scheduleParse();
  });

  els.packageOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-package]");
    if (!button) {
      return;
    }

    selectColorPackage(Number(button.dataset.package));
    scheduleParse(0);
  });

  els.panelPresets.addEventListener("click", (event) => {
    const button = event.target.closest("[data-size]");
    if (!button) {
      return;
    }

    const size = normalizeNumber(button.dataset.size, 8, 240, 80);
    state.gridWidth = size;
    state.gridHeight = size;
    state.lockRatio = false;
    els.lockRatio.checked = false;
    els.gridWidth.value = String(size);
    els.gridHeight.value = String(size);
    updateBoardMeta();
    scheduleParse(0);
  });

  els.cellSize.addEventListener("input", () => {
    state.cellSize = normalizeNumber(els.cellSize.value, 10, 30, 18);
    if (state.pattern.length) {
      drawPattern();
    }
  });

  els.showGrid.addEventListener("change", () => {
    state.showGrid = els.showGrid.checked;
    drawPattern();
  });

  els.showCodes.addEventListener("change", () => {
    state.showCodes = els.showCodes.checked;
    drawPattern();
  });

  els.exportPng.addEventListener("click", exportPng);
  els.exportCsv.addEventListener("click", exportCsv);
  els.exportJson.addEventListener("click", exportJson);

  window.addEventListener("resize", () => {
    if (!state.pattern.length) {
      drawEmptyCanvas();
    }
  });
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.imageName = file.name;
      els.fileMeta.textContent = `${file.name} · ${img.naturalWidth} x ${img.naturalHeight}`;
      state.imageScale = 1;
      state.imageOffsetX = 0;
      state.imageOffsetY = 0;
      els.imageScale.value = "100";
      els.imageOffsetX.value = "0";
      els.imageOffsetY.value = "0";
      els.sourcePreview.innerHTML = "";

      const preview = document.createElement("img");
      preview.src = reader.result;
      preview.alt = file.name;
      els.sourcePreview.appendChild(preview);
      updateSourcePreviewTransform();

      syncHeightFromRatio();
      parseImage();
    };
    img.onerror = () => {
      setStatus("图片读取失败", false);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function updateSourcePreviewTransform() {
  const preview = els.sourcePreview.querySelector("img");
  if (!preview) {
    return;
  }

  const scaleX = (state.mirrorX ? -1 : 1) * state.imageScale;
  const scaleY = (state.mirrorY ? -1 : 1) * state.imageScale;
  preview.style.transform = `translate(${state.imageOffsetX}%, ${state.imageOffsetY}%) scale(${scaleX}, ${scaleY})`;
}

function scheduleParse(delay = 120) {
  clearTimeout(parseTimer);
  parseTimer = window.setTimeout(() => {
    if (state.image) {
      parseImage();
    }
  }, delay);
}

function parseImage() {
  if (!state.image) {
    return;
  }

  state.gridWidth = normalizeNumber(els.gridWidth.value, 8, 240, 80);
  state.gridHeight = normalizeNumber(els.gridHeight.value, 8, 240, 80);
  state.sampleMode = SAMPLE_MODE_SETTINGS[els.sampleMode.value] ? els.sampleMode.value : "enhanced";
  state.mirrorX = els.mirrorX.checked;
  state.mirrorY = els.mirrorY.checked;

  setStatus("解析中", false);

  const sourceCells = sampleImageCells();
  const mapped = mapCellsToPattern(sourceCells);
  const refinedColors = refinePatternColors(mapped.colors, sourceCells);

  state.sourceCells = sourceCells;
  state.pattern = toRows(refinedColors, state.gridWidth);
  state.stats = buildStats(refinedColors);
  state.activePalette = mapped.palette;
  state.averageDelta = mapped.averageDelta;

  drawPattern();
  renderStats();
  setStatus("解析完成", true);
  enableExports(true);
}

function sampleImageCells() {
  const sourceCanvas = document.createElement("canvas");
  const maxSourceSide = 2400;
  const sourceScale = Math.min(
    1,
    maxSourceSide / Math.max(state.image.naturalWidth, state.image.naturalHeight)
  );
  const sourceWidth = Math.max(1, Math.round(state.image.naturalWidth * sourceScale));
  const sourceHeight = Math.max(1, Math.round(state.image.naturalHeight * sourceScale));

  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;

  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceCtx.imageSmoothingEnabled = !(
    state.image.naturalWidth <= state.gridWidth || state.image.naturalHeight <= state.gridHeight
  );
  sourceCtx.imageSmoothingQuality = "high";
  sourceCtx.fillStyle = "#ffffff";
  sourceCtx.fillRect(0, 0, sourceWidth, sourceHeight);
  drawSourceImage(sourceCtx, sourceWidth, sourceHeight);

  const imageData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight).data;
  const cells = [];
  const cellWidth = sourceWidth / state.gridWidth;
  const cellHeight = sourceHeight / state.gridHeight;
  const sampleSettings = SAMPLE_MODE_SETTINGS[state.sampleMode] || SAMPLE_MODE_SETTINGS.enhanced;

  for (let y = 0; y < state.gridHeight; y += 1) {
    for (let x = 0; x < state.gridWidth; x += 1) {
      const cell = sampleCellColor(
        imageData,
        sourceWidth,
        sourceHeight,
        cellWidth,
        cellHeight,
        x,
        y,
        sampleSettings
      );
      const rgb = cell.rgb;

      cells.push({
        rgb,
        hex: rgbToHex(rgb),
        lab: rgbToLab(rgb),
        alphaCoverage: cell.alphaCoverage,
        detailScore: cell.detailScore,
        isBackground: cell.isBackground,
        paletteWeight: cell.paletteWeight
      });
    }
  }

  return cells;
}

function drawSourceImage(sourceCtx, sourceWidth, sourceHeight) {
  const scale = Math.max(0.1, state.imageScale || 1);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = ((state.imageOffsetX || 0) / 100) * sourceWidth * 0.5;
  const offsetY = ((state.imageOffsetY || 0) / 100) * sourceHeight * 0.5;
  const left = (sourceWidth - drawWidth) / 2 + offsetX;
  const top = (sourceHeight - drawHeight) / 2 + offsetY;

  sourceCtx.save();
  sourceCtx.translate(left + drawWidth / 2, top + drawHeight / 2);
  sourceCtx.scale(scale, scale);
  sourceCtx.drawImage(state.image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  sourceCtx.restore();
}

function sampleCellColor(
  data,
  sourceWidth,
  sourceHeight,
  cellWidth,
  cellHeight,
  gridX,
  gridY,
  settings
) {
  const samples = [];
  const samplesPerAxis = settings.samplesPerAxis;
  let baseR = 0;
  let baseG = 0;
  let baseB = 0;
  let alphaTotal = 0;

  for (let sy = 0; sy < samplesPerAxis; sy += 1) {
    for (let sx = 0; sx < samplesPerAxis; sx += 1) {
      const offsetX = samplesPerAxis === 1 ? 0.5 : (sx + 0.5) / samplesPerAxis;
      const offsetY = samplesPerAxis === 1 ? 0.5 : (sy + 0.5) / samplesPerAxis;
      const sampleX = getSourceCoordinate(
        gridX,
        offsetX,
        cellWidth,
        state.gridWidth,
        state.mirrorX
      );
      const sampleY = getSourceCoordinate(
        gridY,
        offsetY,
        cellHeight,
        state.gridHeight,
        state.mirrorY
      );
      const pixel = getPixel(data, sourceWidth, sourceHeight, sampleX, sampleY);

      samples.push(pixel);
      baseR += pixel.rgb.r;
      baseG += pixel.rgb.g;
      baseB += pixel.rgb.b;
      alphaTotal += pixel.alpha;
    }
  }

  const sampleCount = samples.length || 1;
  const baseRgb = {
    r: Math.round(baseR / sampleCount),
    g: Math.round(baseG / sampleCount),
    b: Math.round(baseB / sampleCount)
  };
  const alphaCoverage = alphaTotal / sampleCount;

  if (alphaCoverage < 0.025 && isNearWhite(baseRgb, 18)) {
    return {
      rgb: WHITE_RGB,
      alphaCoverage,
      detailScore: 0,
      isBackground: true,
      paletteWeight: 0.04
    };
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

  const dominant = getDominantSampleColor(samples, baseRgb);
  if (dominant) {
    const blend = clamp01(0.28 + detailScore * 1.6 + dominant.coverage * 0.45);
    rgb = blendRgb(rgb, dominant.rgb, blend);
  }

  const isBackground = isNearWhite(rgb, 16) && detailScore < 0.055;
  if (isBackground) {
    rgb = WHITE_RGB;
  } else if (settings.colorBoost > 0) {
    rgb = boostPatternColor(rgb, settings.colorBoost, detailScore);
  }

  return {
    rgb,
    alphaCoverage,
    detailScore,
    isBackground,
    paletteWeight: isBackground ? 0.08 : 1 + Math.min(2.8, detailScore * 7)
  };
}

function getDominantSampleColor(samples, baseRgb) {
  const clusters = new Map();

  for (const sample of samples) {
    if (sample.alpha < 0.03) {
      continue;
    }

    const rgb = sample.rgb;
    if (isNearWhite(rgb, 18) && isNearWhite(baseRgb, 18)) {
      continue;
    }

    const salience = getPixelSalience(rgb, baseRgb, sample.alpha);
    const weight = Math.max(0.12, sample.alpha) * (0.65 + salience * 2.8);
    const key = `${Math.round(rgb.r / 16)}:${Math.round(rgb.g / 16)}:${Math.round(rgb.b / 16)}`;
    const existing = clusters.get(key);

    if (existing) {
      existing.weight += weight;
      existing.r += rgb.r * weight;
      existing.g += rgb.g * weight;
      existing.b += rgb.b * weight;
    } else {
      clusters.set(key, {
        weight,
        r: rgb.r * weight,
        g: rgb.g * weight,
        b: rgb.b * weight
      });
    }
  }

  let best = null;
  for (const cluster of clusters.values()) {
    if (!best || cluster.weight > best.weight) {
      best = cluster;
    }
  }

  if (!best || best.weight < 0.48) {
    return null;
  }

  const totalWeight = samples.reduce((sum, sample) => sum + Math.max(0.12, sample.alpha), 0) || 1;
  return {
    rgb: {
      r: Math.round(best.r / best.weight),
      g: Math.round(best.g / best.weight),
      b: Math.round(best.b / best.weight)
    },
    coverage: best.weight / totalWeight
  };
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

function getPixelSalience(rgb, baseRgb, alpha) {
  if (alpha < 0.02 && isNearWhite(rgb, 12)) {
    return 0;
  }

  const chroma = getRgbChroma(rgb);
  const whiteDistance = getRgbDistance(rgb, WHITE_RGB) / 441.7;
  const localContrast = getRgbDistance(rgb, baseRgb) / 441.7;
  const darkness = 1 - getRgbLuminance(rgb);

  return clamp01(
    alpha * (0.38 * chroma + 0.28 * whiteDistance + 0.24 * localContrast + 0.1 * darkness)
  );
}

function boostPatternColor(rgb, boost, detailScore) {
  if (isNearWhite(rgb, 12)) {
    return rgb;
  }

  const hsl = rgbToHsl(rgb);
  const detailFactor = clamp01(0.45 + detailScore * 2.4);
  const saturationBoost = 1 + boost * (0.8 + detailFactor);
  const contrastBoost = 1 + boost * 0.32;

  hsl.s = clamp01(hsl.s * saturationBoost);
  hsl.l = clamp01((hsl.l - 0.5) * contrastBoost + 0.5);

  if (hsl.s > 0.08 && hsl.l > 0.78) {
    hsl.l = Math.max(0.72, hsl.l - boost * 0.18);
  }

  return hslToRgb(hsl);
}

function isNearWhite(rgb, tolerance) {
  return getRgbDistance(rgb, WHITE_RGB) <= tolerance;
}

function getRgbDistance(first, second) {
  return Math.sqrt(
    Math.pow(first.r - second.r, 2) +
      Math.pow(first.g - second.g, 2) +
      Math.pow(first.b - second.b, 2)
  );
}

function getRgbChroma(rgb) {
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  return max <= 0 ? 0 : (max - min) / max;
}

function getRgbLuminance(rgb) {
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

function mapCellsToPattern(cells) {
  const targetSize = getActivePaletteLimit(cells.length);
  const palette = assignBeadColorCodes(
    ensureMandatoryColors(buildAutoPalette(cells, targetSize), cells, targetSize)
  );
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
    averageDelta: colors.length ? totalDistance / colors.length : 0
  };
}

function refinePatternColors(colors, cells) {
  const outlineColor = detectOutlineColor(colors, cells);
  if (!outlineColor) {
    return colors;
  }

  const refined = colors.map((color) => cloneColor(color));
  const width = state.gridWidth;
  const height = state.gridHeight;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    let changed = false;

    for (let index = 0; index < refined.length; index += 1) {
      const x = index % width;
      const y = Math.floor(index / width);
      const color = refined[index];
      const cell = cells[index];

      if (isOutlineLikeCell(color, outlineColor)) {
        if (!isBoundaryLikePosition(refined, cells, x, y, width, height)) {
          continue;
        }

        if (color.code !== outlineColor.code || color.hex !== outlineColor.hex) {
          refined[index] = cloneColor(outlineColor);
          changed = true;
        }
        continue;
      }

      if (!isBackgroundLikeCell(color, cell)) {
        continue;
      }

      const neighbors = getNeighborIndices(x, y, width, height);
      const outlineHits = neighbors.filter((neighborIndex) =>
        isOutlineLikeCell(refined[neighborIndex], outlineColor)
      ).length;
      const oppositeHits =
        hasOppositeOutline(refined, x, y, width, height, outlineColor) ||
        hasDiagonalOutline(refined, x, y, width, height, outlineColor);

      if (outlineHits >= 2 || oppositeHits) {
        refined[index] = cloneColor(outlineColor);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return refined;
}

function detectOutlineColor(colors, cells) {
  const counts = new Map();

  for (let index = 0; index < colors.length; index += 1) {
    const color = colors[index];
    const cell = cells[index];
    if (isBackgroundLikeCell(color, cell)) {
      continue;
    }

    const neighbors = getNeighborIndices(
      index % state.gridWidth,
      Math.floor(index / state.gridWidth),
      state.gridWidth,
      state.gridHeight
    );
    const backgroundNeighbors = neighbors.filter((neighborIndex) =>
      isBackgroundLikeCell(colors[neighborIndex], cells[neighborIndex])
    ).length;
    const edgeScore = getEdgeScore(index, state.gridWidth, state.gridHeight);
    if (edgeScore <= 0 && backgroundNeighbors <= 0) {
      continue;
    }

    const weight = 1 + edgeScore * 1.3 + backgroundNeighbors * 0.6;
    const key = `${Math.round(color.rgb.r / 12)}:${Math.round(color.rgb.g / 12)}:${Math.round(
      color.rgb.b / 12
    )}`;
    const existing = counts.get(key);
    if (existing) {
      existing.weight += weight;
      existing.r += color.rgb.r * weight;
      existing.g += color.rgb.g * weight;
      existing.b += color.rgb.b * weight;
    } else {
      counts.set(key, {
        weight,
        code: color.code,
        name: color.name,
        r: color.rgb.r * weight,
        g: color.rgb.g * weight,
        b: color.rgb.b * weight
      });
    }
  }

  let best = null;
  for (const cluster of counts.values()) {
    if (!best || cluster.weight > best.weight) {
      best = cluster;
    }
  }

  if (!best || best.weight < 3) {
    return null;
  }

  return createColor(best.code, best.name, {
    r: Math.round(best.r / best.weight),
    g: Math.round(best.g / best.weight),
    b: Math.round(best.b / best.weight)
  });
}

function isOutlineLikeCell(color, outlineColor) {
  if (!color || !outlineColor) {
    return false;
  }

  const codeMatch = color.code === outlineColor.code && color.code;
  const distance = getRgbDistance(color.rgb, outlineColor.rgb);
  return codeMatch || distance <= OUTLINE_COLOR_DISTANCE;
}

function isBackgroundLikeCell(color, cell) {
  if (!color) {
    return true;
  }

  return Boolean(
    cell?.isBackground ||
      isNearWhite(color.rgb, 18) ||
      color.code === KNOWN_COLOR_MATCHES[0].color.code
  );
}

function isBoundaryLikePosition(colors, cells, x, y, width, height) {
  const index = y * width + x;
  if (getEdgeScore(index, width, height) > 0) {
    return true;
  }

  return getNeighborIndices(x, y, width, height).some((neighborIndex) =>
    isBackgroundLikeCell(colors[neighborIndex], cells[neighborIndex])
  );
}

function getEdgeScore(index, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  const left = x;
  const right = width - 1 - x;
  const top = y;
  const bottom = height - 1 - y;
  return Math.max(0, OUTLINE_EDGE_BAND - Math.min(left, right, top, bottom) + 1);
}

function getNeighborIndices(x, y, width, height) {
  const indices = [];
  const positions = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1]
  ];

  for (const [nx, ny] of positions) {
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      indices.push(ny * width + nx);
    }
  }

  return indices;
}

function hasOppositeOutline(colors, x, y, width, height, outlineColor) {
  const left = x > 0 && isOutlineLikeCell(colors[y * width + (x - 1)], outlineColor);
  const right = x < width - 1 && isOutlineLikeCell(colors[y * width + (x + 1)], outlineColor);
  const up = y > 0 && isOutlineLikeCell(colors[(y - 1) * width + x], outlineColor);
  const down = y < height - 1 && isOutlineLikeCell(colors[(y + 1) * width + x], outlineColor);
  return (left && right) || (up && down);
}

function hasDiagonalOutline(colors, x, y, width, height, outlineColor) {
  const topLeft =
    x > 0 && y > 0 && isOutlineLikeCell(colors[(y - 1) * width + (x - 1)], outlineColor);
  const topRight =
    x < width - 1 && y > 0 && isOutlineLikeCell(colors[(y - 1) * width + (x + 1)], outlineColor);
  const bottomLeft =
    x > 0 &&
    y < height - 1 &&
    isOutlineLikeCell(colors[(y + 1) * width + (x - 1)], outlineColor);
  const bottomRight =
    x < width - 1 &&
    y < height - 1 &&
    isOutlineLikeCell(colors[(y + 1) * width + (x + 1)], outlineColor);
  return (topLeft && bottomRight) || (topRight && bottomLeft);
}

function buildAutoPalette(cells, targetSize) {
  const rawPoints = buildWeightedPoints(cells);
  const points = mergeWeightedPoints(
    compactWeightedPoints(rawPoints, AUTO_PALETTE_POINT_DELTA * 0.75),
    AUTO_PALETTE_POINT_DELTA
  );
  const colorCount = getAutoPaletteColorCount(points, targetSize);

  if (points.length <= colorCount) {
    return mergePaletteColors(
      points
        .map((point, index) => createWeightedAutoColor(point, index))
        .sort(compareColorForDisplay),
      AUTO_PALETTE_FINAL_DELTA
    );
  }

  let centroids = initializeCentroids(points, colorCount);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const clusters = centroids.map(() => createEmptyColorCluster());

    for (const point of points) {
      const index = nearestCentroidIndex(point.lab, centroids);
      addPointToColorCluster(clusters[index], point);
    }

    centroids = centroids.map((centroid, index) => {
      const cluster = clusters[index];
      if (!cluster.weight) {
        return farthestPoint(points, centroids);
      }

      return finalizeColorCluster(cluster);
    });
  }

  return mergePaletteColors(
    centroids
      .map((point, index) => createWeightedAutoColor(point, index))
      .sort(compareColorForDisplay),
    AUTO_PALETTE_FINAL_DELTA
  );
}

function getAutoPaletteColorCount(points, targetSize) {
  const maxCount = Math.max(1, Math.min(targetSize, points.length));
  if (maxCount <= 1) {
    return maxCount;
  }

  const estimatedPoints = mergeWeightedPoints(points, AUTO_PALETTE_ESTIMATE_DELTA);
  return Math.max(1, Math.min(maxCount, estimatedPoints.length));
}

function mergePaletteColors(palette, maxDelta) {
  if (palette.length <= 1) {
    return palette;
  }

  return mergeWeightedPoints(
    palette.map((color) => ({
      rgb: color.rgb,
      lab: color.lab,
      weight: color.weight || 1
    })),
    maxDelta
  )
    .map((point, index) => createWeightedAutoColor(point, index))
    .sort(compareColorForDisplay);
}

function createWeightedAutoColor(point, index) {
  return {
    ...createAutoColor(point.rgb, index),
    weight: point.weight || 1
  };
}

function mergeWeightedPoints(points, maxDelta) {
  if (points.length <= 1 || maxDelta <= 0) {
    return points;
  }

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
  if (points.length <= 1 || bucketSize <= 0) {
    return points;
  }

  const buckets = new Map();

  for (const point of points) {
    const key = getLabBucketKey(point.lab, bucketSize);
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

function getLabBucketKey(lab, bucketSize) {
  const safeSize = Math.max(1, bucketSize);
  return [
    Math.round(lab.l / safeSize),
    Math.round((lab.a + 128) / safeSize),
    Math.round((lab.b + 128) / safeSize)
  ].join(":");
}

function createEmptyColorCluster() {
  return {
    weight: 0,
    l: 0,
    a: 0,
    b: 0,
    r: 0,
    g: 0,
    blue: 0,
    rgb: WHITE_RGB,
    lab: rgbToLab(WHITE_RGB)
  };
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
  if (!cluster.weight) {
    return;
  }

  cluster.rgb = {
    r: Math.round(cluster.r / cluster.weight),
    g: Math.round(cluster.g / cluster.weight),
    b: Math.round(cluster.blue / cluster.weight)
  };
  cluster.lab = {
    l: cluster.l / cluster.weight,
    a: cluster.a / cluster.weight,
    b: cluster.b / cluster.weight
  };
}

function finalizeColorCluster(cluster) {
  return {
    rgb: {
      r: clampChannel(cluster.r / cluster.weight),
      g: clampChannel(cluster.g / cluster.weight),
      b: clampChannel(cluster.blue / cluster.weight)
    },
    lab: {
      l: cluster.l / cluster.weight,
      a: cluster.a / cluster.weight,
      b: cluster.b / cluster.weight
    },
    weight: cluster.weight
  };
}

function ensureMandatoryColors(palette, cells, targetSize) {
  const needsWhite = cells.some((cell) => cell.isBackground || isNearWhite(cell.rgb, 12));
  if (!needsWhite) {
    return palette;
  }

  const white = cloneColor(KNOWN_COLOR_MATCHES[0].color);
  const paletteWithoutWhite = palette.filter(
    (color) => color.code !== white.code && color.hex !== white.hex
  );

  return [white, ...paletteWithoutWhite]
    .slice(0, Math.max(1, targetSize))
    .sort(compareColorForDisplay);
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
      map.set(key, {
        rgb: cell.rgb,
        lab: cell.lab,
        weight
      });
    }
  }

  return [...map.values()];
}

function initializeCentroids(points, count) {
  const centroids = [];
  const first = pointClosestToAverage(points);
  centroids.push({ rgb: first.rgb, lab: first.lab });

  while (centroids.length < count) {
    const next = farthestPoint(points, centroids);
    centroids.push({ rgb: next.rgb, lab: next.lab });
  }

  return centroids;
}

function pointClosestToAverage(points) {
  const average = points.reduce(
    (acc, point) => {
      acc.weight += point.weight;
      acc.l += point.lab.l * point.weight;
      acc.a += point.lab.a * point.weight;
      acc.b += point.lab.b * point.weight;
      return acc;
    },
    { weight: 0, l: 0, a: 0, b: 0 }
  );

  const averageLab = {
    l: average.l / average.weight,
    a: average.a / average.weight,
    b: average.b / average.weight
  };

  let best = points[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const distance = labDistanceSquared(point.lab, averageLab);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
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

  return best;
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

function toRows(colors, width) {
  const rows = [];
  for (let index = 0; index < colors.length; index += width) {
    rows.push(colors.slice(index, index + width));
  }
  return rows;
}

function drawPattern() {
  if (!state.pattern.length) {
    drawEmptyCanvas();
    return;
  }

  const cell = state.cellSize;
  const width = state.gridWidth * cell;
  const height = state.gridHeight * cell;
  const canvasWidth = width + RULER_SIZE;
  const canvasHeight = height + RULER_SIZE;
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

  els.patternCanvas.width = Math.round(canvasWidth * dpr);
  els.patternCanvas.height = Math.round(canvasHeight * dpr);
  els.patternCanvas.style.width = `${canvasWidth}px`;
  els.patternCanvas.style.height = `${canvasHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  drawRulers(ctx, cell, width, height);

  for (let y = 0; y < state.gridHeight; y += 1) {
    for (let x = 0; x < state.gridWidth; x += 1) {
      const color = state.pattern[y][x];
      ctx.fillStyle = color.hex;
      ctx.fillRect(RULER_SIZE + x * cell, RULER_SIZE + y * cell, cell, cell);

      const label = getCellLabel(color);
      if (state.showCodes && label && cell >= 17) {
        ctx.fillStyle = readableTextColor(color.rgb);
        ctx.font = `${Math.max(8, Math.floor(cell * 0.34))}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, RULER_SIZE + x * cell + cell / 2, RULER_SIZE + y * cell + cell / 2);
      }
    }
  }

  if (state.showGrid) {
    drawGrid(RULER_SIZE, RULER_SIZE, width, height, cell);
  }

  els.canvasStage.classList.add("has-result");
  els.resultTitle.textContent = `${state.imageName || "未命名图片"} · ${state.gridWidth} x ${state.gridHeight}`;
  els.summaryStrip.innerHTML = `<span>${state.stats.length} 色</span><span>${
    state.gridWidth * state.gridHeight
  } 颗</span><span>${state.gridWidth} x ${state.gridHeight}</span><span>上限 ${state.colorPackage} 色</span><span>ΔE ${state.averageDelta.toFixed(1)}</span>`;
  updateBoardMeta();
}

function drawGrid(offsetX, offsetY, width, height, cell) {
  drawGridOnContext(ctx, offsetX, offsetY, width, height, cell);
}

function drawGridOnContext(targetCtx, offsetX, offsetY, width, height, cell) {
  targetCtx.save();
  targetCtx.lineWidth = 1;

  for (let x = 0; x <= state.gridWidth; x += 1) {
    targetCtx.strokeStyle =
      x % 10 === 0
        ? "rgba(28, 37, 41, 0.48)"
        : x % 5 === 0
          ? "rgba(15, 143, 134, 0.58)"
          : "rgba(28, 37, 41, 0.12)";
    targetCtx.lineWidth = x % 10 === 0 ? 1.2 : x % 5 === 0 ? 1.1 : 1;
    targetCtx.beginPath();
    targetCtx.moveTo(offsetX + x * cell + 0.5, offsetY);
    targetCtx.lineTo(offsetX + x * cell + 0.5, offsetY + height);
    targetCtx.stroke();
  }

  for (let y = 0; y <= state.gridHeight; y += 1) {
    targetCtx.strokeStyle =
      y % 10 === 0
        ? "rgba(28, 37, 41, 0.48)"
        : y % 5 === 0
          ? "rgba(15, 143, 134, 0.58)"
          : "rgba(28, 37, 41, 0.12)";
    targetCtx.lineWidth = y % 10 === 0 ? 1.2 : y % 5 === 0 ? 1.1 : 1;
    targetCtx.beginPath();
    targetCtx.moveTo(offsetX, offsetY + y * cell + 0.5);
    targetCtx.lineTo(offsetX + width, offsetY + y * cell + 0.5);
    targetCtx.stroke();
  }

  targetCtx.restore();
}

function drawRulers(targetCtx, cell, width, height) {
  targetCtx.save();
  targetCtx.fillStyle = "#f5f8f8";
  targetCtx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
  targetCtx.fillRect(RULER_SIZE, 0, width, RULER_SIZE);
  targetCtx.fillRect(0, RULER_SIZE, RULER_SIZE, height);
  targetCtx.strokeStyle = "rgba(28, 37, 41, 0.16)";
  targetCtx.strokeRect(0.5, 0.5, width + RULER_SIZE - 1, height + RULER_SIZE - 1);

  targetCtx.fillStyle = "rgba(28, 37, 41, 0.72)";
  targetCtx.font = "700 11px ui-sans-serif, system-ui";
  targetCtx.textAlign = "center";
  targetCtx.textBaseline = "middle";

  for (let x = 0; x < state.gridWidth; x += 1) {
    if (x % 5 !== 0 && x !== state.gridWidth - 1) {
      continue;
    }
    const label = x + 1;
    targetCtx.fillText(
      String(label),
      RULER_SIZE + x * cell + cell / 2,
      Math.max(10, RULER_SIZE / 2)
    );
  }

  targetCtx.textAlign = "right";
  for (let y = 0; y < state.gridHeight; y += 1) {
    if (y % 5 !== 0 && y !== state.gridHeight - 1) {
      continue;
    }
    const label = y + 1;
    targetCtx.fillText(
      String(label),
      Math.max(10, RULER_SIZE - LABEL_GAP),
      RULER_SIZE + y * cell + cell / 2
    );
  }

  targetCtx.textAlign = "left";
  targetCtx.fillText(`${state.gridWidth} 宽`, RULER_SIZE + width - 42, 10);
  targetCtx.save();
  targetCtx.translate(8, RULER_SIZE + height - 8);
  targetCtx.rotate(-Math.PI / 2);
  targetCtx.fillText(`${state.gridHeight} 高`, 0, 0);
  targetCtx.restore();
  targetCtx.restore();
}

function drawEmptyCanvas() {
  const { width, height } = getEmptyCanvasSize();
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

  els.patternCanvas.width = Math.round(width * dpr);
  els.patternCanvas.height = Math.round(height * dpr);
  els.patternCanvas.style.width = `${width}px`;
  els.patternCanvas.style.height = `${height}px`;
  els.canvasStage.classList.remove("has-result");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

function getEmptyCanvasSize() {
  const stageStyles = window.getComputedStyle(els.canvasStage);
  const canvasStyles = window.getComputedStyle(els.patternCanvas);
  const horizontalPadding =
    parseFloat(canvasStyles.marginLeft) + parseFloat(canvasStyles.marginRight);
  const verticalPadding =
    parseFloat(canvasStyles.marginTop) + parseFloat(canvasStyles.marginBottom);
  const availableWidth = Math.max(320, els.canvasStage.clientWidth - horizontalPadding);
  const availableHeight = Math.max(360, els.canvasStage.clientHeight - verticalPadding);

  return {
    width: Math.round(availableWidth),
    height: Math.round(
      Math.max(360, Math.min(availableHeight, parseFloat(stageStyles.minHeight) || 540))
    )
  };
}

function renderStats() {
  els.paletteList.innerHTML = "";
  const totalCount = state.gridWidth * state.gridHeight;
  els.paletteMeta.textContent = `${state.stats.length} 个颜色 · 上限 ${state.colorPackage} 色 · 总计 ${totalCount} 颗 · 平均色差 ΔE ${state.averageDelta.toFixed(1)}`;

  const fragment = document.createDocumentFragment();
  state.stats.forEach((item) => {
    const row = document.createElement("div");
    row.className = `color-item${isLightColor(item.rgb) ? " light-color" : ""}`;
    row.innerHTML = `
      <div class="swatch" style="background:${item.hex}"></div>
      <div class="color-name">
        <strong>${item.code}</strong>
        <span>${item.name} · ${item.hex.toUpperCase()}</span>
      </div>
      <div class="color-count"><strong>${item.count}</strong><span>颗</span></div>
    `;
    fragment.appendChild(row);
  });
  els.paletteList.appendChild(fragment);
  renderRequiredColors(totalCount);
}

function renderRequiredColors(totalCount) {
  els.requiredTitle.textContent = `包含以下 ${state.stats.length} 种颜色（总计数量 ${totalCount}）`;
  els.requiredList.innerHTML = "";

  const fragment = document.createDocumentFragment();
  state.stats.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = `required-chip${isLightColor(item.rgb) ? " light-color" : ""}`;
    chip.style.background = item.hex;
    chip.style.color = readableTextColor(item.rgb);
    chip.title = `${item.code} · ${item.name} · ${item.count}`;
    chip.innerHTML = `<strong>${getDisplayCode(item)}</strong><span>${item.count}</span>`;
    fragment.appendChild(chip);
  });

  els.requiredList.appendChild(fragment);
}

function exportPng() {
  if (!state.pattern.length) {
    return;
  }

  const exportCanvas = createExportCanvas();
  const link = document.createElement("a");
  link.download = `${baseFileName()}-pattern.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}

function createExportCanvas() {
  const scale = 2;
  const cell = Math.max(18, state.cellSize);
  const patternWidth = state.gridWidth * cell;
  const patternHeight = state.gridHeight * cell;
  const canvasWidth = patternWidth + RULER_SIZE;
  const canvasHeight = patternHeight + RULER_SIZE;
  const padding = 30;
  const legendHeader = 52;
  const itemHeight = 54;
  const itemMinWidth = 148;
  const columns = Math.max(1, Math.floor((canvasWidth - padding * 2) / itemMinWidth));
  const itemWidth = Math.floor((canvasWidth - padding * 2) / columns);
  const legendRows = Math.ceil(state.stats.length / columns);
  const legendHeight = padding + legendHeader + legendRows * itemHeight + padding;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(canvasWidth * scale);
  canvas.height = Math.ceil((canvasHeight + legendHeight) * scale);

  const exportCtx = canvas.getContext("2d");
  exportCtx.scale(scale, scale);
  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, canvasWidth, canvasHeight + legendHeight);

  drawPatternForExport(exportCtx, cell, patternWidth, patternHeight);
  drawLegendForExport(exportCtx, {
    top: canvasHeight,
    width: canvasWidth,
    padding,
    legendHeader,
    itemHeight,
    itemWidth,
    columns,
    legendHeight
  });

  return canvas;
}

function drawPatternForExport(exportCtx, cell, width, height) {
  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, width + RULER_SIZE, height + RULER_SIZE);
  drawRulers(exportCtx, cell, width, height);

  for (let y = 0; y < state.gridHeight; y += 1) {
    for (let x = 0; x < state.gridWidth; x += 1) {
      const color = state.pattern[y][x];
      exportCtx.fillStyle = color.hex;
      exportCtx.fillRect(RULER_SIZE + x * cell, RULER_SIZE + y * cell, cell, cell);

      const label = getDisplayCode(color);
      if (label && cell >= 9) {
        exportCtx.fillStyle = readableTextColor(color.rgb);
        exportCtx.font = `${Math.max(9, Math.floor(cell * 0.28))}px ui-sans-serif, system-ui`;
        exportCtx.textAlign = "center";
        exportCtx.textBaseline = "middle";
        exportCtx.fillText(
          label,
          RULER_SIZE + x * cell + cell / 2,
          RULER_SIZE + y * cell + cell / 2
        );
      }
    }
  }

  if (state.showGrid) {
    drawGridOnContext(exportCtx, RULER_SIZE, RULER_SIZE, width, height, cell);
  }
}

function drawLegendForExport(exportCtx, options) {
  const {
    top,
    width,
    padding,
    legendHeader,
    itemHeight,
    itemWidth,
    columns,
    legendHeight
  } = options;
  const totalCount = state.gridWidth * state.gridHeight;

  exportCtx.fillStyle = "#fff4bd";
  exportCtx.fillRect(0, top, width, legendHeight);
  exportCtx.strokeStyle = "#efaa63";
  exportCtx.lineWidth = 3;
  exportCtx.beginPath();
  exportCtx.moveTo(0, top + 1.5);
  exportCtx.lineTo(width, top + 1.5);
  exportCtx.stroke();

  exportCtx.fillStyle = "#352729";
  exportCtx.font = "900 24px ui-sans-serif, system-ui";
  exportCtx.textAlign = "left";
  exportCtx.textBaseline = "middle";
  exportCtx.fillText(
    `所需颜色：${state.stats.length} 种 / 总计 ${totalCount} 颗 / 上限 ${state.colorPackage} 色`,
    padding,
    top + 32
  );

  state.stats.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + column * itemWidth;
    const y = top + legendHeader + row * itemHeight;
    const swatchSize = 34;

    exportCtx.fillStyle = item.hex;
    exportCtx.fillRect(x, y + 10, swatchSize, swatchSize);
    exportCtx.strokeStyle = "rgba(53, 39, 41, 0.28)";
    exportCtx.lineWidth = 1;
    exportCtx.strokeRect(x + 0.5, y + 10.5, swatchSize - 1, swatchSize - 1);

    exportCtx.fillStyle = "#352729";
    exportCtx.font = "900 16px ui-sans-serif, system-ui";
    exportCtx.fillText(getDisplayCode(item), x + swatchSize + 10, y + 20);
    exportCtx.font = "700 13px ui-sans-serif, system-ui";
    exportCtx.fillStyle = "#6f5557";
    exportCtx.fillText(`${item.count} 颗`, x + swatchSize + 10, y + 39);
  });
}

function exportCsv() {
  if (!state.stats.length) {
    return;
  }

  const rows = [
    ["色号", "名称", "HEX", "颗数"],
    ...state.stats.map((item) => [item.code, item.name, item.hex.toUpperCase(), item.count])
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  downloadBlob(`${baseFileName()}-colors.csv`, csv, "text/csv;charset=utf-8");
}

function exportJson() {
  if (!state.pattern.length) {
    return;
  }

  const data = {
    source: state.imageName,
    scheme: "default",
    colorPackage: state.colorPackage,
    sampleMode: state.sampleMode,
    mirror: {
      horizontal: state.mirrorX,
      vertical: state.mirrorY
    },
    averageDelta: Number(state.averageDelta.toFixed(3)),
    grid: {
      width: state.gridWidth,
      height: state.gridHeight
    },
    palette: state.stats.map(({ code, name, hex, count }) => ({ code, name, hex, count })),
    cells: state.pattern.map((row) => row.map((item) => item.code))
  };

  downloadBlob(
    `${baseFileName()}-pattern.json`,
    JSON.stringify(data, null, 2),
    "application/json;charset=utf-8"
  );
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
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

function createAutoColor(rgb, index) {
  const knownColor = findKnownColorMatch(rgb);
  if (knownColor) {
    return cloneColor(knownColor);
  }

  return createColor("", "", rgb);
}

function createColor(code, name, rgb) {
  const normalized = {
    r: clampChannel(rgb.r),
    g: clampChannel(rgb.g),
    b: clampChannel(rgb.b)
  };

  return {
    code,
    name,
    rgb: normalized,
    hex: rgbToHex(normalized),
    lab: rgbToLab(normalized)
  };
}

function findKnownColorMatch(rgb) {
  const hex = rgbToHex(rgb).toUpperCase();
  const exactMatch = KNOWN_COLOR_MATCHES.find((entry) => entry.color.hex.toUpperCase() === hex);
  if (exactMatch) {
    return exactMatch.color;
  }

  const lab = rgbToLab(rgb);
  const closeMatch = KNOWN_COLOR_MATCHES.find(
    (entry) => Math.sqrt(labDistanceSquared(lab, entry.color.lab)) <= entry.maxDelta
  );

  return closeMatch?.color || null;
}

function cloneColor(color) {
  return {
    ...color,
    rgb: { ...color.rgb },
    lab: { ...color.lab }
  };
}

function assignBeadColorCodes(colors) {
  const usedCodes = new Set(
    colors
      .filter((color) => isFixedColorCode(color.code))
      .map((color) => color.code)
  );
  const generatedCodeMap = new Map();

  return colors.map((color) => {
    if (isFixedColorCode(color.code)) {
      return cloneColor(color);
    }

    const sourceKey = getGeneratedColorKey(color);
    let code = generatedCodeMap.get(sourceKey);

    if (!code) {
      code = getNextAvailableBeadCode(usedCodes);
      generatedCodeMap.set(sourceKey, code);
      usedCodes.add(code);
    }

    return {
      ...cloneColor(color),
      code,
      name: getGeneratedColorName(code)
    };
  });
}

function isFixedColorCode(code) {
  return Boolean(code) && !String(code).startsWith("AUTO-");
}

function getGeneratedColorKey(color) {
  return color.code || color.hex.toUpperCase();
}

function getNextAvailableBeadCode(usedCodes) {
  const availableCode = BEAD_COLOR_CODES.find(
    (code) => !usedCodes.has(code) && !RESERVED_MATCH_CODES.has(code)
  );

  if (availableCode) {
    return availableCode;
  }

  return (
    BEAD_COLOR_CODES.find((code) => !usedCodes.has(code)) ||
    BEAD_COLOR_CODES[BEAD_COLOR_CODES.length - 1]
  );
}

function getGeneratedColorName(code) {
  return `${code.slice(0, 1)}系列色号`;
}

function compareColorForDisplay(a, b) {
  const hueA = Math.atan2(a.lab.b, a.lab.a);
  const hueB = Math.atan2(b.lab.b, b.lab.a);
  return a.lab.l - b.lab.l || hueA - hueB || a.code.localeCompare(b.code);
}

function getDisplayCode(color) {
  return getCellLabel(color) || color.code;
}

function getCellLabel(color) {
  if (color.code.startsWith("PD-")) {
    return color.code.slice(3);
  }
  if (color.code.startsWith("AUTO-")) {
    return color.code.slice(5);
  }
  return color.code;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
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
    if (max === red) {
      h = ((green - blue) / delta) % 6;
    } else if (max === green) {
      h = (blue - red) / delta + 2;
    } else {
      h = (red - green) / delta + 4;
    }
    h /= 6;
    if (h < 0) {
      h += 1;
    }
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
  const xn = 95.047;
  const yn = 100;
  const zn = 108.883;
  const fx = pivotXyz(x / xn);
  const fy = pivotXyz(y / yn);
  const fz = pivotXyz(z / zn);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function rgbToXyz(r, g, b) {
  const srgb = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel > 0.04045
      ? Math.pow((channel + 0.055) / 1.055, 2.4)
      : channel / 12.92;
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
  return (
    Math.pow(first.l - second.l, 2) +
    Math.pow(first.a - second.a, 2) +
    Math.pow(first.b - second.b, 2)
  );
}

function blendAgainstWhite(r, g, b, alpha) {
  return {
    r: Math.round(r * alpha + 255 * (1 - alpha)),
    g: Math.round(g * alpha + 255 * (1 - alpha)),
    b: Math.round(b * alpha + 255 * (1 - alpha))
  };
}

function readableTextColor(rgb) {
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.58 ? "rgba(20, 26, 29, 0.82)" : "rgba(255, 255, 255, 0.9)";
}

function isLightColor(rgb) {
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.74;
}

function syncHeightFromRatio() {
  if (!state.lockRatio || !state.image) {
    return;
  }

  const ratio = state.image.naturalHeight / state.image.naturalWidth;
  state.gridHeight = Math.max(8, Math.min(240, Math.round(state.gridWidth * ratio)));
  els.gridHeight.value = String(state.gridHeight);
}

function updateBoardMeta() {
  if (!els.boardMeta) {
    return;
  }

  els.boardMeta.textContent = `当前：${state.gridWidth} x ${state.gridHeight} 颗`;
  for (const button of els.panelPresets.querySelectorAll("[data-size]")) {
    const size = Number(button.dataset.size);
    button.classList.toggle("active", state.gridWidth === size && state.gridHeight === size);
  }
}

function selectColorPackage(size) {
  const fallback = COLOR_PACKAGES[0].size;
  const exists = COLOR_PACKAGES.some((item) => item.size === size);
  state.colorPackage = exists ? size : fallback;

  els.packageOptions.querySelectorAll("[data-package]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.package) === state.colorPackage);
  });
}

function getActivePaletteLimit(cellCount) {
  const currentPackage =
    COLOR_PACKAGES.find((item) => item.size === state.colorPackage) || COLOR_PACKAGES[0];
  return Math.max(1, Math.min(currentPackage.outputLimit, cellCount));
}

function normalizeNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function blendRgb(first, second, amount) {
  const weight = clamp01(amount);
  return {
    r: Math.round(first.r * (1 - weight) + second.r * weight),
    g: Math.round(first.g * (1 - weight) + second.g * weight),
    b: Math.round(first.b * (1 - weight) + second.b * weight)
  };
}

function baseFileName() {
  return (state.imageName || "bead-pattern").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-");
}

function setStatus(text, ready) {
  els.statusPill.textContent = text;
  els.statusPill.classList.toggle("ready", ready);
}

function enableExports(enabled) {
  els.exportPng.disabled = !enabled;
  els.exportCsv.disabled = !enabled;
  els.exportJson.disabled = !enabled;
}
