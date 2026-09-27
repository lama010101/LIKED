const PAT = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

async function checkLogs() {
  console.log('=== CHECKING FUNCTION LOGS ===\n');

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/extract-node-metadata/logs`,
    {
      headers: {
        'Authorization': `Bearer ${PAT}`,
      },
    }
  );

  console.log('LOGS status:', response.status);
  console.log('LOGS body:', await response.text());
}

checkLogs().catch(console.error);
