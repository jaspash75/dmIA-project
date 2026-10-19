"""WildGuard · Nilgiri corridor decision support built on discrete mathematics.

Every calculation is done in maths.py. This file only stores field data
(SQLite) and exposes the calculations as small JSON endpoints.
"""
from flask import Flask, render_template, request, jsonify
from datetime import datetime, timezone
from uuid import uuid4
import os, csv
from database import Store
import maths

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)
store = Store(os.path.join(BASE_DIR, 'wildguard_nilgiri.db'))
SIMULATION_CSV = os.path.join(BASE_DIR, 'data', 'simulation_events.csv')
SCENARIOS = {'overnight': SIMULATION_CSV, 'storm': os.path.join(BASE_DIR, 'data', 'scenario_storm.csv')}
OPEN = ('Open', 'In review')


def bad(msg, code=400):
    return jsonify({'ok': False, 'error': msg}), code


def body():
    return request.get_json(silent=True) or {}


def current_state():
    sites = store.rows('sites'); corridors = store.rows('corridors')
    raw = store.rows('reports'); teams = store.rows('teams')
    by_id = {c['id']: c for c in corridors}
    edge_tests = maths.simulate_each_link(sites, corridors)
    bridge = {e['id']: e['disconnects_network'] for e in edge_tests}
    reports = []
    for r in raw:
        c = by_id.get(r['corridor_id'], {})
        r['triage'] = maths.triage(r, structural_critical=bridge.get(r['corridor_id'], False))
        r['corridor_name'] = c.get('name', 'Unknown corridor')
        r['simulated'] = str(r.get('source', '')).startswith('CSV simulation')
        reports.append(r)
    pending = [r for r in reports if r['status'] in OPEN]
    assignment = maths.assign_reports(pending, teams)
    graph = maths.graph_whatif(sites, corridors)
    settings = {'intervals': store.get_setting('intervals', [15, 20, 30]), 'shift_start': store.get_setting('shift_start', '06:00')}
    board = maths.decision_board(sites, corridors, reports, teams, settings['intervals'], settings['shift_start'])
    return {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'sites': [s['name'] for s in sites],
        'corridors': corridors, 'reports': reports, 'teams': teams,
        'graph': graph, 'edge_tests': edge_tests, 'assignment': assignment,
        'board': board, 'settings': settings,
        'summary': {
            'reports': len(reports), 'pending': len(pending),
            'urgent': sum(r['triage']['urgent_review'] for r in reports),
            'complete_evidence': sum(r['triage']['evidence_complete'] for r in reports),
            'components': graph['before']['component_count'],
            'bridges': sum(e['disconnects_network'] for e in edge_tests),
            'teams_available': assignment['available_teams'],
            'max_load_bound': assignment['pigeonhole_minimum_max_load'],
        },
    }


@app.get('/')
def index():
    return render_template('index.html')


@app.get('/health')
def health():
    return jsonify({'ok': True, 'service': 'WildGuard', 'database': 'SQLite'})


@app.get('/api/state')
def api_state():
    return jsonify(current_state())


# ---------------------------------------------------------------- field data
@app.post('/api/reports')
def create_report():
    d = body()
    required = ['observed_at', 'corridor_id', 'severity', 'locality']
    missing = [k for k in required if not str(d.get(k, '')).strip()]
    if missing: return bad('Please fill in: ' + ', '.join(missing))
    if not any(c['id'] == d['corridor_id'] for c in store.rows('corridors')): return bad('Choose a corridor link from the list.')
    if d['severity'] not in ('Low', 'Medium', 'High', 'Critical'): return bad('Invalid severity.')
    rid = 'WG-' + datetime.now().strftime('%y%m%d') + '-' + uuid4().hex[:4].upper()
    store.add_report({'id': rid, 'observed_at': d['observed_at'], 'corridor_id': d['corridor_id'],
                      'incident_type': str(d.get('incident_type') or 'Field observation'), 'severity': d['severity'],
                      'locality': d['locality'].strip(), 'coordinates': str(d.get('coordinates', '')).strip(),
                      'evidence_ref': str(d.get('evidence_ref', '')).strip(), 'verified': bool(d.get('verified')),
                      'status': 'Open', 'source': 'User-entered field report'})
    return jsonify({'ok': True, 'id': rid, 'state': current_state()}), 201


@app.patch('/api/reports/<rid>')
def update_report(rid):
    d = body(); fields = {}
    if 'verified' in d: fields['verified'] = int(bool(d['verified']))
    if d.get('status') in ('Open', 'In review', 'Resolved', 'Closed'): fields['status'] = d['status']
    if not any(r['id'] == rid for r in store.rows('reports')): return bad('Report not found.', 404)
    store.update_report(rid, **fields)
    return jsonify({'ok': True, 'state': current_state()})


