/* ═══════════════════════════════════════════════════════════════
   Express Shipping — script.js
   Logik kalkil, localStorage (7 jou), jsPDF fakti
   ═══════════════════════════════════════════════════════════════ */

const RATE         = 3.30;
const FIXED_FEE    = 10.00;
const STORAGE_KEY  = 'es_history';
const TTL_MS       = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ─── HELPERS ──────────────────────────────────────────────────── */
function fmt(n) {
  return '$' + n.toFixed(2);
}

function today() {
  return new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function shortTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
       + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function showToast(msg, duration = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ─── HISTORY STORAGE ──────────────────────────────────────────── */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw);
    const now = Date.now();
    // prune entries older than 7 days
    const fresh = all.filter(e => (now - e.ts) < TTL_MS);
    if (fresh.length !== all.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/* ─── LIVE CALCULATOR ──────────────────────────────────────────── */
function calculateLive() {
  const wInput = document.getElementById('weight');
  const w = parseFloat(wInput.value);
  const box = document.getElementById('resultBox');

  if (!w || w <= 0) {
    box.classList.remove('visible');
    return;
  }

  const sub   = w * RATE;
  const total = sub + FIXED_FEE;

  document.getElementById('resultAmount').textContent   = fmt(total);
  document.getElementById('detailWeight').textContent   = w;
  document.getElementById('detailSub').textContent      = fmt(sub);
  document.getElementById('detailTotal').textContent    = fmt(total);
  box.classList.add('visible');
}

/* ─── SAVE TO HISTORY ──────────────────────────────────────────── */
function saveToHistory() {
  const weight = parseFloat(document.getElementById('weight').value);
  const name   = document.getElementById('clientName').value.trim();
  const desc   = document.getElementById('description').value.trim();

  if (!weight || weight <= 0) {
    showToast('⚠️  Tanpri antre pwa koli a.');
    return;
  }
  if (!name) {
    showToast('⚠️  Antre non kliyan an.');
    return;
  }

  const total = weight * RATE + FIXED_FEE;
  const entry = {
    id:       uid(),
    ts:       Date.now(),
    name,
    desc:     desc || '—',
    weight,
    total,
    invoiced: false,
  };

  const history = loadHistory();
  history.unshift(entry); // newest first
  saveHistory(history);
  renderHistory();
  showToast('✅  Anrejistreman reyisi!');
}

/* ─── MARK AS INVOICED ─────────────────────────────────────────── */
function markInvoiced(id) {
  const history = loadHistory();
  const idx = history.findIndex(e => e.id === id);
  if (idx !== -1) {
    history[idx].invoiced = true;
    saveHistory(history);
  }
}

/* ─── RENDER HISTORY ───────────────────────────────────────────── */
function renderHistory() {
  const list    = document.getElementById('historyList');
  const entries = loadHistory();

  if (entries.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>Pa gen istorik pou kounya.<br>Kalkile yon koli pou kòmanse.</p>
      </div>`;
    return;
  }

  list.innerHTML = entries.map(e => `
    <div class="history-item${e.invoiced ? ' invoiced' : ''}" id="item-${e.id}">
      <div class="h-badge">${e.invoiced ? '✅' : '📦'}</div>
      <div class="h-info">
        <div class="h-name">${escHtml(e.name)}</div>
        <div class="h-desc">${escHtml(e.desc)} · ${e.weight} lbs</div>
        ${e.invoiced ? '<div class="h-invoiced-tag">✓ Fakti jenere</div>' : ''}
      </div>
      <div class="h-meta">
        <div class="h-amount">${fmt(e.total)}</div>
        <div class="h-date">${shortTime(e.ts)}</div>
        ${!e.invoiced
          ? `<button class="btn btn-gold" style="margin-top:5px;padding:4px 10px;font-size:11px;"
               onclick="generateInvoiceFromHistory('${e.id}')">🧾 Fakti</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ─── CLEAR HISTORY ────────────────────────────────────────────── */
function clearHistory() {
  if (!confirm('Ou sèten ou vle efase tout istorik lan?')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
  showToast('🗑  Istorik yo efase.');
}

/* ─── PDF INVOICE (jsPDF) ──────────────────────────────────────── */
function buildInvoicePDF({ name, desc, weight, total, dateStr }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });

  const W = doc.internal.pageSize.getWidth();   // 148 mm
  const NAVY   = [13,  43,  85];
  const GOLD   = [240, 165,  0];
  const WHITE  = [255, 255, 255];
  const LGRAY  = [244, 246, 250];
  const DKGRAY = [71,  85, 105];
  const GREEN  = [22, 163, 74];

  // ── Header band ──────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 38, 'F');

  // Gold accent line
  doc.setFillColor(...GOLD);
  doc.rect(0, 36, W, 2, 'F');

  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...WHITE);
  doc.text('EXPRESS SHIPPING', W / 2, 16, { align: 'center' });

  // Sub line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GOLD);
  doc.text('Miami  →  Ayiti  •  Sèvis Livrezon Sekirize', W / 2, 24, { align: 'center' });

  // FACTURE label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text('FAKTI / REÇU', W / 2, 32, { align: 'center' });

  // ── Invoice meta ──────────────────────────────────────────────
  let y = 46;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...DKGRAY);
  doc.text(`Dat:`, 12, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(dateStr, 35, y);

  const invoiceNo = 'ES-' + Date.now().toString().slice(-6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DKGRAY);
  doc.text(`No Fakti:`, W - 60, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(invoiceNo, W - 35, y);

  // ── Client section ────────────────────────────────────────────
  y = 56;
  doc.setFillColor(...LGRAY);
  doc.roundedRect(10, y - 5, W - 20, 22, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text('KLIYAN', 15, y + 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text(name, 15, y + 10);

  // ── Items table ────────────────────────────────────────────────
  y = 86;
  // Header row
  doc.setFillColor(...NAVY);
  doc.rect(10, y - 5, W - 20, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  doc.text('DESKRIPSYON', 15, y + 1);
  doc.text('PWA', W - 60, y + 1);
  doc.text('MONTAN', W - 28, y + 1, { align: 'right' });

  // Row 1 — shipping
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(desc.length > 36 ? desc.slice(0, 36) + '...' : desc, 15, y);
  doc.text(`${weight} lbs`, W - 60, y);
  doc.text(fmt(weight * RATE), W - 13, y, { align: 'right' });

  doc.setFillColor(230, 235, 245);
  doc.rect(10, y + 3, W - 20, 0.3, 'F');

  // Row 2 — fixed fee
  y += 12;
  doc.setTextColor(...DKGRAY);
  doc.text('Frè Fiks Sèvis', 15, y);
  doc.text('—', W - 60, y);
  doc.text(fmt(FIXED_FEE), W - 13, y, { align: 'right' });

  // ── Total box ─────────────────────────────────────────────────
  y += 16;
  doc.setFillColor(...GOLD);
  doc.roundedRect(10, y - 6, W - 20, 18, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text('TOTAL OU DWÈ PEYE', 15, y + 4);
  doc.setFontSize(14);
  doc.text(fmt(total), W - 13, y + 5, { align: 'right' });

  // ── Breakdown ─────────────────────────────────────────────────
  y += 26;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...DKGRAY);
  doc.text(`Détay: ${weight} lbs × $${RATE.toFixed(2)}/lb = ${fmt(weight * RATE)}  +  Frè Fiks ${fmt(FIXED_FEE)}`, W / 2, y, { align: 'center' });

  // ── Paid stamp ────────────────────────────────────────────────
  y += 14;
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.8);
  doc.roundedRect(W / 2 - 22, y - 7, 44, 12, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...GREEN);
  doc.text('✓  FAKTIRE', W / 2, y + 1, { align: 'center' });

  // ── Contact footer ────────────────────────────────────────────
  const footY = doc.internal.pageSize.getHeight() - 20;
  doc.setFillColor(...NAVY);
  doc.rect(0, footY - 8, W, 28, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, footY - 10, W, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text('📞 +509 36376134  •  +509 55698887', W / 2, footY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 200, 230);
  doc.text('14030 NW 5th Pl North, Florida, Miami 33168', W / 2, footY + 7, { align: 'center' });
  doc.setTextColor(...GOLD);
  doc.setFontSize(7);
  doc.text('Express Shipping — Sèvis Livrezon Miami → Ayiti', W / 2, footY + 13, { align: 'center' });

  return doc;
}

/* ─── GENERATE FROM FORM ───────────────────────────────────────── */
function generateInvoice() {
  const weight = parseFloat(document.getElementById('weight').value);
  const name   = document.getElementById('clientName').value.trim();
  const desc   = document.getElementById('description').value.trim() || 'Pake Jeneral';

  if (!weight || weight <= 0) { showToast('⚠️  Tanpri antre pwa pake a.'); return; }
  if (!name)                  { showToast('⚠️  Tanpri antre non kliyan an.'); return; }

  const total = weight * RATE + FIXED_FEE;
  const doc   = buildInvoicePDF({ name, desc, weight, total, dateStr: today() });
  const fname = `fakti-${name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
  doc.save(fname);

  // auto-save + mark invoiced
  const history = loadHistory();
  const existing = history.find(e =>
    e.name === name && Math.abs(e.weight - weight) < 0.01 && !e.invoiced
  );
  if (existing) {
    existing.invoiced = true;
    saveHistory(history);
  } else {
    const entry = { id: uid(), ts: Date.now(), name, desc, weight, total, invoiced: true };
    history.unshift(entry);
    saveHistory(history);
  }
  renderHistory();
  showToast('🧾  Fakti telechaje avèk siksè!');
}

/* ─── GENERATE FROM HISTORY ────────────────────────────────────── */
function generateInvoiceFromHistory(id) {
  const history = loadHistory();
  const entry   = history.find(e => e.id === id);
  if (!entry) return;

  const doc   = buildInvoicePDF({
    name:    entry.name,
    desc:    entry.desc,
    weight:  entry.weight,
    total:   entry.total,
    dateStr: today(),
  });
  const fname = `fakti-${entry.name.replace(/\s+/g, '-').toLowerCase()}-${entry.id}.pdf`;
  doc.save(fname);

  markInvoiced(id);
  renderHistory();
  showToast('🧾  Fich lan telechaje!');
}

/* ─── INIT ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  renderHistory();

  // auto-calculate on weight input
  const w = document.getElementById('weight');
  if (w) w.addEventListener('input', calculateLive);
});
