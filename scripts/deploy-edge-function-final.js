const fs = require('fs');

const source = fs.readFileSync('supabase/functions/extract-node-metadata/index.ts', 'utf8');

const PAT = 'sbp_81e6dcc23175cd4dc8172ac0286037ea302f0ceb';
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

async function deploy() {
  console.log('=== DEPLOYING EDGE FUNCTION ===\n');

  // Try PATCH first (update), fall back to POST (create)
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/extract-node-metadata`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: source,
        verify_jwt: false,
      }),
    }
  );

  if (response.status === 404) {
    // Function doesn't exist yet — create it
    console.log('Function does not exist, creating...');
    const createResponse = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: 'extract-node-metadata',
          name: 'extract-node-metadata',
          body: source,
          verify_jwt: false,
        }),
      }
    );
    console.log('CREATE status:', createResponse.status);
    console.log('CREATE body:', await createResponse.text());
  } else {
    console.log('PATCH status:', response.status);
    console.log('PATCH body:', await response.text());
  }

  console.log('\n=== VERIFYING DEPLOYMENT ===\n');

  // Verify deployment
  const verify = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/extract-node-metadata`,
    { headers: { 'Authorization': `Bearer ${PAT}` } }
  );
  console.log('VERIFY status:', verify.status);
  console.log('VERIFY body:', await verify.text());

  console.log('\n=== SMOKE TEST ===\n');

  // Smoke test
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const anonKeyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)/);
  const anonKey = anonKeyMatch ? anonKeyMatch[1].trim() : '';

  const invokeResponse = await fetch(
    'https://lzkzfqshnjvlzosnntfx.supabase.co/functions/v1/extract-node-metadata',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        text_content: null,
        user_language_code: 'en'
      }),
    }
  );
  console.log('INVOKE status:', invokeResponse.status);
  console.log('INVOKE body:', await invokeResponse.text());
}

deploy().catch(console.error);
