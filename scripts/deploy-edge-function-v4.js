require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

const deployData = {
  name: FUNCTION_NAME,
  slug: FUNCTION_NAME,
  body: functionSource,
  verify_jwt: false
};

const postData = JSON.stringify(deployData);

// Try with the project's REST API endpoint instead of Management API
const options = {
  hostname: `${PROJECT_REF}.supabase.co`,
  port: 443,
  path: `/functions/v1/${FUNCTION_NAME}`,
  method: 'POST',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Trying with project REST API...');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('Response body:', body);
  });
});

req.on('error', (e) => { console.error('Error:', e); });
req.write(postData);
req.end();
