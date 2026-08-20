'use client';

import { useEffect, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface UseRealtimeOptions {
  userId: string | null;
  onNewShare: () => void;
  onNewNotification: () => void;
  onRatingChange: (nodeId: string) => void;
  onProfileChange: (userId: string) => void;
  onNodeTitleChange: (nodeId: string) => void;
}

/**
 * P10-T01: Supabase Realtime subscriptions per PRD §22 and §32.5.
 *
 * Subscribes to 5 channels:
 * 1. edges INSERT for current user → refresh feed (new share arrived)
 * 2. notifications INSERT for current user → increment bell badge
 * 3. ratings INSERT/UPDATE → update avg_rating on cards
 * 4. users UPDATE → propagate profile changes (name, avatar)
 * 5. nodes UPDATE → update card titles
 *
 * All subscriptions clean up on unmount.
 */
export function useRealtime({
  userId,
  onNewShare,
  onNewNotification,
  onRatingChange,
  onProfileChange,
  onNodeTitleChange,
}: UseRealtimeOptions) {
  const callbacksRef = useRef({
    onNewShare,
    onNewNotification,
    onRatingChange,
    onProfileChange,
    onNodeTitleChange,
  });

  // Keep callbacks ref updated without re-subscribing
  useEffect(() => {
    callbacksRef.current = {
      onNewShare,
      onNewNotification,
      onRatingChange,
      onProfileChange,
      onNodeTitleChange,
    };
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabaseBrowser
      .channel('liked-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'edges',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const edge = payload.new as { direction?: string };
          // Only refresh on received edges (new share from someone else)
          if (edge.direction === 'received') {
            callbacksRef.current.onNewShare();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          callbacksRef.current.onNewNotification();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ratings',
        },
        (payload) => {
          const row = payload.new as { node_id?: string };
          if (row?.node_id) {
            callbacksRef.current.onRatingChange(row.node_id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
        },
        (payload) => {
          const row = payload.new as { id?: string };
          if (row?.id) {
            callbacksRef.current.onProfileChange(row.id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'nodes',
        },
        (payload) => {
          const row = payload.new as { id?: string };
          if (row?.id) {
            callbacksRef.current.onNodeTitleChange(row.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [userId]);
}
