const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createElement(overrides = {}) {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    click() {
      listeners.get("click")?.({ target: this });
    },
    dispatch(type) {
      listeners.get(type)?.({ target: this });
    },
    appendChild() {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getContext() {
      return createCanvasContext();
    },
    clientWidth: 900,
    clientHeight: 700,
    checked: false,
    disabled: false,
    innerHTML: "",
    style: {},
    textContent: "",
    value: "80",
    ...overrides
  };
}

function createCanvasContext() {
  return new Proxy(
    {},
    {
      get(target, property) {
        if (!(property in target)) {
          target[property] = () => {};
        }
        return target[property];
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      }
    }
  );
}

function loadApp() {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) {
        elements.set(selector, createElement());
      }
      return elements.get(selector);
    },
    createElement() {
      return createElement();
    },
    createDocumentFragment() {
      return createElement();
    }
  };
  const sandbox = {
    Blob,
    Map,
    Math,
    Number,
    Set,
    URL,
    clearTimeout,
    console,
    document,
    setTimeout,
    window: {
      addEventListener() {},
      devicePixelRatio: 1,
      getComputedStyle() {
        return {
          marginBottom: "0",
          marginLeft: "0",
          marginRight: "0",
          marginTop: "0",
          minHeight: "540"
        };
      },
      setTimeout
    }
  };
  vm.createContext(sandbox);
  const paletteSource = fs.readFileSync(
    path.join(__dirname, "..", "assets", "mard-palette.js"),
    "utf8"
  );
  const source = fs.readFileSync(path.join(__dirname, "..", "assets", "app.js"), "utf8");
  vm.runInContext(paletteSource, sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

function runRecognitionRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      state.gridWidth = 9;
      state.gridHeight = 9;

      const white = cloneColor(KNOWN_COLOR_MATCHES[0].color);
      const outline = createColor("A2", "主轮廓", { r: 132, g: 91, b: 64 });
      const outlineVariants = [
        outline,
        createColor("A1", "轮廓杂色", { r: 126, g: 86, b: 60 }),
        createColor("A5", "轮廓杂色", { r: 140, g: 98, b: 70 }),
        createColor("A9", "轮廓杂色", { r: 148, g: 105, b: 75 })
      ];
      const fill = createColor("A7", "主体填色", { r: 238, g: 190, b: 170 });
      const colors = new Array(81).fill(null).map(() => cloneColor(white));
      const cells = new Array(81).fill(null).map(() => ({
        rgb: { ...WHITE_RGB },
        lab: rgbToLab(WHITE_RGB),
        isBackground: true,
        whiteDetailCoverage: 1
      }));

      let variantIndex = 0;
      for (let y = 2; y <= 6; y += 1) {
        for (let x = 2; x <= 6; x += 1) {
          const index = y * 9 + x;
          const boundary = x === 2 || x === 6 || y === 2 || y === 6;
          const color = boundary
            ? cloneColor(variantIndex++ % 5 === 0 ? outlineVariants[(variantIndex % 3) + 1] : outline)
            : cloneColor(fill);
          colors[index] = color;
          cells[index] = {
            rgb: { ...color.rgb },
            lab: rgbToLab(color.rgb),
            isBackground: false,
            whiteDetailCoverage: 0
          };
        }
      }

      const toothIndices = [4 * 9 + 4, 4 * 9 + 5];
      for (const index of toothIndices) {
        colors[index] = cloneColor(fill);
        cells[index] = {
          rgb: { r: 247, g: 247, b: 246 },
          lab: rgbToLab({ r: 247, g: 247, b: 246 }),
          isBackground: false,
          whiteDetailCoverage: 0.64
        };
      }

      const refined = refinePatternColors(colors, cells);
      const boundaryCodes = [];
      for (let y = 2; y <= 6; y += 1) {
        for (let x = 2; x <= 6; x += 1) {
          if (x === 2 || x === 6 || y === 2 || y === 6) {
            boundaryCodes.push(refined[y * 9 + x].code);
          }
        }
      }

      return {
        boundaryCodes,
        toothCodes: toothIndices.map((index) => refined[index].code),
        exteriorCode: refined[0].code
      };
    })()`,
    app
  );

  assert.deepEqual(new Set(result.boundaryCodes), new Set(["A2", "A1", "A5", "A9"]));
  assert.equal(Array.from(result.toothCodes).join(","), "H2,H2");
  assert.equal(result.exteriorCode, "H2");
}

function runOutlinePreservationRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      state.gridWidth = 9;
      state.gridHeight = 9;

      const white = cloneColor(KNOWN_COLOR_MATCHES[0].color);
      const outline = createColor("C8", "原图黄色边框", { r: 244, g: 194, b: 54 });
      const colors = new Array(81).fill(null).map(() => cloneColor(white));
      const cells = new Array(81).fill(null).map(() => ({
        rgb: { ...WHITE_RGB },
        lab: rgbToLab(WHITE_RGB),
        isBackground: true,
        whiteDetailCoverage: 1
      }));

      for (let y = 2; y <= 6; y += 1) {
        for (let x = 3; x <= 6; x += 1) {
          const index = y * 9 + x;
          cells[index].isBackground = false;
          if (x === 3 || x === 6 || y === 2 || y === 6) {
            colors[index] = cloneColor(outline);
            cells[index] = {
              ...cells[index],
              rgb: { ...outline.rgb },
              lab: rgbToLab(outline.rgb),
              whiteDetailCoverage: 0
            };
          }
        }
      }

      const thinLine = [3 * 9 + 2, 4 * 9 + 2, 5 * 9 + 2];
      for (const index of thinLine) {
        cells[index] = {
          ...cells[index]
        };
      }

      const noiseIndex = 7 * 9 + 1;
      cells[noiseIndex] = {
        ...cells[noiseIndex]
      };

      const refined = refinePatternColors(colors, cells);
      return {
        thinLineCodes: thinLine.map((index) => refined[index].code),
        noiseCode: refined[noiseIndex].code
      };
    })()`,
    app
  );

  assert.equal(Array.from(result.thinLineCodes).join(","), "H2,H2,H2");
  assert.equal(result.noiseCode, "H2");
}

function runBalancedSamplingRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      state.gridWidth = 1;
      state.gridHeight = 1;
      const width = 17;
      const height = 17;
      const createPixels = () => new Uint8ClampedArray(width * height * 4).fill(255);
      const setBlack = (pixels, x, y) => {
        const index = (y * width + x) * 4;
        pixels[index] = 15;
        pixels[index + 1] = 16;
        pixels[index + 2] = 15;
        pixels[index + 3] = 255;
      };

      const linePixels = createPixels();
      for (let y = 0; y < height; y += 1) {
        setBlack(linePixels, 1, y);
      }
      const noisePixels = createPixels();
      setBlack(noisePixels, 1, 1);

      const line = sampleCellColor(
        linePixels,
        width,
        height,
        width,
        height,
        0,
        0,
        SAMPLE_MODE_SETTINGS.enhanced
      );
      const noise = sampleCellColor(
        noisePixels,
        width,
        height,
        width,
        height,
        0,
        0,
        SAMPLE_MODE_SETTINGS.enhanced
      );
      return { line, noise };
    })()`,
    app
  );

  assert.equal(result.line.isBackground, false);
  assert.ok(result.line.rgb.r < 110);
  assert.ok(result.line.rgb.g < 110);
  assert.ok(result.line.rgb.b < 110);
  assert.ok(result.noise.rgb.r > 220);
}

function runDefaultPaletteRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `({
      colorPackage: state.colorPackage,
      sampleMode: state.sampleMode,
      classicWeight: SAMPLE_MODE_SETTINGS.classic.classic
    })`,
    app
  );
  assert.equal(result.colorPackage, 0);
  assert.equal(result.sampleMode, "classic");
  assert.equal(result.classicWeight, true);
}

function runAdaptivePaletteRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      const makeCells = (count) => Array.from({ length: count }, (_, index) => {
        const hue = index / count;
        const rgb = hslToRgb({ h: hue, s: 0.72, l: 0.28 + (index % 4) * 0.14 });
        return {
          rgb,
          hex: rgbToHex(rgb),
          lab: rgbToLab(rgb),
          paletteWeight: 1,
          isBackground: false
        };
      });
      const simple = [
        { r: 255, g: 255, b: 255 },
        { r: 20, g: 20, b: 20 },
        { r: 130, g: 185, b: 65 },
        { r: 238, g: 175, b: 165 }
      ].flatMap((rgb) => Array.from({ length: 20 }, () => ({
        rgb,
        hex: rgbToHex(rgb),
        lab: rgbToLab(rgb),
        paletteWeight: 1,
        isBackground: isNearWhite(rgb, 12)
      })));
      const detailed = makeCells(90);
      const autoSimple = getActivePaletteLimit(simple);
      const autoDetailed = getActivePaletteLimit(detailed);
      state.colorPackage = 8;
      const manualDetailed = getActivePaletteLimit(detailed);
      return { autoSimple, autoDetailed, manualDetailed };
    })()`,
    app
  );

  assert.equal(result.autoSimple, 8);
  assert.ok(result.autoDetailed >= 48);
  assert.equal(result.manualDetailed, 8);
}

function runClassicSamplingRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      state.gridWidth = 1;
      state.gridHeight = 1;
      const width = 9;
      const height = 9;
      const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
      const index = (4 * width + 4) * 4;
      pixels[index] = 15;
      pixels[index + 1] = 16;
      pixels[index + 2] = 15;
      const sampled = sampleCellColor(
        pixels,
        width,
        height,
        width,
        height,
        0,
        0,
        SAMPLE_MODE_SETTINGS.classic
      );
      const samples = collectCellSamples(
        pixels,
        width,
        height,
        width,
        height,
        0,
        0,
        SAMPLE_MODE_SETTINGS.classic
      );
      const baseRgb = {
        r: Math.round(samples.reduce((sum, sample) => sum + sample.rgb.r, 0) / samples.length),
        g: Math.round(samples.reduce((sum, sample) => sum + sample.rgb.g, 0) / samples.length),
        b: Math.round(samples.reduce((sum, sample) => sum + sample.rgb.b, 0) / samples.length)
      };
      let weightedR = 0;
      let weightedG = 0;
      let weightedB = 0;
      let totalWeight = 0;
      let detailTotal = 0;
      let maxSalience = 0;
      for (const sample of samples) {
        const salience = getPixelSalience(sample.rgb, baseRgb, sample.alpha);
        const weight = Math.max(0.08, sample.alpha) * (1 + 2.6 * salience);
        weightedR += sample.rgb.r * weight;
        weightedG += sample.rgb.g * weight;
        weightedB += sample.rgb.b * weight;
        totalWeight += weight;
        detailTotal += salience;
        maxSalience = Math.max(maxSalience, salience);
      }
      const detailScore = Math.max(detailTotal / samples.length, maxSalience * 0.32);
      const expectedRgb = boostPatternColor(
        {
          r: Math.round(weightedR / totalWeight),
          g: Math.round(weightedG / totalWeight),
          b: Math.round(weightedB / totalWeight)
        },
        0.18,
        detailScore
      );
      return { sampled, expectedRgb, detailScore };
    })()`,
    app
  );

  assert.equal(JSON.stringify(result.sampled.rgb), JSON.stringify(result.expectedRgb));
  assert.equal(result.sampled.isBackground, false);
  assert.equal(
    result.sampled.paletteWeight,
    1 + Math.min(2.8, result.detailScore * 7)
  );
}

function runDetailAndStrokeCalibrationRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      state.gridWidth = 5;
      state.gridHeight = 1;
      const width = 9;
      const height = 9;
      const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
      for (let y = 2; y < 7; y += 1) {
        for (let x = 2; x < 7; x += 1) {
          const index = (y * width + x) * 4;
          pixels[index] = 245;
          pixels[index + 1] = 220;
          pixels[index + 2] = 230;
          pixels[index + 3] = 255;
        }
      }
      const pink = sampleCellColor(
        pixels,
        width,
        height,
        width,
        height,
        0,
        0,
        SAMPLE_MODE_SETTINGS.classic
      );

      const mixedColors = [
        MARD_COLOR_BY_CODE.get("H5"),
        MARD_COLOR_BY_CODE.get("H6"),
        MARD_COLOR_BY_CODE.get("M15")
      ].map(cloneColor);
      const strokeCells = mixedColors.map((color) => ({
        strokeEvidence: true,
        strokeRgb: { r: 1, g: 1, b: 1 },
        rgb: { ...color.rgb }
      }));
      const normalized = normalizeNeutralStrokeColors(
        mixedColors,
        strokeCells,
        MARD_COLOR_PALETTE
      );
      const edgeColors = [
        MARD_COLOR_BY_CODE.get("H7"),
        MARD_COLOR_BY_CODE.get("H14"),
        MARD_COLOR_BY_CODE.get("H14"),
        MARD_COLOR_BY_CODE.get("H2"),
        MARD_COLOR_BY_CODE.get("H7")
      ].map(cloneColor);
      const edgeCells = [
        {
          strokeEvidence: true,
          strokeRgb: { r: 1, g: 1, b: 1 },
          edgeStrokeEvidence: true,
          edgeStrokeRgb: { r: 204, g: 215, b: 209 }
        },
        {
          strokeEvidence: false,
          strokeRgb: { r: 255, g: 255, b: 255 },
          edgeStrokeEvidence: true,
          edgeStrokeRgb: { r: 204, g: 215, b: 209 }
        },
        {
          strokeEvidence: false,
          strokeRgb: { r: 255, g: 255, b: 255 },
          edgeStrokeEvidence: false,
          edgeStrokeRgb: { r: 255, g: 255, b: 255 }
        },
        {
          strokeEvidence: false,
          strokeRgb: { r: 255, g: 255, b: 255 },
          edgeStrokeEvidence: false,
          edgeStrokeRgb: { r: 255, g: 255, b: 255 }
        },
        {
          strokeEvidence: true,
          strokeRgb: { r: 1, g: 1, b: 1 },
          edgeStrokeEvidence: true,
          edgeStrokeRgb: { r: 1, g: 1, b: 1 }
        }
      ];
      const normalizedEdges = normalizeNeutralStrokeColors(
        edgeColors,
        edgeCells,
        MARD_COLOR_PALETTE
      );
      return {
        pink,
        pinkCode: assignBeadColorCodes([createColor("", "", pink.rgb)])[0].code,
        strokeCodes: normalized.map((color) => color.code),
        edgeCodes: normalizedEdges.map((color) => color.code)
      };
    })()`,
    app
  );

  assert.equal(result.pink.isBackground, false);
  assert.ok(result.pink.softColorCoverage > 0.2);
  assert.ok(result.pink.rgb.g < 235);
  assert.equal(result.pinkCode, "E8");
  assert.equal(Array.from(new Set(result.strokeCodes)).join(","), "H7");
  assert.equal(Array.from(result.edgeCodes).join(","), "H7,H7,H14,H2,H7");
}

function runEditorProcessingRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      const width = 7;
      const height = 7;
      const imageData = {
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4).fill(255)
      };
      const indexAt = (x, y) => (y * width + x) * 4;
      for (let y = 2; y <= 4; y += 1) {
        for (let x = 2; x <= 4; x += 1) {
          const index = indexAt(x, y);
          imageData.data[index] = 18;
          imageData.data[index + 1] = 18;
          imageData.data[index + 2] = 18;
          imageData.data[index + 3] = 255;
        }
      }
      const processed = floodRemoveBackground(imageData);
      const center = imageData.data[indexAt(3, 3) + 3];
      const corner = imageData.data[indexAt(0, 0) + 3];

      const pixels = new Uint8ClampedArray(9 * 9 * 4).fill(255);
      for (let y = 2; y < 7; y += 1) {
        for (let x = 2; x < 7; x += 1) {
          const index = (y * 9 + x) * 4;
          pixels[index] = 236;
          pixels[index + 1] = 70;
          pixels[index + 2] = 84;
          pixels[index + 3] = 255;
        }
      }
      const dominant = sampleCellColor(
        pixels,
        9,
        9,
        9,
        9,
        0,
        0,
        SAMPLE_MODE_SETTINGS.dominant
      );
      return {
        removed: processed.count,
        center,
        corner,
        dominantCode: assignBeadColorCodes([createColor("", "", dominant.rgb)])[0].code
      };
    })()`,
    app
  );

  assert.equal(result.center, 255);
  assert.equal(result.corner, 0);
  assert.ok(result.removed >= 40);
  assert.equal(result.dominantCode.startsWith("F"), true);
}

function runMardColorMatchingRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      const inputs = [
        createColor("", "", { r: 236, g: 70, b: 84 }),
        createColor("", "", { r: 18, g: 18, b: 18 }),
        createColor("", "", { r: 235, g: 197, b: 45 }),
        createColor("", "", { r: 42, g: 160, b: 88 }),
        createColor("", "", { r: 46, g: 132, b: 202 }),
        createColor("", "", { r: 116, g: 76, b: 174 }),
        createColor("", "", { r: 220, g: 92, b: 164 }),
        createColor("", "", { r: 126, g: 78, b: 45 }),
        createColor("", "", { r: 132, g: 132, b: 132 }),
        createColor("", "", { r: 255, g: 255, b: 255 })
      ];
      const assigned = assignBeadColorCodes(inputs);
      const reordered = assignBeadColorCodes([...inputs].reverse());
      return {
        codes: assigned.map((color) => color.code),
        reorderedBlack: reordered.find((color) => color.code === "H7").code,
        directBlack: createAutoColor({ r: 30, g: 30, b: 30 }, 0).code
      };
    })()`,
    app
  );

  assert.equal(result.codes[0], "F25");
  assert.equal(result.codes[1], "H7");
  assert.equal(result.codes[2], "A26");
  assert.equal(result.codes[3], "B8");
  assert.equal(result.codes[4], "C20");
  assert.equal(result.codes[5], "D7");
  assert.equal(result.codes[6], "E4");
  assert.equal(result.codes[7], "F10");
  assert.equal(result.codes[8], "H4");
  assert.equal(result.codes[9], "H2");
  assert.equal(result.reorderedBlack, "H7");
  assert.equal(result.directBlack, "H7");
}

function runSampledBoundaryPreservationRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      state.gridWidth = 7;
      state.gridHeight = 7;
      const white = cloneColor(KNOWN_COLOR_MATCHES[0].color);
      const black = createColor("A1", "原图黑色", { r: 15, g: 16, b: 15 });
      const colors = new Array(49).fill(null).map(() => cloneColor(white));
      const cells = new Array(49).fill(null).map(() => ({
        rgb: { ...WHITE_RGB },
        lab: rgbToLab(WHITE_RGB),
        isBackground: true,
        whiteDetailCoverage: 1
      }));

      for (let y = 2; y <= 4; y += 1) {
        for (let x = 2; x <= 4; x += 1) {
          const index = y * 7 + x;
          const boundary = x === 2 || x === 4 || y === 2 || y === 4;
          if (boundary) {
            colors[index] = cloneColor(black);
            cells[index] = {
              rgb: { ...black.rgb },
              lab: rgbToLab(black.rgb),
              isBackground: false,
              whiteDetailCoverage: 0.88
            };
          }
        }
      }

      const refined = refinePatternColors(colors, cells);
      return [2 * 7 + 3, 3 * 7 + 2, 3 * 7 + 4, 4 * 7 + 3].map(
        (index) => refined[index].code
      );
    })()`,
    app
  );

  assert.equal(Array.from(result).join(","), "A1,A1,A1,A1");
}

function runPreviewZoomRegression() {
  const app = loadApp();
  const result = vm.runInContext(
    `(() => {
      const initial = { size: state.cellSize, label: els.zoomValue.textContent };
      els.zoomIn.click();
      const enlarged = { size: state.cellSize, label: els.zoomValue.textContent };
      els.zoomOut.click();
      return {
        initial,
        enlarged,
        restored: { size: state.cellSize, label: els.zoomValue.textContent }
      };
    })()`,
    app
  );

  assert.equal(result.initial.size, 18);
  assert.equal(result.initial.label, "100%");
  assert.equal(result.enlarged.size, 19);
  assert.equal(result.enlarged.label, "106%");
  assert.equal(result.restored.size, 18);
  assert.equal(result.restored.label, "100%");
}

runRecognitionRegression();
runOutlinePreservationRegression();
runBalancedSamplingRegression();
runSampledBoundaryPreservationRegression();
runDefaultPaletteRegression();
runAdaptivePaletteRegression();
runClassicSamplingRegression();
runDetailAndStrokeCalibrationRegression();
runEditorProcessingRegression();
runMardColorMatchingRegression();
runPreviewZoomRegression();
console.log("Recognition regression tests passed.");
