/* WildGuard front end. All maths comes from the Flask API (maths.py);
   this file only collects inputs and shows the working + results. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short = n => String(n).replace(' Reserve Forest', ' RF');
const word = n => String(n).replace(' Reserve Forest', '');
const B = x => (x ? 1 : 0);

let STATE = null;
let VIEW = 'home';

async function api(url, data, method) {
  const opts = data === undefined ? {method: method || 'GET'} :
    {method: method || 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)};
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || 'Request failed');
  return d;
}
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' error' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast', 3200);
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('wg.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wg.' + k, JSON.stringify(v)); } catch {} }
};
function line(label, ...eqs) {
  return `<div class="w-line"><div><div class="label">${label}</div>${eqs.map(e => `<div class="eq">${e}</div>`).join('')}</div></div>`;
}
function answer(big, sub, meaning, warn) {
  return `<div class="card-title"><span class="step">4</span><h2>Answer for the corridor</h2></div>
    <div class="answer-big${warn ? ' warn' : ''}">${big}</div>
    ${sub ? `<p class="answer-sub">${sub}</p>` : ''}
    ${meaning ? `<p class="answer-meaning">${meaning}</p>` : ''}`;
}
function fillSelect(el, options, keep) {
  const old = keep ?? el.value;
  el.innerHTML = options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  if (options.some(o => String(o.value) === String(old))) el.value = old;
}
const reportById = id => STATE.reports.find(r => r.id === id);
const reportOptions = first => [{value: '', label: first}, ...STATE.reports.map(r =>
  ({value: r.id, label: `${r.id} · ${word(r.corridor_name.split(' (')[0])} · ${r.severity}${r.simulated ? ' · demo' : ''}`}))];

/* ------------------------------------------------------------------ routing */
const VIEWS = ['home', 'map', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'data'];
function route() {
  const v = location.hash.slice(1);
  VIEW = VIEWS.includes(v) ? v : 'home';
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + VIEW));
  const isMod = VIEW.startsWith('m');
  $('#moduleRail').hidden = !isMod;
  $$('.main-nav a').forEach(a => a.classList.toggle('active',
    a.dataset.nav === VIEW || (isMod && a.dataset.nav === 'modules')));
  $$('.rail-link').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + VIEW));
  const act = $('.rail-link.active'); if (act) act.scrollIntoView({block: 'nearest', inline: 'center'});
  window.scrollTo({top: 0});
  render();
}
window.addEventListener('hashchange', route);

function render() {
  if (!STATE) return;
  ({home: renderHome, m1: renderM1, m2: renderM2, m3: renderM3, m4: renderM4, m5: renderM5,
    m6: renderM6, m7: renderM7, data: renderData, map: renderMap})[VIEW]();
  renderApplied();
}
async function refresh() {
  STATE = await api('/api/state');
  render();
}
function setState(d) { if (d && d.state) { STATE = d.state; render(); } }

/* ------------------------------------------------------------------ graph drawing */
const LAYOUT = {
  'Kaniyanpura Reserve Forest': [520, 55], 'Moyar Reserve Forest': [470, 165],
  'Avarahalla Reserve Forest': [330, 215], 'Segur Reserve Forest': [400, 320],
  'Singara Reserve Forest': [190, 165], 'Kallhatti Reserve Forest': [80, 290]
};
const LABEL_OFF = {
  'Kaniyanpura Reserve Forest': [-26, 6, 'end'], 'Moyar Reserve Forest': [26, 6, 'start'],
  'Avarahalla Reserve Forest': [-16, 40, 'end'], 'Singara Reserve Forest': [0, -28, 'middle']
};
const COMP_COLORS = ['#4e8a4f', '#e39a2f', '#3b7ea1', '#a855a1', '#b9412f', '#6b7d2a'];
function positions(nodes) {
  const pos = {}; const extra = nodes.filter(n => !LAYOUT[n]);
  nodes.forEach(n => { if (LAYOUT[n]) pos[n] = LAYOUT[n]; });
  extra.forEach((n, i) => { const a = Math.PI * (0.15 + 0.7 * (i + 1) / (extra.length + 1)); pos[n] = [320 + 260 * Math.cos(a + Math.PI), 190 + 150 * Math.sin(a + Math.PI) * -1]; });
  return pos;
}
function drawGraph(svg, {removed = new Set(), components = null, dark = false} = {}) {
  const nodes = STATE.sites; const pos = positions(nodes);
  const comp = {}; (components || [nodes]).forEach((c, i) => c.forEach(n => comp[n] = i));
  const multi = components && components.length > 1;
  let out = '';
  STATE.corridors.forEach(e => {
    if (!pos[e.a] || !pos[e.b]) return;
    const [x1, y1] = pos[e.a], [x2, y2] = pos[e.b];
    const gone = !e.active || removed.has(e.id);
    const stroke = gone ? '#b9412f' : (dark ? '#c9e36b' : '#2b5f41');
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${gone ? 3 : 5}" stroke-linecap="round" ${gone ? 'stroke-dasharray="8 8" opacity=".8"' : ''}/>`;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len, sgn = ny > 0 ? -1 : 1;
    const mx = (x1 + x2) / 2 + nx * 16 * sgn, my = (y1 + y2) / 2 + ny * 16 * sgn + 4;
    const lbl = (e.name.match(/\((Segur \d)\)/) || [])[1] || (e.id === 'NIL-KM' ? 'K–M' : e.name.length > 14 ? 'new link' : e.name);
    out += `<text x="${mx}" y="${my}" text-anchor="middle" font-size="13" font-weight="700" font-family="Plus Jakarta Sans, sans-serif" fill="${dark ? '#e8efe2' : '#34463a'}" paint-order="stroke" stroke="${dark ? '#133221' : '#fffdf8'}" stroke-width="5">${esc(lbl)}</text>`;
  });
  nodes.forEach(n => {
    if (!pos[n]) return; const [x, y] = pos[n];
    const fill = multi ? COMP_COLORS[comp[n] % COMP_COLORS.length] : (dark ? '#c9e36b' : '#2b5f41');
    out += `<circle cx="${x}" cy="${y}" r="17" fill="${fill}" stroke="${dark ? '#08190f' : '#fffdf8'}" stroke-width="4"/>`;
    const [dx, dy, anc] = LABEL_OFF[n] || [0, 38, 'middle'];
    out += `<text x="${x + dx}" y="${y + dy}" text-anchor="${anc}" font-size="16" font-weight="700" font-family="Plus Jakarta Sans, sans-serif" fill="${dark ? '#ffffff' : '#17261c'}" paint-order="stroke" stroke="${dark ? '#133221' : '#fffdf8'}" stroke-width="5">${esc(word(n))}</text>`;
  });
  svg.innerHTML = out;
}

/* ------------------------------------------------------------------ HOME */
const PIPE = [
  ['m1', 'Logic', 'Propositional logic · truth tables', 'Is this report urgent enough for immediate human review?'],
  ['m2', 'Number theory', 'Euclid’s algorithm · GCD · LCM', 'When do camera, patrol and night-watch checks happen together?'],
  ['m3', 'Relations', 'Transitive closure · Warshall', 'Can elephants still move between two reserves if a link is blocked?'],
  ['m4', 'Posets & lattices', 'Partial order ⊆ · Hasse diagram', 'Which pieces of evidence are still missing from a report?'],
  ['m5', 'Functions & pigeonhole', 'f : Reports → Teams · ⌈n/m⌉', 'What is the least possible load on the busiest team?'],
  ['m6', 'Graphs', 'Components · bridges · degrees', 'Which corridor link, if lost, splits the network?'],
  ['m7', 'Groups & codes', '(ℤ₂, ⊕) · Hamming (7,4)', 'Did the report’s status bits arrive without corruption?']
];
function renderHome() {
  const s = STATE.summary;
  $('#statUrgent').textContent = s.urgent;
  $('#statEvidence').textContent = `${s.complete_evidence}/${s.reports}`;
  $('#statLoad').textContent = s.max_load_bound ?? '–';
  $('#statComponents').textContent = s.components;
  const g = STATE.graph.before;
  const nt = STATE.settings.intervals;
  const live = {
    m1: [`${s.urgent} of ${s.reports} reports: U = 1`, s.urgent > 0],
    m2: [`lcm(${nt.join(', ')}) = ${nt.reduce((a, b) => a * b / gcd(a, b))} min`, false],
    m3: [s.components === 1 ? `all ${g.vertices} reserves reachable` : `${s.components} separate groups`, s.components > 1],
    m4: [`${s.complete_evidence} of ${s.reports} complete`, s.complete_evidence < s.reports],
    m5: [s.teams_available ? `⌈${s.pending}/${s.teams_available}⌉ = ${s.max_load_bound}` : 'no team available', !s.teams_available],
    m6: [`${s.bridges} of ${g.edges} links are bridges`, s.bridges > 0],
    m7: ['corrects 1 bit in 7', false]
  };
  $('#pipeline').innerHTML = PIPE.map(([id, name, concept, q], i) => `
    <a class="pipe" href="#${id}"><span class="pipe-num">${i + 1}</span>
      <span><h3>${name}</h3><span class="concept">${concept}</span></span>
      <span class="q">${q}</span>
      <span class="live${live[id][1] ? ' warn' : ''}">${esc(live[id][0])}</span></a>`).join('');
  $('#factV').textContent = g.vertices; $('#factE').textContent = g.edges; $('#factB').textContent = s.bridges;
  drawGraph($('#homeGraph'), {dark: true});
}
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; } // used only for the home-page label

/* ------------------------------------------------------------------ M1 LOGIC */
const LOGIC = [['v', 'V', 'Verified', 'checked by a field team'], ['r', 'R', 'Recent', 'within the last 24 h'],
               ['s', 'S', 'Severe', 'High or Critical'], ['o', 'O', 'Open', 'Open or In review']];
