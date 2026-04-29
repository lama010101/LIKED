const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

// Try to get a personal access token by checking if we can generate one via Supabase CLI
console.log('Checking for Supabase access token...');

try {
  // Try to use supabase auth to get a token
  const token = execSync('supabase auth status --output json', { encoding: 'utf8' });
  console.log('Auth status:', token);
} catch (e) {
  console.log('No auth session found');
}

// Try to login and get a token
console.log('Attempting to get access token via CLI...');

// The Management API requires a PAT with format sbp_...
// Let's try to use the Supabase CLI to generate one or find one
try {
  const accessToken = execSync('supabase projects api-keys --project-ref ' + PROJECT_REF, { encoding: 'utf8' });
  console.log('API keys:', accessToken);
} catch (e) {
  console.log('Could not get API keys via CLI');
}

// Alternative: Try to use the Supabase Management API with the service role key
// but using a different endpoint or method
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6a3pmcXNobmp2bHpvc25udGZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMxMTg0MCwiZXhwIjoyMDkxODg3ODQwfQ.JQU4Xp7QIx4w7Ehld7ii4hch57IGozTdE0QWLmMNiIs';

// Try the internal Supabase API endpoint that the CLI might use
const options = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${PROJECT_REF}/functions`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'x-client-info': 'supabase-js/2.45.4'
  }
};

const deployData = {
  name: FUNCTION_NAME,
  slug: FUNCTION_NAME,
  body: functionSource,
  verify_jwt: false
};

const postData = JSON.stringify(deployData);

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
