import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Simple logging utility for client (reduced)
const log = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, data),
  error: (msg, error = {}) => console.error(`[ERROR] ${msg}`, error),
};

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [rules, setRules] = useState({
    products: [],
    minQty: 2,
    percentOff: 10
  });
  const [percentOff, setPercentOff] = useState('10');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState('');
  const [productIds, setProductIds] = useState('');

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    try {
      setIsLoading(true);
      const shop = window.shopOrigin || 'test-shop.myshopify.com';
      
      const response = await axios.get('http://localhost:3000/api/metafields/rules', {
        params: { shop }
      });
      
      if (response.data.rules) {
        setRules(response.data.rules);
        setPercentOff(response.data.rules.percentOff.toString());
        setProductIds(response.data.rules.products.join(','));
        log.info('Rules loaded', { count: response.data.rules.products.length });
      }
    } catch (error) {
      log.error('Failed to load rules', error);
      setShowError('Failed to load discount rules');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      const percentValue = parseFloat(percentOff);
      
      if (isNaN(percentValue) || percentValue < 1 || percentValue > 80) {
        setShowError('Discount percentage must be between 1 and 80');
        return;
      }
      
      const products = productIds.split(',').map(id => id.trim()).filter(Boolean);
      if (products.length === 0) {
        setShowError('Please enter at least one product ID');
        return;
      }
      
      setIsLoading(true);
      setShowError('');
      
      const shop = window.shopOrigin || 'test-shop.myshopify.com';
      const updatedRules = { products, minQty: 2, percentOff: percentValue };
      const response = await axios.post('http://localhost:3000/api/metafields/rules', updatedRules, {
        params: { shop }
      });
      
      if (response.data.success) {
        setRules(updatedRules);
        setShowSuccess(true);
        log.info('Rules saved');
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        setShowError('Failed to save discount rules');
      }
    } catch (error) {
      log.error('Save failed', error);
      setShowError(error.response?.data?.error || 'Failed to save discount rules');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#333', marginBottom: '30px' }}>🛒 Volume Discount Setup</h1>
      
      {showSuccess && (
        <div style={{ background: '#d4edda', color: '#155724', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
           Settings saved successfully!
        </div>
      )}
      
      {showError && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
           {showError}
        </div>
      )}
      
      <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <h2 style={{ marginBottom: '20px', color: '#333' }}>Configure "Buy 2, get X% off" discount</h2>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555' }}>
            Discount Percentage
          </label>
          <input
            type="number"
            value={percentOff}
            onChange={(e) => setPercentOff(e.target.value)}
            min="1"
            max="80"
            style={{ 
              width: '200px', 
              padding: '10px', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              fontSize: '16px'
            }}
          />
          <span style={{ marginLeft: '10px', color: '#666' }}>% (Between 1-80%)</span>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555' }}>
            Product IDs
          </label>
          <textarea
            value={productIds}
            onChange={(e) => setProductIds(e.target.value)}
            placeholder="gid://shopify/Product/123,gid://shopify/Product/456"
            rows="3"
            style={{ 
              width: '100%', 
              padding: '10px', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace'
            }}
          />
          <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>
            Enter comma-separated Shopify product IDs
          </small>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={loadRules}
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1
            }}
          >
            Reset
          </button>
          <button
            onClick={saveSettings}
            disabled={isLoading || !productIds.trim()}
            style={{
              padding: '12px 24px',
              background: productIds.trim() ? '#007bff' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (isLoading || !productIds.trim()) ? 'not-allowed' : 'pointer',
              opacity: (isLoading || !productIds.trim()) ? 0.6 : 1
            }}
          >
            {isLoading ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
      
      <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
        <h3 style={{ marginBottom: '15px', color: '#333' }}>Current Configuration</h3>
        <p><strong>Minimum Quantity:</strong> {rules.minQty} items</p>
        <p><strong>Discount:</strong> {rules.percentOff}% off</p>
        <p><strong>Products Configured:</strong> {rules.products.length}</p>
        
        <div style={{ marginTop: '20px', padding: '15px', background: '#e3f2fd', borderRadius: '4px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#1976d2' }}>How it works:</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#555' }}>
            <li>Customers need to add 2+ items of configured products</li>
            <li>Discount applies automatically at checkout</li>
            <li>Widget shows on product pages for selected items</li>
          </ul>
        </div>
      </div>

      <div style={{ marginTop: '30px', padding: '20px', background: '#fff3cd', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>🚀 Demo Instructions:</h4>
        <ol style={{ margin: 0, paddingLeft: '20px', color: '#856404' }}>
          <li>Add some product IDs above (e.g., gid://shopify/Product/123)</li>
          <li>Set your desired discount percentage</li>
          <li>Click "Save Configuration"</li>
          <li>The Rust function will apply discounts when customers buy 2+ items</li>
        </ol>
      </div>
    </div>
  );
}

export default App;