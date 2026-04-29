const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const anonKeyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);
const anonKey = anonKeyMatch ? anonKeyMatch[1].trim() : '';

async function testTextOnly() {
  console.log('=== TESTING TEXT-ONLY INVOCATION ===\n');

  const invokeResponse = await fetch(
    'https://lzkzfqshnjvlzosnntfx.supabase.co/functions/v1/extract-node-metadata',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: null,
        text_content: 'This is a test text for metadata extraction',
        user_language_code: 'en'
      }),
    }
  );
  console.log('INVOKE status:', invokeResponse.status);
  console.log('INVOKE body:', await invokeResponse.text());
}

testTextOnly().catch(console.error);
