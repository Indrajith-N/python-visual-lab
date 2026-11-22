import {useState,useEffect,useRef,useMemo} from 'react';
import {highlight} from './highlight.js';
import {handleKey} from './indent.js';
import {initPython,runPython,onPyStatus} from './pyRunner.js';
import {EXAMPLES} from './examples.js';

const DELAY={slow:3200,normal:2000,fast:900},SP={slow:1.5,normal:1,fast:.5},LH=30;
const WHY={
 assign:'Python evaluates the right-hand side first, then binds the name on the left to the result.',
 print:'print() evaluates its arguments, turns them into text and sends them to the console.',
 expr:'The expression is evaluated. Its result is thrown away unless you assign it.',
 cond:'An if/elif checks its condition. Only a True result runs the indented block below it.',
 else:'No earlier condition was True, so Python falls through to else.',
 while:'A while loop re-checks its condition before every pass and stops when it is False.',
 forInit:'range() builds the sequence. Python will hand the values to the loop one at a time.',
 forIter:'Each pass copies the next value into the loop variable, then runs the indented body.',
 forEnd:'No values are left, so Python leaves the loop and carries on below it.',
 break:'break leaves the nearest loop at once.',continue:'continue skips the rest of the body and starts the next pass.',
 pass:'pass does nothing. It only fills a block that needs a body.',error:'Python stops at the first error and reports it.',
 call:'Calling a function creates a new frame on the call stack. It holds the parameters and the local variables.',
 return:'return hands a value back to the caller. The function frame is then removed from the call stack.',
 exception:'An exception was raised. Python looks for a matching except block, and stops with a traceback if there is none.',
 def:'def and class statements run once: they create a function or class object and bind its name.',
 limit:'Recording many steps is slow, so the visualizer records the first part and lets the program finish at full speed.',
 other:'This statement ran in real Python. A detailed animation is not available for it.'};
const REFT=new Set(['int','float','str','bool','NoneType','complex','bytes','tuple','range','function','module']);
const d=s=>({animationDelay:`calc(${s}s * var(--sp))`});

function Ops({tr}){const base=tr.reads.length?.6:0;return <>
 {tr.reads.length>0&&<div className="row rd"><span className="rl">1 Read</span><div className="rc">{tr.reads.map((r,i)=><span key={i} className="chip xs v pop" title={r.n+' = '+r.v} style={d(i*.15)}><b>{r.n}</b> = <span className="rv">{r.v}</span></span>)}</div></div>}
 {tr.ops.length>0&&<div className="row op"><span className="rl">{tr.reads.length?'2 ':''}Compute</span><div className="rc col">{tr.ops.map((o,i)=>{const t=base+i*.8;return <div key={i} className="opbox"><span className="stepn">{i+1}</span>
  {o.sub?<span className="chip xs v sl" style={d(t)}><span className="rv">{o.a}{o.op}</span></span>
   :<><span className="chip xs v sl" style={d(t)}><span className="rv">{o.a}</span></span><span className="opsym pop" style={d(t+.2)}>{o.op}</span>{o.b!==undefined&&<span className="chip xs v sr" style={d(t)}><span className="rv">{o.b}</span></span>}</>}
  <span className="eq">=</span><span className="chip xs r pop" style={d(t+.5)}><span className="rv">{o.r}</span></span></div>;})}</div></div>}</>;}

function Flow({s}){const t=s.tr.reads.length?.6:0,end=t+s.tr.ops.length*.8;return <div className="flow">
 <Ops tr={s.tr}/>
 {s.kind==='assign'&&<div className="row st"><span className="rl">3 Store</span><div className="rc"><span className="chip xs r pop" style={d(end)}><span className="rv">{s.value}</span></span><span className="arrow pop" style={d(end+.3)}>➜</span><span className="chip xs v pop" style={d(end+.5)}><b>{s.target}</b></span></div></div>}
 {s.kind==='print'&&<div className="row st"><span className="rl">Output</span><div className="rc"><span className="chip xs o pop" style={d(end)}><span className="rv">{s.printed||'(empty line)'}</span></span><span className="arrow pop" style={d(end+.3)}>➜</span><span className="chip xs o pop" style={d(end+.5)}>console</span></div></div>}
 {s.tr.na&&<div className="note">Operation steps are not available for this expression (it may call your own code). The result shown is the real one.</div>}
 {s.kind==='expr'&&!s.tr.ops.length&&!s.tr.na&&<div className="note">Nothing to store.</div>}</div>;}

