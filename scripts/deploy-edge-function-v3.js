require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const API_KEY = process.env.API_KEY;

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

const deployData = {
  name: FUNCTION_NAME,
  slug: FUNCTION_NAME,
  body: functionSource,
  verify_jwt: false
};

const postData = JSON.stringify(deployData);

// Try with apikey header instead of Authorization
const options = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${PROJECT_REF}/functions`,
  method: 'POST',
  headers: {
    'apikey': API_KEY,
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Trying with apikey header...');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('Response body:', body);
    if (res.statusCode === 409) {
      console.log('Function already exists, trying to update...');
      updateFunction();
    }
  });
});

req.on('error', (e) => { console.error('Error:', e); });
req.write(postData);
req.end();

function updateFunction() {
  const updateOptions = {
    hostname: 'api.supabase.com',
    port: 443,
    path: `/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}`,
    method: 'PATCH',
    headers: {
      'apikey': API_KEY,
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const updateReq = https.request(updateOptions, (res) => {
    console.log(`\nUpdate Status: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => { console.log('Update Response body:', body); });
  });

  updateReq.on('error', (e) => { console.error('Update Error:', e); });
  updateReq.write(postData);
  updateReq.end();
}
