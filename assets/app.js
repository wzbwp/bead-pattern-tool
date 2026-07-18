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

const MARD_COLOR_PALETTE_DATA = globalThis.__MARD_COLOR_PALETTE_DATA__ || [];
const MARD_COLOR_PALETTE = MARD_COLOR_PALETTE_DATA.map(({ code, rgb }) =>
  createColor(code, `${code.slice(0, 1)}系列色号`, rgb)
);
const MARD_COLOR_BY_CODE = new Map(
  MARD_COLOR_PALETTE.map((color) => [color.code, color])
);

const COLOR_PACKAGES = [
  { size: 0, label: "自动匹配颜色", outputLimit: 72 },
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
    color:
      MARD_COLOR_BY_CODE.get("H2") ||
      createColor("H2", "白色", { r: 255, g: 255, b: 255 }),
    maxDelta: 6
  },
  {
    color:
      MARD_COLOR_BY_CODE.get("H7") ||
      createColor("H7", "黑色", { r: 17, g: 17, b: 17 }),
    maxDelta: 12
  }
];

const RESERVED_MATCH_CODES = new Set(KNOWN_COLOR_MATCHES.map((entry) => entry.color.code));
const WHITE_RGB = { r: 255, g: 255, b: 255 };
// Package choices are maximums; these thresholds collapse sampling noise into real bead colors.
const AUTO_PALETTE_POINT_DELTA = 4.8;
const AUTO_PALETTE_ESTIMATE_DELTA = 11.5;
const AUTO_PALETTE_FINAL_DELTA = 6.8;
const WHITE_DETAIL_LUMINANCE = 0.9;
const WHITE_DETAIL_CHROMA = 0.08;
const WHITE_DETAIL_COVERAGE = 0.28;
const FOREGROUND_SAMPLE_DISTANCE = 34;
const FOREGROUND_MIN_COVERAGE = 0.035;
const SOFT_COLOR_MIN_CHROMA = 0.04;
const SOFT_COLOR_MIN_COVERAGE = 0.04;
const STROKE_MAX_CHROMA = 0.16;
const STROKE_MAX_LUMINANCE = 0.38;
const STROKE_MIN_COVERAGE = 0.02;
const EDGE_STROKE_MAX_CHROMA = 0.14;
const EDGE_STROKE_MAX_LUMINANCE = 0.9;
const EDGE_STROKE_MIN_DISTANCE = 28;
const DEFAULT_COLOR_PACKAGE = 0;
const RULER_SIZE = 30;
const LABEL_GAP = 4;
const SAMPLE_MODE_SETTINGS = {
  classic: {
    samplesPerAxis: 9,
    detailBoost: 2.6,
    colorBoost: 0.18,
    preserveLines: false,
    classic: true
  },
  dominant: {
    samplesPerAxis: 9,
    detailBoost: 2.2,
    colorBoost: 0.1,
    preserveLines: true,
    dominant: true,
    classic: false
  },
  enhanced: {
    samplesPerAxis: 9,
    detailBoost: 2.6,
    colorBoost: 0.18,
    preserveLines: true,
    classic: false
  },
  average: {
    samplesPerAxis: 7,
    detailBoost: 0,
    colorBoost: 0.06,
    preserveLines: false,
    classic: false
  },
  center: {
    samplesPerAxis: 1,
    detailBoost: 0,
    colorBoost: 0,
    preserveLines: false,
    classic: false
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
  colorPackage: DEFAULT_COLOR_PACKAGE,
  sampleMode: "classic",
  lockRatio: true,
  mirrorX: false,
  mirrorY: false,
  imageScale: 1,
  imageOffsetX: 0,
  imageOffsetY: 0,
  editor: {
    image: null,
    originalImage: null,
    rotation: 0,
    flipX: false,
    flipY: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    crop: null,
    dragging: false,
    dragMode: "pan",
    dragStart: null,
    cropStart: null
  },
  exportPreviewCanvas: null,
  exportPreviewUrl: "",
  showGrid: true,
  showCodes: false,
  activeColorLimit: 8,
  averageDelta: 0
};

const els = {
  imageInput: document.querySelector("#imageInput"),
  dropzone: document.querySelector("#dropzone"),
  fileMeta: document.querySelector("#fileMeta"),
  sourcePreview: document.querySelector("#sourcePreview"),
  editImageButton: document.querySelector("#editImageButton"),
  imageEditorModal: document.querySelector("#imageEditorModal"),
  imageEditorCanvas: document.querySelector("#imageEditorCanvas"),
  imageEditorZoom: document.querySelector("#imageEditorZoom"),
  imageEditorStatus: document.querySelector("#imageEditorStatus"),
  closeImageEditor: document.querySelector("#closeImageEditor"),
  cancelImageEditor: document.querySelector("#cancelImageEditor"),
  applyImageEditor: document.querySelector("#applyImageEditor"),
  rotateImage: document.querySelector("#rotateImage"),
  flipImageX: document.querySelector("#flipImageX"),
  flipImageY: document.querySelector("#flipImageY"),
  resetImageEditor: document.querySelector("#resetImageEditor"),
  removeImageBackground: document.querySelector("#removeImageBackground"),
  exportPreviewModal: document.querySelector("#exportPreviewModal"),
  exportPreviewImage: document.querySelector("#exportPreviewImage"),
  closeExportPreview: document.querySelector("#closeExportPreview"),
  cancelExportPreview: document.querySelector("#cancelExportPreview"),
  confirmExportPng: document.querySelector("#confirmExportPng"),
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
  zoomOut: document.querySelector("#zoomOut"),
  zoomIn: document.querySelector("#zoomIn"),
  zoomValue: document.querySelector("#zoomValue"),
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
setPreviewZoom(state.cellSize);

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

  els.editImageButton.addEventListener("click", openImageEditor);
  els.closeImageEditor.addEventListener("click", closeImageEditor);
  els.cancelImageEditor.addEventListener("click", closeImageEditor);
  els.applyImageEditor.addEventListener("click", applyImageEditor);
  els.rotateImage.addEventListener("click", () => updateImageEditor({ rotation: state.editor.rotation + 90 }));
  els.flipImageX.addEventListener("click", () => updateImageEditor({ flipX: !state.editor.flipX }));
  els.flipImageY.addEventListener("click", () => updateImageEditor({ flipY: !state.editor.flipY }));
  els.resetImageEditor.addEventListener("click", resetImageEditor);
  els.removeImageBackground.addEventListener("click", removeImageBackground);
  els.imageEditorZoom.addEventListener("input", () => {
    updateImageEditor({ zoom: Number(els.imageEditorZoom.value) / 100 });
  });
  bindImageEditorPointerEvents();

  els.closeExportPreview.addEventListener("click", closeExportPreview);
  els.cancelExportPreview.addEventListener("click", closeExportPreview);
  els.confirmExportPng.addEventListener("click", confirmExportPng);

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
    setPreviewZoom(els.cellSize.value);
  });

  els.zoomOut.addEventListener("click", () => setPreviewZoom(state.cellSize - 1));
  els.zoomIn.addEventListener("click", () => setPreviewZoom(state.cellSize + 1));

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
      state.editor.originalImage = img;
      state.editor.image = img;
      state.imageName = file.name;
      els.editImageButton.disabled = false;
      els.fileMeta.textContent = `${file.name} · ${img.naturalWidth} x ${img.naturalHeight}`;
      resetImageEditor();
      openImageEditor();
    };
    img.onerror = () => {
      setStatus("图片读取失败", false);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function openImageEditor() {
  if (!state.editor.image) {
    return;
  }
  els.imageEditorModal.hidden = false;
  document.body.classList.add("modal-open");
  drawImageEditor();
}

function closeImageEditor() {
  els.imageEditorModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function updateImageEditor(changes = {}) {
  Object.assign(state.editor, changes);
  drawImageEditor();
}

function resetImageEditor() {
  if (!state.editor.originalImage && !state.editor.image) {
    return;
  }
  state.editor.image = state.editor.originalImage || state.editor.image;
  state.editor.rotation = 0;
  state.editor.flipX = false;
  state.editor.flipY = false;
  state.editor.zoom = 1;
  state.editor.panX = 0;
  state.editor.panY = 0;
  state.editor.crop = null;
  els.imageEditorZoom.value = "100";
  els.imageEditorStatus.textContent = "保留主体颜色，去除与边缘连通的背景";
  drawImageEditor();
}

function bindImageEditorPointerEvents() {
  const canvas = els.imageEditorCanvas;
  canvas.addEventListener("pointerdown", (event) => {
    if (!state.editor.image) return;
    const point = getEditorPoint(event);
    const crop = getEditorCropRect();
    const nearHandle = getCropHandle(point, crop);
    state.editor.dragging = true;
    state.editor.dragMode = nearHandle ? "resize" : isPointInRect(point, crop) ? "crop" : "pan";
    state.editor.dragStart = point;
    state.editor.cropStart = { ...crop };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.editor.dragging) return;
    const current = getEditorPoint(event);
    const start = state.editor.dragStart;
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    if (state.editor.dragMode === "pan") {
      state.editor.panX += dx;
      state.editor.panY += dy;
      state.editor.dragStart = current;
    } else if (state.editor.dragMode === "crop") {
      state.editor.crop = clampCropRect({
        ...state.editor.cropStart,
        x: state.editor.cropStart.x + dx,
        y: state.editor.cropStart.y + dy
      });
    } else {
      state.editor.crop = resizeCropRect(state.editor.cropStart, dx, dy);
    }
    drawImageEditor();
  });
  ["pointerup", "pointercancel"].forEach((eventName) => {
    canvas.addEventListener(eventName, (event) => {
      state.editor.dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
    });
  });
}

function getEditorPoint(event) {
  const rect = els.imageEditorCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (els.imageEditorCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (els.imageEditorCanvas.height / rect.height)
  };
}

function getEditorLayout() {
  const canvas = els.imageEditorCanvas;
  const image = state.editor.image;
  const rotated = Math.abs(state.editor.rotation % 180) === 90;
  const imageWidth = rotated ? image.naturalHeight : image.naturalWidth;
  const imageHeight = rotated ? image.naturalWidth : image.naturalHeight;
  const scale = Math.min((canvas.width - 72) / imageWidth, (canvas.height - 72) / imageHeight) * state.editor.zoom;
  return {
    scale: Math.max(0.05, scale),
    centerX: canvas.width / 2 + state.editor.panX,
    centerY: canvas.height / 2 + state.editor.panY,
    imageWidth,
    imageHeight
  };
}

function getEditorCropRect() {
  const canvas = els.imageEditorCanvas;
  if (!state.editor.crop) {
    const size = Math.min(canvas.width, canvas.height) * 0.78;
    state.editor.crop = clampCropRect({
      x: (canvas.width - size) / 2,
      y: (canvas.height - size) / 2,
      width: size,
      height: size
    });
  }
  return state.editor.crop;
}

function clampCropRect(rect) {
  const canvas = els.imageEditorCanvas;
  const minSize = 96;
  const width = Math.max(minSize, Math.min(canvas.width, rect.width));
  const height = Math.max(minSize, Math.min(canvas.height, rect.height));
  return {
    width,
    height,
    x: Math.max(0, Math.min(canvas.width - width, rect.x)),
    y: Math.max(0, Math.min(canvas.height - height, rect.y))
  };
}

function resizeCropRect(rect, dx, dy) {
  const size = Math.max(96, Math.min(
    Math.min(els.imageEditorCanvas.width, els.imageEditorCanvas.height),
    Math.max(rect.width + dx, rect.height + dy)
  ));
  return clampCropRect({
    x: rect.x,
    y: rect.y,
    width: size,
    height: size
  });
}

function getCropHandle(point, crop) {
  const distance = Math.hypot(point.x - (crop.x + crop.width), point.y - (crop.y + crop.height));
  return distance <= 28;
}

function isPointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function drawImageEditor() {
  const canvas = els.imageEditorCanvas;
  const editorCtx = canvas.getContext("2d");
  if (!editorCtx || !state.editor.image) return;
  const layout = getEditorLayout();
  const crop = getEditorCropRect();
  editorCtx.clearRect(0, 0, canvas.width, canvas.height);
  editorCtx.fillStyle = "#172126";
  editorCtx.fillRect(0, 0, canvas.width, canvas.height);
  editorCtx.save();
  editorCtx.translate(layout.centerX, layout.centerY);
  editorCtx.rotate((state.editor.rotation * Math.PI) / 180);
  editorCtx.scale((state.editor.flipX ? -1 : 1) * layout.scale, (state.editor.flipY ? -1 : 1) * layout.scale);
  editorCtx.imageSmoothingEnabled = true;
  editorCtx.drawImage(state.editor.image, -state.editor.image.naturalWidth / 2, -state.editor.image.naturalHeight / 2);
  editorCtx.restore();

  editorCtx.save();
  editorCtx.fillStyle = "rgba(10, 18, 20, 0.58)";
  editorCtx.fillRect(0, 0, canvas.width, crop.y);
  editorCtx.fillRect(0, crop.y, crop.x, crop.height);
  editorCtx.fillRect(crop.x + crop.width, crop.y, canvas.width - crop.x - crop.width, crop.height);
  editorCtx.fillRect(0, crop.y + crop.height, canvas.width, canvas.height - crop.y - crop.height);
  editorCtx.strokeStyle = "#ffffff";
  editorCtx.lineWidth = 2;
  editorCtx.strokeRect(crop.x, crop.y, crop.width, crop.height);
  editorCtx.fillStyle = "#ffffff";
  editorCtx.fillRect(crop.x + crop.width - 12, crop.y + crop.height - 12, 24, 24);
  editorCtx.restore();
}

function applyImageEditor() {
  if (!state.editor.image) return;
  const output = renderEditedImage();
  const img = new Image();
  img.onload = () => {
    state.image = img;
    state.editor.image = img;
    state.editor.originalImage = img;
    state.imageScale = 1;
    state.imageOffsetX = 0;
    state.imageOffsetY = 0;
    els.fileMeta.textContent = `${state.imageName} · ${img.naturalWidth} x ${img.naturalHeight}`;
    els.imageScale.value = "100";
    els.imageOffsetX.value = "0";
    els.imageOffsetY.value = "0";
    els.sourcePreview.innerHTML = "";
    const preview = document.createElement("img");
    preview.src = output.toDataURL("image/png");
    preview.alt = state.imageName;
    els.sourcePreview.appendChild(preview);
    updateSourcePreviewTransform();
    closeImageEditor();
    syncHeightFromRatio();
    parseImage();
  };
  img.src = output.toDataURL("image/png");
}

function renderEditedImage() {
  const crop = getEditorCropRect();
  const layout = getEditorLayout();
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(crop.width / layout.scale));
  output.height = Math.max(1, Math.round(crop.height / layout.scale));
  const outputCtx = output.getContext("2d");
  outputCtx.clearRect(0, 0, output.width, output.height);
  outputCtx.translate((layout.centerX - crop.x) / layout.scale, (layout.centerY - crop.y) / layout.scale);
  outputCtx.rotate((state.editor.rotation * Math.PI) / 180);
  outputCtx.scale(state.editor.flipX ? -1 : 1, state.editor.flipY ? -1 : 1);
  outputCtx.drawImage(state.editor.image, -state.editor.image.naturalWidth / 2, -state.editor.image.naturalHeight / 2);
  return output;
}

