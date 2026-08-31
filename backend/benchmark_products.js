const http = require('http');
const express = require('express');
const { productService } = require('./services/product-service');
const productsApiRoute = require('./routes/api/products');

async function measureLatency() {
  const app = express();
  app.use(express.json());
  app.use('/api/products', productsApiRoute);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  async function request(path) {
    const start = performance.now();
    await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', resolve);
      }).on('error', reject);
    });
    return performance.now() - start;
  }

  // Warmup
  await request('/api/products');
  await request('/api/products/search/suggestions?q=غسالة');

  const iterations = 30;
  const metrics = {
    productList: [],
    productDetail: [],
    search: [],
    suggestions: []
  };

  for (let i = 0; i < iterations; i++) {
    metrics.productList.push(await request('/api/products?page=1&limit=20'));
    metrics.productDetail.push(await request('/api/products/1'));
    metrics.search.push(await request('/api/products?search=غسالة&limit=10'));
    metrics.suggestions.push(await request('/api/products/search/suggestions?q=غسالة'));
  }

  server.close();

  const avg = arr => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
  const result = {
    productListAvgMs: parseFloat(avg(metrics.productList)),
    productDetailAvgMs: parseFloat(avg(metrics.productDetail)),
    searchAvgMs: parseFloat(avg(metrics.search)),
    suggestionsAvgMs: parseFloat(avg(metrics.suggestions))
  };

  console.log(JSON.stringify(result, null, 2));
}

measureLatency().catch(err => {
  console.error(err);
  process.exit(1);
});
