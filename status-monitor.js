const { chromium } = require('playwright');
const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');

const TARGET_URL = 'https://gmh-shop.com/status';
let previousProductState = {};
let cachedProducts = [];

async function scrapeProducts() {
  let browser = null;
  try {
    browser = await chromium.launch({ 
      headless: true, 
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ] 
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // Navigate to gmh-shop.com/status
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);

    // Expand any collapsible groups/categories if present
    const expandButtons = await page.$$('button, [class*="category"], [class*="accordion"], [class*="dropdown"]');
    for (const btn of expandButtons) {
      await btn.click().catch(() => {});
    }

    await page.waitForTimeout(1000);

    // Parse product names and statuses
    const products = await page.evaluate(() => {
      const results = [];
      const elements = document.querySelectorAll('tr, li, [class*="card"], [class*="row"], [class*="item"]');
      
      elements.forEach(el => {
        const text = el.innerText || '';
        if (text.match(/(ONLINE|RISKY|TESTING|UPDATING|OFFLINE|OPERATIONAL|MAINTENANCE)/i)) {
          const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
          if (lines.length >= 2) {
            const name = lines[0];
            const statusMatch = lines.find(l => l.match(/^(ONLINE|RISKY|TESTING|UPDATING|OFFLINE|OPERATIONAL|MAINTENANCE)$/i));
            if (name && statusMatch && name.toLowerCase() !== statusMatch.toLowerCase()) {
              results.push({ name, status: statusMatch.toUpperCase() });
            }
          }
        }
      });
      return results;
    });

    // Deduplicate list
    const uniqueProducts = Array.from(new Set(products.map(p => p.name)))
      .map(name => products.find(p => p.name === name));

    if (uniqueProducts.length > 0) {
      cachedProducts = uniqueProducts;
    }

    return uniqueProducts;
  } catch (err) {
    console.error('[STATUS MONITOR SCRAPE ERROR]:', err.message);
    return cachedProducts;
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeAndCheckStatus(client) {
  const channelId = process.env.DISCORD_ALERTS_CHANNEL_ID;
  if (!channelId) return;

  const uniqueProducts = await scrapeProducts();
  if (!uniqueProducts || uniqueProducts.length === 0) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  for (const item of uniqueProducts) {
    const lastStatus = previousProductState[item.name];

    if (lastStatus && lastStatus !== item.status) {
      let color = 0x2ecc71; // Green
      if (['UPDATING', 'OFFLINE', 'MAINTENANCE'].includes(item.status)) color = 0xe74c3c; // Red
      if (['RISKY', 'TESTING'].includes(item.status)) color = 0xf1c40f; // Yellow

      const alertEmbed = new EmbedBuilder()
        .setTitle(`🚨 GMH Tool Status Update: ${item.name}`)
        .addFields(
          { name: 'Previous Status', value: `\`${lastStatus}\``, inline: true },
          { name: 'New Status', value: `\`${item.status}\``, inline: true }
        )
        .setColor(color)
        .setTimestamp();

      await channel.send({ embeds: [alertEmbed] }).catch(() => {});
    }

    previousProductState[item.name] = item.status;
  }

  console.log(`[GMH STATUS MONITOR] Scraped and checked ${uniqueProducts.length} items from gmh-shop.com.`);
}

module.exports = {
  startMonitoring: (client) => {
    scrapeAndCheckStatus(client);

    // Periodic check every 3 minutes
    cron.schedule('*/3 * * * *', () => {
      scrapeAndCheckStatus(client);
    });
  },
  getAllStatuses: async () => {
    if (cachedProducts.length > 0) {
      return cachedProducts;
    }
    return await scrapeProducts();
  }
};
