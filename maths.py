"""Discrete-mathematics calculations used by the WildGuard incident-response workflow.
Only deterministic, explainable calculations; no ecological prediction is claimed.
"""
from itertools import product, combinations
from math import ceil
from datetime import datetime, timezone, timedelta


def parse_dt(value):
    if not value: return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
        return dt
    except (ValueError, TypeError):
        return None


def triage(report, now=None, structural_critical=False):
    """Logic plus transparent operational next-step guidance for a field report."""
    now = now or datetime.now(timezone.utc)
    dt = parse_dt(report.get('observed_at'))
    age_hours = (now - dt).total_seconds()/3600 if dt else None
    recent = age_hours is not None and 0 <= age_hours <= 24
    verified = bool(report.get('verified'))
    severe = report.get('severity') in ('High', 'Critical')
    open_status = report.get('status') in ('Open', 'In review')
    urgent = verified and recent and severe and open_status
    evidence_fields = ['locality', 'observed_at', 'coordinates', 'evidence_ref']
    present = [f for f in evidence_fields if str(report.get(f) or '').strip()]
    missing = [f for f in evidence_fields if f not in present]
    evidence_complete = len(present) == len(evidence_fields)

    if not open_status:
        priority_score, priority_label = 0, 'Resolved / closed'
        action = 'No active response action. Retain the report for audit and trend analysis.'
    elif urgent:
        priority_score, priority_label = 100, 'Urgent human review'
        action = 'Contact the responsible Forest Range Office / authorised field team promptly. Confirm the exact site, keep the public away from wildlife, and record the response. WildGuard does not dispatch teams.'
    elif severe and recent:
        priority_score, priority_label = 85, 'Verify promptly'
        action = 'High-severity recent report is not independently verified. Request authorised verification before treating it as confirmed; complete missing evidence and avoid publicly sharing precise wildlife coordinates.'
    elif severe:
        priority_score, priority_label = 65, 'Review high severity'
        action = 'Review the report and confirm whether the barrier or disturbance remains active. If still present, escalate through the local Forest Department.'
    elif recent:
        priority_score, priority_label = 45, 'Recent field review'
        action = 'Check the observation with the relevant field team and complete missing evidence before closing it.'
    else:
        priority_score, priority_label = 25, 'Routine evidence review'
        action = 'Check evidence completeness and assign for routine review; stale or incomplete data does not establish that the corridor is safe.'

    if open_status and structural_critical:
        action += ' The linked corridor edge is structurally critical in the current graph simulation; verify the real-world connection before using this result for planning.'
    if open_status and missing:
        action += ' Missing evidence: ' + ', '.join(missing) + '.'

    return {'verified':verified,'recent':recent,'age_hours':round(age_hours,1) if age_hours is not None else None,
            'high_severity':severe,'open_status':open_status,'urgent_review':urgent,
            'evidence_present':present,'evidence_missing':missing,'evidence_count':len(present),
            'evidence_complete':evidence_complete, 'priority_score':priority_score,
            'priority_label':priority_label, 'recommended_action':action,
            'structural_critical':bool(structural_critical),
            'logic_expression':'verified ∧ recent(≤24h) ∧ high/critical ∧ open/in-review'}


def truth_table():
    return [{'verified':v,'recent':r,'severe':s,'open':o,'result':v and r and s and o}
            for v,r,s,o in product([False,True], repeat=4)]


def graph_analysis(sites, corridors, removed_ids=None):
    removed_ids=set(removed_ids or [])
    nodes=sorted({s['name'] for s in sites})
    adj={n:set() for n in nodes}
    active=[]
    for e in corridors:
        if e.get('active',1) and e['id'] not in removed_ids:
            if e['a'] in adj and e['b'] in adj:
                adj[e['a']].add(e['b']); adj[e['b']].add(e['a']); active.append(e)
    seen=set(); components=[]
    for n in nodes:
        if n in seen: continue
        stack=[n]; seen.add(n); comp=[]
        while stack:
            u=stack.pop(); comp.append(u)
            for v in adj[u]:
                if v not in seen: seen.add(v); stack.append(v)
        components.append(sorted(comp))
    isolated=sorted(n for n in nodes if not adj[n])
    return {'nodes':nodes,'adj':adj,'components':components,'component_count':len(components),
            'isolated':isolated,'degrees':{n:len(adj[n]) for n in nodes},'active_edges':active}


