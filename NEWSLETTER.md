# 📧 Smart Intel Newsletter System

A lightweight email newsletter system for Smart Intel, powered by [Buttondown](https://buttondown.com).

## How It Works

```
insights.json ──→ newsletter.js ──→ HTML Email ──→ Buttondown API ──→ Subscribers
                                                         ↑
subscribe.html ──→ Buttondown Form ──→ Subscriber List ──┘
```

1. **Subscription**: Users subscribe via `subscribe.html` (embedded Buttondown form)
2. **Generation**: `scripts/newsletter.js` reads `docs/intel/insights.json` and generates a premium HTML email
3. **Delivery**: The script sends the email via Buttondown's API (or saves as draft for review)

## Quick Start

### 1. Create a Buttondown Account

1. Go to [buttondown.com](https://buttondown.com) and sign up (free, no credit card)
2. Choose your newsletter name: **smartintel**
3. Complete the onboarding wizard

### 2. Get Your API Key

1. Go to [Settings → API](https://buttondown.com/settings/api)
2. Copy your API key
3. Set it as an environment variable:
   ```bash
   export BUTTONDOWN_API_KEY=your-api-key-here
   ```

### 3. Update Form URLs

In `docs/subscribe.html`, update the form action URL if your Buttondown username differs:

```html
<form action="https://buttondown.com/smartintel" ...>
```

Replace `smartintel` with your actual Buttondown username.

### 4. Generate a Newsletter

```bash
# Preview HTML to stdout
node scripts/newsletter.js --generate

# Save to file
node scripts/newsletter.js --generate -o /tmp/newsletter.html

# Open in browser
node scripts/newsletter.js --preview
```

### 5. Send a Newsletter

```bash
# Save as draft (review in Buttondown dashboard first)
BUTTONDOWN_API_KEY=your-key node scripts/newsletter.js --send

# Send immediately to all subscribers
BUTTONDOWN_API_KEY=your-key node scripts/newsletter.js --send --publish
```

## Nightly Cron Setup

Add to your crontab or OpenClaw cron to send weekly newsletters:

```bash
# Every Monday at 8:00 AM CET (7:00 UTC)
0 7 * * 1 cd /home/ubuntu/.openclaw/workspace/smart-intel && BUTTONDOWN_API_KEY=your-key node scripts/newsletter.js --send --publish
```

Or use OpenClaw's cron system:
```
Schedule: "every Monday at 07:00 UTC"
Command: "Generate and send the Smart Intel weekly newsletter using node scripts/newsletter.js --send --publish"
```

**Recommended workflow**:
1. Nightly cron updates `insights.json` (already in place)
2. Monday morning cron generates + sends the newsletter
3. Subscribers get a weekly digest of the best insights

## Email Template Features

- **Dark theme** matching the Smart Intel dashboard
- **Mobile-responsive** (tested on Gmail, Apple Mail, Outlook)
- **Category-organized** with color-coded sections
- **Warning badges** for security alerts (⚠️ items)
- **Source links** for every insight
- **CTA** linking to the live dashboard
- **Unsubscribe** via Buttondown's `{{ unsubscribe_url }}` template variable

## Subscription Page Features

- **Premium dark theme** matching the main site
- **Email-only form** — single field, zero friction
- **Social proof** and trust signals
- **Email preview** mock showing what subscribers receive
- **Category overview** so users know what to expect
- **Buttondown embed form** with tag tracking (`smart-intel-web`)

## Free Tier Limits

| Feature | Limit |
|---------|-------|
| Subscribers | 100 |
| Emails/month | Unlimited |
| API access | ✅ Full |
| Custom domain | ❌ (paid) |
| Analytics | Basic open rates |
| Archives | ✅ Public archive |
| Markdown support | ✅ |
| HTML emails | ✅ |

**Upgrade path**: $9/month for up to 1,000 subscribers. No feature restrictions.

## File Structure

```
smart-intel/
├── scripts/
│   └── newsletter.js      # Newsletter generator + Buttondown API client
├── docs/
│   ├── subscribe.html      # Subscription landing page
│   ├── intel/
│   │   └── insights.json   # Source data for newsletter content
│   └── index.html          # Main dashboard (link to subscribe)
└── NEWSLETTER.md           # This file
```

## API Reference

### Buttondown Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /v1/emails` | POST | Create/send newsletter |
| `POST /v1/subscribers` | POST | Add subscriber (API) |
| `buttondown.com/<username>` | POST (form) | Embed subscribe form |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BUTTONDOWN_API_KEY` | For `--send` | Your Buttondown API token |

## Troubleshooting

**Form not working?**
- Ensure your Buttondown username matches the form action URL
- Check that your Buttondown account is activated (verify email)

**API returns 401?**
- Verify `BUTTONDOWN_API_KEY` is set correctly
- Regenerate the key at [buttondown.com/settings/api](https://buttondown.com/settings/api)

**Emails going to spam?**
- Set up a custom sending domain in Buttondown settings (paid plan)
- Keep subject lines clean and avoid spam trigger words
- Build reputation by sending consistently

**Empty newsletter?**
- Ensure `docs/intel/insights.json` exists and has valid data
- Run `node scripts/newsletter.js --generate` to debug output
