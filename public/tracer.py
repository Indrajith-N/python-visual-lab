# Real CPython execution + sys.settrace event capture. Nothing here simulates Python:
# the student's code is compiled and executed by CPython, and every recorded step comes from a real trace event.
import sys, ast, io, json, builtins, linecache, operator, traceback, types, itertools

FN = '<student>'
MAXSTEPS = 5000
MAXOUT = 20000

class Stop(BaseException): pass
class NotPure(Exception): pass

def short(s, n=60): return s if len(s) <= n else s[:n - 1] + '…'
def srepr(v):
    try:
        tv = type(v)
        if tv in (list, tuple, set, frozenset, dict) and len(v) > 20:
            br = {list: '[]', tuple: '()', dict: '{}'}.get(tv, '{}')
            it = itertools.islice(v.items() if tv is dict else v, 8)
            body = ', '.join(('%s: %s' % (srepr(a), srepr(b))) if tv is dict else srepr(a) for a, b in it) if tv is dict else ', '.join(srepr(a) for a in it)
            return short(br[0] + body + ', … (%d items)' % len(v) + br[1])
        if tv in (str, bytes) and len(v) > 200: return short(repr(v[:200]))
        return short(repr(v))
    except BaseException: return '<unprintable>'

def ser(v):
    t = type(v).__name__
    if isinstance(v, types.FunctionType): s = '<function %s>' % v.__name__
    elif isinstance(v, types.ModuleType): s = '<module %s>' % v.__name__
    else: s = srepr(v)
    o = {'t': t, 's': s, 'id': id(v)}
    try:
        if isinstance(v, (list, tuple, set, frozenset)): o['items'] = [srepr(x) for x in itertools.islice(v, 30)]
        elif isinstance(v, dict):
            kv = list(itertools.islice(v.items(), 30)); o['labels'] = [srepr(k) for k, _ in kv]; o['items'] = [srepr(x) for _, x in kv]
        elif type(v).__module__ == '__main__' and hasattr(v, '__dict__') and not isinstance(v, (type, types.FunctionType)):
            kv = list(vars(v).items())[:30]; o['labels'] = [str(k) for k, _ in kv]; o['items'] = [srepr(x) for _, x in kv]; o['s'] = '<%s object>' % t
    except BaseException: pass
    return o

def vis(k): return not (isinstance(k, str) and k.startswith('__'))
def vlist(d): return [dict(n=k, **ser(v)) for k, v in list(d.items()) if vis(k)]
def sg(v):
    s = ser(v); return (s['id'], s['s'], tuple(s.get('items') or ()))

BIN = {ast.Add: ('+', operator.add), ast.Sub: ('-', operator.sub), ast.Mult: ('*', operator.mul), ast.Div: ('/', operator.truediv),
       ast.FloorDiv: ('//', operator.floordiv), ast.Mod: ('%', operator.mod), ast.Pow: ('**', operator.pow)}
CMP = {ast.Eq: ('==', operator.eq), ast.NotEq: ('!=', operator.ne), ast.Lt: ('<', operator.lt), ast.LtE: ('<=', operator.le),
       ast.Gt: ('>', operator.gt), ast.GtE: ('>=', operator.ge), ast.In: ('in', lambda a, b: a in b),
       ast.NotIn: ('not in', lambda a, b: a not in b), ast.Is: ('is', operator.is_), ast.IsNot: ('is not', operator.is_not)}
SAFE = (int, float, bool, str, complex, list, tuple, dict, set, type(None))
FUN = {'len': len, 'abs': abs, 'int': int, 'float': float, 'str': str, 'min': min, 'max': max, 'sum': sum, 'round': round, 'bool': bool}

def safe(v): return type(v) in SAFE

