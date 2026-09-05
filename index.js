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

// Cache to store invite counts & track who invited whom
const guildInvites = new Map();
const memberInviters = new Map(); 

// Individual Questions (Separated & Scored Individually)
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
        title: "Windows Antivirus & Defender",
        question: "**Question 4/9:** A buyer downloads a file and says it instantly deletes itself or won't open. What exact steps or antivirus exclusions do you guide them through?"
    },
    {
        title: "PC Gaming Requirements",
        question: "**Question 5/9:** A tool fails to run due to missing PC prerequisites. Which common runtimes, DirectX components, or BIOS settings (e.g. Virtualization/TPM) do you check?"
    },
    {
        title: "Handling Hostile Chat",
        question: "**Question 6/9:** A user starts complaining in public chat calling the server a scam because their key or support is taking time. How do you handle this publicly, and how do you direct them into tickets?"
    },
    {
        title: "Payment & License Policy",
        question: "**Question 7/9:** Lower staff do NOT dispense keys or process refunds. If a user demands a replacement key or refund, what exact order information do you gather before escalating to senior staff?"
    },
    {
        title: "Staff Favoritism",
        question: "**Question 8/9:** If a friend of yours in the server breaks server rules or asks you for free access/leaks, how do you respond?"
    },
    {
        title: "Compensation Choice",
        question: "**Question 9/9:** Are you looking to be compensated through free tool access keys, weekly payouts, or a mixture of both?"
    }
];

// Bot Online Status, Cache Invites & Start Timers
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
            console.log(`Could not cache invites for guild ${guild.name}. Ensure bot has 'Manage Server' permission.`);
        }
    }

    // Set up Auto-Nuke Timer (24 Hours)
    if (CONFIG.NUKE_CHANNEL_ID) {
        const intervalMs = CONFIG.NUKE_INTERVAL_HOURS * 60 * 60 * 1000;
        setInterval(() => {
            nukeChannel(CONFIG.NUKE_CHANNEL_ID);
        }, intervalMs);
        console.log(`[AUTO-NUKE] Timer configured to run every ${CONFIG.NUKE_INTERVAL_HOURS} hours.`);
    }

    // Start Website Status Monitor
    try {
        startMonitoring(client);
        console.log('[STATUS MONITOR] Website tracker initialized.');
    } catch (err) {
        console.error('[STATUS MONITOR ERROR] Failed to start:', err.message);
    }

    // Start Working Hours Schedule (07:00 / 23:00 CEST)
    try {
        initWorkingHours(client);
    } catch (err) {
        console.error('[WORKING HOURS ERROR] Failed to initialize schedules:', err.message);
    }
});

// Cache new invites when created
client.on('inviteCreate', async (invite) => {
    const invites = guildInvites.get(invite.guild.id) || new Collection();
    invites.set(invite.code, invite.uses);
    guildInvites.set(invite.guild.id, invites);
});

// Helper function to calculate real active invites
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

// Helper function for Channel Nuking
async function nukeChannel(channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return console.log('[AUTO-NUKE] Target channel not found!');

        const position = channel.position;
        const newChannel = await channel.clone({
            reason: 'Automated/Manual channel nuke'
        });

        await newChannel.setPosition(position);
        await channel.delete('Automated/Manual channel nuke');

        const embed = new EmbedBuilder()
            .setColor('#00E5FF')
            .setAuthor({ 
                name: newChannel.guild.name, 
                iconURL: CONFIG.NUKE_LOGO_URL.startsWith('http') ? CONFIG.NUKE_LOGO_URL : newChannel.guild.iconURL() 
            })
            .setTitle('🧹 Chat Nuked')
            .setDescription(
                'This channel has been cleared to keep things organized and clean.\n\n' +
                'Please continue your discussions here, and remember to follow the **Rules**.'
            )
            .setFooter({ 
                text: `Auto-nuke runs every ${CONFIG.NUKE_INTERVAL_HOURS}h`
            })
            .setTimestamp();

        if (CONFIG.NUKE_LOGO_URL.startsWith('http')) {
            embed.setThumbnail(CONFIG.NUKE_LOGO_URL);
        }
        if (CONFIG.NUKE_BANNER_URL.startsWith('http')) {
            embed.setImage(CONFIG.NUKE_BANNER_URL);
        }

        await newChannel.send({ embeds: [embed] });
        console.log(`[AUTO-NUKE] Successfully nuked and recreated channel: ${newChannel.name}`);
    } catch (error) {
        console.error('[AUTO-NUKE] Error executing channel nuke:', error);
    }
}

