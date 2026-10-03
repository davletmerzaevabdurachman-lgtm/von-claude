import { useEffect, useRef, useState } from "react";
import Head from "next/head";

type RunnerLanguage = "html" | "javascript" | "python" | "css" | "typescript" | "json" | "text";
type Message = { role: "user" | "assistant"; content: string; kind?: "image"; imageUrl?: string };
type Chat = { id: string; title: string; messages: Message[] };

const FENCE = String.fromCharCode(96, 96, 96);
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.js";
const IDEAS = [
  "Baue mir eine moderne Gaming-Website",
  "Erkläre mir Quantencomputer einfach",
  "Schreibe einen Python-Taschenrechner",
  "Erstelle ein futuristisches TREXOR-Logo"
];

function makeId(){ try{return crypto.randomUUID();}catch{return String(Date.now())+"-"+Math.random();} }
function imageRequest(value:string){
  return /(erstell|generier|zeichn|mach|create|generate|draw).*(bild|image|foto|logo|grafik|illustration)/i.test(value);
}
function extractHtml(messages:Message[]){
  for(let i=messages.length-1;i>=0;i--){
    const m=messages[i];
    if(m.role!=="assistant"||m.kind==="image") continue;
    const marker=FENCE+"html";
    const start=m.content.toLowerCase().indexOf(marker);
    if(start<0) continue;
    const line=m.content.indexOf("\n",start);
    if(line<0) continue;
    const end=m.content.indexOf(FENCE,line+1);
    return m.content.slice(line+1,end<0?m.content.length:end);
  }
  return "";
}
async function copyText(value:string){try{await navigator.clipboard.writeText(value);}catch{}}

function Icon({name}:{name:string}){
  const map:Record<string,string>={
    spark:"M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z",
    run:"M8 5v14l11-7L8 5Z",
    copy:"M8 8h10v12H8zM5 15H4V4h11v1",
    image:"M4 5h16v14H4zM7 15l3-3 2 2 2-3 3 4",
    chat:"M4 5h16v11H8l-4 4V5Z",
    trash:"M6 7h12m-9 0v10m6-10v10M9 4h6l1 3H8l1-3Z",
    stop:"M7 7h10v10H7z",
    download:"M12 4v10m0 0 4-4m-4 4-4-4M5 20h14"
  };
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={map[name]||map.spark}/></svg>;
}

function CodeBlock({lang,code,onRun}:{lang:string;code:string;onRun:()=>void}){
  const [copied,setCopied]=useState(false);
  async function copy(){await copyText(code);setCopied(true);window.setTimeout(()=>setCopied(false),1000);}
  return <div className="code-card">
    <div className="code-head">
      <span>{lang||"code"}</span>
      <div className="code-actions">
        <button onClick={copy}><Icon name="copy"/>{copied?"Kopiert":"Kopieren"}</button>
        <button onClick={onRun}><Icon name="run"/>Run</button>
      </div>
    </div>
    <pre>{code}</pre>
  </div>;
}

function MessageView({message,onRun}:{message:Message;onRun:(l:RunnerLanguage,c:string)=>void}){
  if(message.kind==="image"&&message.imageUrl){
    return <div className="image-result">
      <img src={message.imageUrl} alt="TREXOR Bild"/>
      <a className="image-link" href={message.imageUrl} target="_blank" rel="noreferrer">Bild öffnen</a>
    </div>;
  }

  return <>{message.content.split(FENCE).map((part,i)=>{
    if(i%2===1){
      const lines=part.split("\n");
      const lang=(lines.shift()||"text").trim().toLowerCase();
      const code=lines.join("\n").trimEnd();
      return <CodeBlock key={i} lang={lang} code={code} onRun={()=>onRun(lang as RunnerLanguage,code)}/>;
    }
    const text=part.trim();
    return text?text.split(/\n{2,}/).map((p,j)=><p key={i+"-"+j}>{p}</p>):null;
  })}</>;
}

