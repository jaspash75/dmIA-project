"""In-memory replacement for the SQLite Store, used only in the browser build.

Same methods as the real database.Store, so app.py works unchanged. The whole store
can be exported to JSON (dump/load) so the page can keep it in localStorage.
"""
import json, uuid
from datetime import datetime, timezone
from seed_data import CORRIDORS

SOURCE = 'MoEFCC / Project Elephant, Elephant Corridors of India (2023)'


class Store:
    def __init__(self, path=None):
        self.reset()

    def reset(self):
        self.t = {'sites': [], 'corridors': [], 'reports': [], 'teams': []}
        self.settings = {}
        names = set()
        for e in CORRIDORS:
            for n in (e['a'], e['b']):
                if n not in names:
                    names.add(n); self.t['sites'].append({'id': None, 'name': n, 'region': e['state'], 'source': 'MoEFCC / Project Elephant 2023'})
            self.t['corridors'].append({'id': e['id'], 'name': e['name'], 'a': e['a'], 'b': e['b'], 'state': e['state'],
                'length_km': e['length_km'], 'status_2023': e['status_2023'], 'movement': e['movement'], 'source_page': e['source_page'],
                'lat': e['lat'], 'lon': e['lon'], 'notes': e['notes'], 'active': 1, 'source': SOURCE, 'width_km': e.get('width_km'),
                'series': e.get('series', ''), 'reported_elephants_series_2023': e.get('reported_elephants_series_2023'),
                'source_type': e.get('source_type', 'official_baseline')})
        self.t['teams'] = [{'id': i, 'name': f'Field Team {i}', 'available': 1} for i in (1, 2, 3)]

    # same ordering as SQLite "ORDER BY rowid DESC": newest first
    def rows(self, table):
        if table not in self.t: raise ValueError('Unsupported table')
        return [dict(r) for r in reversed(self.t[table])]

    def add_report(self, r):
        self.t['reports'].append({'id': r['id'], 'created_at': datetime.now(timezone.utc).isoformat(), 'observed_at': r['observed_at'],
            'corridor_id': r['corridor_id'], 'incident_type': r['incident_type'], 'severity': r['severity'], 'locality': r['locality'],
            'coordinates': r.get('coordinates', ''), 'evidence_ref': r.get('evidence_ref', ''), 'verified': int(bool(r.get('verified', False))),
            'status': r.get('status', 'Open'), 'description': r.get('description', ''), 'assigned_team': r.get('assigned_team', ''),
            'source': r.get('source', 'User-entered field report')})

    def update_report(self, rid, **fields):
        for r in self.t['reports']:
            if r['id'] == rid:
                r.update({k: v for k, v in fields.items() if k in ('verified', 'status', 'assigned_team')})

    def delete_report(self, rid):
        self.t['reports'] = [r for r in self.t['reports'] if r['id'] != rid]

    def delete_simulation_reports(self):
        self.t['reports'] = [r for r in self.t['reports'] if not str(r.get('source', '')).startswith('CSV simulation:')]

    def add_site(self, name, region='User-entered'):
        self.t['sites'].append({'id': uuid.uuid4().hex[:8], 'name': name.strip(), 'region': region, 'source': 'User-entered; not an officially mapped habitat'})

    def add_corridor(self, name, a, b, state='User-entered'):
        if a == b: raise ValueError('A link must connect two different sites.')
        names = {s['name'] for s in self.t['sites']}
        if a not in names or b not in names: raise ValueError('Choose existing site endpoints.')
        self.t['corridors'].append({'id': uuid.uuid4().hex[:8], 'name': name.strip(), 'a': a, 'b': b, 'state': state, 'length_km': None,
            'status_2023': 'Proposed / user-entered', 'movement': 'Not established', 'source_page': None, 'lat': None, 'lon': None,
            'notes': 'User-entered hypothetical connection; not a validated corridor', 'active': 1, 'source': 'User-entered hypothesis',
            'width_km': None, 'series': '', 'reported_elephants_series_2023': None, 'source_type': 'user_hypothesis'})

    def set_link_active(self, cid, active):
        for c in self.t['corridors']:
            if c['id'] == cid: c['active'] = int(bool(active))

    def update_team(self, team_id, available):
        for t in self.t['teams']:
            if t['id'] == team_id: t['available'] = int(bool(available))

    def get_setting(self, key, default=None):
        return self.settings.get(key, default)

    def set_setting(self, key, value):
        self.settings[key] = value

    # ---- persistence helpers for the browser (localStorage) ----
    def dump(self):
        return json.dumps({'t': self.t, 'settings': self.settings})

    def load(self, text):
        d = json.loads(text)
        if isinstance(d, dict) and 't' in d: self.t = d['t']; self.settings = d.get('settings', {})