function removeImageBackground() {
  const canvas = renderEditedImage();
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const removed = floodRemoveBackground(imageData);
  context.putImageData(removed.imageData, 0, 0);
  const img = new Image();
  img.onload = () => {
    state.editor.image = img;
    state.editor.originalImage = img;
    state.editor.rotation = 0;
    state.editor.flipX = false;
    state.editor.flipY = false;
    state.editor.zoom = 1;
    state.editor.panX = 0;
    state.editor.panY = 0;
    state.editor.crop = null;
    els.imageEditorZoom.value = "100";
    els.imageEditorStatus.textContent = `已移除 ${removed.count.toLocaleString()} 个背景像素，可继续调整主体范围`;
    drawImageEditor();
  };
  img.src = canvas.toDataURL("image/png");
}

function floodRemoveBackground(imageData) {
  const { data, width, height } = imageData;
  const visited = new Uint8Array(width * height);
  const queue = [];
  const background = getBorderReferenceColor(data, width, height);
  const enqueue = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    const pixelIndex = index * 4;
    if (!isBackgroundPixel(data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2], background)) return;
    visited[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }
  let count = 0;
  for (let index = 0; index < visited.length; index += 1) {
    if (!visited[index]) continue;
    data[index * 4 + 3] = 0;
    count += 1;
  }
  return { imageData, count };
}

