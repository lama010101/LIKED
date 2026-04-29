const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';

// Use the access token from the auth response
const ACCESS_TOKEN = 'eyJhbGciOiJFUzI1NiIsImtpZCI6IjgyMGU3NjNmLTI3ZWQtNGNjMC1hYzAwLTYwYjM3OTYxOTlmZSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2x6a3pmcXNobmp2bHpvc25udGZ4LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIwMjJlZTA0OS1mYTVhLTQ0NzItODU2ZS01MjZmNmU2YWVmM2EiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc3NDQxNzc3LCJpYXQiOjE3Nzc0MzgxNzcsImVtYWlsIjoiZGVwbG95QGxpa2VkLmxvY2FsIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImRlcGxveUBsaWtlZC5sb2NhbCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjAyMmVlMDQ5LWZhNWEtNDQ3Mi04NTZlLTUyNmY2ZTZhZWYzYSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzc3NDM4MTc3fV0sInNlc3Npb25faWQiOiIxZjBlMjE3Mi0yODlmLTQzYzAtOTdhMy1lYWVmZDU5YjdkNjciLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.KimI881jQLJ6y7JgAS8Ar5zs6uQpWcMi6cuqcxeCNr8Xq5ocU3KwLJLifs6Z8MRdY3OMuJzxw2dCOWlO6ra3ZPw';

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

// Try the Supabase Management API with the auth token and different headers
const deployData = {
  name: FUNCTION_NAME,
  slug: FUNCTION_NAME,
  body: functionSource,
  verify_jwt: false
};

const postData = JSON.stringify(deployData);

// Try with the management API but using the auth token
const options = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${PROJECT_REF}/functions`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'x-client-info': 'supabase-js/2.45.4',
    'x-supabase-auth': ACCESS_TOKEN
  }
};

console.log('Trying Management API with auth token and additional headers...');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
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
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'x-client-info': 'supabase-js/2.45.4'
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