const m1 = {v: 1, r: 1, s: 0, o: 1, report: ''};
function bitsFromReport(r) { const t = r.triage; return {v: B(t.verified), r: B(t.recent), s: B(t.high_severity), o: B(t.open_status)}; }
function renderM1() {
  fillSelect($('#m1Report'), reportOptions('Custom values (no report)'), m1.report);
  $('#m1Bools').innerHTML = LOGIC.map(([k, L, name, d]) => `
    <button class="bool${m1[k] ? ' on' : ''}" data-k="${k}" type="button"><span class="bit">${m1[k]}</span>
    <span><b>${L} · ${name}</b><small>${d}</small></span></button>`).join('');
  calcM1();
}
async function calcM1() {
  const {result: res, table} = await api('/api/calc/logic', {v: m1.v, r: m1.r, s: m1.s, o: m1.o});
  const vals = ['v', 'r', 's', 'o'].map(k => m1[k]);
  let acc = vals[0]; const prog = [];
  for (let i = 1; i < 4; i++) { const n = acc && vals[i] ? 1 : 0; prog.push(`(${acc} ∧ ${vals[i]}) = ${n}`); acc = n; }
  const bin = vals.join('');
  $('#m1Working').innerHTML =
    line('Write the rule', 'U = V ∧ R ∧ S ∧ O') +
    line('Substitute your values', `U = ${vals.map((x, i) => x ? x : `<span class="hl">${x}</span>`).join(' ∧ ')}`) +
    line('Evaluate left to right', prog.join('  →  ')) +
    line('Find the row in the truth table', `VRSO = ${bin}₂ = row ${res.row}`) +
    line('Check against the table', `Only row 15 (1111) gives U = 1, so 1 of 16 cases is urgent.`);
  const advice = {
    'Verified': 'Ask a field team to verify it (V must become 1).',
    'Recent (≤ 24 h)': 'The sighting is older than 24 h; confirm the obstruction is still there.',
    'Severe (High/Critical)': 'Severity is Low/Medium, so it stays in the routine review queue.',
    'Open / in review': 'The report is closed; keep it for records only.'
  };
  const rep = m1.report && reportById(m1.report);
  let meaning = res.result
    ? '<b>Every condition holds.</b> Escalate to the Forest Range Office for human review now.'
    : '<b>What would change it:</b> ' + res.blocking.map(b => advice[b]).join(' ');
  if (rep) meaning += `<br><br><b>${esc(rep.id)}</b> at ${esc(rep.locality)} → ${esc(rep.triage.priority_label)}.`;
  $('#m1Answer').innerHTML = answer(
    res.result ? 'U = 1 · Urgent review' : 'U = 0 · Not urgent yet',
    res.result ? 'All four propositions are true.' : `False because of: ${res.blocking.join(', ')}.`,
    meaning, !res.result);
  const rows = table.map((t, i) => ({i, v: B(t.verified), r: B(t.recent), s: B(t.severe), o: B(t.open), u: B(t.result)}));
  const tbl = part => `<table class="tt"><thead><tr><th>#</th><th>V</th><th>R</th><th>S</th><th>O</th><th>U</th></tr></thead><tbody>${
    part.map(x => `<tr class="${x.i === res.row ? 'current' : ''}"><td class="idx">${x.i}</td><td>${x.v}</td><td>${x.r}</td><td>${x.s}</td><td>${x.o}</td><td class="${x.u ? 'u1' : ''}">${x.u}</td></tr>`).join('')}</tbody></table>`;
  $('#m1Table').innerHTML = tbl(rows.slice(0, 8)) + tbl(rows.slice(8));
}
$('#m1Bools').addEventListener('click', e => {
  const b = e.target.closest('.bool'); if (!b) return;
  m1[b.dataset.k] = 1 - m1[b.dataset.k]; m1.report = ''; renderM1();
});
$('#m1Report').addEventListener('change', e => {
  m1.report = e.target.value; const r = reportById(m1.report);
  if (r) Object.assign(m1, bitsFromReport(r)); renderM1();
});

/* ------------------------------------------------------------------ M2 NUMBER THEORY */
function renderM2() {
  const saved = STATE.settings.intervals;
  ['#m2a', '#m2b', '#m2c'].forEach((s, i) => { if (!$(s).dataset.touched) $(s).value = saved[i] || ''; });
  if (!$('#m2start').dataset.touched) $('#m2start').value = STATE.settings.shift_start;
  calcM2();
}
async function calcM2() {
  const vals = ['#m2a', '#m2b', '#m2c'].map(s => $(s).value.trim()).filter(Boolean);
  const names = ['Camera-trap check', 'Foot patrol', 'Night watch'];
  let d;
  try { d = await api('/api/number-theory', {intervals: vals.join(',')}); }
  catch (err) { $('#m2Working').innerHTML = `<p class="empty">${esc(err.message)}</p>`; $('#m2Answer').innerHTML = ''; $('#m2Timeline').innerHTML = ''; return; }
  const nums = d.sync.intervals;
  const start = $('#m2start').value || '06:00';
  if (nums.join(',') !== STATE.settings.intervals.join(',') || start !== STATE.settings.shift_start) {
    try { STATE = (await api('/api/settings', {intervals: nums, shift_start: start})).state; renderApplied(); toast('Timetable updated for every pending report.'); }
    catch (err) { toast(err.message, true); }
  }
  const L = d.sync.common_checkpoint_minutes, G = d.gcd.gcd;
  let html = '';
  d.sync.lcm_steps.forEach((s, i) => {
    const eu = d.lcm_euclid[i];
    html += line(`Step ${'ABC'[i]} · lcm(${s.a}, ${s.b}) — first find gcd by Euclid`,
      ...eu.steps.map(r => `${r.a} = ${r.quotient} × ${r.b} + ${r.remainder === 0 ? '<span class="ok">0</span>' : r.remainder}`),
      `gcd(${Math.max(s.a, s.b)}, ${Math.min(s.a, s.b)}) = <span class="hl">${s.gcd}</span>`,
      `lcm(${s.a}, ${s.b}) = (${s.a} × ${s.b}) ÷ ${s.gcd} = ${s.product} ÷ ${s.gcd} = <span class="hl">${s.lcm}</span>`);
  });
  html += line('GCD of all intervals', `gcd(${nums.join(', ')}) = ${G}  → every check lands on a multiple of ${G} min`);
  html += line('Checks per cycle of ' + L + ' min', nums.map((n, i) => `${L} ÷ ${n} = ${L / n} (${names[i] || 'schedule ' + (i + 1)})`).join('<br>'));
  $('#m2Working').innerHTML = html;
  const fmt = m => m >= 60 ? `${m} min (${+(m / 60).toFixed(2)} h)` : `${m} min`;
  $('#m2Answer').innerHTML = answer(`Every ${fmt(L)}`,
    `All ${nums.length} checks happen together at minute ${L}, ${2 * L}, ${3 * L} …`,
    `<b>Use:</b> schedule the joint verification of open reports at these times, when camera footage, patrol notes and night-watch logs all exist for the same moment. In each ${L}-minute cycle the teams make ${nums.map(n => L / n).join(' + ')} = ${nums.reduce((a, n) => a + L / n, 0)} checks.`);
  const span = L * 2, ticks = nums.reduce((a, n) => a + span / n, 0);
  if (ticks > 400) { $('#m2Timeline').innerHTML = `<p class="empty">The cycle is ${L} min long, too many checks to draw. The working above still applies.</p>`; return; }
  const pct = m => (m / span * 100).toFixed(3) + '%';
  let tl = nums.map((n, i) => {
    let t = ''; for (let m = 0; m <= span; m += n) t += `<i class="tl-tick${m % L === 0 ? ' shared' : ''}" style="left:${pct(m)}"></i>`;
    return `<div class="tl-row"><div><b>${names[i] || 'Schedule ' + (i + 1)}</b><small>every ${n} min</small></div><div class="tl-track">${t}</div></div>`;
  }).join('');
  tl += `<div class="tl-axis">${[0, L / 2, L, 1.5 * L, span].map(m => `<span style="left:${pct(m)}">${Number.isInteger(m) ? m : m.toFixed(1)}</span>`).join('')}</div>`;
  $('#m2Timeline').innerHTML = tl;
}
['#m2a', '#m2b', '#m2c'].forEach(s => $(s).addEventListener('input', e => { e.target.dataset.touched = 1; }));
['#m2a', '#m2b', '#m2c'].forEach(s => $(s).addEventListener('change', calcM2));
$('#m2Calc').addEventListener('click', calcM2);
$('#m2start').addEventListener('input', e => { e.target.dataset.touched = 1; });
$('#m2start').addEventListener('change', calcM2);
$$('[data-preset]').forEach(b => b.addEventListener('click', () => {
  const p = b.dataset.preset.split(','); ['#m2a', '#m2b', '#m2c'].forEach((s, i) => { $(s).value = p[i] || ''; $(s).dataset.touched = 1; }); calcM2();
}));