// Helper function to build Welcome Payload
function buildWelcomePayload(member) {
    const welcomeEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setAuthor({
            name: member.guild.name,
            iconURL: member.guild.iconURL() || member.user.displayAvatarURL()
        })
        .setTitle(`🎉 Welcome to ${member.guild.name}!`)
        .setDescription(
            `Hey <@${member.id}>, thanks for joining and verifying!\n\n` +
            `As a welcome gift, here's a **10% discount** for your first purchase in our shop:\n\n` +
            `🎟️ **Your Coupon Code**\n` +
            `\`\`\`\nNEW10\n\`\`\`\n` +
            `💡 **How to use it**\n` +
            `1. Visit our shop\n` +
            `2. Add a product to your cart\n` +
            `3. Enter the code \`NEW10\` at checkout\n` +
            `4. Enjoy your **10%** off!\n\n` +
            `🔥 **INVITE PROMOTION:**\n` +
            `🎁 **10 Invites** ➔ **1-Week Key**\n` +
            `🎁 **30 Invites** ➔ **1-Month Key + 30% Discount Code**\n` +
            `👑 **100 Invites** ➔ **LIFETIME KEY** (for any qualifying product)\n\n` +
            `📊 **How to check your invites:**\n` +
            `Type \`!invites\` or \`/invites\` in any server channel to view your active invite count.\n\n` +
            `⚠️ **Note on Leaves:**\n` +
            `If someone you invited leaves the server, your invite count will automatically be **deducted** by 1.\n\n` +
            `❓ **Need help?**\n` +
            `Open a support ticket in our server and our staff will help you out!`
        )
        .setFooter({ text: `${member.guild.name} • Welcome aboard!` })
        .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Shop')
            .setStyle(ButtonStyle.Link)
            .setURL('https://gmh-shop.com')
            .setEmoji('🛒'),
        new ButtonBuilder()
            .setLabel('Support')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.com/channels/1040987039270707231/1533093930730520689/1533740651026452646')
            .setEmoji('🎟️')
    );

    return { embeds: [welcomeEmbed], components: [buttons] };
}

// Helper function to send welcome message
async function sendWelcomeToMember(member) {
    const payload = buildWelcomePayload(member);
    try {
        await member.send(payload);
        return { success: true, method: 'DM' };
    } catch (dmErr) {
        const channel = member.guild.channels.cache.get(CONFIG.WELCOME_CHANNEL_ID);
        if (channel) {
            await channel.send({ content: `Welcome <@${member.id}>!`, ...payload });
            return { success: true, method: 'Channel' };
        }
        return { success: false, method: 'None' };
    }
}

// 1. Automatic Welcome + Invite Tracking
client.on('guildMemberAdd', async (member) => {
    let inviter = null;

    try {
        const cachedInvites = guildInvites.get(member.guild.id);
        const newInvites = await member.guild.invites.fetch();

        if (cachedInvites) {
            const usedInvite = newInvites.find(inv => cachedInvites.has(inv.code) && cachedInvites.get(inv.code) < inv.uses);
            if (usedInvite) {
                inviter = usedInvite.inviter;
                memberInviters.set(member.id, inviter.id);
            }
        }

        const updatedMap = new Collection();
        newInvites.forEach(inv => updatedMap.set(inv.code, inv.uses));
        guildInvites.set(member.guild.id, updatedMap);

    } catch (err) {
        console.error('Error tracking invites:', err);
    }

    if (inviter) {
        try {
            const realCount = await getRealInvites(member.guild, inviter.id);

            if (realCount === 10) {
                const rewardEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🎉 10 Invites Reward Unlocked!')
                    .setDescription(
                        `Awesome job <@${inviter.id}>!\n\n` +
                        `You have successfully reached **10 active invites** in **${member.guild.name}**!\n\n` +
                        `🎁 **Choose Your Reward:**\n` +
                        `1️⃣ **1-Week Free Key** of your choice\n` +
                        `2️⃣ **30% Discount Coupon** for your next order\n\n` +
                        `🎟️ **How to Claim:**\n` +
                        `Open a support ticket in our server to claim your reward!`
                    )
                    .setFooter({ text: `${member.guild.name} Rewards Program` })
                    .setTimestamp();

                await inviter.send({ embeds: [rewardEmbed] }).catch(() => {
                    const channel = member.guild.channels.cache.get(CONFIG.WELCOME_CHANNEL_ID);
                    if (channel) {
                        channel.send({ content: `🎉 Congratulations <@${inviter.id}> on reaching **10 invites**! Check your DMs or open a ticket to claim your reward!`, embeds: [rewardEmbed] });
                    }
                });
            }
        } catch (rewardErr) {
            console.error('Error handling invite reward:', rewardErr);
        }
    }

    try {
        await sendWelcomeToMember(member);
    } catch (err) {
        console.error('Error sending welcome message:', err);
    }
});

