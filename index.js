const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Collection,
    PermissionsBitField,
    ChannelType 
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const { initWorkingHours, sendShiftUpdate } = require('./working-hours');

// Bot Configuration
const CONFIG = {
    TOKEN: process.env.BOT_TOKEN,
    CUSTOMER_ROLE_ID: process.env.CUSTOMER_ROLE_ID || 'YOUR_CUSTOMER_ROLE_ID',    
    WELCOME_CHANNEL_ID: process.env.WELCOME_CHANNEL_ID || 'YOUR_WELCOME_CHANNEL_ID',
    // AUTO-NUKE CONFIGURATION
    NUKE_CHANNEL_ID: '1533093897277014157',
    NUKE_INTERVAL_HOURS: 24,
    NUKE_LOGO_URL: 'Gemini_Generated_Image_6e1fjf6e1fjf6e1f-removebg-preview.png',
    NUKE_BANNER_URL: 'Gemini_Generated_Image_6e1fjf6e1fjf6e1f-removebg-preview.png',
    // ROLES HIERARCHY
    STAFF_ROLE_ID: '1533093844822790225',
    TRIAL_STAFF_ROLE_ID: '1542980594408099901',
    ADMIN_ROLE_IDS: ['659477576422785025', '1533546090983588074'],
    // CATEGORIES & LOGS
    TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || '1535740055623180388',
    TRANSCRIPT_LOG_CHANNEL_ID: '1546038594613813350',
    APP_CATEGORY_ID: process.env.APP_CATEGORY_ID || '1535740055623180388',
    APP_LOG_CHANNEL_ID: process.env.APP_LOG_CHANNEL_ID || '1545741112868610068',
    // VERIFIED GUILD MERGERS LINK
    VERIFY_LINK: 'https://verify.guildmergers.com/gmhub/1040987039270707231',
    // CHANNELS & PRESETS
    NEWS_CHANNEL_ID: '1537392374185992242',
    STAFF_DISPATCH_CHANNEL_ID: '1546088909702824067',
    DEFAULT_STORE_URL: 'https://gmh-shop.com',
    TICKET_CHANNEL_LINK: 'https://discord.com/channels/1040987039270707231/1533093930730520689',
    // PERMANENT DEFAULT ANNOUNCEMENT BANNER
    DEFAULT_NEWS_BANNER: 'https://i.postimg.cc/rF6CbnxD/Gemini-Generated-Image-2rln5o2rln5o2rln.jpg'
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites
    ]
});

const guildInvites = new Map();
const memberInviters = new Map(); 

// States
const activeTickets = new Map();
const draftAnnouncements = new Map();

// Helper: Parse human-readable duration strings (e.g. 10m, 2h, 1d)
function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)([smhd])$/i);
    if (!match) return null;
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const mults = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
    return val * mults[unit];
}

// 9-Question Staff Application Flow
const APP_QUESTIONS = [
    { title: "Age & Hardware", question: "**Question 1/9:** How old are you, and do you own a Windows PC that you can use while providing support?" },
    { title: "Timezone & Active Hours", question: "**Question 2/9:** What is your timezone/country, and what specific hours of the day are you active?" },
    { title: "Past Experience", question: "**Question 3/9:** What past experience do you have moderating Discord servers or managing support tickets?" },
    { title: "Antivirus / Defender", question: "**Question 4/9:** A buyer downloads a file and says it instantly deletes itself or won't open. What exact steps or antivirus exclusions do you guide them through?" },
    { title: "PC Requirements", question: "**Question 5/9:** A tool fails to run due to missing PC prerequisites. Which common runtimes, DirectX components, or BIOS settings (e.g. Virtualization/TPM) do you check?" },
    { title: "Chat Triage", question: "**Question 6/9:** A user starts complaining in public chat calling the server a scam because their key or support is taking time. How do you handle this publicly, and how do you direct them into tickets?" },
    { title: "Escalation Policy", question: "**Question 7/9:** Lower staff do NOT dispense keys or process refunds. If a user demands a replacement key or refund, what exact order information do you gather before escalating to senior staff?" },
    { title: "Rules & Favoritism", question: "**Question 8/9:** If a friend of yours in the server breaks server rules or asks you for free access/leaks, how do you respond?" },
    { title: "Compensation", question: "**Question 9/9:** Are you looking to be compensated through free tool access keys, weekly payouts, or a mixture of both?" }
];

