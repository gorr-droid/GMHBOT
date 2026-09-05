const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Collection,
    PermissionsBitField,
    ChannelType 
} = require('discord.js');
const { startMonitoring, getAllStatuses } = require('./status-monitor');
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
    APP_LOG_CHANNEL_ID: process.env.APP_LOG_CHANNEL_ID || '1545741112868610068'
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

// Individual Questions
const APP_QUESTIONS = [
    {
        title: "Age & Hardware",
        question: "**Question 1/9:** How old are you, and do you own a Windows PC that you can use while providing support?"
    },
    {
        title: "Timezone & Active Hours",
        question: "**Question 2/9:** What is your timezone/country, and what specific hours of the day are you active?"
    },
    {
        title: "Past Experience",
        question: "**Question 3/9:** What past experience do you have moderating Discord servers or managing support tickets?"
    },
    {
        title: "Antivirus / Defender",
        question: "**Question 4/9:** A buyer downloads a file and says it instantly deletes itself or won't open. What exact steps or antivirus exclusions do you guide them through?"
    },
    {
        title: "PC Requirements",
        question: "**Question 5/9:** A tool fails to run due to missing PC prerequisites. Which common runtimes, DirectX components, or BIOS settings (e.g. Virtualization/TPM) do you check?"
    },
    {
        title: "Chat Triage",
        question: "**Question 6/9:** A user starts complaining in public chat calling the server a scam because their key or support is taking time. How do you handle this publicly, and how do you direct them into tickets?"
    },
    {
        title: "Escalation Policy",
        question: "**Question 7/9:** Lower staff do NOT dispense keys or process refunds. If a user demands a replacement key or refund, what exact order information do you gather before escalating to senior staff?"
    },
    {
        title: "Rules & Favoritism",
        question: "**Question 8/9:** If a friend of yours in the server breaks server rules or asks you for free access/leaks, how do you respond?"
    },
    {
        title: "Compensation",
        question: "**Question 9/9:** Are you looking to be compensated through free tool access keys, weekly payouts, or a mixture of both?"
    }
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
        startMonitoring(client);
    } catch (err) {
        console.error('[STATUS MONITOR ERROR]:', err.message);
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

    // Live Product Overview (Chunked + Auto-delete in 5 minutes)
    if (command === '!status') {
        const loadingMsg = await message.reply('🔄 Scraping live statuses from **gmh-shop.com**...');
        try {
            const products = await getAllStatuses();
            if (!products || products.length === 0) {
                const failMsg = await loadingMsg.edit('❌ Unable to retrieve statuses right now.');
                setTimeout(() => {
                    message.delete().catch(() => {});
                    failMsg.delete().catch(() => {});
                }, 300000);
                return;
            }

            const chunkSize = 20;
            const embeds = [];

            for (let i = 0; i < products.length; i += chunkSize) {
                const chunk = products.slice(i, i + chunkSize);
                const pageNum = Math.floor(i / chunkSize) + 1;
                const totalPages = Math.ceil(products.length / chunkSize);

                const formattedList = chunk.map(p => {
                    let emoji = '🟢';
                    if (['UPDATING', 'OFFLINE'].includes(p.status)) emoji = '🔴';
                    if (['RISKY', 'TESTING'].includes(p.status)) emoji = '🟡';
                    return `${emoji} **${p.name}** ➔ \`${p.status}\``;
                }).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(totalPages > 1 ? `🛡️ GMH-SHOP Live Status (${pageNum}/${totalPages})` : '🛡️ GMH-SHOP Live Status')
                    .setURL('https://gmh-shop.com/status')
                    .setColor(0x00E5FF)
                    .setDescription(formattedList)
                    .setFooter({ text: `Total Tools: ${products.length} • Auto-clears in 5m` })
                    .setTimestamp();

                embeds.push(embed);
            }

            const statusMsg = await loadingMsg.edit({ content: null, embeds: embeds.slice(0, 10) });

            // Auto-delete both the trigger message and status response after 5 minutes (300,000 ms)
            setTimeout(() => {
                message.delete().catch(() => {});
                statusMsg.delete().catch(() => {});
            }, 300000);

        } catch (err) {
            console.error('Error executing !status:', err);
            const errReply = await loadingMsg.edit('❌ Error formatting statuses.');
            setTimeout(() => {
                message.delete().catch(() => {});
                errReply.delete().catch(() => {});
            }, 300000);
        }
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
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'start_staff_application') {
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

    if (interaction.customId.startsWith('accept_app_')) {
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

    if (interaction.customId.startsWith('reject_app_')) {
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
