// data.jsx — seed data for the prototype
// Color art: linear-gradient strings used as card "artwork" (placeholders in lieu of real previews)

const ART = [
  'linear-gradient(135deg,#7a3ad5,#3a1c9e)',
  'linear-gradient(135deg,#f5a623,#ff6b6b)',
  'linear-gradient(135deg,#1a8a7b,#0d3a3a)',
  'linear-gradient(135deg,#4a9fd5,#1c4a9e)',
  'linear-gradient(135deg,#ff6b6b,#6e1a42)',
  'linear-gradient(135deg,#2d4a1c,#0d2a1a)',
  'linear-gradient(135deg,#d54a9f,#6b1c4a)',
  'linear-gradient(135deg,#d5a44a,#7a5a1c)',
  'linear-gradient(135deg,#60c5f1,#1c4a7a)',
  'linear-gradient(135deg,#a78bfa,#4a2c9a)',
  'linear-gradient(135deg,#0d3a4a,#1c6f8a)',
  'linear-gradient(135deg,#c9a25a,#6a4a1a)',
  'linear-gradient(135deg,#3a7bd5,#1c2a60)',
  'linear-gradient(135deg,#4ad58a,#1c6a40)',
  'linear-gradient(135deg,#d53a7b,#5a1c3a)',
  'linear-gradient(135deg,#6b1aa0,#1c0d4a)',
  'linear-gradient(135deg,#1c3a4a,#40607a)',
  'linear-gradient(135deg,#c44a1c,#8a1c0d)',
  'linear-gradient(135deg,#2a8a4a,#0d3a1c)',
  'linear-gradient(135deg,#7a1c3a,#3a0d1c)',
];

// Tags with brand colors
const TAGS = {
  music:   { label: 'Music',   color: '#3a7bd5' },
  film:    { label: 'Film',    color: '#c43a5a' },
  food:    { label: 'Food',    color: '#e05c3a' },
  travel:  { label: 'Travel',  color: '#2a8a4a' },
  tech:    { label: 'Tech',    color: '#7b3ad5' },
  finance: { label: 'Finance', color: '#2a8a4a' },
  health:  { label: 'Health',  color: '#7a9a2a' },
  design:  { label: 'Design',  color: '#d54a9f' },
  book:    { label: 'Books',   color: '#a07a1c' },
  game:    { label: 'Games',   color: '#d5a44a' },
  art:     { label: 'Art',     color: '#9a3ad5' },
};

// Friends
const FRIENDS = [
  { id: 'me',  name: 'Me',      initial: 'JS', bg: 'linear-gradient(135deg,#f5a623,#ff6b6b)', you: true },
  { id: 'al',  name: 'Alice',   initial: 'A',  bg: 'linear-gradient(135deg,#4a9fd5,#1c6fa0)', new: true },
  { id: 'bo',  name: 'Bob',     initial: 'B',  bg: 'linear-gradient(135deg,#d54a9f,#a01c6f)', new: true },
  { id: 'ch',  name: 'Chiara',  initial: 'C',  bg: 'linear-gradient(135deg,#4ad58a,#1ca06f)' },
  { id: 'di',  name: 'Diego',   initial: 'D',  bg: 'linear-gradient(135deg,#d5a44a,#a07a1c)' },
  { id: 'el',  name: 'Elena',   initial: 'E',  bg: 'linear-gradient(135deg,#7b3ad5,#4a1ca0)' },
  { id: 'fa',  name: 'Fabio',   initial: 'F',  bg: 'linear-gradient(135deg,#d53a3a,#a01c1c)' },
  { id: 'gi',  name: 'Giulia',  initial: 'G',  bg: 'linear-gradient(135deg,#3ad5c5,#1c9fa0)' },
  { id: 'hu',  name: 'Hugo',    initial: 'H',  bg: 'linear-gradient(135deg,#a0d53a,#6fa01c)' },
  { id: 'ir',  name: 'Iris',    initial: 'I',  bg: 'linear-gradient(135deg,#d5953a,#a06a1c)' },
  { id: 'je',  name: 'Jean',    initial: 'J',  bg: 'linear-gradient(135deg,#3a50d5,#1c30a0)' },
  { id: 'ka',  name: 'Kai',     initial: 'K',  bg: 'linear-gradient(135deg,#d53a7b,#8a1c4a)' },
];

// Groups
const GROUPS = [
  { id: 'g-music',  name: 'Music',   initial: 'M', bg: 'linear-gradient(135deg,#3a5cd5,#1c3aa0)', members: ['al','bo','ch'] },
  { id: 'g-tech',   name: 'Tech',    initial: 'T', bg: 'linear-gradient(135deg,#c43a5a,#8a1c3a)', members: ['di','el'] },
  { id: 'g-health', name: 'Health',  initial: 'H', bg: 'linear-gradient(135deg,#2a8a4a,#1a5a30)', members: ['ch','gi','hu'] },
  { id: 'g-film',   name: 'Film',    initial: 'F', bg: 'linear-gradient(135deg,#9a3ad5,#5a1c8a)', members: ['al','ka','je'] },
];