function Decision({s}){const end=(s.tr.reads.length?.6:0)+s.tr.ops.length*.8+.2;return <div className="flow">
 <div className="diamond pop"><span>{s.expr}</span></div>
 <Ops tr={s.tr}/>
 {s.result!==null&&s.result!==undefined&&<div className={'verdict pop '+(s.result?'t':'f')} style={d(end)}>Result: {s.result?'True':'False'}</div>}
 <div className="paths"><div className={'path '+(s.result===true?'taken':s.result===null?'':'skip')} style={d(end)}>True ➜ {s.kind==='while'?'run the body again':'run this block'}</div>
 <div className={'path '+(s.result===false?'taken':s.result===null?'':'skip')} style={d(end)}>False ➜ {s.kind==='while'?'leave the loop':'skip this block'}</div></div></div>;}

function Loop({s}){const items=s.items||[];const sh=items.slice(0,40);return <div className="flow">
 <div className="lbl">{s.src}</div>
 <div className="strip">{!sh.length&&<div className="note">The values come from {s.src}.</div>}{sh.map((x,i)=><div key={i} className={'seg '+(i<s.idx?'done':i===s.idx?'now':'')}>{x}</div>)}{items.length>40&&<div className="seg">…</div>}</div>
 <div className="note">{s.kind==='forIter'?<><b className="vc">{s.target}</b> = {s.value}. Run the body, then return here for the next value.</>:s.kind==='forInit'?<>The loop variable <b className="vc">{s.target}</b> will take these values one by one.</>:<>The loop is finished.</>}</div></div>;}

function Stage({s}){if(!s)return <div className="note big">Press <b>Step</b> to run one statement, or <b>Run</b> to play the whole program.</div>;
 const k=s.kind;
 if(k==='assign'||k==='print'||k==='expr')return <Flow s={s}/>;
 if(k==='cond'||k==='while')return <Decision s={s}/>;
 if(k.startsWith('for'))return <Loop s={s}/>;
 if(k==='call'||k==='return')return <div className="flow"><div className="note big">{s.text}</div></div>;
 return <div className={'note big'+(k==='error'?' err':'')}>{s.text}</div>;}

function Memory({s}){const vars=s?s.vars:[];return <div className="mem">
 {!vars.length&&<div className="note">Memory is empty. Variables appear here when they are created.</div>}
 {vars.map(v=>{const hot=s.changed===v.n&&s.scope!=='l';return <div key={v.n+(s.line)+vars.length} className={'var'+(v.items?' list':'')+(hot?(s.isNew?' new':' chg'):'')}>
  <div className="vhead"><span className="vname">{v.n}</span>{hot&&<span className="tag">{s.isNew?'NEW':'UPDATED'}</span>}<span className="vtype">{v.t}{REFT.has(v.t)?'':<span className="ref" title="Variables with the same @id refer to the same object"> @{(v.id%65536).toString(16)}</span>}</span></div>
  {v.items?<div className="cells">{v.items.map((x,i)=><div key={i} className={'cell'+(hot&&s.ci===i?' chg':'')}><small>{v.labels?v.labels[i]:i}</small>{x}</div>)}{!v.items.length&&<span className="vval">[ ]</span>}</div>:<div className="vval">{v.s}</div>}
 </div>;})}</div>;}

function Stack({s}){const fr=s?s.frames:[];return <div className="stack">
 {[...fr].reverse().map((f,i)=><div key={fr.length-i+f.f+(s.line)} className={'frame'+(i===0&&s.kind==='call'?' push':'')+(i===0&&s.kind==='return'?' popping':'')}>
  <div className="fhead"><b>{f.f}()</b><span>line {f.line}</span></div>
  <div className="fvars">{f.vars.length?f.vars.map(v=><span key={v.n} className={'chip v sm'+(i===0&&s.scope==='l'&&s.changed===v.n?' hot':'')}>{v.n} = {v.s}</span>):<span className="note">no local variables</span>}</div></div>)}
 {fr.length>0&&<div className="frame base"><div className="fhead"><b>&lt;module&gt;</b><span>global frame (see Memory)</span></div></div>}
 {!fr.length&&<div className="note">No function is running. Calling one pushes a frame here.</div>}</div>;}