// 2. Track Member Leaves
client.on('guildMemberRemove', async (member) => {
    console.log(`${member.user.tag} left the server. Invite tracking updated.`);
});

// 3. Server Commands Listener
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    if (command === '!ping') {
        return message.reply('🏓 Pong! Bot is online and working.');
    }

    // Shift Hours Manual Override Command
    if (command === '!shift') {
        if (!message.member.permissions.has('ManageMessages')) {
            return message.reply('❌ You need **Manage Messages** permission to change working hours.');
        }

        const action = args[1]?.toLowerCase();
        if (action === 'on') {
            await sendShiftUpdate(client, true);
            return message.reply('✅ Support hours manually updated to **ONLINE**.');
        } else if (action === 'off') {
            await sendShiftUpdate(client, false);
            return message.reply('✅ Support hours manually updated to **OFFLINE**.');
        } else {
            return message.reply('⚠️ **Usage:** `!shift on` or `!shift off`');
        }
    }

    // Live Product Overview Command (Chunked to support 50+ tools without hitting limits)
    if (command === '!status') {
        const loadingMsg = await message.reply('🔄 Scraping live product statuses from **gmh-shop.com**...');
        try {
            const products = await getAllStatuses();
            if (!products || products.length === 0) {
                return loadingMsg.edit('❌ Unable to retrieve statuses. Check Railway/Render logs.');
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
                    .setTitle(totalPages > 1 ? `🛡️ GMH-SHOP Live Status (Page ${pageNum}/${totalPages})` : '🛡️ GMH-SHOP Live Status')
                    .setURL('https://gmh-shop.com/status')
                    .setColor(0x00E5FF)
                    .setDescription(formattedList)
                    .setFooter({ text: `Total Tools: ${products.length} • Updates every 60s` })
                    .setTimestamp();

                embeds.push(embed);
            }

            await loadingMsg.edit({ content: null, embeds: embeds.slice(0, 10) });
        } catch (err) {
            console.error('Error executing !status command:', err);
            await loadingMsg.edit('❌ An error occurred while formatting statuses.');
        }
    }

    // Direct Manual Nuke Command
    if (command === '!nuke') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ You need Administrator permissions to use this command.');
        }

        const targetChannel = message.mentions.channels.first() || message.channel;
        return nukeChannel(targetChannel.id);
    }

    if (command === '!sendwelcome') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ You need Administrator permissions to use this command.');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('⚠️ Usage: `!sendwelcome @User`');
        }

        const targetMember = message.guild.members.cache.get(targetUser.id) || await message.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return message.reply('❌ User is not currently in this server.');
        }

        const result = await sendWelcomeToMember(targetMember);

        if (result.success) {
            return message.reply(`✅ Welcome message successfully sent to ${targetMember} (via ${result.method})!`);
        } else {
            return message.reply(`❌ Could not send welcome message to ${targetMember}. Check bot channel permissions.`);
        }
    }

    if (command === '!invites') {
        const targetUser = message.mentions.users.first() || message.author;
        try {
            const count = await getRealInvites(message.guild, targetUser.id);
            return message.reply(`📊 **${targetUser.username}** currently has **${count}** active invites.`);
        } catch (err) {
            return message.reply('❌ Could not fetch invites. Ensure the bot has **Manage Server** permissions.');
        }
    }

    if (command === '!pinguser') {
        const targetUser = message.mentions.users.first();
        
        if (!targetUser) {
            return message.reply('⚠️ **Usage:** `!pinguser @User [Optional Note]`');
        }

        const customNote = args.slice(2).join(' ');
        const noteText = customNote ? `\n**Message:** ${customNote}` : '';

        return message.channel.send(`🔔 Hey ${targetUser}! You were pinged by ${message.author}.${noteText}`);
    }

    if (command === '!deliver') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ You need Administrator permissions to use this command.');
        }

        const targetUser = message.mentions.users.first();
        const licenseKey = args[2];

        if (!targetUser || !licenseKey) {
            return message.reply('⚠️ **Usage:** `!deliver @User KEY-1234-ABCD`');
        }

        try {
            const keyEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎁 License Key Delivered')
                .setDescription(`Thank you for your purchase from **${message.guild.name}**!\n\n**Your Key:**\n\`\`\`\n${licenseKey}\n\`\`\``)
                .addFields(
                    { name: 'Status', value: 'Active / Valid', inline: true },
                    { name: 'Support', value: 'Open a ticket if you need help with setup.', inline: true }
                )
                .setFooter({ text: `${message.guild.name} Automated Delivery` })
                .setTimestamp();

            await targetUser.send({ embeds: [keyEmbed] });

            const member = message.guild.members.cache.get(targetUser.id);
            if (member && CONFIG.CUSTOMER_ROLE_ID && CONFIG.CUSTOMER_ROLE_ID !== 'YOUR_CUSTOMER_ROLE_ID') {
                await member.roles.add(CONFIG.CUSTOMER_ROLE_ID).catch(() => console.log('Could not assign role. Check role hierarchy permissions.'));
            }

            await message.reply(`✅ Key successfully delivered to ${targetUser}!`);

        } catch (error) {
            console.error('Delivery Error:', error);
            await message.reply(`❌ Could not send DM to ${targetUser}. Their direct messages may be turned off.`);
        }
    }

    // Command to spawn the Recruitment Application Panel
    if (command === '!spawn-apps') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ You need Administrator permissions to run this command.');
        }

        const recruitEmbed = new EmbedBuilder()
            .setTitle('🛡️ Community Update & Staff Recruitment')
            .setDescription(
                "Text channels remain locked until we hit **500 members**.\n\n" +
                "Until then, we are actively recruiting **Chat Moderators** and **Ticket Support Staff**.\n\n" +
                "**🎯 What We Look For:**\n" +
                "• Fast, effective problem resolution without stalling\n" +
                "• Basic PC troubleshooting & Windows Defender conflict management\n" +
                "• Professional composure during disputes and tickets\n\n" +
                "**💼 Compensation Options:**\n" +
                "• Free tool licenses & product access keys\n" +
                "• Weekly payouts *(rates and terms discussed privately upon review)*\n\n" +
                "Support is managed across our dedicated web portal and Discord tickets.\n\n" +
                "Click the button below to begin your private application."
            )
            .setColor(0x00E5FF)
            .setFooter({ text: `${message.guild.name} Recruitment` })
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

