const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { shopifyApi, LATEST_API_VERSION, Session } = require('@shopify/shopify-api');
const { shopifyApp } = require('@shopify/shopify-app-express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Logging utility
const log = {
  info: (msg, data = {}) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, data),
  error: (msg, error = {}) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, error),
  warn: (msg, data = {}) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, data),
  debug: (msg, data = {}) => process.env.NODE_ENV !== 'production' && console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, data)
};

log.info('Starting server on port', PORT);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shopify-discount-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', (error) => log.error('MongoDB connection error:', error));
db.once('open', () => log.info('Connected to MongoDB successfully'));
db.on('disconnected', () => log.warn('MongoDB disconnected'));
db.on('reconnected', () => log.info('MongoDB reconnected'));


const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES?.split(',') || ['write_discounts', 'read_products', 'write_themes'],
  hostName: process.env.HOST?.replace(/https:\/\//, ''),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
});

app.use(cors());
app.use(express.json());

// Request logging middleware (only for important endpoints)
app.use((req, res, next) => {
  if (req.path.includes('/api/')) {
    log.info(`${req.method} ${req.path}`);
  }
  next();
});

// Initialize Shopify app
const { DeliveryMethod } = require('@shopify/shopify-api');

const shopifyAppInstance = shopifyApp({
  api: shopify,
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
  },
  sessionStorage: {
    storeSession: async (session) => {},
    loadSession: async (id) => { return undefined; },
    deleteSession: async (id) => { return true; },
    deleteSessions: async (ids) => { return true; },
    findSessionsByShop: async (shop) => { return []; }
  },
});

// app.use(shopifyAppInstance);

// Middleware to ensure authenticated session
const ensureAuthenticated = async (req, res, next) => {
  try {
    const shop = req.query.shop || req.headers['x-shopify-shop-domain'];
    
    if (!shop) {
      return res.status(400).json({ error: 'Shop parameter required' });
    }
    
    // For development/testing, create a mock session
    if (process.env.NODE_ENV === 'development') {
      res.locals.shopify = {
        session: { shop: shop },
        graphql: new shopify.clients.Graphql({
          session: { shop: shop, accessToken: 'mock-token' }
        })
      };
      return next();
    }
    
    // In production, use proper session handling
    const session = await shopifyAppInstance.api.session.getCurrentId({ req, res });
    if (!session) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    res.locals.shopify = {
      session: session,
      graphql: new shopify.clients.Graphql({ session })
    };
    
    next();
  } catch (error) {
    log.error('Authentication middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Apply auth middleware to API routes only
app.use('/api/metafields', ensureAuthenticated);
app.use('/api/products', ensureAuthenticated);

// Metafields routes
const GET_SHOP_RULES = `
  query fetchShopDiscountRules($namespace: String!, $key: String!) {
    shop {
      metafield(namespace: $namespace, key: $key) {
        value
      }
    }
  }
`;

const SAVE_SHOP_RULES = `
  mutation updateShopMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value }
      userErrors { field message }
    }
  }
`;

const SEARCH_PRODUCTS = `
  query findStoreProducts($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id title handle
          featuredImage { url altText }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
          totalInventory
        }
      }
    }
  }
`;

app.get('/api/metafields/rules', async (req, res) => {
  try {
    const client = res.locals.shopify.graphql;
    
    // Mock response for development
    if (process.env.NODE_ENV === 'development') {
      const mockRules = { products: [], minQty: 2, percentOff: 10 };
      return res.json({ rules: mockRules });
    }
    
    const response = await client.query({
      data: { 
        query: GET_SHOP_RULES, 
        variables: { namespace: 'volume_discount', key: 'rules' } 
      }
    });
    
    const metafieldValue = response.body?.data?.shop?.metafield?.value;
    const rules = metafieldValue ? JSON.parse(metafieldValue) : { products: [], minQty: 2, percentOff: 10 };
    
    res.json({ rules });
  } catch (error) {
    log.error('Failed to fetch discount rules:', error);
    res.status(500).json({ error: 'Failed to fetch discount rules' });
  }
});

app.post('/api/metafields/rules', async (req, res) => {
  try {
    const { products, percentOff, minQty = 2 } = req.body;
    
    if (!products || !Array.isArray(products) || !percentOff) {
      return res.status(400).json({ error: 'Products array and percentOff required' });
    }
    
    if (percentOff < 1 || percentOff > 80) {
      return res.status(400).json({ error: 'Percent off must be between 1 and 80' });
    }
    
    const rules = { products, minQty, percentOff };
    log.info('Saving discount rules:', { rules });
    
    // For development, just return success
    if (process.env.NODE_ENV === 'development') {
      return res.json({ success: true, rules });
    }
    
    const client = res.locals.shopify.graphql;
    const shopId = res.locals.shopify.session.shop.split('.')[0];
    
    const response = await client.query({
      data: {
        query: SAVE_SHOP_RULES,
        variables: {
          metafields: [{
            ownerId: `gid://shopify/Shop/${shopId}`,
            namespace: 'volume_discount', 
            key: 'rules',
            value: JSON.stringify(rules), 
            type: 'json'
          }]
        }
      }
    });
    
    if (response.body?.data?.metafieldsSet?.userErrors?.length > 0) {
      log.error('Metafield save errors:', response.body.data.metafieldsSet.userErrors);
      return res.status(400).json({ 
        error: 'Failed to save rules', 
        details: response.body.data.metafieldsSet.userErrors 
      });
    }
    
    log.info('Rules saved successfully');
    res.json({ success: true, rules });
  } catch (error) {
    log.error('Failed to save discount rules:', error);
    res.status(500).json({ error: 'Failed to save discount rules' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { limit = 20, query = '' } = req.query;
    const client = res.locals.shopify.graphql;
    
    const response = await client.query({
      data: { query: SEARCH_PRODUCTS, variables: { first: parseInt(limit), query: query || null } }
    });
    
    const products = response.body?.data?.products?.edges?.map(edge => edge.node) || [];
    res.json({ products });
  } catch (error) {
    log.error('Failed to fetch products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = res.locals.shopify.graphql;
    
    const response = await client.query({
      data: {
        query: `query($id: ID!) { product(id: $id) { id title handle featuredImage { url altText } } }`,
        variables: { id }
      }
    });
    
    const product = response.body?.data?.product;
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ product });
  } catch (error) {
    log.error('Failed to fetch product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server running' });
});

app.use('/theme-extension', express.static('../extensions/theme-extension'));

// Error handling middleware
app.use((error, req, res, next) => {
  log.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, () => {
  log.info(`Server running on port ${PORT}`);
  log.info('Volume Discount App server started successfully');
});

module.exports = app;