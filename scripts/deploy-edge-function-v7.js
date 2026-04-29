const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const SERVICE_ROLE_KEY = '***REMOVED***';

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

// Try to deploy via the database directly using the service role key
// Check if there's a functions table we can insert into
const query = `
  SELECT * FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name LIKE '%function%'
`;

const options = {
  hostname: `${PROJECT_REF}.supabase.co`,
  port: 443,
  path: `/rest/v1/rpc/get_functions`,
  method: 'POST',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  }
};

console.log('Trying to query for functions table...');

const postData = JSON.stringify({});

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