/* ------------------------------------------------------------------ M3 RELATIONS */
const m3 = {from: '', to: '', block: ''};
function renderM3() {
  const sites = STATE.sites.map(n => ({value: n, label: short(n)}));
  if (!m3.from) { m3.from = STATE.sites.find(n => n.startsWith('Kaniyanpura')) || STATE.sites[0]; }
  if (!m3.to) { m3.to = STATE.sites.find(n => n.startsWith('Kallhatti')) || STATE.sites[1]; }
  fillSelect($('#m3From'), sites, m3.from); fillSelect($('#m3To'), sites, m3.to);
  fillSelect($('#m3Block'), [{value: '', label: 'No corridor blocked'}, ...STATE.corridors.filter(c => c.active).map(c => ({value: c.id, label: c.name}))], m3.block);
  m3.block = $('#m3Block').value;
  calcM3();
}
const countOnes = m => m.reduce((a, r) => a + r.filter(Boolean).length, 0);
function matrixHTML(nodes, m, {prev = null, base = null, target = null} = {}) {
  const ti = target ? nodes.indexOf(target[0]) : -1, tj = target ? nodes.indexOf(target[1]) : -1;
  return `<table class="matrix"><thead><tr><th></th>${nodes.map(n => `<th>${esc(word(n))}</th>`).join('')}</tr></thead><tbody>${
    m.map((row, i) => `<tr><th>${esc(word(nodes[i]))}</th>${row.map((x, j) => {
      let c = x ? 'one' : 'zero';
      if (x && prev && !prev[i][j]) c = 'new';
      if (x && base && !base[i][j]) c = 'new';
      if (i === ti && j === tj) c += ' target';
      return `<td class="${c}">${x ? 1 : 0}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
}
async function calcM3() {
  const {result: r} = await api('/api/calc/graph', {remove: m3.block ? [m3.block] : [], from: m3.from, to: m3.to});
  const W = r.reach_after, nodes = W.nodes, steps = W.steps, n = nodes.length;
  const p = r.pair; const blocked = m3.block && STATE.corridors.find(c => c.id === m3.block);
  let html = line('Relation R = "directly linked" on V', `|V| = ${n}, direct links = ${r.after.edges}${blocked ? ` (after removing ${esc(blocked.name.split(' (')[0])})` : ''}`,
    `W₀ has ${countOnes(steps[0].matrix)} ones (${n} reflexive + ${2 * r.after.edges} symmetric pairs)`);
  const added = steps.slice(1).map((s, k) => `k=${k + 1} via ${esc(word(s.via))}: +${countOnes(s.matrix) - countOnes(steps[k].matrix)}`);
  html += line('Apply Warshall: one intermediate vertex per stage', added.join('<br>'));
  html += line('Result', `R* has ${W.reachable_pairs} of ${n * n} possible pairs`);
  html += line('Look up your pair', `R*[${esc(word(p.from))}][${esc(word(p.to))}] = <span class="${p.reachable ? 'ok' : 'no'}">${p.reachable ? 1 : 0}</span>`);
  if (p.path) html += line('A shortest chain of corridors (BFS)', p.path.map(x => esc(word(x))).join(' → ') + `  (${p.path.length - 1} link${p.path.length === 2 ? '' : 's'})`);
  $('#m3Working').innerHTML = html;
  const same = p.from === p.to;
  $('#m3Answer').innerHTML = answer(
    same ? 'Same reserve' : p.reachable ? 'Yes, still reachable' : 'No, cut off',
    same ? 'Pick two different reserves.' : p.reachable ? `${esc(word(p.from))} → ${esc(word(p.to))} through ${p.path.length - 1} corridor link(s).` : `There is no chain of active corridors from ${esc(word(p.from))} to ${esc(word(p.to))}.`,
    blocked ? (p.reachable ? `<b>Blocking ${esc(blocked.name)}</b> does not separate this pair. A report on it is lower priority for this route.`
                            : `<b>Blocking ${esc(blocked.name)}</b> separates these reserves. Reports on this link should be verified first.`)
            : 'Choose a corridor to block to test what an obstruction would do to this route.',
    !p.reachable && !same);
  $('#m3Matrix').innerHTML = matrixHTML(nodes, W.matrix, {base: steps[0].matrix, target: [p.from, p.to]}) +
    `<div class="legend-row"><span><i style="background:#eef6d2;border:1px solid #d5e7a6"></i>1 in W₀ (direct link or itself)</span><span><i style="background:#e39a2f"></i>1 added by transitivity</span><span><i style="border:3px solid #133221"></i>your pair</span></div>`;
  $('#m3Stages').innerHTML = steps.map((s, k) => `<details class="stage"><summary>${k === 0 ? 'W₀ · initial relation' : `W${toSub(k)} · allow ${esc(word(s.via))} as a stop`}<span class="chip">${countOnes(s.matrix)} ones</span></summary><div class="matrix-wrap">${matrixHTML(nodes, s.matrix, {prev: k ? steps[k - 1].matrix : null})}</div></details>`).join('');
}
const toSub = k => String(k).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[d]).join('');
['#m3From', '#m3To', '#m3Block'].forEach(s => $(s).addEventListener('change', () => {
  m3.from = $('#m3From').value; m3.to = $('#m3To').value; m3.block = $('#m3Block').value; calcM3();
}));

/* ------------------------------------------------------------------ M4 POSETS */
const EV = [['locality', 'L', 'Locality', 'place name'], ['observed_at', 'T', 'Observation time', 'when it was seen'],
            ['coordinates', 'G', 'GPS coordinates', 'exact position'], ['evidence_ref', 'P', 'Photo / evidence ref', 'proof attached']];
const LET = Object.fromEntries(EV.map(e => [e[0], e[1]]));
const m4 = {present: new Set(['locality', 'observed_at']), report: ''};
function renderM4() {
  fillSelect($('#m4Report'), reportOptions('Custom set (no report)'), m4.report);
  $('#m4Checks').innerHTML = EV.map(([k, L, name, d]) => `<label class="check"><input type="checkbox" data-k="${k}" ${m4.present.has(k) ? 'checked' : ''}><span class="letter">${L}</span><span>${name}<small>${d}</small></span></label>`).join('');
  calcM4();
}
const setStr = arr => arr.length ? `{${arr.map(f => LET[f]).join(', ')}}` : '∅';
async function calcM4() {
  const {result: r} = await api('/api/calc/evidence', {present: [...m4.present]});
  const S = setStr(r.present), M = setStr(r.missing);
  let html = line('Universe of evidence', 'E = {L, T, G, P},  |P(E)| = 2⁴ = 16 sets');
  html += line('Your report’s set', `S = ${S},  |S| = ${r.rank}`);
  html += line('Place S in the order', `S ⊆ E <span class="ok">✓</span> → S is on level ${r.rank}`, `level sizes C(4,k) = ${r.level_sizes.join(', ')}  (sum 16)`);
  html += line('Missing evidence', `E \\ S = <span class="hl">${M}</span>`);
  html += line('Join with what is missing', `S ∨ (E \\ S) = S ∪ ${M} = E  (the top element)`);
  html += line('How far from complete', `sets above S: 2^(4−${r.rank}) = ${r.supersets}`, `shortest chain to E: ${r.chain_to_top.map(setStr).join(' ⊂ ')}  (${r.missing.length} step${r.missing.length === 1 ? '' : 's'})`);
  $('#m4Working').innerHTML = html;
  const names = Object.fromEntries(EV.map(e => [e[0], e[2].toLowerCase()]));
  $('#m4Answer').innerHTML = answer(
    r.is_top ? 'Complete: S = E' : `${r.rank} of 4 fields · ${r.missing.length} missing`,
    r.is_top ? 'The report is the top element of the lattice.' : `Missing: ${r.missing.map(f => names[f]).join(', ')}.`,
    r.is_top ? '<b>Fully documented.</b> The report can be judged on its facts.'
             : `<b>Next step for the field team:</b> collect ${r.missing.map(f => names[f]).join(', then ')}. Each collected field moves S one level up the Hasse diagram. Completeness shows documentation, not danger.`,
    !r.is_top);
  drawHasse(r);
}
function drawHasse(r) {
  const letters = ['L', 'T', 'G', 'P'], fields = EV.map(e => e[0]);
  const combos = k => { const out = []; const rec = (s, i) => { if (s.length === k) { out.push(s); return; } for (let j = i; j < 4; j++) rec([...s, j], j + 1); }; rec([], 0); return out; };
  const levels = [0, 1, 2, 3, 4].map(combos);
  const key = idx => idx.join('');
  const W = 1000, pos = {};
  levels.forEach((lv, k) => lv.forEach((s, i) => { pos[key(s)] = [(i + 1) * W / (lv.length + 1), 430 - k * 100]; }));
  const Sidx = r.present.map(f => fields.indexOf(f)).sort();
  const chain = r.chain_to_top.map(c => key(c.map(f => fields.indexOf(f)).sort()));
  const onChain = new Set(chain);
  let edges = '', nodes = '';
  levels.forEach((lv, k) => { if (k === 4) return; lv.forEach(a => levels[k + 1].forEach(b => {
    if (!a.every(x => b.includes(x))) return;
    const ka = key(a), kb = key(b), hot = onChain.has(ka) && onChain.has(kb) && chain.indexOf(kb) === chain.indexOf(ka) + 1;
    const [x1, y1] = pos[ka], [x2, y2] = pos[kb];
    edges += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${hot ? '#2b5f41' : '#e2dccb'}" stroke-width="${hot ? 5 : 2}"/>`;
  })); });
  levels.forEach(lv => lv.forEach(s => {
    const k = key(s), [x, y] = pos[k];
    const label = s.length === 0 ? '∅' : s.length === 4 ? 'E' : s.map(i => letters[i]).join('');
    const isS = k === key(Sidx), hot = onChain.has(k);
    const fill = isS ? '#e39a2f' : hot ? '#2b5f41' : '#fffdf8';
    const tc = isS ? '#1d1204' : hot ? '#ffffff' : '#34463a';
    nodes += `<rect x="${x - 44}" y="${y - 22}" width="88" height="44" rx="12" fill="${fill}" stroke="${isS ? '#b86f10' : hot ? '#133221' : '#cbc3ad'}" stroke-width="2"/>`;
    nodes += `<text x="${x}" y="${y + 7}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="19" font-weight="700" fill="${tc}">${label}</text>`;
  }));
  $('#m4Hasse').innerHTML = edges + nodes;
}
$('#m4Checks').addEventListener('change', e => {
  const k = e.target.dataset.k; if (!k) return;
  e.target.checked ? m4.present.add(k) : m4.present.delete(k); m4.report = ''; $('#m4Report').value = ''; calcM4();
});
$('#m4Report').addEventListener('change', e => {
  m4.report = e.target.value; const r = reportById(m4.report);
  if (r) m4.present = new Set(r.triage.evidence_present); renderM4();
});

