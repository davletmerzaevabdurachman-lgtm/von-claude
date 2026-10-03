import type { NextApiRequest, NextApiResponse } from "next";
import { groqChat } from "../../lib/groq";

export const config={api:{bodyParser:true,responseLimit:false}};

const SYSTEM=`Du bist TREXOR, ein vielseitiger KI-Assistent.
Antworte in der Sprache des Nutzers, standardmäßig Deutsch.
Hilf beim Erklären, Rechnen, Schreiben und Programmieren.
Bei Websites und Web-Apps liefere genau eine vollständige eigenständige index.html in einem einzigen html-Codeblock.
CSS und JavaScript sollen direkt in index.html enthalten sein und ohne externe Ressourcen funktionieren.
Bei Änderungen gib die komplette aktualisierte index.html zurück.
Nutze ansonsten normale Markdown-Codeblöcke.`;

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Nur POST wird unterstützt."});
  }

  const body=typeof req.body==="string"?JSON.parse(req.body):req.body;
  const messages=Array.isArray(body?.messages)?body.messages:[];
  const think=Boolean(body?.think);

  const safe=messages.filter((m:unknown)=>
    Boolean(m)&&typeof m==="object"&&
    ((m as any).role==="user"||(m as any).role==="assistant")&&
    typeof (m as any).content==="string"
  );

  if(!safe.length)return res.status(400).json({error:"Keine Nachrichten übergeben."});

  try{
    const upstream=await groqChat([{role:"system",content:SYSTEM},...safe],think);

    if(!upstream.ok||!upstream.body){
      let message="KI-Anfrage fehlgeschlagen.";
      try{
        const raw=await upstream.text();
        const parsed=JSON.parse(raw);
        message=parsed?.error?.message||message;
      }catch{}
      return res.status(upstream.status||502).json({error:message});
    }

    res.writeHead(200,{
      "Content-Type":"text/event-stream; charset=utf-8",
      "Cache-Control":"no-cache, no-transform",
      Connection:"keep-alive",
      "X-Accel-Buffering":"no"
    });

    const reader=upstream.body.getReader();
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        res.write(new TextDecoder().decode(value));
      }
    }finally{
      reader.releaseLock();
      if(!res.writableEnded)res.end();
    }
  }catch(error){
    const message=error instanceof Error?error.message:"Unbekannter Serverfehler.";
    if(!res.headersSent)res.status(500).json({error:message});
    else if(!res.writableEnded)res.end();
  }
}
