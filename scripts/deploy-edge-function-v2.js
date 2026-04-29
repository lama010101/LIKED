const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';

// Try using the anon key first, then service role
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6a3pmcXNobmp2bHpvc25udGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTE4NDAsImV4cCI6MjA5MTg4Nzg0MH0.elHY5_-m8_ELDa-1WGDn-ZDc4MWHq21AnLYSHuQkYiM';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6a3pmcXNobmp2bHpvc25udGZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMxMTg0MCwiZXhwIjoyMDkxODg3ODQwfQ.JQU4Xp7QIx4w7Ehld7ii4hch57IGozTdE0QWLmMNiIs';

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

const deployData = {
  name: FUNCTION_NAME,
  slug: FUNCTION_NAME,
  body: functionSource,
  verify_jwt: false
};

const postData = JSON.stringify(deployData);

function tryDeploy(token, tokenName) {
  const options = {
    hostname: 'api.supabase.com',
    port: 443,
    path: `/v1/projects/${PROJECT_REF}/functions`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  console.log(`Trying with ${tokenName}...`);

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log('Response body:', body);
      if (res.statusCode === 409) {
        console.log('Function already exists, trying to update...');
        updateFunction(token);
      }
    });
  });

  req.on('error', (e) => { console.error('Error:', e); });
  req.write(postData);
  req.end();
}

function updateFunction(token) {
  const updateOptions = {
    hostname: 'api.supabase.com',
    port: 443,
    path: `/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
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

// Try with anon key first
tryDeploy(ANON_KEY, 'ANON_KEY');
