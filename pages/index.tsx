import { useEffect, useRef, useState, type ReactNode } from "react";
import Head from "next/head";

type Lang = "html" | "javascript" | "python" | "css" | "typescript" | "json" | "discord";
type Msg = { role:"user"|"assistant"; content:string; imageUrl?:string; attachmentUrl?:string };
type Chat = { id:string; title:string; messages:Msg[] };

const FENCE = String.fromCharCode(96,96,96);
const PYODIDE_JS = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.js";
const COMMON_PY_PACKAGES = ["numpy","pandas","matplotlib","scipy","sympy","scikit-learn","requests","beautifulsoup4","pillow"];
const ideas = [
  "Baue eine moderne Gaming-Website mit Animationen",
  "Schreibe einen Python-Taschenrechner",
  "Erstelle ein futuristisches Dashboard",
  "Erstelle ein Bild von einem neonfarbenen Cyberpunk-Stadtbild"
];

function uid(){ try{return crypto.randomUUID();}catch{return Date.now()+"-"+Math.random().toString(36).slice(2);} }
function extractBlocks(text:string){
  const blocks:{lang:string;code:string}[]=[];
  const re=/```([\w+-]*)\s*\n?([\s\S]*?)```/g;
  let match;
  while((match=re.exec(text))) blocks.push({lang:(match[1]||"text").toLowerCase(),code:match[2].trimEnd()});
  return blocks;
}
function firstHtml(messages:Msg[]){
  for(let i=messages.length-1;i>=0;i--){
    if(messages[i].role!=="assistant") continue;
    const html=extractBlocks(messages[i].content).find(x=>x.lang==="html");
    if(html?.code) return html.code;
  }
  return "";
}
async function copyText(value:string){
  try{await navigator.clipboard.writeText(value);}catch{
    const t=document.createElement("textarea"); t.value=value; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
  }
}

function Icon({name}:{name:string}){
  const d:Record<string,string>={
    spark:"M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z",
    play:"M8 5v14l11-7L8 5Z",
    copy:"M8 8h10v12H8zM5 15H4V4h11v1",
    image:"M4 5h16v14H4zM7 15l3-3 2 2 2-3 3 4",
    code:"M9 7 5 12l4 5M15 7l4 5-4 5",
    chat:"M4 5h16v11H8l-4 4V5Z",
    trash:"M6 7h12M9 7v10M15 7v10M9 4h6l1 3H8l1-3Z",
    download:"M12 4v11m0 0 4-4m-4 4-4-4M5 20h14",
    stop:"M7 7h10v10H7z"
  };
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d[name]||d.spark}/></svg>;
}

function CodeCard({lang,code,onRun}:{lang:string;code:string;onRun:()=>void}){
  const [copied,setCopied]=useState(false);
  async function copy(){await copyText(code);setCopied(true);setTimeout(()=>setCopied(false),900);}
  return <div className="code-card">
    <div className="code-head">
      <span>{lang||"code"}</span>
      <div className="code-actions">
        <button onClick={copy}><Icon name="copy"/>{copied?"Kopiert":"Kopieren"}</button>
        <button onClick={onRun}><Icon name="play"/>Run</button>
      </div>
    </div>
    <pre>{code}</pre>
  </div>;
}

function cleanAssistantText(text:string){
  return text.split(FENCE).map((part,index)=>index%2===1?part:part.replace(/\*\*([^*]+)\*\*/g,"$1")).join(FENCE);
}

function AssistantText({text,onRun}:{text:string;onRun:(lang:Lang,code:string)=>void}){
  text=cleanAssistantText(text);
  const re=/```([\w+-]*)\s*\n?([\s\S]*?)```/g;
  const parts:ReactNode[]=[];
  let last=0, index=0, match;
  while((match=re.exec(text))){
    const before=text.slice(last,match.index).trim();
    if(before) parts.push(<p key={"p"+index++}>{before}</p>);
    const lang=(match[1]||"text").toLowerCase();
    const code=match[2].trimEnd();
    parts.push(<CodeCard key={"c"+index++} lang={lang} code={code} onRun={()=>onRun(lang as Lang,code)}/>);
    last=match.index+match[0].length;
  }
  const tail=text.slice(last).trim();
  if(tail) parts.push(<p key={"p"+index++}>{tail}</p>);
  return <>{parts}</>;
}