def simulate_each_link(sites, corridors):
    base=graph_analysis(sites,corridors); before=base['component_count']; out=[]
    for e in corridors:
        if not e.get('active',1): continue
        after=graph_analysis(sites,corridors,{e['id']})
        out.append({'id':e['id'],'name':e['name'],'a':e['a'],'b':e['b'],
                    'components_before':before,'components_after':after['component_count'],
                    'disconnects_network':after['component_count']>before,
                    'newly_isolated':sorted(set(after['isolated'])-set(base['isolated']))})
    return sorted(out,key=lambda x:(not x['disconnects_network'],-len(x['newly_isolated']),x['name']))


def warshall(nodes, corridors, include_steps=True):
    """Warshall transitive closure, retaining each intermediate-vertex stage for teaching."""
    nodes=list(nodes); idx={x:i for i,x in enumerate(nodes)}; n=len(nodes)
    m=[[i==j for j in range(n)] for i in range(n)]
    for e in corridors:
        if e.get('active',1) and e['a'] in idx and e['b'] in idx:
            i,j=idx[e['a']],idx[e['b']]; m[i][j]=m[j][i]=True
    steps=[{'stage':'Initial relation R⁽⁰⁾','via':None,'matrix':[row[:] for row in m]}] if include_steps else []
    for k in range(n):
        for i in range(n):
            for j in range(n): m[i][j]=m[i][j] or (m[i][k] and m[k][j])
        if include_steps:
            steps.append({'stage':f'After intermediate vertex {nodes[k]}','via':nodes[k],'matrix':[row[:] for row in m]})
    result={'nodes':nodes,'matrix':m,'reachable_pairs':sum(sum(row) for row in m)}
    if include_steps: result['steps']=steps
    return result


def evidence_lattice(fields):
    sets=[]
    for r in range(len(fields)+1):
        for c in combinations(fields,r): sets.append(list(c))
    covers=[]
    for a in sets:
        for b in sets:
            if len(b)==len(a)+1 and set(a).issubset(b): covers.append({'lower':a,'upper':b})
    return {'sets':sets,'covers':covers,'set_count':len(sets)}


def assign_reports(reports, teams):
    """Deterministic least-loaded assignment, prioritising urgent reports then recency."""
    available=[t for t in teams if t.get('available',1)]
    loads={t['name']:0 for t in available}; assignments=[]
    ordered=sorted(reports,key=lambda r:(not r.get('triage',{}).get('urgent_review'), -(parse_dt(r.get('observed_at')).timestamp() if parse_dt(r.get('observed_at')) else 0)))
    # Respect a manual assignment if the selected team is currently available.
    unassigned=[]
    for r in ordered:
        chosen=r.get('assigned_team')
        if chosen in loads:
            loads[chosen]+=1
            assignments.append({'report_id':r['id'],'team':chosen,'reason':'Manual assignment retained'})
        else:
            unassigned.append(r)
    for r in unassigned:
        if not available: assignments.append({'report_id':r['id'],'team':None,'reason':'No available team'}); continue
        t=min(available,key=lambda x:(loads[x['name']],x['name'])); loads[t['name']]+=1
        assignments.append({'report_id':r['id'],'team':t['name'],'reason':'Suggested least-loaded assignment; urgent reports sorted first'})
    # Keep assignment display in original prioritised order rather than database insertion order.
    assignments.sort(key=lambda x: next((i for i,r in enumerate(ordered) if r['id']==x['report_id']), 10**9))
    n=len(ordered); m=len(available)
    return {'assignments':assignments,'loads':loads,'available_teams':m,
            'pigeonhole_minimum_max_load':ceil(n/m) if m and n else (0 if n==0 else None),
            'workload_distribution':sorted(loads.items(),key=lambda x:x[0]),
            'mapping_injective':len(ordered)<=m and n==len(set(a['team'] for a in assignments if a['team'])),
            'mapping_surjective':m>0 and set(a['team'] for a in assignments if a['team'])==set(loads)}


def gcd_steps(a,b):
    a,b=abs(int(a)),abs(int(b)); rows=[]
    if a==0 and b==0: return {'gcd':0,'steps':[]}
    while b:
        q,r=divmod(a,b); rows.append({'a':a,'b':b,'quotient':q,'remainder':r}); a,b=b,r
    return {'gcd':a,'steps':rows}


