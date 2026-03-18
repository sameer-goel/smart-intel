#!/usr/bin/env node
/**
 * scan-usecases.js — Merge new use cases into the catalog
 *
 * Usage:
 *   echo '[{...}, {...}]' | node scripts/scan-usecases.js
 *   node scripts/scan-usecases.js --stats   # Just print stats
 *
 * Reads new use cases from stdin (JSON array), merges into
 * docs/usecases/index.json, deduplicates by id, sorts by date_added desc.
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '..', 'docs', 'usecases', 'index.json');

function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    return { last_updated: new Date().toISOString().slice(0, 10), total: 0, usecases: [] };
  }
}

function saveIndex(data) {
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(data, null, 2));
}

function printStats(data) {
  const cats = {};
  const complexities = {};
  const sources = {};
  data.usecases.forEach(u => {
    cats[u.category] = (cats[u.category] || 0) + 1;
    complexities[u.complexity] = (complexities[u.complexity] || 0) + 1;
    sources[u.source_type] = (sources[u.source_type] || 0) + 1;
  });

  console.log('\n📊 OpenClaw Use Cases — Stats');
  console.log('─'.repeat(40));
  console.log(`Total:        ${data.total}`);
  console.log(`Last updated: ${data.last_updated}`);
  console.log(`Categories:   ${Object.keys(cats).length}`);
  console.log('\nBy Category:');
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${v.toString().padStart(3)} ${k}`);
  });
  console.log('\nBy Complexity:');
  Object.entries(complexities).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${v.toString().padStart(3)} ${k}`);
  });
  console.log('\nBy Source:');
  Object.entries(sources).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${v.toString().padStart(3)} ${k}`);
  });
  console.log('');
}

async function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('[]');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data.trim() || '[]'));
    setTimeout(() => resolve(data.trim() || '[]'), 1000);
  });
}

async function main() {
  const statsOnly = process.argv.includes('--stats');
  const index = loadIndex();

  if (statsOnly) {
    printStats(index);
    return;
  }

  // Read new use cases from stdin
  const raw = await readStdin();
  let newItems;
  try {
    newItems = JSON.parse(raw);
    if (!Array.isArray(newItems)) newItems = [newItems];
  } catch (e) {
    console.error('❌ Invalid JSON on stdin:', e.message);
    process.exit(1);
  }

  if (newItems.length === 0) {
    console.log('No new use cases provided. Current stats:');
    printStats(index);
    return;
  }

  // Build id set from existing
  const existingIds = new Set(index.usecases.map(u => u.id));
  let added = 0;
  let skipped = 0;

  newItems.forEach(item => {
    if (!item.id) {
      console.warn('⚠️  Skipping item without id:', item.name || 'unknown');
      skipped++;
      return;
    }
    if (existingIds.has(item.id)) {
      // Update existing
      const idx = index.usecases.findIndex(u => u.id === item.id);
      index.usecases[idx] = { ...index.usecases[idx], ...item };
      skipped++;
    } else {
      index.usecases.push(item);
      existingIds.add(item.id);
      added++;
    }
  });

  // Sort by date_added desc, then by name
  index.usecases.sort((a, b) => {
    const dateCompare = (b.date_added || '').localeCompare(a.date_added || '');
    if (dateCompare !== 0) return dateCompare;
    return (a.name || '').localeCompare(b.name || '');
  });

  index.total = index.usecases.length;
  index.last_updated = new Date().toISOString().slice(0, 10);

  saveIndex(index);

  console.log(`\n✅ Merge complete`);
  console.log(`   Added:   ${added}`);
  console.log(`   Skipped: ${skipped} (duplicates/updates)`);
  printStats(index);
}

main().catch(e => { console.error(e); process.exit(1); });