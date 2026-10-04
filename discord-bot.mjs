import { Client, Events, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error("DISCORD_TOKEN fehlt.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, (ready) => {
  console.log("TREXOR Discord Bot online als " + ready.user.tag);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content.trim().toLowerCase() === "!ping") {
    await message.reply("Pong!");
  }
});

client.on(Events.Error, (error) => console.error("Discord client error:", error));

client.login(token).catch((error) => {
  console.error("Discord login failed:", error);
  process.exit(1);
});
