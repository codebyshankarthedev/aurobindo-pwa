/**
 * Netlify Production Build & Validation Script
 * Verifies all game assets, scripts, test suites, and headers for 100% green Netlify hosting.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 [Netlify Build] Starting production build validation for Aurobindo PWA...');

// 1. Check critical deployment files
const criticalFiles = [
  'index.html',
  'sw.js',
  'netlify.toml',
  '_headers',
  '_redirects',
  'assets/orbital-slingshot-scripts/orbital-slingshot.html',
  'assets/orbital-slingshot-scripts/orbital-slingshot.js',
  'assets/orbital-slingshot-scripts/orbital-slingshot-core.js',
  'assets/tetris-scripts/tetris.html',
  'assets/tetris-scripts/tetris.js',
  'assets/tetris-scripts/tetris-core.js'
];

console.log('📦 [Netlify Build] Verifying critical production files...');
for (const relPath of criticalFiles) {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing critical file: ${relPath}`);
    process.exit(1);
  }
}
console.log(`✅ All ${criticalFiles.length} critical files verified on disk.`);

// 2. Syntax validation
console.log('🔍 [Netlify Build] Checking JavaScript syntax...');
const jsFilesToCheck = [
  'assets/orbital-slingshot-scripts/orbital-slingshot-core.js',
  'assets/orbital-slingshot-scripts/orbital-slingshot.js',
  'assets/tetris-scripts/tetris-core.js',
  'assets/tetris-scripts/tetris.js'
];

for (const f of jsFilesToCheck) {
  execSync(`node --check ${f}`, { stdio: 'inherit' });
}
console.log('✅ JavaScript syntax valid for all game scripts.');

// 3. Automated Unit & Integration Tests
console.log('🧪 [Netlify Build] Running automated unit test suites...');
try {
  execSync('node --test tests/orbital-slingshot.test.cjs tests/tetris.test.cjs', { stdio: 'inherit' });
  console.log('✅ All unit tests passed successfully!');
} catch (err) {
  console.error('❌ Test suite execution failed:', err);
  process.exit(1);
}

console.log('🎉 [Netlify Build] Build successful! Ready for live Netlify deployment.');
