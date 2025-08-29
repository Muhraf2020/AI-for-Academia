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
  let tools = [];           // full list
  let visible = [];         // filtered list
  let fuse = null;          // Fuse index
  let selectedCategories = new Set(); // multi-select chips
  let currentPricing = "all";
  let currentQuery = "";
  let currentPage = 1;

  // ---------- ELEMENTS ----------
  const elSearch = document.getElementById("search");
  const elChips = document.getElementById("chips");
  const elPricing = document.getElementById("pricing");
  const elSuggest = document.getElementById("suggest-link");
  const elCount = document.getElementById("count");
  const elGrid = document.getElementById("results");
  const elPagination = document.getElementById("pagination");
  const elPrev = document.getElementById("prev");
  const elNext = document.getElementById("next");
  const elPage = document.getElementById("page");
  const elPageInfo = document.getElementById("page-info");

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

  // ---------- RENDER CHIPS ----------
  function renderChips() {
    elChips.innerHTML = CATEGORIES.map(cat => {
      const pressed = selectedCategories.has(cat.slug);
      return `<button class="chip" type="button" data-slug="${esc(cat.slug)}" aria-pressed="${pressed}">${esc(cat.name)}</button>`;
    }).join("");
    // event delegation
    elChips.addEventListener("click", (e)=>{
      const btn = e.target.closest(".chip");
      if (!btn) return;
      const slug = btn.getAttribute("data-slug");
      if (selectedCategories.has(slug)) selectedCategories.delete(slug);
      else selectedCategories.add(slug);
      btn.setAttribute("aria-pressed", selectedCategories.has(slug));
      currentPage = 1;
      setQueryParam("category", Array.from(selectedCategories));
      applyFilters();
    }, { once: true });
  }

  // ---------- FETCH & INIT ----------
  async function init() {
    elSuggest.href = CONFIG.GOOGLE_FORM_URL || "#";

    // Build chips once
    const startSelected = getArrayParam("category").filter(slug=>CATEGORY_SLUG_SET.has(slug));
    startSelected.forEach(s=>selectedCategories.add(s));
    renderChips();
    for (const btn of elChips.querySelectorAll(".chip")) {
      const slug = btn.getAttribute("data-slug");
      btn.setAttribute("aria-pressed", selectedCategories.has(slug));
    }

    const p = qs.get("pricing");
    if (p && ["free","freemium","paid"].includes(p)) {
      currentPricing = p;
      elPricing.value = p;
    }

    const q = qs.get("q") || "";
    currentQuery = q;
    elSearch.value = q;

    const pageParam = parseInt(qs.get("page") || "1", 10);
    currentPage = Number.isFinite(pageParam) && pageParam>0 ? pageParam : 1;

    let data = [];
    try {
      const res = await fetch("data/tools.json", { cache: "no-store" });
      if (!res.ok) throw new Error("tools.json not found");
      data = await res.json();
      if (!Array.isArray(data)) throw new Error("tools.json must be an array");
    } catch (err) {
      console.warn(err);
      document.getElementById("results").innerHTML = `<div class="empty">Could not load <code>data/tools.json</code>. Create the file with your tools to see results here.<br/>Schema example is documented in <code>assets/app.js</code>.</div>`;
      document.getElementById("count").textContent = "";
      document.getElementById("pagination").hidden = true;
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

    document.getElementById("prev").addEventListener("click", ()=>{
      if (currentPage>1){ currentPage--; setQueryParam("page", currentPage); render(); }
    });
    document.getElementById("next").addEventListener("click", ()=>{
      const totalPages = Math.max(1, Math.ceil(visible.length / CONFIG.ITEMS_PER_PAGE));
      if (currentPage<totalPages){ currentPage++; setQueryParam("page", currentPage); render(); }
    });

    applyFilters(true);
  }

  // ---------- FILTERING ----------
  function applyFilters(first=false) {
    const catFilter = Array.from(selectedCategories);
    let arr = tools.slice();

    if (catFilter.length>0) {
      arr = arr.filter(t => t.categories.some(c => catFilter.includes(slugify(c)) || catFilter.includes(c)));
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

  function slugify(s) { return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }

  // ---------- RENDER ----------
  function render() {
    const total = visible.length;
    document.getElementById("count").textContent = total ? `${total} tool${total===1?"":"s"} found` : "No matching tools found.";
    document.getElementById("page-info").textContent = `Showing ${Math.min(total, ((currentPage-1)*CONFIG.ITEMS_PER_PAGE)+1)}–${Math.min(total, currentPage*CONFIG.ITEMS_PER_PAGE)} of ${total}`;

    const totalPages = Math.max(1, Math.ceil(total / CONFIG.ITEMS_PER_PAGE));
    currentPage = Math.min(currentPage, totalPages);
    document.getElementById("prev").disabled = currentPage<=1;
    document.getElementById("next").disabled = currentPage>=totalPages;
    document.getElementById("page").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("pagination").hidden = total<=CONFIG.ITEMS_PER_PAGE;

    const start = (currentPage-1) * CONFIG.ITEMS_PER_PAGE;
    const pageItems = visible.slice(start, start + CONFIG.ITEMS_PER_PAGE);

    document.getElementById("results").innerHTML = pageItems.map(cardHTML).join("");

    const og = document.getElementById("og-url");
    if (og) og.setAttribute("content", CONFIG.SITE_URL);

    updateItemListJSONLD(pageItems.slice(0,10));
  }

  function cardHTML(t) {
    const logo = t.logo ? `<img class="logo" src="${esc(t.logo)}" alt="${esc(t.name)} logo" loading="lazy" />`
                        : `<div class="logo" aria-hidden="true">${esc(initials(t.name)||"AI")}</div>`;
    const cats = t.categories.slice(0,2).map(c=>`<span class="badge">${esc(c)}</span>`).join(" ");
    const tagChips = t.tags.slice(0,5).map(c=>`<span class="tag">${esc(c)}</span>`).join(" ");
    const icons = iconRow(t);
    // When rendering a card, the primary call‑to‑action should open the tool’s official
    // website in a new tab.  If the tool entry defines a `url` property, use that;
    // otherwise fall back to the internal detail page.  We escape the URL to avoid
    // injecting arbitrary HTML.  The button is labeled “Visit” with a northeast arrow
    // to indicate an external link.
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
