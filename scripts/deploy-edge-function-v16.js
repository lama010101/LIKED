const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6a3pmcXNobmp2bHpvc25udGZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMxMTg0MCwiZXhwIjoyMDkxODg3ODQwfQ.JQU4Xp7QIx4w7Ehld7ii4hch57IGozTdE0QWLmMNiIs';

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

// Try to upload the function to Supabase Storage and then trigger deployment
console.log('Trying to upload function to Storage...');

// First, check if there's a storage bucket for functions
const options = {
  hostname: `${PROJECT_REF}.supabase.co`,
  port: 443,
  path: '/storage/v1/bucket',
  method: 'GET',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('Buckets:', body);
    try {
      const buckets = JSON.parse(body);
      console.log('Available buckets:', buckets.map(b => b.name).join(', '));
    } catch (e) {
      console.log('Could not parse buckets');
    }
  });
});

req.on('error', (e) => { console.error('Error:', e); });
req.end();
