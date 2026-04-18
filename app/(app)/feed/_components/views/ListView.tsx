"use client";

import type { ViewProps, FeedItem } from "@/lib/types/feed";

function FolderThumb({ item }: { item: FeedItem }) {
  const base = item.folderColor ?? "#888";
  const quadrants = [
    `linear-gradient(135deg, ${base}cc, ${base}66)`,
    `linear-gradient(225deg, ${base}aa, ${base}44)`,
    `linear-gradient(45deg,  ${base}88, ${base}cc)`,
    `linear-gradient(315deg, ${base}55, ${base}99)`,
  ];
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 8,
        flexShrink: 0,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        overflow: "hidden",
      }}
    >
      {quadrants.map((bg, i) => (
        <div key={i} style={{ background: bg }} />
      ))}
    </div>
  );
}

function StarRow({ rating }: { rating: number }) {
  const filled = Math.floor(rating / 2);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
          <polygon
            points="5,1 6.2,3.8 9.5,4.1 7.1,6.3 7.9,9.5 5,7.8 2.1,9.5 2.9,6.3 0.5,4.1 3.8,3.8"
            fill={i < filled ? "var(--accent)" : "none"}
            stroke={i < filled ? "var(--accent)" : "var(--surface-5)"}
            strokeWidth="0.5"
          />
        </svg>
      ))}
    </div>
  );
}

function ListRow({ item, onClick }: { item: FeedItem; onClick: (item: FeedItem) => void }) {
  return (
    <div
      onClick={() => onClick(item)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        borderBottom: "1px solid var(--border-1)",
        cursor: "pointer",
        background: "var(--surface-2)",
      }}
    >
      {/* Thumbnail */}
      {item.kind === "folder" ? (
        <FolderThumb item={item} />
      ) : (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            flexShrink: 0,
            background: item.art,
          }}
        />
      )}

      {/* Meta column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-1)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.title}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginTop: 2,
          }}
        >
          {item.tagColor && (
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: item.tagColor,
                flexShrink: 0,
              }}
            />
          )}
          {item.tag && (
            <span style={{ fontSize: 10, color: item.tagColor, fontWeight: 600 }}>
              {item.tag}
            </span>
          )}
          {(item.tag || item.tagColor) && item.source && (
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>·</span>
          )}
          {item.source && (
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>{item.source}</span>
          )}
          {item.daysAgo != null && (
            <>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>·</span>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                {item.daysAgo === 0 ? "Today" : `${item.daysAgo}d ago`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Rating */}
      {item.rating != null && item.rating > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            marginLeft: "auto",
            flexShrink: 0,
          }}
        >
          <StarRow rating={item.rating} />
        </div>
      )}

      {/* Sent avatars */}
      {item.sentTo && item.sentTo.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {item.sentTo.slice(0, 3).map((s, i) => (
            <div
              key={s}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "var(--surface-4)",
                fontSize: 7,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-2)",
                marginLeft: i > 0 ? -4 : 0,
                border: "1px solid var(--surface-2)",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {s[0]?.toUpperCase()}
            </div>
          ))}
        </div>
      )}

      {/* Direction chevron */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-3)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, transform: "rotate(180deg)" }}
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </div>
  );
}

export default function ListView({ items, onItemClick }: ViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: "0 0 4px" }}>
      {items.map((item) => (
        <ListRow key={item.id} item={item} onClick={onItemClick} />
      ))}
    </div>
  );
}