function getBorderReferenceColor(data, width, height) {
  const samples = [];
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 24))) {
    samples.push(readRawRgb(data, (0 * width + x) * 4));
    samples.push(readRawRgb(data, ((height - 1) * width + x) * 4));
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 24))) {
    samples.push(readRawRgb(data, (y * width) * 4));
    samples.push(readRawRgb(data, (y * width + width - 1) * 4));
  }
  return samples.reduce((total, rgb) => ({
    r: total.r + rgb.r / samples.length,
    g: total.g + rgb.g / samples.length,
    b: total.b + rgb.b / samples.length
  }), { r: 0, g: 0, b: 0 });
}

function readRawRgb(data, index) {
  return { r: data[index], g: data[index + 1], b: data[index + 2] };
}

function isBackgroundPixel(r, g, b, reference) {
  const distance = Math.hypot(r - reference.r, g - reference.g, b - reference.b);
  const luminance = getRgbLuminance({ r, g, b });
  return distance <= 48 || (distance <= 74 && luminance >= 0.72);
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
  state.sampleMode = SAMPLE_MODE_SETTINGS[els.sampleMode.value] ? els.sampleMode.value : "classic";
  state.mirrorX = els.mirrorX.checked;
  state.mirrorY = els.mirrorY.checked;

  setStatus("解析中", false);

  const sourceCells = sampleImageCells();
  const mapped = mapCellsToPattern(sourceCells);
  const outputColors = state.sampleMode === "classic"
    ? mapped.colors
    : refinePatternColors(mapped.colors, sourceCells);

  state.sourceCells = sourceCells;
  state.pattern = toRows(outputColors, state.gridWidth);
  state.stats = buildStats(outputColors);
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
  const sampleSettings = SAMPLE_MODE_SETTINGS[state.sampleMode] || SAMPLE_MODE_SETTINGS.classic;

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
        whiteDetailCoverage: cell.whiteDetailCoverage,
        softColorCoverage: cell.softColorCoverage,
        softColorEvidence: cell.softColorEvidence,
        strokeCoverage: cell.strokeCoverage,
        strokeRgb: cell.strokeRgb,
        strokeEvidence: cell.strokeEvidence,
        edgeStrokeCoverage: cell.edgeStrokeCoverage,
        edgeStrokeRgb: cell.edgeStrokeRgb,
        edgeStrokeEvidence: cell.edgeStrokeEvidence,
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
  const samples = collectCellSamples(
    data,
    sourceWidth,
    sourceHeight,
    cellWidth,
    cellHeight,
    gridX,
    gridY,
    settings
  );
  let baseR = 0;
  let baseG = 0;
  let baseB = 0;
  let alphaTotal = 0;
  let whiteDetailSamples = 0;

  for (const pixel of samples) {
    baseR += pixel.rgb.r;
    baseG += pixel.rgb.g;
    baseB += pixel.rgb.b;
    alphaTotal += pixel.alpha;
    if (
      getRgbLuminance(pixel.rgb) >= WHITE_DETAIL_LUMINANCE &&
      getRgbChroma(pixel.rgb) <= WHITE_DETAIL_CHROMA
    ) {
      whiteDetailSamples += 1;
    }
  }

  const sampleCount = samples.length || 1;
  const baseRgb = {
    r: Math.round(baseR / sampleCount),
    g: Math.round(baseG / sampleCount),
    b: Math.round(baseB / sampleCount)
  };
  const alphaCoverage = alphaTotal / sampleCount;
  const whiteDetailCoverage = whiteDetailSamples / sampleCount;
  const softColor = getSoftColorSample(samples);
  const stroke = getNeutralStrokeSample(samples);
  const hasSoftColor =
    softColor.coverage >= SOFT_COLOR_MIN_COVERAGE &&
    softColor.chroma >= SOFT_COLOR_MIN_CHROMA;

  if (alphaCoverage < 0.025 && isNearWhite(baseRgb, 18)) {
    return {
      rgb: WHITE_RGB,
      alphaCoverage,
      whiteDetailCoverage,
      softColorCoverage: softColor.coverage,
      softColorEvidence: hasSoftColor,
      strokeCoverage: stroke.coverage,
      strokeRgb: stroke.rgb,
      strokeEvidence: false,
      edgeStrokeCoverage: stroke.edgeCoverage,
      edgeStrokeRgb: stroke.edgeRgb,
      edgeStrokeEvidence: false,
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

  const foreground = getForegroundSample(samples);
  if (
    settings.preserveLines &&
    foreground.isLine &&
    foreground.coverage >= FOREGROUND_MIN_COVERAGE
  ) {
    const blend = clamp01(0.55 + foreground.coverage * 1.8);
    rgb = blendRgb(rgb, foreground.rgb, blend);
  }

  if (settings.dominant) {
    const dominant = getDominantColorSample(samples, baseRgb);
    if (dominant.coverage >= 0.2) {
      rgb = blendRgb(rgb, dominant.rgb, clamp01(0.5 + dominant.coverage * 0.7));
    }
  }

  if (
    softColor.coverage >= SOFT_COLOR_MIN_COVERAGE &&
    softColor.chroma >= getRgbChroma(rgb) + 0.012 &&
    getRgbLuminance(rgb) >= 0.7
  ) {
    const accentBlend = clamp01(0.42 + softColor.coverage * 1.6);
    rgb = blendRgb(rgb, softColor.rgb, accentBlend);
  }

  const isBackground = isNearWhite(rgb, 16) && detailScore < 0.055 && !hasSoftColor;
  if (isBackground) {
    rgb = WHITE_RGB;
  } else if (settings.colorBoost > 0) {
    rgb = boostPatternColor(rgb, settings.colorBoost, detailScore);
  }

  return {
    rgb,
    alphaCoverage,
    whiteDetailCoverage,
    softColorCoverage: softColor.coverage,
    softColorEvidence: hasSoftColor,
    strokeCoverage: stroke.coverage,
    strokeRgb: stroke.rgb,
    strokeEvidence:
      stroke.count >= Math.max(2, Math.ceil(sampleCount * STROKE_MIN_COVERAGE)) &&
      stroke.darkestLuminance <= STROKE_MAX_LUMINANCE,
    edgeStrokeCoverage: stroke.edgeCoverage,
    edgeStrokeRgb: stroke.edgeRgb,
    edgeStrokeEvidence:
      stroke.edgeCount >= Math.max(2, Math.ceil(sampleCount * STROKE_MIN_COVERAGE)) &&
      stroke.edgeLuminance <= EDGE_STROKE_MAX_LUMINANCE,
    detailScore,
    isBackground,
    paletteWeight: isBackground
      ? 0.08
      : settings.classic
        ? 1 + Math.min(2.8, detailScore * 7) + (hasSoftColor ? softColor.coverage * 4 : 0)
        : 1 + Math.min(1.6, detailScore * 4) + (hasSoftColor ? softColor.coverage * 2.5 : 0)
  };
}

function getDominantColorSample(samples, baseRgb) {
  const clusters = new Map();
  for (const sample of samples) {
    if (sample.alpha < 0.08) continue;
    const distance = getRgbDistance(sample.rgb, baseRgb);
    const key = [
      Math.round(sample.rgb.r / 16),
      Math.round(sample.rgb.g / 16),
      Math.round(sample.rgb.b / 16)
    ].join(":");
    const weight = Math.max(0.35, sample.alpha * (1 + Math.min(1.8, distance / 120)));
    const cluster = clusters.get(key);
    if (cluster) {
      cluster.count += 1;
      cluster.weight += weight;
      cluster.r += sample.rgb.r * weight;
      cluster.g += sample.rgb.g * weight;
      cluster.b += sample.rgb.b * weight;
    } else {
      clusters.set(key, {
        count: 1,
        weight,
        r: sample.rgb.r * weight,
        g: sample.rgb.g * weight,
        b: sample.rgb.b * weight
      });
    }
  }

  const clusterList = [...clusters.values()].map((cluster) => ({
    ...cluster,
    rgb: {
      r: Math.round(cluster.r / cluster.weight),
      g: Math.round(cluster.g / cluster.weight),
      b: Math.round(cluster.b / cluster.weight)
    }
  }));
  const coloredClusters = clusterList.filter(
    (cluster) =>
      getRgbDistance(cluster.rgb, WHITE_RGB) >= 28 && getRgbChroma(cluster.rgb) >= 0.035
  );
  const dominant = (coloredClusters.length ? coloredClusters : clusterList).sort((a, b) => {
    const colorPriority = (cluster) =>
      cluster.weight * (1 + getRgbChroma(cluster.rgb) * 1.8);
    return colorPriority(b) - colorPriority(a);
  })[0];
  if (!dominant) {
    return { coverage: 0, rgb: baseRgb };
  }
  return {
    coverage: dominant.count / Math.max(1, samples.length),
    rgb: {
      r: dominant.rgb.r,
      g: dominant.rgb.g,
      b: dominant.rgb.b
    }
  };
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
    if (
      luminance < 0.7 ||
      chroma < SOFT_COLOR_MIN_CHROMA ||
      whiteDistance < 0.025
    ) {
      continue;
    }

    const chromaStrength = clamp01((chroma - SOFT_COLOR_MIN_CHROMA) / 0.18);
    const distanceStrength = clamp01((whiteDistance - 0.025) / 0.22);
    const weight = 0.45 + chromaStrength * 1.4 + distanceStrength * 0.8;
    red += sample.rgb.r * weight;
    green += sample.rgb.g * weight;
    blue += sample.rgb.b * weight;
    totalWeight += weight;
    count += 1;
  }

  if (!totalWeight) {
    return {
      coverage: 0,
      chroma: 0,
      rgb: WHITE_RGB
    };
  }

  const rgb = {
    r: Math.round(red / totalWeight),
    g: Math.round(green / totalWeight),
    b: Math.round(blue / totalWeight)
  };
  return {
    coverage: count / Math.max(1, samples.length),
    chroma: getRgbChroma(rgb),
    rgb
  };
}

function getNeutralStrokeSample(samples) {
  const candidates = samples.filter((sample) => {
    const luminance = getRgbLuminance(sample.rgb);
    return (
      luminance <= STROKE_MAX_LUMINANCE &&
      getRgbChroma(sample.rgb) <= STROKE_MAX_CHROMA &&
      getRgbDistance(sample.rgb, WHITE_RGB) >= 80
    );
  });

  const edgeCandidates = samples.filter((sample) => {
    const luminance = getRgbLuminance(sample.rgb);
    return (
      luminance <= EDGE_STROKE_MAX_LUMINANCE &&
      getRgbChroma(sample.rgb) <= EDGE_STROKE_MAX_CHROMA &&
      getRgbDistance(sample.rgb, WHITE_RGB) >= EDGE_STROKE_MIN_DISTANCE
    );
  });

  if (!candidates.length) {
    return {
      count: 0,
      coverage: 0,
      darkestLuminance: 1,
      rgb: WHITE_RGB,
      edgeCount: edgeCandidates.length,
      edgeCoverage: edgeCandidates.length / Math.max(1, samples.length),
      edgeLuminance: edgeCandidates.length
        ? Math.min(...edgeCandidates.map((sample) => getRgbLuminance(sample.rgb)))
        : 1,
      edgeRgb: edgeCandidates.length
        ? { ...edgeCandidates[0].rgb }
        : WHITE_RGB
    };
  }

  const darkest = candidates.reduce((best, sample) =>
    getRgbLuminance(sample.rgb) < getRgbLuminance(best.rgb) ? sample : best
  );
  const edgeDarkest = edgeCandidates.reduce((best, sample) =>
    getRgbLuminance(sample.rgb) < getRgbLuminance(best.rgb) ? sample : best,
    edgeCandidates[0]
  );

  return {
    count: candidates.length,
    coverage: candidates.length / Math.max(1, samples.length),
    darkestLuminance: getRgbLuminance(darkest.rgb),
    rgb: { ...darkest.rgb },
    edgeCount: edgeCandidates.length,
    edgeCoverage: edgeCandidates.length / Math.max(1, samples.length),
    edgeLuminance: edgeCandidates.length ? getRgbLuminance(edgeDarkest.rgb) : 1,
    edgeRgb: edgeCandidates.length ? { ...edgeDarkest.rgb } : WHITE_RGB
  };
}

function collectCellSamples(
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
  if (settings.preserveLines) {
    const sourceGridX = state.mirrorX ? state.gridWidth - 1 - gridX : gridX;
    const sourceGridY = state.mirrorY ? state.gridHeight - 1 - gridY : gridY;
    const startX = Math.max(0, Math.floor(sourceGridX * cellWidth));
    const endX = Math.min(sourceWidth, Math.ceil((sourceGridX + 1) * cellWidth));
    const startY = Math.max(0, Math.floor(sourceGridY * cellHeight));
    const endY = Math.min(sourceHeight, Math.ceil((sourceGridY + 1) * cellHeight));

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        samples.push({ ...getPixel(data, sourceWidth, sourceHeight, x, y), x, y });
      }
    }

    return samples;
  }

  const samplesX = settings.samplesPerAxis;
  const samplesY = settings.samplesPerAxis;

  for (let sy = 0; sy < samplesY; sy += 1) {
    for (let sx = 0; sx < samplesX; sx += 1) {
      const offsetX = samplesX === 1 ? 0.5 : (sx + 0.5) / samplesX;
      const offsetY = samplesY === 1 ? 0.5 : (sy + 0.5) / samplesY;
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
      samples.push({
        ...getPixel(data, sourceWidth, sourceHeight, sampleX, sampleY),
        x: sampleX,
        y: sampleY
      });
    }
  }

  return samples;
}

