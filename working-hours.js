const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');

// Channel ID from Railway environment variables or default
const SUPPORT_HOURS_CHANNEL_ID = process.env.SUPPORT_HOURS_CHANNEL_ID || 'YOUR_SUPPORT_HOURS_CHANNEL_ID';

// Custom images/logos for banners
const BRAND_LOGO = 'https://media.discordapp.net/attachments/1040987039270707231/1335028352608440330/Gemini_Generated_Image_6e1fjf6e1fjf6e1f-removebg-preview.png';

let currentStatusMessageId = null;

/**
 * Sends or updates the support shift message
 * @param {import('discord.js').Client} client 
 * @param {boolean} isOnline 
 */
async function sendShiftUpdate(client, isOnline) {
    try {
        const channel = await client.channels.fetch(SUPPORT_HOURS_CHANNEL_ID).catch(() => null);
        if (!channel) {
            return console.error('[WORKING HOURS] Could not find the configured support hours channel!');
        }

        // Delete previous status message if one exists to keep channel clean
        if (currentStatusMessageId) {
            try {
                const oldMsg = await channel.messages.fetch(currentStatusMessageId).catch(() => null);
                if (oldMsg) await oldMsg.delete();
            } catch (err) {
                console.log('[WORKING HOURS] Could not delete old status message:', err.message);
            }
        }

        let embed;

        if (isOnline) {
            embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL() || BRAND_LOGO })
                .setTitle('🟢 SUPPORT IS NOW ONLINE')
                .setDescription(
                    'Welcome! Our support team is currently active and ready to assist you.\n\n' +
                    '⏰ **Working Hours:** `07:00 - 23:00 CEST`\n' +
                    '🎟️ **Need help?** Open a ticket in our support channel, and an agent will be with you shortly.'
                )
                .setFooter({ text: `${channel.guild.name} • Active Support Shift` })
                .setTimestamp();
        } else {
            embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL() || BRAND_LOGO })
                .setTitle('🔴 SUPPORT IS NOW OFFLINE')
                .setDescription(
                    'Our support shift for today has ended. Support agents are currently offline.\n\n' +
                    '⏰ **Working Hours:** `07:00 - 23:00 CEST`\n' +
                    '🎟️ You can still open a support ticket, but responses may be delayed until **07:00 CEST** tomorrow morning.'
                )
                .setFooter({ text: `${channel.guild.name} • Shift Closed` })
                .setTimestamp();
        }

        const sentMsg = await channel.send({ embeds: [embed] });
        currentStatusMessageId = sentMsg.id;
        console.log(`[WORKING HOURS] Successfully posted ${isOnline ? 'ONLINE' : 'OFFLINE'} banner.`);
    } catch (err) {
        console.error('[WORKING HOURS ERROR] Failed to send update:', err);
    }
}

/**
 * Initializes cron jobs for automatically toggling support hours
 * @param {import('discord.js').Client} client 
 */
function initWorkingHours(client) {
    // 07:00 CEST - Turn Online
    cron.schedule('0 7 * * *', () => {
        console.log('[WORKING HOURS] Executing scheduled shift start (07:00 CEST)');
        sendShiftUpdate(client, true);
    }, {
        timezone: 'Europe/Paris' // CEST / CET
    });

    // 23:00 CEST - Turn Offline
    cron.schedule('0 23 * * *', () => {
        console.log('[WORKING HOURS] Executing scheduled shift end (23:00 CEST)');
        sendShiftUpdate(client, false);
    }, {
        timezone: 'Europe/Paris' // CEST / CET
    });

    console.log('[WORKING HOURS] Automated schedule active (07:00 - 23:00 CEST).');
}

module.exports = {
    initWorkingHours,
    sendShiftUpdate
};
