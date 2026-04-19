# Smart Intel - OpenClaw Handover

## What this is

A single Node.js script that scans 62 company job APIs and generates an HTML dashboard of AI jobs in the Netherlands and EU. Run it daily on cron.

## Setup (one time)

```bash
cd smart-intel
npm install
```

## Run

```bash
node scan-and-build.mjs
```

This produces `index.html` with all matching jobs, salary data, and apply links.

## Cron

Add this to crontab to run daily at 08:00 CET:

```
0 6 * * * cd /path/to/smart-intel && node scan-and-build.mjs >> data/cron.log 2>&1
```

Or use the GitHub Actions workflow at `.github/workflows/daily-scan.yml` which does the same thing and auto-publishes to GitHub Pages.

## To publish to GitHub

```bash
git add index.html data/
git commit -m "Daily scan: $(date +%Y-%m-%d)"
git push origin main
```

GitHub Pages serves index.html automatically.

## To add or remove companies

Edit `config.yml`. Companies are grouped by platform:

- `greenhouse_companies` - needs slug (from boards-api.greenhouse.io URL)
- `lever_companies` - needs slug (from jobs.lever.co URL)
- `ashby_companies` - needs slug (from jobs.ashbyhq.com URL)

## To change job filters

Edit `config.yml`:

- `keywords.positive` - what to match in job titles
- `keywords.negative` - what to exclude
- `location_filter.include` - which locations to keep

## Files

- `scan-and-build.mjs` - the script (scan + generate HTML)
- `config.yml` - all settings
- `index.html` - output dashboard
- `data/scan-history.json` - tracks runs
- `.github/workflows/daily-scan.yml` - GitHub Actions cron

That's it. One script, one config, one output file.