// 4. Staff Application Intake & Review Interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // A. Start Application Button
    if (interaction.customId === 'start_staff_application') {
        const guild = interaction.guild;
        const user = interaction.user;

        const sanitizedUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'applicant';
        const channelName = `app-${sanitizedUsername}`;

        const existingChannel = guild.channels.cache.find(c => c.name === channelName);
        if (existingChannel) {
            return interaction.reply({
                content: `You already have an active application open in ${existingChannel}.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            let targetCategory = null;
            if (CONFIG.APP_CATEGORY_ID && CONFIG.APP_CATEGORY_ID !== 'YOUR_APP_CATEGORY_ID') {
                targetCategory = guild.channels.cache.get(CONFIG.APP_CATEGORY_ID);
                if (!targetCategory) {
                    try {
                        targetCategory = await guild.channels.fetch(CONFIG.APP_CATEGORY_ID);
                    } catch (e) {
                        targetCategory = null;
                    }
                }
            }

            const validParentId = targetCategory && targetCategory.type === ChannelType.GuildCategory 
                ? targetCategory.id 
                : null;

            const overwrites = [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles
                    ]
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ];

            if (CONFIG.STAFF_ROLE_ID && guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                overwrites.push({
                    id: CONFIG.STAFF_ROLE_ID,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                });
            }

            const appChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: validParentId,
                permissionOverwrites: overwrites
            });

            await interaction.editReply({
                content: `Your private application channel has been created: ${appChannel}`
            });

            const answers = [];
            let questionIndex = 0;

            const promptEmbed = new EmbedBuilder()
                .setTitle(`Staff Application: ${user.tag}`)
                .setDescription("Please answer each question directly in this channel. Take your time to write clear answers.\n\n" + APP_QUESTIONS[questionIndex].question)
                .setColor(0x5865F2);

            await appChannel.send({ content: `${user}`, embeds: [promptEmbed] });

            const collector = appChannel.createMessageCollector({
                filter: (m) => m.author.id === user.id,
                time: 1800000
            });

            collector.on('collect', async (msg) => {
                answers.push({
                    title: APP_QUESTIONS[questionIndex].title,
                    question: APP_QUESTIONS[questionIndex].question,
                    answer: msg.content.trim() || 'No response provided.'
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
                    await appChannel.send("✅ **Application submitted successfully!** Staff will review your answers. This channel will close in 15 seconds.");

                    const reviewChannel = guild.channels.cache.get(CONFIG.APP_LOG_CHANNEL_ID) 
                        || await guild.channels.fetch(CONFIG.APP_LOG_CHANNEL_ID).catch(() => null);

                    if (reviewChannel) {
                        const reviewEmbed = new EmbedBuilder()
                            .setTitle(`New Staff Application: ${user.tag} (${user.id})`)
                            .setColor(0x00E5FF)
                            .setThumbnail(user.displayAvatarURL())
                            .setTimestamp();

                        answers.forEach((entry, idx) => {
                            reviewEmbed.addFields({
                                name: `Q${idx + 1}: ${entry.title}`,
                                value: `*${entry.question.replace(/\*\*Question \d\/\d:\*\*\s*/, '')}*\n**Answer:** ${entry.answer.length > 950 ? entry.answer.slice(0, 950) + '...' : entry.answer}`
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

                    setTimeout(async () => {
                        await appChannel.delete().catch(() => {});
                    }, 15000);
                } else {
                    await appChannel.send("⚠️ **Application timed out.** This channel will close.");
                    setTimeout(async () => {
                        await appChannel.delete().catch(() => {});
                    }, 10000);
                }
            });

        } catch (err) {
            console.error('DETAILED APPLICATION ERROR:', err);
            await interaction.editReply({
                content: `❌ Error creating channel: \`${err.message}\``
            });
        }
    }

    // B. Accept & Open Dedicated Interview Room
    if (interaction.customId.startsWith('accept_app_')) {
        const applicantId = interaction.customId.replace('accept_app_', '');
        const guild = interaction.guild;

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: '❌ You need Manage Channels permission to accept applications.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const applicant = await client.users.fetch(applicantId).catch(() => null);
            const sanitizedName = applicant ? applicant.username.toLowerCase().replace(/[^a-z0-9]/g, '') : applicantId;
            const interviewChannelName = `interview-${sanitizedName}`;

            const existingInterview = guild.channels.cache.find(c => c.name === interviewChannelName);
            if (existingInterview) {
                return interaction.editReply({ content: `An interview channel already exists for this applicant: ${existingInterview}` });
            }

            let targetCategory = null;
            if (CONFIG.APP_CATEGORY_ID && CONFIG.APP_CATEGORY_ID !== 'YOUR_APP_CATEGORY_ID') {
                targetCategory = guild.channels.cache.get(CONFIG.APP_CATEGORY_ID);
            }

            const interviewChannel = await guild.channels.create({
                name: interviewChannelName,
                type: ChannelType.GuildText,
                parent: targetCategory && targetCategory.type === ChannelType.GuildCategory ? targetCategory.id : null,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: applicantId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.AttachFiles
                        ]
                    },
                    {
                        id: CONFIG.STAFF_ROLE_ID,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    }
                ]
            });

            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0x00FF00)
                .setFooter({ text: `Accepted by ${interaction.user.tag} • Interview Room Created` });

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('accepted_done')
                    .setLabel(`Interview Opened in #${interviewChannelName}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

            await interaction.message.edit({ embeds: [originalEmbed], components: [disabledRow] });

            const interviewEmbed = new EmbedBuilder()
                .setTitle('🤝 Staff Candidate Interview')
                .setDescription(
                    `Welcome <@${applicantId}>!\n\n` +
                    `Your application was reviewed and approved for an interview by <@${interaction.user.id}>.\n\n` +
                    `Use this private channel to discuss:\n` +
                    `• Your weekly schedule & responsibilities\n` +
                    `• Specific compensation choice (free tool keys vs weekly payout)\n` +
                    `• Staff rules and onboarding instructions\n\n` +
                    `Please wait for staff to message you here.`
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interviewChannel.send({ content: `<@${applicantId}> <@&${CONFIG.STAFF_ROLE_ID}>`, embeds: [interviewEmbed] });

            await interaction.editReply({ content: `✅ Interview channel created: ${interviewChannel}` });

        } catch (err) {
            console.error('Error creating interview channel:', err);
            await interaction.editReply({ content: `❌ Failed to create interview channel: \`${err.message}\`` });
        }
    }

    // C. Reject Button
    if (interaction.customId.startsWith('reject_app_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: '❌ You need Manage Channels permission to reject applications.', ephemeral: true });
        }

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0xFF0000)
            .setFooter({ text: `Rejected by ${interaction.user.tag}` });

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rejected_done')
                .setLabel(`Rejected by ${interaction.user.username}`)
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
        );

        await interaction.update({ embeds: [originalEmbed], components: [disabledRow] });
    }
});

// Login
client.login(CONFIG.TOKEN);
