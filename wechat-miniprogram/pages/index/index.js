const engine = require("../../utils/pattern-engine");

const SAMPLE_MODES = [
  { value: "classic", label: "经典还原" },
  { value: "dominant", label: "主导色采样" },
  { value: "average", label: "区域平均" },
  { value: "center", label: "中心取样" }
];

const MAX_SOURCE_SIDE = 1200;
const PREVIEW_CELL_SIZE = 8;
const EXPORT_CELL_SIZE = 18;
const PAINT_COLORS = engine.getPaintColors();

Page({
  data: {
    statusText: "等待图片",
    parsing: false,
    hasResult: false,
    imagePath: "",
    imageName: "未命名图片",
    imageWidth: 0,
    imageHeight: 0,
    gridWidth: 52,
    gridHeight: 52,
    presets: [
      { size: 52, label: "52 x 52" },
      { size: 78, label: "78 x 78" },
      { size: 104, label: "104 x 104" }
    ],
    sampleModeIndex: 0,
    sampleModeLabels: SAMPLE_MODES.map((item) => item.label),
    packageIndex: 0,
    packageLabels: engine.COLOR_PACKAGES.map((item) => item.label),
    mirrorX: false,
    mirrorY: false,
    showGrid: true,
    showCodes: false,
    manualEditMode: false,
    eyedropperMode: false,
    paintPaletteLabels: PAINT_COLORS.map((item) => `${item.code} · ${item.hex.toUpperCase()}`),
    paintPaletteIndex: 0,
    selectedPaintCode: PAINT_COLORS[0]?.code || "",
    selectedPaintHex: PAINT_COLORS[0]?.hex?.toUpperCase() || "#FFFFFF",
    selectedPaintLabel: PAINT_COLORS[0]
      ? `${PAINT_COLORS[0].code} · ${PAINT_COLORS[0].hex.toUpperCase()}`
      : "无可用色号",
    paintStatus: "生成图纸后可手动改色",
    canUndoPaint: false,
    canvasCssWidth: 446,
    canvasCssHeight: 446,
    stats: [],
    statsCount: 0,
    totalCells: 52 * 52,
    colorLimitLabel: "自动匹配颜色",
    averageDelta: "0.0",
    editMode: "paint",
    editModeLabel: "涂色",
    selectedColorCode: "",
    selectedColorHex: "",
    canUndo: false,
    paletteItems: []
  },

  onReady() {
    this.result = null;
    this.sourceCanvas = null;
    this.sourceCtx = null;
    this.patternCanvas = null;
    this.patternCtx = null;
    this.patternCanvasRect = null;
    this.selectedPaintColor = PAINT_COLORS[0]
      ? engine.getPaintColorByCode(PAINT_COLORS[0].code)
      : null;
    this.paintHistory = [];
    this.isPainting = false;
    this.lastPaintedCell = "";
    this.initCanvasNodes();
  },

  initCanvasNodes() {
    this.getCanvasNode("#sourceCanvas").then(({ node, context }) => {
      this.sourceCanvas = node;
      this.sourceCtx = context;
    });
    this.getCanvasNode("#patternCanvas").then(({ node, context }) => {
      this.patternCanvas = node;
      this.patternCtx = context;
      this.drawEmptyPattern();
    });
  },

  getCanvasNode(selector) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select(selector)
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node;
          if (!canvas) {
            reject(new Error(`Canvas not found: ${selector}`));
            return;
          }
          resolve({ node: canvas, context: canvas.getContext("2d") });
        });
    });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const file = res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        wx.getImageInfo({
          src: file.tempFilePath,
          success: (info) => {
            const imageName = getFileName(file.tempFilePath);
            this.setData({
              imagePath: file.tempFilePath,
              imageName,
              imageWidth: info.width,
              imageHeight: info.height,
              statusText: "图片已选择",
              hasResult: false,
              stats: [],
              statsCount: 0
            });
          },
          fail: () => {
            wx.showToast({ title: "图片读取失败", icon: "none" });
          }
        });
      }
    });
  },

  setPreset(event) {
    const size = normalizeNumber(event.currentTarget.dataset.size, 8, 160, 52);
    this.setData({ gridWidth: size, gridHeight: size, totalCells: size * size }, () => this.reparseIfReady());
  },

  onNumberInput(event) {
    const key = event.currentTarget.dataset.key;
    const value = normalizeNumber(event.detail.value, 8, 160, key === "gridWidth" ? 52 : 52);
    const nextGridWidth = key === "gridWidth" ? value : this.data.gridWidth;
    const nextGridHeight = key === "gridHeight" ? value : this.data.gridHeight;
    this.setData({ [key]: value, totalCells: nextGridWidth * nextGridHeight }, () => this.reparseIfReady());
  },

  onSampleModeChange(event) {
    this.setData({ sampleModeIndex: Number(event.detail.value) }, () => this.reparseIfReady());
  },

  onPackageChange(event) {
    this.setData({ packageIndex: Number(event.detail.value) }, () => this.reparseIfReady());
  },

  onSwitchChange(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value }, () => {
      if (key === "showGrid" || key === "showCodes") {
        this.drawPatternPreview();
      } else {
        this.reparseIfReady();
      }
    });
  },

  reparseIfReady() {
    if (!this.data.hasResult || this.data.parsing) return;
    clearTimeout(this.parseTimer);
    this.parseTimer = setTimeout(() => this.parseCurrentImage(), 180);
  },

  async parseCurrentImage() {
    if (!this.data.imagePath || this.data.parsing) return;
    this.setData({ parsing: true, statusText: "解析中" });
    wx.showLoading({ title: "生成中" });

    try {
      await this.ensureSourceCanvas();
      const source = await this.readSourceImageData(this.data.imagePath);
      const sampleMode = SAMPLE_MODES[this.data.sampleModeIndex].value;
      const colorPackage = engine.COLOR_PACKAGES[this.data.packageIndex].size;
      this.result = engine.parsePattern(source, {
        gridWidth: this.data.gridWidth,
        gridHeight: this.data.gridHeight,
        sampleMode,
        colorPackage,
        mirrorX: this.data.mirrorX,
        mirrorY: this.data.mirrorY
      });
      this.editHistory = [];
      this.setData({
        hasResult: true,
        ...this.getPatternDisplayData(),
        totalCells: this.result.gridWidth * this.result.gridHeight,
        colorLimitLabel: this.result.colorLimitLabel,
        averageDelta: this.result.averageDelta.toFixed(1),
        canUndo: false,
        statusText: "解析完成"
      });
      await this.drawPatternPreview();
    } catch (error) {
      wx.showToast({ title: error.message || "解析失败", icon: "none" });
      this.setData({ statusText: "解析失败" });
    } finally {
      wx.hideLoading();
      this.setData({ parsing: false });
    }
  },

  async ensureSourceCanvas() {
    if (this.sourceCanvas && this.sourceCtx) return;
    const { node, context } = await this.getCanvasNode("#sourceCanvas");
    this.sourceCanvas = node;
    this.sourceCtx = context;
  },

  readSourceImageData(path) {
    return new Promise((resolve, reject) => {
      const image = this.sourceCanvas.createImage();
      image.onload = () => {
        const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        this.sourceCanvas.width = width;
        this.sourceCanvas.height = height;
        this.sourceCtx.clearRect(0, 0, width, height);
        this.sourceCtx.fillStyle = "#ffffff";
        this.sourceCtx.fillRect(0, 0, width, height);
        this.sourceCtx.drawImage(image, 0, 0, width, height);
        resolve(this.sourceCtx.getImageData(0, 0, width, height));
      };
      image.onerror = () => reject(new Error("图片解码失败"));
      image.src = path;
    });
  },

  async drawPatternPreview() {
    if (!this.result) {
      this.drawEmptyPattern();
      return;
    }
    await this.ensurePatternCanvas();
    const width = this.result.gridWidth * PREVIEW_CELL_SIZE + engine.RULER_SIZE;
    const height = this.result.gridHeight * PREVIEW_CELL_SIZE + engine.RULER_SIZE;
    this.patternCanvas.width = width;
    this.patternCanvas.height = height;
    this.setData({ canvasCssWidth: width, canvasCssHeight: height });
    engine.drawPattern(this.patternCtx, this.result, {
      cellSize: PREVIEW_CELL_SIZE,
      showGrid: this.data.showGrid,
      showCodes: this.data.showCodes
    });
  },

  getPatternDisplayData() {
    const stats = buildPatternStats(this.result.pattern);
    const statsByCode = new Map(stats.map((item) => [item.code, item.count]));
    const paletteItems = (this.result.palette || []).map((item) => ({
      code: item.code,
      hex: item.hex.toUpperCase(),
      count: statsByCode.get(item.code) || 0
    }));
    const selected = this.data.selectedColorCode
      ? paletteItems.find((item) => item.code === this.data.selectedColorCode)
      : stats[0] || paletteItems[0];
    return {
      stats,
      paletteItems,
      statsCount: stats.length,
      selectedColorCode: selected ? selected.code : "",
      selectedColorHex: selected ? selected.hex : ""
    };
  },

  selectPaletteColor(event) {
    const item = event.currentTarget.dataset;
    if (!item || !item.code) return;
    this.setData({
      editMode: "paint",
      editModeLabel: "涂色",
      selectedColorCode: item.code,
      selectedColorHex: String(item.hex || "").toUpperCase()
    });
  },

  toggleEyedropper() {
    const isEyedropper = this.data.editMode === "eyedropper";
    this.setData({
      editMode: isEyedropper ? "paint" : "eyedropper",
      editModeLabel: isEyedropper ? "涂色" : "取色"
    });
  },

  undoEdit() {
    if (!this.result || !this.editHistory || !this.editHistory.length) return;
    this.result.pattern = this.editHistory.pop();
    this.setData({
      ...this.getPatternDisplayData(),
      canUndo: this.editHistory.length > 0
    });
    this.drawPatternPreview();
  },

  onPatternTouchStart(event) {
    if (!this.result) return;
    this.isPainting = true;
    this.strokeChanged = false;
    if (this.data.editMode === "paint") {
      this.editHistory.push(clonePattern(this.result.pattern));
      this.setData({ canUndo: true });
    }
    this.paintAtTouch(event);
  },

  onPatternTouchMove(event) {
    if (!this.isPainting) return;
    this.paintAtTouch(event);
  },

  onPatternTouchEnd() {
    this.isPainting = false;
    if (!this.strokeChanged && this.data.editMode === "paint") {
      this.editHistory.pop();
      this.setData({ canUndo: this.editHistory.length > 0 });
    }
  },

  paintAtTouch(event) {
    const point = getTouchPoint(event, this.patternCanvas);
    if (!point) return;
    const cellSize = PREVIEW_CELL_SIZE;
    const x = Math.floor((point.x - engine.RULER_SIZE) / cellSize);
    const y = Math.floor((point.y - engine.RULER_SIZE) / cellSize);
    if (x < 0 || y < 0 || x >= this.result.gridWidth || y >= this.result.gridHeight) return;

    const current = this.result.pattern[y][x];
    if (this.data.editMode === "eyedropper") {
      this.setData({
        editMode: "paint",
        editModeLabel: "涂色",
        selectedColorCode: current.code,
        selectedColorHex: current.hex.toUpperCase()
      });
      this.isPainting = false;
      return;
    }

    if (!this.data.selectedColorCode || current.code === this.data.selectedColorCode) return;
    const paletteColor = (this.result.palette || []).find((item) => item.code === this.data.selectedColorCode);
    if (!paletteColor) return;
    this.result.pattern[y][x] = { ...paletteColor, rgb: { ...paletteColor.rgb }, lab: { ...paletteColor.lab } };
    this.strokeChanged = true;
    this.setData(this.getPatternDisplayData());
    this.drawPatternPreview();
  },

  async ensurePatternCanvas() {
    if (this.patternCanvas && this.patternCtx) return;
    const { node, context } = await this.getCanvasNode("#patternCanvas");
    this.patternCanvas = node;
    this.patternCtx = context;
  },

  drawEmptyPattern() {
    if (!this.patternCanvas || !this.patternCtx) return;
    const width = 446;
    const height = 446;
    this.patternCanvas.width = width;
    this.patternCanvas.height = height;
    this.setData({ canvasCssWidth: width, canvasCssHeight: height });
    this.patternCtx.fillStyle = "#ffffff";
    this.patternCtx.fillRect(0, 0, width, height);
  },

  async savePattern() {
    if (!this.result) return;
    wx.showLoading({ title: "保存中" });
    try {
      await this.ensurePatternCanvas();
      const width = this.result.gridWidth * EXPORT_CELL_SIZE + engine.RULER_SIZE;
      const height = this.result.gridHeight * EXPORT_CELL_SIZE + engine.RULER_SIZE;
      this.patternCanvas.width = width;
      this.patternCanvas.height = height;
      engine.drawPattern(this.patternCtx, this.result, {
        cellSize: EXPORT_CELL_SIZE,
        showGrid: true,
        showCodes: true
      });
      const tempFilePath = await this.canvasToTempFilePath(width, height);
      await this.saveImageToPhotosAlbum(tempFilePath);
      wx.showToast({ title: "已保存" });
      await this.drawPatternPreview();
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
      await this.drawPatternPreview();
    } finally {
      wx.hideLoading();
    }
  },

  canvasToTempFilePath(width, height) {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.patternCanvas,
        width,
        height,
        destWidth: width,
        destHeight: height,
        fileType: "png",
        success: (res) => resolve(res.tempFilePath),
        fail: () => reject(new Error("导出 PNG 失败"))
      });
    });
  },

  saveImageToPhotosAlbum(filePath) {
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: (error) => {
          if (error.errMsg && error.errMsg.includes("auth deny")) {
            reject(new Error("请在设置中允许保存到相册"));
          } else {
            reject(new Error("保存到相册失败"));
          }
        }
      });
    });
  }
});

function normalizeNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function getFileName(path) {
  const parts = String(path).split(/[\\/]/);
  return parts[parts.length - 1] || "未命名图片";
}

function clonePattern(pattern) {
  return pattern.map((row) => row.map((color) => ({
    ...color,
    rgb: color.rgb ? { ...color.rgb } : color.rgb,
    lab: color.lab ? { ...color.lab } : color.lab
  })));
}

function buildPatternStats(pattern) {
  const stats = new Map();
  pattern.forEach((row) => row.forEach((color) => {
    const existing = stats.get(color.code);
    if (existing) {
      existing.count += 1;
    } else {
      stats.set(color.code, {
        code: color.code,
        hex: color.hex.toUpperCase(),
        count: 1
      });
    }
  }));
  return [...stats.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function getTouchPoint(event, canvas) {
  const touch = event && event.touches && event.touches[0];
  if (!touch) return null;
  if (Number.isFinite(touch.x) && Number.isFinite(touch.y)) {
    return { x: touch.x, y: touch.y };
  }
  if (canvas && typeof canvas.getBoundingClientRect === "function") {
    const rect = canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }
  return null;
}
