const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6a3pmcXNobmp2bHpvc25udGZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMxMTg0MCwiZXhwIjoyMDkxODg3ODQwfQ.JQU4Xp7QIx4w7Ehld7ii4hch57IGozTdE0QWLmMNiIs';

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

// Try to use the Supabase Management API with a different approach
// Maybe the API accepts the service role key in a different way
console.log('Trying Management API with service role key in apikey header...');

const deployData = {
  name: FUNCTION_NAME,
  slug: FUNCTION_NAME,
  body: functionSource,
  verify_jwt: false
};

const postData = JSON.stringify(deployData);

// Try with both Authorization and apikey headers
const options = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${PROJECT_REF}/functions`,
  method: 'POST',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

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
  const options = {
    hostname: 'api.supabase.com',
    port: 443,
    path: `/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}`,
    method: 'PATCH',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    console.log(`\nUpdate Status: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log('Update Response body:', body);
    });
  });

  req.on('error', (e) => { console.error('Update Error:', e); });
  req.write(postData);
  req.end();
}
