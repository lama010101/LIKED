// Deterministic seeded mock data. No network calls — stands in for Gemini/Veo.
export type CardKind = "video" | "image";
export type ModelId = "veo-3" | "veo-2" | "imagen";
export type Aspect = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

export interface AssetParams {
  aspect: Aspect;
  seed: number;
  steps: number;
}

export interface PromptRevision {
  prompt: string;
  ts: number;
}

export interface Friend {
  id: string;
  name: string;
  initials: string;
  /** gradient ring colors (hex) */
  from: string;
  to: string;
  isGroup?: boolean;
  /** group chats filter to cards shared by these member ids */
  memberIds?: string[];
}

/** Deterministic friends list — regular friends first, group chats last. */
export const FRIENDS: Friend[] = [
  { id: "f-maya", name: "Maya", initials: "MK", from: "#f59e0b", to: "#ef4444" },
  { id: "f-jon", name: "Jon", initials: "JR", from: "#22d3ee", to: "#6366f1" },
  { id: "f-priya", name: "Priya", initials: "PS", from: "#a78bfa", to: "#ec4899" },
  { id: "f-leo", name: "Leo", initials: "LC", from: "#34d399", to: "#0ea5e9" },
  { id: "f-sana", name: "Sana", initials: "SK", from: "#fb7185", to: "#f59e0b" },
  { id: "f-tom", name: "Tom", initials: "TW", from: "#60a5fa", to: "#34d399" },
  { id: "f-ines", name: "Inés", initials: "IM", from: "#e879f9", to: "#7c8cf8" },
  {
    id: "g-writers",
    name: "Writers room",
    initials: "WR",
    from: "#f97316",
    to: "#a78bfa",
    isGroup: true,
    memberIds: ["f-maya", "f-jon", "f-priya"],
  },
  {
    id: "g-lab",
    name: "Night lab",
    initials: "NL",
    from: "#38bdf8",
    to: "#34d399",
    isGroup: true,
    memberIds: ["f-leo", "f-sana", "f-tom", "f-ines"],
  },
];

const FRIEND_IDS = FRIENDS.filter((f) => !f.isGroup).map((f) => f.id);

export interface AssetCard {
  id: string;
  prompt: string;
  createdAt: number;
  durationSec: number;
  kind: CardKind;
  seed: number;
  archived: boolean;
  collectionId: string | null;
  model: ModelId;
  params: AssetParams;
  history: PromptRevision[];
  /** who shared this asset — 'me' or a Friend id */
  sharedBy: string;
}

export interface Collection {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

/** FNV-1a string hash → 32-bit seed. */
function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUBJECTS = [
  "a lighthouse on a basalt cliff at blue hour",
  "a fox made of origami paper unfolding itself",
  "an astronaut tending a rooftop greenhouse",
  "a koi pond rippling in slow motion",
  "a clockmaker's workshop frozen mid-tick",
  "a cargo train crossing a salt flat",
  "a jellyfish drifting through a subway car",
  "a violinist performing on a glacier",
  "a night market alley in the rain",
  "a hummingbird hovering over chrome flowers",
  "a library where the shelves rearrange",
  "a fisherman casting nets of light",
  "a bonsai tree growing on a satellite dish",
  "a marathon runner crossing a mirror desert",
  "a typographer's letterpress coming alive",
  "a polar research station under aurora",
  "a street food stall at 3am, steam rising",
  "a cello duet inside an abandoned chapel",
  "a drone's view of terraced rice fields",
  "a child drawing chalk portals on pavement",
  "a glassblower shaping a nebula",
  "a herd of wild horses in shallow surf",
  "a puppet theatre staging the weather",
  "a greenhouse full of carnivorous plants",
  "a ferry crossing a fog-bound harbor",
  "a skydiver falling through cloud layers",
  "a potter glazing ceramics with fire",
  "a watchmaker's loupe revealing a galaxy",
  "a bioluminescent tide pooling at dusk",
  "a paper plane's flight across a city",
];

const STYLES = [
  "cinematic 35mm film still",
  "hand-painted gouache illustration",
  "macro photography",
  "anime cel shading",
  "brutalist minimal render",
  "vintage technicolor",
  "infrared photography",
  "isometric diorama",
  "noir chiaroscuro",
  "ukiyo-e woodblock print",
  "tilt-shift miniature",
  "long-exposure light painting",
];

const CAMERA = [
  "slow dolly-in",
  "crane shot rising",
  "static wide shot",
  "handheld tracking shot",
  "orbiting camera move",
  "extreme close-up pan",
  "aerial top-down drift",
  "whip pan reveal",
];

const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1", "4:3", "3:4"];

/** Fixed base timestamp so SSR and client renders are identical. */
const BASE_TS = Date.UTC(2025, 9, 12, 15, 0, 0); // 2025-10-12T15:00Z

function buildCards(count: number): AssetCard[] {
  const cards: AssetCard[] = [];
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(hashSeed(`flow-card-${i}`));
    const seed = Math.floor(rng() * 1_000_000);
    const kind: CardKind = rng() < 0.72 ? "video" : "image";
    const model: ModelId =
      kind === "image" ? "imagen" : rng() < 0.6 ? "veo-3" : "veo-2";
    const subject = SUBJECTS[Math.floor(rng() * SUBJECTS.length)];
    const style = STYLES[Math.floor(rng() * STYLES.length)];
    const cam = CAMERA[Math.floor(rng() * CAMERA.length)];
    const prompt =
      kind === "video"
        ? `${subject}, ${style}, ${cam}`
        : `${subject}, ${style}`;
    const createdAt = BASE_TS - Math.floor(rng() * 30 * 24 * 60) * 60_000; // within last 30 days
    const durationSec =
      kind === "video" ? 4 + Math.floor(rng() * 9) : 2 + Math.floor(rng() * 3);
    cards.push({
      id: `card-${i.toString(36).padStart(3, "0")}`,
      prompt,
      createdAt,
      durationSec,
      kind,
      seed,
      archived: rng() < 0.08,
      collectionId: null,
      model,
      params: {
        aspect: ASPECTS[Math.floor(rng() * ASPECTS.length)],
        seed,
        steps: 20 + Math.floor(rng() * 31),
      },
      history: [{ prompt, ts: createdAt }],
      sharedBy:
        rng() < 0.35
          ? FRIEND_IDS[Math.floor(rng() * FRIEND_IDS.length)]
          : "me",
    });
  }
  return cards;
}

