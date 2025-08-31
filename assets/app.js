/* FILE: assets/app.js */
(function () {
  // ---------- CONFIG ----------
  const CONFIG = {
    GOOGLE_FORM_URL: "https://docs.google.com/forms/d/e/1FAIpQLScUEGeF_jxL3oNwCTrBh1OX-WRlsauQksUJjV_Z3uiY9k9pYA/viewform", // <-- replace
    ITEMS_PER_PAGE: 12,
    SITE_URL: "https://academiawithai.com/", // <-- replace when you publish
    ASSET_VERSION: "1" // bump to "2", "3", ... whenever you update logos
  };

  // ---------- CATEGORY DEFINITIONS ----------
  const CATEGORIES = [
    { name: "General research assistants & chatbots", slug: "general-assistants" },
    { name: "Discover & map literature", slug: "discover-map-literature" },
    { name: "Read, summarize, & extract", slug: "read-summarize-extract" },
    { name: "Evaluate claims & citations", slug: "evaluate-claims-citations" },
    { name: "Citation & reference management", slug: "citation-reference-management" },
    { name: "Writing & publishing", slug: "writing-publishing" },
    { name: "Coding, stats, & automation", slug: "coding-stats-automation" },
    { name: "Data wrangling, analysis, & visualization", slug: "data-wrangling-analysis-visualization" },
    { name: "Qualitative analysis", slug: "qualitative-analysis" },
    { name: "Transcription & meeting notes", slug: "transcription-meeting-notes" },
    { name: "Surveys & text analytics", slug: "surveys-text-analytics" },
    { name: "Figures, images & visualizations", slug: "figures-images-visualizations" },
    { name: "Teaching & assessment", slug: "teaching-assessment" },
    { name: "Integrity & compliance", slug: "integrity-compliance" },
    { name: "Project & experiment tracking", slug: "project-experiment-tracking" },
    { name: "Policy & ethics support", slug: "policy-ethics-support" },
    { name: "Collaboration & knowledge management", slug: "collaboration-knowledge-management" }
  ];
  const CATEGORY_SLUG_SET = new Set(CATEGORIES.map(c => c.slug));
  // ---------- SEO HELPERS (paste START) ----------
  function setMeta(name, content) {
    if (!content) return;
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) { el = document.createElement("meta"); el.setAttribute("name", name); document.head.appendChild(el); }
    el.setAttribute("content", content);
  }
  function setOG(property, content) {
    if (!content) return;
    let el = document.querySelector(`meta[property="${property}"]`);
    if (!el) { el = document.createElement("meta"); el.setAttribute("property", property); document.head.appendChild(el); }
    el.setAttribute("content", content);
  }
  function setCanonical(url) {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.setAttribute("rel", "canonical"); document.head.appendChild(link); }
    link.setAttribute("href", url);
  }
  function addJSONLD(obj) {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.text = JSON.stringify(obj);
    document.head.appendChild(s);
  }
  function slugify(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  // ---------- SEO HELPERS (paste END) ----------

  // ---------- STATE ----------
  let tools = [];                 // full list
  let visible = [];               // filtered list
  let fuse = null;                // Fuse index
  let selectedCategories = new Set(); // multi-select chips (by slug)
  let currentPricing = "all";
  let currentQuery = "";
  let currentPage = 1;

  // ---------- ELEMENTS ----------
  const elSearch     = document.getElementById("search");
  const elChips      = document.getElementById("chips");
  const elPricing    = document.getElementById("pricing");
  const elSuggest    = document.getElementById("suggest-link");
  const elCount      = document.getElementById("count");
  const elGrid       = document.getElementById("results");
  const elPagination = document.getElementById("pagination");
  const elPrev       = document.getElementById("prev");
  const elNext       = document.getElementById("next");
  const elPage       = document.getElementById("page");
  const elPageInfo   = document.getElementById("page-info");

  // ---------- UTIL ----------
  const qs = new URLSearchParams(location.search);
  function setQueryParam(key, val) {
    const url = new URL(location.href);
    if (val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, Array.isArray(val) ? val.join(",") : String(val));
    }
    history.replaceState({}, "", url.toString());
  }
  function getArrayParam(name) {
    const v = qs.get(name);
    return v ? v.split(",").map(s => s.trim()).filter(Boolean) : [];
  }
  function debounce(fn, ms=200) {
    let t=null;
    return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
  }
  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function initials(name) {
    const parts=(name||"").split(/\s+/).slice(0,2);
    return parts.map(p=>p[0]?.toUpperCase()||"").join("");
  }
  function pricingBadge(p) {
    const color = p==="free"?"#22a559": p==="freemium"?"#ff8c00": "#6c6c6c";
    return `<span class="badge" style="background:${color}1a;border-color:${color}4d;color:${color}">${esc(p)}</span>`;
  }
  function iconRow(t) {
    const arr=[];
    if (t.evidence_cites) arr.push("✅");
    if (t.local_onprem)  arr.push("🔒");
    if (t.edu_discount)  arr.push("🏫");
    if (t.free_tier)     arr.push("🔁");
    if (t.beta)          arr.push("🧪");
    return arr.length? `<span class="icons" title="✅ cites • 🔒 local/on-prem • 🏫 EDU • 🔁 free tier • 🧪 beta">${arr.join(" ")}</span>` : "";
  }
  

  /* =======================
   LOGO FALLBACK HELPERS
   ======================= */