export default function Home(){
  const [chats,setChats]=useState<Chat[]>([]);
  const [active,setActive]=useState<string|null>(null);
  const [input,setInput]=useState("");
  const [attachment,setAttachment]=useState<string|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false);
  const [think,setThink]=useState(true);
  const [speed,setSpeed]=useState<"fast"|"balanced"|"deep">("balanced");
  const [mode,setMode]=useState<"chat"|"image"|"homework">("chat");
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [appearance,setAppearance]=useState({bg:"#050509",text:"#f5f5f8",accent:"#ff1493",backgroundImage:"",font:"Inter"});
  const [screen,setScreen]=useState<"chat"|"run">("chat");
  const [lang,setLang]=useState<Lang>("html");
  const [code,setCode]=useState("<!doctype html>\n<html><body><h1>Abduls AI</h1></body></html>");
  const [preview,setPreview]=useState("");
  const [output,setOutput]=useState("");
  const [running,setRunning]=useState(false);
  const [secret,setSecret]=useState("");
  const [buildMsg,setBuildMsg]=useState("");
  const [menu,setMenu]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [reload,setReload]=useState(0);
  const end=useRef<HTMLDivElement>(null);
  const abort=useRef<AbortController|null>(null);
  const py=useRef<any>(null);
  const loaded=useRef(false);

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("abduls-ai.chats.v1");
      const value=raw?JSON.parse(raw):[];
      if(Array.isArray(value)){setChats(value);setActive(value[0]?.id||null);}
    }catch{localStorage.removeItem("abduls-ai.chats.v1");}
    loaded.current=true;
  },[]);
  useEffect(()=>{
    if(!loaded.current||busy)return;
    try{
      const persistable=chats.slice(0,30).map(chat=>({
        ...chat,
        messages:chat.messages.map(message=>({
          role:message.role,
          content:message.content,
          // Large base64 image payloads must never fill localStorage.
          attachmentUrl:undefined,
          imageUrl:undefined
        }))
      }));
      localStorage.setItem("abduls-ai.chats.v1",JSON.stringify(persistable));
    }catch{}
  },[chats,busy]);
  useEffect(()=>{const s=sessionStorage.getItem("trexor.build.secret");if(s)setSecret(s);},[]);
  useEffect(()=>{if(secret)sessionStorage.setItem("trexor.build.secret",secret);},[secret]);
  useEffect(()=>{
    try{
      const raw=localStorage.getItem("abduls-ai.settings.v1");
      if(raw){
        const saved=JSON.parse(raw);
        if(saved?.speed==="fast"||saved?.speed==="balanced"||saved?.speed==="deep") setSpeed(saved.speed);
        if(saved?.appearance) setAppearance(v=>({...v,...saved.appearance}));
      }
    }catch{}
  },[]);
  useEffect(()=>{
    document.documentElement.style.setProperty("--user-bg",appearance.bg);
    document.documentElement.style.setProperty("--user-text",appearance.text);
    document.documentElement.style.setProperty("--user-accent",appearance.accent);
    document.documentElement.style.setProperty("--user-bg-image",appearance.backgroundImage ? 'url("' + appearance.backgroundImage + '")' : "none");
    document.documentElement.style.setProperty("--user-font",appearance.font);
    try{localStorage.setItem("abduls-ai.settings.v1",JSON.stringify({speed,appearance}));}catch{}
  },[speed,appearance]);

  const current=chats.find(x=>x.id===active);
  const messages=current?.messages||[];
  const html=firstHtml(messages);
  useEffect(()=>{end.current?.scrollIntoView({block:"end"});},[messages.length,messages[messages.length-1]?.content]);

  async function askImage(chatId:string,history:Msg[]){
    setBusy(true);
    try{
      const r=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:history[history.length-1]?.content||""})});
      if(!r.ok){const d=await r.json().catch(()=>null);throw new Error(d?.error||"Bildgenerierung fehlgeschlagen.");}
      const data=await r.json();
      const url=String(data?.imageUrl||"");
      if(!url) throw new Error("Gemini hat kein Bild zurückgegeben.");
      setChats(c=>c.map(x=>x.id===chatId?{...x,messages:[...x.messages,{role:"assistant",content:"",imageUrl:url}]}:x));
    }catch(e){
      const msg=e instanceof Error?e.message:"Bildgenerierung fehlgeschlagen.";
      setChats(c=>c.map(x=>x.id===chatId?{...x,messages:[...x.messages,{role:"assistant",content:"**Fehler:** "+msg}]}:x));
    }finally{setBusy(false);}
  }

  async function askAi(chatId:string,history:Msg[],imageAttachment:string|null=null){
    setBusy(true);
    const index=history.length;
    setChats(c=>c.map(x=>x.id===chatId?{...x,messages:[...x.messages,{role:"assistant",content:""}]}:x));
    const controller=new AbortController(); abort.current=controller;
    try{
      const r=await fetch("/api/chat",{
        method:"POST",
        signal:controller.signal,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({messages:history,think,homework:mode==="homework",speed,images: imageAttachment ? [imageAttachment] : []})
      });
      const data=await r.json().catch(()=>null);
      if(!r.ok) throw new Error(data?.error||"KI-Anfrage fehlgeschlagen.");
      const content=String(data?.content||"");
      if(!content.trim()) throw new Error("Abduls AI hat keine Antwort erhalten.");

      // Smooth local typewriter effect; the server itself returns a complete, reliable JSON response.
      for(let i=0;i<content.length;i+=4){
        if(controller.signal.aborted) throw new DOMException("Aborted","AbortError");
        const part=content.slice(0,Math.min(i+4,content.length));
        setChats(c=>c.map(x=>{
          if(x.id!==chatId)return x;
          const next=[...x.messages];
          next[index]={role:"assistant",content:part};
          return {...x,messages:next};
        }));
        await new Promise(resolve=>setTimeout(resolve,12));
      }
    }catch(e){
      if(!(e instanceof Error&&e.name==="AbortError")){
        const msg=e instanceof Error?e.message:"Unbekannter Fehler.";
        setChats(c=>c.map(x=>{
          if(x.id!==chatId)return x;
          const next=[...x.messages];
          next[index]={role:"assistant",content:"**Fehler:** "+msg};
          return {...x,messages:next};
        }));
      }
    }finally{abort.current=null;setBusy(false);}
  }

  function chooseImage(file?:File){
    if(!file || !file.type.startsWith("image/")) return;
    if(file.size>8*1024*1024){ alert("Das Bild ist zu groß. Maximal 8 MB."); return; }
    const reader=new FileReader();
    reader.onload=()=>setAttachment(String(reader.result||""));
    reader.readAsDataURL(file);
  }

  function send(value?:string){
    const text=(value??input).trim(); if((!text&&!attachment)||busy)return;
    const id=active||uid();
    const history=[...(current?.messages||[]),{role:"user" as const,content:text,attachmentUrl:attachment||undefined}];
    const wantsImage=mode==="image"||/(erstell|generier|zeichn|mach|create|generate|draw).*(bild|image|foto|logo|grafik|illustration)/i.test(text);
    setChats(c=>c.some(x=>x.id===id)?c.map(x=>x.id===id?{...x,messages:history}:x):[{id,title:text.slice(0,44),messages:history},...c]);
    setActive(id);setInput("");setAttachment(null);setScreen("chat");
    if(wantsImage)askImage(id,history);else askAi(id,history,attachment);
  }

  function openRun(l:Lang,c:string){
    setLang(l);setCode(c);setPreview("");setOutput("");setScreen("run");
  }

  async function ensurePy(){
    if(py.current)return py.current;
    if(typeof (window as any).loadPyodide!=="function"){
      await new Promise<void>((resolve,reject)=>{
        const s=document.createElement("script");s.src=PYODIDE_JS;s.onload=()=>resolve();s.onerror=()=>reject(new Error("Python-Engine konnte nicht geladen werden."));document.head.appendChild(s);
      });
    }
    py.current=await (window as any).loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v314.0.7/full/"});
    await py.current.loadPackage(COMMON_PY_PACKAGES);
    return py.current;
  }

  async function run(){
    setRunning(true);setOutput("");
    try{
      if(lang==="html"){setPreview(code);setOutput("HTML ausgeführt.");}
      else if(lang==="css"){setPreview("<html><body><div class='box'>Abduls AI CSS Preview</div><style>"+code+"</style></body></html>");setOutput("CSS ausgeführt.");}
      else if(lang==="javascript"){
        const safe=code.split("</script").join("<\\/script");
        setPreview("<html><body><pre id='o'></pre><script>const o=document.getElementById('o');const w=(...a)=>o.textContent+=a.join(' ')+'\\\\n';console.log=w;try{"+safe+"}catch(e){w('ERROR',e.message)}<\\\\/script></body></html>");
        setOutput("JavaScript ausgeführt.");
      }else if(lang==="python"){
        const p=await ensurePy(),out:string[]=[];
        p.setStdout({batched:(v:string)=>out.push(v)});p.setStderr({batched:(v:string)=>out.push(v)});
        await p.loadPackagesFromImports(code);
        const result=await p.runPythonAsync(code);
        if(result!==undefined&&result!==null)out.push(String(result));
        setOutput(out.join("\\n")||"Python ausgeführt.");
      }else if(lang==="json"){setOutput(JSON.stringify(JSON.parse(code),null,2));}
      else if(lang==="discord"){setOutput("Discord Bot vorbereitet. Für einen dauerhaft laufenden Bot außerhalb von Vercel: DISCORD_TOKEN setzen und npm run discord:bot auf einem dauerhaften Node-Host starten.");}
      else setOutput("Diese Sprache wird im Browser nicht direkt ausgeführt. Nutze Build.");
    }catch(e){setOutput(e instanceof Error?e.message:"Run fehlgeschlagen.");}
    finally{setRunning(false);}
  }

  async function build(target:"exe"|"deb"|"apk"){
    setBuildMsg("Build wird gestartet …");
    try{
      const r=await fetch("/api/build",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret,code,language:lang,target})});
      const d=await r.json();
      if(!r.ok)throw new Error(d?.error||"Build fehlgeschlagen.");
      setBuildMsg("Build gestartet. GitHub Actions wird geöffnet.");
      window.open(d.workflowUrl,"_blank","noopener,noreferrer");
    }catch(e){setBuildMsg(e instanceof Error?e.message:"Build fehlgeschlagen.");}
  }

  function newChat(){abort.current?.abort();setBusy(false);setActive(null);setInput("");setAttachment(null);setScreen("chat");setMenu(false);}

  return <><Head><title>Abduls AI</title><meta name="theme-color" content="#ff1493"/></Head>
    <div className="app">
      <aside className={"sidebar "+(menu?"open":"")}>
        <div className="brand"><div className="brand-logo">A</div><div><b>ABDULS AI</b><small>DEIN PERSÖNLICHER ASSISTENT</small></div></div>
        <button className="new" onClick={newChat}><span>+</span> Neuer Chat</button>
        <div className="label">Workspace</div>
        <button className={"nav "+(screen==="chat"?"active":"")} onClick={()=>setScreen("chat")}><Icon name="chat"/>Chat</button>
        <button className={"nav "+(screen==="run"?"active":"")} onClick={()=>setScreen("run")}><Icon name="play"/>Run Studio</button>
        <div className="label">Verlauf</div>
        <nav className="history">{chats.map(x=><div key={x.id} className={"history-item "+(x.id===active?"active":"")}><button onClick={()=>{setActive(x.id);setScreen("chat");setMenu(false);}}>{x.title}</button><button className="del" onClick={()=>{setChats(c=>c.filter(y=>y.id!==x.id));if(x.id===active)setActive(null);}}><Icon name="trash"/></button></div>)}</nav>
        <div className="online"><i/>Abduls AI ist bereit</div>
      </aside>

      <main className="main">
        <header className="top"><button className="menu" onClick={()=>setMenu(v=>!v)}>☰</button><div><small>{screen==="chat"?"ABDULS AI":"ABDULS AI • RUN STUDIO"}</small><span>{screen==="chat"?current?.title||"Neuer Chat":"Code ausführen & bauen"}</span></div><button className="settings-button" onClick={()=>setSettingsOpen(true)} title="Einstellungen">⚙</button><button className="toprun" onClick={()=>setScreen(screen==="chat"?"run":"chat")}><Icon name={screen==="chat"?"play":"chat"}/>{screen==="chat"?"Run":"Chat"}</button></header>

        {screen==="chat"?<section className="chat">
          <div className="messages">
            {!messages.length?<div className="hero dashboard-hero command-dashboard">
  <div className="command-top">
    <div className="command-brand"><div className="command-mark">A</div><div><span>ABDULS AI</span><h1>Was möchtest du heute machen?</h1><p>Chatten, lernen, Bilder erstellen oder Code direkt ausführen.</p></div></div>
    <div className="command-badge"><i/>ONLINE</div>
  </div>
  <div className="command-status">
    <div><span>KI</span><strong>Automatisch</strong></div>
    <div><span>ANTWORT</span><strong>{speed==="fast"?"Schnell":speed==="deep"?"Tief":"Ausgewogen"}</strong></div>
    <div><span>SCHULE</span><strong>Bereit zum Lernen</strong></div>
  </div>
  <div className="command-grid">
    <button onClick={()=>setMode("chat")}><b><Icon name="spark"/></b><span><strong>Chat</strong><small>Fragen, Ideen & Code</small></span><em>→</em></button>
    <button onClick={()=>setMode("homework")}><b><Icon name="code"/></b><span><strong>Hausaufgaben</strong><small>Aufgabe erklären & lösen</small></span><em>→</em></button>
    <button onClick={()=>{setMode("image");setScreen("chat")}}><b><Icon name="image"/></b><span><strong>Bilder</strong><small>Ideen sichtbar machen</small></span><em>→</em></button>
    <button onClick={()=>setScreen("run")}><b><Icon name="play"/></b><span><strong>Run Studio</strong><small>Code testen & bauen</small></span><em>→</em></button>
  </div>
  <div className="command-prompts"><div className="ideas-title"><span>Schnell starten</span><small>Ein Klick genügt</small></div><div className="ideas">{ideas.map(x=><button key={x} onClick={()=>send(x)}><span>{x}</span><Icon name="spark"/></button>)}</div></div>
</div>:messages.map((m,i)=><div key={i} className={"row "+m.role}><div className={m.role==="user"?"bubble":"answer"}>
              {m.role==="user"&&m.attachmentUrl?<img className="attachment-user" src={m.attachmentUrl} alt="Hochgeladenes Bild"/>:null}{m.imageUrl?<><img className="generated" src={m.imageUrl} alt="Generiertes Bild"/><a className="image-open" href={m.imageUrl} target="_blank" rel="noreferrer">Bild öffnen</a></>:m.content?<AssistantText text={m.content} onRun={openRun}/>:busy?<div className="typing"><i/><i/><i/>Abduls AI schreibt …</div>:null}
              {m.role==="assistant"&&m.content&&!busy&&i===messages.length-1?<div className="message-actions"><button onClick={()=>copyText(m.content)}><Icon name="copy"/>Kopieren</button></div>:null}
            </div></div>)}
            <div ref={end}/>
          </div>
          <div className="composer-wrap">
            <div className="modes"><button className={mode==="chat"?"on":""} onClick={()=>setMode("chat")}><Icon name="spark"/>Chat</button><button className={mode==="homework"?"on":""} onClick={()=>setMode("homework")}><Icon name="code"/>Schule</button><button className={mode==="image"?"on":""} onClick={()=>setMode("image")}><Icon name="image"/>Bild</button><button onClick={()=>setScreen("run")}><Icon name="play"/>Run Studio</button><span/><button className="think" onClick={()=>setSettingsOpen(true)}>⚙ Einstellungen</button></div>
            <div className="composer"><input ref={fileRef} type="file" accept="image/*" hidden onChange={e=>chooseImage(e.target.files?.[0])}/>{attachment?<div className="attachment"><img src={attachment} alt="Upload"/><button onClick={()=>setAttachment(null)}>×</button></div>:null}<button className="attach" onClick={()=>fileRef.current?.click()} title="Bild hochladen"><Icon name="image"/></button><textarea rows={1} value={input} placeholder={mode==="image"?"Was soll Abduls AI erstellen?":mode==="homework"?"Hausaufgabe eingeben oder Arbeitsblatt hochladen …":"Schreib deine Frage, Idee oder Aufgabe …"} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}/>{busy?<button className="send stop" onClick={()=>abort.current?.abort()}><Icon name="stop"/></button>:<button className="send" disabled={!input.trim()&&!attachment} onClick={()=>send()}><Icon name="spark"/></button>}</div>
          </div>
        </section>:<section className="run">
          <div className="run-head"><div><em>Abduls AI RUN STUDIO</em><h2>Code → Run → Build</h2><p>Live-Preview für Web-Code und Python direkt im Browser. Häufige Python-Pakete werden beim ersten Python-Run vorgeladen. Discord-Bots laufen als eigener Node-Prozess.</p></div><button className="toprun" onClick={()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([code],{type:"text/plain"}));a.download=lang==="python"?"main.py":lang==="javascript"?"main.js":"index.html";a.click();}}><Icon name="download"/>Download</button></div>
          <div className="studio">
            <section className="editor"><div className="editor-head"><div className="langs">{(["html","javascript","python","css","typescript","json","discord"] as Lang[]).map(x=><button key={x} className={lang===x?"on":""} onClick={()=>setLang(x)}>{x}</button>)}</div><button className="primary" onClick={run} disabled={running}><Icon name="play"/>{running?"Läuft …":"Run"}</button><button className="toprun" onClick={()=>{setLang("discord");setCode(`import { Client, Events, GatewayIntentBits } from "discord.js";\n\nconst token = process.env.DISCORD_TOKEN;\nconst client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });\nclient.once(Events.ClientReady, ready => console.log("Online:", ready.user.tag));\nclient.on(Events.MessageCreate, message => { if (!message.author.bot && message.content === "!ping") message.reply("Pong!"); });\nclient.login(token);`);setOutput("");setPreview("");}}>Discord Bot</button></div><textarea spellCheck={false} value={code} onChange={e=>setCode(e.target.value)}/></section>
            <section className="preview"><div className="preview-head"><span>OUTPUT</span><div><button onClick={()=>setMobile(v=>!v)}>{mobile?"Desktop":"Mobil"}</button><button onClick={()=>setReload(v=>v+1)}>Neu laden</button></div></div><div className="preview-body">{preview?<iframe key={reload} className={mobile?"phone":""} title="Abduls AI Preview" sandbox="allow-scripts" srcDoc={preview}/>:null}{output?<pre>{output}</pre>:null}{!preview&&!output?<div className="empty"><Icon name="play"/>Run drücken</div>:null}</div></section>
          </div>
          <section className="build"><div><em>BUILD CENTER</em><h3>EXE • DEB • APK</h3><p>HTML → EXE / DEB / APK · Python → EXE</p></div><div className="build-right"><input type="password" value={secret} placeholder="Builder Secret" onChange={e=>setSecret(e.target.value)}/><div><button onClick={()=>build("exe")}>EXE</button><button disabled={lang!=="html"} onClick={()=>build("deb")}>DEB</button><button disabled={lang!=="html"} onClick={()=>build("apk")}>APK</button></div>{buildMsg?<small>{buildMsg}</small>:null}</div></section>
        </section>}
      </main>
    </div>
  </>;
}
