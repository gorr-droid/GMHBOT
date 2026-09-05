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
    // STAFF APPLICATION CONFIGURATION
    STAFF_ROLE_ID: process.env.STAFF_ROLE_ID || '1533093844822790225',
    APP_CATEGORY_ID: process.env.APP_CATEGORY_ID || '1535740055623180388',
    APP_LOG_CHANNEL_ID: process.env.APP_LOG_CHANNEL_ID || '1545741112868610068',
    // SUPPORT TICKET CATEGORY
    TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || '1535740055623180388'
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

// Message Commands
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

    // Spawn Staff Application Panel
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

    // Spawn GMH Ticket Hub
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
            new ButtonBuilder()
                .setCustomId('ticket_general')
                .setLabel('Tech Support')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🛠️'),
            new ButtonBuilder()
                .setCustomId('ticket_purchase')
                .setLabel('Buy / Payment')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛒'),
            new ButtonBuilder()
                .setCustomId('ticket_resell')
                .setLabel('Reseller Access')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🤝'),
            new ButtonBuilder()
                .setCustomId('ticket_hwid')
                .setLabel('HWID Reset')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔄')
        );

        await message.channel.send({ embeds: [ticketEmbed], components: [buttonRow] });
        await message.delete().catch(() => {});
    }
});

// Interactions (Buttons, Modals, Support Tickets)
client.on('interactionCreate', async (interaction) => {
    // -------------------------------------------------------------
    // 1. TICKET BUTTONS -> POPUP MODALS
    // -------------------------------------------------------------
    if (interaction.isButton()) {
        if (interaction.customId === 'ticket_general') {
            const modal = new ModalBuilder()
                .setCustomId('modal_ticket_general')
                .setTitle('🛠️ GMH Technical Assistance');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('general_tool')
                        .setLabel('Which software/game is having issues?')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. Thunex BO7, Arc Raiders External...')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('general_sys')
                        .setLabel('Windows Build & Antivirus Status')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. Win 11 23H2 / Defender Disabled')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('general_reason')
                        .setLabel('Explain the issue or error code')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Describe exactly what happens when you run it...')
                        .setRequired(true)
                )
            );
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'ticket_purchase') {
            const modal = new ModalBuilder()
                .setCustomId('modal_ticket_purchase')
                .setTitle('🛒 GMH Purchase & Invoicing');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('purchase_item')
                        .setLabel('Product & Duration')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. Raiko Apex (30 Days), Temp Spoofer (Day)')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('purchase_method')
                        .setLabel('Payment Method')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('PayPal F&F, Crypto, Rewarble...')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('purchase_orderid')
                        .setLabel('Order/Transaction ID (If already paid)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Leave blank if opening a new order')
                        .setRequired(false)
                )
            );
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'ticket_resell') {
            const modal = new ModalBuilder()
                .setCustomId('modal_ticket_resell')
                .setTitle('🤝 GMH Reseller Application');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('resell_products')
                        .setLabel('Which tools are you looking to stock?')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('List software titles...')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('resell_platform')
                        .setLabel('Storefront or Server Link')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://discord.gg/... or https://yourstore.com')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('resell_volume')
                        .setLabel('Estimated Weekly Sales Volume')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. 15-20 keys weekly')
                        .setRequired(false)
                )
            );
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'ticket_hwid') {
            const modal = new ModalBuilder()
                .setCustomId('modal_ticket_hwid')
                .setTitle('🔄 GMH HWID Reset Request');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('hwid_product')
                        .setLabel('Tool Name')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. Ancient COD External')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('hwid_key')
                        .setLabel('Active License Key')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Paste your full license key')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('hwid_reason')
                        .setLabel('Reason for Hardware Change')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('e.g. Upgraded SSD/Motherboard, reinstalled OS...')
                        .setRequired(true)
                )
            );
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'close_ticket') {
            await interaction.reply('🔒 Closing this ticket in 5 seconds...');
            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 5000);
            return;
        }
    }

    // -------------------------------------------------------------
    // 2. MODAL SUBMISSIONS -> SPAWN PRIVATE TICKET ROOM
    // -------------------------------------------------------------
    if (interaction.isModalSubmit()) {
        const guild = interaction.guild;
        const user = interaction.user;

        let ticketType = 'Ticket';
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

        await interaction.deferReply({ ephemeral: true });

        try {
            const sanitizedName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'user';
            const channelName = `${channelPrefix}-${sanitizedName}`;

            let targetCategory = null;
            if (CONFIG.TICKET_CATEGORY_ID) {
                targetCategory = guild.channels.cache.get(CONFIG.TICKET_CATEGORY_ID) || await guild.channels.fetch(CONFIG.TICKET_CATEGORY_ID).catch(() => null);
            }

            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: targetCategory && targetCategory.type === ChannelType.GuildCategory ? targetCategory.id : null,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
                    ...(CONFIG.STAFF_ROLE_ID && guild.roles.cache.has(CONFIG.STAFF_ROLE_ID) ? [{ id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
                ]
            });

            const ticketEmbed = new EmbedBuilder()
                .setAuthor({ name: `${user.tag} | ${ticketType}`, iconURL: user.displayAvatarURL() })
                .setTitle(`🎫 ${ticketType}`)
                .setDescription(`Staff has been notified. Attach screenshots or loader crash logs below while you wait.`)
                .setColor(embedColor)
                .addFields(fields)
                .setFooter({ text: 'GameMarket Hub • Ticket Automation' })
                .setTimestamp();

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

            await ticketChannel.send({
                content: `${user} <@&${CONFIG.STAFF_ROLE_ID}>`,
                embeds: [ticketEmbed],
                components: [closeRow]
            });

            await interaction.editReply({
                content: `✅ Your ticket has been generated: ${ticketChannel}`
            });

        } catch (err) {
            console.error('Error creating ticket channel:', err);
            await interaction.editReply({ content: `❌ Could not open ticket: \`${err.message}\`` });
        }
        return;
    }

    // -------------------------------------------------------------
    // 3. STAFF APPLICANT WORKFLOW
    // -------------------------------------------------------------
    if (interaction.isButton() && interaction.customId === 'start_staff_application') {
        const guild = interaction.guild;
        const user = interaction.user;
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
        const guild = interaction.guild;

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