// Extracts the hostname from a URL (used to fetch a site icon if the main logo fails)
function hostnameFromUrl(u) {
  try { return new URL(u).hostname; } catch { return ""; }
}

// Installs a robust error handler on each logo <img> to:
// 1) try icon.horse, 2) try Google s2 favicons, 3) fall back to initials
function installLogoErrorFallback() {
  document.querySelectorAll('img.logo[data-domain]').forEach(img => {
    if (img.dataset._wired) return; // avoid double-binding after re-renders
    img.dataset._wired = "1";

    img.addEventListener('error', () => {
      const domain = img.dataset.domain;
      // No domain? swap to initials block and exit
      if (!domain) {
        const name = img.getAttribute('alt')?.replace(/ logo$/i, '') || 'AI';
        const div = document.createElement('div');
        div.className = 'logo';
        div.setAttribute('aria-hidden', 'true');
        div.textContent = (name.split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()||'').join('')) || 'AI';
        img.replaceWith(div);
        return;
      }

      // 1st fallback: icon.horse
      if (!img.dataset.triedHorse) {
        img.dataset.triedHorse = "1";
        img.src = `https://icon.horse/icon/${encodeURIComponent(domain)}`;
        return;
      }

      // 2nd fallback: Google s2 favicons
      if (!img.dataset.triedS2) {
        img.dataset.triedS2 = "1";
        img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
        return;
      }

      // Final fallback: initials
      const name = img.getAttribute('alt')?.replace(/ logo$/i, '') || 'AI';
      const div = document.createElement('div');
      div.className = 'logo';
      div.setAttribute('aria-hidden', 'true');
      div.textContent = (name.split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()||'').join('')) || 'AI';
      img.replaceWith(div);
    }, { once: false });
  });
}

  // ----- PAGINATION HELPERS -----
  function getPageWindow(curr, total, width = 5) {
    const half = Math.floor(width / 2);
    let start = Math.max(1, curr - half);
    let end = Math.min(total, start + width - 1);
    start = Math.max(1, end - width + 1);
    return { start, end };
  }
  function ensurePagerNumbersContainer() {
    let el = elPagination.querySelector('.pager-numbers');
    if (!el) {
      el = document.createElement('div');
      el.className = 'pager-numbers';
      // insert before Next ▶ button so layout is: Prev | numbers | Next
      elPagination.insertBefore(el, elNext);
    }
    return el;
  }
  function renderPaginationNumbers(totalPages) {
    const container = ensurePagerNumbersContainer();
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const { start, end } = getPageWindow(currentPage, totalPages, 5);
    let html = '';

    // First page + leading ellipsis
    if (start > 1) {
      html += `<button class="page-btn" data-page="1" aria-label="Go to page 1">1</button>`;
      if (start > 2) html += `<span class="dots" aria-hidden="true">…</span>`;
    }

    // Window pages
    for (let p = start; p <= end; p++) {
      const active = p === currentPage ? ' active' : '';
      const ariaCur = p === currentPage ? ` aria-current="page"` : '';
      html += `<button class="page-btn${active}" data-page="${p}"${ariaCur} aria-label="Go to page ${p}">${p}</button>`;
    }

    // Trailing ellipsis + last page
    if (end < totalPages) {
      if (end < totalPages - 1) html += `<span class="dots" aria-hidden="true">…</span>`;
      html += `<button class="page-btn" data-page="${totalPages}" aria-label="Go to page ${totalPages}">${totalPages}</button>`;
    }

    container.innerHTML = html;
  }

  // ---------- CHIPS ----------
  function renderChips() {
    elChips.innerHTML = CATEGORIES.map(cat => {
      const pressed = selectedCategories.has(cat.slug);
      return `<button class="chip" type="button" data-slug="${esc(cat.slug)}" aria-pressed="${pressed}">${esc(cat.name)}</button>`;
    }).join("");
    updateChipsActive();
  }

  function updateChipsActive() {
    elChips.querySelectorAll(".chip").forEach(btn => {
      const slug = btn.getAttribute("data-slug");
      const on   = selectedCategories.has(slug);
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  // Paint a count badge on each chip (expects keys by category slug)
  function updateChipCounts(countsBySlug) {
    elChips.querySelectorAll(".chip").forEach(btn => {
      const slug = btn.getAttribute("data-slug");
      const catName = (CATEGORIES.find(c => c.slug === slug) || {}).name || slug;
      const n = countsBySlug[slug] || 0;
      btn.innerHTML = `${esc(catName)} <span class="chip-count">${n}</span>`;
    });
  }


  // ---------- FETCH & INIT ----------
async function init() {

  // === Router: handle tool.html separately and exit early ===
  if (/tool\.html$/i.test(location.pathname)) {
    try {
      // 1) read slug from URL
      const slug = (new URLSearchParams(location.search)).get("slug") || "";

      // 2) load tools.json
      const res = await fetch("data/tools.json", { cache: "no-store" });
      if (!res.ok) throw new Error("tools.json not found");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("tools.json must be an array");

      // 3) normalize tools (consistent with index mapping)
      const normalized = data.map(t => ({
        id: t.id || t.slug || Math.random().toString(36).slice(2),
        slug: (t.slug || (t.name||"").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g,"")).slice(0,128),
        name: t.name || "Untitled",
        url: t.url || "#",
        tagline: t.tagline || "",
        description: t.description || "",
        pricing: ["free","freemium","paid"].includes(t.pricing) ? t.pricing : "freemium",
        categories: Array.isArray(t.categories) ? t.categories.filter(Boolean) : [],
        tags: Array.isArray(t.tags) ? t.tags.filter(Boolean) : [],
        logo: t.logo || "",
        image: t.image || "",                 // optional hero image per tool
        short_description: t.short_description || t.tagline || "",
        price: t.price || t.pricing || ""
      }));

      // 4) find the tool by slug
      const tool = normalized.find(t => t.slug === slug);
      if (!tool) {
        document.title = "Tool not found — Academia with AI";
        setMeta("description", "This tool could not be found.");
        setCanonical(`${CONFIG.SITE_URL}tool.html`);
        return;
      }

      // 5) === Per-tool SEO ===
      const siteUrl = (CONFIG.SITE_URL || (location.origin + "/")).replace(/\/$/, "/");
      const toolUrl = `${siteUrl}tool.html?slug=${encodeURIComponent(tool.slug)}`;
      const categoryName = (tool.categories && tool.categories[0]) || "Tools";

      document.title = `${tool.name} — ${categoryName} | Academia with AI`;
      setMeta("description", tool.short_description || `Learn about ${tool.name} for academic workflows.`);
      setCanonical(toolUrl);

      setOG("og:title", document.title);
      setOG("og:description", tool.short_description || `Learn about ${tool.name}.`);
      setOG("og:url", toolUrl);

      // Optional: per-tool social image
      if (tool.image && /^https?:/i.test(tool.image)) {
        setOG("og:image", tool.image);
        setMeta("twitter:image", tool.image);
      }

      // JSON-LD: SoftwareApplication
      addJSONLD({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": tool.name,
        "url": toolUrl,
        "operatingSystem": "Any",
        "applicationCategory": "EducationalApplication",
        "description": tool.short_description || undefined,
        "offers": (tool.price && String(tool.price).toLowerCase().includes("free"))
          ? { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
          : undefined
      });

      // JSON-LD: Breadcrumbs
      const catSlug = slugify(categoryName);
      addJSONLD({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": siteUrl },
          { "@type": "ListItem", "position": 2, "name": categoryName, "item": `${siteUrl}category/${catSlug}.html` },
          { "@type": "ListItem", "position": 3, "name": tool.name, "item": toolUrl }
        ]
      });
    } catch (e) {
      console.warn("tool.html SEO init failed:", e);
    }
    return; // IMPORTANT: stop here so index-page code doesn't run on tool.html
  }
  // === end tool.html SEO router ===
    // Suggest form
    elSuggest.href = CONFIG.GOOGLE_FORM_URL || "#";

    // Preselect chips from URL
    const startSelected = getArrayParam("category").filter(slug=>CATEGORY_SLUG_SET.has(slug));
    startSelected.forEach(s=>selectedCategories.add(s));
    renderChips();

    // Single delegated listener for all chips (works across re-renders)
    elChips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn || !elChips.contains(btn)) return;
      const slug = btn.getAttribute("data-slug");
      if (!CATEGORY_SLUG_SET.has(slug)) return;

      if (selectedCategories.has(slug)) selectedCategories.delete(slug);
      else selectedCategories.add(slug);

      currentPage = 1;
      setQueryParam("category", Array.from(selectedCategories));
      updateChipsActive();
      applyFilters();
    });

    // Pricing from URL
    const p = qs.get("pricing");
    if (p && ["free","freemium","paid"].includes(p)) {
      currentPricing = p;
      elPricing.value = p;
    }

    // Search from URL
    const q = qs.get("q") || "";
    currentQuery = q;
    elSearch.value = q;

    // Page from URL
    const pageParam = parseInt(qs.get("page") || "1", 10);
    currentPage = Number.isFinite(pageParam) && pageParam>0 ? pageParam : 1;

    // Load tools
    let data = [];
    try {
      const res = await fetch("data/tools.json", { cache: "no-store" });
      if (!res.ok) throw new Error("tools.json not found");
      data = await res.json();
      if (!Array.isArray(data)) throw new Error("tools.json must be an array");
    } catch (err) {
      console.warn(err);
      elGrid.innerHTML = `<div class="empty">Could not load <code>data/tools.json</code>. Create the file with your tools to see results here.<br/>Schema example is documented in <code>assets/app.js</code>.</div>`;
      elCount.textContent = "";
      elPagination.hidden = true;
      return;
    }

    tools = data.map(t => ({
      id: t.id || t.slug || Math.random().toString(36).slice(2),
      slug: (t.slug || (t.name||"").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g,"")).slice(0,128),
      name: t.name || "Untitled",
      url: t.url || "#",
      tagline: t.tagline || "",
      description: t.description || "",
      pricing: ["free","freemium","paid"].includes(t.pricing) ? t.pricing : "freemium",
      categories: Array.isArray(t.categories) ? t.categories.filter(Boolean) : [],
      tags: Array.isArray(t.tags) ? t.tags.filter(Boolean) : [],
      logo: t.logo || "",
      evidence_cites: Boolean(t.evidence_cites),
      local_onprem: Boolean(t.local_onprem),
      edu_discount: Boolean(t.edu_discount),
      free_tier: "free"===t.pricing || Boolean(t.free_tier),
      beta: Boolean(t.beta),
      created_at: t.created_at || new Date().toISOString().slice(0,10)
    }));

    // Fuse index
    fuse = new Fuse(tools, {
      includeScore: true,
      threshold: 0.35,
      ignoreLocation: true,
      keys: ["name", "tagline", "description", "tags"]
    });

    // Wire inputs
    elSearch.addEventListener("input", debounce((e)=>{
      currentQuery = e.target.value.trim();
      currentPage = 1;
      setQueryParam("q", currentQuery || null);
      applyFilters();
    }, 180));

    elPricing.addEventListener("change", (e)=>{
      currentPricing = e.target.value;
      currentPage = 1;
      setQueryParam("pricing", currentPricing==="all"? null : currentPricing);
      applyFilters();
    });

    elPrev.addEventListener("click", ()=>{
      if (currentPage>1){ currentPage--; setQueryParam("page", currentPage); render(); }
    });
    elNext.addEventListener("click", ()=>{
      const totalPages = Math.max(1, Math.ceil(visible.length / CONFIG.ITEMS_PER_PAGE));
      if (currentPage<totalPages){ currentPage++; setQueryParam("page", currentPage); render(); }
    });

    // Click any numbered page (event delegation)
    elPagination.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn || !elPagination.contains(btn)) return;
      const p = parseInt(btn.dataset.page, 10);
      if (!Number.isFinite(p) || p === currentPage) return;
      currentPage = p;
      setQueryParam('page', currentPage);
      render();
    });
        // Clear filters button (auto-create if missing)
    let elClear = document.getElementById('clear-filters');
    if (!elClear) {
      elClear = document.createElement('button');
      elClear.id = 'clear-filters';
      elClear.type = 'button';
      elClear.className = 'chip';
      elClear.title = 'Reset search, pricing, and categories';
      elClear.textContent = 'Clear filters';
      // place right after the chips row
      if (elChips && elChips.parentNode) {
        elChips.parentNode.insertBefore(elClear, elChips.nextSibling);
      } else {
        // fallback: append somewhere visible
        document.body.appendChild(elClear);
      }
    }
    elClear.addEventListener('click', () => {
      // reset state
      selectedCategories.clear();
      currentPricing = 'all';
      currentQuery = '';
      currentPage = 1;

      // reset UI controls
      elSearch.value = '';
      elPricing.value = 'all';
      setQueryParam('category', null);
      setQueryParam('pricing', null);
      setQueryParam('q', null);
      setQueryParam('page', 1);

      updateChipsActive();
      applyFilters();
    });


    applyFilters(true);
  }

  // ---------- FILTERING ----------
  // ---------- FILTERING ----------
  function applyFilters(first=false) {
    const catFilter = Array.from(selectedCategories);
    let arr = tools.slice();

    // 1) Apply category filter (multi-select)
    if (catFilter.length > 0) {
      arr = arr.filter(t =>
        t.categories.some(c => catFilter.includes(slugify(c)) || catFilter.includes(c))
      );
    }

    // 2) Apply pricing filter
    if (currentPricing !== "all") {
      arr = arr.filter(t => t.pricing === currentPricing);
    }

    // 3) Apply search filter (Fuse) to the working set
    if (currentQuery) {
      const results = fuse.search(currentQuery);
      arr = results.map(r => r.item);
    }

    // --- CATEGORY COUNTS (reflect current search + pricing, but NOT the category selection) ---
    // Build a "pool" that only considers pricing + search
    let pool = tools.filter(t => (currentPricing === 'all' || t.pricing === currentPricing));
    if (currentQuery) {
      // Reuse Fuse results for the base pool (not the category-filtered arr)
      const poolResults = new Set(fuse.search(currentQuery).map(r => r.item));
      pool = pool.filter(t => poolResults.has(t));
    }

    // Count per category slug
    const countsBySlug = {};
    for (const t of pool) {
      for (const c of (t.categories || [])) {
        const slug = CATEGORY_SLUG_SET.has(c) ? c : slugify(c);
        countsBySlug[slug] = (countsBySlug[slug] || 0) + 1;
      }
    }
    // Update chip labels to include counts
    updateChipCounts(countsBySlug);
    // --- END CATEGORY COUNTS ---

    visible = arr;
    if (first) injectItemListJSONLD();
    render();
  }


  // ---------- RENDER ----------
  function render() {
    const total = visible.length;
    elCount.textContent = total ? `${total} tool${total===1?"":"s"} found` : "No matching tools found.";
    elPageInfo.textContent = `Showing ${Math.min(total, ((currentPage-1)*CONFIG.ITEMS_PER_PAGE)+1)}–${Math.min(total, currentPage*CONFIG.ITEMS_PER_PAGE)} of ${total}`;

    const totalPages = Math.max(1, Math.ceil(total / CONFIG.ITEMS_PER_PAGE));
    currentPage = Math.min(currentPage, totalPages);
    elPrev.disabled = currentPage<=1;
    elNext.disabled = currentPage>=totalPages;
    elPage.textContent = `Page ${currentPage} of ${totalPages}`;
    elPagination.hidden = total<=CONFIG.ITEMS_PER_PAGE;

    // Numbered pagination (sliding window)
    renderPaginationNumbers(totalPages);

    const start = (currentPage-1) * CONFIG.ITEMS_PER_PAGE;
    const pageItems = visible.slice(start, start + CONFIG.ITEMS_PER_PAGE);

    elGrid.innerHTML = pageItems.map(cardHTML).join("");
    // hook up image error fallbacks *after* the DOM is in place
    installLogoErrorFallback();

    const og = document.getElementById("og-url");
    if (og) og.setAttribute("content", CONFIG.SITE_URL);

    updateItemListJSONLD(pageItems.slice(0,10));
  }

  function cardHTML(t) {
  const domain = t.url ? hostnameFromUrl(t.url) : "";

  const logo = t.logo
    ? (() => {
        // add ?v= to bust caches when you update logos
        const withV = `${t.logo}${t.logo.includes('?') ? '&' : '?'}v=${CONFIG.ASSET_VERSION}`;
        return `<img class="logo" src="${esc(withV)}" alt="${esc(t.name)} logo" loading="lazy" referrerpolicy="no-referrer" data-domain="${esc(domain)}" />`;
      })()
    : `<div class="logo" aria-hidden="true">${esc(initials(t.name)||"AI")}</div>`;

  const cats = t.categories.slice(0,2).map(c=>`<span class="badge">${esc(c)}</span>`).join(" ");
  const tagChips = t.tags.slice(0,5).map(c=>`<span class="tag">${esc(c)}</span>`).join(" ");
  const icons = iconRow(t);

  const link = t.url ? esc(t.url) : `tool.html?slug=${encodeURIComponent(t.slug)}`;

  return `
    <article class="card">
      ${logo}
      <div style="flex:1">
        <div class="title">
          <h2 style="font-size:1.05rem; margin:0">${esc(t.name)}</h2>
          ${icons}
          <span class="right">${pricingBadge(t.pricing)}</span>
        </div>
        <p style="margin:6px 0 8px; color:#333">${esc(t.tagline || t.description.slice(0,120))}</p>
        <div class="badges">${cats}</div>
        <div class="tags">${tagChips}</div>
      </div>
      <div class="cta"><a href="${link}" aria-label="Visit ${esc(t.name)} website" target="_blank" rel="noopener">Website ↗</a></div>
    </article>
  `;
}


  // ---------- JSON-LD ----------
  function injectItemListJSONLD() {
    let el = document.getElementById("jsonld-list");
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = "jsonld-list";
      document.head.appendChild(el);
    }
  }
  function updateItemListJSONLD(items) {
    const el = document.getElementById("jsonld-list");
    if (!el) return;
    const obj = {
      "@context":"https://schema.org",
      "@type":"ItemList",
      "itemListElement": items.map((t, i) => ({
        "@type":"ListItem",
        "position": i+1,
        "url": (CONFIG.SITE_URL || location.origin+location.pathname).replace(/\/$/, '/') + `tool.html?slug=${encodeURIComponent(t.slug)}`
      }))
    };
    el.textContent = JSON.stringify(obj);
  }

  // ---------- START ----------
  if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

})();