def patrol_sync(intervals):
    """Find gcd of check intervals and LCM-style next shared checkpoint for integer minutes."""
    vals=[int(v) for v in intervals if int(v)>0]
    if not vals: return {'error':'Enter at least one positive interval.'}
    g=vals[0]; l=vals[0]; lcm_steps=[]
    import math
    for v in vals[1:]:
        old_l=l; pair_gcd=math.gcd(l,v); l=l*v//pair_gcd
        lcm_steps.append({'a':old_l,'b':v,'gcd':pair_gcd,'product':old_l*v,'lcm':l,
                          'equation':f'lcm({old_l}, {v}) = ({old_l} × {v}) / {pair_gcd} = {l}'})
        g=math.gcd(g,v)
    return {'intervals':vals,'gcd_minutes':g,'common_checkpoint_minutes':l,'lcm_steps':lcm_steps,
            'meaning':f'Checks can be aligned every {l} minutes if these periodic schedules start together; GCD {g} is their greatest common interval divisor.'}


def hamming74_encode(bits):
    bits=''.join(ch for ch in str(bits) if ch in '01')
    if len(bits)!=4: raise ValueError('Enter exactly four binary digits.')
    d1,d2,d3,d4=map(int,bits)
    # positions: 1=p1, 2=p2, 3=d1, 4=p4, 5=d2, 6=d3, 7=d4
    b=[0,d1*0,d2*0,d1,0,d2,d3, d4]
    b[1]=b[3]^b[5]^b[7]; b[2]=b[3]^b[6]^b[7]; b[4]=b[5]^b[6]^b[7]
    return ''.join(str(x) for x in b[1:])


def hamming74_check(code):
    code=''.join(ch for ch in str(code) if ch in '01')
    if len(code)!=7: raise ValueError('Enter exactly seven binary digits.')
    b=[0]+list(map(int,code))
    s1=b[1]^b[3]^b[5]^b[7]; s2=b[2]^b[3]^b[6]^b[7]; s4=b[4]^b[5]^b[6]^b[7]
    pos=s1+2*s2+4*s4
    corrected=b[:]
    if pos: corrected[pos]^=1
    data=''.join(str(corrected[i]) for i in (3,5,6,7))
    return {'syndrome':pos,'error_detected':pos!=0,'corrected_code':''.join(map(str,corrected[1:])),
            'decoded_data':data,'status':'Single-bit error corrected (if at most one bit was corrupted).' if pos else 'No single-bit error detected.'}


def xor_group_check():
    elems=[0,1]; table=[[a^b for b in elems] for a in elems]
    return {'elements':elems,'table':table,'closed':all(x in elems for row in table for x in row),
            'associative':all((a^b)^c==a^(b^c) for a in elems for b in elems for c in elems),
            'identity':0,'inverses':{0:0,1:1},'commutative':True,'group':True}


# ---------------------------------------------------------------------------
# Step-by-step helpers used by the module pages. Each returns the working,
# not only the answer, so the UI can show how the result was obtained.
# ---------------------------------------------------------------------------
EVIDENCE_FIELDS = ['locality', 'observed_at', 'coordinates', 'evidence_ref']
LOGIC_NAMES = {'v': 'Verified', 'r': 'Recent (≤ 24 h)', 's': 'Severe (High/Critical)', 'o': 'Open / in review'}


def logic_eval(v, r, s, o):
    """Evaluate U = V ∧ R ∧ S ∧ O and report which conditions block it."""
    vals = {'v': bool(v), 'r': bool(r), 's': bool(s), 'o': bool(o)}
    result = all(vals.values())
    # Row index in the truth table produced by truth_table() (V is the most significant bit).
    row = vals['v'] * 8 + vals['r'] * 4 + vals['s'] * 2 + vals['o'] * 1
    blocking = [LOGIC_NAMES[k] for k, x in vals.items() if not x]
    return {'inputs': {k: int(x) for k, x in vals.items()}, 'result': int(result), 'row': row,
            'blocking': blocking,
            'substituted': ' ∧ '.join(str(int(vals[k])) for k in 'vrso') + f' = {int(result)}',
            'true_rows': 1, 'total_rows': 16}


def evidence_poset(present):
    """Place an evidence set S inside the power-set lattice (P(E), ⊆)."""
    present = [f for f in EVIDENCE_FIELDS if f in set(present or [])]
    missing = [f for f in EVIDENCE_FIELDS if f not in present]
    chain = [present[:]]
    cur = present[:]
    for f in missing:  # one maximal chain from S up to the top element E
        cur = [x for x in EVIDENCE_FIELDS if x in set(cur) | {f}]
        chain.append(cur)
    return {'universe': EVIDENCE_FIELDS, 'present': present, 'missing': missing,
            'rank': len(present), 'height': len(EVIDENCE_FIELDS),
            'is_top': not missing, 'is_bottom': not present,
            'supersets': 2 ** len(missing), 'subsets': 2 ** len(present),
            'level_sizes': [len(list(combinations(EVIDENCE_FIELDS, k))) for k in range(len(EVIDENCE_FIELDS) + 1)],
            'chain_to_top': chain}


