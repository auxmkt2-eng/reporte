import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getFirestore, collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { firebaseProjects } from './firebase-config.js';
import { supabaseConfig } from './supabase-config.js';

const $ = selector => document.querySelector(selector);
const REPORT_START = new Date(2026, 5, 1);
const REPORT_START_ISO = '2026-06-01';
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value || 0);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
const terminal = status => /cerrad|aceptad|perdid|rechaz|cancel|vencid/i.test(status || '');
const closed = status => /cerrad|aceptad/i.test(status || '');
const dateValue = value => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (typeof value === 'string') {
    const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const mexican = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (mexican) return new Date(Number(mexican[3]), Number(mexican[2]) - 1, Number(mexican[1]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const dayDifference = value => {
  const date = dateValue(value);
  return date ? Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000)) : null;
};
const numericAmount = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  let raw = value.trim().replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) raw = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  else if (comma >= 0) raw = /,\d{1,2}$/.test(raw) ? raw.replace(',', '.') : raw.replace(/,/g, '');
  return Number(raw) || 0;
};
const kamKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const KAM_ALIASES = new Map([
  [['MARYMAR', 'MARYMARIA'].map(kamKey), 'MARYMAR'],
  [['SAMANTHAGUEVARALEON', 'SAMNTHAGUEVARALEON'].map(kamKey), 'SAMANTHA GUEVARA LEÓN'],
  [['SAMANTHAGUEVARA'].map(kamKey), 'SAMANTHA GUEVARA'],
  [['ANAYELY', 'ANAYELI'].map(kamKey), 'ANAYELY'],
  [['ANAYELYALAIN', 'ANAYELIALAIN'].map(kamKey), 'ANAYELY ALAIN'],
  [['EFRAINICAMARIN', 'DREFRAINCAMARIN', 'DREFRAINICAMARIN', 'EFRAINCAMARIN'].map(kamKey), 'EFRÁIN I. CAMARÍN'],
  [['LIZETTEGUADALUPEMARTINEZSANCHEZ'].map(kamKey), 'LIZETTE GUADALUPE MARTINEZ SANCHEZ'],
  [['OSCAR'].map(kamKey), 'OSCAR'],
  [['DIGITAL'].map(kamKey), 'DIGITAL'],
  [['ALAIN', 'ALAINRAMIREZ', 'DRALAINRAMIREZ'].map(kamKey), 'ALAIN RAMIREZ'],
  [['XX'].map(kamKey), 'XX'],
  [['DAVIDSANTIAGO'].map(kamKey), 'DAVID SANTIAGO'],
  [['BERENICE', 'BERENICEORDAZNARANJO'].map(kamKey), 'BERENICE'],
  [['DRLIYDAVID', 'DRLIY\u005cDAVID'].map(kamKey), 'DR LIY\\DAVID'],
  [['DRESPANA', 'DRESPANA'].map(kamKey), 'DR. ESPAÑA'],
  [['ENRIQUE', 'ENRIQUEMUNOZ'].map(kamKey), 'ENRIQUE MUÑOZ']
].flatMap(([aliases, name]) => aliases.map(alias => [alias, name])));
function canonicalKam(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Sin KAM asignado';
  const key = kamKey(raw);
  // Las fuentes registran a Efraín con varios segundos apellidos; todos corresponden al mismo KAM acordado.
  if (key.includes('EFRAIN') && key.includes('CAMARIN')) return 'EFRÁIN I. CAMARÍN';
  if (key.includes('GUEVARA') && key.includes('LEON')) return 'SAMANTHA GUEVARA LEÓN';
  if (key === 'SAMANTHAGUEVARA' || key === 'SAMNTHAGUEVARA') return 'SAMANTHA GUEVARA';
  // No se inventa un responsable: valores de canal, prueba o nombres fuera del catálogo quedan sin asignar.
  return KAM_ALIASES.get(key) || 'Sin KAM asignado';
}

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
    kam: canonicalKam(data.kam),
    medico: data.medico || 'Sin médico',
    paciente: data.paciente || 'Sin paciente',
    monto: numericAmount(first(data, ['total', 'importe', 'monto', 'montoTotal', 'totalCotizacion'])),
    status: first(data, ['status1', 'estatus', 'status']) || 'Sin seguimiento',
    dias: dayDifference(activityBase),
    hasFollowUp: Boolean(lastActivity)
  };
}

let rows = [];
let billingRows = [];
let sort = { key: 'dias', direction: -1 };
let billedAmount = 0;
let billedCount = 0;
let firebaseStatus = 'Conectando a Firebase…';
let supabaseStatus = 'Conectando a captura SAI…';

function renderConnectionState() {
  $('#connectionState').textContent = `${firebaseStatus} · ${supabaseStatus}`;
}

