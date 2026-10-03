import { useEffect,useRef,useState } from "react";
import Head from "next/head";

type Message={role:"user"|"assistant";content:string};
type Chat={id:string;title:string;messages:Message[]};

const IDEAS=[
  "Baue mir eine moderne Gaming-Website",
  "Erkläre mir Quantencomputer einfach",
  "Schreibe einen Lernplan für Mathe",
  "Programmiere einen Taschenrechner"
];

function id(){try{return crypto.randomUUID()}catch{return String(Date.now())+Math.random()}}

function htmlFrom(messages:Message[]){
  for(let i=messages.length-1;i>=0;i--){
    const m=messages[i];
    if(m.role!=="assistant")continue;
    const match=m.content.match(/\`\`\`(?:html|HTML)\\s*\\n?([\\s\\S]*?)(?:\`\`\`|$)/);
    if(match?.[1])return match[1];
  }
  return "";
}

async function copy(value:string){
  try{await navigator.clipboard.writeText(value)}catch{}
}

function MessageView({message}:{message:Message}){
  const parts=message.content.split(/(\`\`\`[\\s\\S]*?(?:\`\`\`|$))/g);
  return <>{parts.map((part,i)=>{
    if(part.startsWith("\`\`\`")){
      const m=part.match(/^\`\`\`(\\w*)\\s*\\n?([\\s\\S]*?)(?:\`\`\`)?$/);
      const lang=m?.[1]||"";
      const code=(m?.[2]||"").replace(/\\n$/,"");
      return lang.toLowerCase()==="html"
        ? <div className="filecard" key={i}><b>index.html</b><small>Live-Preview verfügbar</small></div>
        : <pre className="code" key={i}>{code}</pre>;
    }
    return part.trim()
      ? part.trim().split(/\\n{2,}/).map((p,j)=><p key={i+"-"+j}>{p}</p>)
      : null;
  })}</>;
}

export default function Home(){
  const [chats,setChats]=useState<Chat[]>([]);
  const [active,setActive]=useState<string|null>(null);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [think,setThink]=useState(true);
  const [tab,setTab]=useState<"preview"|"code">("preview");
  const [mobile,setMobile]=useState(false);
  const [reload,setReload]=useState(0);
  const [menu,setMenu]=useState(false);
  const abortRef=useRef<AbortController|null>(null);
  const endRef=useRef<HTMLDivElement>(null);
  const ready=useRef(false);

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("trexor.chats.v4");
      const data=raw?JSON.parse(raw):[];
      if(Array.isArray(data)){
        const safe=data.filter((c:unknown)=>{
          if(!c||typeof c!=="object")return false;
          const x=c as Chat;
          return typeof x.id==="string"&&typeof x.title==="string"&&Array.isArray(x.messages)&&
            x.messages.every((m:unknown)=>Boolean(m)&&typeof m==="object"&&
              ((m as Message).role==="user"||(m as Message).role==="assistant")&&
              typeof (m as Message).content==="string");
        });
        setChats(safe.slice(0,40));
        setActive(safe[0]?.id||null);
      }
    }catch{localStorage.removeItem("trexor.chats.v4")}
    ready.current=true;
  },[]);

  useEffect(()=>{
    if(!ready.current||busy)return;
    try{localStorage.setItem("trexor.chats.v4",JSON.stringify(chats.slice(0,40)))}catch{}
  },[chats,busy]);

  const chat=chats.find(c=>c.id===active);
  const messages=chat?.messages||[];
  const html=htmlFrom(messages);

  useEffect(()=>{endRef.current?.scrollIntoView({block:"end"})},[messages.length,messages[messages.length-1]?.content.length]);

  async function run(chatId:string,history:Message[]){
    setBusy(true);
    setChats(cs=>cs.map(c=>c.id===chatId?{...c,messages:[...c.messages,{role:"assistant",content:""}]}:c));
    const assistantIndex=history.length;
    const controller=new AbortController();
    abortRef.current=controller;

    try{
      const r=await fetch("/api/chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        signal:controller.signal,
        body:JSON.stringify({messages:history,think})
      });
      if(!r.ok||!r.body){
        let message="KI-Anfrage fehlgeschlagen.";
        try{const d=await r.json();message=d.error||message}catch{}
        throw new Error(message);
      }
      const reader=r.body.getReader();
      const decoder=new TextDecoder();
      let buffer="";
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split("\\n");
        buffer=lines.pop()||"";
        for(const line of lines){
          if(!line.startsWith("data: "))continue;
          const data=line.slice(6).trim();
          if(data==="[DONE]")continue;
          try{
            const delta=JSON.parse(data)?.choices?.[0]?.delta?.content;
            if(typeof delta!=="string"||!delta)continue;
            setChats(cs=>cs.map(c=>{
              if(c.id!==chatId)return c;
              const next=[...c.messages];
              next[assistantIndex]={role:"assistant",content:(next[assistantIndex]?.content||"")+delta};
              return {...c,messages:next};
            }));
          }catch{}
        }
      }
    }catch(e){
      if(!(e instanceof Error&&e.name==="AbortError")){
        const message=e instanceof Error?e.message:"Unbekannter Fehler";
        setChats(cs=>cs.map(c=>{
          if(c.id!==chatId)return c;
          const next=[...c.messages];
          next[assistantIndex]={role:"assistant",content:"**Fehler:** "+message};
          return {...c,messages:next};
        }));
      }
    }finally{abortRef.current=null;setBusy(false)}
  }

  function send(value?:string){
    const text=(value??input).trim();
    if(!text||busy)return;
    const chatId=active||id();
    const current=chat?.messages||[];
    const history=[...current,{role:"user" as const,content:text}];

    setChats(cs=>{
      const exists=cs.some(c=>c.id===chatId);
      if(exists)return cs.map(c=>c.id===chatId?{...c,messages:history}:c);
      return [{id:chatId,title:text.slice(0,40),messages:history},...cs];
    });
    setActive(chatId);
    setInput("");
    run(chatId,history);
  }

  function newChat(){abortRef.current?.abort();setActive(null);setInput("");setBusy(false)}

  function download(){
    if(!html)return;
    const url=URL.createObjectURL(new Blob([html],{type:"text/html"}));
    const a=document.createElement("a");a.href=url;a.download="index.html";a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <>
    <Head><title>TREXOR</title><meta name="theme-color" content="#000000"/></Head>
    <main className={"app "+(html?"work":"")}>
      <aside className={"side panel "+(menu?"open":"")}>
        <div className="brand"><Mark/><span>TREXOR</span></div>
        <button className="new" onClick={newChat}>+ Neuer Chat</button>
        <nav className="hist">{chats.map(c=>
          <div className={"item "+(c.id===active?"on":"")} key={c.id}>
            <button className="t" onClick={()=>{setActive(c.id);setMenu(false)}}>{c.title}</button>
            <button className="x" onClick={()=>{setChats(cs=>cs.filter(x=>x.id!==c.id));if(c.id===active)setActive(null)}}>×</button>
          </div>
        )}</nav>
      </aside>

      <section className="chat panel">
        <header className="top">
          <button className="burger" onClick={()=>setMenu(v=>!v)} aria-label="Menü">☰</button>
          <span className="title">{chat?.title||"Neuer Chat"}</span>
        </header>

        <div className="msgs">
          {!messages.length
            ? <div className="hero">
                <Mark s={60}/>
                <h1>Wie kann ich helfen?</h1>
                <p>Frag TREXOR alles — erklären, rechnen, schreiben oder programmieren.</p>
                <div className="chips">{IDEAS.map(x=><button key={x} onClick={()=>send(x)}>{x}</button>)}</div>
              </div>
            : messages.map((m,i)=>
                <div className={"row "+m.role} key={i}>
                  {m.role==="user"
                    ? <div className="bubble">{m.content}</div>
                    : <div className="ai">
                        {!m.content&&busy?<div className="status"><i/><i/><i/>{think?"TREXOR denkt …":"TREXOR schreibt …"}</div>:null}
                        <MessageView message={m}/>
                        {m.content&&i===messages.length-1&&!busy
                          ? <div className="acts">
                              <button className="mini" onClick={()=>copy(m.content)}>Kopieren</button>
                              <button className="mini" onClick={()=>run(active!,messages.slice(0,-1))}>Neu generieren</button>
                            </div>
                          : null}
                      </div>}
                </div>
              )}
          <div ref={endRef}/>
        </div>

        <div className="composer">
          <button className={"think "+(think?"on":"")} onClick={()=>setThink(v=>!v)}>{think?"Denken an":"Denken aus"}</button>
          <textarea rows={1} value={input} placeholder="Nachricht an TREXOR …" onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}}/>
          {busy?<button className="send" onClick={()=>abortRef.current?.abort()}>Stop</button>
            :<button className="send" disabled={!input.trim()} onClick={()=>send()}>Senden</button>}
        </div>
      </section>

      {html?<section className="panel workp">
        <div className="tabs">
          <button className={"tab "+(tab==="preview"?"on":"")} onClick={()=>setTab("preview")}>Preview</button>
          <button className={"tab "+(tab==="code"?"on":"")} onClick={()=>setTab("code")}>Code</button>
          <span className="sp"/>
          {tab==="preview"?<><button className="mini" onClick={()=>setMobile(v=>!v)}>{mobile?"Desktop":"Mobil"}</button><button className="mini" onClick={()=>setReload(v=>v+1)}>Neu laden</button></>:null}
          <button className="mini" onClick={download}>Download</button>
        </div>
        {tab==="preview"
          ? <div className="stage"><iframe key={reload} title="TREXOR Preview" className={mobile?"mob":""} sandbox="allow-scripts" srcDoc={html}/></div>
          : <div className="codewrap"><pre className="code">{html}</pre></div>}
      </section>:null}
    </main>
  </>;
}

function Mark({s=26}:{s?:number}){
  return <svg width={s} height={s} viewBox="0 0 26 26" aria-hidden="true"><rect width="26" height="26" rx="8" fill="#ff2e93"/><path d="M7 8h12v3h-4.5v8h-3v-8H7z" fill="#000"/></svg>
}
