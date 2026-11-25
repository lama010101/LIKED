// String attributes for the v2 inbox components. The repo's
// react/jsx-no-literals (noStrings) rule rejects string literals in JSX
// attributes inside components/v2/**, so every fixed attribute value is a
// module constant here.

export const UI = {
  button: "button",
  img: "img",
  dialog: "dialog",
  alert: "alert",
  tab: "tab",
  tablist: "tablist",
  true: "true",
  empty: "",
  lazy: "lazy",
  blank: "_blank",
  noopener: "noopener noreferrer",
  progressbar: "progressbar",
} as const;

export const TONE = {
  friends: "friends",
  tmdb: "tmdb",
} as const;

export const ROUTES = {
  logo: "/logo.svg",
  settings: "/settings",
  notifications: "/notifications",
} as const;

export const TESTID = {
  card: "inbox-card",
  cardAvatars: "inbox-card-avatars",
  cardPlatforms: "inbox-card-platforms",
  cardRaters: "inbox-card-raters",
  detailOverlay: "inbox-detail-overlay",
  ringFriends: "inbox-ring-friends",
  ringTmdb: "inbox-ring-tmdb",
  recommenderRow: "inbox-recommender-row",
  shareBar: "inbox-share-bar",
  shareUrl: "inbox-share-url",
  shareToggle: "inbox-share-toggle",
  shareState: "inbox-share-state",
  shareButton: "inbox-share-button",
  unreadCount: "inbox-unread-count",
  tabToWatch: "inbox-tab-to-watch",
  tabCount: "inbox-tab-count",
  empty: "inbox-empty",
  list: "inbox-list",
  loadMore: "inbox-load-more",
  rail: "inbox-rail",
  railAll: "rail-all",
  railFriend: "rail-friend",
} as const;
