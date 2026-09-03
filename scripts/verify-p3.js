/**
 * P3-T01 through P3-T05 Verification Script
 * Reports exact row counts for all operations
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runVerification() {
  const results = [];

  // Get test users
  const { data: users } = await supabase.from('users').select('id, display_name').limit(3);
  if (!users || users.length < 2) {
    console.log('ERROR: Need at least 2 users for testing');
    process.exit(1);
  }

  const userA = users[0];
  const userB = users[1];
  const userC = users[2] || users[1];

  results.push(`=== Test Users ===`);
  results.push(`User A: ${userA.id} (${userA.display_name})`);
  results.push(`User B: ${userB.id} (${userB.display_name})`);
  results.push(`User C: ${userC.id} (${userC.display_name})`);
  results.push('');

  // Get a node owned by userA
  const { data: nodes } = await supabase.from('nodes').select('id, url, title').eq('owner_id', userA.id).is('deleted_at', null).limit(2);
  if (!nodes || nodes.length === 0) {
    console.log('ERROR: Need at least 1 node owned by userA');
    process.exit(1);
  }

  const testNode = nodes[0];
  results.push(`=== Test Node ===`);
  results.push(`Node ID: ${testNode.id}`);
  results.push(`Title: ${testNode.title || 'N/A'}`);
  results.push('');

  // ============================================================
  // TEST 1: direct_share
  // ============================================================
  results.push('=== TEST 1: direct_share ===');

  // Get initial counts
  const { data: initialCauses } = await supabase.from('causes').select('count').eq('cause_type', 'direct_share').single();
  const { data: initialEdges } = await supabase.from('edges').select('count').eq('node_id', testNode.id).single();

  // Call direct_share
  const { data: causeId1, error: shareError } = await supabase.rpc('direct_share', {
    p_sharer_id: userA.id,
    p_node_id: testNode.id,
    p_target_user_id: userB.id
  });

  if (shareError) {
    results.push(`ERROR: direct_share failed: ${shareError.message}`);
  } else {
    results.push(`direct_share() returned cause_id: ${causeId1}`);

    // Count causes
    const { data: causesAfter } = await supabase.from('causes').select('id').eq('cause_type', 'direct_share');
    results.push(`Count causes WHERE cause_type='direct_share': ${causesAfter.length}`);

    // Count edges for this node
    const { data: edgesAfter } = await supabase.from('edges').select('id, user_id, direction, cause_id').eq('node_id', testNode.id);
    results.push(`Count edges WHERE node_id='${testNode.id}': ${edgesAfter.length}`);

    // Show edge details
    edgesAfter.forEach(e => {
      results.push(`  Edge: user_id=${e.user_id.substring(0,8)}... direction=${e.direction} cause_id=${e.cause_id.substring(0,8)}...`);
    });

    // Verify userB can see the node
    const { data: visibleToB } = await supabase.rpc('get_visible_nodes', { p_user_id: userB.id });
    const canSeeNode = visibleToB.some(n => n.id === testNode.id);
    results.push(`User B can see node via get_visible_nodes(): ${canSeeNode ? 'YES' : 'NO'}`);

    // ============================================================
    // TEST 2: double-share (non-idempotent)
    // ============================================================
    results.push('');
    results.push('=== TEST 2: double-share (same args again) ===');

    const { data: causeId2, error: shareError2 } = await supabase.rpc('direct_share', {
      p_sharer_id: userA.id,
      p_node_id: testNode.id,
      p_target_user_id: userB.id
    });

    if (shareError2) {
      results.push(`ERROR: second direct_share failed: ${shareError2.message}`);
    } else {
      results.push(`second direct_share() returned cause_id: ${causeId2}`);

      // Count causes for this node
      const { data: nodeCauses } = await supabase.from('causes').select('id').eq('cause_type', 'direct_share').filter('metadata->>node_id', 'eq', testNode.id);
      results.push(`Count causes for node X (expect 2): ${nodeCauses.length}`);

      // Count edges for userB
      const { data: userBEdges } = await supabase.from('edges').select('id').eq('node_id', testNode.id).eq('user_id', userB.id);
      results.push(`Count edges for node X WHERE user_id=userB (expect 2): ${userBEdges.length}`);

      // ============================================================
      // TEST 3: unshare
      // ============================================================
      results.push('');
      results.push('=== TEST 3: unshare (first cause) ===');

      const { data: unshareResult, error: unshareError } = await supabase.rpc('unshare', {
        p_cause_id: causeId1,
        p_requesting_user_id: userA.id
      });

      if (unshareError) {
        results.push(`ERROR: unshare failed: ${unshareError.message}`);
      } else {
        results.push(`unshare() returned: ${unshareResult}`);

        // Count edges for first cause
        const { data: edgesAfterUnshare } = await supabase.from('edges').select('id').eq('cause_id', causeId1);
        results.push(`Count edges WHERE cause_id=first_cause (expect 0): ${edgesAfterUnshare.length}`);

        // Count edges for node and userB (should still have 1 from second share)
        const { data: userBEdgesAfter } = await supabase.from('edges').select('id').eq('node_id', testNode.id).eq('user_id', userB.id);
        results.push(`Count edges for node X, user B (expect 1): ${userBEdgesAfter.length}`);
      }
    }
  }

  // ============================================================
  // TEST 4: group_share
  // ============================================================
  results.push('');
  results.push('=== TEST 4: group_share ===');

  // First create a group with members
  const { data: newGroup, error: groupError } = await supabase.rpc('create_group', {
    p_owner_id: userA.id,
    p_name: 'Test Group ' + Date.now(),
    p_member_ids: [userB.id, userC.id]
  });

  if (groupError || !newGroup || newGroup.length === 0) {
    results.push(`ERROR: create_group failed: ${groupError?.message || 'no data'}`);
  } else {
    const groupId = newGroup[0].id;
    results.push(`Created group: ${groupId.substring(0, 8)}...`);

    // Get member count
    const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
    results.push(`Group member count (N): ${members.length}`);

    // Get another node for group test
    const testNode2 = nodes[1] || nodes[0];

    // Share to group
    const { data: groupCauseId, error: groupShareError } = await supabase.rpc('group_share', {
      p_sharer_id: userA.id,
      p_node_id: testNode2.id,
      p_group_id: groupId
    });

    if (groupShareError) {
      results.push(`ERROR: group_share failed: ${groupShareError.message}`);
    } else {
      results.push(`group_share() returned cause_id: ${groupCauseId.substring(0, 8)}...`);

      // Count edges for this cause
      const { data: groupEdges } = await supabase.from('edges').select('id, user_id').eq('cause_id', groupCauseId);
      results.push(`Count edges WHERE cause_id=group_cause (expect N=${members.length}): ${groupEdges.length}`);

      // Verify each member sees the node
      for (const member of members) {
        const { data: visible } = await supabase.rpc('get_visible_nodes', { p_user_id: member.user_id });
        const canSee = visible.some(n => n.id === testNode2.id);
        results.push(`Member ${member.user_id.substring(0, 8)}... can see node: ${canSee ? 'YES' : 'NO'}`);
      }

      // ============================================================
      // TEST 5: group_unshare
      // ============================================================
      results.push('');
      results.push('=== TEST 5: group_unshare ===');

      const { data: groupUnshareResult, error: groupUnshareError } = await supabase.rpc('group_unshare', {
        p_sharer_id: userA.id,
        p_node_id: testNode2.id,
        p_group_id: groupId
      });

      if (groupUnshareError) {
        results.push(`ERROR: group_unshare failed: ${groupUnshareError.message}`);
      } else {
        results.push(`group_unshare() returned: ${groupUnshareResult}`);

        // Count edges for this cause (should be 0)
        const { data: edgesAfterGroupUnshare } = await supabase.from('edges').select('id').eq('cause_id', groupCauseId);
        results.push(`Count edges WHERE cause_id=group_cause (expect 0): ${edgesAfterGroupUnshare.length}`);
      }
    }
  }

  // ============================================================
  // TEST 6: getFriends
  // ============================================================
  results.push('');
  results.push('=== TEST 6: getFriends ===');

  // Clean up previous test shares first
  await supabase.from('edges').delete().eq('sender_id', userA.id).eq('user_id', userB.id);
  await supabase.from('edges').delete().eq('sender_id', userB.id).eq('user_id', userA.id);

  // Before reciprocal share - check manually
  const { data: aSentBefore } = await supabase.from('edges').select('user_id').eq('sender_id', userA.id).eq('user_id', userB.id);
  const { data: aReceivedBefore } = await supabase.from('edges').select('sender_id').eq('user_id', userA.id).eq('sender_id', userB.id);
  const isFriendBefore = (aSentBefore && aSentBefore.length > 0) && (aReceivedBefore && aReceivedBefore.length > 0);
  results.push(`Before reciprocal share: User B in User A's friends: ${isFriendBefore ? 'YES' : 'NO'} (expected: NO)`);

  // Create A→B share
  const { data: abCause } = await supabase.rpc('direct_share', {
    p_sharer_id: userA.id,
    p_node_id: testNode.id,
    p_target_user_id: userB.id
  });
  results.push(`Created A→B share: ${abCause.substring(0, 8)}...`);

  // Create B→A share (reciprocal)
  const { data: baCause } = await supabase.rpc('direct_share', {
    p_sharer_id: userB.id,
    p_node_id: testNode.id, // B shares same node back
    p_target_user_id: userA.id
  });
  results.push(`Created B→A share: ${baCause.substring(0, 8)}...`);

  // After reciprocal share
  const { data: edgesFromA } = await supabase.from('edges').select('user_id').eq('sender_id', userA.id);
  const { data: edgesToA } = await supabase.from('edges').select('sender_id').eq('user_id', userA.id);

  const aSentTo = edgesFromA.map(e => e.user_id);
  const aReceivedFrom = edgesToA.map(e => e.sender_id);
  const friends = aSentTo.filter(id => aReceivedFrom.includes(id));
  const isFriendAfter = friends.includes(userB.id);

  results.push(`After reciprocal share: User B in User A's friends: ${isFriendAfter ? 'YES' : 'NO'} (expected: YES)`);
  results.push(`Reciprocal friend count: ${friends.length}`);

  // Print all results
  console.log('\\n' + '='.repeat(60));
  console.log('P3-T01 through P3-T05 VERIFICATION RESULTS');
  console.log('='.repeat(60));
  results.forEach(r => console.log(r));
  console.log('='.repeat(60));
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
