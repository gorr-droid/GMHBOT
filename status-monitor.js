const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');

const SUPABASE_URL = 'https://cvwfowmvtvsnjjinjmfx.supabase.co/rest/v1/products';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2d2Zvd212dHZzbmpqaW5qbWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1MDAsImV4cCI6MjA1ODA3ODkwMH0.xwKw6MDS5yCmPyE1gsr7-1jL6f1pKVScX875CtFqJFY';

let previousProductState = {};
let isFirstRun = true;
let cachedProducts = [];

async function fetchProductsFromDatabase() {
  try {
    const queryParams = new URLSearchParams({
      select: 'id,name,slug,category_id,tool_status(id,product_id,status,message,updated_at)',
      status: 'eq.active',
      order: 'sort_order.asc'
    });

    const fullUrl = `${SUPABASE_URL}?${queryParams.toString()}`;

    const res = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[SUPABASE API ERROR] HTTP ${res.status}: ${errBody}`);
      return cachedProducts;
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[SUPABASE API] Response is not an array or empty:', data);
      return cachedProducts;
    }

    const parsed = data.map(item => {
      let status = 'ONLINE';
      if (item.tool_status && item.tool_status.status) {
        status = item.tool_status.status.toUpperCase();
      }

      if (status === 'USE_AT_OWN_RISK') status = 'RISKY';

      return {
        name: item.name ? item.name.trim() : 'Unknown Tool',
        status: status,
        message: item.tool_status?.message || ''
      };
    });

    cachedProducts = parsed;
    console.log(`[STATUS MONITOR] Fetched ${parsed.length} tools successfully.`);
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
      console.log(`[STATUS MONITOR] Baseline established for ${products.length} tools.`);
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

    cron.schedule('* * * * *', () => {
      runStatusCheck(client);
    });
  },
  getAllStatuses: async () => {
    const res = await fetchProductsFromDatabase();
    return res && res.length > 0 ? res : cachedProducts;
  }
};
