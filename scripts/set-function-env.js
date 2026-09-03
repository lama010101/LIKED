const fs = require('fs');

const PAT = 'sbp_81e6dcc23175cd4dc8172ac0286037ea302f0ceb';
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

const envContent = fs.readFileSync('.env.local', 'utf8');
const supabaseUrlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const supabaseUrl = supabaseUrlMatch ? supabaseUrlMatch[1].trim() : '';
const serviceRoleKeyMatch = envContent.match(/SUPABASE_SECRET_KEY=(.+)/);
const serviceRoleKey = serviceRoleKeyMatch ? serviceRoleKeyMatch[1].trim() : '';
const anonKeyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)/);
const anonKey = anonKeyMatch ? anonKeyMatch[1].trim() : '';

async function setEnv() {
  console.log('=== SETTING FUNCTION ENV VARIABLES ===\n');
  console.log('SUPABASE_URL:', supabaseUrl);
  console.log('SECRET_KEY:', serviceRoleKey.substring(0, 20) + '...');
  console.log('PUBLISHABLE_KEY:', anonKey.substring(0, 20) + '...\n');

  const envVars = [
    { name: 'SUPABASE_URL', value: supabaseUrl },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', value: serviceRoleKey },
    { name: 'SUPABASE_ANON_KEY', value: anonKey },
  ];

  for (const envVar of envVars) {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/extract-node-metadata/secrets`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: envVar.name,
          value: envVar.value,
        }),
      }
    );
    console.log(`${envVar.name} status:`, response.status);
    console.log(`${envVar.name} body:`, await response.text());
  }
}

setEnv().catch(console.error);
