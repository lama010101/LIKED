-- ============================================================
-- Migration 059 — P11-T02: Seed translations for multilingual testing
-- ============================================================
--
-- Adds French and Thai translations for 5 seed nodes to test the
-- PRD §33.3 deterministic fallback chain.
--
-- Fallback chain: user language → node language → nodes.title
-- With these seeds, a French user sees French titles for these 5 nodes;
-- a Thai user sees Thai titles; all others fall back to nodes.title.

INSERT INTO translations (id, node_id, language_code, title, description, created_at)
VALUES
  -- French translations
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'fr', 'Never Gonna Give You Up', 'Le classique de Rick Astley', now()),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'fr', 'Style de Gangnam', 'Le phénomène viral de PSY', now()),
  ('a0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'fr', 'Despacito', 'Le hit latin de Luis Fonsi', now()),
  ('a0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'fr', 'Bohemian Rhapsody', 'Le chef-d''œuvre de Queen', now()),
  ('a0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'fr', 'Rumours - Fleetwood Mac', 'L''album légendaire', now()),

  -- Thai translations
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'th', 'เนเวอร์กอนนากิฟยูอัพ', 'เพลงคลาสสิกของริก แอสลีย์', now()),
  ('b0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'th', 'คังนัมสไตล์', 'ไวรัลฮิตของ PSY', now()),
  ('b0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'th', 'เดสปาซีโต', 'เพลงละตินฮิตของลุยส์ ฟอนซี', now()),
  ('b0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'th', 'โบฮีเมียนแร็ปโซดี', 'ผลงานชิ้นเอกของควีน', now()),
  ('b0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'th', 'รูเมอร์ส - ฟลีตวูด แมค', 'อัลบั้มตำนาน', now())

ON CONFLICT (node_id, language_code) DO NOTHING;
