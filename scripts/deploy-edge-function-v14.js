const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const ACCESS_TOKEN = 'eyJhbGciOiJFUzI1NiIsImtpZCI6IjgyMGU3NjNmLTI3ZWQtNGNjMC1hYzAwLTYwYjM3OTYxOTlmZSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2x6a3pmcXNobmp2bHpvc25udGZ4LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIwMjJlZTA0OS1mYTVhLTQ0NzItODU2ZS01MjZmNmU2YWVmM2EiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc3NDQxNzc3LCJpYXQiOjE3Nzc0MzgxNzcsImVtYWlsIjoiZGVwbG95QGxpa2VkLmxvY2FsIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImRlcGxveUBsaWtlZC5sb2NhbCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjAyMmVlMDQ5LWZhNWEtNDQ3Mi04NTZlLTUyNmY2ZTZhZWYzYSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzc3NDM4MTc3fV0sInNlc3Npb25faWQiOiIxZjBlMjE3Mi0yODlmLTQzYzAtOTdhMy1lYWVmZDU5YjdkNjciLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.KimI881jQLJ6y7JgAS8Ar5zs6uQpWcMi6cuqcxeCNr8Xq5ocU3KwLJLifs6Z8MRdY3OMuJzxw2dCOWlO6ra3ZPw';

// Try to use the Supabase GraphQL API
console.log('Trying Supabase GraphQL API...');

const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

const graphqlQuery = `
  mutation {
    createFunction(
      input: {
        name: "${FUNCTION_NAME}",
        slug: "${FUNCTION_NAME}",
        body: ${JSON.stringify(functionSource).replace(/"/g, '\\"')},
        verifyJwt: false
      }
    ) {
      id
      name
      slug
    }
  }
`;

const options = {
  hostname: `${PROJECT_REF}.supabase.co`,
  port: 443,
  path: '/graphql/v1',
  method: 'POST',
  headers: {
    'apikey': ACCESS_TOKEN,
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

const postData = JSON.stringify({ query: graphqlQuery });

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
