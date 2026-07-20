const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ICON_DIR = path.join(__dirname, "..", "assets", "icons");
const BG = [15, 143, 134, 255];
const PANEL = [246, 247, 249, 255];
const LINE = [219, 227, 230, 255];
const BEADS = [
  [245, 212, 84, 255],
  [233, 96, 113, 255],
  [75, 155, 216, 255],
  [255, 255, 255, 255],
  [38, 46, 51, 255],
  [120, 184, 88, 255],
  [190, 118, 196, 255],
  [239, 151, 74, 255]
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function writePng(filename, width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(path.join(ICON_DIR, filename), png);
}

function setPixel(pixels, width, x, y, color) {
  const index = (y * width + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
}

function fillRect(pixels, width, height, x, y, rectWidth, rectHeight, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + rectWidth));
  const endY = Math.min(height, Math.ceil(y + rectHeight));
  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      setPixel(pixels, width, px, py, color);
    }
  }
}

function fillCircle(pixels, width, height, cx, cy, radius, color) {
  const r2 = radius * radius;
  const startX = Math.max(0, Math.floor(cx - radius));
  const startY = Math.max(0, Math.floor(cy - radius));
  const endX = Math.min(width - 1, Math.ceil(cx + radius));
  const endY = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(pixels, width, x, y, color);
      }
    }
  }
}

function fillRoundedRect(pixels, width, height, x, y, rectWidth, rectHeight, radius, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + rectWidth));
  const endY = Math.min(height, Math.ceil(y + rectHeight));
  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      const nearestX = Math.max(x + radius, Math.min(px + 0.5, x + rectWidth - radius));
      const nearestY = Math.max(y + radius, Math.min(py + 0.5, y + rectHeight - radius));
      const dx = px + 0.5 - nearestX;
      const dy = py + 0.5 - nearestY;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(pixels, width, px, py, color);
      }
    }
  }
}

function generateIcon(size, filename, maskable = false) {
  const pixels = Buffer.alloc(size * size * 4);
  fillRect(pixels, size, size, 0, 0, size, size, BG);

  const margin = maskable ? Math.round(size * 0.18) : Math.round(size * 0.11);
  const panelSize = size - margin * 2;
  const radius = Math.round(size * 0.08);
  fillRoundedRect(pixels, size, size, margin, margin, panelSize, panelSize, radius, PANEL);

  const grid = 7;
  const gap = panelSize / (grid + 1);
  const beadRadius = gap * 0.28;
  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      const x = margin + gap * (col + 1);
      const y = margin + gap * (row + 1);
      fillCircle(pixels, size, size, x, y, beadRadius * 1.14, LINE);
      fillCircle(pixels, size, size, x, y, beadRadius, BEADS[(row * 3 + col) % BEADS.length]);
    }
  }

  writePng(filename, size, size, pixels);
}

fs.mkdirSync(ICON_DIR, { recursive: true });
generateIcon(192, "icon-192.png");
generateIcon(512, "icon-512.png");
generateIcon(512, "maskable-icon-512.png", true);
