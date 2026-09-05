const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');

const SUPABASE_URL = 'https://cvwfowmvtvsnjjinjmfx.supabase.co/rest/v1/products?select=id%2Cname%2Cslug%2Ccategory_id%2Ctool_status%28id%2Cproduct_id%2Cstatus%2Cmessage%2Cupdated_at%29&status=eq.active&order=sort_order.asc';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2d2Zvd212dHZzbmpqaW5qbWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1MDAsImV4cCI6MjA1ODA3ODkwMH0.xwKw6MDS5yCmPyE1gsr7-1jL6f1pKVScX875CtFqJFY';

let previousProductState = {};
let isFirstRun = true;
let cachedProducts = [];

async function fetchProductsFromDatabase() {
  try {
    const res = await fetch(SUPABASE_URL, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.error(`[STATUS MONITOR] Supabase returned status ${res.status}`);
      return cachedProducts;
    }

    const data = await res.json();
    if (!Array.isArray(data)) return cachedProducts;

    const parsed = data.map(item => {
      let status = item.tool_status?.status?.toUpperCase() || 'ONLINE';
      if (status === 'USE_AT_OWN_RISK') status = 'RISKY';

      return {
        name: item.name.trim(),
        status: status,
        message: item.tool_status?.message || ''
      };
    });

    if (parsed.length > 0) cachedProducts = parsed;
    return parsed;
  } catch (err) {
    console.error('[STATUS MONITOR FETCH ERROR]:', err.message);
    return cachedProducts;
  }
}

async function runStatusCheck(client) {
  try {
    const products = await fetchProductsFromDatabase();
    if (!products || products.length === 0) return;

    if (isFirstRun) {
      products.forEach(p => {
        previousProductState[p.name] = p.status;
      });
      isFirstRun = false;
      console.log(`[STATUS MONITOR] Baseline set for ${products.length} tools.`);
      return;
    }

    const channelId = process.env.DISCORD_ALERTS_CHANNEL_ID;
    if (!channelId) return;

    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    for (const item of products) {
      const lastStatus = previousProductState[item.name];

      if (lastStatus && lastStatus !== item.status) {
        let color = 0x2ecc71; // Green
        if (['UPDATING', 'OFFLINE', 'MAINTENANCE'].includes(item.status)) color = 0xe74c3c; // Red
        if (['RISKY', 'TESTING'].includes(item.status)) color = 0xf1c40f; // Yellow

        const alertEmbed = new EmbedBuilder()
          .setTitle(`🚨 Tool Status Update: ${item.name}`)
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
  } catch (err) {
    console.error('[STATUS MONITOR LOOP ERROR]:', err.message);
  }
}

module.exports = {
  startMonitoring: (client) => {
    runStatusCheck(client);

    // Checks Supabase every 60 seconds
    cron.schedule('* * * * *', () => {
      runStatusCheck(client);
    });
  },
  getAllStatuses: async () => {
    return await fetchProductsFromDatabase();
  }
};
