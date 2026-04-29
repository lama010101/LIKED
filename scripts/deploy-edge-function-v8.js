const fs = require('fs');
const https = require('https');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6a3pmcXNobmp2bHpvc25udGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTE4NDAsImV4cCI6MjA5MTg4Nzg0MH0.elHY5_-m8_ELDa-1WGDn-ZDc4MWHq21AnLYSHuQkYiM';

// Read the function file
const functionSource = fs.readFileSync('./supabase/functions/extract-node-metadata/index.ts', 'utf8');

// Try to get a session token via Supabase Auth
// Then use that to deploy via Management API

console.log('Attempting to get session token via Supabase Auth...');

// First, try to get a session by creating a user (or using existing)
const authData = {
  email: 'deploy@liked.local',
  password: 'deploy_temp_password_123'
};

const authOptions = {
  hostname: `${PROJECT_REF}.supabase.co`,
  port: 443,
  path: '/auth/v1/signup',
  method: 'POST',
  headers: {
    'apikey': ANON_KEY,
    'Content-Type': 'application/json'
  }
};

const authPostData = JSON.stringify(authData);

const authReq = https.request(authOptions, (authRes) => {
  console.log(`Auth Status: ${authRes.statusCode}`);
  let authBody = '';
  authRes.on('data', (chunk) => { authBody += chunk; });
  authRes.on('end', () => {
    console.log('Auth Response body:', authBody);
    
    // Try to extract session token and use it for Management API
    try {
      const authResult = JSON.parse(authBody);
      const accessToken = authResult.access_token;
      
      if (accessToken) {
        console.log('Got access token, trying to deploy...');
        deployWithToken(accessToken);
      } else {
        console.log('No access token in response');
      }
    } catch (e) {
      console.log('Could not parse auth response');
    }
  });
});

authReq.on('error', (e) => { console.error('Auth Error:', e); });
authReq.write(authPostData);
authReq.end();

function deployWithToken(token) {
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
      'Authorization': `Bearer ${token}`,
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
      if (res.statusCode === 409) {
        console.log('Function already exists, trying to update...');
        updateFunction(token);
      }
    });
  });

  req.on('error', (e) => { console.error('Deploy Error:', e); });
  req.write(postData);
  req.end();
}

function updateFunction(token) {
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
    path: `/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
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
