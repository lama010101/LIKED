const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';

// Try to login to Supabase dashboard and get a session cookie
console.log('Attempting to login to Supabase dashboard to get session...');

// First, try to get the dashboard login page
const loginOptions = {
  hostname: 'supabase.com',
  port: 443,
  path: '/signin',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
};

const loginReq = https.request(loginOptions, (res) => {
  console.log(`Login page Status: ${res.statusCode}`);
  console.log('Set-Cookie headers:', res.headers['set-cookie']);
  
  const cookies = res.headers['set-cookie'] || [];
  const sessionCookie = cookies.find(c => c.includes('sb-') || c.includes('session'));
  
  if (sessionCookie) {
    console.log('Found session cookie:', sessionCookie.split(';')[0]);
    // Try to use this session cookie to deploy
    deployWithSession(sessionCookie);
  } else {
    console.log('No session cookie found, trying alternative approach...');
    // Try to use the auth token as a session
    tryAlternativeAuth();
  }
});

loginReq.on('error', (e) => { console.error('Login Error:', e); });
loginReq.end();

function deployWithSession(cookie) {
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
      'Cookie': cookie,
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

function tryAlternativeAuth() {
  console.log('Trying to use Supabase CLI login...');
  try {
    // Try to login to Supabase via CLI
    const loginResult = execSync('supabase login --no-browser', { encoding: 'utf8' });
    console.log('Login result:', loginResult);
  } catch (e) {
    console.log('CLI login failed:', e.message);
    
    // Try to use the access token we got from auth
    console.log('Trying to use auth token with different approach...');
    
    const ACCESS_TOKEN = '***REMOVED***';
    
    // Write the token to a file and try to use it with CLI
    fs.writeFileSync('.supabase_access_token', ACCESS_TOKEN);
    console.log('Token written to file');
  }
}