/* ------------------------------------------------------------------ M5 PIGEONHOLE */
const m5 = {touched: false};
function renderM5() {
  if (!m5.touched) { $('#m5n').value = STATE.summary.pending; $('#m5m').value = STATE.summary.teams_available; }
  $('#m5Teams').innerHTML = STATE.teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => `
    <div class="toggle-row"><div><b>${esc(t.name)}</b><small>${t.available ? 'Available · in the codomain' : 'Unavailable'}</small></div>
    <button class="switch" role="switch" aria-checked="${!!t.available}" data-team="${t.id}" aria-label="${esc(t.name)} available"></button></div>`).join('');
  calcM5();
}
async function calcM5() {
  const n = +$('#m5n').value || 0, m = +$('#m5m').value || 0;
  let r; try { r = (await api('/api/calc/pigeonhole', {n, m})).result; } catch (e) { toast(e.message, true); return; }
  if (r.bound === null) {
    $('#m5Working').innerHTML = line('Codomain is empty', `|Teams| = 0 → no function Reports → Teams exists`);
    $('#m5Answer').innerHTML = answer('No team available', '', 'Make at least one team available.', true);
    $('#m5Bars').innerHTML = '<p class="empty">No available teams.</p>'; return;
  }
  const exact = m ? (n / m) : 0;
  let html = line('Domain and codomain', `|Reports| = n = ${n},  |Teams| = m = ${m}`);
  html += line('Pigeonhole bound', `⌈n / m⌉ = ⌈${n} / ${m}⌉ = ⌈${+exact.toFixed(2)}⌉ = <span class="hl">${r.bound}</span>`);
  html += line('Division with remainder', `n = q·m + r → ${n} = ${r.quotient}·${m} + ${r.remainder}`,
    `${r.remainder} team(s) get ${r.quotient + 1}, ${m - r.remainder} team(s) get ${r.quotient} → best split [${r.balanced_loads.join(', ')}]`);
  html += line('Can f be one-to-one?', `n ≤ m → ${n} ≤ ${m} ${r.injective_possible ? '<span class="ok">✓ yes</span>' : '<span class="no">✗ no</span>, some team must take 2 or more'}`);
  html += line('Can f be onto?', `n ≥ m → ${n} ≥ ${m} ${r.surjective_possible ? '<span class="ok">✓ every team can get work</span>' : '<span class="no">✗ some team will be idle</span>'}`);
  $('#m5Working').innerHTML = html;
  $('#m5Answer').innerHTML = answer(`Busiest team ≥ ${r.bound} report${r.bound === 1 ? '' : 's'}`,
    `No assignment of ${n} reports to ${m} teams can do better than ${r.bound}.`,
    `<b>Use:</b> each team verifies one report per joint checkpoint (every L = ${STATE.board.lcm} min, Module 2). So the queue needs at least ⌈n/m⌉ × L = ${r.bound} × ${STATE.board.lcm} = ${r.bound * STATE.board.lcm} min. To finish sooner, make another team available: ⌈${n}/${m + 1}⌉ = ${Math.ceil(n / (m + 1))} checkpoint(s).`, r.bound > 2);
  const live = n === STATE.summary.pending && m === STATE.summary.teams_available;
  const max = Math.max(...r.balanced_loads, 1);
  if (live && n) {
    $('#m5VisualTitle').textContent = 'The function f : Reports → Teams (live data)';
    const byTeam = {}; STATE.board.rows.forEach(a => { (byTeam[a.team] = byTeam[a.team] || []).push(a.id); });
    const urgent = new Set(STATE.board.rows.filter(x => x.U).map(x => x.id));
    const loads = Object.entries(STATE.board.loads); const top = Math.max(...loads.map(l => l[1]));
    $('#m5Bars').innerHTML = loads.map(([t, c]) => `<div class="bar-row"><b>${esc(t)}</b><div class="bar-track">${(byTeam[t] || []).map(id => `<span class="bar-unit${urgent.has(id) ? ' urgent' : ''}" title="${esc(id)}">${esc(id.slice(-4))}</span>`).join('')}</div><span class="count${c === top ? ' max' : ''}">${c}</span></div>`).join('');
  } else {
    $('#m5VisualTitle').textContent = `Best possible split of ${n} reports over ${m} teams`;
    $('#m5Bars').innerHTML = r.balanced_loads.slice(0, 12).map((c, i) => `<div class="bar-row"><b>Team ${i + 1}</b><div class="bar-track">${'<span class="bar-unit"></span>'.repeat(Math.min(c, 30))}</div><span class="count${c === max ? ' max' : ''}">${c}</span></div>`).join('') + (m > 12 ? `<p class="hint">… and ${m - 12} more teams</p>` : '');
  }
}
['#m5n', '#m5m'].forEach(s => $(s).addEventListener('input', () => { m5.touched = true; calcM5(); }));
$('#m5Live').addEventListener('click', () => { m5.touched = false; renderM5(); });