client.once('ready', async () => {
    console.log('=========================================');
    console.log(`[ONLINE] Logged in as: ${client.user.tag}`);
    console.log('=========================================');

    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const firstInvites = await guild.invites.fetch();
            const inviteMap = new Collection();
            firstInvites.forEach(inv => inviteMap.set(inv.code, inv.uses));
            guildInvites.set(guild.id, inviteMap);
        } catch (err) {}
    }

    if (CONFIG.NUKE_CHANNEL_ID) {
        const intervalMs = CONFIG.NUKE_INTERVAL_HOURS * 60 * 60 * 1000;
        setInterval(() => {
            nukeChannel(CONFIG.NUKE_CHANNEL_ID);
        }, intervalMs);
    }

    try {
        initWorkingHours(client);
    } catch (err) {
        console.error('[WORKING HOURS ERROR]:', err.message);
    }
});

async function nukeChannel(channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;

        const position = channel.position;
        const newChannel = await channel.clone({ reason: 'Auto nuke' });

        await newChannel.setPosition(position);
        await channel.delete('Auto nuke');

        const embed = new EmbedBuilder()
            .setColor('#00E5FF')
            .setTitle('🧹 Chat Nuked')
            .setDescription('This channel has been cleared to keep things clean.\nPlease continue discussions here.')
            .setFooter({ text: `Auto-nuke runs every ${CONFIG.NUKE_INTERVAL_HOURS}h` })
            .setTimestamp();

        await newChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('[AUTO-NUKE ERROR]:', error);
    }
}

function buildTicketControlRow(isClaimed = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒'),
        new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Claim')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🙋')
            .setDisabled(isClaimed),
        new ButtonBuilder()
            .setCustomId('unclaim_ticket')
            .setLabel('Unclaim')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
            .setDisabled(!isClaimed)
    );
}