export const SEED_COLLECTIONS: Collection[] = [
  { id: "col-nature", name: "Nature studies", parentId: null, createdAt: BASE_TS - 20 * 86_400_000 },
  { id: "col-scenes", name: "Scenes", parentId: null, createdAt: BASE_TS - 18 * 86_400_000 },
  { id: "col-forest", name: "Forest", parentId: "col-scenes", createdAt: BASE_TS - 17 * 86_400_000 },
  { id: "col-urban", name: "Urban", parentId: "col-scenes", createdAt: BASE_TS - 16 * 86_400_000 },
  { id: "col-characters", name: "Characters", parentId: null, createdAt: BASE_TS - 12 * 86_400_000 },
];

/** Assign ~25% of cards to seed collections deterministically. */
function assignSeedCollections(cards: AssetCard[]): AssetCard[] {
  const ids = SEED_COLLECTIONS.map((c) => c.id);
  return cards.map((c, i) => {
    const rng = mulberry32(hashSeed(`flow-assign-${i}`));
    if (rng() < 0.25) {
      return { ...c, collectionId: ids[Math.floor(rng() * ids.length)] };
    }
    return c;
  });
}

export const SEED_CARDS: AssetCard[] = assignSeedCollections(buildCards(142));

/** Deterministic thumbnail gradient pair for a card seed. */
export function thumbGradient(seed: number): { from: string; to: string; angle: number } {
  const rng = mulberry32(seed);
  const h1 = Math.floor(rng() * 360);
  const h2 = (h1 + 40 + Math.floor(rng() * 80)) % 360;
  const angle = Math.floor(rng() * 360);
  return {
    from: `hsl(${h1} 45% 22%)`,
    to: `hsl(${h2} 55% 12%)`,
    angle,
  };
}

/** Mock "generation" — used by the Create tab. Deterministic enough, no API. */
export function mockGenerate(prompt: string, n: number): AssetCard {
  const seed = hashSeed(`gen-${prompt}-${n}`);
  const rng = mulberry32(seed);
  const kind: CardKind = rng() < 0.7 ? "video" : "image";
  const ts = BASE_TS; // stable; store stamps real time at insertion
  return {
    id: `gen-${seed.toString(36)}`,
    prompt,
    createdAt: ts,
    durationSec: kind === "video" ? 8 : 2,
    kind,
    seed,
    archived: false,
    collectionId: null,
    model: kind === "video" ? "veo-3" : "imagen",
    params: { aspect: "16:9", seed, steps: 30 },
    history: [{ prompt, ts }],
    sharedBy: "me",
  };
}
