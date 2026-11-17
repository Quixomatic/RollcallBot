require('dotenv').config();
require('./services/log-buffer').install(); // keep recent output for the dashboard's Logs page
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const deployCommands = require('./deploy-commands');
const { version } = require('../package.json');

const banner = `
 ╔═══════════════════════════════════════════════╗
 ║                                               ║
 ║   ██████╗  ██████╗ ██╗     ██╗                ║
 ║   ██╔══██╗██╔═══██╗██║     ██║                ║
 ║   ██████╔╝██║   ██║██║     ██║                ║
 ║   ██╔══██╗██║   ██║██║     ██║                ║
 ║   ██║  ██║╚██████╔╝███████╗███████╗           ║
 ║   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝           ║
 ║    ██████╗ █████╗ ██╗     ██╗                  ║
 ║   ██╔════╝██╔══██╗██║     ██║                  ║
 ║   ██║     ███████║██║     ██║                  ║
 ║   ██║     ██╔══██║██║     ██║                  ║
 ║   ╚██████╗██║  ██║███████╗███████╗            ║
 ║    ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝            ║
 ║                                               ║
 ║              v${version.padEnd(30)}║
 ╚═══════════════════════════════════════════════╝
`;

console.log(banner);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
  console.log(`Loaded command: /${command.data.name}`);
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  client.on(event.name, (...args) => event.execute(...args, client));
  console.log(`Loaded event: ${event.name}`);
}

// Ready
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} guild(s)`);

  // Start the polling loop
  const { startPolling } = require('./services/poller');
  await startPolling(client);
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  const { stopPolling } = require('./services/poller');
  const { getBackend } = require('./services/backend');
  stopPolling();
  await getBackend().close();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Web dashboard (only if DASHBOARD_PASSWORD is set)
require('./dashboard/server').startDashboard(client);

// Deploy slash commands then start the bot
deployCommands()
  .then(() => client.login(process.env.DISCORD_TOKEN))
  .catch((err) => {
    console.error('Failed to deploy commands:', err);
    process.exit(1);
  });
