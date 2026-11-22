// Python syntax highlighter: returns, for every line, a list of [text, className] pairs.
const CTRL = new Set(['if','elif','else','for','while','break','continue','pass','return','try','except','finally','raise','with','yield','assert','match','case']);
const DEF = new Set(['def','class','lambda']);
const IMP = new Set(['import','from','as']);
const OPW = new Set(['and','or','not','in','is','del','global','nonlocal','async','await']);
const CONST = new Set(['True','False','None']);
const BUILTIN = new Set(['print','range','len','int','float','str','bool','list','dict','set','tuple','input','abs','min','max','sum','sorted','reversed','enumerate','zip','map','filter','round','open','type','isinstance','super','any','all','chr','ord','repr','format','object']);

export function highlight(lines) {
  let tri = null;
  const out = [];
  for (const line of lines) {
    const toks = [], push = (t, c) => toks.push([t, c]);
    let i = 0, prev = '';
    if (tri) {
      const e = line.indexOf(tri);
      if (e < 0) { push(line, 's'); out.push(toks); continue; }
      push(line.slice(0, e + 3), 's'); i = e + 3; tri = null;
    }
    while (i < line.length) {
      const rest = line.slice(i); let m;
      if (rest[0] === '#') { push(rest, 'c'); break; }
      if ((m = /^[rRbBfFuU]{0,2}("""|''')/.exec(rest))) {
        const q = m[1], e = rest.indexOf(q, m[0].length);
        if (e < 0) { push(rest, 's'); tri = q; break; }
        push(rest.slice(0, e + 3), 's'); i += e + 3; prev = 's'; continue;
      }
      if ((m = /^[rRbBfFuU]{0,2}("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)/.exec(rest))) { push(m[0], 's'); i += m[0].length; prev = 's'; continue; }
      if ((m = /^(\d[\d_]*(\.\d*)?([eE][+-]?\d+)?|\.\d+)/.exec(rest))) { push(m[0], 'n'); i += m[0].length; prev = 'n'; continue; }
      if (rest[0] === '@' && toks.every(t => /^\s*$/.test(t[0])) && (m = /^@[A-Za-z_][\w.]*/.exec(rest))) { push(m[0], 'dec'); i += m[0].length; prev = '@'; continue; }
      if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
        const w = m[0], call = /^\s*\(/.test(rest.slice(w.length)); let c = '';
        if (prev === 'def') c = 'fn';
        else if (prev === 'class') c = 'cn';
        else if (prev === '.') c = call ? 'cl' : '';
        else if (DEF.has(w)) c = 'kd';
        else if (CTRL.has(w)) c = 'kc';
        else if (IMP.has(w)) c = 'ki';
        else if (OPW.has(w)) c = 'ko';
        else if (CONST.has(w)) c = 'cst';
        else if (w === 'self' || w === 'cls') c = 'self';
        else if (BUILTIN.has(w)) c = 'b';
        else if (call) c = 'cl';
        push(w, c); prev = w; i += w.length; continue;
      }
      push(rest[0], ''); if (!/\s/.test(rest[0])) prev = rest[0]; i++;
    }
    out.push(toks);
  }
  return out;
}
