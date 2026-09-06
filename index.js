import { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    PermissionsBitField, 
    ChannelType, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    AttachmentBuilder
} from 'discord.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// =============================================================
// GLOBAL CONFIGURATION
// =============================================================
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    PREFIX: '!',
    STORE_URL: 'https://gmh-shop.com/',
    // Direct Discord internal CDN link from #welcome
    PERMANENT_BANNER_URL: 'https://cdn.discordapp.com/attachments/1533856623108292811/1546231062743752714/Gemini_Generated_Image_2rln5o2rln5o2rln.jpg',
    
    // Server Role IDs
    ADMIN_ROLE_IDS: ['1542980594408099904'],     // Admin / Owner
    STAFF_ROLE_ID: '1542980594408099902',        // Senior / Full Staff
    TRIAL_STAFF_ROLE_ID: '1542980594408099901',  // Trial Staff
    
    // Optional Category & Channel Targets (leave null if using current channels)
    TICKET_CATEGORY_ID: null,
    APP_CATEGORY_ID: null,
    TRANSCRIPTS_CHANNEL_ID: null,
    NEWS_CHANNEL_ID: null
};

// 9 Staff Recruitment Screening Questions
const APP_QUESTIONS = [
    "Question 1/9: How old are you, and do you own a Windows PC that you can use while providing support?",
    "Question 2/9: What is your timezone/country, and what specific hours of the day are you active?",
    "Question 3/9: What past experience do you have moderating Discord servers or managing support tickets?",
    "Question 4/9: A buyer downloads a file and says it instantly deletes itself or won't open. What exact steps or antivirus exclusions do you guide them through?",
    "Question 5/9: A tool fails to run due to missing PC prerequisites. Which common runtimes, DirectX components, or BIOS settings (e.g. Virtualization/TPM) do you check?",
    "Question 6/9: A user starts complaining in public chat calling the server a scam because their key or support is taking time. How do you handle this publicly, and how do you direct them into tickets?",
    "Question 7/9: Lower staff do NOT dispense keys or process refunds. If a user demands a replacement key or refund, what exact order information do you gather before escalating to senior staff?",
    "Question 8/9: If a friend of yours in the server breaks server rules or asks you for free access/leaks, how do you respond?",
    "Question 9/9: Are you looking to be compensated through free tool access keys, weekly payouts, or a mixture of both?"
];

client.once('ready', () => {
    console.log(`[SYSTEM] /dev/null operational as ${client.user.tag}`);
    client.user.setActivity('gmh-shop.com', { type: 3 });
});

// Duration parser utility for timeouts
function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;
    const val = parseInt(match[1]);
    const unit = match[2];
    if (unit === 's') return val * 1000;
    if (unit === 'm') return val * 60 * 1000;
    if (unit === 'h') return val * 60 * 60 * 1000;
    if (unit === 'd') return val * 24 * 60 * 60 * 1000;
    return null;
}

