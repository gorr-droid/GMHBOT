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
    // GUILD MERGERS BACKUP VERIFY LINK
    VERIFY_LINK: 'https://verify.guildmergers.com/gmhub/gamemarkethub'
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

// Track active ticket state: channelId -> { claimedBy, ticketOwnerId, type }
const activeTickets = new Map();

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
        } catch (err) {
            console.log(`Could not cache invites for guild ${guild.name}.`);
        }
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

client.on('inviteCreate', async (invite) => {
    const invites = guildInvites.get(invite.guild.id) || new Collection();
    invites.set(invite.code, invite.uses);
    guildInvites.set(invite.guild.id, invites);
});

async function getRealInvites(guild, userId) {
    const invites = await guild.invites.fetch();
    const userInvites = invites.filter(i => i.inviter && i.inviter.id === userId);
    let totalUses = userInvites.reduce((acc, inv) => acc + inv.uses, 0);

    let leaves = 0;
    for (const [memberId, inviterId] of memberInviters.entries()) {
        if (inviterId === userId) {
            const isStillInGuild = guild.members.cache.has(memberId);
            if (!isStillInGuild) leaves++;
        }
    }

    const realCount = totalUses - leaves;
    return realCount < 0 ? 0 : realCount;
}

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

function buildWelcomePayload(member) {
    const welcomeEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`🎉 Welcome to ${member.guild.name}!`)
        .setDescription(
            `Hey <@${member.id}>, thanks for joining!\n\n` +
            `Use code \`NEW10\` at checkout on **gmh-shop.com** for **10% off**.\n\n` +
            `Type \`!invites\` in any channel to view your reward progress.`
        )
        .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Shop').setStyle(ButtonStyle.Link).setURL('https://gmh-shop.com').setEmoji('🛒'),
        new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL('https://discord.com/channels/1040987039270707231/1533093930730520689/1533740651026452646').setEmoji('🎟️')
    );

    return { embeds: [welcomeEmbed], components: [buttons] };
}

