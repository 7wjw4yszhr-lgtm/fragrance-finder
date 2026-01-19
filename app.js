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

function buildHaystack(item) {
  const notes = Array.isArray(item.notes) ? item.notes.join(", ") : (item.notes ?? "");
  const tags = Array.isArray(item.tags) ? item.tags.join(", ") : (item.tags ?? "");
  return [
    item.name,
    item.brand,
    item.inspiredBy,
    item.family,
    notes,
    tags
  ]
    .filter(Boolean)
    .map(normalize)
    .join(" | ");
}

function matchesAllTerms(hay, terms) {
  return terms.every((t) => hay.includes(t));
}

function escapeHtml(s) {
  return (s ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, terms) {
  let out = escapeHtml(text ?? "");
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp("(" + escapeRegExp(t) + ")", "ig");
    out = out.replace(re, '<span class="hl">$1</span>');
  }
  return out;
}

function cardHtml(item, terms) {
  const notesText = Array.isArray(item.notes) ? item.notes.join(", ") : (item.notes ?? "");
  const badge = item.isDupe ? "Dupe" : "Original";
  const owned = item.owned ? "Owned" : "Not owned";

  return (
    '<article class="card">' +
      '<div class="cardTop">' +
        '<div class="title">' + highlight(item.name ?? "", terms) + "</div>" +
        '<div class="badge">' + badge + " · " + owned + "</div>" +
      "</div>" +
      '<div class="kv">' +
        "<div><b>Brand:</b> " + highlight(item.brand ?? "", terms) + "</div>" +
        "<div><b>Inspired by:</b> " + (item.inspiredBy ? highlight(item.inspiredBy, terms) : "—") + "</div>" +
        "<div><b>Family:</b> " + (item.family ? highlight(item.family, terms) : "—") + "</div>" +
        "<div><b>Notes:</b> " + (notesText ? highlight(notesText, terms) : "—") + "</div>" +
      "</div>" +
    "</article>"
  );
}

function render(list, terms) {
  if (list.length === 0) {
    els.results.innerHTML = '<div class="card"><div class="meta">No matches.</div></div>';
    return;
  }
  els.results.innerHTML = list.map((item) => cardHtml(item, terms)).join("");
}

function searchAndRender() {
  const raw = els.q.value;
  const q = normalize(raw);
  const terms = q.split(/\s+/).filter(Boolean);

  const onlyOwned = els.onlyOwned.checked;
  const onlyDupes = els.onlyDupes.checked;

  const filtered = DATA
    .filter((item) => (onlyOwned ? !!item.owned : true))
    .filter((item) => (onlyDupes ? !!item.isDupe : true))
    .filter((item) => (terms.length ? matchesAllTerms(buildHaystack(item), terms) : true))
    .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

  els.status.textContent = filtered.length + ' match(es)' + (q ? ' for "' + raw + '"' : "") + ".";
  render(filtered, terms);
}

async function init() {
  try {
    const res = await fetch("./fragrances.json", { cache: "no-store" });
    DATA = await res.json();
    els.status.textContent = DATA.length + " fragrances loaded.";
    searchAndRender();
  } catch (e) {
    els.status.textContent = "Could not load fragrances.json. Check JSON format and file name.";
  }

  els.q.addEventListener("input", searchAndRender);
  els.onlyOwned.addEventListener("change", searchAndRender);
  els.onlyDupes.addEventListener("change", searchAndRender);
  els.clearBtn.addEventListener("click", () => {
    els.q.value = "";
    els.q.focus();
    searchAndRender();
  });
}

init();