function getForegroundSample(samples) {
  const clusters = new Map();

  for (const sample of samples) {
    const distance = getRgbDistance(sample.rgb, WHITE_RGB);
    if (distance < FOREGROUND_SAMPLE_DISTANCE) {
      continue;
    }

    const weight = Math.max(0.25, Math.min(2.4, distance / 90));
    const key = `${Math.round(sample.rgb.r / 32)}:${Math.round(sample.rgb.g / 32)}:${Math.round(
      sample.rgb.b / 32
    )}`;
    const cluster = clusters.get(key);
    if (cluster) {
      cluster.count += 1;
      cluster.weight += weight;
      cluster.red += sample.rgb.r * weight;
      cluster.green += sample.rgb.g * weight;
      cluster.blue += sample.rgb.b * weight;
      cluster.points.push(sample);
    } else {
      clusters.set(key, {
        count: 1,
        weight,
        red: sample.rgb.r * weight,
        green: sample.rgb.g * weight,
        blue: sample.rgb.b * weight,
        points: [sample]
      });
    }
  }

  let best = null;
  for (const cluster of clusters.values()) {
    if (
      !best ||
      cluster.count > best.count ||
      (cluster.count === best.count && cluster.weight > best.weight)
    ) {
      best = cluster;
    }
  }

  return {
    count: best?.count || 0,
    coverage: samples.length && best ? best.count / samples.length : 0,
    isLine: best ? isContinuousSampleLine(best.points) : false,
    rgb: best
      ? {
          r: Math.round(best.red / best.weight),
          g: Math.round(best.green / best.weight),
          b: Math.round(best.blue / best.weight)
        }
      : WHITE_RGB
  };
}