@app.delete('/api/reports/<rid>')
def delete_report(rid):
    store.delete_report(rid)
    return jsonify({'ok': True, 'state': current_state()})


@app.patch('/api/links/<cid>')
def toggle_link(cid):
    if not any(c['id'] == cid for c in store.rows('corridors')): return bad('Link not found.', 404)
    store.set_link_active(cid, bool(body().get('active')))
    return jsonify({'ok': True, 'state': current_state()})


@app.post('/api/links')
def add_link():
    d = body()
    try: store.add_corridor(str(d.get('name') or f"{d.get('a')} – {d.get('b')} (hypothetical)"), str(d.get('a')), str(d.get('b')))
    except Exception as e: return bad(str(e))
    return jsonify({'ok': True, 'state': current_state()}), 201


@app.patch('/api/teams/<int:team_id>')
def update_team(team_id):
    if not any(t['id'] == team_id for t in store.rows('teams')): return bad('Team not found.', 404)
    store.update_team(team_id, bool(body().get('available')))
    return jsonify({'ok': True, 'state': current_state()})


@app.post('/api/settings')
def save_settings():
    d = body()
    try:
        vals = [int(v) for v in d.get('intervals', []) if str(v).strip()]
        if len(vals) < 2 or any(v <= 0 or v > 10080 for v in vals): raise ValueError
        start = str(d.get('shift_start', '06:00'))
        h, m = (int(x) for x in start.split(':')); assert 0 <= h < 24 and 0 <= m < 60
    except Exception:
        return bad('Enter at least two intervals (1–10080 min) and a start time like 06:00.')
    store.set_setting('intervals', vals); store.set_setting('shift_start', f'{h:02d}:{m:02d}')
    return jsonify({'ok': True, 'state': current_state()})


# ---------------------------------------------------------------- calculators
@app.post('/api/calc/logic')
def calc_logic():
    d = body()
    return jsonify({'ok': True, 'result': maths.logic_eval(d.get('v'), d.get('r'), d.get('s'), d.get('o')),
                    'table': maths.truth_table()})


@app.post('/api/calc/evidence')
def calc_evidence():
    return jsonify({'ok': True, 'result': maths.evidence_poset(body().get('present', []))})


@app.post('/api/calc/pigeonhole')
def calc_pigeonhole():
    d = body()
    try: return jsonify({'ok': True, 'result': maths.pigeonhole(d.get('n', 0), d.get('m', 0))})
    except (TypeError, ValueError) as e: return bad(str(e) or 'Enter whole numbers.')


@app.post('/api/number-theory')
def number_theory():
    raw = str(body().get('intervals', '15,20,30'))
    try: vals = [int(x) for x in raw.replace(' ', '').split(',') if x]
    except ValueError: return bad('Intervals must be whole numbers of minutes, separated by commas.')
    if len(vals) < 2: return bad('Enter at least two intervals.')
    if any(v <= 0 or v > 10080 for v in vals): return bad('Each interval must be between 1 and 10080 minutes.')
    sync = maths.patrol_sync(vals)
    lcm_euclid = [maths.gcd_steps(max(s['a'], s['b']), min(s['a'], s['b'])) for s in sync['lcm_steps']]
    return jsonify({'ok': True, 'gcd': maths.gcd_chain(vals), 'sync': sync, 'lcm_euclid': lcm_euclid})


@app.post('/api/calc/graph')
def calc_graph():
    d = body(); removed = [x for x in d.get('remove', []) if x]
    sites = store.rows('sites'); corridors = store.rows('corridors')
    res = maths.graph_whatif(sites, corridors, removed)
    src, dst = d.get('from'), d.get('to')
    if src and dst:
        nodes = res['reach_after']['nodes']
        res['pair'] = {'from': src, 'to': dst,
                       'reachable': bool(res['reach_after']['matrix'][nodes.index(src)][nodes.index(dst)]) if src in nodes and dst in nodes else False,
                       'path': maths.shortest_path(nodes, corridors, src, dst, removed)}
    return jsonify({'ok': True, 'result': res})


@app.post('/api/hamming')
def hamming():
    d = body()
    try:
        if d.get('mode') == 'check': result = maths.hamming74_check_steps(d.get('code', ''))
        else: result = maths.hamming74_encode_steps(d.get('bits', ''))
    except ValueError as e: return bad(str(e))
    return jsonify({'ok': True, 'result': result, 'group': maths.xor_group_check()})


