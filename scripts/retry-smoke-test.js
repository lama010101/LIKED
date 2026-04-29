const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const anonKeyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);
const anonKey = anonKeyMatch ? anonKeyMatch[1].trim() : '';

async function retryInvoke() {
  console.log('=== RETRYING SMOKE TEST ===\n');

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

retryInvoke().catch(console.error);
