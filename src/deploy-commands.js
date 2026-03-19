require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

async function deployCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
  }

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  console.log(`Registering ${commands.length} slash commands...`);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('Successfully registered slash commands globally.');
}

// Run directly if called as a script
if (require.main === module) {
  deployCommands().catch((err) => {
    console.error('Failed to register commands:', err);
    process.exit(1);
  });
}

module.exports = deployCommands;