// Commands
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/ +/);
    const command = args[0].toLowerCase();

    const isStaff = message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID);
    const isTrialStaff = message.member.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID);
    const isAdmin = CONFIG.ADMIN_ROLE_IDS.some(id => message.member.roles.cache.has(id) || message.author.id === id) ||
                    message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (command === '!ping') return message.reply('🏓 Pong!');

    // -------------------------------------------------------------
    // AUTOMATED ORDER DELIVERY COMMAND
    // -------------------------------------------------------------
    if (command === '!deliver') {
        if (!isAdmin && !isStaff) {
            return message.reply('❌ You do not have permission to use this command.');
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply('❌ Specify a valid target user.\n**Usage:** `!deliver @user <product/license key>`');
        }

        // Clean out command call and mentions so multi-word keys aren't broken
        const deliveryPayload = message.content
            .replace(/^![a-zA-Z0-9_-]+/, '')
            .replace(/<@!?[0-9]+>/g, '')
            .trim();

        if (!deliveryPayload) {
            return message.reply('❌ Please provide the license key or credentials to deliver.');
        }

        try {
            const deliveryEmbed = new EmbedBuilder()
                .setTitle('📦 Order Delivered • GameMarket Hub')
                .setDescription('Thank you for purchasing with **GameMarket Hub**!\nYour product credentials and instructions are provided below.')
                .addFields(
                    { name: 'Product / License Key', value: `\`\`\`${deliveryPayload}\`\`\`` },
                    { name: 'Storefront', value: `[gmh-shop.com](${CONFIG.DEFAULT_STORE_URL})`, inline: true },
                    { name: 'Support', value: `[Open Support Ticket](${CONFIG.TICKET_CHANNEL_LINK})`, inline: true }
                )
                .setColor(0x00E5FF)
                .setFooter({ text: 'GameMarket Hub • Automated Delivery System' })
                .setTimestamp();

            await targetMember.send({ embeds: [deliveryEmbed] });
            return await message.reply(`✅ Successfully delivered credentials to **${targetMember.user.tag}** via Direct Message.`);
        } catch (err) {
            console.error('[DELIVER ERROR]:', err);
            return await message.reply(`⚠️ Could not send DM to **${targetMember.user.tag}**. Their Direct Messages are locked/disabled.`);
        }
    }

    // -------------------------------------------------------------
    // MODERATION ACTIONS (TIMEOUT, UNTIMEOUT, KICK, BAN)
    // -------------------------------------------------------------
    if (command === '!timeout' || command === '!mute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !isAdmin) {
            return message.reply('❌ You lack permissions to moderate members.');
        }

        const target = message.mentions.members.first() || message.guild.members.cache.get(args[1]);
        if (!target) return message.reply('❌ **Usage:** `!timeout @user 10m [reason]`');
        if (!target.moderatable) return message.reply('❌ Cannot timeout this user due to role hierarchy.');

        const durationMs = parseDuration(args[2]);
        if (!durationMs || durationMs > 28 * 24 * 60 * 60 * 1000) {
            return message.reply('❌ Provide a valid duration up to 28 days (e.g. `60s`, `10m`, `2h`, `1d`).');
        }

        const reason = args.slice(3).join(' ') || 'No reason provided';
        try {
            await target.timeout(durationMs, `${reason} | By: ${message.author.tag}`);
            return message.channel.send(`🤐 **${target.user.tag}** has been timed out for **${args[2]}**.\n**Reason:** ${reason}`);
        } catch (err) {
            return message.reply(`❌ Failed to timeout user: ${err.message}`);
        }
    }

    if (command === '!untimeout' || command === '!unmute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !isAdmin) {
            return message.reply('❌ You lack permissions to moderate members.');
        }

        const target = message.mentions.members.first() || message.guild.members.cache.get(args[1]);
        if (!target) return message.reply('❌ **Usage:** `!untimeout @user`');
        if (!target.moderatable) return message.reply('❌ Cannot modify this user.');

        try {
            await target.timeout(null, `Untimeout by ${message.author.tag}`);
            return message.channel.send(`🔊 Removed timeout from **${target.user.tag}**.`);
        } catch (err) {
            return message.reply(`❌ Failed to remove timeout: ${err.message}`);
        }
    }

    if (command === '!kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers) && !isAdmin) {
            return message.reply('❌ You lack permissions to kick members.');
        }

        const target = message.mentions.members.first() || message.guild.members.cache.get(args[1]);
        if (!target) return message.reply('❌ **Usage:** `!kick @user [reason]`');
        if (!target.kickable) return message.reply('❌ Cannot kick this user.');

        const reason = args.slice(2).join(' ') || 'No reason provided';
        try {
            await target.kick(`${reason} | By: ${message.author.tag}`);
            return message.channel.send(`👢 Kicked **${target.user.tag}**.\n**Reason:** ${reason}`);
        } catch (err) {
            return message.reply(`❌ Failed to kick user: ${err.message}`);
        }
    }

    if (command === '!ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !isAdmin) {
            return message.reply('❌ You lack permissions to ban members.');
        }

        const target = message.mentions.members.first() || message.guild.members.cache.get(args[1]);
        if (!target) return message.reply('❌ **Usage:** `!ban @user [reason]`');
        if (!target.bannable) return message.reply('❌ Cannot ban this user.');

        const reason = args.slice(2).join(' ') || 'No reason provided';
        try {
            await target.ban({ reason: `${reason} | By: ${message.author.tag}` });
            return message.channel.send(`🔨 Permanently banned **${target.user.tag}**.\n**Reason:** ${reason}`);
        } catch (err) {
            return message.reply(`❌ Failed to ban user: ${err.message}`);
        }
    }

    // Setup news dispatcher panel in #staff-dispatch
    if (command === '!setup-news') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const controlEmbed = new EmbedBuilder()
            .setTitle('📢 News & Announcement Dispatcher')
            .setDescription(
                "Click below to generate an announcement for <#" + CONFIG.NEWS_CHANNEL_ID + ">.\n\n" +
                "**Automated Layout:**\n" +
                "• **Banner:** GMH permanent wide hero banner is automatically applied.\n" +
                "• **Store** & **Support Ticket** buttons attach automatically.\n" +
                "• Optional **Product Link** creates a direct view/buy button."
            )
            .setColor(0x00E5FF);

        const controlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('news_start_draft')
                .setLabel('Create Announcement')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📢')
        );

        await message.channel.send({ embeds: [controlEmbed], components: [controlRow] });
        await message.delete().catch(() => {});
    }

    // Deploy verification embed with fixed Guild Mergers URL
    if (command === '!send-verify') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const embed = new EmbedBuilder()
            .setTitle('🛡️ GMH • Verification Required')
            .setDescription(
                "Welcome to **GameMarket Hub**!\n\n" +
                "To access our community channels, ticket support, and shop updates, verify your account below.\n\n" +
                "• Protects against spam bots & server raids\n" +
                "• Unlocks all member channels instantly\n" +
                "• Keeps your account connected to GMH backup systems\n\n" +
                "Click the button below to authorize and gain access."
            )
            .setColor(0x00E5FF)
            .setFooter({ text: 'GameMarket Hub • Automated Security' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify Account')
                .setStyle(ButtonStyle.Link)
                .setURL(CONFIG.VERIFY_LINK)
                .setEmoji('✅')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    }

    // Spawn Staff Application Hub
    if (command === '!send-apply') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const applyEmbed = new EmbedBuilder()
            .setTitle('💼 GMH • Staff Recruitment')
            .setDescription(
                "Interested in joining the **GameMarket Hub** support and moderation team?\n\n" +
                "**Requirements:**\n" +
                "• Active daily availability\n" +
                "• Functional Windows PC for technical assistance\n" +
                "• Clean conduct and strong communication\n\n" +
                "Click below to open your private recruitment channel."
            )
            .setColor(0x00E5FF)
            .setFooter({ text: 'GameMarket Hub • Staff Applications' });

        const applyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_open_app')
                .setLabel('Apply for Staff')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝')
        );

        await message.channel.send({ embeds: [applyEmbed], components: [applyRow] });
        await message.delete().catch(() => {});
    }

    // Spawn Support Tickets Hub
    if (command === '!spawn-tickets') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const ticketEmbed = new EmbedBuilder()
            .setTitle('🛡️ GMH-SHOP • Customer Support Hub')
            .setDescription(
                "Need technical support, custom orders, or reseller access? Select the appropriate category below to open a direct channel with our staff team.\n\n" +
                "**⚡ Support Guidelines**\n" +
                "• **One Ticket per Issue:** Avoid opening duplicate tickets.\n" +
                "• **No Passive Pings:** Submit your problem details immediately upon opening.\n" +
                "• **Logs & Proof:** If reporting errors, attach full-screen screenshots and loader logs.\n\n" +
                "**💳 Accepted Payment Options**\n" +
                "• **Crypto:** BTC • LTC • USDT • ETH *(Instant auto-delivery on site)*\n" +
                "• **Credit / Debit Cards:** Supported via site checkout\n" +
                "• **Alternative:** PayPal F&F and Rewarble Gift Cards *(Supported through tickets)*\n\n" +
                "Click a button below to launch your private ticket form."
            )
            .setColor(0x00E5FF)
            .setFooter({ text: 'GameMarket Hub • Automated Support System' })
            .setTimestamp();

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_general').setLabel('Tech Support').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
            new ButtonBuilder().setCustomId('ticket_purchase').setLabel('Buy / Payment').setStyle(ButtonStyle.Success).setEmoji('🛒'),
            new ButtonBuilder().setCustomId('ticket_resell').setLabel('Reseller Access').setStyle(ButtonStyle.Secondary).setEmoji('🤝'),
            new ButtonBuilder().setCustomId('ticket_hwid').setLabel('HWID Reset').setStyle(ButtonStyle.Danger).setEmoji('🔄')
        );

        await message.channel.send({ embeds: [ticketEmbed], components: [buttonRow] });
        await message.delete().catch(() => {});
    }
});

