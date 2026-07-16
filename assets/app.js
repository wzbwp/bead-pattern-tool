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
    label: `A-M 全色号 (${BEAD_COLOR_CODES.length})`,
    outputLimit: BEAD_COLOR_CODES.length
  },
  { size: 24, label: "24 色 (24)", outputLimit: 24 },
  { size: 48, label: "48 色 (48)", outputLimit: 48 },
  { size: 72, label: "72 色 (72)", outputLimit: 72 }
];

const KNOWN_COLOR_MATCHES = [
  {
    color: createColor("H2", "白色", { r: 255, g: 255, b: 255 }),
    maxDelta: 3
  }
];

const RESERVED_MATCH_CODES = new Set(KNOWN_COLOR_MATCHES.map((entry) => entry.color.code));

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
  sampleMode: "average",
  lockRatio: true,
  showGrid: true,
  showCodes: false,
  averageDelta: 0
};

const els = {
  imageInput: document.querySelector("#imageInput"),
  dropzone: document.querySelector("#dropzone"),
  fileMeta: document.querySelector("#fileMeta"),
  sourcePreview: document.querySelector("#sourcePreview"),
  gridWidth: document.querySelector("#gridWidth"),
  gridHeight: document.querySelector("#gridHeight"),
  lockRatio: document.querySelector("#lockRatio"),
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
    scheduleParse();
  });

  els.gridHeight.addEventListener("input", () => {
    state.gridHeight = normalizeNumber(els.gridHeight.value, 8, 240, 80);
    state.lockRatio = false;
    els.lockRatio.checked = false;
    scheduleParse();
  });

  els.lockRatio.addEventListener("change", () => {
    state.lockRatio = els.lockRatio.checked;
    syncHeightFromRatio();
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
    scheduleParse();
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
      els.sourcePreview.innerHTML = "";

      const preview = document.createElement("img");
      preview.src = reader.result;
      preview.alt = file.name;
      els.sourcePreview.appendChild(preview);

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

function scheduleParse() {
  clearTimeout(parseTimer);
  parseTimer = window.setTimeout(() => {
    if (state.image) {
      parseImage();
    }
  }, 120);
}

function parseImage() {
  if (!state.image) {
    return;
  }

  state.gridWidth = normalizeNumber(els.gridWidth.value, 8, 240, 80);
  state.gridHeight = normalizeNumber(els.gridHeight.value, 8, 240, 80);
  state.sampleMode = els.sampleMode.value;

  setStatus("解析中", false);

  const sourceCells = sampleImageCells();
  const mapped = mapCellsToPattern(sourceCells);

  state.sourceCells = sourceCells;
  state.pattern = toRows(mapped.colors, state.gridWidth);
  state.stats = buildStats(mapped.colors);
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
  sourceCtx.imageSmoothingEnabled = true;
  sourceCtx.imageSmoothingQuality = "high";
  sourceCtx.drawImage(state.image, 0, 0, sourceWidth, sourceHeight);

  const imageData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight).data;
  const cells = [];
  const cellWidth = sourceWidth / state.gridWidth;
  const cellHeight = sourceHeight / state.gridHeight;
  const samplesPerAxis = state.sampleMode === "center" ? 1 : 5;

  for (let y = 0; y < state.gridHeight; y += 1) {
    for (let x = 0; x < state.gridWidth; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let samples = 0;

      for (let sy = 0; sy < samplesPerAxis; sy += 1) {
        for (let sx = 0; sx < samplesPerAxis; sx += 1) {
          const sampleX =
            state.sampleMode === "center"
              ? (x + 0.5) * cellWidth
              : (x + (sx + 0.5) / samplesPerAxis) * cellWidth;
          const sampleY =
            state.sampleMode === "center"
              ? (y + 0.5) * cellHeight
              : (y + (sy + 0.5) / samplesPerAxis) * cellHeight;
          const pixel = getPixel(imageData, sourceWidth, sourceHeight, sampleX, sampleY);
          r += pixel.r;
          g += pixel.g;
          b += pixel.b;
          samples += 1;
        }
      }

      const rgb = {
        r: Math.round(r / samples),
        g: Math.round(g / samples),
        b: Math.round(b / samples)
      };

      cells.push({
        rgb,
        hex: rgbToHex(rgb),
        lab: rgbToLab(rgb)
      });
    }
  }

  return cells;
}

function getPixel(data, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const index = (py * width + px) * 4;
  const alpha = data[index + 3] / 255;

  return blendAgainstWhite(data[index], data[index + 1], data[index + 2], alpha);
}

function mapCellsToPattern(cells) {
  const palette = assignBeadColorCodes(
    buildAutoPalette(cells, getActivePaletteLimit(cells.length))
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

function buildAutoPalette(cells, targetSize) {
  const points = buildWeightedPoints(cells);
  const colorCount = Math.max(1, Math.min(targetSize, points.length));

  if (points.length <= colorCount) {
    return points
      .map((point, index) => createAutoColor(point.rgb, index))
      .sort(compareColorForDisplay);
  }

  let centroids = initializeCentroids(points, colorCount);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const clusters = centroids.map(() => ({
      weight: 0,
      l: 0,
      a: 0,
      b: 0,
      r: 0,
      g: 0,
      blue: 0
    }));

    for (const point of points) {
      const index = nearestCentroidIndex(point.lab, centroids);
      const cluster = clusters[index];
      cluster.weight += point.weight;
      cluster.l += point.lab.l * point.weight;
      cluster.a += point.lab.a * point.weight;
      cluster.b += point.lab.b * point.weight;
      cluster.r += point.rgb.r * point.weight;
      cluster.g += point.rgb.g * point.weight;
      cluster.blue += point.rgb.b * point.weight;
    }

    centroids = centroids.map((centroid, index) => {
      const cluster = clusters[index];
      if (!cluster.weight) {
        return farthestPoint(points, centroids);
      }

      const rgb = {
        r: Math.round(cluster.r / cluster.weight),
        g: Math.round(cluster.g / cluster.weight),
        b: Math.round(cluster.blue / cluster.weight)
      };

      return {
        rgb,
        lab: {
          l: cluster.l / cluster.weight,
          a: cluster.a / cluster.weight,
          b: cluster.b / cluster.weight
        }
      };
    });
  }

  return centroids
    .map((centroid, index) => createAutoColor(centroid.rgb, index))
    .sort(compareColorForDisplay);
}

function buildWeightedPoints(cells) {
  const map = new Map();

  for (const cell of cells) {
    const key = cell.hex;
    const existing = map.get(key);
    if (existing) {
      existing.weight += 1;
    } else {
      map.set(key, {
        rgb: cell.rgb,
        lab: cell.lab,
        weight: 1
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
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

  els.patternCanvas.width = Math.round(width * dpr);
  els.patternCanvas.height = Math.round(height * dpr);
  els.patternCanvas.style.width = `${width}px`;
  els.patternCanvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  for (let y = 0; y < state.gridHeight; y += 1) {
    for (let x = 0; x < state.gridWidth; x += 1) {
      const color = state.pattern[y][x];
      ctx.fillStyle = color.hex;
      ctx.fillRect(x * cell, y * cell, cell, cell);

      const label = getCellLabel(color);
      if (state.showCodes && label && cell >= 17) {
        ctx.fillStyle = readableTextColor(color.rgb);
        ctx.font = `${Math.max(8, Math.floor(cell * 0.34))}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x * cell + cell / 2, y * cell + cell / 2);
      }
    }
  }

  if (state.showGrid) {
    drawGrid(width, height, cell);
  }

  els.canvasStage.classList.add("has-result");
  els.resultTitle.textContent = `${state.imageName || "未命名图片"} · ${state.gridWidth} x ${state.gridHeight}`;
  els.summaryStrip.innerHTML = `<span>${state.stats.length} 色</span><span>${
    state.gridWidth * state.gridHeight
  } 颗</span><span>ΔE ${state.averageDelta.toFixed(1)}</span>`;
}

function drawGrid(width, height, cell) {
  drawGridOnContext(ctx, 0, 0, width, height, cell);
}

function drawGridOnContext(targetCtx, offsetX, offsetY, width, height, cell) {
  targetCtx.save();
  targetCtx.lineWidth = 1;

  for (let x = 0; x <= state.gridWidth; x += 1) {
    targetCtx.strokeStyle =
      x % 10 === 0 ? "rgba(28, 37, 41, 0.42)" : "rgba(28, 37, 41, 0.16)";
    targetCtx.beginPath();
    targetCtx.moveTo(offsetX + x * cell + 0.5, offsetY);
    targetCtx.lineTo(offsetX + x * cell + 0.5, offsetY + height);
    targetCtx.stroke();
  }

  for (let y = 0; y <= state.gridHeight; y += 1) {
    targetCtx.strokeStyle =
      y % 10 === 0 ? "rgba(28, 37, 41, 0.42)" : "rgba(28, 37, 41, 0.16)";
    targetCtx.beginPath();
    targetCtx.moveTo(offsetX, offsetY + y * cell + 0.5);
    targetCtx.lineTo(offsetX + width, offsetY + y * cell + 0.5);
    targetCtx.stroke();
  }

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
  els.paletteMeta.textContent = `${state.stats.length} 个颜色 · 总计 ${totalCount} 颗 · 平均色差 ΔE ${state.averageDelta.toFixed(1)}`;

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
  const cell = Math.max(14, state.cellSize);
  const patternWidth = state.gridWidth * cell;
  const patternHeight = state.gridHeight * cell;
  const padding = 30;
  const legendHeader = 52;
  const itemHeight = 54;
  const itemMinWidth = 148;
  const columns = Math.max(1, Math.floor((patternWidth - padding * 2) / itemMinWidth));
  const itemWidth = Math.floor((patternWidth - padding * 2) / columns);
  const legendRows = Math.ceil(state.stats.length / columns);
  const legendHeight = padding + legendHeader + legendRows * itemHeight + padding;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(patternWidth * scale);
  canvas.height = Math.ceil((patternHeight + legendHeight) * scale);

  const exportCtx = canvas.getContext("2d");
  exportCtx.scale(scale, scale);
  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, patternWidth, patternHeight + legendHeight);

  drawPatternForExport(exportCtx, cell, patternWidth, patternHeight);
  drawLegendForExport(exportCtx, {
    top: patternHeight,
    width: patternWidth,
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
  exportCtx.fillRect(0, 0, width, height);

  for (let y = 0; y < state.gridHeight; y += 1) {
    for (let x = 0; x < state.gridWidth; x += 1) {
      const color = state.pattern[y][x];
      exportCtx.fillStyle = color.hex;
      exportCtx.fillRect(x * cell, y * cell, cell, cell);

      const label = getCellLabel(color);
      if (state.showCodes && label && cell >= 17) {
        exportCtx.fillStyle = readableTextColor(color.rgb);
        exportCtx.font = `${Math.max(8, Math.floor(cell * 0.34))}px ui-sans-serif, system-ui`;
        exportCtx.textAlign = "center";
        exportCtx.textBaseline = "middle";
        exportCtx.fillText(label, x * cell + cell / 2, y * cell + cell / 2);
      }
    }
  }

  if (state.showGrid) {
    drawGridOnContext(exportCtx, 0, 0, width, height, cell);
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
    `所需颜色：${state.stats.length} 种 / 总计 ${totalCount} 颗 / 套餐 ${state.colorPackage} 色`,
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
