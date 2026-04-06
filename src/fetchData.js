const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const configCards = require('./config.json');
const { scrapeSnkrdunkPrice, fetchSnkrdunkHistory } = require('./scrapers/snkrdunk');
const { scrapePPTPrice } = require('./scrapers/pokemonpricetracker');
const { scrapeCardRushPrice } = require('./scrapers/cardrush');
const axios = require('axios');

const DATA_FILE = path.join(__dirname, '../data/prices.json');

// Price spike alert threshold (15% increase triggers alert)
const ALERT_THRESHOLD = 0.15;

function initializeDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
}

async function getTcgDexMetadata(tcgdexId) {
  try {
    const res = await axios.get(`https://api.tcgdex.net/v2/ja/cards/${tcgdexId}`);
    if (res.status === 200 && res.data) {
      return {
        name_en: res.data.name || tcgdexId,
        name_ja: res.data.name,
        number: `${res.data.localId}/${res.data.set?.cardCount?.official || '??'}`,
        imageUrl: res.data.image ? `${res.data.image}/high.webp` : null,
      };
    }
  } catch (err) {
    // TCGdex doesn't have all cards — silently skip
  }
  return null;
}

function checkPriceAlert(cardName, newPrice, history) {
  if (!newPrice || history.length < 2) return;
  // Get the last recorded price (not today's)
  const prevEntry = [...history].reverse().find(e =>
    (e.snkrdunk_jpy || e.cardrush_jpy) &&
    e.date !== format(new Date(), 'yyyy-MM-dd')
  );
  if (!prevEntry) return;
  const prevPrice = prevEntry.snkrdunk_jpy || prevEntry.cardrush_jpy;
  if (!prevPrice) return;
  const change = (newPrice - prevPrice) / prevPrice;
  if (change >= ALERT_THRESHOLD) {
    console.log(`\n🚨 PRICE ALERT: ${cardName}`);
    console.log(`   ¥${prevPrice.toLocaleString()} → ¥${newPrice.toLocaleString()} (+${(change * 100).toFixed(1)}%)`);
    // TODO: replace with Discord/LINE webhook call
    // await postAlert(cardName, prevPrice, newPrice, change);
  }
}

async function main() {
  console.log('Starting Pokémon Card Tracker Fetch Pipeline...');
  initializeDataFile();

  const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
  let pricesDb = {};
  try {
    pricesDb = JSON.parse(rawData);
  } catch (e) {
    console.error('prices.json syntax error, resetting.');
  }

  const today = format(new Date(), 'yyyy-MM-dd');

  // Prune removed cards
  const activeKeys = configCards.map(card => `${card.tcgdex_id}_${card.condition}`);
  for (const key of Object.keys(pricesDb)) {
    if (!activeKeys.includes(key)) {
      console.log(`Pruning removed card: ${key}`);
      delete pricesDb[key];
    }
  }

  for (const card of configCards) {
    const objectKey = `${card.tcgdex_id}_${card.condition}`;
    console.log(`\n--- Tracking ${objectKey} ---`);

    // Initialize record if new
    if (!pricesDb[objectKey]) {
      pricesDb[objectKey] = {
        metadata: {
          condition: card.condition,
          name_en: card.name_en || objectKey,
          name_ja: card.name_ja || '',
          imageUrl: card.imageUrl || null,
        },
        history: [],
      };
    }

    // Fetch TCGdex metadata (name, image) — only overrides if TCGdex has it
    const meta = await getTcgDexMetadata(card.tcgdex_id);
    pricesDb[objectKey].metadata = {
      ...pricesDb[objectKey].metadata,
      ...(meta || {}),
      // Config image override wins over TCGdex (for cards not in TCGdex)
      imageUrl: card.imageUrl || (meta && meta.imageUrl) || pricesDb[objectKey].metadata.imageUrl,
      name_en: card.name_en || (meta && meta.name_en) || pricesDb[objectKey].metadata.name_en,
      name_ja: card.name_ja || (meta && meta.name_ja) || pricesDb[objectKey].metadata.name_ja,
      condition: card.condition,
    };

    // Backfill historical data on first run (no history yet)
    if (pricesDb[objectKey].history.length === 0 && card.snkrdunk_product_id) {
      console.log(` -> First run: backfilling historical chart data...`);
      const historicalPoints = await fetchSnkrdunkHistory(card.snkrdunk_product_id);
      pricesDb[objectKey].history = historicalPoints;
      console.log(` -> Loaded ${historicalPoints.length} historical data points`);
      await new Promise(r => setTimeout(r, 1000));
    }

    let snkrResult = { price: null, sales24h: 0, sales7d: 0 };
    let cardrushPrice = null;
    let pptPrice = null;

    if (card.snkrdunk_product_id) {
      console.log(` -> Fetching SNKRDUNK (product ID: ${card.snkrdunk_product_id})...`);
      snkrResult = await scrapeSnkrdunkPrice(card.snkrdunk_product_id);
    }

    if (card.cardrush_url) {
      console.log(` -> Scraping Card Rush...`);
      cardrushPrice = await scrapeCardRushPrice(card.cardrush_url);
    }

    if (card.ppt_url) {
      console.log(` -> Scraping PokémonPriceTracker...`);
      pptPrice = await scrapePPTPrice(card.ppt_url);
    }

    // Check for price spike before updating
    const latestPrice = snkrResult.price || cardrushPrice;
    checkPriceAlert(card.name_en || objectKey, latestPrice, pricesDb[objectKey].history);

    const history = pricesDb[objectKey].history;
    const existingIdx = history.findIndex(e => e.date === today);
    const newEntry = {
      date: today,
      snkrdunk_jpy: snkrResult.price || null,
      snkrdunk_sales_24h: snkrResult.sales24h,
      snkrdunk_sales_7d: snkrResult.sales7d,
      cardrush_jpy: cardrushPrice || null,
      ppt_usd: pptPrice || null,
    };

    if (existingIdx > -1) {
      history[existingIdx] = { ...history[existingIdx], ...newEntry };
    } else {
      history.push(newEntry);
    }

    console.log(
      ` -> SNKR: ¥${snkrResult.price?.toLocaleString() ?? '-'} | 24h: ${snkrResult.sales24h} | 7d: ${snkrResult.sales7d} | RUSH: ¥${cardrushPrice ?? '-'}`
    );

    await new Promise(r => setTimeout(r, 2000));
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(pricesDb, null, 2));
  console.log('\nData successfully saved to prices.json.');
}

main();
