let DATA = [];
const els = {
  q: document.getElementById("q"),
  results: document.getElementById("results"),
  status: document.getElementById("status"),
  clearBtn: document.getElementById("clearBtn"),
  onlyOwned: document.getElementById("onlyOwned"),
  onlyDupes: document.getElementById("onlyDupes"),
};

function normalize(s) {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function includesAllTerms(haystackParts, qTerms) {
  if (qTerms.length === 0) return true;
  const hay = haystackParts.filter(Boolean).map(normalize).join(" | ");
  return qTerms.every((t) => hay.includes(t));
}

function buildHaystack(item) {
  const notes = Array.isArray(item.notes) ? item.notes.join(", ") : (item.notes ?? "");
  return [item.name, item.brand, item.inspiredBy, item.family, notes];
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, qTerms) {
  if (!text) return "";
  let out = text;
  for (const t of qTerms) {
    if (!t) continue;
    const re = new RegExp(`(${escapeRegExp(t)})`, "ig");
    out = out.replace(re, `<span class="hl">$1</span>`);
  }
  return out;
}

function render(list, qTerms) {
  if (list.length === 0) {
    els.results.innerHTML = `<div class="card"><div class="meta">No matches.</div></div>`;
    return;
  }

  els.results.innerHTML = list
    .map((item) => {
      const notesText = Array.isArray(item.notes) ? item.notes.join(", ") : (item.notes ?? "");
      const badge = item.isDupe ? "Dupe" : "Original";
      const owned = item.owned ? "Owned" : "Not owned";

      return `
      <article class="card">
        <div class="cardTop">
          <div class="title">${highlightText(item.name ?? "", qTerms)}</div>
          <div class="badge">${badge} · ${owned}</div>
        </div>
        <div class="kv">
          <div><b>Brand:</b> ${highlightText(item.brand ?? "", qTerms)}</div>
          <div><b>Inspired by:</b> ${highlightText(item.inspiredBy ?? "", qTerms) || "—"}</div>
          <div><b>Family:</b> ${highlightText(item.family ?? "", qTerms) || "—"}</div>
          <div><b>Notes:</b> ${highlightText(notesText, qTerms) || "—"}</div>
        </div>
      </article>
    `;
    })
    .join("");
}

function searchAndRender() {
  const raw = els.q.value;
  const q = normalize(raw);
  const qTerms = q.split(/\s+/).filter(Boolean);

  const onlyOwned = els.onlyOwned.checked;
  const onlyDupes = els.onlyDupes.checked;

  const filtered = DATA
    .filter((item) => (onlyOwned ? !!item.owned : true))
    .filter((item) => (onlyDupes ? !!item.isDupe : true))
    .filter((item) => includesAllTerms(buildHaystack(item), qTerms))
    .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

  els.status.textContent = `${filtered.length} match(es)${q ? ` for "${raw}"` : ""}.`;
  render(filtered, qTerms);
}

async function init() {
  try {
    const res = await fetch("./fragrances.json", { cache: "no-store" });
    DATA = await res.json();
    els.status.textContent = `${DATA.length} fragrances loaded.`;
    searchAndRender();
  } catch (e) {
    els.status.textContent = "Could not load fragrances.json. Check JSON format and file name.";
  }

  els.q.addEventListener("input", searchAndRender);
  els.onlyOwned.addEventListener("change", searchAnd
