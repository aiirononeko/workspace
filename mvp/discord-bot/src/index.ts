import { Client, GatewayIntentBits, REST, Routes, type ChatInputCommandInteraction } from "discord.js";
import { config } from "./config";
import { data as askCommand, execute as askExecute } from "./commands/ask";
import { data as taskCommand, execute as taskExecute } from "./commands/task";
import { data as summarizeCommand, execute as summarizeExecute } from "./commands/summarize";
import { data as saveCommand, execute as saveExecute } from "./commands/save";
import { handleBookmarkMessage, handleBookmarkMessageUpdate } from "./bookmark-watcher";
import { handleObsidianButton, handleSkillDraftButton } from "./button-handler";
import { handleMention } from "./mention-handler";

const commands = [askCommand, taskCommand, summarizeCommand, saveCommand];

const handlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> = {
  ask: askExecute,
  task: taskExecute,
  summarize: summarizeExecute,
  save: saveExecute,
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const rest = new REST({ version: "10" }).setToken(config.discord.token);

async function deployCommands() {
  await rest.put(
    Routes.applicationCommands(config.discord.applicationId),
    { body: commands.map((c) => c.toJSON()) },
  );
  console.log("Slash commands registered.");
}

client.once("clientReady", (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  // ボタンインタラクション処理
  if (interaction.isButton()) {
    const customId = interaction.customId;
    try {
      if (customId.startsWith("knowledge:obsidian:")) {
        await handleObsidianButton(interaction);
      } else if (customId.startsWith("knowledge:skill:")) {
        await handleSkillDraftButton(interaction);
      }
    } catch (err) {
      console.error("Button handler failed:", err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("ボタン処理中にエラーが発生しました。");
        } else {
          await interaction.reply({ content: "ボタン処理中にエラーが発生しました。", ephemeral: true });
        }
      } catch {
        // reply itself failed
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const handler = handlers[interaction.commandName];
  if (!handler) return;

  try {
    await handler(interaction);
  } catch (err) {
    console.error("Command handler failed:", err);
    const msg = "内部エラーが発生しました。時間をおいて再試行してください。";
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch {
      // reply itself failed, nothing we can do
    }
  }
});

client.on("messageCreate", async (message) => {
  try {
    await handleMention(message);
  } catch (err) {
    console.error("[mention-handler] Unhandled error:", err);
  }

  try {
    await handleBookmarkMessage(message);
  } catch (err) {
    console.error("[bookmark-watcher] Unhandled error:", err);
  }
});

client.on("messageUpdate", async (_old, newMsg) => {
  try {
    const message = newMsg.partial ? await newMsg.fetch() : newMsg;
    await handleBookmarkMessageUpdate(message);
  } catch (err) {
    console.error("[bookmark-watcher] Update handler error:", err);
  }
});

async function main() {
  await deployCommands();
  await client.login(config.discord.token);
}

main().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
