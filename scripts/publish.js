#!/usr/bin/env node
/**
 * Smart Intel Publisher v2
 * Converts research markdown files to HTML pages and builds the index.json
 * Uses marked library for proper markdown rendering.
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '..', '..', 'research');
const INTEL_DIR = path.join(__dirname, '..', 'docs', 'intel');
const INDEX_PATH = path.join(INTEL_DIR, 'index.json');

// Proper markdown to HTML converter
function md2html(md) {
  let html = md;
  
  // Pre-process: protect code blocks
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code class="lang-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`);
    return `\n%%CODEBLOCK_${codeBlocks.length - 1}%%\n`;
  });
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Tables
  html = html.replace(/(\|.+\|[\r\n]+\|[-| :]+\|[\r\n]+((\|.+\|[\r\n]?)+))/g, (table) => {
    const rows = table.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return table;
    const headerCells = rows[0].split('|').filter(c => c.trim());
    let tableHtml = '<div class="table-wrap"><table><thead><tr>';
    headerCells.forEach(c => { tableHtml += `<th>${c.trim()}</th>`; });
    tableHtml += '</tr></thead><tbody>';
    for (let i = 2; i < rows.length; i++) {
      const cells = rows[i].split('|').filter(c => c.trim());
      tableHtml += '<tr>';
      cells.forEach(c => { tableHtml += `<td>${c.trim()}</td>`; });
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table></div>';
    return tableHtml;
  });
  
  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');
  
  // Headers (must be before bold/italic)
  html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  
  // Bold + Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
  // Unordered lists
  html = html.replace(/(^[\t ]*- .+(\n[\t ]*- .+)*)/gm, (block) => {
    const items = block.split('\n').map(l => l.replace(/^[\t ]*- /, '').trim());
    return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
  });
  
  // Ordered lists
  html = html.replace(/(^\d+\. .+(\n\d+\. .+)*)/gm, (block) => {
    const items = block.split('\n').map(l => l.replace(/^\d+\. /, '').trim());
    return '<ol>' + items.map(i => `<li>${i}</li>`).join('') + '</ol>';
  });
  
  // Blockquotes
  html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
  
  // Paragraphs - wrap loose text in <p> tags
  html = html.split('\n\n').map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<ol') || 
        block.startsWith('<table') || block.startsWith('<div') || block.startsWith('<pre') || 
        block.startsWith('<hr') || block.startsWith('<blockquote') ||
        block.startsWith('%%CODEBLOCK')) return block;
    // Don't wrap if already block-level
    if (block.match(/^<(h[1-6]|ul|ol|table|div|pre|hr|blockquote)/)) return block;
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  
  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`%%CODEBLOCK_${i}%%`, block);
  });
  
  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Extract metadata from markdown
function extractMeta(content, filename) {
  const lines = content.split('\n');
  let title = filename.replace(/\.md$/, '').replace(/-/g, ' ');
  let date = '';
  let excerpt = '';
  let tags = [];
  
  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.replace(/^# /, '').replace(/\*.*?\*/g, '').trim();
      break;
    }
  }
  
  // Extract date
  const dateMatch = content.match(/Date[:\s]*(\w+ \d+,?\s*\d{4})/i) 
    || content.match(/Date[:\s]*(\d{4}-\d{2}-\d{2})/i)
    || content.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) date = dateMatch[1];
  else date = new Date().toISOString().split('T')[0];
  
  // Auto-tag based on content
  const lower = content.toLowerCase();
  if (lower.includes('china') || lower.includes('geopolit') || lower.includes('sovereign') || lower.includes('regulation')) tags.push('geopolitics');
  if (lower.includes('nvidia') || lower.includes('architecture') || lower.includes('protocol') || lower.includes('technical')) tags.push('tech');
  if (lower.includes('revenue') || lower.includes('business') || lower.includes('pricing') || lower.includes('market') || lower.includes('cost')) tags.push('business');
  if (lower.includes('agent') || lower.includes('llm') || lower.includes('openai') || lower.includes('claude') || lower.includes('model')) tags.push('ai');
  if (lower.includes('cloud') || lower.includes('aws') || lower.includes('azure') || lower.includes('bedrock') || lower.includes('gcp')) tags.push('cloud');
  if (lower.includes('security') || lower.includes('malware') || lower.includes('sandbox') || lower.includes('vulnerability')) tags.push('security');
  
  // First real paragraph as excerpt — skip headers, tables, metadata, code, short lines
  const allLines = content.split('\n');
  let excerptText = '';
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    // Skip empty, headers, dividers, metadata, tables, code fences, list-only blocks
    if (!line || line.startsWith('#') || line.startsWith('---') || line.startsWith('```')) continue;
    if (line.startsWith('|') || line.includes('|---|')) continue;
    if (line.startsWith('*Date') || line.startsWith('**Date') || line.startsWith('**Author')) continue;
    if (line.length < 50) continue;
    // Skip lines that are pure list items
    if (line.startsWith('- ') && !line.includes('. ')) continue;
    // Found a good line
    excerptText = line;
    // Grab next line too if it's a continuation
    if (i + 1 < allLines.length) {
      const next = allLines[i + 1].trim();
      if (next && !next.startsWith('#') && !next.startsWith('-') && !next.startsWith('|') && !next.startsWith('*') && next.length > 20) {
        excerptText += ' ' + next;
      }
    }
    break;
  }
  excerpt = excerptText.replace(/\*\*/g, '').replace(/[#`\[\]]/g, '').replace(/\(.*?\)/g, '').trim().substring(0, 200);
  if (excerpt.length >= 200) excerpt += '...';
  
  return { title: title.trim(), date, excerpt, tags: [...new Set(tags)] };
}

// HTML template for article page
function articleHtml(title, date, tags, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Smart Intel</title>
<meta name="description" content="AI-generated intelligence report by Scout">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔭</text></svg>">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,system-ui,'Segoe UI',sans-serif;background:#08090a;color:#c8ccd0;line-height:1.8}
a{color:#60a5fa;text-decoration:none}a:hover{text-decoration:underline}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid #16181d;background:#0c0d10}
.topbar .back{color:#9ca3af;font-size:.9em;display:flex;align-items:center;gap:6px}
.topbar .back:hover{color:#60a5fa}
.topbar .brand{color:#555;font-size:.8em}
article{max-width:740px;margin:0 auto;padding:48px 24px 80px}
article h1{font-size:2.2em;color:#f1f3f5;font-weight:700;line-height:1.3;margin-bottom:12px}
article .meta{color:#6b7280;font-size:.85em;margin-bottom:32px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
article .tag{display:inline-block;background:rgba(96,165,250,.1);color:#60a5fa;padding:3px 10px;border-radius:20px;font-size:.75em;font-weight:500;text-transform:uppercase;letter-spacing:.5px}
article h2{color:#f1f3f5;font-size:1.4em;margin-top:40px;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e2028}
article h3{color:#d1d5db;font-size:1.1em;margin-top:24px;margin-bottom:10px}
article h4{color:#9ca3af;font-size:1em;margin-top:20px;margin-bottom:8px}
article p{margin-bottom:16px;color:#9ca3af}
article ul,article ol{margin:12px 0 16px 28px}
article li{margin-bottom:8px;color:#9ca3af}
article li strong{color:#d1d5db}
article strong{color:#e5e7eb}
article em{color:#a78bfa}
article code{background:#13151a;padding:2px 7px;border-radius:4px;font-size:.88em;color:#7dd3fc;font-family:'JetBrains Mono',monospace}
article pre{background:#0c0d10;border:1px solid #1e2028;border-radius:10px;padding:20px;overflow-x:auto;margin:20px 0}
article pre code{background:none;padding:0;color:#9ca3af;font-size:.85em}
.table-wrap{overflow-x:auto;margin:20px 0;border-radius:10px;border:1px solid #1e2028}
article table{width:100%;border-collapse:collapse;font-size:.88em}
article th{background:#13151a;color:#d1d5db;padding:10px 14px;text-align:left;font-weight:600;border-bottom:1px solid #1e2028}
article td{padding:10px 14px;border-bottom:1px solid #13151a;color:#9ca3af}
article tr:hover td{background:rgba(96,165,250,.03)}
article blockquote{border-left:3px solid #60a5fa;padding:12px 20px;margin:20px 0;background:rgba(96,165,250,.04);border-radius:0 8px 8px 0}
article blockquote p{color:#9ca3af;margin:0}
article hr{border:none;border-top:1px solid #1e2028;margin:32px 0}
.footer{text-align:center;padding:40px 24px;border-top:1px solid #16181d;margin-top:60px}
.footer p{color:#374151;font-size:.85em}
.footer a{color:#4b5563}
@media(max-width:640px){article{padding:24px 16px 60px}article h1{font-size:1.6em}}
</style>
</head>
<body>
<div class="topbar">
  <a class="back" href="../">← Back to feed</a>
  <span class="brand">Smart Intel</span>
</div>
<article>
<h1>${title}</h1>
<div class="meta">
  <span>${date}</span>
  ${tags.map(t => `<span class="tag">${t}</span>`).join(' ')}
</div>
${bodyHtml}
</article>
<div class="footer"><p>Built by <a href="https://nl.linkedin.com/in/sameer-goel">Sameer Goel</a> with Scout 🔭</p></div>
</body>
</html>`;
}

// Main
function publish() {
  if (!fs.existsSync(INTEL_DIR)) fs.mkdirSync(INTEL_DIR, { recursive: true });
  
  const existing = fs.existsSync(INDEX_PATH) ? JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) : { articles: [] };
  const existingSlugs = new Set(existing.articles.map(a => a.slug));
  
  if (!fs.existsSync(RESEARCH_DIR)) { console.log('No research/ directory found.'); return; }
  const files = fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.md'));
  
  let newCount = 0;
  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(RESEARCH_DIR, file), 'utf8');
    const meta = extractMeta(content, file);
    const bodyHtml = md2html(content);
    
    const html = articleHtml(meta.title, meta.date, meta.tags, bodyHtml);
    fs.writeFileSync(path.join(INTEL_DIR, `${slug}.html`), html);
    
    if (!existingSlugs.has(slug)) {
      existing.articles.unshift({ slug, title: meta.title, date: meta.date, excerpt: meta.excerpt, tags: meta.tags });
      newCount++;
      console.log(`✅ Published: ${meta.title}`);
    } else {
      const idx = existing.articles.findIndex(a => a.slug === slug);
      if (idx >= 0) existing.articles[idx] = { slug, title: meta.title, date: meta.date, excerpt: meta.excerpt, tags: meta.tags };
      console.log(`🔄 Updated: ${meta.title}`);
    }
  }
  
  existing.articles.sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(INDEX_PATH, JSON.stringify(existing, null, 2));
  console.log(`\nDone. ${newCount} new, ${files.length} total articles. Index: ${INDEX_PATH}`);
}

publish();