// Folders (with nested structure)
const FOLDERS = [
  { id: 'f-fav',    name: 'Favorites',  color: '#e05c3a', count: 42, parent: null, artIdx: [0,2,4,5] },
  { id: 'f-travel', name: 'Travel',     color: '#3a7bd5', count: 28, parent: null, artIdx: [8,10,12,16] },
  { id: 'f-read',   name: 'Read Later', color: '#7b3ad5', count: 64, parent: null, artIdx: [9,15,11,3] },
  { id: 'f-watch',  name: 'Watch',      color: '#c43a5a', count: 19, parent: null, artIdx: [6,14,7,19] },
  { id: 'f-cook',   name: 'Recipes',    color: '#2a8a4a', count: 33, parent: null, artIdx: [1,13,17,18] },
  // nested
  { id: 'f-summer', name: 'Summer 2025', color: '#3a7bd5', count: 14, parent: 'f-fav', artIdx: [2,11,8,13] },
  { id: 'f-tokyo',  name: 'Tokyo',       color: '#7b3ad5', count: 8,  parent: 'f-travel', artIdx: [6,9,15,10] },
  { id: 'f-abc',    name: 'Amalfi',      color: '#4a9fd5', count: 6,  parent: 'f-summer', artIdx: [1,8,17,13] },
  { id: 'f-xyz',    name: 'Positano',    color: '#2a8a4a', count: 4,  parent: 'f-summer', artIdx: [3,10,18,16] },
];

// Cards (generate a healthy feed)
function makeCards() {
  const data = [
    { t:'Morning routine triggers', tag:'health',  from:'al', dir:'received' },
    { t:'In Rainbows — 20 years',   tag:'music',   from:'me', dir:'mine', sentTo:['bo'] },
    { t:'BTFD — a retrospective',   tag:'finance', from:'di', dir:'received' },
    { t:'Past Lives',               tag:'film',    from:'ch', dir:'received' },
    { t:'Amalfi restaurants',       tag:'food',    from:'me', dir:'mine', folderId:'f-summer' },
    { t:'Hotel Marincanto',         tag:'travel',  from:'me', dir:'mine', folderId:'f-summer' },
    { t:'Japanese jazz history',    tag:'music',   from:'el', dir:'received' },
    { t:'Obsidian plugin roundup',  tag:'tech',    from:'di', dir:'received' },
    { t:'Fermented foods 101',      tag:'health',  from:'me', dir:'mine' },
    { t:'Criterion Collection sale',tag:'film',    from:'me', dir:'mine', sentTo:['al','ka'] },
    { t:'Best beaches south Italy', tag:'travel',  from:'el', dir:'received' },
    { t:'Rome → Naples by train',   tag:'travel',  from:'me', dir:'mine', folderId:'f-summer' },
    { t:'The Lighthouse (2019)',    tag:'film',    from:'fa', dir:'received' },
    { t:'Neon Genesis Evangelion',  tag:'film',    from:'me', dir:'mine' },
    { t:'Tokyo coffee shops',       tag:'food',    from:'bo', dir:'received', folderId:'f-tokyo' },
    { t:'Figma plugins I love',     tag:'design',  from:'me', dir:'mine' },
    { t:'Kafka on the Shore',       tag:'book',    from:'gi', dir:'received' },
    { t:'Slow burn weekends',       tag:'music',   from:'me', dir:'mine', sentTo:['el'] },
    { t:'Yakushima hiking',         tag:'travel',  from:'hu', dir:'received' },
    { t:'The sourdough bible',      tag:'food',    from:'me', dir:'mine' },
  ];
  return data.map((c, i) => ({
    id: 'c-' + i,
    title: c.t,
    tag: c.tag,
    from: c.from,
    dir: c.dir,
    sentTo: c.sentTo || [],
    folderId: c.folderId || null,
    art: ART[i % ART.length],
    type: i % 3 === 0 ? 'video' : (i % 4 === 0 ? 'article' : 'link'),
    source: ['youtube.com','nytimes.com','substack.com','spotify.com','vimeo.com','arxiv.org'][i % 6],
    createdDaysAgo: i + Math.floor(Math.random()*3),
    rating: (i % 4 === 0) ? 5 : (i % 3 === 0 ? 4 : (i % 5 === 0 ? 3 : 0)),
  }));
}

const CARDS = makeCards();

Object.assign(window, { ART, TAGS, FRIENDS, GROUPS, FOLDERS, CARDS });