client.on('guildMemberAdd', async (member) => {
    try {
        const payload = buildWelcomePayload(member);
        await member.send(payload).catch(async () => {
            const channel = member.guild.channels.cache.get(CONFIG.WELCOME_CHANNEL_ID);
            if (channel) await channel.send({ content: `Welcome <@${member.id}>!`, ...payload });
        });
    } catch (err) {}
});

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

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    if (command === '!ping') return message.reply('🏓 Pong!');

    if (command === '!shift') {
        if (!message.member.permissions.has('ManageMessages')) return message.reply('❌ No permission.');
        const action = args[1]?.toLowerCase();
        if (action === 'on') {
            await sendShiftUpdate(client, true);
            return message.reply('✅ Support hours set to **ONLINE**.');
        } else if (action === 'off') {
            await sendShiftUpdate(client, false);
            return message.reply('✅ Support hours set to **OFFLINE**.');
        }
        return message.reply('⚠️ Usage: `!shift on` or `!shift off`');
    }

    if (command === '!nuke') {
        if (!message.member.permissions.has('Administrator')) return message.reply('❌ No permission.');
        const targetChannel = message.mentions.channels.first() || message.channel;
        return nukeChannel(targetChannel.id);
    }

    if (command === '!invites') {
        const targetUser = message.mentions.users.first() || message.author;
        try {
            const count = await getRealInvites(message.guild, targetUser.id);
            return message.reply(`📊 **${targetUser.username}** has **${count}** active invites.`);
        } catch (err) {
            return message.reply('❌ Failed to fetch invites.');
        }
    }

    if (command === '!deliver') {
        if (!message.member.permissions.has('Administrator')) return message.reply('❌ No permission.');
        const targetUser = message.mentions.users.first();
        const licenseKey = args[2];
        if (!targetUser || !licenseKey) return message.reply('⚠️ Usage: `!deliver @User KEY`');

        try {
            const keyEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎁 License Key Delivered')
                .setDescription(`Thank you for purchasing!\n\n\`\`\`\n${licenseKey}\n\`\`\``)
                .setTimestamp();

            await targetUser.send({ embeds: [keyEmbed] });
            const member = message.guild.members.cache.get(targetUser.id);
            if (member && CONFIG.CUSTOMER_ROLE_ID) await member.roles.add(CONFIG.CUSTOMER_ROLE_ID).catch(() => {});
            await message.reply(`✅ Key delivered to ${targetUser}!`);
        } catch (e) {
            await message.reply('❌ User DMs are closed.');
        }
    }

    // Custom Server Verification Embed
    if (command === '!send-verify') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const verifyUrl = args[1] || CONFIG.VERIFY_LINK;

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
                .setURL(verifyUrl)
                .setEmoji('✅')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    }

    // Spawn Staff Applications Panel
    if (command === '!spawn-apps') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const recruitEmbed = new EmbedBuilder()
            .setTitle('🛡️ Staff Recruitment')
            .setDescription(
                "We are actively recruiting **Chat Moderators** and **Ticket Support Staff**.\n\n" +
                "**🎯 Requirements:**\n" +
                "• Basic Windows Defender & troubleshooting knowledge\n" +
                "• Fast, composed responses in tickets\n\n" +
                "**💼 Compensation Options:**\n" +
                "• Free tool keys or weekly payouts *(discussed privately)*\n\n" +
                "Click below to begin your private application."
            )
            .setColor(0x00E5FF)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('start_staff_application')
                .setLabel('Apply for Staff')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝')
        );

        await message.channel.send({ embeds: [recruitEmbed], components: [row] });
        await message.delete().catch(() => {});
    }

    // Spawn Support Hub
    if (command === '!spawn-tickets') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const ticketEmbed = new EmbedBuilder()
            .setTitle('🛡️ GMH-SHOP • Customer Support Hub')
            .setDescription(
                "Open a ticket and our support team will help you.\n\n" +
                "**Please do not open a ticket and say nothing or spam messages.**\n" +
                "Tell us what you need help with so we can assist you properly.\n\n" +
                "**What We Can Help With**\n" +
                "• **Technical Support** – Issues, loader crashes, and runtime errors\n" +
                "• **Purchase Support** – Orders, invoices, and payment routing\n" +
                "• **Reselling Support** – Custom store supply & bulk keys\n" +
                "• **HWID Reset** – Key resets and hardware transfers\n\n" +
                "**Accepted Payment Methods**\n" +
                "• Card\n" +
                "• Most Crypto (BTC, LTC, USDT, ETH)\n" +
                "• PayPal F&F (Directly through tickets)\n" +
                "• Rewarble Gift Cards\n\n" +
                "**Before Opening a Ticket**\n" +
                "• Be clear about what you need\n" +
                "• Include screenshots and loader logs\n" +
                "• Please be patient while waiting for staff\n" +
                "• We are not robots 🤖 so wait like a good human 👨"
            )
            .setColor(0x00E5FF)
            .setFooter({ text: 'GameMarket Hub • Support 24/7' })
            .setTimestamp();

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_general')
                .setLabel('General Support')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💬'),
            new ButtonBuilder()
                .setCustomId('ticket_purchase')
                .setLabel('Purchase Support')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛒'),
            new ButtonBuilder()
                .setCustomId('ticket_resell')
                .setLabel('Reselling Support')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🤝'),
            new ButtonBuilder()
                .setCustomId('ticket_hwid')
                .setLabel('HWID Reset')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('💻')
        );

        await message.channel.send({ embeds: [ticketEmbed], components: [buttonRow] });
        await message.delete().catch(() => {});
    }
});

