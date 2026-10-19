"""Minimal stand-in for Flask used only in the GitHub Pages (browser) build.

The real app.py is loaded unchanged inside Pyodide. This module provides just the
pieces it uses — route decorators, `request`, `jsonify` — so requests from the page
can be dispatched to the same Python functions without a server.
"""
import json, re

class _Request:
    def __init__(self): self.method = 'GET'; self.args = {}; self._body = None; self.files = {}; self.form = {}
    def get_json(self, silent=False):
        if self._body in (None, ''): return None
        try: return json.loads(self._body)
        except Exception:
            if silent: return None
            raise

request = _Request()

class Response:
    def __init__(self, data, status=200): self.data = data; self.status = status

def jsonify(*args, **kwargs):
    return Response(args[0] if args else kwargs)

def render_template(*a, **k): return Response({'ok': False, 'error': 'Templates are pre-rendered in the static build.'}, 404)
def send_from_directory(*a, **k): return Response({'ok': False, 'error': 'Not available in the static build.'}, 404)

def _compile(rule):
    conv = {}
    def sub(m):
        kind, name = (m.group(1) or 'string'), m.group(2)
        conv[name] = int if kind == 'int' else str
        return f'(?P<{name}>' + (r'\d+' if kind == 'int' else '.+' if kind == 'path' else '[^/]+') + ')'
    return re.compile('^' + re.sub(r'<(?:(int|path|string):)?(\w+)>', sub, rule) + '$'), conv

class Flask:
    def __init__(self, name): self.routes = []
    def route(self, rule, methods=('GET',)):
        def deco(fn):
            rx, conv = _compile(rule)
            self.routes.append((set(m.upper() for m in methods), rx, conv, fn)); return fn
        return deco
    def get(self, rule): return self.route(rule, ['GET'])
    def post(self, rule): return self.route(rule, ['POST'])
    def patch(self, rule): return self.route(rule, ['PATCH'])
    def delete(self, rule): return self.route(rule, ['DELETE'])
    def run(self, *a, **k): pass

    def dispatch(self, method, path, query=None, body=None):
        """Called from JavaScript. Returns (status, json_text)."""
        if hasattr(query, 'to_py'): query = query.to_py()          # JS object → dict
        if isinstance(query, str): query = json.loads(query or '{}')
        request.method = method.upper(); request.args = dict(query or {}); request._body = body
        for methods, rx, conv, fn in self.routes:
            m = rx.match(path)
            if m and request.method in methods:
                kwargs = {k: conv[k](v) for k, v in m.groupdict().items()}
                try: out = fn(**kwargs)
                except Exception as exc:
                    return 500, json.dumps({'ok': False, 'error': f'{type(exc).__name__}: {exc}'})
                status = 200
                if isinstance(out, tuple): out, status = out[0], out[1]
                if isinstance(out, Response): status = out.status if status == 200 else status; out = out.data
                return status, json.dumps(out, default=str)
        return 404, json.dumps({'ok': False, 'error': f'No route for {method} {path}'})
