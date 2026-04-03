const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const configCards = require('./config.json');
const { scrapeSnkrdunkPrice } = require('./scrapers/snkrdunk');
const { scrapePPTPrice } = require('./scrapers/pokemonpricetracker');
const { scrapeCardRushPrice } = require('./scrapers/cardrush');
const axios = require('axios');

const DATA_FILE = path.join(__dirname, '../data/prices.json');

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
    console.error(`[TCGdex ERROR] for ${tcgdexId}:`, err.message);
  }
  return null;
}

async function main() {
  console.log("Starting Pokémon Card Tracker Fetch Pipeline...");
  initializeDataFile();
  
  const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
  let pricesDb = {};
  try {
    pricesDb = JSON.parse(rawData);
  } catch (e) {
    console.error("prices.json syntax error, resetting.");
  }

  const today = format(new Date(), 'yyyy-MM-dd');

  for (const card of configCards) {
    const objectKey = `${card.tcgdex_id}_${card.condition}`;
    console.log(`Tracking ${objectKey}...`);

    if (!pricesDb[objectKey]) {
      pricesDb[objectKey] = {
        metadata: { condition: card.condition },
        history: []
      };
    }

    console.log(` -> Fetching TCGdex Metadata...`);
    const meta = await getTcgDexMetadata(card.tcgdex_id);
    if (meta) {
      pricesDb[objectKey].metadata = { ...pricesDb[objectKey].metadata, ...meta };
    }

    let snkrPrice = null;
    let cardrushPrice = null;
    if (card.snkrdunk_url) {
      console.log(` -> Scraping SNKRDUNK...`);
      snkrPrice = await scrapeSnkrdunkPrice(card.snkrdunk_url);
    }
    if (card.cardrush_url) {
      console.log(` -> Scraping Card Rush...`);
      cardrushPrice = await scrapeCardRushPrice(card.cardrush_url);
    }

    let pptPrice = null;
    if (card.ppt_url) {
      console.log(` -> Scraping PokemonPriceTracker...`);
      pptPrice = await scrapePPTPrice(card.ppt_url);
    }

    const history = pricesDb[objectKey].history;
    const existingEntryIndex = history.findIndex(entry => entry.date === today);
    const newEntry = {
      date: today,
      snkrdunk_jpy: snkrPrice || null,
      cardrush_jpy: cardrushPrice || null,
      ppt_usd: pptPrice || null
    };

    if (existingEntryIndex > -1) {
      history[existingEntryIndex] = { ...history[existingEntryIndex], ...newEntry };
    } else {
      history.push(newEntry);
    }
    
    console.log(` -> Result: SNKR:¥${snkrPrice || '-'} | RUSH:¥${cardrushPrice || '-'} | $${pptPrice || '-'}`);
    await new Promise(r => setTimeout(r, 2000));
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(pricesDb, null, 2));
  console.log("Data successfully saved to prices.json.");
}

main();
