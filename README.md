# ポケtracker (PokéTracker)

A fully automated, zero-cost, and premium web dashboard for tracking the Japanese Pokémon Card market. 

PokéTracker tracks prices for both **Graded (PSA 10)** cards and **Raw (Ungraded)** singles by seamlessly aggregating data from the Japanese market and providing crystal-clear visualization through a modern macOS-inspired interface.

## ✨ Features
- **Dual-Market Tracking**: Scrapes PSA 10 market values from **SNKRDUNK** and Raw single market values from **Card Rush**.
- **Global Benchmarking**: Integrates with PokemonPriceTracker to compare USD trends.
- **Dynamic Metadata**: Powered by the **TCGdex API**, automatically fetching official high-res Japanese PNG/WebP scans, proper translations, and native set numbers directly into your dashboard.
- **Native Localization**: Effortlessly toggle the entire UI between English and Japanese with a single click.
- **Zero-Cost Automation**: Runs entirely through GitHub Actions (Serverless) and GitHub Pages (Static Hosting) with no database costs. 

---

## 🚀 How It Works
1. A GitHub Actions workflow (`.github/workflows/update-prices.yml`) wakes up every 3 hours.
2. It reads `src/config.json` to find your tracked cards.
3. It hits the **TCGdex API** to get the pristine visual metadata for those cards.
4. It scrapes the current market prices from your targeted URLs.
5. It merges all of this data safely into `data/prices.json`, then automatically commits and pushes the updated file to the repository.
6. The GitHub Pages dashboard instantly reflects the latest prices on live charts without any database queries.

---

## 🛠️ Adding New Cards
Adding new grail cards to your tracker is incredibly easy. You do not need to hunt for images or type translations. 

Simply open `src/config.json` and add a new block. 
You only need 4 things:
1. `tcgdex_id`: The ID of the card on TCGdex (e.g., `sv4a-347`).
2. `condition`: Either `"PSA10"` or `"Raw"`.
3. The Target Scraper URL: `snkrdunk_url` (for PSA10) or `cardrush_url` (for Raw).
4. `ppt_url`: The PokemonPriceTracker URL for historical indexing.

### PSA 10 Example:
```json
{
  "tcgdex_id": "sv4a-347",
  "condition": "PSA10",
  "snkrdunk_url": "https://snkrdunk.com/trading-cards/...",
  "ppt_url": "https://www.pokemonpricetracker.com/search?q=..."
}
```

### Raw (Ungraded) Example:
```json
{
  "tcgdex_id": "sv4a-347",
  "condition": "Raw",
  "cardrush_url": "https://www.cardrush-pokemon.jp/product-list?keyword=...",
  "ppt_url": "https://www.pokemonpricetracker.com/search?q=..."
}
```
*Note: The backend engine will do the rest automatically!*

---

