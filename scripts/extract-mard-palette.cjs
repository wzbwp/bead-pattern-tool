const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "assets", "mard-color-chart.png");
const outputPath = path.join(root, "assets", "mard-palette.js");
const convertedPath = path.join(os.tmpdir(), `mard-chart-${process.pid}.png`);

execFileSync("sips", ["-s", "format", "png", sourcePath, "--out", convertedPath], {
  stdio: "ignore"
});

try {
  const image = decodePng(fs.readFileSync(convertedPath));
  const xPositions = Array.from({ length: 16 }, (_, index) => 330 + index * 58);
  const rowCenters = [237, 301, 385, 449, 534, 598, 683, 747, 832, 896, 981, 1045, 1130, 1194, 1279, 1343, 1428];
  const layouts = {
    A: [26, 0, 1],
    B: [32, 2, 3],
    C: [29, 4, 5],
    D: [26, 6, 7],
    E: [24, 8, 9],
    F: [25, 10, 11],
    G: [21, 12, 13],
    H: [23, 14, 15],
    M: [15, 16, 16]
  };
  const colors = [];

  for (const [series, [count, firstRow, secondRow]] of Object.entries(layouts)) {
    for (let number = 1; number <= count; number += 1) {
      const row = number <= 16 ? firstRow : secondRow;
      const column = number <= 16 ? number - 1 : number - 17;
      colors.push({
        code: `${series}${number}`,
        rgb: sampleSwatch(image, xPositions[column], rowCenters[row])
      });
    }
  }

  const source = [
    "// Generated from assets/mard-color-chart.png. Do not edit by hand.",
    `globalThis.__MARD_COLOR_PALETTE_DATA__ = ${JSON.stringify(colors)};`,
    ""
  ].join("\n");
  fs.writeFileSync(outputPath, source);
  process.stdout.write(`Extracted ${colors.length} MARD colors to ${outputPath}\n`);
} finally {
  fs.rmSync(convertedPath, { force: true });
}

function sampleSwatch(image, x, y) {
  const channels = { r: [], g: [], b: [] };
  for (let sampleY = y + 7; sampleY < y + 17; sampleY += 1) {
    for (let sampleX = x + 7; sampleX < x + 17; sampleX += 1) {
      const [r, g, b] = image.pixel(sampleX, sampleY);
      channels.r.push(r);
      channels.g.push(g);
      channels.b.push(b);
    }
  }
  return {
    r: median(channels.r),
    g: median(channels.g),
    b: median(channels.b)
  };
}

function median(values) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const chunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") {
      chunks.push(data);
    }
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * channels;
  const compressed = zlib.inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(height * stride);
  let inputOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = compressed[inputOffset++];
    const sourceRow = compressed.subarray(inputOffset, inputOffset + stride);
    inputOffset += stride;
    const row = Buffer.alloc(stride);

    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const above = previous[index] || 0;
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      let value = sourceRow[index];

      if (filter === 1) value = (value + left) & 255;
      if (filter === 2) value = (value + above) & 255;
      if (filter === 3) value = (value + Math.floor((left + above) / 2)) & 255;
      if (filter === 4) {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        const predictor =
          leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
            ? left
            : aboveDistance <= upperLeftDistance
              ? above
              : upperLeft;
        value = (value + predictor) & 255;
      }
      row[index] = value;
    }

    row.copy(pixels, y * stride);
    previous = row;
  }

  return {
    pixel(x, y) {
      const index = (y * stride + x * channels);
      return [pixels[index], pixels[index + 1], pixels[index + 2]];
    }
  };
}