function isContinuousSampleLine(points) {
  if (points.length < 2) {
    return false;
  }

  const keys = new Set(points.map((point) => `${point.x}:${point.y}`));
  for (const point of points) {
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }
        if (keys.has(`${point.x + offsetX}:${point.y + offsetY}`)) {
          return true;
        }
      }
    }
  }
  return false;
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
  const targetSize = getActivePaletteLimit(cells);
  state.activeColorLimit = targetSize;
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
    colors: normalizeNeutralStrokeColors(colors, cells, palette),
    palette,
    averageDelta: colors.length ? totalDistance / colors.length : 0
  };
}

function normalizeNeutralStrokeColors(colors, cells, palette = []) {
  const strokeCells = cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell?.strokeEvidence && cell.strokeRgb);
  if (strokeCells.length < 2) {
    return colors;
  }

  const darkestCell = strokeCells.reduce((best, current) =>
    getRgbLuminance(current.cell.strokeRgb) < getRgbLuminance(best.cell.strokeRgb)
      ? current
      : best
  );
  const inferred = findClosestMardColor(darkestCell.cell.strokeRgb);
  if (!inferred) {
    return colors;
  }

  const strokeColor = palette.find((color) => color.code === inferred.code) || inferred;
  const normalized = colors.map((color, index) => {
    const cell = cells[index];
    if (!cell?.strokeEvidence || !isNeutralDarkColor(color)) {
      return color;
    }
    return cloneColor(strokeColor);
  });

  const darkStrokeMask = normalized.map((color, index) =>
    color.code === strokeColor.code && Boolean(cells[index]?.strokeEvidence)
  );

  return normalized.map((color, index) => {
    const cell = cells[index];
    if (!cell?.edgeStrokeEvidence || !isNeutralEdgeColor(color)) {
      return color;
    }
    const x = index % state.gridWidth;
    const y = Math.floor(index / state.gridWidth);
    const touchesStroke = getNeighborIndices(x, y, state.gridWidth, state.gridHeight).some(
      (neighborIndex) => darkStrokeMask[neighborIndex]
    );
    return touchesStroke ? cloneColor(strokeColor) : color;
  });
}

