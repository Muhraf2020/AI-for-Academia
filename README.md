# AI Tools Directory (Static)

A portable, 100% static directory of AI tools for the academic research lifecycle.

## How to use

1. Open `index.html` to browse. Search, filters, and pagination run client-side.
2. Tool pages use `tool.html?slug=...` (linked from each card).
3. Add or edit tools in `data/tools.json` (schema below).

## Publish on GitHub Pages

- Push these files to a public repo.
- In **Settings → Pages**, choose **Deploy from a branch** → `main` → `/root`.
- Your site goes live at `https://yourname.github.io/ai-tools-directory/`.
- Update `assets/app.js` → `CONFIG.SITE_URL` with your live URL.
- (Optional) Custom domain: add it in **Pages** and point a CNAME to `yourname.github.io`.

## Suggest-a-tool

- Edit `assets/app.js` → `CONFIG.GOOGLE_FORM_URL` with your Google Form link.

## Data schema (`data/tools.json`)

Each item:

```json
{
  "id": "string-uuid-or-slug-safe",
  "slug": "kebab-case-unique",
  "name": "Tool Name",
  "url": "https://example.com",
  "tagline": "One-line value prop",
  "description": "2–4 sentence summary (no unverified claims).",
  "pricing": "free | freemium | paid",
  "categories": ["use one from the 17 predefined categories"],
  "tags": ["short","keywords"],
  "logo": "assets/logos/placeholder.png",
  "evidence_cites": true,
  "local_onprem": false,
  "edu_discount": false,
  "free_tier": true,
  "beta": false,
  "created_at": "2025-08-29"
}
```

## Categories
- General research assistants & chatbots
- Discover & map literature
- Read, summarize, & extract
- Evaluate claims & citations
- Citation & reference management
- Writing & publishing
- Coding, stats, & automation
- Data wrangling, analysis, & visualization
- Qualitative analysis
- Transcription & meeting notes
- Surveys & text analytics
- Figures, images & visualizations
- Teaching & assessment
- Integrity & compliance
- Project & experiment tracking
- Policy & ethics support
- Collaboration & knowledge management

## Disclaimer (include on site)

**Tools & Links Disclaimer.** The tools and external links referenced are provided solely for informational purposes. Inclusion does not constitute endorsement or preference; no affiliate relationships. Features, pricing, availability, and policies may change; verify current details and comply with your institution’s policies on AI use, research integrity, data privacy, and security. External websites are not under our control; links may change. All trademarks belong to their owners. No warranty is expressed or implied.