export default function Home(){
  const [screen,setScreen]=useState<"chat"|"run">("chat");
  const [chats,setChats]=useState<Chat[]>([]);
  const [activeId,setActiveId]=useState<string|null>(null);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [think,setThink]=useState(true);
  const [mode,setMode]=useState<"chat"|"image">("chat");
  const [runnerLanguage,setRunnerLanguage]=useState<RunnerLanguage>("html");
  const [runnerCode,setRunnerCode]=useState("<!doctype html>\n<html>\n<body>\n<h1>TREXOR</h1>\n</body>\n</html>");
  const [runnerHtml,setRunnerHtml]=useState("");
  const [runnerOutput,setRunnerOutput]=useState("");
  const [runnerBusy,setRunnerBusy]=useState(false);
  const [buildSecret,setBuildSecret]=useState("");
  const [buildStatus,setBuildStatus]=useState("");
  const [mobile,setMobile]=useState(false);
  const [reload,setReload]=useState(0);
  const [menu,setMenu]=useState(false);
  const abortRef=useRef<AbortController|null>(null);
  const endRef=useRef<HTMLDivElement>(null);
  const hydrated=useRef(false);
  const pyodide=useRef<any>(null);

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("trexor.chats.v7");
      const value=raw?JSON.parse(raw):[];
      if(Array.isArray(value)){setChats(value);setActiveId(value[0]?.id||null);}
    }catch{localStorage.removeItem("trexor.chats.v7");}
    hydrated.current=true;
  },[]);
  useEffect(()=>{
    if(!hydrated.current||busy)return;
    try{localStorage.setItem("trexor.chats.v7",JSON.stringify(chats.slice(0,40)));}catch{}
  },[chats,busy]);
  useEffect(()=>{const v=sessionStorage.getItem("trexor.builder.secret");if(v)setBuildSecret(v);},[]);
  useEffect(()=>{if(buildSecret)sessionStorage.setItem("trexor.builder.secret",buildSecret);},[buildSecret]);

  const chat=chats.find(x=>x.id===activeId);
  const messages=chat?.messages||[];
  const html=extractHtml(messages);

  useEffect(()=>{endRef.current?.scrollIntoView({block:"end"});},[messages.length,messages[messages.length-1]?.content.length]);

  async function runChat(chatId:string,history:Message[]){
    setBusy(true);
    const answerIndex=history.length;
    setChats(cur=>cur.map(c=>c.id===chatId?{...c,messages:[...c.messages,{role:"assistant",content:""}]}:c));
    const controller=new AbortController();
    abortRef.current=controller;

    try{
      const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({messages:history,think})});
      if(!r.ok||!r.body){
        let message="KI-Anfrage fehlgeschlagen.";
        try{message=(await r.json()).error||message;}catch{}
        throw new Error(message);
      }

      const reader=r.body.getReader();
      const decoder=new TextDecoder();
      let buffer="";
      while(true){
        const result=await reader.read();
        if(result.done)break;
        buffer+=decoder.decode(result.value,{stream:true});
        const lines=buffer.split("\n");
        buffer=lines.pop()||"";

        for(const line of lines){
          if(!line.startsWith("data: "))continue;
          const payload=line.slice(6).trim();
          if(!payload||payload==="[DONE]")continue;
          try{
            const delta=JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if(typeof delta!=="string"||!delta)continue;
            setChats(cur=>cur.map(c=>{
              if(c.id!==chatId)return c;
              const next=[...c.messages];
              next[answerIndex]={role:"assistant",content:(next[answerIndex]?.content||"")+delta};
              return {...c,messages:next};
            }));
            await new Promise(resolve=>window.setTimeout(resolve,18));
          }catch{}
        }
      }
    }catch(error){
      if(!(error instanceof Error&&error.name==="AbortError")){
        const message=error instanceof Error?error.message:"Unbekannter Fehler";
        setChats(cur=>cur.map(c=>{
          if(c.id!==chatId)return c;
          const next=[...c.messages];
          next[answerIndex]={role:"assistant",content:"**Fehler:** "+message};
          return {...c,messages:next};
        }));
      }
    }finally{abortRef.current=null;setBusy(false);}
  }

  async function generateImage(chatId:string,history:Message[]){
    setBusy(true);
    setChats(cur=>cur.map(c=>c.id===chatId?{...c,messages:[...c.messages,{role:"assistant",content:"Bild wird erstellt …"}]}:c));
    try{
      const prompt=history[history.length-1]?.content||"";
      const r=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})});
      if(!r.ok)throw new Error((await r.json()).error||"Bildgenerierung fehlgeschlagen.");
      const url=URL.createObjectURL(await r.blob());
      setChats(cur=>cur.map(c=>{
        if(c.id!==chatId)return c;
        const next=[...c.messages];
        next[next.length-1]={role:"assistant",content:"Bild erstellt.",kind:"image",imageUrl:url};
        return {...c,messages:next};
      }));
    }catch(error){
      const message=error instanceof Error?error.message:"Bildgenerierung fehlgeschlagen.";
      setChats(cur=>cur.map(c=>{
        if(c.id!==chatId)return c;
        const next=[...c.messages];
        next[next.length-1]={role:"assistant",content:"**Fehler:** "+message};
        return {...c,messages:next};
      }));
    }finally{setBusy(false);}
  }

  function send(value?:string){
    const text=(value??input).trim();
    if(!text||busy)return;
    const id=activeId||makeId();
    const history=[...(chat?.messages||[]),{role:"user" as const,content:text}];
    const wants=mode==="image"||imageRequest(text);

    setChats(cur=>{
      if(cur.some(c=>c.id===id))return cur.map(c=>c.id===id?{...c,messages:history}:c);
      return [{id,title:text.slice(0,42),messages:history},...cur];
    });
    setActiveId(id);
    setInput("");
    setScreen("chat");
    if(wants)generateImage(id,history);else runChat(id,history);
  }

  function openRun(lang:RunnerLanguage,code:string){
    setRunnerLanguage(lang==="js"?"javascript":lang==="ts"?"typescript":lang);
    setRunnerCode(code);
    setRunnerOutput("");
    setRunnerHtml("");
    setScreen("run");
  }

  async function ensurePython(){
    if(pyodide.current)return pyodide.current;
    if(typeof (window as any).loadPyodide!=="function"){
      await new Promise<void>((resolve,reject)=>{
        const script=document.createElement("script");
        script.src=PYODIDE_URL;
        script.onload=()=>resolve();
        script.onerror=()=>reject(new Error("Python-Engine konnte nicht geladen werden."));
        document.head.appendChild(script);
      });
    }
    pyodide.current=await (window as any).loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v314.0.7/full/"});
    return pyodide.current;
  }

  async function runCode(){
    setRunnerBusy(true);
    setRunnerOutput("");
    try{
      if(runnerLanguage==="html"){
        setRunnerHtml(runnerCode);
        setRunnerOutput("HTML ausgeführt.");
      }else if(runnerLanguage==="css"){
        setRunnerHtml("<!doctype html><html><body><div class='demo'>TREXOR CSS Preview</div><style>"+runnerCode+"</style></body></html>");
        setRunnerOutput("CSS ausgeführt.");
      }else if(runnerLanguage==="javascript"){
        const safe=runnerCode.replace(/<\/script/gi,"<\\/script");
        setRunnerHtml("<!doctype html><html><body><pre id='out'></pre><script>"+
          "const o=document.getElementById('out');const w=(...a)=>o.textContent+=a.map(v=>typeof v==='object'?JSON.stringify(v,null,2):String(v)).join(' ')+'\\n';"+
          "console.log=w;console.warn=w;console.error=w;try{"+safe+"}catch(e){w('ERROR:',e.message)}<\\/script></body></html>");
        setRunnerOutput("JavaScript ausgeführt.");
      }else if(runnerLanguage==="python"){
        const p=await ensurePython();
        const out:string[]=[];
        p.setStdout({batched:(v:string)=>out.push(v)});
        p.setStderr({batched:(v:string)=>out.push(v)});
        const result=p.runPython(runnerCode);
        if(result!==undefined&&result!==null)out.push(String(result));
        setRunnerOutput(out.join("\n")||"Python ausgeführt.");
      }else if(runnerLanguage==="json"){
        setRunnerOutput(JSON.stringify(JSON.parse(runnerCode),null,2));
      }else{
        setRunnerOutput("Diese Sprache kann nicht sicher direkt im Browser ausgeführt werden. Nutze Build.");
      }
    }catch(error){
      setRunnerOutput(error instanceof Error?error.message:"Run fehlgeschlagen.");
    }finally{setRunnerBusy(false);}
  }

  async function build(target:"exe"|"deb"|"apk"){
    setBuildStatus("Build wird gestartet …");
    try{
      const r=await fetch("/api/build",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        secret:buildSecret,code:runnerCode,language:runnerLanguage,target
      })});
      const data=await r.json();
      if(!r.ok)throw new Error(data?.error||"Build fehlgeschlagen.");
      setBuildStatus("Build gestartet. GitHub Actions öffnet gleich.");
      window.open(data.workflowUrl,"_blank","noopener,noreferrer");
    }catch(error){
      setBuildStatus(error instanceof Error?error.message:"Build fehlgeschlagen.");
    }
  }

  function newChat(){abortRef.current?.abort();setBusy(false);setActiveId(null);setInput("");setScreen("chat");setMenu(false);}
  function deleteChat(id:string){setChats(cur=>cur.filter(c=>c.id!==id));if(id===activeId)setActiveId(null);}
  function download(){
    const blob=new Blob([runnerCode],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=runnerLanguage==="python"?"main.py":runnerLanguage==="javascript"?"main.js":"index.html";a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  return <>
    <Head><title>TREXOR — AI Code Studio</title><meta name="theme-color" content="#030303"/></Head>
    <div className="shell">
      <aside className={"sidebar "+(menu?"open":"")}>
        <div className="brand"><div className="brand-mark">T</div><div><div className="brand-name">TREXOR</div><div className="brand-sub">AI CODE STUDIO</div></div></div>
        <button className="new-chat" onClick={newChat}><span>+</span>Neuer Chat</button>

        <div className="section-label">Workspace</div>
        <button className={"nav "+(screen==="chat"?"active":"")} onClick={()=>setScreen("chat")}><Icon name="chat"/>Chat</button>
        <button className={"nav "+(screen==="run"?"active":"")} onClick={()=>setScreen("run")}><Icon name="run"/>Run Studio</button>

        <div className="section-label">Chats</div>
        <nav className="history">{chats.map(c=><div className={"history-item "+(c.id===activeId?"active":"")} key={c.id}>
          <button className="history-title" onClick={()=>{setActiveId(c.id);setScreen("chat");setMenu(false);}}>{c.title}</button>
          <button className="delete" onClick={()=>deleteChat(c.id)} aria-label="Chat löschen"><Icon name="trash"/></button>
        </div>)}</nav>
        <div className="foot"><span/>Vercel online architecture</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={()=>setMenu(v=>!v)}>☰</button>
          <div><div className="kicker">{screen==="chat"?"CHAT":"RUN STUDIO"}</div><div className="current">{screen==="chat"?chat?.title||"Neuer Chat":"Code ausführen & bauen"}</div></div>
          <button className="top-switch" onClick={()=>setScreen(screen==="chat"?"run":"chat")}><Icon name={screen==="chat"?"run":"chat"}/>{screen==="chat"?"Run":"Chat"}</button>
        </header>

        {screen==="chat"?<section className="chat-view">
          <div className="messages">
            {!messages.length?<div className="welcome">
              <div className="orb"><div>T</div><i/><i/><i/></div>
              <div className="eyebrow">TREXOR AI</div>
              <h1>Was bauen wir heute?</h1>
              <p>Code, Websites, Bilder und Ideen in einem Workspace.</p>
              <div className="ideas">{IDEAS.map(x=><button key={x} onClick={()=>send(x)}><span>{x}</span><Icon name="spark"/></button>)}</div>
            </div>:messages.map((m,i)=><div className={"message "+m.role} key={i}>
              {m.role==="user"?<div className="user-bubble">{m.content}</div>:<div className="assistant">
                {!m.content&&busy?<div className="thinking"><i/><i/><i/>TREXOR schreibt …</div>:null}
                <MessageView message={m} onRun={openRun}/>
                {m.content&&i===messages.length-1&&!busy?<div className="tools-row"><button onClick={()=>copyText(m.content)}><Icon name="copy"/>Kopieren</button>{m.kind!=="image"?<button onClick={()=>runChat(activeId||"",messages.slice(0,-1))}><Icon name="run"/>Neu generieren</button>:null}</div>:null}
              </div>}
            </div>)}
            <div ref={endRef}/>
          </div>

          <div className="composer-wrap">
            <div className="mode-row">
              <button className={mode==="chat"?"selected":""} onClick={()=>setMode("chat")}><Icon name="spark"/>Chat</button>
              <button className={mode==="image"?"selected":""} onClick={()=>setMode("image")}><Icon name="image"/>Bild</button>
              <button onClick={()=>setScreen("run")}><Icon name="run"/>Run Studio</button>
            </div>
            <div className="composer">
              <textarea value={input} rows={1} placeholder={mode==="image"?"Beschreibe dein Bild …":"Frag TREXOR etwas oder gib einen Coding-Auftrag …"} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}/>
              <button className="think" onClick={()=>setThink(v=>!v)}>{think?"Think ON":"Think OFF"}</button>
              {busy?<button className="send stop" onClick={()=>abortRef.current?.abort()}><Icon name="stop"/></button>:<button className="send" disabled={!input.trim()} onClick={()=>send()}><Icon name="spark"/></button>}
            </div>
          </div>
        </section>:<section className="run-view">
          <div className="run-title">
            <div><div className="eyebrow">RUN STUDIO</div><h2>Code → Run → Build</h2><p>HTML, CSS, JavaScript und Python laufen direkt im Browser. App-Builds werden als GitHub-Action gestartet.</p></div>
            <button className="top-switch" onClick={download}><Icon name="download"/>Download</button>
          </div>

          <div className="runner">
            <section className="editor-card">
              <div className="editor-bar">
                <div className="langs">{(["html","javascript","python","css","typescript","json"] as RunnerLanguage[]).map(l=><button key={l} className={runnerLanguage===l?"on":""} onClick={()=>setRunnerLanguage(l)}>{l}</button>)}</div>
                <button className="primary" disabled={runnerBusy} onClick={runCode}><Icon name="run"/>{runnerBusy?"Läuft …":"Run"}</button>
              </div>
              <textarea className="editor" spellCheck={false} value={runnerCode} onChange={e=>setRunnerCode(e.target.value)}/>
            </section>

            <section className="preview-card">
              <div className="preview-bar"><span>OUTPUT</span><div><button onClick={()=>setMobile(v=>!v)}>{mobile?"Desktop":"Mobil"}</button><button onClick={()=>setReload(v=>v+1)}>Neu laden</button></div></div>
              <div className="preview">
                {runnerHtml?<iframe key={reload} className={mobile?"phone":""} title="TREXOR Preview" sandbox="allow-scripts" srcDoc={runnerHtml}/>:null}
                {runnerOutput?<pre className="output">{runnerOutput}</pre>:null}
                {!runnerHtml&&!runnerOutput?<div className="empty"><Icon name="run"/><span>Run drücken, um dein Ergebnis zu sehen.</span></div>:null}
              </div>
            </section>
          </div>

          <section className="build">
            <div><div className="eyebrow">BUILD</div><h3>EXE • DEB • APK</h3><p>HTML/Web-App → EXE, DEB oder APK. Python → EXE.</p></div>
            <div className="build-panel">
              <input type="password" value={buildSecret} placeholder="Builder Secret" onChange={e=>setBuildSecret(e.target.value)}/>
              <div className="build-buttons">
                <button onClick={()=>build("exe")}>EXE</button>
                <button disabled={runnerLanguage!=="html"} onClick={()=>build("deb")}>DEB</button>
                <button disabled={runnerLanguage!=="html"} onClick={()=>build("apk")}>APK</button>
              </div>
              {buildStatus?<div className="build-status">{buildStatus}</div>:null}
            </div>
          </section>
        </section>}
      </main>
    </div>
  </>;
}
