import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import JSZip from 'jszip';

const root = process.cwd();
const outDir = path.join(root, 'dist-itch');
const exportZipPath = path.join(root, 'exports', 'tirahan-itch-io.zip');

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}

execSync('npx vite build --outDir dist-itch --base ./', {
  stdio: 'inherit',
  env: { ...process.env, VITE_ITCH_EXPORT: 'true' },
});

const skipPaths = [
  path.join(outDir, 'tirahan-itch-io.zip'),
  path.join(outDir, 'assets', 'aistudio'),
];

for (const skip of skipPaths) {
  if (fs.existsSync(skip)) {
    fs.rmSync(skip, { recursive: true, force: true });
  }
}

const defaultOnlineConfig = {
  defaultTransport: 'p2p',
  defaultWsUrl: process.env.VITE_WS_URL || '',
};
fs.writeFileSync(
  path.join(outDir, 'online-config.json'),
  JSON.stringify(defaultOnlineConfig, null, 2)
);

const zip = new JSZip();

function addDirectoryToZip(dirPath, zipFolder) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nextFolder = zipFolder.folder(entry.name);
      if (nextFolder) {
        addDirectoryToZip(fullPath, nextFolder);
      }
    } else {
      zipFolder.file(entry.name, fs.readFileSync(fullPath));
    }
  }
}

addDirectoryToZip(outDir, zip);

const zipBuffer = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});

fs.mkdirSync(path.dirname(exportZipPath), { recursive: true });
fs.writeFileSync(exportZipPath, zipBuffer);
fs.rmSync(outDir, { recursive: true, force: true });

console.log(`Generated itch.io HTML5 package: ${exportZipPath} (${zipBuffer.length} bytes)`);
