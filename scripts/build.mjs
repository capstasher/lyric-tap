#!/usr/bin/env node
// Packages extension/ into dist/lyric-tap-v<version>.zip, the artifact that
// gets attached to a GitHub release and dragged into chrome://extensions.
//
// Zips are written by hand so the build needs no dependencies at all.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'extension');
const outDir = join(root, 'dist');

const REQUIRED = [
  'manifest.json', 'background.js', 'bridge.js', 'interceptor.js',
  'lrc.js', 'popup.html', 'popup.js',
  'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png'
];

function walk(dir) {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// --- minimal zip writer (store or deflate, no dependencies) ---------------
function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const compressed = deflateRawSync(data, { level: 9 });
    const useDeflate = compressed.length < data.length;
    const body = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);
    const nameBytes = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);            // time
    local.writeUInt16LE(0x21, 12);         // date (2000-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBytes, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);            // version made by
    entry.writeUInt16LE(20, 6);            // version needed
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(0, 38);            // external attributes
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuffer, end]);
}

// --- build ----------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(sourceDir, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (manifest.version !== pkg.version) {
  console.error(`version mismatch: manifest ${manifest.version}, package ${pkg.version}`);
  process.exit(1);
}

const files = walk(sourceDir)
  .map(full => ({ name: relative(sourceDir, full).split(sep).join('/'), full }))
  .sort((a, b) => a.name.localeCompare(b.name));

const names = new Set(files.map(f => f.name));
const missing = REQUIRED.filter(name => !names.has(name));
if (missing.length) {
  console.error('missing from extension/: ' + missing.join(', '));
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const archive = zip(files.map(f => ({ name: f.name, data: readFileSync(f.full) })));
const outPath = join(outDir, `lyric-tap-v${manifest.version}.zip`);
writeFileSync(outPath, archive);

console.log(`${relative(root, outPath)} — ${files.length} files, ${(archive.length / 1024).toFixed(1)} KB`);
for (const file of files) console.log(`  ${file.name}`);