// All Interaction Handlers
client.on('interactionCreate', async (interaction) => {
    try {
        // -------------------------------------------------------------
        // 1. ANNOUNCEMENT DISPATCHER (PERMANENT IMAGE BANNER)
        // -------------------------------------------------------------
        if (interaction.isButton() && interaction.customId === 'news_start_draft') {
            const modal = new ModalBuilder()
                .setCustomId('modal_news_draft')
                .setTitle('Create Server Announcement');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('news_title')
                        .setLabel('Title / Headline')
                        .setPlaceholder('e.g. ⚡ BO7 SLOTTED EXTERNAL RESTOCK')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('news_body')
                        .setLabel('Announcement Text')
                        .setPlaceholder('Enter description, changelog, discount codes...')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('news_product_url')
                        .setLabel('Direct Product URL (Optional)')
                        .setPlaceholder('https://gmh-shop.com/... (Leaves out button if blank)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('news_ping')
                        .setLabel('Ping (@everyone / @here / none)')
                        .setPlaceholder('everyone, here, or leave empty')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                )
            );

            return await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_news_draft') {
            await interaction.deferReply({ ephemeral: true });

            const title = interaction.fields.getTextInputValue('news_title');
            const body = interaction.fields.getTextInputValue('news_body');
            const productUrl = interaction.fields.getTextInputValue('news_product_url')?.trim();
            const rawPing = interaction.fields.getTextInputValue('news_ping')?.toLowerCase().trim();

            let pingText = '';
            if (rawPing === 'everyone') pingText = '@everyone';
            else if (rawPing === 'here') pingText = '@here';

            const previewEmbed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(body)
                .setColor(0x00E5FF)
                .setImage(CONFIG.DEFAULT_NEWS_BANNER);

            const linkRow = new ActionRowBuilder();
            if (productUrl && (productUrl.startsWith('http://') || productUrl.startsWith('https://'))) {
                linkRow.addComponents(
                    new ButtonBuilder().setLabel('View Product').setStyle(ButtonStyle.Link).setURL(productUrl).setEmoji('🔥')
                );
            }
            linkRow.addComponents(
                new ButtonBuilder().setLabel('Store').setStyle(ButtonStyle.Link).setURL(CONFIG.DEFAULT_STORE_URL).setEmoji('🛒'),
                new ButtonBuilder().setLabel('Open Ticket').setStyle(ButtonStyle.Link).setURL(CONFIG.TICKET_CHANNEL_LINK).setEmoji('🎟️')
            );

            const controlRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('news_dispatch').setLabel('🚀 Post to Announcements').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('news_cancel').setLabel('Discard').setStyle(ButtonStyle.Danger)
            );

            const previewMsg = await interaction.channel.send({
                content: `**[PREVIEW]** ${pingText ? `(Ping: \`${pingText}\`)` : '(No ping)'}`,
                embeds: [previewEmbed],
                components: [linkRow, controlRow]
            });

            draftAnnouncements.set(previewMsg.id, {
                title,
                body,
                pingText,
                productUrl: (productUrl && productUrl.startsWith('http')) ? productUrl : null
            });

            return await interaction.editReply({ content: '✅ Preview generated below with your permanent banner. Check it and click **Post to Announcements**.' });
        }

        if (interaction.isButton() && interaction.customId === 'news_dispatch') {
            const draft = draftAnnouncements.get(interaction.message.id);
            if (!draft) return await interaction.reply({ content: '❌ Draft session expired.', ephemeral: true });

            const newsChannel = interaction.guild.channels.cache.get(CONFIG.NEWS_CHANNEL_ID) || 
                                await interaction.guild.channels.fetch(CONFIG.NEWS_CHANNEL_ID).catch(() => null);

            if (!newsChannel) {
                return await interaction.reply({ content: '❌ Announcements channel not found.', ephemeral: true });
            }

            const finalEmbed = new EmbedBuilder()
                .setTitle(draft.title)
                .setDescription(draft.body)
                .setColor(0x00E5FF)
                .setImage(CONFIG.DEFAULT_NEWS_BANNER)
                .setTimestamp();

            const linkRow = new ActionRowBuilder();
            if (draft.productUrl) {
                linkRow.addComponents(
                    new ButtonBuilder().setLabel('View Product').setStyle(ButtonStyle.Link).setURL(draft.productUrl).setEmoji('🔥')
                );
            }
            linkRow.addComponents(
                new ButtonBuilder().setLabel('Store').setStyle(ButtonStyle.Link).setURL(CONFIG.DEFAULT_STORE_URL).setEmoji('🛒'),
                new ButtonBuilder().setLabel('Open Ticket').setStyle(ButtonStyle.Link).setURL(CONFIG.TICKET_CHANNEL_LINK).setEmoji('🎟️')
            );

            await newsChannel.send({
                content: draft.pingText ? draft.pingText : undefined,
                embeds: [finalEmbed],
                components: [linkRow]
            });

            draftAnnouncements.delete(interaction.message.id);
            await interaction.message.delete().catch(() => {});

            return await interaction.reply({ content: `🚀 Dispatched directly to ${newsChannel}!`, ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId === 'news_cancel') {
            draftAnnouncements.delete(interaction.message.id);
            await interaction.message.delete().catch(() => {});
            return await interaction.reply({ content: '🗑️ Draft deleted.', ephemeral: true });
        }

        // -------------------------------------------------------------
        // 2. STAFF RECRUITMENT CREATION
        // -------------------------------------------------------------
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

            const questionsText = APP_QUESTIONS.map(q => `${q.question}`).join('\n\n');
            const appEmbed = new EmbedBuilder()
                .setTitle(`Staff Application • ${user.tag}`)
                .setDescription(`Welcome ${user}! Please answer all questions below in this channel.\n\n${questionsText}`)
                .setColor(0x00E5FF)
                .setFooter({ text: 'Answer each question thoroughly.' });

            await appChannel.send({ embeds: [appEmbed] });
            return await interaction.editReply({ content: `✅ Application channel opened: ${appChannel}` });
        }

        // -------------------------------------------------------------
        // 3. TICKETS MODAL OPENERS
        // -------------------------------------------------------------
        if (interaction.isButton()) {
            if (interaction.customId === 'ticket_general') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_general').setTitle('🛠️ Technical Assistance');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('general_tool').setLabel('Which software/game is having issues?').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('general_sys').setLabel('Windows Build & Antivirus Status').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('general_reason').setLabel('Explain the issue or error code').setStyle(TextInputStyle.Paragraph).setRequired(true)
                    )
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'ticket_purchase') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_purchase').setTitle('🛒 Purchase & Invoicing');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('purchase_item').setLabel('Product & Duration').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('purchase_method').setLabel('Payment Method').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('purchase_orderid').setLabel('Order/TX ID (If already paid)').setStyle(TextInputStyle.Short).setRequired(false)
                    )
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'ticket_resell') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_resell').setTitle('🤝 Reseller Application');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('resell_products').setLabel('Which tools are you looking to stock?').setStyle(TextInputStyle.Paragraph).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('resell_platform').setLabel('Storefront or Server Link').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('resell_volume').setLabel('Estimated Weekly Sales Volume').setStyle(TextInputStyle.Short).setRequired(false)
                    )
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'ticket_hwid') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_hwid').setTitle('🔄 HWID Reset Request');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('hwid_product').setLabel('Tool Name').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('hwid_key').setLabel('Active License Key').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('hwid_reason').setLabel('Reason for Hardware Change').setStyle(TextInputStyle.Paragraph).setRequired(true)
                    )
                );
                return await interaction.showModal(modal);
            }

            // Ticket claim/unclaim/close
            const channel = interaction.channel;
            const member = interaction.member;

            const isFullStaff = member?.roles?.cache?.has(CONFIG.STAFF_ROLE_ID);
            const isTrialStaff = member?.roles?.cache?.has(CONFIG.TRIAL_STAFF_ROLE_ID);
            const isAdmin = CONFIG.ADMIN_ROLE_IDS.some(id => member?.roles?.cache?.has(id) || member?.id === id) || 
                            member?.permissions?.has(PermissionsBitField.Flags.Administrator);

            if (interaction.customId === 'claim_ticket') {
                if (!isFullStaff && !isTrialStaff && !isAdmin) {
                    return await interaction.reply({ content: '❌ Only staff can claim tickets.', ephemeral: true });
                }

                const ticketData = activeTickets.get(channel.id);
                if (ticketData?.claimedBy) {
                    return await interaction.reply({ content: `⚠️ Already claimed by <@${ticketData.claimedBy}>.`, ephemeral: true });
                }

                if (isTrialStaff && !isFullStaff && !isAdmin) {
                    await channel.permissionOverwrites.edit(member.id, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        AttachFiles: true
                    });
                    activeTickets.set(channel.id, { ...ticketData, claimedBy: member.id, isTrial: true });

                    const claimEmbed = new EmbedBuilder()
                        .setDescription(`🙋 **${member.user.tag}** (Trial Staff) has claimed this ticket.\nSenior staff can still view and participate.`)
                        .setColor(0x5865F2);

                    await interaction.update({ components: [buildTicketControlRow(true)] });
                    return await channel.send({ embeds: [claimEmbed] });
                }

                await channel.permissionOverwrites.edit(member.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });

                if (interaction.guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                    await channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: false });
                }
                if (interaction.guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                    await channel.permissionOverwrites.edit(CONFIG.TRIAL_STAFF_ROLE_ID, { ViewChannel: false });
                }

                for (const adminId of CONFIG.ADMIN_ROLE_IDS) {
                    if (interaction.guild.roles.cache.has(adminId)) {
                        await channel.permissionOverwrites.edit(adminId, { ViewChannel: true, SendMessages: true });
                    }
                }

                activeTickets.set(channel.id, { ...ticketData, claimedBy: member.id, isTrial: false });

                const claimEmbed = new EmbedBuilder()
                    .setDescription(`🔒 **${member.user.tag}** has claimed this ticket.\nChannel visibility has been locked to this staff member and admins.`)
                    .setColor(0x2ECC71);

                await interaction.update({ components: [buildTicketControlRow(true)] });
                return await channel.send({ embeds: [claimEmbed] });
            }

            if (interaction.customId === 'unclaim_ticket') {
                const ticketData = activeTickets.get(channel.id);
                if (!ticketData?.claimedBy) return await interaction.reply({ content: '⚠️ Not claimed.', ephemeral: true });

                if (ticketData.claimedBy !== member.id && !isAdmin) {
                    return await interaction.reply({ content: '❌ Only the assigned staff member or an Admin can unclaim.', ephemeral: true });
                }

                if (interaction.guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                    await channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
                }
                if (interaction.guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                    await channel.permissionOverwrites.edit(CONFIG.TRIAL_STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
                }

                await channel.permissionOverwrites.delete(ticketData.claimedBy).catch(() => {});
                activeTickets.set(channel.id, { ...ticketData, claimedBy: null, isTrial: false });

                const unclaimEmbed = new EmbedBuilder()
                    .setDescription(`🔄 Ticket unclaimed by **${member.user.tag}**.\nTicket is now open for any staff member.`)
                    .setColor(0xF1C40F);

                await interaction.update({ components: [buildTicketControlRow(false)] });
                return await channel.send({ embeds: [unclaimEmbed] });
            }

            if (interaction.customId === 'close_ticket') {
                await interaction.reply('📁 Generating transcript and closing ticket...');

                const ticketData = activeTickets.get(channel.id);
                let ownerId = ticketData?.ticketOwnerId;
                if (!ownerId && channel.topic) {
                    const match = channel.topic.match(/^([0-9]+)\|Support/);
                    if (match) ownerId = match[1];
                }

                try {
                    const transcriptAttachment = await discordTranscripts.createTranscript(channel, {
                        limit: -1,
                        fileName: `transcript-${channel.name}.html`,
                        saveImages: true,
                        poweredBy: false
                    });

                    const closeSummaryEmbed = new EmbedBuilder()
                        .setTitle('🔒 Ticket Closed')
                        .addFields(
                            { name: 'Channel', value: `\`#${channel.name}\``, inline: true },
                            { name: 'Closed By', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                            { name: 'Ticket Owner', value: ownerId ? `<@${ownerId}>` : 'Unknown', inline: true }
                        )
                        .setColor(0xE74C3C)
                        .setTimestamp();

                    const logChannel = interaction.guild.channels.cache.get(CONFIG.TRANSCRIPT_LOG_CHANNEL_ID) || 
                                       await interaction.guild.channels.fetch(CONFIG.TRANSCRIPT_LOG_CHANNEL_ID).catch(() => null);
                    if (logChannel) {
                        await logChannel.send({ embeds: [closeSummaryEmbed], files: [transcriptAttachment] });
                    }

                    if (ownerId) {
                        const owner = await client.users.fetch(ownerId).catch(() => null);
                        if (owner) {
                            const dmEmbed = new EmbedBuilder()
                                .setTitle(`📄 Support Transcript • ${interaction.guild.name}`)
                                .setDescription(`Your ticket \`#${channel.name}\` has been closed.\nAn offline HTML copy of your chat history is attached.`)
                                .setColor(0x00E5FF)
                                .setTimestamp();

                            await owner.send({ embeds: [dmEmbed], files: [transcriptAttachment] }).catch(() => {});
                        }
                    }

                    await channel.send('✅ Transcript saved. Deleting in 5 seconds...');
                    activeTickets.delete(channel.id);
                    setTimeout(() => channel.delete().catch(() => {}), 5000);
                } catch (err) {
                    console.error('Transcript error:', err);
                    await channel.send('❌ Error creating transcript. Deleting channel in 5s...');
                    setTimeout(() => channel.delete().catch(() => {}), 5000);
                }
                return;
            }
        }

        // -------------------------------------------------------------
        // 4. TICKET FORM SUBMISSIONS
        // -------------------------------------------------------------
        if (interaction.isModalSubmit()) {
            const guild = interaction.guild;
            const user = interaction.user;

            let ticketType = 'Support';
            let channelPrefix = 'ticket';
            let embedColor = 0x00E5FF;
            const fields = [];

            if (interaction.customId === 'modal_ticket_general') {
                ticketType = 'Technical Support';
                channelPrefix = 'tech';
                embedColor = 0x5865F2;
                fields.push(
                    { name: 'Software', value: interaction.fields.getTextInputValue('general_tool') || 'N/A', inline: true },
                    { name: 'OS & Defender', value: interaction.fields.getTextInputValue('general_sys') || 'N/A', inline: true },
                    { name: 'Issue Details', value: interaction.fields.getTextInputValue('general_reason') || 'N/A' }
                );
            } else if (interaction.customId === 'modal_ticket_purchase') {
                ticketType = 'Purchase Order';
                channelPrefix = 'buy';
                embedColor = 0x2ECC71;
                fields.push(
                    { name: 'Product', value: interaction.fields.getTextInputValue('purchase_item') || 'N/A', inline: true },
                    { name: 'Payment Method', value: interaction.fields.getTextInputValue('purchase_method') || 'N/A', inline: true },
                    { name: 'Order/TX ID', value: interaction.fields.getTextInputValue('purchase_orderid') || 'Not Provided' }
                );
            } else if (interaction.customId === 'modal_ticket_resell') {
                ticketType = 'Reseller Inquiry';
                channelPrefix = 'resell';
                embedColor = 0x95A5A6;
                fields.push(
                    { name: 'Products', value: interaction.fields.getTextInputValue('resell_products') || 'N/A' },
                    { name: 'Store Link', value: interaction.fields.getTextInputValue('resell_platform') || 'N/A', inline: true },
                    { name: 'Est. Volume', value: interaction.fields.getTextInputValue('resell_volume') || 'N/A', inline: true }
                );
            } else if (interaction.customId === 'modal_ticket_hwid') {
                ticketType = 'HWID Reset';
                channelPrefix = 'hwid';
                embedColor = 0xE74C3C;
                fields.push(
                    { name: 'Software', value: interaction.fields.getTextInputValue('hwid_product') || 'N/A', inline: true },
                    { name: 'License Key', value: `\`\`\`${interaction.fields.getTextInputValue('hwid_key') || 'N/A'}\`\`\`` },
                    { name: 'Reason', value: interaction.fields.getTextInputValue('hwid_reason') || 'N/A' }
                );
            }

            if (['modal_ticket_general', 'modal_ticket_purchase', 'modal_ticket_resell', 'modal_ticket_hwid'].includes(interaction.customId)) {
                await interaction.deferReply({ ephemeral: true });

                const sanitizedName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'user';
                const channelName = `${channelPrefix}-${sanitizedName}`;

                let targetCategory = null;
                if (CONFIG.TICKET_CATEGORY_ID) {
                    targetCategory = guild.channels.cache.get(CONFIG.TICKET_CATEGORY_ID) || await guild.channels.fetch(CONFIG.TICKET_CATEGORY_ID).catch(() => null);
                }

                const permissionOverwrites = [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
                ];

                if (guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                    permissionOverwrites.push({ id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
                }
                if (guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                    permissionOverwrites.push({ id: CONFIG.TRIAL_STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
                }
                for (const adminId of CONFIG.ADMIN_ROLE_IDS) {
                    if (guild.roles.cache.has(adminId)) {
                        permissionOverwrites.push({ id: adminId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
                    }
                }

                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: targetCategory && targetCategory.type === ChannelType.GuildCategory ? targetCategory.id : null,
                    topic: `${user.id}|Support`,
                    permissionOverwrites
                });

                activeTickets.set(ticketChannel.id, { claimedBy: null, ticketOwnerId: user.id, type: ticketType });

                const supportHeaderEmbed = new EmbedBuilder()
                    .setTitle('Ticket Support')
                    .setDescription(`Welcome to your ticket, ${user}!\nHow can we help you today?\n\n\`Channel ID: ${ticketChannel.id}\``)
                    .setColor(0x5865F2);

                const infoEmbed = new EmbedBuilder()
                    .setTitle('📝 Additional Information')
                    .setDescription(`Form answers submitted by **${user.tag}**.`)
                    .setColor(embedColor)
                    .addFields(fields)
                    .setFooter({ text: 'GameMarket Hub • Ticket System' })
                    .setTimestamp();

                await ticketChannel.send({
                    content: `${user} <@&${CONFIG.STAFF_ROLE_ID}>`,
                    embeds: [supportHeaderEmbed],
                    components: [buildTicketControlRow(false)]
                });

                await ticketChannel.send({ embeds: [infoEmbed] });

                return await interaction.editReply({ content: `✅ Your ticket has been opened: ${ticketChannel}` });
            }
        }
    } catch (err) {
        console.error('Interaction error caught:', err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ An error occurred processing this action.', ephemeral: true }).catch(() => {});
        }
    }
});

client.login(CONFIG.TOKEN);