@app.post('/api/calc/map')
def calc_map():
    d = body(); sites = store.rows('sites')
    activate = set(d.get('activate', []))
    corridors = [dict(c, active=1) if c['id'] in activate else c for c in store.rows('corridors')]
    removed = [x for x in d.get('remove', []) if x]
    added = [tuple(p) for p in d.get('add', []) if isinstance(p, (list, tuple)) and len(p) == 2]
    return jsonify({'ok': True, 'result': maths.network_analysis(sites, corridors, removed, added),
                    'baseline': maths.network_analysis(sites, [dict(c, active=1) if c.get('source_type') == 'official_baseline' else c for c in corridors]),
                    # Long-term planning uses the full official network (every documented corridor open).
                    'restoration': maths.restoration_plan(sites, [dict(c, active=1) if c.get('source_type') == 'official_baseline' else c for c in corridors])})


# ---------------------------------------------------------------- demo scenario
def load_events(scenario='overnight'):
    with open(SCENARIOS.get(scenario, SIMULATION_CSV), newline='', encoding='utf-8-sig') as f: return list(csv.DictReader(f))


@app.get('/api/simulation/events')
def simulation_events():
    return jsonify({'ok': True, 'events': load_events(request.args.get('scenario', 'overnight'))})


@app.post('/api/simulation/step')
def simulation_step():
    try: index = int(body().get('index', -1))
    except (TypeError, ValueError): return bad('Step index must be a number.')
    scenario = body().get('scenario', 'overnight')
    if scenario not in SCENARIOS: return bad('Unknown scenario.')
    events = load_events(scenario)
    if not 0 <= index < len(events): return bad('No event at that step.')
    ev = events[index]; action = ev['action']; cid = ev.get('corridor_id', '')
    corridors = {c['id']: c for c in store.rows('corridors')}
    if cid and cid not in corridors: return bad(f'Unknown corridor {cid}.')
    if action == 'report':
        rid = 'SIM-' + ev['event_id']
        if any(r['id'] == rid for r in store.rows('reports')): return bad('Already played — press Reset first.', 409)
        hours = float(ev.get('hours_ago') or 0)
        observed = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - hours * 3600, timezone.utc).isoformat()
        store.add_report({'id': rid, 'observed_at': observed, 'corridor_id': cid,
                          'incident_type': ev['incident_type'], 'severity': ev['severity'], 'locality': ev['locality'],
                          'coordinates': ev.get('coordinates', ''), 'evidence_ref': ev.get('evidence_ref', ''),
                          'verified': ev.get('verified', '').lower() == 'true', 'status': ev.get('status') or 'Open',
                          'description': ev.get('description', ''), 'source': 'CSV simulation: Nilgiri training scenario'})
        text = f"New report {rid} at {ev['locality']} on {corridors[cid]['name']}: {ev['incident_type'].lower()}, severity {ev['severity']}, {'verified' if ev.get('verified','').lower()=='true' else 'not verified'}."
    elif action == 'verify_report':
        target = 'SIM-' + ev.get('target_event_id', '')
        if not any(r['id'] == target for r in store.rows('reports')): return bad('Play the steps in order.')
        store.update_report(target, verified=1)
        text = f"Report {target} verified (V becomes 1). {ev.get('description', '').replace('SIMULATED ONLY: ', '')}"
    elif action == 'close_report':
        target = 'SIM-' + ev.get('target_event_id', '')
        if not any(r['id'] == target for r in store.rows('reports')): return bad('Play the steps in order.')
        store.update_report(target, status='Closed')
        text = f"Report {target} closed: {ev.get('description', '').replace('SIMULATED ONLY: ', '')}"
    elif action == 'disable_link':
        store.set_link_active(cid, False); text = f"Link {corridors[cid]['name']} is blocked in the model (edge removed)."
    elif action == 'restore_link':
        store.set_link_active(cid, True); text = f"Link {corridors[cid]['name']} is restored (edge added back)."
    else: return bad(f'Unsupported action {action}.')
    return jsonify({'ok': True, 'step': index, 'total': len(events), 'text': text, 'state': current_state()})


@app.post('/api/simulation/reset')
def simulation_reset():
    store.delete_simulation_reports()
    for c in store.rows('corridors'):
        if c.get('source_type') == 'official_baseline': store.set_link_active(c['id'], True)
    return jsonify({'ok': True, 'state': current_state()})


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', '5055')), debug=False, use_reloader=False, threaded=True)
