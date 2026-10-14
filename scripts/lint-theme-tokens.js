/**
 * Lint Script: Theme Token Enforcement (Section 26)
 * Detects raw hardcoded UI colors (#hex, rgb, rgba, hsl, hsla) inside feature modules.
 * Ensures all features consume semantic tokens (e.g. var(--color-surface), var(--theme-primary)).
 */

const fs = require("fs");
const path = require("path");

const SCAN_DIRS = [
  path.join(__dirname, "../app/app"),
  path.join(__dirname, "../components/views"),
];

// Hex, rgb, rgba, hsl, hsla patterns in style or className attributes
const RAW_COLOR_REGEX = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\))/g;

// Allowed deliberate exceptions (e.g. pure white/black overlays, transparent, third-party brand icons like Shopify green)
const ALLOWED_EXCEPTIONS = [
  "#ffffff",
  "#fff",
  "#000000",
  "#000",
  "rgba(0, 0, 0",
  "rgba(255, 255, 255",
  "#96bf48", // Shopify brand logo green
  "#5e8e3e",
];

let totalViolations = 0;
let scannedFiles = 0;

function isAllowed(match) {
  const lower = match.toLowerCase();
  return ALLOWED_EXCEPTIONS.some((exc) => lower.startsWith(exc));
}

function scanFile(filePath) {
  scannedFiles++;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    // Check for inline style or color definition
    if (line.includes("style={{") || line.includes("backgroundColor:") || line.includes("color:")) {
      const matches = line.match(RAW_COLOR_REGEX);
      if (matches) {
        matches.forEach((m) => {
          if (!isAllowed(m)) {
            console.warn(
              `  [WARNING] Raw color '${m}' found at ${path.relative(process.cwd(), filePath)}:${index + 1}`
            );
            console.warn(`    Line: ${line.trim()}`);
            totalViolations++;
          }
        });
      }
    }
  });
}

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      scanFile(fullPath);
    }
  }
}

console.log("\n=======================================================");
console.log("  THEME TOKEN ENFORCEMENT LINTER (SECTION 26)");
console.log("=======================================================\n");

for (const dir of SCAN_DIRS) {
  scanDirectory(dir);
}

console.log(`\nScanned ${scannedFiles} feature files.`);
if (totalViolations > 0) {
  console.log(`Found ${totalViolations} potential raw color usages in feature modules.`);
  console.log("Recommend replacing with CSS variables e.g. var(--color-surface), var(--theme-primary).\n");
} else {
  console.log("✓ Zero unapproved raw colors found in feature modules!\n");
}
