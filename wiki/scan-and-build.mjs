#!/usr/bin/env node
// Smart Intel - Scan company APIs and generate job dashboard
// Usage: node scan-and-build.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'config.yml');
const HISTORY_PATH = join(__dirname, 'data', 'scan-history.json');
const OUTPUT_PATH = join(__dirname, 'index.html');

// Ensure data dir exists
if (!existsSync(join(__dirname, 'data'))) mkdirSync(join(__dirname, 'data'));

// Load config
const config = parseYaml(readFileSync(CONFIG_PATH, 'utf-8'));

// Load scan history for dedup
let history = {};
if (existsSync(HISTORY_PATH)) {
  try { history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')); } catch { history = {}; }
}

const positiveKw = (config.keywords?.positive || []).map(k => k.toLowerCase());
const negativeKw = (config.keywords?.negative || []).map(k => k.toLowerCase());
const seniorityKw = (config.keywords?.seniority_boost || []).map(k => k.toLowerCase());
const locInclude = (config.location_filter?.include || []).map(k => k.toLowerCase());

function matchesKeywords(title) {
  const t = title.toLowerCase();
  if (negativeKw.some(n => t.includes(n))) return false;
  return positiveKw.some(p => t.includes(p));
}

function matchesLocation(location) {
  const l = location.toLowerCase();
  return locInclude.some(f => l.includes(f));
}

function hasSeniority(title) {
  const t = title.toLowerCase();
  return seniorityKw.some(s => t.includes(s));
}

async function fetchJSON(url, timeout = 10000) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

// --- Greenhouse Scanner ---
async function scanGreenhouse(companies) {
  const results = [];
  for (const co of companies) {
    const base = co.api_base || 'https://boards-api.greenhouse.io/v1/boards';
    const url = `${base}/${co.slug}/jobs?content=true`;
    console.log(`  Greenhouse: ${co.name}...`);
    const data = await fetchJSON(url);
    if (!data?.jobs) continue;

    for (const job of data.jobs) {
      const loc = job.location?.name || '';
      const title = job.title || '';
      if (!matchesKeywords(title)) continue;
      if (!matchesLocation(loc)) continue;

      let salary = '';
      if (job.metadata) {
        for (const m of job.metadata) {
          if (m.name?.toLowerCase().includes('salary') && m.value) salary = m.value;
        }
      }
      if (!salary && job.content) {
        const m = job.content.match(/\$[\d,]+\s*[-]\s*\$[\d,]+/);
        if (m) salary = m[0];
      }

      const jobUrl = `https://boards.greenhouse.io/${co.slug}/jobs/${job.id}`;
      results.push({
        company: co.name,
        role: title,
        location: loc,
        salary: salary.substring(0, 40),
        url: jobUrl,
        source: 'greenhouse',
        senior: hasSeniority(title),
        date: new Date().toISOString().split('T')[0]
      });
    }
  }
  return results;
}

// --- Lever Scanner ---
async function scanLever(companies) {
  const results = [];
  for (const co of companies) {
    console.log(`  Lever: ${co.name}...`);
    const data = await fetchJSON(`https://api.lever.co/v0/postings/${co.slug}?mode=json`);
    if (!Array.isArray(data)) continue;

    for (const post of data) {
      const title = post.text || '';
      const loc = post.categories?.location || '';
      if (!matchesKeywords(title)) continue;
      if (!matchesLocation(loc)) continue;

      let salary = '';
      if (post.salaryRange?.min && post.salaryRange?.max) {
        const cur = post.salaryRange.currency || '';
        salary = `${cur}${post.salaryRange.min.toLocaleString()}-${post.salaryRange.max.toLocaleString()}`;
      }

      results.push({
        company: co.name,
        role: title,
        location: loc,
        salary: salary.substring(0, 40),
        url: post.hostedUrl || `https://jobs.lever.co/${co.slug}/${post.id}`,
        source: 'lever',
        senior: hasSeniority(title),
        date: new Date().toISOString().split('T')[0]
      });
    }
  }
  return results;
}

// --- Ashby Scanner ---
async function scanAshby(companies) {
  const results = [];
  for (const co of companies) {
    console.log(`  Ashby: ${co.name}...`);
    try {
      const resp = await fetch('https://jobs.ashbyhq.com/api/non-user-graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationName: 'ApiJobBoardWithTeams',
          variables: { organizationHostedJobsPageName: co.slug },
          query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
            jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
              jobPostings { id title locationName }
            }
          }`
        }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json();
      const posts = data?.data?.jobBoard?.jobPostings || [];

      for (const p of posts) {
        const title = p.title || '';
        const loc = p.locationName || '';
        if (!matchesKeywords(title)) continue;
        if (!matchesLocation(loc)) continue;

        results.push({
          company: co.name,
          role: title,
          location: loc,
          salary: '',
          url: `https://jobs.ashbyhq.com/${co.slug}/${p.id}`,
          source: 'ashby',
          senior: hasSeniority(title),
          date: new Date().toISOString().split('T')[0]
        });
      }
    } catch { /* timeout, skip */ }
  }
  return results;
}