/* ------------------------------------------------------------------ M6 GRAPHS */
const m6 = {removed: new Set()};
function renderM6() {
  const active = STATE.corridors.filter(c => c.active);
  [...m6.removed].forEach(id => { if (!active.some(c => c.id === id)) m6.removed.delete(id); });
  if (!m6.init) { const s2 = active.find(c => c.id === 'NIL-S04') || active[0]; if (s2) m6.removed.add(s2.id); m6.init = true; }
  $('#m6Edges').innerHTML = active.map(c => `<div class="toggle-row"><div><b>${esc(c.name)}</b><small>${esc(word(c.a))} — ${esc(word(c.b))}</small></div>
    <button class="switch danger" role="switch" aria-checked="${m6.removed.has(c.id)}" data-remove="${c.id}" aria-label="Remove ${esc(c.name)}"></button></div>`).join('') || '<p class="empty">No active corridors.</p>';
  const before = STATE.graph.before.component_count;
  $('#m6BridgeTable').innerHTML = `<table class="data-table"><thead><tr><th>Corridor e</th><th>Joins</th><th>c(G)</th><th>c(G − e)</th><th>Bridge?</th><th>Cut off</th></tr></thead><tbody>${
    STATE.edge_tests.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(word(t.a))} — ${esc(word(t.b))}</td><td class="mono">${before}</td><td class="mono">${t.components_after}</td><td>${t.disconnects_network ? '<span class="chip bad">Bridge</span>' : '<span class="chip good">Not a bridge</span>'}</td><td>${t.newly_isolated.map(word).join(', ') || '—'}</td></tr>`).join('')}</tbody></table>`;
  calcM6();
}
async function calcM6() {
  const {result: r} = await api('/api/calc/graph', {remove: [...m6.removed]});
  const b = r.before, a = r.after;
  const degs = Object.entries(b.degrees).sort((x, y) => y[1] - x[1]);
  const tree = b.component_count === 1 && b.edges === b.vertices - 1;
  let html = line('The graph G = (V, E)', `|V| = ${b.vertices},  |E| = ${b.edges},  c(G) = ${b.component_count}`);
  html += line('Degree of each reserve', degs.map(([n, d]) => `deg(${esc(word(n))}) = ${d}`).join(',  '));
  html += line('Handshaking lemma', `Σ deg(v) = ${degs.map(d => d[1]).join(' + ')} = ${b.degree_sum} = 2 × ${b.edges} <span class="ok">✓</span>`);
  html += line('Is G a tree?', tree ? `connected and |E| = |V| − 1 → ${b.edges} = ${b.vertices} − 1 <span class="ok">✓</span> → every edge is a bridge`
                                     : `|E| = ${b.edges}, |V| − 1 = ${b.vertices - 1} → ${b.edges >= b.vertices ? 'G has a cycle, so some edges are not bridges' : 'G is not connected'}`);
  if (r.removed.length) {
    html += line(`Remove ${r.removed.length} edge${r.removed.length > 1 ? 's' : ''}: G − e`, `|E| = ${a.edges},  Σ deg = ${a.degree_sum} = 2 × ${a.edges}`,
      `c(G − e) = ${a.component_count} ${a.component_count > b.component_count ? '&gt;' : '='} c(G) = ${b.component_count}`);
    html += line('Components of G − e', a.components.map(c => `{${c.map(word).join(', ')}}`).join('<br>'));
  }
  $('#m6Working').innerHTML = html;
  const names = r.removed.map(id => (STATE.corridors.find(c => c.id === id) || {}).name).join(' and ');
  $('#m6Answer').innerHTML = !r.removed.length
    ? answer(`${STATE.summary.bridges} of ${b.edges} corridors are bridges`, 'Switch on a corridor to remove it and test it.', 'The bridge table below tests every corridor one at a time.', STATE.summary.bridges > 0)
    : answer(r.disconnects ? `Network splits into ${a.component_count} parts` : 'Network stays connected',
      `After removing ${esc(names)}.`,
      r.disconnects ? `<b>Cut off:</b> ${a.components.slice(1).map(c => c.map(word).join(', ')).join(' | ')} can no longer be reached from ${esc(word(a.components[0][0]))}. A report on this corridor gets top verification priority.`
                    : '<b>Another route exists</b>, so losing this link alone does not isolate any reserve.', r.disconnects);
  drawGraph($('#m6Graph'), {removed: new Set(r.removed), components: a.components});
}
$('#m6Edges').addEventListener('click', e => {
  const s = e.target.closest('[data-remove]'); if (!s) return;
  const id = s.dataset.remove; m6.removed.has(id) ? m6.removed.delete(id) : m6.removed.add(id);
  s.setAttribute('aria-checked', m6.removed.has(id)); calcM6();
});

/* ------------------------------------------------------------------ M7 HAMMING */
const m7 = {d: [1, 0, 1, 1], flips: new Set([6]), report: ''};
const ROLES = ['p₁', 'p₂', 'd₁', 'p₄', 'd₂', 'd₃', 'd₄'];
function renderM7() {
  fillSelect($('#m7Report'), reportOptions('Custom bits (no report)'), m7.report);
  $('#m7Data').innerHTML = LOGIC.map(([k, L, name], i) => `<button class="bool${m7.d[i] ? ' on' : ''}" data-i="${i}" type="button"><span class="bit">${m7.d[i]}</span><span><b>d${'₁₂₃₄'[i]} = ${L}</b><small>${name}</small></span></button>`).join('');
  calcM7();
}
async function calcM7() {
  const bits = m7.d.join('');
  const enc = await api('/api/hamming', {bits});
  const code = enc.result.code;
  const received = code.split('').map((c, i) => m7.flips.has(i + 1) ? (c === '0' ? '1' : '0') : c).join('');
  const chk = (await api('/api/hamming', {mode: 'check', code: received})).result;
  const g = enc.group;
  $('#m7Axioms').innerHTML = [
    `Closure: a ⊕ b ∈ {0, 1} ${g.closed ? '' : '✗'}`, `Associative: (a⊕b)⊕c = a⊕(b⊕c)`,
    `Identity: ${g.identity}`, `Inverse: each element is its own (1⊕1 = 0)`, `Commutative → abelian group`].map(x => `<li>${x}</li>`).join('');
  const recHTML = received.split('').map((c, i) => m7.flips.has(i + 1) ? `<span class="hl">${c}</span>` : c).join('');
  let html = line('Data bits from the report', `d₁d₂d₃d₄ = V R S O = ${bits}`);
  enc.result.parity.forEach(p => { html += line(`Parity ${p.name} (covers positions ${p.covers.join(', ')})`, `${p.expr} = ${p.value}`); });
  html += line('Codeword sent (positions 1–7)', `${code}`);
  html += line('Codeword received', recHTML + (m7.flips.size ? `  (${m7.flips.size} bit${m7.flips.size > 1 ? 's' : ''} flipped in transit)` : '  (no noise)'));
  html += line('Syndrome at base camp', ...chk.syndrome_bits.map(s => `${s.name} = ${s.expr} = ${s.value}`));
  const [s1, s2, s4] = chk.syndrome_bits.map(s => s.value);
  html += line('Error position', `s₁ + 2·s₂ + 4·s₄ = ${s1} + ${2 * s2} + ${4 * s4} = <span class="hl">${chk.syndrome}</span>${chk.syndrome ? ` → flip bit ${chk.syndrome}` : ' → no error'}`);
  html += line('Decoded data', `positions 3, 5, 6, 7 → ${chk.decoded_data} ${chk.decoded_data === bits ? '<span class="ok">✓ matches what was sent</span>' : '<span class="no">✗ does not match</span>'}`);
  $('#m7Working').innerHTML = html;
  const ok = chk.decoded_data === bits;
  const flips = m7.flips.size;
  $('#m7Answer').innerHTML = answer(
    flips === 0 ? 'Received correctly' : ok ? `Bit ${chk.syndrome} was corrupted → fixed` : 'Too many errors',
    ok ? `Base camp reads V R S O = ${chk.decoded_data}: U = ${[...chk.decoded_data].every(c => c === '1') ? 1 : 0}.` : `${flips} bits flipped; Hamming (7,4) only guarantees correction of 1.`,
    ok ? '<b>Use:</b> the urgent/not-urgent decision from Module 1 survives a noisy radio or SMS link, so a corrupted bit cannot silently turn an urgent report into a routine one.'
       : '<b>Use:</b> with 2 or more errors the decoder "corrects" the wrong bit. Ask the field team to resend.', !ok);
  $('#m7Bits').innerHTML = received.split('').map((c, i) => {
    const pos = i + 1, isP = [1, 2, 4].includes(pos);
    const cls = ['bitcell', isP ? 'parity' : 'data', m7.flips.has(pos) ? 'flipped' : '', ok && chk.syndrome === pos ? 'fixed' : ''].join(' ');
    return `<button class="${cls}" data-pos="${pos}" type="button"><span class="pos">pos ${pos}</span><span class="val">${c}</span><span class="role">${ROLES[i]}</span></button>`;
  }).join('');
}
$('#m7Data').addEventListener('click', e => { const b = e.target.closest('.bool'); if (!b) return; m7.d[+b.dataset.i] ^= 1; m7.report = ''; renderM7(); });
$('#m7Report').addEventListener('change', e => { m7.report = e.target.value; const r = reportById(m7.report); if (r) { const x = bitsFromReport(r); m7.d = [x.v, x.r, x.s, x.o]; } renderM7(); });
$('#m7Bits').addEventListener('click', e => { const b = e.target.closest('[data-pos]'); if (!b) return; const p = +b.dataset.pos; m7.flips.has(p) ? m7.flips.delete(p) : m7.flips.add(p); calcM7(); });
$('#m7Clear').addEventListener('click', () => { m7.flips.clear(); calcM7(); });

/* ------------------------------------------------------------------ FIELD DATA */
let EVENTS = [];
function renderData() {
  fillSelect($('#fCorridor'), STATE.corridors.map(c => ({value: c.id, label: c.name})));
  if (!$('#fTime').value) { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); $('#fTime').value = d.toISOString().slice(0, 16); }
  const sites = STATE.sites.map(n => ({value: n, label: short(n)}));
  fillSelect($('#linkA'), sites); fillSelect($('#linkB'), sites, $('#linkB').value || STATE.sites[2]);
  const rows = STATE.reports;
  $('#reportTable').innerHTML = rows.length ? `<table class="data-table"><thead><tr><th>Report</th><th>Corridor · locality</th><th>Severity</th><th>V R S O</th><th>Evidence</th><th>Decision</th><th>Verified</th><th>Status</th><th></th></tr></thead><tbody>${
    rows.map(r => { const t = r.triage; const bits = [t.verified, t.recent, t.high_severity, t.open_status].map(B).join(' ');
      const chip = t.urgent_review ? 'bad' : t.open_status ? 'warn' : 'good';
      return `<tr><td class="mono"><b>${esc(r.id)}</b>${r.simulated ? ' <span class="chip">demo</span>' : ''}</td>
        <td>${esc(r.corridor_name)}<br><small class="hint">${esc(r.locality)}</small></td><td>${esc(r.severity)}</td>
        <td class="bits-inline">${bits}</td><td class="mono">${t.evidence_count}/4 ${setStr(t.evidence_present)}</td>
        <td><span class="chip ${chip}">${esc(t.priority_label)}</span></td>
        <td><button class="switch" role="switch" aria-checked="${!!r.verified}" data-verify="${esc(r.id)}" aria-label="Verified"></button></td>
        <td><select class="status-select" data-status="${esc(r.id)}">${['Open', 'In review', 'Resolved', 'Closed'].map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><button class="icon-btn" data-del="${esc(r.id)}" title="Delete report" aria-label="Delete report">✕</button></td></tr>`; }).join('')}</tbody></table>`
    : '<p class="empty">No reports yet. Log one above or press Step in the demo scenario.</p>';
  $('#linkList').innerHTML = STATE.corridors.map(c => `<div class="toggle-row"><div><b>${esc(c.name)}</b><small>${esc(word(c.a))} — ${esc(word(c.b))}${c.source_type === 'official_baseline' ? ` · MoEFCC 2023 p.${c.source_page}` : ' · hypothetical'}</small></div>
    <button class="switch" role="switch" aria-checked="${!!c.active}" data-link="${esc(c.id)}" aria-label="${esc(c.name)} active"></button></div>`).join('');
  $('#teamList').innerHTML = STATE.teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => `<div class="toggle-row"><div><b>${esc(t.name)}</b><small>${t.available ? 'Available' : 'Unavailable'}</small></div>
    <button class="switch" role="switch" aria-checked="${!!t.available}" data-team="${t.id}" aria-label="${esc(t.name)} available"></button></div>`).join('');
  renderSim();
}
function renderSim() {
  const i = store.get('simIndex', 0);
  $('#simSteps').innerHTML = EVENTS.map((_, k) => `<i class="${k < i ? 'done' : ''}"></i>`).join('');
  $('#simStep').disabled = $('#simPlay').disabled = i >= EVENTS.length;
}
$('#reportForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = new FormData(e.target); const d = Object.fromEntries(f.entries());
  d.verified = f.has('verified');
  try { const r = await api('/api/reports', d); e.target.reset(); $('#fTime').value = ''; setState(r); toast(`Saved ${r.id}. All modules updated.`); }
  catch (err) { toast(err.message, true); }
});
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-verify],[data-link],[data-team],[data-del]'); if (!t) return;
  try {
    if (t.dataset.verify) setState(await api('/api/reports/' + t.dataset.verify, {verified: t.getAttribute('aria-checked') !== 'true'}, 'PATCH'));
    else if (t.dataset.link) setState(await api('/api/links/' + t.dataset.link, {active: t.getAttribute('aria-checked') !== 'true'}, 'PATCH'));
    else if (t.dataset.team) { setState(await api('/api/teams/' + t.dataset.team, {available: t.getAttribute('aria-checked') !== 'true'}, 'PATCH')); }
    else if (t.dataset.del) { setState(await api('/api/reports/' + t.dataset.del, {}, 'DELETE')); toast('Report deleted.'); }
  } catch (err) { toast(err.message, true); }
});
document.addEventListener('change', async e => {
  const s = e.target.closest('[data-status]'); if (!s) return;
  try { setState(await api('/api/reports/' + s.dataset.status, {status: s.value}, 'PATCH')); } catch (err) { toast(err.message, true); }
});
$('#linkForm').addEventListener('submit', async e => {
  e.preventDefault();
  try { setState(await api('/api/links', {a: $('#linkA').value, b: $('#linkB').value})); toast('Hypothetical link added.'); }
  catch (err) { toast(err.message, true); }
});
async function simStep() {
  const i = store.get('simIndex', 0); if (i >= EVENTS.length) return false;
  try {
    const d = await api('/api/simulation/step', {index: i});
    store.set('simIndex', i + 1); $('#simNow').innerHTML = `<b>Step ${i + 1} of ${EVENTS.length}.</b> ${esc(d.text)}`; setState(d); return true;
  } catch (err) { $('#simNow').textContent = err.message; return false; }
}
$('#simStep').addEventListener('click', simStep);
$('#simPlay').addEventListener('click', async () => { while (await simStep()) await new Promise(r => setTimeout(r, 900)); });
$('#simReset').addEventListener('click', async () => {
  setState(await api('/api/simulation/reset', {})); store.set('simIndex', 0);
  $('#simNow').textContent = 'Reset. Demo reports removed and all official links restored. Your own reports are kept.'; renderSim();
});

/* ------------------------------------------------------------------ boot */
(async () => {
  try {
    EVENTS = (await api('/api/simulation/events')).events;
    await refresh();
    if (!STATE.reports.some(r => r.simulated)) store.set('simIndex', 0);
    route();
  } catch (err) { toast('Could not reach the WildGuard server: ' + err.message, true); }
})();


/* ------------------------------------------------------------------ APPLIED: the modules working on the live queue */
const EVNAME = {locality: 'locality', observed_at: 'time', coordinates: 'GPS', evidence_ref: 'photo'};
const tbl = (head, rows) => `<table class="data-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
const repCell = x => `<td><b class="mono">${esc(x.id)}</b><span class="sub">${esc(x.locality)}</span></td>`;
const corCell = x => `<td>${esc(x.corridor_name)}</td>`;
const emptyQueue = '<p class="empty">No pending reports. Go to <a href="#data">Field data</a> and press <b>Play all</b> to load the demo queue, or log your own report.</p>';
const cutText = x => x.cut_pairs.length ? x.cut_pairs.slice(0, 3).map(p => `${word(p[0])}–${word(p[1])}`).join(', ') + (x.cut_pairs.length > 3 ? ` +${x.cut_pairs.length - 3} more` : '') : '—';

