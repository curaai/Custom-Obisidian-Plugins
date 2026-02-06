#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";

// Get release type from command line argument (patch, minor, major)
const releaseType = process.argv[2] || 'patch';

// Read current manifest
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const currentVersion = manifest.version;

// Parse current version
const versionParts = currentVersion.split('.').map(Number);
let [major, minor, patch] = versionParts;

// Bump version based on release type
switch (releaseType) {
	case 'major':
		major += 1;
		minor = 0;
		patch = 0;
		break;
	case 'minor':
		minor += 1;
		patch = 0;
		break;
	case 'patch':
	default:
		patch += 1;
		break;
}

const newVersion = `${major}.${minor}.${patch}`;

console.log(`📦 Bumping version: ${currentVersion} → ${newVersion}`);

// Update manifest.json
manifest.version = newVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));
console.log('✓ manifest.json updated');

// Update package.json
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = newVersion;
writeFileSync("package.json", JSON.stringify(pkg, null, "\t"));
console.log('✓ package.json updated');

console.log(`\n🚀 Release ${newVersion} prepared!`);
console.log('Next steps:');
console.log('1. npm run build');
console.log('2. git add -A');
console.log(`3. git commit -m "Release ${newVersion}"`);
console.log(`4. git tag ${newVersion}`);
console.log('5. git push && git push --tags');
