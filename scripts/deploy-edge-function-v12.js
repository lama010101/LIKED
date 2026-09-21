require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

// Try to query the database to see if there's a functions table we can use
console.log('Querying database for functions-related tables...');

const query = `
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  ORDER BY table_name
`;

const options = {
  hostname: `${PROJECT_REF}.supabase.co`,
  port: 443,
  path: '/rest/v1/',
  method: 'POST',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
};

const postData = JSON.stringify({ query });

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
