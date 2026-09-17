import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getFirestore, collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { firebaseProjects } from './firebase-config.js';

const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value || 0);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
const terminal = status => /cerrad|aceptad|perdid|rechaz|cancel|vencid/i.test(status || '');
const closed = status => /cerrad|aceptad/i.test(status || '');
const dateValue = value => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const dayDifference = value => {
  const date = dateValue(value);
  return date ? Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000)) : null;
};

function first(data, keys) {
  return keys.map(key => data[key]).find(value => value !== undefined && value !== null && value !== '');
}

function normalize(snapshot, source) {
  const data = snapshot.data();
  const issuedAt = first(data, ['fechaEmision', 'createdAt', 'fecha', 'fechaCotizacion']);
  const lastActivity = first(data, ['fechaSeguimiento', 'fechaUltimoSeguimiento', 'ultimaActividad', 'lastActivityAt', 'lastFollowUpDate', 'updatedAt']);
  const activityBase = lastActivity || issuedAt;
  return {
    id: snapshot.id,
    source,
    fecha: dateValue(issuedAt),
    folio: data.folio || '—',
    kam: data.kam || 'Sin KAM asignado',
    medico: data.medico || 'Sin médico',
    paciente: data.paciente || 'Sin paciente',
    monto: Number(data.total || data.importe || data.monto || 0),
    status: first(data, ['status1', 'estatus', 'status']) || 'Sin seguimiento',
    dias: dayDifference(activityBase),
    hasFollowUp: Boolean(lastActivity)
  };
}

let rows = [];
let sort = { key: 'dias', direction: -1 };

function activeRows() { return rows.filter(row => !terminal(row.status)); }
function kamSummary() {
  const groups = new Map();
  rows.forEach(row => {
    const current = groups.get(row.kam) || { kam: row.kam, count: 0, amount: 0 };
    current.count += 1;
    current.amount += row.monto;
    groups.set(row.kam, current);
  });
  return [...groups.values()];
}

function renderBars(target, values, valueKey, formatter, alert = false) {
  const root = $(target);
  if (!values.length) { root.innerHTML = '<p>No hay cotizaciones disponibles.</p>'; return; }
  const max = Math.max(...values.map(item => item[valueKey]), 1);
  root.innerHTML = values.map(item => `<div class="bar-row ${alert ? 'alert' : ''}"><span title="${escapeHtml(item.label || item.kam || item.folio)}">${escapeHtml(item.label || item.kam || item.folio)}</span><div class="bar"><i style="width:${Math.max(3, item[valueKey] / max * 100)}%"></i></div><strong>${formatter(item[valueKey])}</strong></div>`).join('');
}

function renderCharts() {
  const kams = kamSummary();
  renderBars('#mostQuotesChart', [...kams].sort((a, b) => b.count - a.count).slice(0, 5), 'count', value => `${value} cot.`);
  renderBars('#fewestQuotesChart', [...kams].sort((a, b) => a.count - b.count).slice(0, 5), 'count', value => `${value} cot.`);
  renderBars('#largestAmountChart', [...rows].sort((a, b) => b.monto - a.monto).slice(0, 5).map(row => ({ ...row, label: `${row.folio} · ${row.kam}` })), 'monto', money);
  renderBars('#staleQuotesChart', activeRows().filter(row => row.dias !== null).sort((a, b) => b.dias - a.dias).slice(0, 5), 'dias', value => `${value} días`, true);
}

function renderKpis() {
  const active = activeRows();
  const total = rows.reduce((sum, row) => sum + row.monto, 0);
  const closedRows = rows.filter(row => closed(row.status));
  const stale = active.filter(row => (row.dias || 0) >= 7);
  $('#quotedAmount').textContent = money(total);
  $('#quoteCount').textContent = `${rows.length} cotizaciones en todas las fuentes`;
  $('#closedAmount').textContent = money(closedRows.reduce((sum, row) => sum + row.monto, 0));
  $('#closedCount').textContent = `${closedRows.length} cotizaciones cerradas`;
  $('#openAmount').textContent = money(active.reduce((sum, row) => sum + row.monto, 0));
  $('#openCount').textContent = `${active.length} cotizaciones activas`;
  $('#staleCount').textContent = `${stale.length} / ${active.length}`;
  $('#staleFoot').textContent = `${stale.length ? money(stale.reduce((sum, row) => sum + row.monto, 0)) : 'Sin'} con 7+ días sin gestión`;
  const percentage = active.length ? Math.round(stale.length / active.length * 100) : 0;
  $('#heroValue').textContent = `${percentage}%`;
  $('#heroDescription').innerHTML = `de las cotizaciones activas llevan <strong>7 o más días sin gestión</strong> — <span class="num">${money(stale.reduce((sum, row) => sum + row.monto, 0))}</span> expuestos.`;
  const oldest = active.filter(row => row.dias !== null).sort((a, b) => b.dias - a.dias)[0];
  $('#heroSub').textContent = oldest ? `La oportunidad sin gestión más antigua lleva ${oldest.dias} días: ${oldest.folio} · ${oldest.kam}.` : 'No hay fechas suficientes para calcular antigüedad de gestión.';
}

