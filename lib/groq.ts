let cursor = 0;

function getKeys() {
  return Object.keys(process.env)
    .filter((name) => /^GROQ_API_KEY_\d+$/.test(name))
    .sort((a, b) => Number(a.slice(13)) - Number(b.slice(13)))
    .map((name) => process.env[name]?.trim())
    .filter((value): value is string => Boolean(value));
}

type GroqOptions = {
  webSearch?: boolean;
  vision?: boolean;
};

export async function groqChat(
  messages: unknown[],
  think = false,
  options: GroqOptions = {}
) {
  const keys = getKeys();
  if (!keys.length) throw new Error("Abduls sein ki geht grad nt .");

  const model = options.vision
    ? process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b"
    : think
      ? process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b"
      : process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    temperature: think ? 0.7 : 0.5,
  };

  if (options.webSearch && (model === "openai/gpt-oss-20b" || model === "openai/gpt-oss-120b")) {
    body.tools = [{ type: "browser_search" }];
    body.tool_choice = "required";
  }

  let lastStatus = 502;
  let lastMessage = "Abduls ai  ist momentan nicht erreichbar.";

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const index = (cursor + attempt) % keys.length;
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + keys[index],
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        cursor = index;
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
          throw new Error("Abduls ki  hat eine leere Antwort geliefert.");
        }
        return {
          content,
          model: data?.model || model,
          citations: data?.citations || [],
        };
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