export default function App(){
 const [code,setCode]=useState(EXAMPLES[0].code),[ex,setEx]=useState(0),[plan,setPlan]=useState(null),[idx,setIdx]=useState(-1),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState('normal');
 const box=useRef(null);
 const [busy,setBusy]=useState(false),[py,setPy]=useState({state:'loading',msg:'Starting Python…'}),[learn,setLearn]=useState(true),[stdin,setStdin]=useState('');
 useEffect(()=>{const off=onPyStatus(setPy);initPython();return off;},[]);
 const steps=plan?plan.steps:[],s=idx>=0?steps[idx]:null,last=steps.length-1;
 const errLine=plan&&plan.error&&(!steps.length||(s&&s.kind==='error'))?plan.error.line:0;
 const lines=code.split('\n');
 const compile=async()=>{setBusy(true);const r=await runPython(code,stdin);setPlan(r);setBusy(false);return r;};
 const edit=v=>{setCode(v);setPlan(null);setIdx(-1);setPlaying(false);};
 const run=async()=>{const p=plan||await compile();if(!p.steps.length){setIdx(-1);return;}setIdx(idx>=p.steps.length-1?0:idx+1);setPlaying(true);};
 const step=async()=>{const p=plan||await compile();setPlaying(false);if(p.steps.length)setIdx(i=>Math.min(i+1,p.steps.length-1));};
 const prev=()=>{setPlaying(false);setIdx(i=>Math.max(i-1,-1));};
 const reset=()=>{setPlaying(false);setIdx(-1);setPlan(null);};
 const resume=()=>{if(plan&&idx<last)setPlaying(true);};
 useEffect(()=>{if(!playing)return;if(idx>=last){setPlaying(false);return;}const t=setTimeout(()=>setIdx(i=>i+1),DELAY[speed]);return()=>clearTimeout(t);},[playing,idx,last,speed]);
 useEffect(()=>{const ln=(s&&s.line)||errLine;if(ln&&box.current){const y=(ln-1)*LH,b=box.current;if(y<b.scrollTop||y>b.scrollTop+b.clientHeight-2*LH)b.scrollTop=Math.max(0,y-2*LH);}},[idx,errLine]);
 const onKey=e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;const t=e.target;const r=handleKey(code,t.selectionStart,t.selectionEnd,e.key,e.shiftKey);if(!r)return;e.preventDefault();if(r.code!==code)edit(r.code);requestAnimationFrame(()=>{t.selectionStart=t.selectionEnd=r.pos;});};
 const tok=useMemo(()=>highlight(lines),[code]);
 const [split,setSplit]=useState(45),mainRef=useRef(null);
 const drag=e=>{e.preventDefault();const mv=ev=>{const r=mainRef.current.getBoundingClientRect();setSplit(Math.min(70,Math.max(25,(ev.clientX-r.left)/r.width*100)));};const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up);};window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up);};
 const status=busy?'Running your code in real Python…':!plan?(py.state==='ready'?'Ready. Press Run or Step.':py.msg):!steps.length?plan.error.msg:idx<0?`${steps.length} steps prepared. Press Step.`:s.kind==='error'?s.text:idx===last?'Program finished.':`Step ${idx+1} of ${steps.length}`;
 const how=s&&s.tr&&s.tr.ops.length?s.tr.ops.map(o=>o.sub?`${o.a}${o.op} = ${o.r}`:`${o.a} ${o.op}${o.b!==undefined?' '+o.b:''} = ${o.r}`).join('  →  '):null;
 const w=Math.max(30,...lines.map(l=>l.length))+3;
 return <div className="app" style={{'--sp':SP[speed]}}>
  <header><h1>Python Visual Lab</h1><span>See how real Python runs your code, one statement at a time</span><span className="sand" title="Code runs in CPython compiled to WebAssembly inside a browser worker. It is sandboxed: no operating-system or hardware access, and a 15 second time limit.">{py.state==='ready'?py.msg+' · sandboxed in your browser':py.msg}</span></header>
  <main ref={mainRef} style={{gridTemplateColumns:`${split}fr 10px ${100-split}fr`}}>
   <section className="left">
    <div className="bar">
     <select value={ex} onChange={e=>{const i=+e.target.value;setEx(i);edit(EXAMPLES[i].code);}} aria-label="Example programs">{EXAMPLES.map((x,i)=><option key={i} value={i}>{x.name}</option>)}</select>
     <label className="spd">Speed <select value={speed} onChange={e=>setSpeed(e.target.value)}><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option></select></label>
    </div>
    <div className="bar btns">
     <button className="go" onClick={run} disabled={busy}>{busy?'Running…':'Run'}</button><button onClick={step} disabled={busy}>Step</button><button onClick={prev} disabled={idx<0}>Previous step</button>
     <button onClick={playing?()=>setPlaying(false):resume} disabled={!playing&&!(plan&&idx<last)}>{playing?'Pause':'Resume'}</button><button onClick={reset}>Reset</button>
    </div>
    <div className="editor" ref={box}><div className="inner" style={{width:`calc(${w}ch + 4rem)`,height:lines.length*LH+LH}}>
     {lines.map((l,i)=><div key={i} className={'ln'+(s&&s.line===i+1?' cur':'')+(errLine===i+1?' bad':'')}><span className="num">{i+1}</span><span>{tok[i]&&tok[i].length?tok[i].map((t,k)=>t[1]?<span key={k} className={'t-'+t[1]}>{t[0]}</span>:t[0]):'\u200b'}</span></div>)}
     <textarea value={code} onChange={e=>edit(e.target.value)} onKeyDown={onKey} spellCheck={false} wrap="off" aria-label="Python code editor"/>
    </div></div>
    <label className="stdin">Input for input() calls (one line per call)<textarea value={stdin} onChange={e=>{setStdin(e.target.value);setPlan(null);setIdx(-1);setPlaying(false);}} rows={3} spellCheck={false} placeholder={"P\nA\nP"}/></label>
   </section>
   <div className="gutter" onMouseDown={drag} title="Drag to resize the panels"/>
   <section className="right">
    <div className="card banner"><button className="tog" onClick={()=>setLearn(!learn)} aria-expanded={learn}>{learn?'Hide':'Show'} learning panel</button>{learn&&(s?<>
      <p><b>What</b> Line {s.line}: {s.text}</p><p><b>Why</b> {WHY[s.kind]}</p>{how&&<p><b>How</b> {how}</p>}</>:<p><b>Ready.</b> Each statement you run is explained here: what it does, why, and how.</p>)}</div>
    <div className="card stage" key={idx}><h2>Execution <span className="sub">what Python does in this step</span></h2><Stage s={s}/></div>
    <div className="card memc"><h2>Memory <span className="sub">global variables</span></h2><Memory s={s}/></div>
    <div className="card stackc"><h2>Call stack</h2><Stack s={s}/></div>
   </section>
  </main>
  <footer>
   <div className="console"><h2>Output</h2><pre>{(s?s.out:[]).join('\n')||'(nothing printed yet)'}</pre></div>
   <div className="console errc"><h2>Errors</h2><pre>{plan&&plan.stderr&&(!steps.length||idx===last||(s&&s.kind==='error'))?plan.stderr:'(no errors)'}</pre></div>
   <div className="status"><h2>Status</h2><p className={s&&s.kind==='error'||(plan&&!steps.length)?'bad':''}>{status}</p>
    <div className="tl">{steps.slice(0,400).map((st,i)=><button key={i} className={'dot '+st.kind+(i===idx?' on':i<idx?' past':'')} title={`Step ${i+1}, line ${st.line}`} onClick={()=>{setPlaying(false);setIdx(i);}}/>)}</div></div>
  </footer>
 </div>;}
