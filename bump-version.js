const fs = require('fs');

function bump(version, type = 'patch') {
  const parts = version.split('.').map(n => {
    const val = parseInt(n, 10);
    return isNaN(val) ? 0 : val;
  });
  
  // Ensure we have 3 parts
  while (parts.length < 3) parts.push(0);

  if (type === 'major') {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  } else if (type === 'minor') {
    parts[1]++;
    parts[2] = 0;
  } else {
    parts[2]++;
  }
  return parts.join('.');
}

const type = (process.argv[2] && process.argv[2].toLowerCase()) || 'patch';

try {
  // 1. Read current version from package.json
  const pkgPath = './package.json';
  if (!fs.existsSync(pkgPath)) throw new Error('package.json not found');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const oldVersion = pkg.version;
  const newVersion = bump(oldVersion, type);

  // 1. Update package.json
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // 2. Update manifest.json
  const manifestPath = './manifest.json';
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = newVersion;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  // 3. Update package-lock.json
  const lockPath = './package-lock.json';
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = newVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = newVersion;
    }
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }

  console.log(`\x1b[32mSuccessfully bumped ${type} version from v${oldVersion} to v${newVersion}\x1b[0m`);
} catch (error) {
  console.error('\x1b[31mFailed to bump version:\x1b[0m', error.message);
  process.exit(1);
}
