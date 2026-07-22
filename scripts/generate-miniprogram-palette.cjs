const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "assets", "mard-palette.js");
const targetPath = path.join(root, "wechat-miniprogram", "utils", "mard-palette.js");
const source = fs.readFileSync(sourcePath, "utf8");
const match = source.match(/= (\[.*\]);/s);

if (!match) {
  throw new Error("Unable to find palette data in assets/mard-palette.js");
}

const data = JSON.parse(match[1]);
const output = `// Generated from assets/mard-palette.js. Do not edit by hand.\nmodule.exports = ${JSON.stringify(data)};\n`;
fs.writeFileSync(targetPath, output);
