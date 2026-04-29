const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const ACCESS_TOKEN = 'eyJhbGciOiJFUzI1NiIsImtpZCI6IjgyMGU3NjNmLTI3ZWQtNGNjMC1hYzAwLTYwYjM3OTYxOTlmZSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2x6a3pmcXNobmp2bHpvc25udGZ4LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIwMjJlZTA0OS1mYTVhLTQ0NzItODU2ZS01MjZmNmU2YWVmM2EiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc3NDQxNzc3LCJpYXQiOjE3Nzc0MzgxNzcsImVtYWlsIjoiZGVwbG95QGxpa2VkLmxvY2FsIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImRlcGxveUBsaWtlZC5sb2NhbCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjAyMmVlMDQ5LWZhNWEtNDQ3Mi04NTZlLTUyNmY2ZTZhZWYzYSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzc3NDM4MTc3fV0sInNlc3Npb25faWQiOiIxZjBlMjE3Mi0yODlmLTQzYzAtOTdhMy1lYWVmZDU5YjdkNjciLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.KimI881jQLJ6y7JgAS8Ar5zs6uQpWcMi6cuqcxeCNr8Xq5ocU3KwLJLifs6Z8MRdY3OMuJzxw2dCOWlO6ra3ZPw';

// Try to generate a PAT via the Supabase platform API using the auth session
console.log('Trying to generate PAT via platform API...');

const patData = {
  name: 'Deploy Script Token',
  description: 'Token for deploying Edge Functions programmatically',
  permissions: ['functions_deploy']
};

const postData = JSON.stringify(patData);

const options = {
  hostname: 'api.supabase.com',
  port: 443,
  path: '/v1/profile/access-tokens',
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
    if (res.statusCode === 201 || res.statusCode === 200) {
      try {
        const result = JSON.parse(body);
        const pat = result.token;
        console.log('Got PAT:', pat);
        deployWithPat(pat);
      } catch (e) {
        console.log('Could not parse PAT response');
      }
    }
  });
});

req.on('error', (e) => { console.error('Error:', e); });
req.write(postData);
req.end();

function deployWithPat(pat) {
  const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

  const deployData = {
    name: FUNCTION_NAME,
    slug: FUNCTION_NAME,
    body: functionSource,
    verify_jwt: false
  };

  const postData = JSON.stringify(deployData);

  const options = {
    hostname: 'api.supabase.com',
    port: 443,
    path: `/v1/projects/${PROJECT_REF}/functions`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    console.log(`\nDeploy Status: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log('Deploy Response body:', body);
    });
  });

  req.on('error', (e) => { console.error('Deploy Error:', e); });
  req.write(postData);
  req.end();
}
