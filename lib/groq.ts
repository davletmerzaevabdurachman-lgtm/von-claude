let cursor=0;

const getKeys=()=>[
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3
].filter((v):v is string=>Boolean(v?.trim()));

export async function groqChat(messages:unknown[],think=false,signal?:AbortSignal){
  const keys=getKeys();
  if(!keys.length) throw new Error("Keine GROQ_API_KEY_* Variable in Vercel gesetzt.");

  const model=think
    ? process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b"
    : process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";

  const payload={
    model,messages,stream:true,
    ...(think?{reasoning_effort:"medium",reasoning_format:"hidden"}:{})
  };

  let last:Response|null=null;
  for(let i=0;i<keys.length;i++){
    const idx=(cursor+i)%keys.length;
    try{
      const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization:`Bearer ${keys[idx]}`
        },
        body:JSON.stringify(payload),
        signal
      });
      if(response.ok){cursor=idx;return response;}
      last=response;
      if(response.status!==429&&response.status<500)break;
    }catch(error){
      if(error instanceof Error&&error.name==="AbortError")throw error;
    }
  }
  cursor=(cursor+1)%keys.length;
  return last||new Response("Groq nicht erreichbar.",{status:502});
}
