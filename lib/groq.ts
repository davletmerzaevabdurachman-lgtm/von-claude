let cursor = 0;

function getKeys() {
  return [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ].filter((value): value is string => Boolean(value?.trim()));
}

export async function groqChat(messages: unknown[], think = false) {
  const keys = getKeys();
  if (!keys.length) throw new Error("TREXOR ist noch nicht mit einem Groq API-Key verbunden.");

  const model = think
    ? process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b"
    : process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";

  const body = { model, messages, stream: false, temperature: think ? 0.7 : 0.5 };
  let lastStatus = 502;
  let lastMessage = "Groq ist momentan nicht erreichbar.";

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const index = (cursor + attempt) % keys.length;
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + keys[index] },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        cursor = index;
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) throw new Error("Groq hat eine leere Antwort geliefert.");
        return { content, model: data?.model || model };
      }

      lastStatus = response.status;
      const raw = await response.text().catch(() => "");
      try {
        const parsed = JSON.parse(raw);
        lastMessage = parsed?.error?.message || lastMessage;
      } catch {
        if (raw) lastMessage = raw.slice(0, 300);
      }

      if (![401, 403, 408, 429].includes(response.status) && response.status < 500) break;
    } catch (error) {
      if (error instanceof Error) lastMessage = error.message;
    }
  }

  cursor = (cursor + 1) % keys.length;
  const error = new Error(lastMessage);
  (error as Error & { status?: number }).status = lastStatus;
  throw error;
}

export function getGroqKeyCount() {
  return getKeys().length;
}