def pigeonhole(n, m):
    n, m = int(n), int(m)
    if n < 0 or m < 0: raise ValueError('Counts cannot be negative.')
    if m == 0:
        return {'n': n, 'm': m, 'bound': None, 'note': 'No team is available, so no function Reports → Teams exists.'}
    bound = ceil(n / m) if n else 0
    q, r = divmod(n, m)
    return {'n': n, 'm': m, 'bound': bound, 'quotient': q, 'remainder': r,
            'balanced_loads': [q + 1] * r + [q] * (m - r),
            'injective_possible': n <= m, 'surjective_possible': n >= m}


def gcd_chain(values):
    """Euclid's algorithm applied pairwise: gcd(a,b,c) = gcd(gcd(a,b),c)."""
    vals = [abs(int(v)) for v in values]
    if not vals: return {'gcd': 0, 'pairs': []}
    g = vals[0]; pairs = []
    for v in vals[1:]:
        hi, lo = max(g, v), min(g, v)
        step = gcd_steps(hi, lo); pairs.append({'a': hi, 'b': lo, **step}); g = step['gcd']
    return {'gcd': g, 'pairs': pairs}


def hamming74_encode_steps(bits):
    code = hamming74_encode(bits)
    d1, d2, d3, d4 = (int(c) for c in ''.join(ch for ch in str(bits) if ch in '01'))
    return {'data': f'{d1}{d2}{d3}{d4}', 'code': code,
            'parity': [
                {'name': 'p1', 'position': 1, 'covers': [3, 5, 7], 'expr': f'd1 ⊕ d2 ⊕ d4 = {d1} ⊕ {d2} ⊕ {d4}', 'value': d1 ^ d2 ^ d4},
                {'name': 'p2', 'position': 2, 'covers': [3, 6, 7], 'expr': f'd1 ⊕ d3 ⊕ d4 = {d1} ⊕ {d3} ⊕ {d4}', 'value': d1 ^ d3 ^ d4},
                {'name': 'p4', 'position': 4, 'covers': [5, 6, 7], 'expr': f'd2 ⊕ d3 ⊕ d4 = {d2} ⊕ {d3} ⊕ {d4}', 'value': d2 ^ d3 ^ d4}]}


def hamming74_check_steps(code):
    res = hamming74_check(code)
    b = [0] + [int(c) for c in ''.join(ch for ch in str(code) if ch in '01')]
    res['syndrome_bits'] = [
        {'name': 's1', 'positions': [1, 3, 5, 7], 'expr': f'{b[1]} ⊕ {b[3]} ⊕ {b[5]} ⊕ {b[7]}', 'value': b[1] ^ b[3] ^ b[5] ^ b[7]},
        {'name': 's2', 'positions': [2, 3, 6, 7], 'expr': f'{b[2]} ⊕ {b[3]} ⊕ {b[6]} ⊕ {b[7]}', 'value': b[2] ^ b[3] ^ b[6] ^ b[7]},
        {'name': 's4', 'positions': [4, 5, 6, 7], 'expr': f'{b[4]} ⊕ {b[5]} ⊕ {b[6]} ⊕ {b[7]}', 'value': b[4] ^ b[5] ^ b[6] ^ b[7]}]
    return res


def shortest_path(nodes, corridors, start, goal, removed_ids=None):
    """BFS path through active links (used to explain a reachable pair)."""
    removed_ids = set(removed_ids or [])
    adj = {n: [] for n in nodes}
    for e in corridors:
        if e.get('active', 1) and e['id'] not in removed_ids and e['a'] in adj and e['b'] in adj:
            adj[e['a']].append(e['b']); adj[e['b']].append(e['a'])
    if start not in adj or goal not in adj: return None
    prev = {start: None}; queue = [start]
    while queue:
        u = queue.pop(0)
        if u == goal: break
        for v in sorted(adj[u]):
            if v not in prev: prev[v] = u; queue.append(v)
    if goal not in prev: return None
    path = [goal]
    while prev[path[-1]] is not None: path.append(prev[path[-1]])
    return path[::-1]


