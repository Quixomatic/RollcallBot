const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { queries } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure Rollcall bot settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('meetup')
        .setDescription('Set the Meetup group URL to monitor')
        .addStringOption((opt) =>
          opt.setName('url').setDescription('Meetup group URL (e.g., https://www.meetup.com/your-group/)').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('credentials')
        .setDescription('Set Meetup login credentials (sent via ephemeral message)')
        .addStringOption((opt) =>
          opt.setName('email').setDescription('Meetup account email').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('password').setDescription('Meetup account password').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('eventschannel')
        .setDescription('Set channel for event updates')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('rsvpchannel')
        .setDescription('Set channel for RSVP changes')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('commentschannel')
        .setDescription('Set channel for new comments')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reminderschannel')
        .setDescription('Set channel for event reminders')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('pollrate')
        .setDescription('Set base polling interval in minutes (min 5)')
        .addIntegerOption((opt) =>
          opt.setName('minutes').setDescription('Minutes between polls').setRequired(true).setMinValue(5).setMaxValue(60)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('horizon')
        .setDescription('How many days out to track events')
        .addIntegerOption((opt) =>
          opt.setName('days').setDescription('Number of days').setRequired(true).setMinValue(7).setMaxValue(90)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reminders')
        .setDescription('Configure event reminders')
        .addBooleanOption((opt) =>
          opt.setName('day_before').setDescription('Send reminder the day before?').setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('hours_before').setDescription('Hours before event to remind (comma-separated, e.g., "2,1")').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('botname')
        .setDescription('Set the Meetup display name of the bot account (to filter from RSVPs)')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Meetup display name (e.g., "Eventer")').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('timezone')
        .setDescription('Set timezone for date formatting (default America/New_York)')
        .addStringOption((opt) =>
          opt.setName('tz').setDescription('IANA timezone (e.g., America/New_York, America/Chicago)').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('rsvpthreshold')
        .setDescription('Minutes before RSVP message is deleted and reposted instead of edited (default 15)')
        .addIntegerOption((opt) =>
          opt.setName('minutes').setDescription('Minutes (0 = always repost)').setRequired(true).setMinValue(0).setMaxValue(60)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Enable polling for this server')
    )
    .addSubcommand((sub) =>
      sub
        .setName('disable')
        .setDescription('Disable polling for this server')
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View current configuration')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const guildName = interaction.guild?.name || guildId;

    switch (sub) {
      case 'meetup': {
        const url = interaction.options.getString('url');
        queries.setMeetupGroupUrl().run(guildId, url);
        console.log(`[config] ${guildName}: meetup URL → ${url}`);
        await interaction.reply({ content: `Meetup group URL set to: ${url}`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'credentials': {
        const email = interaction.options.getString('email');
        const password = interaction.options.getString('password');
        queries.setMeetupCredentials().run(guildId, email, password);
        console.log(`[config] ${guildName}: credentials → ${email}`);
        await interaction.reply({ content: `Meetup credentials saved for \`${email}\`.`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'eventschannel': {
        const channel = interaction.options.getChannel('channel');
        queries.setEventsChannel().run(guildId, channel.id);
        console.log(`[config] ${guildName}: events channel → #${channel.name}`);
        await interaction.reply({ content: `Events channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'rsvpchannel': {
        const channel = interaction.options.getChannel('channel');
        queries.setRsvpChannel().run(guildId, channel.id);
        console.log(`[config] ${guildName}: RSVP channel → #${channel.name}`);
        await interaction.reply({ content: `RSVP channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'commentschannel': {
        const channel = interaction.options.getChannel('channel');
        queries.setCommentsChannel().run(guildId, channel.id);
        console.log(`[config] ${guildName}: comments channel → #${channel.name}`);
        await interaction.reply({ content: `Comments channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'reminderschannel': {
        const channel = interaction.options.getChannel('channel');
        queries.setRemindersChannel().run(guildId, channel.id);
        console.log(`[config] ${guildName}: reminders channel → #${channel.name}`);
        await interaction.reply({ content: `Reminders channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'pollrate': {
        const minutes = interaction.options.getInteger('minutes');
        queries.setPollInterval().run(guildId, minutes);
        console.log(`[config] ${guildName}: poll interval → ${minutes}min`);
        await interaction.reply({ content: `Base poll interval set to ${minutes} minutes.`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'horizon': {
        const days = interaction.options.getInteger('days');
        queries.setEventHorizon().run(guildId, days);
        console.log(`[config] ${guildName}: event horizon → ${days} days`);
        await interaction.reply({ content: `Event horizon set to ${days} days.`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'reminders': {
        const dayBefore = interaction.options.getBoolean('day_before');
        const hoursBefore = interaction.options.getString('hours_before');
        const parts = [];
        if (dayBefore !== null) {
          queries.setReminderDayBefore().run(guildId, dayBefore ? 1 : 0);
          parts.push(`Day-before reminder: ${dayBefore ? 'enabled' : 'disabled'}`);
        }
        if (hoursBefore !== null) {
          queries.setReminderHoursBefore().run(guildId, hoursBefore);
          parts.push(`Hours-before reminders: ${hoursBefore}`);
        }
        if (parts.length === 0) {
          await interaction.reply({ content: 'No reminder settings changed. Use the options to configure.', flags: MessageFlags.Ephemeral });
        } else {
          console.log(`[config] ${guildName}: reminders → ${parts.join(', ')}`);
          await interaction.reply({ content: parts.join('\n'), flags: MessageFlags.Ephemeral });
        }
        break;
      }
      case 'timezone': {
        const tz = interaction.options.getString('tz');
        // Validate the timezone
        try {
          Intl.DateTimeFormat('en-US', { timeZone: tz });
        } catch {
          await interaction.reply({ content: `Invalid timezone: "${tz}". Use IANA format like America/New_York, America/Chicago, etc.`, flags: MessageFlags.Ephemeral });
          break;
        }
        queries.setTimezone().run(guildId, tz);
        console.log(`[config] ${guildName}: timezone → ${tz}`);
        await interaction.reply({ content: `Timezone set to ${tz}.`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'rsvpthreshold': {
        const minutes = interaction.options.getInteger('minutes');
        queries.setRsvpEditThreshold().run(guildId, minutes);
        console.log(`[config] ${guildName}: RSVP edit threshold → ${minutes}min`);
        await interaction.reply({ content: `RSVP edit threshold set to ${minutes} minutes.${minutes === 0 ? ' (always delete and repost)' : ''}`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'enable': {
        queries.setEnabled().run(guildId, 1);
        console.log(`[config] ${guildName}: polling enabled`);
        await interaction.reply({ content: 'Polling enabled for this server.', flags: MessageFlags.Ephemeral });
        break;
      }
      case 'disable': {
        queries.setEnabled().run(guildId, 0);
        console.log(`[config] ${guildName}: polling disabled`);
        await interaction.reply({ content: 'Polling disabled for this server.', flags: MessageFlags.Ephemeral });
        break;
      }
      case 'botname': {
        const name = interaction.options.getString('name');
        queries.setBotMeetupName().run(guildId, name);
        console.log(`[config] ${guildName}: bot meetup name → ${name}`);
        await interaction.reply({ content: `Bot Meetup name set to "${name}" — this account will be filtered from RSVPs.`, flags: MessageFlags.Ephemeral });
        break;
      }
      case 'view': {
        const settings = queries.getGuildSettings().get(guildId);
        const creds = queries.getMeetupCredentials().get(guildId);
        if (!settings) {
          await interaction.reply({ content: 'No configuration found. Use `/config meetup <url>` to get started.', flags: MessageFlags.Ephemeral });
          return;
        }
        const lines = [
          `**Meetup Group:** ${settings.meetup_group_url || 'Not set'}`,
          `**Credentials:** ${creds ? `${creds.email} (saved)` : 'Not set'}`,
          `**Events Channel:** ${settings.events_channel_id ? `<#${settings.events_channel_id}>` : 'Not set'}`,
          `**RSVP Channel:** ${settings.rsvp_channel_id ? `<#${settings.rsvp_channel_id}>` : 'Not set'}`,
          `**Comments Channel:** ${settings.comments_channel_id ? `<#${settings.comments_channel_id}>` : 'Not set'}`,
          `**Reminders Channel:** ${settings.reminders_channel_id ? `<#${settings.reminders_channel_id}>` : 'Not set'}`,
          `**Poll Interval:** ${settings.poll_interval_minutes} min`,
          `**Event Horizon:** ${settings.event_horizon_days} days`,
          `**Day-before Reminder:** ${settings.reminder_day_before ? 'Yes' : 'No'}`,
          `**Hours-before Reminders:** ${settings.reminder_hours_before || 'None'}`,
          `**Bot Meetup Name:** ${settings.bot_meetup_name || 'Not set (use /config botname)'}`,
          `**Timezone:** ${settings.timezone || 'America/New_York'}`,
          `**RSVP Edit Threshold:** ${settings.rsvp_edit_threshold_minutes || 15} min`,
          `**Polling:** ${settings.enabled ? 'Enabled' : 'Disabled'}`,
        ];
        await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
        break;
      }
    }
  },
};
