#!/usr/bin/env node
/**
 * Smart Intel Newsletter Generator
 * ---------------------------------
 * Reads insights.json and generates a premium HTML email newsletter
 * compatible with Buttondown's API for distribution.
 *
 * Usage:
 *   node scripts/newsletter.js --generate          # Print HTML to stdout
 *   node scripts/newsletter.js --generate -o out.html  # Write to file
 *   node scripts/newsletter.js --send              # Send via Buttondown API (requires BUTTONDOWN_API_KEY)
 *   node scripts/newsletter.js --preview           # Open in browser (macOS/Linux)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Config ──────────────────────────────────────────────────────────────────
const INSIGHTS_PATH = path.resolve(__dirname, '../docs/intel/insights.json');
const BUTTONDOWN_API = 'https://api.buttondown.email/v1/emails';
const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY || '';
const MAX_INSIGHTS_PER_CATEGORY = 3;

// ─── Category metadata ──────────────────────────────────────────────────────
const CATEGORY_META = {
  ai:          { icon: '🤖', label: 'AI & Agents',   color: '#60a5fa', bg: 'rgba(96,165,250,.1)'  },
  tech:        { icon: '⚙️', label: 'Technology',     color: '#2dd4bf', bg: 'rgba(45,212,191,.1)'  },
  business:    { icon: '💰', label: 'Business',       color: '#fbbf24', bg: 'rgba(251,191,36,.1)'  },
  geopolitics: { icon: '🌍', label: 'Geopolitics',    color: '#a78bfa', bg: 'rgba(167,139,250,.1)' },
  cloud:       { icon: '☁️', label: 'Cloud',           color: '#38bdf8', bg: 'rgba(56,189,248,.1)'  },
  security:    { icon: '🔒', label: 'Security',       color: '#f87171', bg: 'rgba(248,113,113,.1)' },
};

const CATEGORY_ORDER = ['ai', 'tech', 'business', 'geopolitics', 'cloud', 'security'];

// ─── Date helpers ────────────────────────────────────────────────────────────
function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function shortDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Load insights ──────────────────────────────────────────────────────────
function loadInsights() {
  if (!fs.existsSync(INSIGHTS_PATH)) {
    console.error(`❌ insights.json not found at ${INSIGHTS_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
}

// ─── Domain extractor ────────────────────────────────────────────────────────
function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

// ─── HTML Email Template ────────────────────────────────────────────────────
function generateEmailHTML(data) {
  const now = new Date();
  const dateStr = formatDate(now);
  const shortDateStr = shortDate(now);
  const categories = data.categories || {};

  // Count total insights
  let totalInsights = 0;
  CATEGORY_ORDER.forEach(k => {
    if (categories[k]) totalInsights += Math.min(categories[k].insights.length, MAX_INSIGHTS_PER_CATEGORY);
  });

  // Build category sections
  let sectionsHTML = '';
  CATEGORY_ORDER.forEach((key, idx) => {
    const cat = categories[key];
    if (!cat || !cat.insights || cat.insights.length === 0) return;
    const meta = CATEGORY_META[key] || { icon: '📌', label: key, color: '#9ca3af', bg: 'rgba(156,163,175,.1)' };
    const insights = cat.insights.slice(0, MAX_INSIGHTS_PER_CATEGORY);

    sectionsHTML += `
      <!-- ${meta.label} -->
      <tr><td style="padding:0 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
          <tr>
            <td style="padding:24px 0 12px 0;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:20px;line-height:1;vertical-align:middle;padding-right:8px;">${meta.icon}</td>
                  <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:${meta.color};text-transform:uppercase;letter-spacing:1.5px;vertical-align:middle;">${meta.label}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>
`;

    insights.forEach((ins, i) => {
      const domain = extractDomain(ins.url);
      const isWarning = ins.headline.includes('⚠️');
      const headlineClean = ins.headline.replace('⚠️ ', '');

      sectionsHTML += `
      <tr><td style="padding:0 32px ${i === insights.length - 1 ? '0' : '0'} 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
          <tr><td style="background:${isWarning ? 'rgba(248,113,113,.08)' : 'rgba(255,255,255,.03)'};border:1px solid ${isWarning ? 'rgba(248,113,113,.15)' : 'rgba(255,255,255,.06)'};border-radius:12px;padding:20px;">
            ${isWarning ? '<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;"><tr><td style="background:rgba(248,113,113,.15);color:#f87171;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:3px 8px;border-radius:4px;">⚠️ Alert</td></tr></table>' : ''}
            <a href="${ins.url || '#'}" style="text-decoration:none;display:block;" target="_blank">
              <p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#e8eaed;line-height:1.5;margin:0 0 8px 0;">${headlineClean}</p>
              <p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#8b8f98;line-height:1.6;margin:0 0 10px 0;">${ins.detail}</p>
              ${domain ? `<p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:${meta.color};margin:0;">↗ ${domain}</p>` : ''}
            </a>
          </td></tr>
        </table>
      </td></tr>
`;
    });

    // Divider between categories (not after the last one)
    if (idx < CATEGORY_ORDER.length - 1 && categories[CATEGORY_ORDER[idx + 1]]) {
      sectionsHTML += `
      <tr><td style="padding:8px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="border-top:1px solid rgba(255,255,255,.04);font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td></tr>
`;
    }
  });

  // Full email HTML
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>🔭 Smart Intel Weekly — ${shortDateStr}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  /* Reset */
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; }
  img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }

  /* Dark mode support */
  :root { color-scheme: dark; supported-color-schemes: dark; }
  @media (prefers-color-scheme: dark) {
    body { background-color: #050507 !important; }
  }

  /* Mobile */
  @media screen and (max-width: 600px) {
    .email-container { width: 100% !important; max-width: 100% !important; }
    .mobile-pad { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#050507;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

<!-- Preheader (hidden preview text) -->
<div style="display:none;font-size:1px;color:#050507;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
  ${totalInsights} curated insights across AI, Cloud, Security & more — ${shortDateStr}
</div>

<!-- Outer wrapper -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#050507;">
<tr><td align="center" style="padding:24px 16px;">

  <!-- Email container -->
  <table role="presentation" class="email-container" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#0a0a0f;border:1px solid rgba(255,255,255,.06);border-radius:16px;overflow:hidden;">

    <!-- ═══ HEADER ═══ -->
    <tr><td style="background:linear-gradient(135deg,rgba(96,165,250,.08) 0%,rgba(167,139,250,.06) 50%,rgba(45,212,191,.04) 100%);padding:40px 32px 32px;text-align:center;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center">
          <p style="font-size:40px;line-height:1;margin:0 0 16px;">🔭</p>
          <h1 style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:#f1f3f5;letter-spacing:-.5px;margin:0 0 6px;">Smart Intel Weekly</h1>
          <p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6b7280;margin:0 0 20px;">${dateStr}</p>
          <table cellpadding="0" cellspacing="0" border="0" align="center">
            <tr>
              <td style="background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.15);border-radius:20px;padding:4px 14px;">
                <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;color:#4ade80;letter-spacing:.3px;">● ${totalInsights} INSIGHTS</span>
              </td>
              <td width="10"></td>
              <td style="background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.15);border-radius:20px;padding:4px 14px;">
                <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;color:#60a5fa;letter-spacing:.3px;">${Object.keys(categories).length} CATEGORIES</span>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- ═══ INTRO ═══ -->
    <tr><td style="padding:28px 32px 8px 32px;">
      <p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#9ca3af;line-height:1.7;margin:0;">
        Good morning. Here's your curated intelligence briefing — the signals that matter for Solutions Architects tracking AI, cloud, and emerging tech.
      </p>
    </td></tr>

    <!-- ═══ INSIGHTS ═══ -->
    ${sectionsHTML}

    <!-- ═══ CTA ═══ -->
    <tr><td style="padding:32px 32px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="background:linear-gradient(135deg,rgba(96,165,250,.08),rgba(167,139,250,.06));border:1px solid rgba(96,165,250,.12);border-radius:12px;padding:24px;text-align:center;">
          <p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#e0e2e6;margin:0 0 12px;">Want the full interactive dashboard?</p>
          <table cellpadding="0" cellspacing="0" border="0" align="center">
            <tr>
              <td style="background:linear-gradient(135deg,#60a5fa,#a78bfa);border-radius:8px;padding:12px 28px;">
                <a href="https://sameer-goel.github.io/smart-intel/" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:.3px;">View Live Dashboard →</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- ═══ FOOTER ═══ -->
    <tr><td style="padding:28px 32px 36px;border-top:1px solid rgba(255,255,255,.04);text-align:center;">
      <p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#4b5563;line-height:1.7;margin:0 0 8px;">
        Curated by <strong style="color:#6b7280;">Scout AI</strong> for <strong style="color:#6b7280;">Smart Intel</strong>
      </p>
      <p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#374151;line-height:1.7;margin:0 0 12px;">
        Built by <a href="https://nl.linkedin.com/in/sameer-goel" style="color:#60a5fa;text-decoration:none;">Sameer Goel</a> · Solutions Architect
      </p>
      <table cellpadding="0" cellspacing="0" border="0" align="center">
        <tr>
          <td style="padding:0 8px;"><a href="https://sameer-goel.github.io/smart-intel/" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#4b5563;text-decoration:none;">Dashboard</a></td>
          <td style="color:#2a2e36;">·</td>
          <td style="padding:0 8px;"><a href="https://sameer-goel.github.io/smart-intel/subscribe.html" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#4b5563;text-decoration:none;">Subscribe</a></td>
          <td style="color:#2a2e36;">·</td>
          <td style="padding:0 8px;"><a href="{{ unsubscribe_url }}" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#4b5563;text-decoration:none;">Unsubscribe</a></td>
        </tr>
      </table>
      <p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;color:#1f2937;margin:16px 0 0;">
        Powered by Buttondown · You're receiving this because you subscribed at smartintel.
      </p>
    </td></tr>

  </table>
  <!-- /email-container -->

</td></tr>
</table>
<!-- /outer wrapper -->

</body>
</html>`;
}

// ─── Buttondown API: Send email ─────────────────────────────────────────────
function sendViaButtondown(subject, htmlBody) {
  return new Promise((resolve, reject) => {
    if (!BUTTONDOWN_API_KEY) {
      reject(new Error('BUTTONDOWN_API_KEY not set. Export it as an environment variable.'));
      return;
    }

    const payload = JSON.stringify({
      subject,
      body: htmlBody,
      status: 'draft', // Change to 'about_to_send' for immediate delivery
    });

    const url = new URL(BUTTONDOWN_API);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Buttondown API error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
🔭 Smart Intel Newsletter Generator

Usage:
  node newsletter.js --generate              Generate HTML to stdout
  node newsletter.js --generate -o file.html Write HTML to file
  node newsletter.js --send                  Send as draft via Buttondown API
  node newsletter.js --send --publish        Send immediately via Buttondown API
  node newsletter.js --preview               Generate and open in browser

Environment:
  BUTTONDOWN_API_KEY   Your Buttondown API token (required for --send)
`);
    process.exit(0);
  }

  const data = loadInsights();
  const html = generateEmailHTML(data);
  const now = new Date();
  const subject = `🔭 Smart Intel Weekly — ${shortDate(now)}`;

  if (command === '--generate') {
    const outputIdx = args.indexOf('-o');
    if (outputIdx !== -1 && args[outputIdx + 1]) {
      const outPath = path.resolve(args[outputIdx + 1]);
      fs.writeFileSync(outPath, html, 'utf8');
      console.log(`✅ Newsletter HTML written to ${outPath}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Insights: ${CATEGORY_ORDER.reduce((sum, k) => sum + Math.min((data.categories[k]?.insights || []).length, MAX_INSIGHTS_PER_CATEGORY), 0)}`);
    } else {
      process.stdout.write(html);
    }
  } else if (command === '--send') {
    const publish = args.includes('--publish');
    console.log(`📧 Sending newsletter via Buttondown API...`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Mode: ${publish ? 'IMMEDIATE SEND' : 'DRAFT'}`);

    try {
      const payload = {
        subject,
        body: html,
        status: publish ? 'about_to_send' : 'draft',
      };

      if (!BUTTONDOWN_API_KEY) {
        console.error('\n❌ BUTTONDOWN_API_KEY not set.');
        console.error('   Export it: export BUTTONDOWN_API_KEY=your-key-here');
        console.error('   Get it from: https://buttondown.com/settings/api');
        process.exit(1);
      }

      const result = await sendViaButtondown(subject, html);
      console.log(`\n✅ Newsletter ${publish ? 'sent' : 'saved as draft'}!`);
      console.log(`   ID: ${result.id}`);
      if (!publish) {
        console.log(`   Review at: https://buttondown.com/emails`);
      }
    } catch (err) {
      console.error(`\n❌ Failed: ${err.message}`);
      process.exit(1);
    }
  } else if (command === '--preview') {
    const tmpFile = path.join('/tmp', `smart-intel-newsletter-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, html, 'utf8');
    console.log(`📧 Preview saved to ${tmpFile}`);
    console.log(`   Subject: ${subject}`);

    // Try to open in browser
    const { exec } = require('child_process');
    const platform = process.platform;
    const openCmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${openCmd} ${tmpFile}`, (err) => {
      if (err) console.log(`   Open manually: file://${tmpFile}`);
    });
  } else {
    console.error(`Unknown command: ${command}. Use --help for usage.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
