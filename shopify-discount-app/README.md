# Volume Discount App

Shopify app for "Buy 2, get X% off" automatic discounts with comprehensive logging.

## Features

- Auto discount when buying 2+ items
- Admin sets discount percentage (1-80%)
- Product page widgets
- Metafields storage
- Full logging across all components

## Step-by-Step Setup

### Prerequisites
1. **Shopify Partner Account**: [partners.shopify.com](https://partners.shopify.com)
2. **Development Store**: Created in Partner Dashboard
3. **System Requirements**:
   - Node.js 16+
   - Rust compiler with wasm32-wasi target
   - MongoDB running locally
   - ngrok for HTTPS tunneling

### Step 1: Environment Setup
```bash
# Clone repository
git clone <repo>
cd shopify-discount-app

# Install dependencies
npm install
cd server && npm install
cd ../client && npm install
cd ..

# Setup environment
cp .env.example .env
```

### Step 2: Configure Environment
Edit `.env` file:
```env
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SCOPES=write_discounts,read_products,write_themes
HOST=https://your-ngrok-url.ngrok.io
PORT=3000
MONGODB_URI=mongodb://localhost:27017/shopify-discount-app
NODE_ENV=development
```

### Step 3: Start Required Services
```bash
# Terminal 1: Start MongoDB
mongod

# Terminal 2: Start ngrok
ngrok http 3000

# Note the ngrok URL and update .env HOST value
```

### Step 4: Build Discount Function
```bash
cd extensions/discount-function
rustup target add wasm32-wasi
cargo wasi build --release
cd ../..
```

### Step 5: Start Application
```bash
# Start all services
npm run dev
```

This will start:
- Express server on localhost:3000
- React client with Webpack dev server
- All services with full logging enabled

### Step 6: Create Shopify App
1. Go to Partner Dashboard → Apps → Create App
2. Choose "Public App"
3. Set App URL: `https://your-ngrok-url.ngrok.io`
4. Set Redirect URLs:
   - `https://your-ngrok-url.ngrok.io/auth/callback`
   - `https://your-ngrok-url.ngrok.io/auth/shopify/callback`
5. Copy API credentials to `.env` file

### Step 7: Test Installation
1. Visit your ngrok URL
2. Install app in development store
3. Configure products and discount percentage
4. Test checkout with 2+ items

## Quick Health Check
```bash
curl http://localhost:3000/api/health
```

## Troubleshooting

### Common Issues

**MongoDB Connection Error**
```bash
# Check if MongoDB is running
ps aux | grep mongod
# Start if needed
mongod
```

**Function Build Fails**
```bash
# Install WASI target
rustup target add wasm32-wasi
# Clean and rebuild
cd extensions/discount-function
cargo clean
cargo wasi build --release
```

**App Installation Fails**
- Verify ngrok URL in .env matches Partner Dashboard
- Check redirect URLs are exactly correct
- Ensure server is running and accessible

**No Logs Appearing**
- Set `NODE_ENV=development` in .env
- Restart: `npm run dev`

## Production Build
```bash
cd client && npm run build
cd ../extensions/discount-function && cargo wasi build --release
shopify app deploy
```