function renderApplied() {
  if (!STATE) return;
  const b = STATE.board, R = b.rows;
  if (VIEW === 'home') return renderDecision();
  const el = $('#' + VIEW + 'Applied'); if (!el) return;
  if (!R.length) { el.innerHTML = emptyQueue; return; }
  const H = {
    m1: () => tbl(['Rank', 'Report', 'V R S O', 'U = V∧R∧S∧O', 'Why'], R.map(x => `<tr><td><span class="rank">${x.rank}</span></td>${repCell(x)}<td class="bits-inline">${x.bits.split('').join(' ')}</td><td class="mono"><b>${x.bits.split('').join(' ∧ ')} = ${x.U}</b></td><td>${x.U ? '<span class="chip bad">Urgent: handled first</span>' : `<span class="chip warn">Waits: ${esc(x.blocking.join(', '))}</span>`}</td></tr>`)),
    m2: () => `<p class="applied-role" style="background:var(--lime-soft)"><b>Queue cleared by ${esc(b.queue_clear_at || '—')}</b> = shift start ${esc(b.shift_start)} + ⌈n/m⌉ × lcm = ${esc(b.shift_start)} + ${b.pigeonhole_bound} × ${b.lcm} min. Intervals used: ${b.intervals.join(', ')} min.</p><div class="slot-list">${
      b.checkpoints.map((c, k) => `<div class="slot"><div><b>${esc(c)}</b><small>checkpoint ${k + 1} = ${esc(b.shift_start)} + ${k + 1}×${b.lcm}</small></div><div>${R.filter(x => x.slot === k + 1).map(x => `<span class="chip ${x.U ? 'bad' : 'good'}" style="margin:3px">${esc(x.team)} verifies ${esc(x.id)}</span>`).join('') || '—'}</div></div>`).join('')}</div>`,
    m3: () => tbl(['Report', 'Corridor e', 'Reachable pairs in G', 'in G − e', 'Pairs lost', 'Routes cut'], R.map(x => { const i = b.impacts[x.corridor_id];
      return `<tr>${repCell(x)}${corCell(x)}<td class="mono">${i.pairs_with}</td><td class="mono">${i.pairs_without}</td><td class="mono"><b>${i.pairs_with} − ${i.pairs_without} = ${x.pairs_lost}</b></td><td>${esc(cutText(x))}</td></tr>`; })),
    m4: () => tbl(['Report', 'Evidence set S', 'Level |S|', 'Missing E \\ S', 'Team collects next'], R.map(x => {
      const present = Object.keys(LET).filter(f => !x.evidence_missing.includes(f));
      return `<tr>${repCell(x)}<td class="mono">${setStr(present)}</td><td class="mono">${x.evidence_rank} / 4</td><td class="mono">${setStr(x.evidence_missing)}</td><td>${x.next_evidence ? `<span class="chip warn">${EVNAME[x.next_evidence]} (${esc(x.team || 'no team')} at ${esc(x.verify_at || '—')})</span>` : '<span class="chip good">Complete</span>'}</td></tr>`; })),
    m5: () => `<p class="applied-role" style="background:var(--lime-soft)">n = ${b.n} pending, m = ${b.m} teams → ⌈${b.n}/${b.m || 1}⌉ = <b>${b.pigeonhole_bound}</b>. Actual busiest load = ${Math.max(0, ...Object.values(b.loads))}, which meets the bound, so this assignment is optimal.</p>` +
      tbl(['Rank', 'Report x', 'f(x) = team', 'k-th for this team', 'Verified at'], R.map(x => `<tr><td><span class="rank">${x.rank}</span></td>${repCell(x)}<td><b>${esc(x.team || '—')}</b></td><td class="mono">${x.slot || '—'}</td><td class="mono">${esc(x.verify_at || '—')}</td></tr>`)),
    m6: () => tbl(['Report', 'Corridor e', 'c(G)', 'c(G − e)', 'Bridge?', 'Effect on priority'], R.map(x => { const i = b.impacts[x.corridor_id];
      return `<tr>${repCell(x)}${corCell(x)}<td class="mono">${i.components_with}</td><td class="mono">${i.components_without}</td><td>${i.bridge ? '<span class="chip bad">Bridge</span>' : '<span class="chip good">Has another route</span>'}</td><td>${i.bridge ? 'ranked above non-bridge reports with the same U' : 'ranked lower'}</td></tr>`; })),
    m7: () => tbl(['Report', 'Data d₁d₂d₃d₄ = VRSO', 'Codeword sent p₁p₂d₁p₄d₂d₃d₄', 'Base camp reads U'], R.map(x => `<tr>${repCell(x)}<td class="bits-inline">${x.bits}</td><td class="bits-inline">${x.packet}</td><td>${x.U ? '<span class="chip bad">U = 1 urgent</span>' : '<span class="chip">U = 0</span>'}</td></tr>`)),
  };
  el.innerHTML = H[VIEW]();
}

function renderDecision() {
  const b = STATE.board, R = b.rows;
  $('#decisionSummary').innerHTML = `
    <div><b>${R.filter(x => x.U).length} of ${b.n}</b><span>urgent (U = 1)</span><small>Module 1</small></div>
    <div><b>${R.filter(x => x.bridge).length}</b><span>on bridge corridors</span><small>Module 6</small></div>
    <div><b>⌈${b.n}/${b.m || 1}⌉ = ${b.pigeonhole_bound}</b><span>checkpoints per team (minimum)</span><small>Module 5</small></div>
    <div><b>${esc(b.queue_clear_at || '—')}</b><span>queue cleared (every ${b.lcm} min from ${esc(b.shift_start)})</span><small>Module 2</small></div>`;
  const th = (t, m) => `${t}<span class="mod-tag">${m}</span>`;
  $('#decisionTable').innerHTML = R.length ? tbl([th('Rank', 'M1→M6→M3'), 'Report', th('U', 'Module 1'), th('Bridge', 'Module 6'), th('Pairs lost', 'Module 3'), th('Missing', 'Module 4'), th('Team', 'Module 5'), th('Verify at', 'Module 2'), th('Packet', 'Module 7')],
    R.map(x => `<tr><td><span class="rank">${x.rank}</span></td>${repCell(x)}<td class="mono"><b>${x.U}</b></td><td>${x.bridge ? '<span class="chip bad">yes</span>' : '<span class="chip good">no</span>'}</td><td class="mono">${x.pairs_lost}</td><td class="mono">${setStr(x.evidence_missing)}</td><td>${esc(x.team || '—')}</td><td class="mono">${esc(x.verify_at || '—')}</td><td class="bits-inline">${x.packet}</td></tr>`))
    + `<p class="hint" style="margin-top:14px">Priority rule (lexicographic order): ${esc(b.priority_rule)}.</p>` : emptyQueue;
  renderStory(); renderOrders(); renderImpact(); renderQuiz();
}

function renderStory() {
  const b = STATE.board, c = b.comparison;
  $('#storyLead').innerHTML = b.n
    ? `<b>${b.n} reports</b> came in overnight from villagers, guards and camera traps. There are only <b>${b.m} field teams</b>, and the oldest reports sit at the top of the inbox.`
    : 'Reports come in overnight from villagers, guards and camera traps. There are only a few field teams.';
  $('#storyPunch').innerHTML = c && c.worst_id
    ? `Working through the inbox in order, the most damaging confirmed blockage (<b>${esc(c.worst_place)}</b>, cutting ${STATE.board.rows.find(x => x.id === c.worst_id).pairs_lost} forest routes) gets a team at <b>${esc(c.worst_fcfs)}</b>. With WildGuard's maths, a team is there at <b>${esc(c.worst_wildguard)}</b>, ${c.worst_minutes_earlier} minutes sooner.`
    : 'Load the demo queue (Field data → Play all) to see what the maths changes.';
}

function renderOrders() {
  const R = STATE.board.rows;
  $('#ordersList').innerHTML = R.length ? R.map(x => { const p = x.plan || {};
    return `<article class="order${x.U ? ' urgent' : ''}"><div class="order-head"><b>${esc(p.time || '—')}</b><span>${esc(p.team || 'No team')} · #${x.rank}</span></div>
      <div class="order-body"><div class="place">${esc(p.place)}</div><div class="hint">${esc(p.corridor)}</div>
      <div class="act">→ ${esc(p.action)}</div><ul>${(p.why || []).map(w => `<li>${esc(w)}</li>`).join('')}</ul>
      ${p.bring_back && p.bring_back.length ? `<div class="bring">Bring back: ${esc(p.bring_back.join(', '))}</div>` : '<div class="bring" style="color:var(--leaf)">Evidence complete</div>'}
      <div class="hint">Status packet sent to base: <span class="bits-inline">${esc(p.message)}</span></div>
      <div class="order-actions"><button class="btn btn-line btn-sm" type="button" data-copy="${esc(x.id)}">Copy order</button><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(orderText(x))}">Send on WhatsApp</a></div></div></article>`; }).join('') : emptyQueue;
}

function renderImpact() {
  const c = STATE.board.comparison, el = $('#impact');
  if (!c) { el.innerHTML = emptyQueue; return; }
  const ff = c.fcfs, wg = c.wildguard, max = Math.max(ff.exposure, wg.exposure, 1);
  const col = (cls, title, sub, d, last) => `<div class="impact-col ${cls}"><h3>${title}</h3><p class="sub">${sub}</p>
    <div class="metric"><span>All confirmed blockages checked by</span><b>${esc(last)}</b></div>
    <div class="metric"><span>Average wait for a confirmed blockage</span><b>${d.avg_urgent_wait_h} h</b></div>
    <div class="metric"><span>Worst blockage (${esc(c.worst_place || '')}) reached after</span><b>${d.worst_wait_h} h</b></div>
    <div class="metric"><span>Route-hours cut off (confirmed blockages)</span><b>${d.exposure}</b></div></div>`;
  el.innerHTML = `<div class="impact-grid">${col('ff', 'Without WildGuard', 'First come, first served: oldest report first', ff, c.urgent_last_fcfs)}${col('wg', 'With WildGuard', 'Order from Modules 1, 6 and 3; teams from 5; times from 2', wg, c.urgent_last_wildguard)}</div>
    <div class="impact-hero"><b>${c.exposure_reduction_pct}%</b><p>fewer <b>route-hours cut off</b>. Route-hours = Σ (forest-to-forest routes a confirmed blockage cuts × hours until a team reaches it). Each hour a blockage waits, those routes stay closed and herds are pushed toward villages.</p></div>
    <div class="card"><div class="cmp-bars">
      <div class="cmp-row"><b>Without WildGuard</b><div class="cmp-track"><div class="cmp-fill" style="width:${ff.exposure / max * 100}%;background:var(--red)"></div></div><span class="v">${ff.exposure}</span></div>
      <div class="cmp-row"><b>With WildGuard</b><div class="cmp-track"><div class="cmp-fill" style="width:${wg.exposure / max * 100}%;background:var(--leaf)"></div></div><span class="v">${wg.exposure}</span></div>
    </div>
    <div class="table-scroll" style="margin-top:22px">${tbl(['Report', 'Confirmed?', 'Routes cut', 'Without WildGuard → With WildGuard'], c.rows.map(r => `<tr><td><b class="mono">${esc(r.id)}</b><span class="sub">${esc(r.place)}</span></td><td>${r.U ? '<span class="chip bad">yes, U = 1</span>' : '<span class="chip">not yet</span>'}</td><td class="mono">${r.pairs_lost}</td><td class="time-move">${r.fcfs === r.wildguard ? `<span class="new">${esc(r.wildguard)}</span> (same)` : `<span class="old">${esc(r.fcfs)}</span><span class="new">${esc(r.wildguard)}</span>`}</td></tr>`))}</div>
    <p class="hint" style="margin-top:12px">Unconfirmed reports may move later. That is deliberate: a team is not sent to a rumour while a confirmed blockage waits.</p></div>`;
}


