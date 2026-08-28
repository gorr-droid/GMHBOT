const { chromium } = require('playwright');
const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');

const TARGET_URL = 'https://status.gandyhub.lol/';
let previousProductState = {};

async function scrapeAndCheckStatus(client) {
  const channelId = process.env.DISCORD_ALERTS_CHANNEL_ID;
  if (!channelId) return console.error('Missing DISCORD_ALERTS_CHANNEL_ID environment variable.');

  let browser = null;
  try {
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to status page
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Expand all category dropdowns to read hidden products
    const expandButtons = await page.$$('button, [class*="category"], [class*="dropdown"]');
    for (const btn of expandButtons) {
      await btn.click().catch(() => {});
    }

    await page.waitForTimeout(1000);

    // Parse product names and status values from DOM
    const products = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('div, tr, li');
      
      rows.forEach(row => {
        const text = row.innerText || '';
        if (text.match(/(ONLINE|RISKY|TESTING|UPDATING|OFFLINE)/i)) {
          const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
          if (lines.length >= 2) {
            const name = lines[0];
            const status = lines.find(l => l.match(/^(ONLINE|RISKY|TESTING|UPDATING|OFFLINE)$/i));
            if (name && status && name !== status) {
              results.push({ name, status: status.toUpperCase() });
            }
          }
        }
      });
      return results;
    });

    // Remove duplicates
    const uniqueProducts = Array.from(new Set(products.map(p => p.name)))
      .map(name => products.find(p => p.name === name));

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    for (const item of uniqueProducts) {
      const lastStatus = previousProductState[item.name];

      // Send Discord Embed alert on state change
      if (lastStatus && lastStatus !== item.status) {
        let color = 0x2ecc71; // Green (ONLINE)
        if (['UPDATING', 'OFFLINE'].includes(item.status)) color = 0xe74c3c; // Red
        if (['RISKY', 'TESTING'].includes(item.status)) color = 0xf1c40f; // Yellow

        const alertEmbed = new EmbedBuilder()
          .setTitle(`🚨 Product Status Update: ${item.name}`)
          .addFields(
            { name: 'Previous Status', value: `\`${lastStatus}\``, inline: true },
            { name: 'New Status', value: `\`${item.status}\``, inline: true }
          )
          .setColor(color)
          .setTimestamp();

        await channel.send({ embeds: [alertEmbed] });
      }

      previousProductState[item.name] = item.status;
    }

    console.log(`[STATUS MONITOR] Successfully checked ${uniqueProducts.length} items.`);
  } catch (err) {
    console.error('[PLAYWRIGHT ERROR]:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  startMonitoring: (client) => {
    // Initial check on boot
    scrapeAndCheckStatus(client);

    // Schedule check every 3 minutes
    cron.schedule('*/3 * * * *', () => {
      scrapeAndCheckStatus(client);
    });
  }
};