function rowsInPeriod() {
  const start = dateValue($('#periodStart').value) || REPORT_START;
  const end = dateValue($('#periodEnd').value);
  return rows.filter(row => row.fecha && row.fecha >= start && (!end || row.fecha <= end));
}
function activeRows() { return rowsInPeriod().filter(row => !terminal(row.status)); }
function kamSummary() {
  const groups = new Map();
  rowsInPeriod().filter(row => row.kam !== 'Sin KAM asignado').forEach(row => {
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
  root.innerHTML = `<div class="chart-list">${values.map(item => `<div class="bar-row ${alert ? 'alert' : ''}"><span title="${escapeHtml(item.label || item.kam || item.folio)}">${escapeHtml(item.label || item.kam || item.folio)}</span><div class="bar"><i style="width:${Math.max(3, item[valueKey] / max * 100)}%"></i></div><strong>${formatter(item[valueKey])}</strong></div>`).join('')}</div>`;
}

function renderCharts() {
  const kams = kamSummary();
  renderBars('#mostQuotesChart', [...kams].sort((a, b) => b.count - a.count), 'count', value => `${value} cot.`);
  renderBars('#fewestQuotesChart', [...kams].sort((a, b) => a.count - b.count), 'count', value => `${value} cot.`);
  renderBars('#largestAmountChart', [...rowsInPeriod()].sort((a, b) => b.monto - a.monto).map(row => ({ ...row, label: `${row.folio} · ${row.kam}` })), 'monto', money);
  renderBars('#staleQuotesChart', activeRows().filter(row => row.dias !== null).sort((a, b) => b.dias - a.dias), 'dias', value => `${value} días`, true);
}

function renderKpis() {
  const active = activeRows();
  const scopedRows = rowsInPeriod();
  const total = scopedRows.reduce((sum, row) => sum + row.monto, 0);
  const stale = active.filter(row => (row.dias || 0) >= 7);
  $('#quotedAmount').textContent = money(total);
  $('#quoteCount').textContent = `${scopedRows.length} cotizaciones Firebase en el periodo`;
  $('#closedAmount').textContent = money(billedAmount);
  $('#closedCount').textContent = `${billedCount} registros facturados en SAI`;
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
  const kams = [...new Set(rowsInPeriod().map(row => row.kam).filter(kam => kam !== 'Sin KAM asignado'))].sort((a, b) => a.localeCompare(b, 'es-MX'));
  $('#segKamFilter').innerHTML = '<option value="">Todos los KAM</option>' + kams.map(kam => `<option value="${escapeHtml(kam)}">${escapeHtml(kam)}</option>`).join('');
  $('#segKamFilter').value = kams.includes(current) ? current : '';
}

function refreshBillingForPeriod() {
  const start = dateValue($('#periodStart').value) || REPORT_START;
  const end = dateValue($('#periodEnd').value);
  const scopedBilling = billingRows.filter(row => row.fecha && row.fecha >= start && (!end || row.fecha <= end) && row.monto !== null);
  billedAmount = scopedBilling.reduce((sum, row) => sum + numericAmount(row.monto), 0);
  billedCount = scopedBilling.length;
}
function render() { refreshBillingForPeriod(); fillKamFilter(); renderKpis(); renderCharts(); renderTable(); }

function connect() {
  // El reporte comercial solicitado es exclusivo de Sanaré; Nomad no se consulta.
  const configured = Object.entries(firebaseProjects || {}).filter(([key, config]) => config?.projectId && key !== 'nomad');
  if (!configured.length) throw new Error('No hay fuentes Firebase configuradas.');
  const sources = new Map();
  configured.forEach(([key, config]) => {
    const db = getFirestore(initializeApp(config, `reporte-${key}`));
    onSnapshot(collection(db, 'cotizaciones'), snapshot => {
      sources.set(key, snapshot.docs.map(doc => normalize(doc, key.toUpperCase())));
      // Mantiene el mismo periodo histórico que Llenado SAI: desde el 01/06/2026.
      rows = [...sources.values()].flat().filter(row => row.fecha && row.fecha >= REPORT_START);
      render();
      firebaseStatus = `Firebase en tiempo real · ${configured.length} fuente(s) · ${new Date().toLocaleTimeString('es-MX')}`;
      renderConnectionState();
    }, error => {
      console.error(`Firebase ${key}`, error);
      firebaseStatus = error.code === 'permission-denied' ? 'Firebase bloqueó la lectura: revise Authentication y las reglas de Firestore.' : `No se pudo leer ${key}: ${error.message}`;
      renderConnectionState();
    });
  });
}

async function connectSupabase() {
  const client = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  const loadBilling = async () => {
    const pageSize = 1000;
    let from = 0;
    let count = null;
    let allBillingRows = [];
    do {
      const { data, error, count: totalCount } = await client.from('cotizaciones').select('monto_del_servicio,fecha_infusion', { count: 'exact' }).gte('fecha_infusion', REPORT_START_ISO).range(from, from + pageSize - 1);
      if (error) throw error;
      count ??= totalCount;
      allBillingRows = allBillingRows.concat(data || []);
      from += pageSize;
      if (!(data || []).length) break;
    } while (count === null || allBillingRows.length < count);
    billingRows = allBillingRows.map(row => ({ fecha: dateValue(row.fecha_infusion), monto: row.monto_del_servicio }));
    render();
    supabaseStatus = `Captura SAI · ${count ?? billedCount} registro(s) · ${new Date().toLocaleTimeString('es-MX')}`;
    renderConnectionState();
  };
  try {
    await loadBilling();
    client.channel('reporte-sai-facturacion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, () => loadBilling().catch(handleError))
      .subscribe();
  } catch (error) { handleError(error); }
  function handleError(error) {
    console.error('Supabase SAI', error);
    supabaseStatus = `No se pudo leer captura SAI: ${error.message || 'verifique las políticas de Supabase'}`;
    renderConnectionState();
  }
}

document.querySelectorAll('#segTable thead th').forEach(th => th.addEventListener('click', () => { sort = { key: th.dataset.key, direction: sort.key === th.dataset.key ? -sort.direction : 1 }; renderTable(); }));
$('#segSearch').addEventListener('input', renderTable);
$('#segKamFilter').addEventListener('change', renderTable);
$('#periodFilter').addEventListener('submit', event => { event.preventDefault(); if ($('#periodEnd').value && $('#periodEnd').value < $('#periodStart').value) { $('#periodEnd').value = $('#periodStart').value; } render(); });
try { connect(); } catch (error) { console.error(error); firebaseStatus = 'No se pudo cargar la configuración Firebase.'; renderConnectionState(); }
connectSupabase();