def graph_whatif(sites, corridors, removed_ids=None):
    """Compare G with G − e for the chosen removed links."""
    removed_ids = set(removed_ids or [])
    before = graph_analysis(sites, corridors)
    after = graph_analysis(sites, corridors, removed_ids)
    def pack(g):
        degs = g['degrees']
        return {'vertices': len(g['nodes']), 'edges': len(g['active_edges']),
                'degree_sum': sum(degs.values()), 'degrees': degs,
                'degree_sequence': sorted(degs.values(), reverse=True),
                'components': g['components'], 'component_count': g['component_count'],
                'isolated': g['isolated'], 'edge_ids': [e['id'] for e in g['active_edges']]}
    b, a = pack(before), pack(after)
    return {'before': b, 'after': a, 'removed': sorted(removed_ids),
            'disconnects': a['component_count'] > b['component_count'],
            'newly_isolated': sorted(set(a['isolated']) - set(b['isolated'])),
            'reach_before': warshall(before['nodes'], before['active_edges'], include_steps=True),
            'reach_after': warshall(after['nodes'], after['active_edges'], include_steps=True)}


# ---------------------------------------------------------------------------
# DECISION ENGINE — the seven modules working together on the live queue.
# Every column of the final decision comes from exactly one module.
# ---------------------------------------------------------------------------
SEVERITY_LEVEL = {'Low': 1, 'Medium': 2, 'High': 3, 'Critical': 4}


def _pairs(nodes, edges):
    """Number of unordered pairs of distinct reserves that are mutually reachable (from Warshall R*)."""
    m = warshall(nodes, edges, include_steps=False)['matrix']
    n = len(nodes)
    return sum(1 for i in range(n) for j in range(i + 1, n) if m[i][j])


def corridor_impact(sites, corridors, cid):
    """Module 3 + 6: what losing corridor `cid` does to the network.
    Compares G (with the corridor) against G − e (without it), whatever its saved state."""
    nodes = sorted({s['name'] for s in sites})
    with_e = [dict(c, active=1) if c['id'] == cid else c for c in corridors]
    without_e = [c for c in with_e if c['id'] != cid]
    g_with = graph_analysis(sites, with_e)
    g_without = graph_analysis(sites, without_e)
    p_with, p_without = _pairs(nodes, g_with['active_edges']), _pairs(nodes, g_without['active_edges'])
    # Reserve pairs separated by the loss (for the explanation).
    mw = warshall(nodes, g_with['active_edges'], include_steps=False)['matrix']
    mo = warshall(nodes, g_without['active_edges'], include_steps=False)['matrix']
    cut = [(nodes[i], nodes[j]) for i in range(len(nodes)) for j in range(i + 1, len(nodes)) if mw[i][j] and not mo[i][j]]
    return {'corridor_id': cid, 'components_with': g_with['component_count'], 'components_without': g_without['component_count'],
            'bridge': g_without['component_count'] > g_with['component_count'],
            'pairs_with': p_with, 'pairs_without': p_without, 'pairs_lost': p_with - p_without,
            'cut_pairs': cut, 'components_after': g_without['components']}


def _clock(start_hhmm, minutes):
    h, m = (int(x) for x in str(start_hhmm).split(':'))
    total = h * 60 + m + int(minutes)
    day = total // 1440
    return f'{(total % 1440) // 60:02d}:{total % 60:02d}' + (f' (+{day}d)' if day else '')


_WHY_MISSING = {'Verified': 'confirmation by a field team', 'Recent (≤ 24 h)': 'a sighting from the last 24 h',
                'Severe (High/Critical)': 'high severity', 'Open / in review': 'an open status'}


def _assign_and_schedule(order, available, L):
    """Least-loaded assignment in the given order. Returns {id: (team, k)} and the loads."""
    loads = {name: 0 for name in available}
    plan = {}
    for x in order:
        if not available: plan[x['id']] = (None, None); continue
        team = min(available, key=lambda n: (loads[n], n))
        loads[team] += 1
        plan[x['id']] = (team, loads[team])
    return plan, loads