// --- HTML Generator ---
function scoreColor(salary) {
  if (!salary) return '';
  const num = parseInt(salary.replace(/[^0-9]/g, ''));
  if (num >= 200000) return '#22c55e';
  if (num >= 150000) return '#84cc16';
  if (num >= 100000) return '#eab308';
  return '#f97316';
}

function generateHTML(jobs, scanDate) {
  const nlJobs = jobs.filter(j => {
    const l = j.location.toLowerCase();
    return l.includes('amsterdam') || l.includes('netherlands') || l.includes('hague') ||
      l.includes('eindhoven') || l.includes('rotterdam') || l.includes('utrecht');
  });
  const euJobs = jobs.filter(j => !nlJobs.includes(j));
  const withSalary = jobs.filter(j => j.salary).length;
  const seniorJobs = jobs.filter(j => j.senior).length;
  const companies = [...new Set(jobs.map(j => j.company))].length;

  const jobRow = (j) => {
    const salaryHtml = j.salary
      ? `<span style="color:#22c55e;font-weight:600">${j.salary}</span>`
      : '<span style="color:#475569">-</span>';
    const nlBadge = j.location.toLowerCase().match(/amsterdam|netherlands|hague|eindhoven|rotterdam|utrecht/)
      ? '<span style="background:#f97316;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;margin-left:6px">NL</span>'
      : '';
    const seniorBadge = j.senior
      ? '<span style="background:#8b5cf6;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;margin-left:6px">Senior+</span>'
      : '';
    return `<tr>
      <td><a href="${j.url}" target="_blank"><strong>${j.company}</strong></a></td>
      <td><a href="${j.url}" target="_blank">${j.role}</a>${nlBadge}${seniorBadge}</td>
      <td>${j.location}</td>
      <td>${salaryHtml}</td>
      <td><span style="color:#64748b;font-size:12px">${j.source}</span></td>
      <td><a href="${j.url}" target="_blank" style="background:#06b6d4;color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap">Apply</a></td>
    </tr>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Smart Intel - Sameer's AI Job Dashboard</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
  .container{max-width:1400px;margin:0 auto;padding:24px}
  .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;flex-wrap:wrap;gap:16px}
  .header h1{font-size:28px;font-weight:700;background:linear-gradient(135deg,#06b6d4,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .header .meta{font-size:13px;color:#64748b;text-align:right}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:32px}
  .stat-card{background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155}
  .stat-card .label{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px}
  .stat-card .value{font-size:32px;font-weight:700;color:#f1f5f9}
  .stat-card .sub{font-size:12px;color:#64748b;margin-top:4px}
  .section{margin-bottom:32px}
  .section-title{font-size:18px;font-weight:600;margin-bottom:16px;color:#f1f5f9;display:flex;align-items:center;gap:8px}
  .section-title .count{background:#334155;color:#94a3b8;padding:2px 8px;border-radius:10px;font-size:13px}
  table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:12px;overflow:hidden}
  th{background:#0f172a;padding:12px 16px;text-align:left;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;position:sticky;top:0}
  td{padding:10px 16px;border-bottom:1px solid rgba(51,65,85,0.5);font-size:14px}
  tr:hover{background:#334155}
  a{color:#06b6d4;text-decoration:none}
  a:hover{text-decoration:underline}
  .footer{text-align:center;padding:24px;color:#475569;font-size:12px}
  .filter-bar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
  .filter-btn{background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:13px}
  .filter-btn:hover,.filter-btn.active{background:#334155;color:#f1f5f9;border-color:#06b6d4}
  input[type=text]{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:8px 14px;border-radius:8px;font-size:14px;width:300px}
  input[type=text]::placeholder{color:#475569}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1>Smart Intel</h1>
      <div style="color:#64748b;font-size:14px;margin-top:4px">Sameer Goel's AI Job Dashboard</div>
    </div>
    <div class="meta">
      <div>Scanned: ${scanDate}</div>
      <div>${companies} companies | ${jobs.length} matching roles</div>
      <div>Target: ${config.candidate?.target_comp || 'EUR 150K-200K'}</div>
    </div>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="label">Total Roles</div>
      <div class="value">${jobs.length}</div>
      <div class="sub">Matching your keywords</div>
    </div>
    <div class="stat-card">
      <div class="label">Netherlands</div>
      <div class="value">${nlJobs.length}</div>
      <div class="sub">NL-based roles</div>
    </div>
    <div class="stat-card">
      <div class="label">Senior+</div>
      <div class="value">${seniorJobs}</div>
      <div class="sub">Senior, Staff, Lead, Head</div>
    </div>
    <div class="stat-card">
      <div class="label">With Salary</div>
      <div class="value">${withSalary}</div>
      <div class="sub">Salary data available</div>
    </div>
    <div class="stat-card">
      <div class="label">Companies</div>
      <div class="value">${companies}</div>
      <div class="sub">Across 3 platforms</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">All Matching Roles <span class="count">${jobs.length}</span></div>
    <div style="margin-bottom:12px">
      <input type="text" id="search" placeholder="Filter by company, role, or location..." oninput="filterTable()">
    </div>
    <div style="overflow-x:auto">
    <table id="jobs-table">
      <thead>
        <tr><th>Company</th><th>Role</th><th>Location</th><th>Salary</th><th>Source</th><th></th></tr>
      </thead>
      <tbody>
        ${nlJobs.map(jobRow).join('\n        ')}
        ${euJobs.map(jobRow).join('\n        ')}
      </tbody>
    </table>
    </div>
  </div>

  <div class="footer">
    Smart Intel | Auto-generated ${scanDate} | Scans daily at 08:00 CET<br>
    <a href="https://github.com/sameer-goel/smart-intel">github.com/sameer-goel/smart-intel</a>
  </div>
</div>
<script>
function filterTable(){
  const q=document.getElementById('search').value.toLowerCase();
  const rows=document.querySelectorAll('#jobs-table tbody tr');
  rows.forEach(r=>{r.style.display=r.textContent.toLowerCase().includes(q)?'':'none'});
}
</script>
</body>
</html>`;
}

// --- Main ---
async function main() {
  const scanDate = new Date().toISOString().split('T')[0];
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  console.log(`Smart Intel scan starting: ${scanDate} ${time}`);
  console.log(`Config: ${positiveKw.length} keywords, ${locInclude.length} location filters`);

  let allJobs = [];

  // Greenhouse
  const ghCompanies = config.greenhouse_companies || [];
  console.log(`\nScanning ${ghCompanies.length} Greenhouse companies...`);
  const ghJobs = await scanGreenhouse(ghCompanies);
  allJobs.push(...ghJobs);
  console.log(`  Found: ${ghJobs.length} matching roles`);

  // Lever
  const leverCompanies = config.lever_companies || [];
  console.log(`\nScanning ${leverCompanies.length} Lever companies...`);
  const leverJobs = await scanLever(leverCompanies);
  allJobs.push(...leverJobs);
  console.log(`  Found: ${leverJobs.length} matching roles`);

  // Ashby
  const ashbyCompanies = config.ashby_companies || [];
  console.log(`\nScanning ${ashbyCompanies.length} Ashby companies...`);
  const ashbyJobs = await scanAshby(ashbyCompanies);
  allJobs.push(...ashbyJobs);
  console.log(`  Found: ${ashbyJobs.length} matching roles`);

  // Dedup by URL
  const seen = new Set();
  allJobs = allJobs.filter(j => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  // Sort: NL first, then senior, then by company
  allJobs.sort((a, b) => {
    const aNL = a.location.toLowerCase().match(/amsterdam|netherlands|hague/) ? 0 : 1;
    const bNL = b.location.toLowerCase().match(/amsterdam|netherlands|hague/) ? 0 : 1;
    if (aNL !== bNL) return aNL - bNL;
    if (a.senior !== b.senior) return b.senior ? 1 : -1;
    if (a.salary && !b.salary) return -1;
    if (!a.salary && b.salary) return 1;
    return a.company.localeCompare(b.company);
  });

  console.log(`\nTotal: ${allJobs.length} unique roles (${allJobs.filter(j=>j.salary).length} with salary)`);

  // Save history
  history[scanDate] = { total: allJobs.length, withSalary: allJobs.filter(j=>j.salary).length };
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  // Generate HTML
  const html = generateHTML(allJobs, `${scanDate} ${time}`);
  writeFileSync(OUTPUT_PATH, html);
  console.log(`Dashboard written to: ${OUTPUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
