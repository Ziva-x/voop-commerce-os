const fs = require('fs');
const path = require('path');

function scan(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (f === 'node_modules' || f === '.next' || f === '.git' || f === 'generated') continue;
    if (fs.statSync(full).isDirectory()) {
      scan(full);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((l, idx) => {
        // match dark: followed by layout/geometry alterations
        const m = l.match(/dark:(p[xytrbl]?-\d+|m[xytrbl]?-\d+|h-\d+|w-\d+|rounded[^\s"'\`]*|text-(?:xs|sm|base|lg|xl|2xl)|flex|grid|block|hidden)/g);
        if (m) {
          console.log(`${full}:${idx + 1}: ${m.join(', ')}`);
        }
      });
    }
  }
}

console.log('Scanning for dark: layout/geometry deviations...');
scan('./components');
scan('./app');
console.log('Scan complete.');
