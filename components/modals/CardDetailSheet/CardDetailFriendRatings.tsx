/**
 * Friend ratings section — extracted from CardDetailSheet Body
 */

import Image from "next/image";

export interface FriendRating {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  score: number;
  updatedAt: string;
}

interface CardDetailFriendRatingsProps {
  friendRatings: FriendRating[];
  friendRatingsLoading: boolean;
}

export function CardDetailFriendRatings({
  friendRatings,
  friendRatingsLoading,
}: CardDetailFriendRatingsProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Friends rated this
      </div>
      {friendRatingsLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 32,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "var(--surface-3)",
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: 16,
                  borderRadius: 4,
                  background: "var(--surface-3)",
                }}
              />
            </div>
          ))}
        </div>
      ) : friendRatings.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-3)",
          }}
        >
          No friends have rated this yet
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {friendRatings.slice(0, 5).map((rating) => {
            const avatarUrl = rating.avatarKey
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${rating.avatarKey}`
              : null;
            return (
              <div
                key={rating.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={rating.displayName}
                    width={24}
                    height={24}
                    style={{
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "var(--surface-3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: "var(--text-3)",
                    }}
                  >
                    {rating.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: "var(--text-2)",
                    fontWeight: 500,
                  }}
                >
                  {rating.displayName}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-1)",
                    fontWeight: 600,
                  }}
                >
                  {rating.score.toFixed(1)}
                </span>
              </div>
            );
          })}
          {friendRatings.length > 5 && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                fontWeight: 500,
              }}
            >
              +{friendRatings.length - 5} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
