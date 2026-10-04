const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start() {
  const { pathToFileURL } = await import("node:url");
  const url = pathToFileURL(new URL("./discord-bot.mjs", import.meta.url).pathname).href;
  while (true) {
    try {
      await import(url + "?restart=" + Date.now());
    } catch (error) {
      console.error("Discord Bot beendet:", error);
    }
    console.log("Neustart des Discord Bots in 5 Sekunden …");
    await delay(5000);
  }
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
