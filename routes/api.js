'use strict';
const https = require('https');
const crypto = require('crypto');

// Penyimpanan likes berbasis Set agar setiap IP hanya dihitung 1 kali per saham
const stockLikes = {};

// Fungsi untuk menganonimkan IP dengan SHA-256 (Syarat Privasi GDPR)
function anonymizeIP(ip) {
  return crypto.createHash('sha256').update(ip || '127.0.0.1').digest('hex');
}

// Fungsi untuk mengambil data saham dari proxy resmi freeCodeCamp
function fetchStockPrice(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${encodeURIComponent(symbol)}/quote`;
    https.get(url, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(rawData));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

module.exports = function (app) {

  app.route('/api/stock-prices')
    .get(async function (req, res) {
      const { stock, like } = req.query;
      const isLiked = (like === 'true' || like === true);
      const hashedIP = anonymizeIP(req.ip);

      if (!stock) {
        return res.json({ error: 'stock parameter is required' });
      }

      const symbols = Array.isArray(stock) ? stock : [stock];

      try {
        const results = await Promise.all(symbols.map(async (sym) => {
          const upperSym = String(sym).toUpperCase();
          const data = await fetchStockPrice(upperSym);

          if (!stockLikes[upperSym]) {
            stockLikes[upperSym] = new Set();
          }

          if (isLiked) {
            stockLikes[upperSym].add(hashedIP);
          }

          // Jika simbol tidak valid pada API proxy
          if (!data || !data.symbol || typeof data.latestPrice !== 'number') {
            return {
              stock: upperSym,
              price: 0,
              likes: stockLikes[upperSym].size
            };
          }

          return {
            stock: data.symbol,
            price: Number(data.latestPrice),
            likes: stockLikes[upperSym].size
          };
        }));

        // Jika hanya 1 saham yang diminta
        if (results.length === 1) {
          return res.json({ stockData: results[0] });
        }

        // Jika 2 saham yang diminta, hitung selisih likes (rel_likes)
        const firstStock = {
          stock: results[0].stock,
          price: results[0].price,
          rel_likes: results[0].likes - results[1].likes
        };

        const secondStock = {
          stock: results[1].stock,
          price: results[1].price,
          rel_likes: results[1].likes - results[0].likes
        };

        return res.json({ stockData: [firstStock, secondStock] });
      } catch (err) {
        return res.status(500).json({ error: 'Unable to fetch stock data' });
      }
    });

};