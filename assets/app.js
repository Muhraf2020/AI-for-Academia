/* FILE: assets/app.js */
(function () {
  // ---------- CONFIG ----------
  const CONFIG = {
    GOOGLE_FORM_URL: "https://docs.google.com/forms/d/e/xxxxxxxxxxxxxxxxxxxx/viewform", // <-- replace
    ITEMS_PER_PAGE: 12,
    SITE_URL: "https://yourname.github.io/ai-tools-directory/" // <-- replace when you publish
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
  function slugify(s) { return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }

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

  // ---------- FETCH & INIT ----------
  async function init() {
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

    applyFilters(true);
  }

  // ---------- FILTERING ----------
  function applyFilters(first=false) {
    const catFilter = Array.from(selectedCategories);
    let arr = tools.slice();

    if (catFilter.length>0) {
      arr = arr.filter(t =>
        t.categories.some(c => catFilter.includes(slugify(c)) || catFilter.includes(c))
      );
    }

    if (currentPricing !== "all") {
      arr = arr.filter(t => t.pricing === currentPricing);
    }

    if (currentQuery) {
      const results = fuse.search(currentQuery);
      arr = results.map(r => r.item);
    }

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

    const og = document.getElementById("og-url");
    if (og) og.setAttribute("content", CONFIG.SITE_URL);

    updateItemListJSONLD(pageItems.slice(0,10));
  }

  function cardHTML(t) {
    const logo = t.logo
      ? `<img class="logo" src="${esc(t.logo)}" alt="${esc(t.name)} logo" loading="lazy" />`
      : `<div class="logo" aria-hidden="true">${esc(initials(t.name)||"AI")}</div>`;

    const cats = t.categories.slice(0,2).map(c=>`<span class="badge">${esc(c)}</span>`).join(" ");
    const tagChips = t.tags.slice(0,5).map(c=>`<span class="tag">${esc(c)}</span>`).join(" ");
    const icons = iconRow(t);

    // Primary CTA opens official site in a new tab
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
        <div class="cta"><a href="${link}" aria-label="Visit ${esc(t.name)} website" target="_blank" rel="noopener">Visit ↗</a></div>
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
  window.addEventListener("DOMContentLoaded", init);
})();

// In init(), after wiring other listeners:
const elClear = document.getElementById('clear-filters');
if (elClear) elClear.addEventListener('click', () => {
  selectedCategories.clear(); currentPricing='all'; currentQuery=''; currentPage=1;
  elSearch.value=''; elPricing.value='all';
  setQueryParam('category', null); setQueryParam('pricing', null); setQueryParam('q', null); setQueryParam('page', 1);
  updateChipsActive(); applyFilters();
});
