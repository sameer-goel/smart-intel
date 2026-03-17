#!/usr/bin/env node
/**
 * Smart Intel Publisher
 * Converts research markdown files to HTML pages and builds the index.json
 * Run nightly to auto-publish intelligence to GitHub Pages.
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '..', '..', 'research');
const INTEL_DIR = path.join(__dirname, '..', 'docs', 'intel');
const INDEX_PATH = path.join(INTEL_DIR, 'index.json');

// Simple markdown to HTML
function md2html(md) {
  return md
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^\- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\| (.*) \|/gm, (match) => {
      const cells = match.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>')
    .replace(/^\> (.*$)/gm, '<blockquote>$1</blockquote>')
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/```\w*\n?/g, '').replace(/```/g, '');
      return `<pre><code>${code}</code></pre>`;
    })
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[huptlbo])/gm, (m, o, s) => s[o] === '<' ? '' : '')
    ;
}

// Extract metadata from markdown
function extractMeta(content, filename) {
  const lines = content.split('\n');
  let title = filename.replace(/\.md$/, '').replace(/-/g, ' ');
  let date = '';
  let excerpt = '';
  let tags = [];
  
  for (const line of lines) {
    if (line.startsWith('# ') && !title.includes('—')) {
      title = line.replace(/^# /, '').replace(/\*.*?\*/g, '');
      break;
    }
  }
  
  // Extract date
  const dateMatch = content.match(/Date[:\s]*(\d{4}-\d{2}-\d{2}|\w+ \d+,?\s*\d{4})/i) 
    || content.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) date = dateMatch[1];
  else {
    const fdate = filename.match(/(\d{4}-\d{2}-\d{2})/);
    date = fdate ? fdate[1] : new Date().toISOString().split('T')[0];
  }
  
  // Auto-tag based on content
  const lower = content.toLowerCase();
  if (lower.includes('china') || lower.includes('geopolit') || lower.includes('sovereign')) tags.push('geopolitics');
  if (lower.includes('nvidia') || lower.includes('architecture') || lower.includes('protocol')) tags.push('tech');
  if (lower.includes('revenue') || lower.includes('business') || lower.includes('pricing') || lower.includes('market')) tags.push('business');
  if (lower.includes('agent') || lower.includes('llm') || lower.includes('openai') || lower.includes('claude')) tags.push('ai');
  if (lower.includes('cloud') || lower.includes('aws') || lower.includes('azure') || lower.includes('bedrock')) tags.push('cloud');
  if (lower.includes('security') || lower.includes('malware') || lower.includes('sandbox')) tags.push('security');
  
  // First paragraph as excerpt
  const paras = content.split('\n\n').filter(p => !p.startsWith('#') && !p.startsWith('*') && !p.startsWith('---') && p.trim().length > 30);
  excerpt = (paras[0] || '').replace(/[#*`]/g, '').trim().substring(0, 200);
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
<title>${title} — Smart Intel</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,'Segoe UI',sans-serif;background:#050505;color:#e0e0e0;line-height:1.7}
.back{display:inline-block;padding:16px 20px;color:#4fc3f7;text-decoration:none;font-size:.9em}
.back:hover{text-decoration:underline}
article{max-width:800px;margin:0 auto;padding:20px 20px 60px}
article h1{font-size:2em;color:#fff;margin-bottom:8px}
article .meta{color:#888;font-size:.85em;margin-bottom:24px}
article .tag{display:inline-block;background:#1a1a2e;color:#ab47bc;padding:2px 8px;border-radius:4px;font-size:.75em;margin-right:6px}
article h2{color:#4fc3f7;font-size:1.3em;margin-top:32px;margin-bottom:12px;border-bottom:1px solid #1a1a1a;padding-bottom:6px}
article h3{color:#ddd;font-size:1.1em;margin-top:20px;margin-bottom:8px}
article p{margin-bottom:12px;color:#ccc}
article ul{margin:12px 0 12px 24px}
article li{margin-bottom:6px;color:#bbb}
article strong{color:#fff}
article code{background:#1a1a1a;padding:2px 6px;border-radius:3px;font-size:.9em;color:#4fc3f7}
article pre{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:16px;overflow-x:auto;margin:16px 0}
article pre code{background:none;padding:0;color:#aaa}
article table{width:100%;border-collapse:collapse;margin:16px 0}
article td,article th{border:1px solid #1a1a1a;padding:8px 12px;text-align:left;font-size:.85em}
article tr:nth-child(odd){background:#0a0a0a}
article blockquote{border-left:3px solid #4fc3f7;padding-left:16px;margin:16px 0;color:#999}
.footer{text-align:center;padding:30px;border-top:1px solid #111;color:#444;font-size:.85em}
.footer a{color:#4fc3f7;text-decoration:none}
</style>
</head>
<body>
<a class="back" href="../">← Back to Smart Intel</a>
<article>
<h1>${title}</h1>
<div class="meta">${date} ${tags.map(t => `<span class="tag">${t}</span>`).join(' ')}</div>
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
  
  // Find all markdown files in research/
  if (!fs.existsSync(RESEARCH_DIR)) { console.log('No research/ directory found.'); return; }
  const files = fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.md'));
  
  let newCount = 0;
  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(RESEARCH_DIR, file), 'utf8');
    const meta = extractMeta(content, file);
    const bodyHtml = md2html(content);
    
    // Write HTML article
    const html = articleHtml(meta.title, meta.date, meta.tags, `<p>${bodyHtml}</p>`);
    fs.writeFileSync(path.join(INTEL_DIR, `${slug}.html`), html);
    
    if (!existingSlugs.has(slug)) {
      existing.articles.unshift({ slug, title: meta.title, date: meta.date, excerpt: meta.excerpt, tags: meta.tags });
      newCount++;
      console.log(`✅ Published: ${meta.title}`);
    } else {
      // Update existing entry
      const idx = existing.articles.findIndex(a => a.slug === slug);
      if (idx >= 0) existing.articles[idx] = { slug, title: meta.title, date: meta.date, excerpt: meta.excerpt, tags: meta.tags };
      console.log(`🔄 Updated: ${meta.title}`);
    }
  }
  
  // Sort by date descending
  existing.articles.sort((a, b) => b.date.localeCompare(a.date));
  
  // Write index
  fs.writeFileSync(INDEX_PATH, JSON.stringify(existing, null, 2));
  console.log(`\nDone. ${newCount} new, ${files.length} total articles. Index: ${INDEX_PATH}`);
}

publish();
