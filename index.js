const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } = require('discord.js');

// Bot Configuration
const CONFIG = {
    TOKEN: process.env.BOT_TOKEN,
    CUSTOMER_ROLE_ID: process.env.CUSTOMER_ROLE_ID || 'YOUR_CUSTOMER_ROLE_ID',    
    WELCOME_CHANNEL_ID: process.env.WELCOME_CHANNEL_ID || 'YOUR_WELCOME_CHANNEL_ID',
    // AUTO-NUKE CONFIGURATION
    NUKE_CHANNEL_ID: '1533093897277014157',
    NUKE_INTERVAL_HOURS: 24,
    NUKE_LOGO_URL: 'Gemini_Generated_Image_6e1fjf6e1fjf6e1f-removebg-preview.png',
    NUKE_BANNER_URL: 'Gemini_Generated_Image_6e1fjf6e1fjf6e1f-removebg-preview.png'
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

    // Set up Auto-Nuke Timer
    if (CONFIG.NUKE_CHANNEL_ID) {
        const intervalMs = CONFIG.NUKE_INTERVAL_HOURS * 60 * 60 * 1000;
        setInterval(() => {
            nukeChannel(CONFIG.NUKE_CHANNEL_ID);
        }, intervalMs);
        console.log(`[AUTO-NUKE] Timer configured to run every ${CONFIG.NUKE_INTERVAL_HOURS} hours.`);
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
            reason: 'Automated channel nuke'
        });

        await newChannel.setPosition(position);
        await channel.delete('Automated channel nuke');

        const embed = new EmbedBuilder()
            .setColor('#00E5FF')
            .setAuthor({ 
                name: newChannel.guild.name, 
                iconURL: CONFIG.NUKE_LOGO_URL.startsWith('http') ? CONFIG.NUKE_LOGO_URL : newChannel.guild.iconURL() 
            })
            .setTitle('🧹 Chat Nuked')
            .setDescription(
                'This channel has been automatically cleared to keep things organized and clean.\n\n' +
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
});

// Login
client.login(CONFIG.TOKEN);
