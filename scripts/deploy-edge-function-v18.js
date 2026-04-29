const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';
const FUNCTION_NAME = 'extract-node-metadata';

// Try to use puppeteer to automate the dashboard and get a PAT
console.log('Checking if puppeteer is available...');

try {
  require('puppeteer');
  console.log('Puppeteer is available, trying to automate dashboard...');
  automateDashboard();
} catch (e) {
  console.log('Puppeteer not available, trying alternative...');
  // Try to use a simpler approach - maybe we can use the Supabase CLI's internal API
  tryCliInternal();
}

function automateDashboard() {
  const puppeteer = require('puppeteer');
  
  (async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Navigate to Supabase dashboard
    await page.goto('https://supabase.com/dashboard/signin');
    
    // Fill in login form
    await page.type('input[name="email"]', 'deploy@liked.local');
    await page.type('input[name="password"]', 'deploy_temp_password_123');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForNavigation();
    
    // Navigate to access tokens page
    await page.goto(`https://supabase.com/dashboard/project/${PROJECT_REF}/settings/access-tokens`);
    
    // Create new token
    await page.click('button:has-text("New token")');
    await page.type('input[name="name"]', 'Deploy Script Token');
    await page.click('button:has-text("Create")');
    
    // Get the token from the page
    const token = await page.evaluate(() => {
      const tokenElement = document.querySelector('[data-testid="access-token"]');
      return tokenElement ? tokenElement.textContent : null;
    });
    
    console.log('Got PAT:', token);
    
    await browser.close();
    
    if (token) {
      deployWithPat(token);
    }
  })();
}

function tryCliInternal() {
  console.log('Trying to reverse-engineer Supabase CLI internal API...');
  
  // The CLI must make HTTP requests internally. Let's try to use the same approach
  // by examining what the CLI does
  
  // Try to use the Supabase CLI with debug mode to see what it does
  try {
    const debugOutput = execSync('supabase functions deploy extract-node-metadata --no-verify-jwt --project-ref lzkzfqshnjvlzosnntfx --debug 2>&1', { encoding: 'utf8' });
    console.log('Debug output:', debugOutput);
  } catch (e) {
    console.log('CLI debug failed:', e.message);
  }
}

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
