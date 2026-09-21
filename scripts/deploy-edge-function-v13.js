require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;

// Try to query the database using GET method to list tables
console.log('Querying database for all tables using GET...');

const options = {
  hostname: `${PROJECT_REF}.supabase.co`,
  port: 443,
  path: '/rest/v1/',
  method: 'GET',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Accept': 'application/json'
  }
};

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('Response body:', body);
  });
});

req.on('error', (e) => { console.error('Error:', e); });
req.end();
