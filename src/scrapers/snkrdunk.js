const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeSnkrdunkPrice(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });

    const $ = cheerio.load(data);
    
    // Attempt to extract the lowest listing price or last sold price.
    // SNKRDUNK markup tends to have a price block heavily stylized.
    // Using a broad selector or looking for yen symbols.
    
    // This is a generic/approximate selector based on common marketplace layouts.
    // Real-world: needs adjustment based on live DOM.
    let priceText = $('.product-price').first().text() || 
                    $('.price-box .price').first().text() || 
                    $('.lowest-price .value').first().text();
                    
    // Fallback: If no specific class matches, look for strings ending in 円 
    if (!priceText.trim()) {
      const allText = $('body').text();
      const match = allText.match(/¥([\d,]+)/);
      if (match) {
        priceText = match[1];
      }
    }

    if (!priceText) {
      console.log(`[SNKRDUNK] Could not parse price on ${url}`);
      return null;
    }

    // Clean up to get just integer
    const numericPrice = parseInt(priceText.replace(/[^\d]/g, ''), 10);
    return isNaN(numericPrice) ? null : numericPrice;

  } catch (err) {
    console.error(`[SNKRDUNK SCRAPE ERROR] for ${url}:`, err.message);
    return null; // Return null on failure so we don't pollute data
  }
}

module.exports = { scrapeSnkrdunkPrice };
