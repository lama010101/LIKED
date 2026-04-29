const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';

// Use the access token from the auth response
const ACCESS_TOKEN = '***REMOVED***';

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

// Try different Supabase API endpoints
const endpoints = [
  { host: 'api.supabase.com', path: `/v1/projects/${PROJECT_REF}/functions` },
  { host: 'api.supabase.com', path: `/v1/management/projects/${PROJECT_REF}/functions` },
  { host: `${PROJECT_REF}.supabase.co`, path: `/functions/v1/${FUNCTION_NAME}` },
  { host: 'supabase.com', path: `/api/v1/projects/${PROJECT_REF}/functions` },
];

const deployData = {
  name: FUNCTION_NAME,
  slug: FUNCTION_NAME,
  body: functionSource,
  verify_jwt: false
};

const postData = JSON.stringify(deployData);

let endpointIndex = 0;

function tryNextEndpoint() {
  if (endpointIndex >= endpoints.length) {
    console.log('All endpoints failed');
    return;
  }

  const endpoint = endpoints[endpointIndex];
  console.log(`\nTrying endpoint ${endpointIndex + 1}: https://${endpoint.host}${endpoint.path}`);

  const options = {
    hostname: endpoint.host,
    port: 443,
    path: endpoint.path,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
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
      if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 404) {
        endpointIndex++;
        tryNextEndpoint();
      } else {
        console.log('Success or different error, stopping');
      }
    });
  });

  req.on('error', (e) => {
    console.error('Error:', e.message);
    endpointIndex++;
    tryNextEndpoint();
  });

  req.write(postData);
  req.end();
}

tryNextEndpoint();