// Interactions
client.on('interactionCreate', async (interaction) => {
    const guild = interaction.guild;
    const user = interaction.user;

    // -------------------------------------------------------------
    // 1. TICKET MODAL LAUNCHERS
    // -------------------------------------------------------------
    if (interaction.isButton()) {
        if (interaction.customId === 'ticket_general') {
            const modal = new ModalBuilder().setCustomId('modal_ticket_general').setTitle('📝 Ticket Information Form');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('general_tool')
                        .setLabel('Which software/game is having issues?')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. Ancient COD, Arc Raiders...')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('general_sys')
                        .setLabel('Windows Version & Antivirus Status')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. Win 11 23H2 / Defender Disabled')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('general_reason')
                        .setLabel('Why you opening a Support Ticket?')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Describe your question or issue...')
                        .setRequired(true)
                )
            );
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'ticket_purchase') {
            const modal = new ModalBuilder().setCustomId('modal_ticket_purchase').setTitle('📝 Ticket Information Form');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('purchase_item')
                        .setLabel('What would you like to Purchase?')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. Thunex BO7 (Month), Temp Spoofer')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('purchase_method')
                        .setLabel('What Payment Method would you like to use?')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Card, PayPal F&F, Crypto, Rewarble...')
                        .setRequired(true)
                )
            );
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'ticket_resell') {
            const modal = new ModalBuilder().setCustomId('modal_ticket_resell').setTitle('📝 Ticket Information Form');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('resell_products')
                        .setLabel('What Products would you like to sell?')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('List software titles...')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('resell_platform')
                        .setLabel('Send the website or Server here.')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(true)
                )
            );
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'ticket_hwid') {
            const modal = new ModalBuilder().setCustomId('modal_ticket_hwid').setTitle('📝 Ticket Information Form');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('hwid_product')
                        .setLabel('What Product you needing a HWID Reset for?')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Enter software name...')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('hwid_reason')
                        .setLabel('Why do you need a HWID Reset?')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('e.g. Reinstalled Windows, changed motherboard...')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('hwid_key')
                        .setLabel('Put your key here.')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Paste your license key...')
                        .setRequired(true)
                )
            );
            return await interaction.showModal(modal);
        }

        // ---------------------------------------------------------
        // 2. TICKET CONTROLS (CLAIM / UNCLAIM / CLOSE)
        // ---------------------------------------------------------
        const channel = interaction.channel;
        const member = interaction.member;

        const isFullStaff = member.roles.cache.has(CONFIG.STAFF_ROLE_ID);
        const isTrialStaff = member.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID);
        const isAdmin = CONFIG.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id) || member.id === id) || 
                        member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (['claim_ticket', 'unclaim_ticket', 'close_ticket'].includes(interaction.customId)) {
            if (!isFullStaff && !isTrialStaff && !isAdmin) {
                return interaction.reply({ content: '❌ Only support staff can perform this action.', ephemeral: true });
            }
        }

        // CLAIM TICKET
        if (interaction.customId === 'claim_ticket') {
            const ticketData = activeTickets.get(channel.id);
            if (ticketData?.claimedBy) {
                return interaction.reply({ content: `⚠️ Already claimed by <@${ticketData.claimedBy}>.`, ephemeral: true });
            }

            // Case A: Trial Staff Claims
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

            // Case B: Full Staff Claims (Strict 1-on-1)
            await channel.permissionOverwrites.edit(member.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });

            if (guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                await channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: false });
            }
            if (guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                await channel.permissionOverwrites.edit(CONFIG.TRIAL_STAFF_ROLE_ID, { ViewChannel: false });
            }

            for (const adminId of CONFIG.ADMIN_ROLE_IDS) {
                if (guild.roles.cache.has(adminId)) {
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

        // UNCLAIM TICKET
        if (interaction.customId === 'unclaim_ticket') {
            const ticketData = activeTickets.get(channel.id);
            if (!ticketData?.claimedBy) {
                return interaction.reply({ content: '⚠️ This ticket is not currently claimed.', ephemeral: true });
            }

            if (ticketData.claimedBy !== member.id && !isAdmin) {
                return interaction.reply({ content: '❌ Only the assigned staff member or an Admin can unclaim.', ephemeral: true });
            }

            if (guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                await channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
            }
            if (guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                await channel.permissionOverwrites.edit(CONFIG.TRIAL_STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
            }

            await channel.permissionOverwrites.delete(ticketData.claimedBy).catch(() => {});

            activeTickets.set(channel.id, { ...ticketData, claimedBy: null, isTrial: false });

            const unclaimEmbed = new EmbedBuilder()
                .setDescription(`🔄 Ticket unclaimed by **${member.user.tag}**.\nTicket is now available for any staff member to assist.`)
                .setColor(0xF1C40F);

            await interaction.update({ components: [buildTicketControlRow(false)] });
            return await channel.send({ embeds: [unclaimEmbed] });
        }

        // CLOSE TICKET & TRANSCRIPT
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
                        { name: 'Ticket Owner', value: ownerId ? `<@${ownerId}>` : 'Unknown', inline: true },
                        { name: 'Claimed By', value: ticketData?.claimedBy ? `<@${ticketData.claimedBy}>` : 'Unclaimed', inline: true }
                    )
                    .setColor(0xE74C3C)
                    .setTimestamp();

                const logChannel = guild.channels.cache.get(CONFIG.TRANSCRIPT_LOG_CHANNEL_ID) || await guild.channels.fetch(CONFIG.TRANSCRIPT_LOG_CHANNEL_ID).catch(() => null);
                if (logChannel) {
                    await logChannel.send({
                        embeds: [closeSummaryEmbed],
                        files: [transcriptAttachment]
                    });
                }

                if (ownerId) {
                    const owner = await client.users.fetch(ownerId).catch(() => null);
                    if (owner) {
                        const dmEmbed = new EmbedBuilder()
                            .setTitle(`📄 Support Transcript • ${guild.name}`)
                            .setDescription(`Your support ticket \`#${channel.name}\` has been closed.\nAn offline HTML copy of your chat history is attached below.`)
                            .setColor(0x00E5FF)
                            .setTimestamp();

                        await owner.send({
                            embeds: [dmEmbed],
                            files: [transcriptAttachment]
                        }).catch(() => console.log(`Could not DM transcript to user ${ownerId}.`));
                    }
                }

                await channel.send('✅ Transcript saved. Deleting channel in 5 seconds...');
                activeTickets.delete(channel.id);
                setTimeout(() => channel.delete().catch(() => {}), 5000);

            } catch (err) {
                console.error('[TRANSCRIPT ERROR]:', err);
                await channel.send(`❌ Error generating transcript: \`${err.message}\`. Closing anyway in 5s...`);
                setTimeout(() => channel.delete().catch(() => {}), 5000);
            }
            return;
        }
    }

    // -------------------------------------------------------------
    // 3. TICKET CREATION
    // -------------------------------------------------------------
    if (interaction.isModalSubmit()) {
        let ticketType = 'Ticket';
        let channelPrefix = 'ticket';
        let embedColor = 0x00E5FF;
        const fields = [];

        if (interaction.customId === 'modal_ticket_general') {
            ticketType = 'General Support';
            channelPrefix = 'general';
            embedColor = 0x5865F2;
            fields.push(
                { name: '1️⃣ Software / Game', value: interaction.fields.getTextInputValue('general_tool') || 'N/A' },
                { name: '2️⃣ Windows & Defender', value: interaction.fields.getTextInputValue('general_sys') || 'N/A' },
                { name: '3️⃣ Issue Description', value: interaction.fields.getTextInputValue('general_reason') || 'N/A' }
            );
        } else if (interaction.customId === 'modal_ticket_purchase') {
            ticketType = 'Purchase Support';
            channelPrefix = 'buy';
            embedColor = 0x2ECC71;
            fields.push(
                { name: '1️⃣ Product to Purchase', value: interaction.fields.getTextInputValue('purchase_item') || 'N/A' },
                { name: '2️⃣ Payment Method', value: interaction.fields.getTextInputValue('purchase_method') || 'N/A' }
            );
        } else if (interaction.customId === 'modal_ticket_resell') {
            ticketType = 'Reselling Support';
            channelPrefix = 'resell';
            embedColor = 0x95A5A6;
            fields.push(
                { name: '1️⃣ Products to Resell', value: interaction.fields.getTextInputValue('resell_products') || 'N/A' },
                { name: '2️⃣ Store / Server Link', value: interaction.fields.getTextInputValue('resell_platform') || 'N/A' }
            );
        } else if (interaction.customId === 'modal_ticket_hwid') {
            ticketType = 'HWID Reset';
            channelPrefix = 'hwid-reset';
            embedColor = 0xE74C3C;
            fields.push(
                { name: '1️⃣ What Product you needing a HWID Reset for?', value: interaction.fields.getTextInputValue('hwid_product') || 'N/A' },
                { name: '2️⃣ Why do you need a HWID Reset?', value: interaction.fields.getTextInputValue('hwid_reason') || 'N/A' },
                { name: '3️⃣ Put your key here.', value: `\`\`\`${interaction.fields.getTextInputValue('hwid_key') || 'N/A'}\`\`\`` }
            );
        }

        await interaction.deferReply({ ephemeral: true });

        try {
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

            activeTickets.set(ticketChannel.id, {
                claimedBy: null,
                ticketOwnerId: user.id,
                type: ticketType
            });

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

            await ticketChannel.send({
                embeds: [infoEmbed]
            });

            await interaction.editReply({
                content: `✅ Your ticket has been opened: ${ticketChannel}`
            });

        } catch (err) {
            console.error('Error opening ticket channel:', err);
            await interaction.editReply({ content: `❌ Could not open ticket: \`${err.message}\`` });
        }
    }

    // -------------------------------------------------------------
    // 4. STAFF APPLICATIONS
    // -------------------------------------------------------------
    if (interaction.isButton() && interaction.customId === 'start_staff_application') {
        const sanitizedUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'applicant';
        const channelName = `app-${sanitizedUsername}`;

        if (guild.channels.cache.find(c => c.name === channelName)) {
            return interaction.reply({ content: 'You already have an active application open.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            let targetCategory = null;
            if (CONFIG.APP_CATEGORY_ID) {
                targetCategory = guild.channels.cache.get(CONFIG.APP_CATEGORY_ID) || await guild.channels.fetch(CONFIG.APP_CATEGORY_ID).catch(() => null);
            }

            const appChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: targetCategory && targetCategory.type === ChannelType.GuildCategory ? targetCategory.id : null,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
                    ...(CONFIG.STAFF_ROLE_ID && guild.roles.cache.has(CONFIG.STAFF_ROLE_ID) ? [{ id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
                ]
            });

            await interaction.editReply({ content: `Private application channel created: ${appChannel}` });

            const answers = [];
            let questionIndex = 0;

            const promptEmbed = new EmbedBuilder()
                .setTitle(`Staff Application: ${user.tag}`)
                .setDescription(APP_QUESTIONS[questionIndex].question)
                .setColor(0x5865F2);

            await appChannel.send({ content: `${user}`, embeds: [promptEmbed] });

            const collector = appChannel.createMessageCollector({
                filter: (m) => m.author.id === user.id,
                time: 1800000
            });

            collector.on('collect', async (msg) => {
                answers.push({
                    title: APP_QUESTIONS[questionIndex].title,
                    answer: msg.content.trim() || 'No answer'
                });
                questionIndex++;

                if (questionIndex < APP_QUESTIONS.length) {
                    const nextEmbed = new EmbedBuilder()
                        .setDescription(APP_QUESTIONS[questionIndex].question)
                        .setColor(0x5865F2);
                    await appChannel.send({ embeds: [nextEmbed] });
                } else {
                    collector.stop('completed');
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'completed') {
                    await appChannel.send("✅ **Application submitted!** Closing in 15 seconds.");

                    const reviewChannel = guild.channels.cache.get(CONFIG.APP_LOG_CHANNEL_ID) || await guild.channels.fetch(CONFIG.APP_LOG_CHANNEL_ID).catch(() => null);

                    if (reviewChannel) {
                        const reviewEmbed = new EmbedBuilder()
                            .setAuthor({ name: `${user.tag} (${user.id})`, iconURL: user.displayAvatarURL() })
                            .setTitle('📄 New Staff Application')
                            .setColor(0x00E5FF)
                            .setTimestamp();

                        answers.forEach((entry, idx) => {
                            reviewEmbed.addFields({
                                name: `${idx + 1}. ${entry.title}`,
                                value: entry.answer.length > 300 ? entry.answer.slice(0, 297) + '...' : entry.answer,
                                inline: true
                            });
                        });

                        const reviewActionRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`accept_app_${user.id}`)
                                .setLabel('Accept & Open Interview')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('💬'),
                            new ButtonBuilder()
                                .setCustomId(`reject_app_${user.id}`)
                                .setLabel('Reject')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('❌')
                        );

                        await reviewChannel.send({ embeds: [reviewEmbed], components: [reviewActionRow] });
                    }

                    setTimeout(() => appChannel.delete().catch(() => {}), 15000);
                } else {
                    await appChannel.send("⚠️ Timed out. Closing.");
                    setTimeout(() => appChannel.delete().catch(() => {}), 10000);
                }
            });

        } catch (err) {
            await interaction.editReply({ content: `❌ Error: \`${err.message}\`` });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('accept_app_')) {
        const applicantId = interaction.customId.replace('accept_app_', '');

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: '❌ Need Manage Channels permission.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const applicant = await client.users.fetch(applicantId).catch(() => null);
            const sanitizedName = applicant ? applicant.username.toLowerCase().replace(/[^a-z0-9]/g, '') : applicantId;
            const interviewChannelName = `interview-${sanitizedName}`;

            if (guild.channels.cache.find(c => c.name === interviewChannelName)) {
                return interaction.editReply({ content: `Interview room already exists: #${interviewChannelName}` });
            }

            let targetCategory = null;
            if (CONFIG.APP_CATEGORY_ID) targetCategory = guild.channels.cache.get(CONFIG.APP_CATEGORY_ID);

            const interviewChannel = await guild.channels.create({
                name: interviewChannelName,
                type: ChannelType.GuildText,
                parent: targetCategory && targetCategory.type === ChannelType.GuildCategory ? targetCategory.id : null,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: applicantId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });

            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0x00FF00)
                .setFooter({ text: `Accepted by ${interaction.user.tag}` });

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('done').setLabel(`Interview: #${interviewChannelName}`).setStyle(ButtonStyle.Secondary).setDisabled(true)
            );

            await interaction.message.edit({ embeds: [originalEmbed], components: [disabledRow] });

            await interviewChannel.send({ 
                content: `<@${applicantId}> <@&${CONFIG.STAFF_ROLE_ID}>`,
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🤝 Candidate Interview')
                        .setDescription(`Welcome <@${applicantId}>! Approved for review by <@${interaction.user.id}>.\nPlease discuss weekly schedules, payouts, or access keys here.`)
                        .setColor(0x00FF00)
                ]
            });

            await interaction.editReply({ content: `✅ Interview channel opened: ${interviewChannel}` });
        } catch (e) {
            await interaction.editReply({ content: `❌ Error: \`${e.message}\`` });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('reject_app_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: '❌ Need Manage Channels permission.', ephemeral: true });
        }

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0xFF0000)
            .setFooter({ text: `Rejected by ${interaction.user.tag}` });

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('done').setLabel(`Rejected by ${interaction.user.username}`).setStyle(ButtonStyle.Danger).setDisabled(true)
        );

        await interaction.update({ embeds: [originalEmbed], components: [disabledRow] });
    }
});

client.login(CONFIG.TOKEN);
