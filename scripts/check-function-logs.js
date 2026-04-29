const PAT = 'sbp_81e6dcc23175cd4dc8172ac0286037ea302f0ceb';
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
