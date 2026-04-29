const PAT = 'sbp_81e6dcc23175cd4dc8172ac0286037ea302f0ceb';
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
  console.log('FUNCTION DETAILS body:', body);
}

checkEnv().catch(console.error);
