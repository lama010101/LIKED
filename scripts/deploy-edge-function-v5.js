const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6a3pmcXNobmp2bHpvc25udGZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMxMTg0MCwiZXhwIjoyMDkxODg3ODQwfQ.JQU4Xp7QIx4w7Ehld7ii4hch57IGozTdE0QWLmMNiIs';

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

// Try using Deno deploy API format
const deployData = {
  name: FUNCTION_NAME,
  entrypoint: 'index.ts',
  files: [
    {
      name: 'index.ts',
      content: functionSource
    }
  ],
  envVars: {}
};

const postData = JSON.stringify(deployData);

// Try Deno's deploy API
const options = {
  hostname: 'api.deno.com',
  port: 443,
  path: `/v1/deployments`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Trying with Deno deploy API...');

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