function renderTable() {
  const query = $('#segSearch').value.trim().toLocaleLowerCase('es-MX');
  const kam = $('#segKamFilter').value;
  const visible = activeRows().filter(row => (!kam || row.kam === kam) && (!query || [row.folio, row.kam, row.medico, row.paciente].join(' ').toLocaleLowerCase('es-MX').includes(query)));
  visible.sort((left, right) => {
    let a = left[sort.key], b = right[sort.key];
    if (a instanceof Date) { a = a.getTime(); b = b?.getTime(); }
    if (typeof a === 'string') { a = a.toLocaleLowerCase(); b = b.toLocaleLowerCase(); }
    return (a > b ? 1 : a < b ? -1 : 0) * sort.direction;
  });
  $('#segBody').innerHTML = visible.map(row => {
    const width = Math.min(100, (row.dias || 0) / 30 * 100);
    return `<tr><td>${row.fecha ? row.fecha.toLocaleDateString('es-MX') : '—'}</td><td class="figure">${escapeHtml(row.folio)}</td><td>${escapeHtml(row.kam)}</td><td>${escapeHtml(row.medico)}</td><td>${escapeHtml(row.paciente)}</td><td class="num-col figure">${money(row.monto)}</td><td class="num-col"><div class="days-bar-wrap"><span class="figure">${row.dias ?? '—'}</span><div class="days-bar"><i style="width:${width}%"></i></div></div></td></tr>`;
  }).join('') || '<tr><td colspan="7">No hay cotizaciones abiertas con estos filtros.</td></tr>';
  document.querySelectorAll('#segTable thead th').forEach(th => th.classList.toggle('sorted', th.dataset.key === sort.key && sort.direction === -1));
}

function fillKamFilter() {
  const current = $('#segKamFilter').value;
  const kams = [...new Set(rows.map(row => row.kam))].sort((a, b) => a.localeCompare(b, 'es-MX'));
  $('#segKamFilter').innerHTML = '<option value="">Todos los KAM</option>' + kams.map(kam => `<option value="${escapeHtml(kam)}">${escapeHtml(kam)}</option>`).join('');
  $('#segKamFilter').value = kams.includes(current) ? current : '';
}

function render() { fillKamFilter(); renderKpis(); renderCharts(); renderTable(); }

function connect() {
  const configured = Object.entries(firebaseProjects || {}).filter(([, config]) => config?.projectId);
  if (!configured.length) throw new Error('No hay fuentes Firebase configuradas.');
  const sources = new Map();
  configured.forEach(([key, config]) => {
    const db = getFirestore(initializeApp(config, `reporte-${key}`));
    onSnapshot(collection(db, 'cotizaciones'), snapshot => {
      sources.set(key, snapshot.docs.map(doc => normalize(doc, key.toUpperCase())));
      rows = [...sources.values()].flat();
      render();
      $('#connectionState').textContent = `Firebase en tiempo real · ${configured.length} fuente(s) · actualizado ${new Date().toLocaleTimeString('es-MX')}`;
    }, error => {
      console.error(`Firebase ${key}`, error);
      $('#connectionState').textContent = error.code === 'permission-denied' ? 'Firebase bloqueó la lectura: revise Authentication y las reglas de Firestore.' : `No se pudo leer ${key}: ${error.message}`;
    });
  });
}

document.querySelectorAll('#segTable thead th').forEach(th => th.addEventListener('click', () => { sort = { key: th.dataset.key, direction: sort.key === th.dataset.key ? -sort.direction : 1 }; renderTable(); }));
$('#segSearch').addEventListener('input', renderTable);
$('#segKamFilter').addEventListener('change', renderTable);
try { connect(); } catch (error) { console.error(error); $('#connectionState').textContent = 'No se pudo cargar la configuración Firebase.'; }
