const fs = require("node:fs");
const path = require("node:path");

const CONFIG_FILE = path.join(process.cwd(), "config.local.json");
const EXAMPLE_FILE = path.join(process.cwd(), "config.example.json");

function readConfig() {
  const targetFile = fs.existsSync(CONFIG_FILE) ? CONFIG_FILE : EXAMPLE_FILE;
  const content = fs.readFileSync(targetFile, "utf8");
  return JSON.parse(content);
}

module.exports = {
  readConfig,
};