def pv(n, env, tr):
    """Evaluate a side-effect-free expression made only of names, constants and built-in value types.
    Used to describe the operations of a line before it runs. Anything else raises NotPure (no animation)."""
    if isinstance(n, ast.Constant): return n.value
    if isinstance(n, ast.Name):
        if n.id not in env: raise NotPure()
        v = env[n.id]; r = {'n': n.id, 'v': srepr(v)}
        if r not in tr['reads']: tr['reads'].append(r)
        return v
    if isinstance(n, (ast.List, ast.Tuple)):
        vals = [pv(e, env, tr) for e in n.elts]; return vals if isinstance(n, ast.List) else tuple(vals)
    if isinstance(n, ast.BinOp) and type(n.op) in BIN:
        a = pv(n.left, env, tr); b = pv(n.right, env, tr)
        if not (safe(a) and safe(b)): raise NotPure()
        if type(n.op) is ast.Pow and (not isinstance(b, (int, float)) or abs(b) > 1000 or (isinstance(a, (int, float)) and abs(a) > 10 ** 6)): raise NotPure()
        if type(n.op) is ast.Mult and any(isinstance(x, (str, list, tuple)) for x in (a, b)) and any(isinstance(x, int) and abs(x) > 10000 for x in (a, b)): raise NotPure()
        sym, fn = BIN[type(n.op)]; r = fn(a, b)
        tr['ops'].append({'a': srepr(a), 'op': sym, 'b': srepr(b), 'r': srepr(r)}); return r
    if isinstance(n, ast.UnaryOp):
        v = pv(n.operand, env, tr)
        if isinstance(n.op, ast.Not): return not v
        if type(v) in (int, float) and isinstance(n.op, (ast.USub, ast.UAdd)): return -v if isinstance(n.op, ast.USub) else v
        raise NotPure()
    if isinstance(n, ast.Compare):
        left = pv(n.left, env, tr); r = True
        for op, c in zip(n.ops, n.comparators):
            right = pv(c, env, tr)
            if type(op) not in CMP or not (safe(left) and safe(right)): raise NotPure()
            sym, fn = CMP[type(op)]; r = fn(left, right)
            tr['ops'].append({'a': srepr(left), 'op': sym, 'b': srepr(right), 'r': srepr(r)})
            if not r: break
            left = right
        return r
    if isinstance(n, ast.BoolOp):
        r = None
        for v in n.values:
            r = pv(v, env, tr)
            if isinstance(n.op, ast.And) and not r: return r
            if isinstance(n.op, ast.Or) and r: return r
        return r
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in FUN and n.func.id not in env and not n.keywords:
        a = [pv(x, env, tr) for x in n.args]
        if not all(safe(x) for x in a): raise NotPure()
        r = FUN[n.func.id](*a)
        tr['ops'].append({'a': ', '.join(srepr(x) for x in a), 'op': n.func.id + '()', 'r': srepr(r)}); return r
    if isinstance(n, ast.Subscript) and not isinstance(n.slice, ast.Slice):
        b = pv(n.value, env, tr); i = pv(n.slice, env, tr)
        if type(b) not in (list, tuple, str, dict): raise NotPure()
        r = b[i]; tr['ops'].append({'a': ast.unparse(n.value), 'op': '[%s]' % srepr(i), 'r': srepr(r), 'sub': True}); return r
    raise NotPure()

