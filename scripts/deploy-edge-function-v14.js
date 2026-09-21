require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

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
