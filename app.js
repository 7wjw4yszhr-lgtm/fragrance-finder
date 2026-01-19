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
  return [
    item.name,
    item.brand,
    item.inspiredBy,
    item.family,
    notes
  ];
}

function highlightText(text, qTerms) {
  if (!text) return "";
  let out = text;
  for (const t of qTerms) {
    if (!t) continue;
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re