// =============================================================
// COMMANDS (PREFIX: !)
// =============================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(CONFIG.PREFIX)) return;

    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    const isStaff = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) ||
                    message.member.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID);

    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    CONFIG.ADMIN_ROLE_IDS.some(id => message.member.roles.cache.has(id));

    // Health Check
    if (cmd === 'ping') {
        return message.reply(`🏓 Pong! Bot latency: \`${client.ws.ping}ms\``);
    }

    // 1. Spawner: Announcement Center
    if (cmd === 'setup-news') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('📢 Announcement Dispatcher')
            .setDescription('Click below to create an official server update embed.\n\n• Permanent wide hero banner attaches automatically\n• Product URL, store links, and ticket buttons pre-configured\n• Direct target ping options')
            .setColor(0x00E5FF);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_open_news_modal')
                .setLabel('Create Announcement')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝')
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // 2. Spawner: Staff Applications
    if (cmd === 'send-apply') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('💼 Staff Recruitment • GameMarket Hub')
            .setDescription('We are looking for knowledgeable staff to manage tickets and triage setup issues.\n\n**Requirements:**\n• Working knowledge of Windows Defender exclusions and PC runtimes\n• Reliable active hours and mature communication\n• Absolute integrity (zero leaks / zero bias)\n\nClick below to open your private screening channel.')
            .setColor(0x00E5FF)
            .setImage(CONFIG.PERMANENT_BANNER_URL);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_open_app')
                .setLabel('Apply for Staff')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋')
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // 3. Spawner: Support Desk
    if (cmd === 'spawn-tickets') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('🎫 GameMarket Hub Support Desk')
            .setDescription('Select the appropriate department below to initiate a private ticket.\n\n• **Technical Support:** Setup errors, runtime missing, injection fixes.\n• **Buy / Payment:** Crypto, card, and manual order inquiries.\n• **Reseller Access:** Bulk access keys and API rates.\n• **HWID Reset:** System reset requests and loader migrations.')
            .setColor(0x00E5FF)
            .setImage(CONFIG.PERMANENT_BANNER_URL);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_tech').setLabel('Tech Support').setStyle(ButtonStyle.Secondary).setEmoji('🛠️'),
            new ButtonBuilder().setCustomId('ticket_buy').setLabel('Buy / Payment').setStyle(ButtonStyle.Success).setEmoji('💳'),
            new ButtonBuilder().setCustomId('ticket_reseller').setLabel('Reseller').setStyle(ButtonStyle.Primary).setEmoji('💼'),
            new ButtonBuilder().setCustomId('ticket_hwid').setLabel('HWID Reset').setStyle(ButtonStyle.Danger).setEmoji('🔄')
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // 4. Spawner: Verification
    if (cmd === 'send-verify') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('🛡️ GMH • Member Access')
            .setDescription('Click below to authorize via Guild Restore and gain immediate access to all server channels and order tickets.')
            .setColor(0x00E5FF)
            .setImage(CONFIG.PERMANENT_BANNER_URL);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify Account')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.com')
                .setEmoji('✅')
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // 5. Order Delivery
    if (cmd === 'deliver') {
        if (!isStaff) return message.reply('❌ Unauthorized.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Syntax: `!deliver @user <key/credentials>`');

        const payload = args.slice(1).join(' ');
        if (!payload) return message.reply('❌ Please provide the key or payload text to deliver.');

        const dmEmbed = new EmbedBuilder()
            .setTitle('📦 Order Delivered • GameMarket Hub')
            .setDescription(`Thank you for your order!\n\n**License / Credentials:**\n\`\`\`text\n${payload}\n\`\`\`\nNeed setup files or have injection questions? Open a ticket on the server.`)
            .setColor(0x00E5FF)
            .setFooter({ text: 'Keep this private. Staff will never ask for your key.' })
            .setTimestamp();

        try {
            await target.send({ embeds: [dmEmbed] });
            return message.reply(`✅ Successfully delivered credentials to <@${target.id}>'s DMs.`);
        } catch (err) {
            return message.reply(`⚠️ <@${target.id}> has their DMs closed! Could not send message.`);
        }
    }

    // 6. Moderation: Timeout / Mute
    if (cmd === 'timeout' || cmd === 'mute') {
        if (!isStaff) return message.reply('❌ Unauthorized.');

        const target = message.mentions.members.first();
        const durationStr = args[1];
        const reason = args.slice(2).join(' ') || 'No reason provided';

        if (!target || !durationStr) {
            return message.reply('❌ Syntax: `!timeout @user <60s/10m/2h/1d> [reason]`');
        }

        const ms = parseDuration(durationStr);
        if (!ms || ms > 28 * 24 * 60 * 60 * 1000) {
            return message.reply('❌ Provide a valid duration up to 28 days (e.g. `60s`, `10m`, `2h`, `1d`).');
        }

        if (!target.moderatable) {
            return message.reply('❌ Hierarchy conflict: cannot modify target.');
        }

        await target.timeout(ms, reason);
        return message.reply(`🔇 <@${target.id}> timed out for **${durationStr}** | Reason: *${reason}*`);
    }

    // 7. Moderation: Untimeout / Unmute
    if (cmd === 'untimeout' || cmd === 'unmute') {
        if (!isStaff) return message.reply('❌ Unauthorized.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Syntax: `!untimeout @user`');

        if (!target.moderatable) return message.reply('❌ Hierarchy conflict: cannot modify target.');
        await target.timeout(null);
        return message.reply(`🔊 Timeout removed for <@${target.id}>.`);
    }

    // 8. Moderation: Kick
    if (cmd === 'kick') {
        if (!isStaff) return message.reply('❌ Unauthorized.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Syntax: `!kick @user [reason]`');
        if (!target.kickable) return message.reply('❌ Hierarchy conflict: cannot kick user.');

        const reason = args.slice(1).join(' ') || 'No reason specified';
        await target.kick(reason);
        return message.reply(`👢 Kicked <@${target.id}> | ${reason}`);
    }

    // 9. Moderation: Ban
    if (cmd === 'ban') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Syntax: `!ban @user [reason]`');
        if (!target.bannable) return message.reply('❌ Hierarchy conflict: cannot ban user.');

        const reason = args.slice(1).join(' ') || 'No reason specified';
        await target.ban({ reason });
        return message.reply(`🔨 Banned <@${target.id}> | ${reason}`);
    }
});

