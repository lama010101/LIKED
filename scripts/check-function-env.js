const PAT = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

async function checkEnv() {
  console.log('=== CHECKING FUNCTION ENV VARIABLES ===\n');

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/extract-node-metadata`,
    {
      headers: {
        'Authorization': `Bearer ${PAT}`,
      },
    }
  );

  console.log('FUNCTION DETAILS status:', response.status);
  const body = await response.text();
  console.log('FUNCTION DETAILS:', response.status, 'extract-node-metadata');
}

checkEnv().catch(console.error);