def _compare(rows):
    """Measure the benefit of the maths-based order against first-come-first-served.
    Confirmed-threat exposure = Σ over U = 1 reports of (reserve pairs lost × hours until verified):
    every hour a confirmed bridge blockage waits, that many elephant routes stay cut."""
    urgent = [x for x in rows if x['U'] and x['verify_at_min'] is not None]
    def side(key):
        if not urgent: return {'avg_urgent_wait_h': 0, 'exposure': 0, 'worst_wait_h': 0}
        worst = max(urgent, key=lambda x: x['pairs_lost'])
        return {'avg_urgent_wait_h': round(sum(x[key] for x in urgent) / len(urgent) / 60, 2),
                'exposure': round(sum(x['pairs_lost'] * x[key] / 60 for x in urgent), 1),
                'worst_wait_h': round(worst[key] / 60, 2), 'worst_id': worst['id']}
    wg, ff = side('verify_at_min'), side('fcfs_verify_min')
    red = round(100 * (ff['exposure'] - wg['exposure']) / ff['exposure']) if ff['exposure'] else 0
    return {'wildguard': wg, 'fcfs': ff, 'exposure_reduction_pct': red, 'urgent_count': len(urgent)}


def decision_board(sites, corridors, reports, teams, intervals=(15, 20, 30), shift_start='06:00'):
    """Turn the pending queue into an ordered, assigned, scheduled and encoded decision list."""
    pending = [r for r in reports if r.get('status') in ('Open', 'In review')]
    impacts = {}
    rows = []
    for r in pending:
        t = r['triage'] if 'triage' in r else triage(r)
        bits = {'v': t['verified'], 'r': t['recent'], 's': t['high_severity'], 'o': t['open_status']}
        logic = logic_eval(**bits)                                          # Module 1
        ev = evidence_poset(t['evidence_present'])                          # Module 4
        cid = r['corridor_id']
        if cid not in impacts: impacts[cid] = corridor_impact(sites, corridors, cid)   # Modules 3 + 6
        imp = impacts[cid]
        packet = hamming74_encode(''.join(str(int(bits[k])) for k in 'vrso'))  # Module 7
        rows.append({'id': r['id'], 'corridor_id': cid, 'corridor_name': r.get('corridor_name', cid),
                     'locality': r.get('locality', ''), 'severity': r.get('severity'),
                     'bits': ''.join(str(int(bits[k])) for k in 'vrso'), 'U': logic['result'], 'blocking': logic['blocking'],
                     'evidence_rank': ev['rank'], 'evidence_missing': ev['missing'], 'next_evidence': ev['missing'][0] if ev['missing'] else None,
                     'bridge': imp['bridge'], 'pairs_lost': imp['pairs_lost'], 'cut_pairs': imp['cut_pairs'],
                     'packet': packet, 'observed_at': r.get('observed_at'), 'age_hours': t.get('age_hours')})
    # Priority = lexicographic order on (U, bridge, pairs lost, severity, newest first).
    def key(x):
        age = x['age_hours'] if x['age_hours'] is not None else 10 ** 6
        return (-x['U'], -int(x['bridge']), -x['pairs_lost'], -SEVERITY_LEVEL.get(x['severity'], 0), age)
    rows.sort(key=key)
    for i, x in enumerate(rows, 1):
        x['rank'] = i
        x['priority_key'] = [x['U'], int(x['bridge']), x['pairs_lost'], SEVERITY_LEVEL.get(x['severity'], 0)]

    available = sorted([t['name'] for t in teams if t.get('available', 1)])
    sync = patrol_sync(intervals)
    L = sync['common_checkpoint_minutes']
    # Module 5 (f : Reports → Teams, least-loaded) + Module 2 (k-th report of a team at checkpoint k·L).
    plan, loads = _assign_and_schedule(rows, available, L)
    for x in rows:
        team, slot = plan[x['id']]
        x['team'], x['slot'] = team, slot
        x['verify_at_min'] = slot * L if slot else None
        x['verify_at'] = _clock(shift_start, x['verify_at_min']) if slot else None

    # Baseline for comparison: first-come-first-served (oldest report first), same teams, same checkpoints.
    fcfs = sorted(rows, key=lambda x: -(x['age_hours'] if x['age_hours'] is not None else -1))
    fplan, _ = _assign_and_schedule(fcfs, available, L)
    for x in rows:
        _, fslot = fplan[x['id']]
        x['fcfs_rank'] = [y['id'] for y in fcfs].index(x['id']) + 1
        x['fcfs_verify_min'] = fslot * L if fslot else None
        x['fcfs_verify_at'] = _clock(shift_start, x['fcfs_verify_min']) if fslot else None
    n, m = len(rows), len(available)
    bound = ceil(n / m) if m and n else 0

    # ---- Plain-language order sheet for the field officer -----------------------------
    by_cid = {c['id']: c for c in corridors}
    short = lambda s: str(s).replace(' Reserve Forest', '')
    ev_words = {'locality': 'exact place name', 'observed_at': 'time of sighting', 'coordinates': 'GPS location', 'evidence_ref': 'photo'}
    for x in rows:
        c = by_cid.get(x['corridor_id'], {}); imp = impacts[x['corridor_id']]
        bits = dict(zip('vrso', x['bits']))
        if bits['v'] == '0': action = 'Go to the site and confirm the report is real'
        elif x['U']: action = 'Inspect the blockage and tell the Range Officer to start clearing it'
        else: action = 'Re-check whether the blockage is still there'
        why = []
        why.append('Confirmed, recent, serious and still open, so this is urgent.' if x['U']
                   else 'Not urgent yet. Still missing: ' + ', '.join(_WHY_MISSING[b] for b in x['blocking']) + '.')
        if imp['bridge'] and c:
            sides = [comp for comp in imp['components_after'] if c.get('a') in comp or c.get('b') in comp]
            if len(sides) == 2:
                small, big = sorted(sides, key=len)
                why.append(f"This corridor is the ONLY link between {' & '.join(map(short, small))} and {' & '.join(map(short, big))}. "
                           f"If it stays blocked, elephants lose {x['pairs_lost']} forest-to-forest route{'s' if x['pairs_lost'] != 1 else ''} and are pushed toward villages.")
        elif c:
            why.append('Elephants have another route around this corridor, so the damage is limited.')
        x['plan'] = {'time': x['verify_at'], 'team': x['team'], 'place': x['locality'], 'corridor': c.get('name', x['corridor_id']),
                     'action': action, 'why': why,
                     'bring_back': [ev_words[f] for f in x['evidence_missing']],
                     'message': x['packet']}

    # ---- With vs without WildGuard ---------------------------------------------------
    # Usual practice: reports handled in the order they arrived (oldest first), same teams, same checkpoints.
    def schedule(order):
        ld = {name: 0 for name in available}; out = {}
        for x in order:
            if not available: continue
            t = min(available, key=lambda nme: (ld[nme], nme)); ld[t] += 1
            out[x['id']] = ld[t] * L
        return out
    fcfs = sorted(rows, key=lambda x: -(x['age_hours'] if x['age_hours'] is not None else 0))
    t_fcfs, t_wg = schedule(fcfs), {x['id']: x['verify_at_min'] for x in rows if x['verify_at_min']}
    def route_hours(times): return sum(x['pairs_lost'] * times.get(x['id'], 0) / 60 for x in rows)
    worst = max(rows, key=lambda x: (x['U'], x['pairs_lost']), default=None)
    urgent = [x for x in rows if x['U']]
    comparison = None
    if rows and available:
        rh_f, rh_w = route_hours(t_fcfs), route_hours(t_wg)
        comparison = {
            'fcfs_order': [x['id'] for x in fcfs], 'wildguard_order': [x['id'] for x in rows],
            'route_hours_fcfs': round(rh_f, 1), 'route_hours_wildguard': round(rh_w, 1),
            'route_hours_saved_pct': round(100 * (rh_f - rh_w) / rh_f) if rh_f else 0,
            'worst_id': worst['id'] if worst else None, 'worst_place': worst['locality'] if worst else None,
            'worst_fcfs': _clock(shift_start, t_fcfs[worst['id']]) if worst else None,
            'worst_wildguard': _clock(shift_start, t_wg[worst['id']]) if worst else None,
            'worst_minutes_earlier': (t_fcfs[worst['id']] - t_wg[worst['id']]) if worst else 0,
            'urgent_last_fcfs': _clock(shift_start, max(t_fcfs[x['id']] for x in urgent)) if urgent else None,
            'urgent_last_wildguard': _clock(shift_start, max(t_wg[x['id']] for x in urgent)) if urgent else None,
            'rows': [{'id': x['id'], 'place': x['locality'], 'pairs_lost': x['pairs_lost'], 'U': x['U'],
                      'fcfs': _clock(shift_start, t_fcfs[x['id']]), 'wildguard': x['verify_at']} for x in rows],
            'metric': 'route-hours cut off = Σ (forest routes the blockage cuts × hours until a team reaches it)'}
        comparison.update(_compare(rows))   # confirmed-threat (U = 1) metrics

    return {'rows': rows, 'loads': loads, 'teams': available,
            'n': n, 'm': m, 'pigeonhole_bound': bound,
            'lcm': L, 'gcd': sync['gcd_minutes'], 'intervals': sync['intervals'], 'shift_start': shift_start,
            'checkpoints': [_clock(shift_start, k * L) for k in range(1, max(bound, 1) + 1)],
            'queue_clear_at': _clock(shift_start, bound * L) if bound else None,
            'queue_clear_minutes': bound * L,
            'impacts': impacts, 'comparison': comparison,
            'priority_rule': '(U, bridge, reserve pairs lost, severity) compared left to right, larger first; ties → newest first'}


