import { useEffect, useState } from "react";
import Head from "next/head";

type Tool =
  | "runner"
  | "json"
  | "base64"
  | "url"
  | "hash"
  | "text"
  | "regex";

const PYODIDE_JS="https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.js";
const PYODIDE_INDEX="https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

const tools:{id:Tool;name:string;desc:string}[]=[
  {id:"runner",name:"Python Runner",desc:"Python direkt im Browser ausführen"},
  {id:"json",name:"JSON Tool",desc:"JSON formatieren und prüfen"},
  {id:"base64",name:"Base64",desc:"Text codieren oder decodieren"},
  {id:"url",name:"URL Tool",desc:"URL encode / decode"},
  {id:"hash",name:"Hash",desc:"SHA-256 / SHA-1 berechnen"},
  {id:"text",name:"Text Tools",desc:"Zeichen, Wörter und Zeilen zählen"},
  {id:"regex",name:"Regex Tester",desc:"Reguläre Ausdrücke testen"}
];

type Pyodide={setStdout:(x:{batched:(v:string)=>void})=>void;setStderr:(x:{batched:(v:string)=>void})=>void;runPython:(x:string)=>unknown};

async function hash(value:string,algorithm:"SHA-256"|"SHA-1"){
  const data=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest(algorithm,data);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

export default function PythonMultiTool(){
  const [tool,setTool]=useState<Tool>("runner");
  const [input,setInput]=useState('print("Hello from TREXOR")\\nfor i in range(5):\\n    print(i)');
  const [output,setOutput]=useState("");
  const [busy,setBusy]=useState(false);
  const [pythonReady,setPythonReady]=useState(false);
  const [py,setPy]=useState<Pyodide|null>(null);
  const [regex,setRegex]=useState("\\\\bPython\\\\b");
  const [flags,setFlags]=useState("gi");
  const [hashType,setHashType]=useState<"SHA-256"|"SHA-1">("SHA-256");

  useEffect(()=>{
    if(tool!=="runner"||py)return;
    let mounted=true;
    const load=async()=>{
      try{
        if(typeof (window as any).loadPyodide!=="function"){
          await new Promise<void>((resolve,reject)=>{
            const s=document.createElement("script");
            s.src=PYODIDE_JS;s.async=true;
            s.onload=()=>resolve();
            s.onerror=()=>reject(new Error("Python-Engine konnte nicht geladen werden."));
            document.head.appendChild(s);
          });
        }
        const loader=(window as any).loadPyodide;
        if(typeof loader!=="function")throw new Error("Python-Engine nicht verfügbar.");
        const instance=await loader({indexURL:PYODIDE_INDEX});
        if(mounted){setPy(instance);setPythonReady(true);}
      }catch(e){
        if(mounted)setOutput(e instanceof Error?e.message:"Python konnte nicht geladen werden.");
      }
    };
    void load();
    return()=>{mounted=false};
  },[tool,py]);

  async function execute(){
    setBusy(true);
    setOutput("");
    try{
      if(tool==="runner"){
        if(!py){setOutput("Python wird noch geladen …");return;}
        const lines:string[]=[];
        py.setStdout({batched:v=>lines.push(v)});
        py.setStderr({batched:v=>lines.push(v)});
        const value=py.runPython(input);
        if(value!==undefined&&value!==null)lines.push(String(value));
        setOutput(lines.join("\\n")||"Fertig — keine Ausgabe.");
      }else if(tool==="json"){
        setOutput(JSON.stringify(JSON.parse(input),null,2));
      }else if(tool==="base64"){
        try{
          setOutput(atob(input));
        }catch{
          setOutput(btoa(unescape(encodeURIComponent(input))));
        }
      }else if(tool==="url"){
        setOutput(decodeURIComponent(input));
      }else if(tool==="hash"){
        setOutput(await hash(input,hashType));
      }else if(tool==="text"){
        const chars=input.length;
        const words=input.trim()?input.trim().split(/\\s+/).length:0;
        const lines=input?input.split(/\\r?\\n/).length:0;
        setOutput([
          "Zeichen: "+chars,
          "Wörter: "+words,
          "Zeilen: "+lines,
          "Bytes (UTF-8): "+new TextEncoder().encode(input).length
        ].join("\\n"));
      }else if(tool==="regex"){
        const parsedFlags=flags.replace(/[^dgimsuvy]/g,"");
        const re=new RegExp(regex,parsedFlags);
        const matches=[...input.matchAll(new RegExp(re.source,re.flags.includes("g")?re.flags:re.flags+"g"))];
        setOutput(matches.length?matches.map((m,i)=>\`Match \${i+1}: \${m[0]} (Index \${m.index})\`).join("\\n"):"Keine Treffer.");
      }
    }catch(e){
      setOutput(e instanceof Error?"ERROR: "+e.message:"Fehler.");
    }finally{setBusy(false);}
  }

  async function copy(){
    await navigator.clipboard?.writeText(output);
  }

  function download(){
    const blob=new Blob([input],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=tool==="runner"?"main.py":"input.txt";a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  function selectTool(id:Tool){
    setTool(id);setOutput("");
  }

  return <>
    <Head>
      <title>TREXOR Python Multi Tool</title>
      <meta name="description" content="Standalone Python and developer multi tool"/>
      <meta name="theme-color" content="#050507"/>
    </Head>

    <div className="tool-page">
      <header className="tool-top">
        <a href="/" className="brand">
          <span>T</span>
          <div><b>TREXOR</b><small>PYTHON MULTI TOOL</small></div>
        </a>
        <div className="top-links"><a href="/">TREXOR</a></div>
      </header>

      <main className="tool-main">
        <section className="hero">
          <div className="tag">DEVELOPER TOOLKIT</div>
          <h1>Python Multi Tool</h1>
          <p>Ein eigenständiges Toolkit. Keine KI nötig.</p>
        </section>

        <div className="layout">
          <aside className="tool-nav">
            <div className="nav-title">TOOLS</div>
            {tools.map(t=>
              <button key={t.id} className={tool===t.id?"active":""} onClick={()=>selectTool(t.id)}>
                <strong>{t.name}</strong>
                <small>{t.desc}</small>
              </button>
            )}
          </aside>

          <section className="workspace">
            <div className="workspace-top">
              <div>
                <div className="tag">{tools.find(t=>t.id===tool)?.name}</div>
                <h2>{tool==="runner"?"Python Runner":"Werkzeug öffnen"}</h2>
              </div>
              <div className="actions">
                {tool==="hash"&&
                  <select value={hashType} onChange={e=>setHashType(e.target.value as "SHA-256"|"SHA-1")}>
                    <option>SHA-256</option><option>SHA-1</option>
                  </select>}
                {tool==="regex"&&<input className="small-input" value={regex} onChange={e=>setRegex(e.target.value)} placeholder="Regex"/>}
                {tool==="regex"&&<input className="small-input" value={flags} onChange={e=>setFlags(e.target.value)} placeholder="Flags"/>}
                <button className="ghost" onClick={download}>Download</button>
                <button className="primary" onClick={execute} disabled={busy||(tool==="runner"&&!pythonReady)}>
                  {busy?"Läuft …":tool==="runner"&&!pythonReady?"Python lädt …":"Ausführen"}
                </button>
              </div>
            </div>

            <div className="editor-grid">
              <div className="pane">
                <div className="pane-head"><span>INPUT</span>{tool==="runner"&&<span className={pythonReady?"ok":""}>{pythonReady?"Python bereit":"Lade Python"}</span>}</div>
                <textarea value={input} onChange={e=>setInput(e.target.value)} spellCheck={false}/>
              </div>
              <div className="pane">
                <div className="pane-head"><span>OUTPUT</span><button onClick={copy}>Kopieren</button></div>
                <pre className="output">{output||"Noch keine Ausgabe."}</pre>
              </div>
            </div>

            <div className="tips">
              <span>●</span>
              {tool==="runner"?"Python läuft lokal im Browser über Pyodide.":"Dieses Tool arbeitet direkt im Browser und sendet deine Eingabe nicht an eine KI."}
            </div>
          </section>
        </div>
      </main>
    </div>
  </>;
}