function isNeutralDarkColor(color) {
  return (
    color &&
    getRgbLuminance(color.rgb) <= 0.68 &&
    getRgbChroma(color.rgb) <= STROKE_MAX_CHROMA
  );
}

function isNeutralEdgeColor(color) {
  return Boolean(
    color &&
      color.code !== KNOWN_COLOR_MATCHES[0].color.code &&
      getRgbLuminance(color.rgb) >= 0.42 &&
      getRgbChroma(color.rgb) <= EDGE_STROKE_MAX_CHROMA
  );
}

function refinePatternColors(colors, cells) {
  const refined = colors.map((color) => cloneColor(color));
  const width = state.gridWidth;
  const height = state.gridHeight;
  const exteriorBackground = getExteriorBackgroundMask(refined, cells, width, height);

  restoreEnclosedWhiteDetails(refined, cells, exteriorBackground, width, height);

  return refined;
}

function getExteriorBackgroundMask(colors, cells, width, height) {
  const mask = new Array(colors.length).fill(false);
  const queue = [];

  const enqueue = (index) => {
    if (mask[index] || !isBackgroundLikeCell(colors[index], cells[index])) {
      return;
    }
    mask[index] = true;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    for (const neighborIndex of getNeighborIndices(x, y, width, height)) {
      enqueue(neighborIndex);
    }
  }

  return mask;
}