# ---------------------------------------------------------------------------
# CORRIDOR MAP + RESTORATION PLANNER (graphs, cycles, bridges, diameter)
# ---------------------------------------------------------------------------
def bfs_distances(nodes, edges):
    """All-pairs shortest path lengths (number of corridors) by BFS from every vertex."""
    adj = {n: set() for n in nodes}
    for e in edges:
        if e['a'] in adj and e['b'] in adj: adj[e['a']].add(e['b']); adj[e['b']].add(e['a'])
    dist = {}
    for s in nodes:
        d = {s: 0}; q = [s]
        while q:
            u = q.pop(0)
            for v in adj[u]:
                if v not in d: d[v] = d[u] + 1; q.append(v)
        dist[s] = d
    return dist


def network_analysis(sites, corridors, removed_ids=(), added=()):
    """Analyse G = (V, E) after removing some corridors and adding hypothetical ones."""
    removed_ids = set(removed_ids or [])
    edges = [dict(c) for c in corridors if c.get('active', 1) and c['id'] not in removed_ids]
    for i, (a, b) in enumerate(added or []):
        edges.append({'id': f'NEW-{i + 1}', 'name': f'Restored {a.replace(" Reserve Forest", "")}–{b.replace(" Reserve Forest", "")}',
                      'a': a, 'b': b, 'active': 1, 'proposed': True})
    g = graph_analysis(sites, edges)
    tests = simulate_each_link(sites, edges)
    bridges = [t['id'] for t in tests if t['disconnects_network']]
    nodes = g['nodes']
    dist = bfs_distances(nodes, g['active_edges'])
    finite = [(dist[a][b], a, b) for i, a in enumerate(nodes) for b in nodes[i + 1:] if b in dist[a]]
    diameter = max(finite) if finite else (0, None, None)
    return {'nodes': nodes, 'edges': edges, 'edge_ids': [e['id'] for e in g['active_edges']],
            'components': g['components'], 'populations': g['component_count'],
            'bridges': bridges, 'bridge_count': len(bridges), 'cycle_rank': len(g['active_edges']) - len(nodes) + g['component_count'],
            'reachable_pairs': _pairs(nodes, g['active_edges']), 'total_pairs': len(nodes) * (len(nodes) - 1) // 2,
            'degrees': g['degrees'], 'degree_sum': sum(g['degrees'].values()), 'edge_count': len(g['active_edges']),
            'diameter': {'length': diameter[0], 'a': diameter[1], 'b': diameter[2]}}


