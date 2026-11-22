// Auto-indent helpers for the code editor. Returns {code,pos} for a handled key, or null to let the browser handle it.
export function handleKey(code, a, b, key, shift) {
  const ls = code.lastIndexOf('\n', a - 1) + 1, before = code.slice(ls, a);
  if (key === 'Enter') {
    const bare = before.replace(/#.*$/, '').trimEnd();
    let ind = before.match(/^ */)[0];
    if (/:$/.test(bare) || /[(\[{]$/.test(bare)) ind += '    ';
    else if (/^\s*(return|break|continue|pass|raise)\b/.test(before) && ind.length >= 4) ind = ind.slice(4);
    const ins = '\n' + ind;
    return {code: code.slice(0, a) + ins + code.slice(b), pos: a + ins.length};
  }
  if (key === 'Tab') {
    if (shift) {
      const m = code.slice(ls).match(/^ {1,4}/); if (!m) return {code, pos: a};
      const n = m[0].length; return {code: code.slice(0, ls) + code.slice(ls + n), pos: Math.max(ls, a - n)};
    }
    return {code: code.slice(0, a) + '    ' + code.slice(b), pos: a + 4};
  }
  if (key === 'Backspace' && a === b && before.length > 0 && /^ +$/.test(before)) {
    const n = before.length % 4 || 4; return {code: code.slice(0, a - n) + code.slice(a), pos: a - n};
  }
  if (key === ':' && a === b) {
    const m = before.match(/^( {4,})(else|elif\b.*|except\b.*|finally)\s*$/);
    if (m) return {code: code.slice(0, ls) + before.slice(4) + ':' + code.slice(a), pos: a - 3};
  }
  return null;
}