function restoreEnclosedWhiteDetails(colors, cells, exteriorBackground, width, height) {
  const white = KNOWN_COLOR_MATCHES[0].color;

  for (let index = 0; index < colors.length; index += 1) {
    if (exteriorBackground[index] || colors[index].code === white.code) {
      continue;
    }

    const sourceRgb = cells[index].rgb;
    const isBrightNeutral =
      cells[index].whiteDetailCoverage >= WHITE_DETAIL_COVERAGE ||
      (getRgbLuminance(sourceRgb) >= WHITE_DETAIL_LUMINANCE &&
        getRgbChroma(sourceRgb) <= WHITE_DETAIL_CHROMA);
    if (!isBrightNeutral) {
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = getNeighborIndices(x, y, width, height);
    if (neighbors.some((neighborIndex) => exteriorBackground[neighborIndex])) {
      continue;
    }
    const enclosedNeighbors = neighbors.filter(
      (neighborIndex) => !exteriorBackground[neighborIndex]
    ).length;
    if (enclosedNeighbors >= 3) {
      colors[index] = cloneColor(white);
    }
  }
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
  } 颗</span><span>${state.gridWidth} x ${state.gridHeight}</span><span>${getColorLimitLabel()}</span><span>ΔE ${state.averageDelta.toFixed(1)}</span>`;
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
  els.paletteMeta.textContent = `${state.stats.length} 个颜色 · ${getColorLimitLabel()} · 总计 ${totalCount} 颗 · 平均色差 ΔE ${state.averageDelta.toFixed(1)}`;

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
  state.exportPreviewCanvas = exportCanvas;
  if (state.exportPreviewUrl) {
    URL.revokeObjectURL(state.exportPreviewUrl);
  }
  state.exportPreviewUrl = exportCanvas.toDataURL("image/png");
  els.exportPreviewImage.src = state.exportPreviewUrl;
  els.exportPreviewModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeExportPreview() {
  els.exportPreviewModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function confirmExportPng() {
  if (!state.exportPreviewCanvas) {
    return;
  }

  const link = document.createElement("a");
  link.download = `${baseFileName()}-pattern.png`;
  link.href = state.exportPreviewCanvas.toDataURL("image/png");
  link.click();
  closeExportPreview();
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
    `所需颜色：${state.stats.length} 种 / 总计 ${totalCount} 颗 / ${getColorLimitLabel()}`,
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
    activeColorLimit: state.activeColorLimit,
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
  return colors.map((color) => {
    if (isFixedColorCode(color.code)) {
      return cloneColor(color);
    }

    const knownColor = findKnownColorMatch(color.rgb);
    if (knownColor) {
      return cloneColor(knownColor);
    }

    return cloneColor(findClosestMardColor(color.rgb) || color);
  });
}

function findClosestMardColor(rgb) {
  if (!MARD_COLOR_PALETTE.length) {
    return null;
  }

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

function isFixedColorCode(code) {
  return Boolean(code) && !String(code).startsWith("AUTO-");
}

function getGeneratedColorKey(color) {
  return color.code || color.hex.toUpperCase();
}

function getMardColorCode(rgb, usedCodes) {
  const series = getMardColorSeries(rgb);
  const count = COLOR_SERIES_COUNTS[series];
  const preferredNumber = getMardPreferredNumber(rgb, series, count);

  for (let offset = 0; offset < count; offset += 1) {
    const number = ((preferredNumber - 1 + offset) % count) + 1;
    const code = `${series}${number}`;
    if (!usedCodes.has(code) && !RESERVED_MATCH_CODES.has(code)) {
      return code;
    }
  }

  return (
    BEAD_COLOR_CODES.find(
      (code) => !usedCodes.has(code) && !RESERVED_MATCH_CODES.has(code)
    ) || BEAD_COLOR_CODES[BEAD_COLOR_CODES.length - 1]
  );
}

function getMardColorSeries(rgb) {
  const hsl = rgbToHsl(rgb);
  const hue = hsl.h * 360;

  if (hsl.s <= 0.13) {
    return "H";
  }
  if (hue >= 18 && hue < 72) {
    return hsl.l < 0.44 && hsl.s < 0.68 ? "G" : "A";
  }
  if (hue >= 72 && hue < 172) {
    return "B";
  }
  if (hue >= 172 && hue < 252) {
    return "C";
  }
  if (hue >= 252 && hue < 302) {
    return "D";
  }
  if (hue >= 302 && hue < 342) {
    return "E";
  }
  return "F";
}

function getMardPreferredNumber(rgb, series, count) {
  const hsl = rgbToHsl(rgb);
  if (series === "H") {
    return getMardNeutralNumber(hsl.l);
  }

  const huePosition = getSeriesHuePosition(hsl.h * 360, series);
  const tone = clamp01((1 - hsl.l) * 0.55 + hsl.s * 0.3 + huePosition * 0.15);
  return Math.max(1, Math.min(count, 1 + Math.round(tone * (count - 1))));
}

function getMardNeutralNumber(lightness) {
  const neutralAnchors = [
    { number: 2, lightness: 1 },
    { number: 8, lightness: 0.94 },
    { number: 1, lightness: 0.84 },
    { number: 3, lightness: 0.68 },
    { number: 4, lightness: 0.5 },
    { number: 5, lightness: 0.36 },
    { number: 6, lightness: 0.22 },
    { number: 7, lightness: 0.07 }
  ];

  return neutralAnchors.reduce((best, anchor) =>
    Math.abs(anchor.lightness - lightness) < Math.abs(best.lightness - lightness)
      ? anchor
      : best
  ).number;
}

function getSeriesHuePosition(hue, series) {
  const ranges = {
    A: [18, 72],
    B: [72, 172],
    C: [172, 252],
    D: [252, 302],
    E: [302, 342],
    F: [342, 378],
    G: [18, 72]
  };
  const [start, end] = ranges[series] || [0, 360];
  const normalizedHue = series === "F" && hue < 18 ? hue + 360 : hue;
  return clamp01((normalizedHue - start) / Math.max(1, end - start));
}

function isMardBlack(rgb) {
  return Math.max(rgb.r, rgb.g, rgb.b) <= 52 && getRgbLuminance(rgb) <= 0.17;
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

function setPreviewZoom(value) {
  state.cellSize = normalizeNumber(value, 6, 30, 18);
  els.cellSize.value = String(state.cellSize);
  els.zoomValue.textContent = `${Math.round((state.cellSize / 18) * 100)}%`;
  els.zoomOut.disabled = state.cellSize <= 6;
  els.zoomIn.disabled = state.cellSize >= 30;
  if (state.pattern.length) {
    drawPattern();
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

function getActivePaletteLimit(cells) {
  const currentPackage =
    COLOR_PACKAGES.find((item) => item.size === state.colorPackage) || COLOR_PACKAGES[0];
  const cellCount = Array.isArray(cells) ? cells.length : Number(cells) || 1;
  if (currentPackage.size === 0 && Array.isArray(cells)) {
    return Math.min(cellCount, getAdaptiveColorLimit(cells));
  }
  return Math.max(1, Math.min(currentPackage.outputLimit, cellCount));
}

function getAdaptiveColorLimit(cells) {
  const rawPoints = buildWeightedPoints(cells);
  const points = mergeWeightedPoints(
    compactWeightedPoints(rawPoints, AUTO_PALETTE_POINT_DELTA * 0.75),
    AUTO_PALETTE_POINT_DELTA
  );
  const estimatedCount = mergeWeightedPoints(points, AUTO_PALETTE_ESTIMATE_DELTA).length;

  if (estimatedCount <= 22) {
    return 8;
  }
  if (estimatedCount <= 34) {
    return 24;
  }
  if (estimatedCount <= 54) {
    return 48;
  }
  return 72;
}

function getColorLimitLabel() {
  return state.colorPackage === 0
    ? `自动上限 ${state.activeColorLimit} 色`
    : `上限 ${state.colorPackage} 色`;
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