def restoration_plan(sites, corridors, removed_ids=(), limit=6):
    """Try every possible new corridor u–v and rank by how much safer the network becomes.
    Theorem used: adding edge u–v creates a cycle through the u…v path, and an edge lies on a cycle
    iff it is NOT a bridge — so every bridge on that path stops being a bridge."""
    base = network_analysis(sites, corridors, removed_ids)
    nodes = base['nodes']
    existing = {frozenset((e['a'], e['b'])) for e in base['edges']}
    out = []
    for i, a in enumerate(nodes):
        for b in nodes[i + 1:]:
            if frozenset((a, b)) in existing: continue
            after = network_analysis(sites, corridors, removed_ids, [(a, b)])
            path = shortest_path(nodes, base['edges'], a, b)
            protected = sorted(set(base['bridges']) - set(after['bridges']))
            out.append({'a': a, 'b': b, 'path': path, 'path_length': (len(path) - 1) if path else None,
                        'bridges_before': base['bridge_count'], 'bridges_after': after['bridge_count'],
                        'protected': protected, 'populations_before': base['populations'], 'populations_after': after['populations'],
                        'reachable_after': after['reachable_pairs']})
    out.sort(key=lambda x: (x['populations_after'], x['bridges_after'], -(x['path_length'] or 0), x['a'], x['b']))
    return {'base': base, 'candidates': out[:limit], 'tested': len(out)}