// =============================================================
// INTERACTION HANDLER (BUTTONS, MODALS, TICKETS)
// =============================================================
client.on('interactionCreate', async (interaction) => {
    // ---------------------------------------------------------
    // ANNOUNCEMENT MODAL OPEN
    // ---------------------------------------------------------
    if (interaction.isButton() && interaction.customId === 'btn_open_news_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_submit_news')
            .setTitle('Create Server Announcement');

        const titleInput = new TextInputBuilder()
            .setCustomId('news_title')
            .setLabel('Title / Headline')
            .setPlaceholder('e.g. ⚡ BO7 SLOTTED EXTERNAL RESTOCK')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const bodyInput = new TextInputBuilder()
            .setCustomId('news_text')
            .setLabel('Announcement Text')
            .setPlaceholder('Enter description, changelog, discount codes...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const productUrlInput = new TextInputBuilder()
            .setCustomId('news_product_url')
            .setLabel('Direct Product URL (Optional)')
            .setPlaceholder('https://gmh-shop.com/... (Leaves out button if blank)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const pingInput = new TextInputBuilder()
            .setCustomId('news_ping')
            .setLabel('Ping (@everyone / @here / none)')
            .setPlaceholder('everyone, here, or leave empty')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(bodyInput),
            new ActionRowBuilder().addComponents(productUrlInput),
            new ActionRowBuilder().addComponents(pingInput)
        );

        return await interaction.showModal(modal);
    }

    // ---------------------------------------------------------
    // ANNOUNCEMENT MODAL SUBMISSION
    // ---------------------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId === 'modal_submit_news') {
        await interaction.deferReply({ ephemeral: true });

        const title = interaction.fields.getTextInputValue('news_title');
        const text = interaction.fields.getTextInputValue('news_text');
        const productUrl = interaction.fields.getTextInputValue('news_product_url')?.trim();
        const pingType = interaction.fields.getTextInputValue('news_ping')?.toLowerCase().trim();

        const newsEmbed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(text)
            .setColor(0x00E5FF)
            .setTimestamp()
            .setImage(CONFIG.PERMANENT_BANNER_URL);

        const row = new ActionRowBuilder();
        if (productUrl && productUrl.startsWith('http')) {
            row.addComponents(
                new ButtonBuilder().setLabel('View Product').setStyle(ButtonStyle.Link).setURL(productUrl).setEmoji('🔥')
            );
        }
        row.addComponents(
            new ButtonBuilder().setLabel('Store').setStyle(ButtonStyle.Link).setURL(CONFIG.STORE_URL).setEmoji('🛒'),
            new ButtonBuilder().setLabel('Open Ticket').setStyle(ButtonStyle.Link).setURL('https://discord.com').setEmoji('🎟️')
        );

        let pingContent = '';
        if (pingType === 'everyone' || pingType === '@everyone') pingContent = '@everyone';
        else if (pingType === 'here' || pingType === '@here') pingContent = '@here';

        const targetChannel = CONFIG.NEWS_CHANNEL_ID ? interaction.guild.channels.cache.get(CONFIG.NEWS_CHANNEL_ID) : interaction.channel;

        if (!targetChannel) {
            return await interaction.editReply({ content: '❌ Could not find target channel for announcement.' });
        }

        await targetChannel.send({
            content: pingContent || null,
            embeds: [newsEmbed],
            components: [row]
        });

        return await interaction.editReply({ content: `✅ Announcement published directly to ${targetChannel} with permanent banner.` });
    }

    // ---------------------------------------------------------
    // STAFF RECRUITMENT GENERATION
    // ---------------------------------------------------------
    if (interaction.isButton() && interaction.customId === 'btn_open_app') {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const user = interaction.user;
        const channelName = `apply-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`;

        const appChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: CONFIG.APP_CATEGORY_ID || null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
            ]
        });

        if (guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
            await appChannel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
        }
        for (const adminId of CONFIG.ADMIN_ROLE_IDS) {
            if (guild.roles.cache.has(adminId)) {
                await appChannel.permissionOverwrites.edit(adminId, { ViewChannel: true, SendMessages: true });
            }
        }

        const questionsText = APP_QUESTIONS.join('\n\n');
        const appEmbed = new EmbedBuilder()
            .setTitle(`Staff Application • ${user.tag}`)
            .setDescription(`Welcome <@${user.id}>! Please answer all questions below in this channel.\n\n${questionsText}`)
            .setColor(0x00E5FF)
            .setFooter({ text: 'Answer each question thoroughly.' });

        const reviewRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app_accept_${user.id}`).setLabel('Accept (Trial Staff)').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId(`app_deny_${user.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setEmoji('❌'),
            new ButtonBuilder().setCustomId('app_delete').setLabel('Delete Channel').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
        );

        await appChannel.send({ embeds: [appEmbed], components: [reviewRow] });
        return await interaction.editReply({ content: `✅ Application channel opened: ${appChannel}` });
    }

    // ---------------------------------------------------------
    // APPLICATION REVIEW CONTROLS
    // ---------------------------------------------------------
    if (interaction.isButton() && interaction.customId.startsWith('app_')) {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        CONFIG.ADMIN_ROLE_IDS.some(id => interaction.member.roles.cache.has(id));

        if (!isAdmin) {
            return await interaction.reply({ content: '❌ Only Administrators can review applications.', ephemeral: true });
        }

        if (interaction.customId.startsWith('app_accept_')) {
            const targetUserId = interaction.customId.replace('app_accept_', '');
            const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);

            if (member && interaction.guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                await member.roles.add(CONFIG.TRIAL_STAFF_ROLE_ID);
                await member.send(`🎉 Congratulations! Your staff application for **${interaction.guild.name}** was approved. You received the **Trial Staff** role!`).catch(() => {});
            }

            await interaction.reply({ content: `✅ **Accepted.** Assigned Trial Staff to <@${targetUserId}>. Deleting room in 10 seconds...` });
            return setTimeout(() => interaction.channel.delete().catch(() => {}), 10000);
        }

        if (interaction.customId.startsWith('app_deny_')) {
            const targetUserId = interaction.customId.replace('app_deny_', '');
            const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);

            if (member) {
                await member.send(`Hello. We appreciate your interest in **${interaction.guild.name}**, but management has decided not to move forward at this time.`).catch(() => {});
            }

            await interaction.reply({ content: `❌ **Denied.** Candidate notified. Deleting room in 5 seconds...` });
            return setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }

        if (interaction.customId === 'app_delete') {
            await interaction.reply({ content: '🗑️ Deleting channel...' });
            return setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
        }
    }

    // ---------------------------------------------------------
    // SUPPORT TICKET CREATION
    // ---------------------------------------------------------
    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
        await interaction.deferReply({ ephemeral: true });

        const type = interaction.customId.replace('ticket_', '');
        const user = interaction.user;
        const channelName = `${type}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)}`;

        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: CONFIG.TICKET_CATEGORY_ID || null,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
            ]
        });

        if (interaction.guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
            await ticketChannel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
        }

        const embed = new EmbedBuilder()
            .setTitle(`Department: ${type.toUpperCase()}`)
            .setDescription(`Hello <@${user.id}>, describe your issue or paste your order confirmation. A staff member will claim this ticket shortly.`)
            .setColor(0x00E5FF)
            .setFooter({ text: 'Use Claim to take ownership. Close when completed.' });

        const ticketActions = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('🙋'),
            new ButtonBuilder().setCustomId('btn_unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
            new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await ticketChannel.send({ content: `<@${user.id}>`, embeds: [embed], components: [ticketActions] });
        return await interaction.editReply({ content: `✅ Ticket opened: ${ticketChannel}` });
    }

    // ---------------------------------------------------------
    // TICKET CLAIM / UNCLAIM / TRANSCRIPT & CLOSE
    // ---------------------------------------------------------
    if (interaction.isButton() && ['btn_claim_ticket', 'btn_unclaim_ticket', 'btn_close_ticket'].includes(interaction.customId)) {
        const member = interaction.member;
        const isStaffMember = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                              member.roles.cache.has(CONFIG.STAFF_ROLE_ID) ||
                              member.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID);

        if (!isStaffMember) {
            return await interaction.reply({ content: '❌ Only staff can manage tickets.', ephemeral: true });
        }

        if (interaction.customId === 'btn_claim_ticket') {
            const isSenior = member.permissions.has(PermissionsBitField.Flags.Administrator) || member.roles.cache.has(CONFIG.STAFF_ROLE_ID);

            if (isSenior) {
                // Hide ticket from other staff for privacy
                await interaction.channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: false });
                await interaction.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });
                return await interaction.reply({ content: `🔒 **Exclusively Claimed** by <@${member.id}>.` });
            } else {
                return await interaction.reply({ content: `🙋 **Claimed** by Trial Staff <@${member.id}>.` });
            }
        }

        if (interaction.customId === 'btn_unclaim_ticket') {
            if (interaction.guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                await interaction.channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
            }
            return await interaction.reply({ content: '🔄 Ticket unclaimed. Re-opened to all staff.' });
        }

        if (interaction.customId === 'btn_close_ticket') {
            await interaction.reply({ content: '🔒 Closing ticket, compiling logs, and deleting channel...' });

            const fetchedMessages = await interaction.channel.messages.fetch({ limit: 100 });
            const logLines = fetchedMessages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.cleanContent}`).join('\n');
            const transcriptBuffer = Buffer.from(logLines, 'utf-8');
            const fileAttachment = new AttachmentBuilder(transcriptBuffer, { name: `${interaction.channel.name}-transcript.txt` });

            if (CONFIG.TRANSCRIPTS_CHANNEL_ID) {
                const logChan = interaction.guild.channels.cache.get(CONFIG.TRANSCRIPTS_CHANNEL_ID);
                if (logChan) await logChan.send({ content: `Transcript for \`${interaction.channel.name}\``, files: [fileAttachment] });
            }

            return setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }
    }
});

client.login(CONFIG.TOKEN);
