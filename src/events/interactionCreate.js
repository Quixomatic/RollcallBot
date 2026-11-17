const { Events, MessageFlags } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      try {
        await command.autocomplete(interaction, client);
      } catch (err) {
        console.error(`Autocomplete error for /${interaction.commandName}:`, err.message);
      }
      return;
    }

    if (!interaction.isChatInputCommand() && !interaction.isUserContextMenuCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`Error executing /${interaction.commandName}:`, err);
      try {
        const reply = { content: 'There was an error executing this command.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch (replyErr) {
        console.error('Could not send error reply:', replyErr.message);
      }
    }
  },
};
