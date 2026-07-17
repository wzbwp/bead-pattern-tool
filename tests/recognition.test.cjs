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
  const source = fs.readFileSync(path.join(__dirname, "..", "assets", "app.js"), "utf8");
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
runPreviewZoomRegression();
console.log("Recognition regression tests passed.");
