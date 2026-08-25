"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { createNodeAction } from "@/app/lib/actions/createNode";

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  description: string;
}

interface YouTubeSubscription {
  id: string;
  title: string;
  thumbnail: string;
  channelId: string;
  subscriberCount: string;
}

type Tab = "likes" | "subscriptions";

export default function YouTubeActivityPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("likes");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Likes state
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [likesError, setLikesError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmUnlike, setConfirmUnlike] = useState<string | null>(null);
  const [savingVideoId, setSavingVideoId] = useState<string | null>(null);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<YouTubeSubscription[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [subsNextPageToken, setSubsNextPageToken] = useState<string | null>(null);
  const [subsLoadingMore, setSubsLoadingMore] = useState(false);
  const [confirmUnsub, setConfirmUnsub] = useState<string | null>(null);

  const lastFetchRef = useRef<number>(0);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Auth guard: redirect to /login if not authenticated
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (cancelled) return;
      if (!session) {
        router.replace("/login");
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  // Check connection status
  useEffect(() => {
    let cancelled = false;
    const checkStatus = async () => {
      try {
        const res = await fetch("/api/youtube/status");
        const data = await res.json();
        if (cancelled) return;
        setConnected(data.connected ?? false);
        setEmail(data.email ?? null);
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    };
    checkStatus();
    return () => { cancelled = true; };
  }, []);

  // Connect YouTube — trigger OAuth with YouTube scopes
  const handleConnect = useCallback(async () => {
    setConnecting(true);
    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/youtube",
        redirectTo: `${window.location.origin}/api/youtube/callback?next=/youtube`,
      },
    });
    if (error) {
      setConnecting(false);
      setToast({ message: error.message || "Failed to connect YouTube. Please try again.", type: "error" });
    }
  }, []);

  // Disconnect
  const handleDisconnect = useCallback(async () => {
    try {
      const res = await fetch("/api/youtube/disconnect", { method: "POST" });
      if (res.ok) {
        setConnected(false);
        setEmail(null);
        setVideos([]);
        setSubscriptions([]);
        setToast({ message: "YouTube disconnected.", type: "success" });
      } else {
        setToast({ message: "Failed to disconnect. Please try again.", type: "error" });
      }
    } catch {
      setToast({ message: "Network error. Please try again.", type: "error" });
    }
  }, []);

  // Fetch liked videos
  const fetchLikes = useCallback(async (pageToken?: string) => {
    if (pageToken) {
      setLoadingMore(true);
    } else {
      setLikesLoading(true);
    }
    setLikesError(null);

    try {
      const url = `/api/youtube/likes${pageToken ? `?pageToken=${pageToken}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setLikesError(data.error ?? "Failed to fetch liked videos");
        return;
      }
      if (pageToken) {
        setVideos((prev) => [...prev, ...(data.videos ?? [])]);
      } else {
        setVideos(data.videos ?? []);
      }
      setNextPageToken(data.nextPageToken ?? null);
      lastFetchRef.current = Date.now();
    } catch {
      setLikesError("Network error. Please try again.");
    } finally {
      setLikesLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Fetch subscriptions
  const fetchSubs = useCallback(async (pageToken?: string) => {
    if (pageToken) {
      setSubsLoadingMore(true);
    } else {
      setSubsLoading(true);
    }
    setSubsError(null);

    try {
      const url = `/api/youtube/subscriptions${pageToken ? `?pageToken=${pageToken}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setSubsError(data.error ?? "Failed to fetch subscriptions");
        return;
      }
      if (pageToken) {
        setSubscriptions((prev) => [...prev, ...(data.subscriptions ?? [])]);
      } else {
        setSubscriptions(data.subscriptions ?? []);
      }
      setSubsNextPageToken(data.nextPageToken ?? null);
    } catch {
      setSubsError("Network error. Please try again.");
    } finally {
      setSubsLoading(false);
      setSubsLoadingMore(false);
    }
  }, []);

  // Load data when tab changes (with 60s minimum re-fetch interval)
  useEffect(() => {
    if (!connected) return;
    const sinceLastFetch = Date.now() - lastFetchRef.current;
    if (sinceLastFetch < 60000 && tab === "likes" && videos.length > 0) return;

    if (tab === "likes" && videos.length === 0) {
      fetchLikes();
    } else if (tab === "subscriptions" && subscriptions.length === 0) {
      fetchSubs();
    }
  }, [tab, connected, videos.length, subscriptions.length, fetchLikes, fetchSubs]);

  // Unlike a video
  const handleUnlike = useCallback(async (videoId: string) => {
    setConfirmUnlike(null);
    try {
      const res = await fetch(`/api/youtube/likes/${videoId}`, { method: "DELETE" });
      if (res.ok) {
        setVideos((prev) => prev.filter((v) => v.id !== videoId));
        setToast({ message: "Video unliked.", type: "success" });
      } else {
        const data = await res.json().catch(() => null);
        setToast({ message: data?.error ?? "Failed to unlike video.", type: "error" });
      }
    } catch {
      setToast({ message: "Network error. Please try again.", type: "error" });
    }
  }, []);

  // Unsubscribe
  const handleUnsubscribe = useCallback(async (subscriptionId: string) => {
    setConfirmUnsub(null);
    try {
      const res = await fetch(`/api/youtube/subscriptions/${subscriptionId}`, { method: "DELETE" });
      if (res.ok) {
        setSubscriptions((prev) => prev.filter((s) => s.id !== subscriptionId));
        setToast({ message: "Unsubscribed.", type: "success" });
      } else {
        const data = await res.json().catch(() => null);
        setToast({ message: data?.error ?? "Failed to unsubscribe.", type: "error" });
      }
    } catch {
      setToast({ message: "Network error. Please try again.", type: "error" });
    }
  }, []);

  // Save to LIKED — creates a node from the YouTube video URL
  const handleSaveToLiked = useCallback(async (video: YouTubeVideo) => {
    setSavingVideoId(video.id);
    try {
      const url = `https://www.youtube.com/watch?v=${video.id}`;
      const result = await createNodeAction({
        url,
        title: video.title,
        thumbnailUrl: video.thumbnail || null,
      });
      if (result.ok) {
        setSavedVideoIds((prev) => new Set(prev).add(video.id));
        setToast({ message: "Saved to your feed!", type: "success" });
      } else if (result.code === "duplicate") {
        setSavedVideoIds((prev) => new Set(prev).add(video.id));
        setToast({ message: "Already in your feed.", type: "success" });
      } else {
        setToast({ message: result.error || "Failed to save.", type: "error" });
      }
    } catch {
      setToast({ message: "Failed to save video.", type: "error" });
    } finally {
      setSavingVideoId(null);
    }
  }, []);

  if (statusLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-3, #999)" }}>
        Loading…
      </div>
    );
  }

  if (!connected) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>📺</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1, #111)" }}>
          Connect your YouTube account
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-2, #666)", textAlign: "center", maxWidth: 400 }}>
          See your liked videos and subscriptions, unlike videos, unsubscribe from channels — all from inside LIKED.
        </p>
        <button
          onClick={handleConnect}
          disabled={connecting}
          style={{
            padding: "12px 28px",
            background: "var(--accent, #7c5cfc)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            opacity: connecting ? 0.6 : 1,
          }}
        >
          {connecting ? "Connecting…" : "Connect YouTube"}
        </button>
        <button
          onClick={() => router.push("/feed")}
          style={{
            padding: "8px 16px",
            background: "none",
            border: "none",
            color: "var(--text-3, #999)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Back to feed
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 100 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "10px 20px",
          background: toast.type === "error" ? "var(--red, #ef4444)" : "var(--accent, #7c5cfc)",
          color: "#fff",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          zIndex: 1000,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          {toast.message}
        </div>
      )}
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--border-1, #e5e7eb)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1, #111)", margin: 0 }}>
            YouTube Activity
          </h1>
          {email && (
            <span style={{ fontSize: 12, color: "var(--text-3, #999)" }}>{email}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => router.push("/feed")}
            style={{
              padding: "6px 12px",
              background: "var(--surface-3, #f5f5f5)",
              border: "1px solid var(--border-1, #e5e7eb)",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-2, #666)",
              cursor: "pointer",
            }}
          >
            Back
          </button>
          <button
            onClick={handleDisconnect}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid var(--red, #ef4444)",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--red, #ef4444)",
              cursor: "pointer",
            }}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", padding: "0 20px", borderBottom: "1px solid var(--border-1, #e5e7eb)" }}>
        {(["likes", "subscriptions"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "12px 16px",
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--accent, #7c5cfc)" : "2px solid transparent",
              color: tab === t ? "var(--accent, #7c5cfc)" : "var(--text-3, #999)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {t === "likes" ? "Liked Videos" : "Subscriptions"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "16px 20px" }}>
        {tab === "likes" && (
          <>
            {likesLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-3, #999)" }}>
                Loading liked videos…
              </div>
            ) : likesError ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--red, #ef4444)" }}>
                {likesError}
                <br />
                <button
                  onClick={() => fetchLikes()}
                  style={{
                    marginTop: 12, padding: "6px 16px",
                    background: "var(--surface-3)", border: "1px solid var(--border-1)",
                    borderRadius: 8, cursor: "pointer", fontSize: 13,
                  }}
                >
                  Try again
                </button>
              </div>
            ) : videos.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-3, #999)" }}>
                No liked videos found
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {videos.map((video) => (
                  <VideoRow
                    key={video.id}
                    video={video}
                    confirmUnlike={confirmUnlike === video.id}
                    onConfirmUnlike={() => setConfirmUnlike(video.id)}
                    onCancelUnlike={() => setConfirmUnlike(null)}
                    onUnlike={() => handleUnlike(video.id)}
                    onSaveToLiked={() => handleSaveToLiked(video)}
                    saving={savingVideoId === video.id}
                    saved={savedVideoIds.has(video.id)}
                  />
                ))}
                {nextPageToken && (
                  <button
                    onClick={() => fetchLikes(nextPageToken)}
                    disabled={loadingMore}
                    style={{
                      padding: "10px 0",
                      background: "var(--surface-3, #f5f5f5)",
                      border: "1px solid var(--border-1, #e5e7eb)",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-2, #666)",
                      cursor: "pointer",
                    }}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {tab === "subscriptions" && (
          <>
            {subsLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-3, #999)" }}>
                Loading subscriptions…
              </div>
            ) : subsError ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--red, #ef4444)" }}>
                {subsError}
                <br />
                <button
                  onClick={() => fetchSubs()}
                  style={{
                    marginTop: 12, padding: "6px 16px",
                    background: "var(--surface-3)", border: "1px solid var(--border-1)",
                    borderRadius: 8, cursor: "pointer", fontSize: 13,
                  }}
                >
                  Try again
                </button>
              </div>
            ) : subscriptions.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-3, #999)" }}>
                No subscriptions found
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {subscriptions.map((sub) => (
                  <SubscriptionRow
                    key={sub.id}
                    subscription={sub}
                    confirmUnsub={confirmUnsub === sub.id}
                    onConfirmUnsub={() => setConfirmUnsub(sub.id)}
                    onCancelUnsub={() => setConfirmUnsub(null)}
                    onUnsubscribe={() => handleUnsubscribe(sub.id)}
                  />
                ))}
                {subsNextPageToken && (
                  <button
                    onClick={() => fetchSubs(subsNextPageToken)}
                    disabled={subsLoadingMore}
                    style={{
                      padding: "10px 0",
                      background: "var(--surface-3, #f5f5f5)",
                      border: "1px solid var(--border-1, #e5e7eb)",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-2, #666)",
                      cursor: "pointer",
                    }}
                  >
                    {subsLoadingMore ? "Loading…" : "Load more"}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VideoRow({
  video,
  confirmUnlike,
  onConfirmUnlike,
  onCancelUnlike,
  onUnlike,
  onSaveToLiked,
  saving,
  saved,
}: {
  video: YouTubeVideo;
  confirmUnlike: boolean;
  onConfirmUnlike: () => void;
  onCancelUnlike: () => void;
  onUnlike: () => void;
  onSaveToLiked: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div style={{
      display: "flex",
      gap: 12,
      padding: 12,
      background: "var(--surface-2, #f9f9f9)",
      borderRadius: 12,
      border: "1px solid var(--border-1, #f0f0f0)",
    }}>
      {/* Thumbnail */}
      {video.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnail}
          alt={video.title}
          style={{ width: 120, height: 68, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
        />
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-1, #111)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {video.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3, #999)", marginTop: 2 }}>
          {video.channelTitle}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={onSaveToLiked}
            disabled={saving || saved}
            style={{
              padding: "4px 10px",
              background: saved ? "var(--surface-3, #e5e7eb)" : "var(--accent, #7c5cfc)",
              color: saved ? "var(--text-3, #999)" : "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: saved ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save to LIKED"}
          </button>

          {confirmUnlike ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--red, #ef4444)" }}>Confirm?</span>
              <button
                onClick={onUnlike}
                style={{
                  padding: "4px 10px",
                  background: "var(--red, #ef4444)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Yes, unlike
              </button>
              <button
                onClick={onCancelUnlike}
                style={{
                  padding: "4px 10px",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-1)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-2)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onConfirmUnlike}
              style={{
                padding: "4px 10px",
                background: "transparent",
                border: "1px solid var(--border-1, #e5e7eb)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-2, #666)",
                cursor: "pointer",
              }}
            >
              Unlike
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SubscriptionRow({
  subscription,
  confirmUnsub,
  onConfirmUnsub,
  onCancelUnsub,
  onUnsubscribe,
}: {
  subscription: YouTubeSubscription;
  confirmUnsub: boolean;
  onConfirmUnsub: () => void;
  onCancelUnsub: () => void;
  onUnsubscribe: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      gap: 12,
      padding: 12,
      background: "var(--surface-2, #f9f9f9)",
      borderRadius: 12,
      border: "1px solid var(--border-1, #f0f0f0)",
    }}>
      {/* Avatar */}
      {subscription.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={subscription.thumbnail}
          alt={subscription.title}
          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        />
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-1, #111)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {subscription.title}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {confirmUnsub ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--red, #ef4444)" }}>Confirm?</span>
              <button
                onClick={onUnsubscribe}
                style={{
                  padding: "4px 10px",
                  background: "var(--red, #ef4444)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Yes, unsubscribe
              </button>
              <button
                onClick={onCancelUnsub}
                style={{
                  padding: "4px 10px",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-1)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-2)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onConfirmUnsub}
              style={{
                padding: "4px 10px",
                background: "transparent",
                border: "1px solid var(--border-1, #e5e7eb)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-2, #666)",
                cursor: "pointer",
              }}
            >
              Unsubscribe
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
