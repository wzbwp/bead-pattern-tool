const assert = require("assert");
const engine = require("../wechat-miniprogram/utils/pattern-engine");

const width = 24;
const height = 24;
const data = new Uint8ClampedArray(width * height * 4);

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const isCenter = x >= 6 && x < 18 && y >= 6 && y < 18;
    data[index] = isCenter ? 235 : 255;
    data[index + 1] = isCenter ? 20 : 255;
    data[index + 2] = isCenter ? 42 : 255;
    data[index + 3] = 255;
  }
}

const result = engine.parsePattern(
  { data, width, height },
  {
    gridWidth: 12,
    gridHeight: 12,
    sampleMode: "classic",
    colorPackage: 8
  }
);

assert.strictEqual(result.gridWidth, 12);
assert.strictEqual(result.gridHeight, 12);
assert.strictEqual(result.pattern.length, 12);
assert.strictEqual(result.pattern[0].length, 12);
assert.ok(result.stats.length >= 2, "expected at least foreground and background colors");
assert.ok(result.stats.some((item) => item.code === "H2"), "expected white background color");
assert.ok(result.stats.some((item) => item.code !== "H2"), "expected a non-white foreground color");
assert.ok(Number.isFinite(result.averageDelta));

console.log("Miniprogram engine regression tests passed.");