def run_traced(src, stdin_text=''):
    chunks = []; size = [0]
    class Out:
        def write(s, t):
            n = len(t)
            if size[0] < MAXOUT: chunks.append(t[:MAXOUT - size[0]]); size[0] += len(chunks[-1])
            return n
        def flush(s): pass
        def isatty(s): return False
    err = io.StringIO()
    steps = []; pend = {}; seen = set(); counts = {}; loops = {}; last = {}; internal = []; capped = [False]
    res = {'chunks': chunks, 'steps': steps, 'error': None, 'stdout': '', 'stderr': '', 'internal': internal}
    queue = stdin_text.splitlines()
    def no_input(prompt=''):
        sys.stdout.write(str(prompt))
        if not queue: raise EOFError('EOF when reading a line (add more lines in the Input box)')
        v = queue.pop(0); sys.stdout.write(v + '\n'); return v
    b = dict(vars(builtins)); b['input'] = no_input
    g = {'__name__': '__main__', '__builtins__': b}
    linecache.cache[FN] = (len(src), None, src.splitlines(True), FN)
    try:
        tree = ast.parse(src, FN); code = compile(tree, FN, 'exec')
    except SyntaxError as e:
        res['error'] = {'msg': '%s: %s' % (type(e).__name__, e.msg), 'line': e.lineno or 0}
        res['stderr'] = ''.join(traceback.format_exception_only(type(e), e)).replace('"<student>"', '"main.py"')
        return json.dumps(res)
    except Exception as e:
        res['error'] = {'msg': '%s: %s' % (type(e).__name__, e), 'line': 0}; res['stderr'] = res['error']['msg']; return json.dumps(res)
    smap = {}
    for n in ast.walk(tree):
        if isinstance(n, ast.stmt): smap.setdefault(n.lineno, n)

    def scope(f): return None if f.f_code.co_name == '<module>' else f.f_locals
    def sigs(f):
        d = {('g', k): sg(v) for k, v in list(g.items()) if vis(k)}
        s = scope(f)
        if s is not None: d.update({('l', k): sg(v) for k, v in list(s.items()) if vis(k)})
        return d
    def stack(f):
        fs = []
        while f is not None and f.f_code.co_filename == FN: fs.append(f); f = f.f_back
        out = [{'f': x.f_code.co_name, 'line': x.f_lineno, 'vars': vlist(x.f_locals)} for x in reversed(fs) if x.f_code.co_name != '<module>']
        return out[-25:]
    def add(line, kind, text, f, **x):
        if len(steps) >= MAXSTEPS: raise Stop()
        d = {'line': line, 'kind': kind, 'text': text, 'vars': vlist(g), 'frames': stack(f), 'o': len(chunks)}
        d.update(x); steps.append(d)
    def prep(n, f, key, enter=True):
        tr = {'reads': [], 'ops': []}
        env = dict(g)
        if scope(f) is not None: env.update(f.f_locals)
        ex = None
        if isinstance(n, (ast.Assign, ast.AnnAssign)) and n.value is not None: ex = [n.value]
        elif isinstance(n, ast.AugAssign) and isinstance(n.target, ast.Name): ex = [ast.BinOp(ast.Name(n.target.id, ast.Load()), n.op, n.value)]
        elif isinstance(n, (ast.If, ast.While)): ex = [n.test]
        elif isinstance(n, ast.Return) and n.value is not None: ex = [n.value]
        elif isinstance(n, ast.Expr) and isinstance(n.value, ast.Call):
            ex = n.value.args if (isinstance(n.value.func, ast.Name) and n.value.func.id == 'print' and 'print' not in env) else [n.value]
        elif isinstance(n, ast.For):
            if not enter: return tr
            try:
                it = n.iter
                if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == 'range' and 'range' not in env:
                    a = [pv(x, env, tr) for x in it.args]
                    if all(type(x) is int and abs(x) < 10 ** 9 for x in a): tr['items'] = [str(i) for i in itertools.islice(range(*a), 1000)]
                else:
                    v = pv(it, env, tr)
                    if type(v) in (list, tuple, str, set): tr['items'] = [srepr(x) for x in list(v)[:1000]]
            except Exception: pass
            tr['ops'] = []; return tr
        if ex is None: return tr
        try:
            val = None
            for e in ex: val = pv(e, env, tr)
            if isinstance(n, (ast.If, ast.While)): tr['val'] = bool(val)
        except Exception:
            tr = {'reads': [], 'ops': [], 'na': True}
        return tr
    def start(f):
        L = f.f_lineno; n = smap.get(L); fid = id(f)
        enter = True
        if isinstance(n, (ast.For, ast.While)):
            lo = last.get(fid); enter = not (lo is not None and n.lineno < lo <= n.end_lineno)
        p = {'line': L, 'pre': sigs(f), 'o': len(chunks), 'tr': prep(n, f, (fid, L), enter)}
        if isinstance(n, (ast.For, ast.While)) and enter:
            key = (fid, L); counts[key] = 0; loops[key] = p['tr'].get('items')
        return p
    def inbody(n, nx): return nx is not None and n.body[0].lineno <= nx <= n.body[-1].end_lineno
    def diff(f, p):
        now = sigs(f); pre = p['pre']; ch = []
        for k, v in now.items():
            o = pre.get(k)
            if o is None: ch.append((k, True, v, None))
            elif o != v: ch.append((k, False, v, o))
        r = {}
        if ch:
            k, new, v, o = ch[0]
            r.update(changed=k[1], scope=k[0], isNew=new, target=k[1], value=v[1])
            if not new and v[2] != o[2]:
                ci = next((i for i, (a, b2) in enumerate(zip(v[2], o[2])) if a != b2), None)
                r['ci'] = ci if ci is not None else max(0, len(v[2]) - 1)
        rem = [k[1] for k in pre if k not in now]
        if rem: r['removed'] = rem
        return r
    def finish(f, p, nx, ret=None):
        if p.get('exc'): return
        L = p['line']; n = smap.get(L); fid = id(f); key = (fid, L); tr = p['tr']; x = diff(f, p); kind = 'other'
        verb = lambda: ('Create ' if x.get('isNew') else 'Update ') + x['target'] + ' = ' + x['value']
        if isinstance(n, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
            kind = 'assign'; text = verb() if 'target' in x else 'Assignment completed'
        elif isinstance(n, (ast.If, ast.While)):
            res_ = None
            if n.body[0].lineno != n.lineno: res_ = inbody(n, nx)
            elif 'val' in tr: res_ = tr['val']
            ex = ast.unparse(n.test)
            if isinstance(n, ast.While):
                counts[key] = counts.get(key, 0) + 1
                kind = 'while'; x.update(iter=counts[key])
            else: kind = 'cond'
            x.update(expr=ex, result=res_)
            text = 'Check: %s is %s' % (ex, 'True' if res_ else 'False' if res_ is not None else 'evaluated')
        elif isinstance(n, ast.For):
            items = loops.get(key); i = counts.get(key, 0)
            body_in = inbody(n, nx) if n.body[0].lineno != n.lineno else ('target' in x or 'changed' in x)
            tgt = ast.unparse(n.target)
            if body_in:
                kind = 'forIter'; counts[key] = i + 1
                val = x.get('value') if isinstance(n.target, ast.Name) else None
                x.update(items=items, idx=i, target=tgt, value=val if val is not None else '', src=ast.unparse(n.iter))
                text = '%s = %s (iteration %d)' % (tgt, x['value'], i + 1)
            else:
                kind = 'forEnd'; x.update(items=items, idx=len(items) if items else 0, target=tgt, src=ast.unparse(n.iter)); text = 'No values left: leave the loop'
                counts.pop(key, None)
        elif isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and isinstance(n.value.func, ast.Name) and n.value.func.id == 'print':
            kind = 'print'; t = ''.join(chunks[p['o']:]); x['printed'] = t.rstrip('\n'); text = 'print() sends "%s" to the console' % x['printed']
        elif isinstance(n, ast.Expr):
            kind = 'expr'; text = 'Evaluate the expression' + (' (changed %s)' % x['changed'] if 'changed' in x else '')
        elif isinstance(n, ast.Return):
            kind = 'return'; text = '%s returns %s' % (f.f_code.co_name, ret); x.update(ret=ret, fn=f.f_code.co_name)
        elif isinstance(n, (ast.Break, ast.Continue, ast.Pass)):
            kind = type(n).__name__.lower(); text = {'break': 'break: leave the loop now', 'continue': 'continue: jump to the next iteration', 'pass': 'pass: do nothing'}[kind]
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            kind = 'def'; text = 'Define %s %s' % ('class' if isinstance(n, ast.ClassDef) else 'function', n.name)
        else:
            text = 'Executed line %d. A detailed animation is not available for this statement.' % L
            if 'target' in x: text += ' ' + verb() + '.'
        add(L, kind, text, f, tr=tr, **x)
    def trace(f, ev, arg):
        if f.f_code.co_filename != FN: return None
        try:
            fid = id(f); co = f.f_code; gen = co.co_flags & 0x2a0; ismod = co.co_name == '<module>'
            if ev == 'call':
                pend.pop(fid, None); last.pop(fid, None)
                if not ismod and not gen:
                    a = ', '.join('%s=%s' % (k, srepr(v)) for k, v in f.f_locals.items())
                    add(co.co_firstlineno, 'call', 'Call %s(%s): push a new frame on the call stack' % (co.co_name, a), f, fn=co.co_name)
            elif ev == 'line':
                p = pend.get(fid)
                if p: finish(f, p, f.f_lineno)
                pend[fid] = start(f); last[fid] = f.f_lineno
            elif ev == 'exception':
                et, e, tb = arg
                if et not in (StopIteration, GeneratorExit, StopAsyncIteration):
                    p = pend.get(fid)
                    if p: p['exc'] = True
                    if id(e) not in seen:
                        seen.add(id(e)); add(f.f_lineno, 'exception', '%s: %s' % (et.__name__, e), f, exc=et.__name__)
            elif ev == 'return':
                p = pend.pop(fid, None); last.pop(fid, None); r = srepr(arg); done = False
                if p and not p.get('exc'):
                    finish(f, p, None, r); done = isinstance(smap.get(p['line']), ast.Return)
                if not ismod and not gen and not done and not (p and p.get('exc')):
                    add(p['line'] if p else co.co_firstlineno, 'return', '%s returns %s' % (co.co_name, r), f, ret=r, fn=co.co_name)
        except Stop:
            capped[0] = True; sys.settrace(None)
            x = f
            while x is not None: x.f_trace = None; x = x.f_back
            return None
        except Exception: internal.append(traceback.format_exc())
        return trace

    old = sys.stdout, sys.stderr, sys.gettrace(); sys.stdout = Out(); sys.stderr = err
    try:
        sys.settrace(trace); exec(code, g)
    except SystemExit: pass
    except BaseException as e:
        tb = e.__traceback__.tb_next if e.__traceback__ else None
        line = 0
        for fs in traceback.extract_tb(tb): 
            if fs.filename == FN: line = fs.lineno
        msg = '%s: %s' % (type(e).__name__, e)
        res['error'] = {'msg': msg, 'line': line}
        res['stderr'] = ''.join(traceback.format_exception(type(e), e, tb)).replace('"<student>"', '"main.py"')
        steps.append({'line': line, 'kind': 'error', 'text': msg, 'vars': vlist(g), 'frames': [], 'o': len(chunks)})
    finally:
        sys.settrace(None); sys.stdout, sys.stderr = old[0], old[1]
    if capped[0]:
        lim = {'line': steps[-1]['line'] if steps else 0, 'kind': 'limit', 'vars': vlist(g), 'frames': [], 'o': len(chunks),
               'text': 'Recording limit reached (%d steps). The rest of the program still ran in real Python; the full output and final variables are shown.' % MAXSTEPS}
        if steps and steps[-1]['kind'] == 'error': steps.insert(len(steps) - 1, lim)
        else: steps.append(lim)
    res['stdout'] = ''.join(chunks) + ('\n[output truncated]' if size[0] >= MAXOUT else '')
    res['stderr'] = res['stderr'] or err.getvalue()
    return json.dumps(res, default=str)
