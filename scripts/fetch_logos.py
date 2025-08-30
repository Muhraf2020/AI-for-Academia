#!/usr/bin/env python3
"""
Fetch per-tool logos and update data/tools.json to point at local files.

- Reads:  data/tools.json   (array of tool dicts)
- Optional: data/logo_overrides.json  (slug -> explicit logo URL)
- Writes images into: assets/logos/<slug>.(png|svg)
- Updates each tool["logo"] to the local path (faster/more reliable on GitHub Pages)

Run locally:
  python scripts/fetch_logos.py
  python scripts/fetch_logos.py --force
  python scripts/fetch_logos.py --only perplexity,notebooklm
  python scripts/fetch_logos.py --dry-run

Used by CI in .github/workflows/fetch-logos.yml
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
from io import BytesIO
from urllib.parse import urlparse, urlunparse

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOOLS_JSON = ROOT / "data" / "tools.json"
OVERRIDES_JSON = ROOT / "data" / "logo_overrides.json"
LOGO_DIR = ROOT / "assets" / "logos"
REPORT_JSON = ROOT / "data" / "logo_report.json"

UA = "Mozilla/5.0 (compatible; AI-Tools-LogoFetcher/1.0; +https://github.com/yourrepo)"
TIMEOUT = 12

def load_json(p: Path, default):
    try:
        with p.open("r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default

def save_json(p: Path, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def slugify(s: str) -> str:
    import re
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", (s or "").lower())).strip()[:128]

def origin_of(url: str) -> tuple[str, str] | tuple[None, None]:
    try:
        u = urlparse(url)
        if not u.scheme or not u.netloc:
            return None, None
        origin = urlunparse((u.scheme, u.netloc, "", "", "", ""))
        domain = u.netloc.split("@")[-1]
        return origin, domain
    except Exception:
        return None, None

def candidate_urls(tool: dict, overrides: dict) -> list[str]:
    # 1) explicit override wins
    if overrides and tool.get("slug") in overrides:
        return [overrides[tool["slug"]]]

    # 2) derive from official URL
    origin, domain = origin_of(tool.get("url", ""))
    urls = []
    if origin and domain:
        urls += [
            f"{origin}/apple-touch-icon.png",
            f"{origin}/apple-touch-icon-precomposed.png",
            f"{origin}/favicon.png",
            f"{origin}/favicon.ico",
        ]
        # 3) last-resort: Google s2 favicon (usually PNG)
        urls.append(f"https://www.google.com/s2/favicons?domain={domain}&sz=128")
    return urls

def fetch_bytes(url: str) -> tuple[bytes | None, str | None]:
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code == 200 and r.content:
            ctype = r.headers.get("Content-Type", "").split(";")[0].strip().lower()
            return r.content, ctype
    except requests.RequestException:
        pass
    return None, None

def ext_from_ctype(ctype: str | None, fallback: str = ".png") -> str:
    if not ctype:
        return fallback
    if "svg" in ctype:
        return ".svg"
    if "jpeg" in ctype or "jpg" in ctype:
        return ".jpg"
    if "png" in ctype:
        return ".png"
    if "webp" in ctype:
        return ".webp"
    if "x-icon" in ctype or "vnd.microsoft.icon" in ctype or "ico" in ctype:
        return ".ico"
    return fallback

def normalize_to_png(raw: bytes, ctype: str, out_path_png: Path) -> bool:
    """
    Convert any raster (ico, jpg, png, webp) to PNG using Pillow.
    Returns True on success.
    """
    try:
        img = Image.open(BytesIO(raw))
        # pick the largest ICO frame if needed
        if getattr(img, "is_animated", False) and hasattr(img, "n_frames"):
            # Not usual for favicons, but just in case
            best = 0
            best_area = 0
            for i in range(img.n_frames):
                img.seek(i)
                w, h = img.size
                if w * h > best_area:
                    best_area = w * h
                    best = i
            img.seek(best)
        img = img.convert("RGBA")
        out_path_png.parent.mkdir(parents=True, exist_ok=True)
        img.save(out_path_png, format="PNG")
        return True
    except Exception:
        return False

def save_svg(raw: bytes, out_path_svg: Path) -> bool:
    try:
        out_path_svg.parent.mkdir(parents=True, exist_ok=True)
        out_path_svg.write_bytes(raw)
        return True
    except Exception:
        return False

def handle_one(tool: dict, overrides: dict, force: bool) -> dict:
    slug = tool.get("slug") or slugify(tool.get("name") or "")
    tool["slug"] = slug or tool.get("id") or slugify(tool.get("name") or "tool")
    dest_png = LOGO_DIR / f"{tool['slug']}.png"
    dest_svg = LOGO_DIR / f"{tool['slug']}.svg"

    # Skip if we already have a local file and not forcing
    if not force:
        existing = tool.get("logo", "")
        if existing and existing.startswith("assets/logos/"):
            if (ROOT / existing).exists():
                return {"slug": slug, "status": "skip-existing", "path": existing}

        if dest_png.exists() or dest_svg.exists():
            # Make sure JSON points to it
            tool["logo"] = f"assets/logos/{dest_svg.name if dest_svg.exists() else dest_png.name}"
            return {"slug": slug, "status": "skip-existing-file", "path": tool["logo"]}

    # Try candidates
    for url in candidate_urls(tool, overrides):
        raw, ctype = fetch_bytes(url)
        if not raw:
            continue

        ext = ext_from_ctype(ctype)
        if ext == ".svg":
            ok = save_svg(raw, dest_svg)
            if ok:
                tool["logo"] = f"assets/logos/{dest_svg.name}"
                return {"slug": slug, "status": "ok-svg", "source": url, "path": tool["logo"]}
        else:
            # Convert anything else to PNG for consistency
            ok = normalize_to_png(raw, ctype or "", dest_png)
            if ok:
                tool["logo"] = f"assets/logos/{dest_png.name}"
                return {"slug": slug, "status": "ok-png", "source": url, "path": tool["logo"]}

    return {"slug": slug, "status": "failed", "reason": "no-usable-logo", "url": tool.get("url")}

def main():
    ap = argparse.ArgumentParser(description="Fetch per-tool logos and update tools.json")
    ap.add_argument("--force", action="store_true", help="refetch/overwrite even if a local logo exists")
    ap.add_argument("--only", type=str, help="comma-separated list of slugs to process")
    ap.add_argument("--dry-run", action="store_true", help="do not write files or modify JSON")
    args = ap.parse_args()

    tools = load_json(TOOLS_JSON, default=[])
    if not isinstance(tools, list) or not tools:
        print("No tools found in data/tools.json")
        return 1

    overrides = load_json(OVERRIDES_JSON, default={})
    LOGO_DIR.mkdir(parents=True, exist_ok=True)

    only_set = None
    if args.only:
        only_set = {s.strip().lower() for s in args.only.split(",") if s.strip()}

    report = []
    changed = False

    for tool in tools:
        slug = (tool.get("slug") or slugify(tool.get("name") or "")).lower()
        if only_set and slug not in only_set:
            continue

        res = handle_one(tool, overrides, force=args.force)
        report.append(res)
        if res.get("status", "").startswith("ok") or res.get("status", "").startswith("skip-existing-file"):
            changed = True

    if args.dry_run:
        print(json.dumps(report, indent=2))
        return 0

    # Save updated JSON and a small report
    if changed:
        save_json(TOOLS_JSON, tools)
    save_json(REPORT_JSON, report)

    print("Done. Summary:")
    counts = {}
    for r in report:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    for k, v in sorted(counts.items()):
        print(f"  {k:>20}: {v}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