/* ------------------------------------------------------------------ ORDERS → message text */
function orderText(x) {
  const p = x.plan || {};
  return `WildGuard order #${x.rank} · ${p.team || 'No team'} · ${p.time || '-'}\nGo to: ${p.place} (${p.corridor})\nDo: ${p.action}\nWhy: ${(p.why || []).join(' ')}\n${p.bring_back && p.bring_back.length ? 'Bring back: ' + p.bring_back.join(', ') : 'Evidence complete'}\nStatus code: ${p.message}`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const x = STATE.board.rows.find(r => r.id === b.dataset.copy); if (!x) return;
  try { await navigator.clipboard.writeText(orderText(x)); toast('Order copied. Paste it into WhatsApp or SMS.'); }
  catch { toast('Copy is blocked in this browser; use the WhatsApp button.', true); }
});

/* ------------------------------------------------------------------ CORRIDOR MAP */
const mapState = {removed: new Set(), activated: new Set(), added: [], prev: null, busy: false};
const MAP_POS = n => { const p = LAYOUT[n] || positions(STATE.sites)[n]; return [p[0] * 1.45 + 40, p[1] * 1.5 + 20]; };
const MAP_LBL = {'Kaniyanpura Reserve Forest': [0, -54, 'middle'], 'Avarahalla Reserve Forest': [-40, 58, 'end']};
const VILLAGES = [['Masinagudi', 655, 372], ['Bokkapuram', 190, 335], ['Mavanallah', 430, 240], ['Mangala', 860, 205]];
function isBlocked(c) { return (!c.active && !mapState.activated.has(c.id)) || mapState.removed.has(c.id); }
function curve(a, b) {
  const [x1, y1] = MAP_POS(a), [x2, y2] = MAP_POS(b);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const cx = mx - (y2 - y1) / len * 38, cy = my + (x2 - x1) / len * 38;
  return {d: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`, at: t => [(1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2]};
}
async function renderMap() {
  if (mapState.busy) return; mapState.busy = true;
  try {
    const d = await api('/api/calc/map', {remove: [...mapState.removed], activate: [...mapState.activated], add: mapState.added});
    drawMap(d); renderMapMaths(d); renderRestore(d);
  } finally { mapState.busy = false; }
}
function drawMap(d) {
  const r = d.result, comp = {};
  r.components.forEach((c, i) => c.forEach(n => comp[n] = i));
  let o = `<defs><radialGradient id="bgGlow" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#1d4630"/><stop offset="1" stop-color="#0b1f14"/></radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter></defs><rect width="1000" height="620" fill="url(#bgGlow)"/>`;
  // terrain contours
  for (let i = 0; i < 7; i++) o += `<path d="M-20,${90 + i * 75} C220,${40 + i * 80} 520,${150 + i * 70} 1020,${70 + i * 78}" fill="none" stroke="rgba(201,227,107,.06)" stroke-width="2"/>`;
  VILLAGES.forEach(([n, x, y]) => { o += `<text x="${x}" y="${y}" font-size="22" text-anchor="middle">🏘️</text><text x="${x}" y="${y + 22}" text-anchor="middle" font-size="15" font-weight="700" fill="#e8c9a0" font-family="Plus Jakarta Sans, sans-serif">${n}</text>`; });
  const all = [...STATE.corridors.map(c => ({...c, proposed: false})), ...mapState.added.map((p, i) => ({id: 'NEW-' + (i + 1), name: 'Proposed restoration', a: p[0], b: p[1], active: 1, proposed: true}))];
  all.forEach(c => {
    if (!LAYOUT[c.a] && !positions(STATE.sites)[c.a]) return;
    const cv = curve(c.a, c.b), blocked = !c.proposed && isBlocked(c);
    const col = c.proposed ? '#ffd54a' : blocked ? '#e05a43' : '#c9e36b';
    const lbl = c.proposed ? 'Restored' : ((c.name.match(/\((Segur \d)\)/) || [])[1] || (c.id === 'NIL-KM' ? 'K–M link' : 'New link'));
    o += `<g class="corr" data-corr="${esc(c.id)}" ${c.proposed ? '' : 'role="button" tabindex="0"'}><path id="cp-${esc(c.id)}" class="corr-hit" d="${cv.d}" fill="none" stroke="transparent" stroke-width="40"/>
      <path d="${cv.d}" fill="none" stroke="${col}" stroke-opacity=".25" stroke-width="22" stroke-linecap="round"/>
      <path d="${cv.d}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" ${blocked || c.proposed ? 'stroke-dasharray="12 10"' : ''}/>`;
    const [lx, ly] = cv.at(0.5);
    o += `<text x="${lx}" y="${ly - 22}" text-anchor="middle" font-size="17" font-weight="800" fill="${col}" paint-order="stroke" stroke="#0f2a1b" stroke-width="6" font-family="Plus Jakarta Sans, sans-serif">${esc(lbl)}</text>`;
    if (blocked) {
      o += `<text x="${lx}" y="${ly + 10}" text-anchor="middle" font-size="30">🚧</text>`;
      const [ex, ey] = cv.at(0.27); o += `<text x="${ex}" y="${ey + 9}" text-anchor="middle" font-size="26">🐘</text><text x="${ex + 16}" y="${ey - 12}" font-size="18" font-weight="900" fill="#ffb36b">!</text>`;
    } else {
      [0, 3].forEach(delay => { o += `<text font-size="26" text-anchor="middle" dominant-baseline="central">🐘<animateMotion dur="7s" begin="${delay}s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear"><mpath href="#cp-${esc(c.id)}"/></animateMotion></text>`; });
    }
    o += `</g>`;
  });
  const multi = r.populations > 1;
  STATE.sites.forEach(n => {
    const [x, y] = MAP_POS(n), col = multi ? COMP_COLORS[comp[n] % COMP_COLORS.length] : '#4e8a4f';
    o += `<circle cx="${x}" cy="${y}" r="58" fill="${col}" opacity=".25" filter="url(#soft)"/><circle cx="${x}" cy="${y}" r="42" fill="#133221" stroke="${col}" stroke-width="5"/>
      <text x="${x}" y="${y + 12}" text-anchor="middle" font-size="34">🌳</text>
      <text x="${x + (MAP_LBL[n] || [0, 66, 'middle'])[0]}" y="${y + (MAP_LBL[n] || [0, 66, 'middle'])[1]}" text-anchor="${(MAP_LBL[n] || [0, 66, 'middle'])[2]}" font-size="20" font-weight="800" fill="#fff" paint-order="stroke" stroke="#0f2a1b" stroke-width="7" font-family="Plus Jakarta Sans, sans-serif">${esc(word(n))}</text>`;
  });
  $('#mapSvg').innerHTML = o;
}
function renderMapMaths(d) {
  const r = d.result, base = d.baseline, prev = mapState.prev;
  const split = r.populations > 1;
  const pc = $('#popCard'); pc.classList.toggle('split', split);
  pc.innerHTML = `<div class="pop-big">${r.populations}</div><div class="pop-label">separate elephant population${r.populations === 1 ? '' : 's'}</div>
    <p>${split ? 'Herds in different groups can no longer meet, share food areas or breed. Over time each small group loses genetic diversity.' : 'Every forest is reachable from every other, so herds can move and mix freely.'}</p>
    <div class="pop-groups">${r.components.map((c, i) => `<div><i style="background:${split ? COMP_COLORS[i % COMP_COLORS.length] : '#4e8a4f'}"></i>${c.map(word).join(', ')}</div>`).join('')}</div>`;
  const lost = base.reachable_pairs - r.reachable_pairs;
  const names = id => (STATE.corridors.find(c => c.id === id) || {}).name || 'Proposed restoration';
  $('#mapWorking').innerHTML =
    line('The network as a graph G = (V, E)', `|V| = ${r.nodes.length} forests,  |E| = ${r.edge_count} open corridors`) +
    line('Populations = connected components (DFS)', `c(G) = <span class="hl">${r.populations}</span>`) +
    line("Forest-to-forest routes still open (Warshall's R*)", `${r.reachable_pairs} of C(${r.nodes.length},2) = ${r.total_pairs} pairs${lost > 0 ? `  → <span class="no">${lost} lost</span>` : ''}`) +
    line('Bridges (c(G − e) > c(G))', `${r.bridge_count} of ${r.edge_count} corridors`, r.bridges.map(id => `• ${esc(names(id))}`).join('<br>') || '—') +
    line('Loops = cycle rank |E| − |V| + c', `${r.edge_count} − ${r.nodes.length} + ${r.populations} = <span class="hl">${r.cycle_rank}</span> ${r.cycle_rank === 0 ? '→ no loops, so every corridor is a single point of failure' : '→ loops give elephants alternative routes'}`) +
    line('Handshaking lemma', `Σ deg(v) = ${r.degree_sum} = 2 × ${r.edge_count} <span class="ok">✓</span>`);
  if (prev && prev.populations !== r.populations) {
    $('#mapEvent').innerHTML = r.populations > prev.populations
      ? `<b>The herd has been split.</b> ${r.components.slice(1).map(c => c.map(word).join(' & ')).join(' | ')} ${r.components.length > 2 ? 'are' : 'is'} now cut off. ${lost} forest-to-forest routes are closed. That corridor was a <b>bridge</b>.`
      : `<b>Reconnected.</b> The populations merge again: ${r.reachable_pairs} of ${r.total_pairs} routes open.`;
  } else if (prev && prev.bridge_count !== r.bridge_count) {
    $('#mapEvent').innerHTML = r.bridge_count < prev.bridge_count ? `<b>Safer network.</b> The new link creates a loop, so bridges drop from ${prev.bridge_count} to ${r.bridge_count}.` : `Bridges: ${prev.bridge_count} → ${r.bridge_count}.`;
  } else if (prev && prev.reachable_pairs !== r.reachable_pairs) {
    $('#mapEvent').innerHTML = `Routes open: ${prev.reachable_pairs} → ${r.reachable_pairs}.`;
  }
  mapState.prev = r;
}
function renderRestore(d) {
  const R = d.restoration, c = R.candidates;
  const isOn = x => mapState.added.some(p => p[0] === x.a && p[1] === x.b);
  $('#restoreTable').innerHTML = c.length ? tbl(['#', 'New corridor u–v', 'Existing path u → v', 'Bridges before → after', 'Populations after', ''], c.map((x, i) => `<tr><td><span class="rank">${i + 1}</span></td>
    <td><b>${esc(word(x.a))} – ${esc(word(x.b))}</b></td><td>${x.path ? `${x.path.map(word).join(' → ')} <span class="sub">${x.path_length} corridors</span>` : '<span class="chip warn">not connected now: reconnects populations</span>'}</td>
    <td class="mono"><b>${x.bridges_before} → ${x.bridges_after}</b></td><td class="mono">${x.populations_after}</td>
    <td><button class="btn ${isOn(x) ? 'btn-amber' : 'btn-line'} btn-sm" type="button" data-preview="${esc(x.a)}|${esc(x.b)}">${isOn(x) ? 'Showing on map' : 'Show on map'}</button></td></tr>`)) + `<p class="hint" style="margin-top:10px">${R.tested} possible new corridors tested. Top ${c.length} shown.</p>` : '<p class="empty">Every pair of forests is already linked.</p>';
  const best = c[0], dia = R.base.diameter;
  $('#restoreAnswer').innerHTML = best ? answer(`Restore ${esc(word(best.a))} – ${esc(word(best.b))}`,
    best.path ? `Bridges drop from ${best.bridges_before} to ${best.bridges_after}: ${best.bridges_before - best.bridges_after} corridors stop being single points of failure.` : `It reunites the split populations (${R.base.populations} → ${best.populations_after}).`,
    `${dia.a && best.path && ((best.a === dia.a && best.b === dia.b) || (best.a === dia.b && best.b === dia.a)) ? `<b>Why this pair?</b> They are the two forests farthest apart: the <b>diameter</b> of the graph, d = ${dia.length} corridors. A new link between them closes the longest possible loop, protecting every corridor on that path. ` : ''}<b>Conservation use:</b> this tells planners where buying or securing land for a restored corridor gives the most protection. The maths gives the shortlist; field surveys decide whether the land can actually be restored.`) : '';
}
$('#mapSvg').addEventListener('click', e => {
  const g = e.target.closest('[data-corr]'); if (!g) return;
  const id = g.dataset.corr; if (id.startsWith('NEW-')) { mapState.added = []; renderMap(); return; }
  const c = STATE.corridors.find(x => x.id === id); if (!c) return;
  if (!c.active) { mapState.activated.has(id) ? mapState.activated.delete(id) : mapState.activated.add(id); }
  else { mapState.removed.has(id) ? mapState.removed.delete(id) : mapState.removed.add(id); }
  renderMap();
});
$('#mapSvg').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.closest('[data-corr]')?.dispatchEvent(new MouseEvent('click', {bubbles: true})); } });
$('#mapReset').addEventListener('click', () => { mapState.removed.clear(); mapState.activated.clear(); mapState.added = []; $('#mapEvent').textContent = 'Showing the saved network.'; renderMap(); });
$('#mapClear').addEventListener('click', () => { mapState.removed.clear(); mapState.added = []; STATE.corridors.forEach(c => { if (!c.active) mapState.activated.add(c.id); }); renderMap(); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-preview]'); if (!b) return;
  const [a, c] = b.dataset.preview.split('|');
  mapState.added = mapState.added.some(p => p[0] === a && p[1] === c) ? [] : [[a, c]];
  renderMap(); $('#mapSvg').scrollIntoView({behavior: 'smooth', block: 'center'});
});

/* ------------------------------------------------------------------ STORM NIGHT (live demo) */
let STORM = null, stormRunning = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function playStorm() {
  if (stormRunning) return; stormRunning = true;
  try {
    if (!STORM) STORM = (await api('/api/simulation/events?scenario=storm')).events;
    const t = $('#ticker'); t.hidden = false; $('#tickerTitle').textContent = '⛈ Storm night: resetting…'; $('#tickerBar').style.width = '0';
    $('#tickerText').textContent = 'Clearing old demo reports and reopening all official corridors.';
    setState(await api('/api/simulation/reset', {})); store.set('simIndex', 0);
    mapState.removed.clear(); mapState.activated.clear(); mapState.added = []; mapState.prev = null;
    for (let i = 0; i < STORM.length; i++) {
      await sleep(1500);
      const d = await api('/api/simulation/step', {index: i, scenario: 'storm'});
      $('#tickerTitle').textContent = `⛈ Storm night · ${i + 1} / ${STORM.length}`;
      $('#tickerBar').style.width = ((i + 1) / STORM.length * 100) + '%';
      $('#tickerText').textContent = d.text; setState(d);
    }
    await sleep(1200);
    const top = STATE.board.rows[0];
    $('#tickerTitle').textContent = '✔ Storm night: list re-sorted';
    $('#tickerText').innerHTML = `First: <b>${esc(top ? top.locality : '-')}</b> at ${esc(top ? top.verify_at : '-')}. The fallen pole is above the fallen tree, the gaur “rumour” is closed, and the 2-day-old WhatsApp forward is last. Scroll the Home page or open the map.`;
  } catch (err) { toast(err.message, true); }
  finally { stormRunning = false; }
}
document.addEventListener('click', e => { if (e.target.closest('[data-storm]')) playStorm(); });
$('#tickerClose').addEventListener('click', () => { $('#ticker').hidden = true; });

/* ------------------------------------------------------------------ QUIZ: lexicographic order */
const SEV = {Low: 1, Medium: 2, High: 3, Critical: 4};
let QUIZ = null;
function newQuiz() {
  const R = STATE.board.rows; if (R.length < 2) { QUIZ = null; return; }
  let i = Math.floor(Math.random() * R.length), j;
  do { j = Math.floor(Math.random() * R.length); } while (j === i);
  QUIZ = {ids: Math.random() < .5 ? [R[i].id, R[j].id] : [R[j].id, R[i].id], answered: null};
}
function renderQuiz() {
  const el = $('#quiz'); if (!el) return;
  const R = STATE.board.rows;
  if (!QUIZ || !QUIZ.ids.every(id => R.some(x => x.id === id))) newQuiz();
  if (!QUIZ) { el.innerHTML = emptyQueue; return; }
  const [A, B] = QUIZ.ids.map(id => R.find(x => x.id === id));
  const winner = A.rank < B.rank ? A : B;
  const card = (x, k) => { const cls = QUIZ.answered ? (x === winner ? 'right' : (QUIZ.answered === x.id ? 'wrong' : '')) : '';
    return `<button class="quiz-card ${cls}" type="button" data-quiz="${esc(x.id)}" ${QUIZ.answered ? 'disabled' : ''}><span class="hint">Report ${k}</span><h3>${esc(x.locality)}</h3><span>${esc(x.corridor_name)}</span>
      <span class="facts"><span class="chip ${x.bits[0] === '1' ? 'good' : 'warn'}">${x.bits[0] === '1' ? 'Confirmed' : 'Not confirmed'}</span><span class="chip">${x.age_hours != null ? x.age_hours + ' h ago' : 'time unknown'}</span><span class="chip">${esc(x.severity)}</span><span class="chip ${x.bridge ? 'bad' : ''}">${x.bridge ? 'Only path' : 'Has detour'}</span><span class="chip">${x.pairs_lost} routes at risk</span></span></button>`; };
  let html = `<div class="quiz-cards">${card(A, 'A')}<div class="quiz-vs">vs</div>${card(B, 'B')}</div>`;
  if (QUIZ.answered) {
    const keys = [['U (confirmed, recent, serious, open)', x => x.U], ['Only path? (bridge)', x => +x.bridge], ['Routes at risk (Warshall)', x => x.pairs_lost], ['Severity (Low 1 … Critical 4)', x => SEV[x.severity] || 0]];
    let decided = false;
    const rows = keys.map(([name, f]) => { const a = f(A), b = f(B); const here = !decided && a !== b; if (here) decided = true;
      return `<tr><td>${name}</td><td class="mono ${here ? 'decide' : ''}">${a}</td><td class="mono ${here ? 'decide' : ''}">${b}</td><td>${here ? `<b>decides → ${a > b ? 'A' : 'B'}</b>` : (decided ? 'not needed' : 'tie, look at next key')}</td></tr>`; });
    const right = QUIZ.answered === winner.id;
    html += `<div class="quiz-result card"><div class="answer-big" style="color:${right ? 'var(--leaf)' : 'var(--red)'}">${right ? 'Correct!' : 'Not quite.'} Report ${winner === A ? 'A' : 'B'} goes first (${esc(winner.locality)}).</div>
      <div class="table-scroll" style="margin-top:14px">${tbl(['Key (compared in this order)', 'A', 'B', ''], rows).replace('class="data-table"', 'class="data-table lex"')}</div>
      ${decided ? '' : '<p class="hint">All keys equal, so the newer report goes first.</p>'}
      <div class="btn-row"><button class="btn btn-dark btn-sm" type="button" id="quizNext">Try another pair</button></div></div>`;
  }
  el.innerHTML = html;
}
document.addEventListener('click', e => {
  const q = e.target.closest('[data-quiz]'); if (q && QUIZ && !QUIZ.answered) { QUIZ.answered = q.dataset.quiz; renderQuiz(); return; }
  if (e.target.closest('#quizNext')) { newQuiz(); renderQuiz(); }
});
