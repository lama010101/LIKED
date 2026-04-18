-- ============================================================
-- LIKED Seed Data
-- 12 users, 20 nodes, 4 groups, 10 folders, 12 tags
-- NO edges or causes — nodes are private by default
-- ============================================================

-- ============================================================
-- 12 Demo Users
-- ============================================================
INSERT INTO users (id, display_name, normalized_display_name, language_code, avatar_key, avatar_change_count_today, created_at) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Alice Chen',     'alice chen',     'en', NULL, 0, now() - interval '30 days'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid, 'Bob Martinez',   'bob martinez',   'en', NULL, 0, now() - interval '28 days'),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid, 'Carol Williams', 'carol williams', 'en', NULL, 0, now() - interval '25 days'),
  ('d4e5f6a7-b8c9-0123-defa-234567890123'::uuid, 'David Kim',      'david kim',      'en', NULL, 0, now() - interval '22 days'),
  ('e5f6a7b8-c9d0-1234-efab-345678901234'::uuid, 'Emma Thompson',  'emma thompson',  'en', NULL, 0, now() - interval '20 days'),
  ('f6a7b8c9-d0e1-2345-fabc-456789012345'::uuid, 'Frank Liu',      'frank liu',      'en', NULL, 0, now() - interval '18 days'),
  ('a7b8c9d0-e1f2-3456-abcd-567890123456'::uuid, 'Grace Park',     'grace park',     'en', NULL, 0, now() - interval '15 days'),
  ('b8c9d0e1-f2a3-4567-bcde-678901234567'::uuid, 'Henry Wilson',   'henry wilson',   'en', NULL, 0, now() - interval '12 days'),
  ('c9d0e1f2-a3b4-5678-cdef-789012345678'::uuid, 'Ivy Rodriguez',  'ivy rodriguez',  'en', NULL, 0, now() - interval '10 days'),
  ('d0e1f2a3-b4c5-6789-defa-890123456789'::uuid, 'Jack Taylor',    'jack taylor',    'en', NULL, 0, now() - interval '8 days'),
  ('e1f2a3b4-c5d6-7890-efab-901234567890'::uuid, 'Karen Anderson', 'karen anderson', 'en', NULL, 0, now() - interval '5 days'),
  ('f2a3b4c5-d6e7-8901-fabc-012345678901'::uuid, 'Leo Brown',      'leo brown',      'en', NULL, 0, now() - interval '3 days');

-- ============================================================
-- 20 Demo Nodes
-- ============================================================
INSERT INTO nodes (id, url, text_content, title, thumbnail_key, owner_id, language_code, origin_user_id, origin_created_at, deleted_at, created_at) VALUES
  ('10000000-0000-0000-0000-000000000001'::uuid, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, 'Never Gonna Give You Up',       NULL, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'en', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, now() - interval '20 days', NULL, now() - interval '20 days'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'https://www.youtube.com/watch?v=9bZkp7q19f0', NULL, 'Gangnam Style',                 NULL, 'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid, 'en', 'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid, now() - interval '19 days', NULL, now() - interval '19 days'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'https://www.youtube.com/watch?v=kJQP7kiw5Fk', NULL, 'Despacito',                     NULL, 'c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid, 'en', 'c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid, now() - interval '18 days', NULL, now() - interval '18 days'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', NULL, 'Bohemian Rhapsody', NULL, 'd4e5f6a7-b8c9-0123-defa-234567890123'::uuid, 'en', 'd4e5f6a7-b8c9-0123-defa-234567890123'::uuid, now() - interval '17 days', NULL, now() - interval '17 days'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'https://open.spotify.com/album/6DEjYFkNZh67HP7R9PSZvv', NULL, 'Rumours - Fleetwood Mac', NULL, 'e5f6a7b8-c9d0-1234-efab-345678901234'::uuid, 'en', 'e5f6a7b8-c9d0-1234-efab-345678901234'::uuid, now() - interval '16 days', NULL, now() - interval '16 days'),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'https://www.nytimes.com/2024/01/15/technology/ai-future.html', NULL, 'The Future of AI - NYT', NULL, 'f6a7b8c9-d0e1-2345-fabc-456789012345'::uuid, 'en', 'f6a7b8c9-d0e1-2345-fabc-456789012345'::uuid, now() - interval '15 days', NULL, now() - interval '15 days'),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'https://www.theguardian.com/science/2024/jan/20/space-exploration', NULL, 'Space Exploration in 2024', NULL, 'a7b8c9d0-e1f2-3456-abcd-567890123456'::uuid, 'en', 'a7b8c9d0-e1f2-3456-abcd-567890123456'::uuid, now() - interval '14 days', NULL, now() - interval '14 days'),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'https://arstechnica.com/gadgets/2024/01/review-latest-smartphone/', NULL, 'Latest Smartphone Review', NULL, 'b8c9d0e1-f2a3-4567-bcde-678901234567'::uuid, 'en', 'b8c9d0e1-f2a3-4567-bcde-678901234567'::uuid, now() - interval '13 days', NULL, now() - interval '13 days'),
  ('10000000-0000-0000-0000-000000000009'::uuid, NULL, 'Recipe: 2 1/4 cups flour, 1 cup butter, 3/4 cup sugar, 2 eggs, 2 cups chocolate chips. Bake 375F 12 min.', 'Cookie Recipe', NULL, 'c9d0e1f2-a3b4-5678-cdef-789012345678'::uuid, 'en', 'c9d0e1f2-a3b4-5678-cdef-789012345678'::uuid, now() - interval '12 days', NULL, now() - interval '12 days'),
  ('10000000-0000-0000-0000-000000000010'::uuid, NULL, 'Book: The Midnight Library by Matt Haig. About regrets and second chances. Highly recommended.', 'Book Review: Midnight Library', NULL, 'd0e1f2a3-b4c5-6789-defa-890123456789'::uuid, 'en', 'd0e1f2a3-b4c5-6789-defa-890123456789'::uuid, now() - interval '11 days', NULL, now() - interval '11 days'),
  ('10000000-0000-0000-0000-000000000011'::uuid, NULL, 'Idea: Platform connecting remote workers with cafes that have great WiFi. Membership model.', 'Remote Work Cafe Platform', NULL, 'e1f2a3b4-c5d6-7890-efab-901234567890'::uuid, 'en', 'e1f2a3b4-c5d6-7890-efab-901234567890'::uuid, now() - interval '10 days', NULL, now() - interval '10 days'),
  ('10000000-0000-0000-0000-000000000012'::uuid, 'https://github.com/facebook/react', NULL, 'React GitHub Repository',              NULL, 'f2a3b4c5-d6e7-8901-fabc-012345678901'::uuid, 'en', 'f2a3b4c5-d6e7-8901-fabc-012345678901'::uuid, now() - interval '9 days',  NULL, now() - interval '9 days'),
  ('10000000-0000-0000-0000-000000000013'::uuid, 'https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action', NULL, 'TED: Start with Why', NULL, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'en', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, now() - interval '8 days',  NULL, now() - interval '8 days'),
  ('10000000-0000-0000-0000-000000000014'::uuid, 'https://www.notion.so/templates', NULL, 'Notion Templates Gallery',             NULL, 'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid, 'en', 'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid, now() - interval '7 days',  NULL, now() - interval '7 days'),
  ('10000000-0000-0000-0000-000000000015'::uuid, NULL, 'Japan itinerary: Tokyo (3d) -> Kyoto (2d) -> Osaka (2d). Budget ~$2000pp.', 'Japan Trip Notes',                    NULL, 'c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid, 'en', 'c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid, now() - interval '6 days',  NULL, now() - interval '6 days'),
  ('10000000-0000-0000-0000-000000000016'::uuid, NULL, 'Q1 review: 85% done. 3 engineers approved. Next all-hands Thursday.', 'Product Team Meeting Notes',          NULL, 'd4e5f6a7-b8c9-0123-defa-234567890123'::uuid, 'en', 'd4e5f6a7-b8c9-0123-defa-234567890123'::uuid, now() - interval '5 days',  NULL, now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000017'::uuid, NULL, 'Podcasts: Lex Fridman x Sam Altman, How I Built This Airbnb, Tim Ferriss x Naval.', 'Podcast Picks',          NULL, 'e5f6a7b8-c9d0-1234-efab-345678901234'::uuid, 'en', 'e5f6a7b8-c9d0-1234-efab-345678901234'::uuid, now() - interval '4 days',  NULL, now() - interval '4 days'),
  ('10000000-0000-0000-0000-000000000018'::uuid, 'https://www.figma.com/community', NULL, 'Figma Community Resources',            NULL, 'f6a7b8c9-d0e1-2345-fabc-456789012345'::uuid, 'en', 'f6a7b8c9-d0e1-2345-fabc-456789012345'::uuid, now() - interval '3 days',  NULL, now() - interval '3 days'),
  ('10000000-0000-0000-0000-000000000019'::uuid, NULL, 'useEffect cleanup: return () => subscription.unsubscribe(); inside useEffect.', 'React useEffect Pattern',    NULL, 'a7b8c9d0-e1f2-3456-abcd-567890123456'::uuid, 'en', 'a7b8c9d0-e1f2-3456-abcd-567890123456'::uuid, now() - interval '2 days',  NULL, now() - interval '2 days'),
  ('10000000-0000-0000-0000-000000000020'::uuid, 'https://www.coursera.org/learn/machine-learning', NULL, 'Coursera ML Course',  NULL, 'b8c9d0e1-f2a3-4567-bcde-678901234567'::uuid, 'en', 'b8c9d0e1-f2a3-4567-bcde-678901234567'::uuid, now() - interval '1 day',   NULL, now() - interval '1 day');

-- ============================================================
-- nodes_sort_cache
-- ============================================================
INSERT INTO nodes_sort_cache (node_id, avg_rating, view_count, share_count, updated_at) VALUES
  ('10000000-0000-0000-0000-000000000001'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000002'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000003'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000004'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000005'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000006'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000007'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000008'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000009'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000010'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000011'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000012'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000013'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000014'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000015'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000016'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000017'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000018'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000019'::uuid, NULL, 0, 0, now()),
  ('10000000-0000-0000-0000-000000000020'::uuid, NULL, 0, 0, now());

-- ============================================================
-- 4 Groups
-- ============================================================
INSERT INTO groups (id, name, owner_id, deleted_at, created_at) VALUES
  ('20000000-0000-0000-0000-000000000001'::uuid, 'Music Lovers',   'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, NULL, now() - interval '15 days'),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'Tech Talk',      'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid, NULL, now() - interval '12 days'),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'Recipe Club',    'c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid, NULL, now() - interval '10 days'),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'Travel Buddies', 'd4e5f6a7-b8c9-0123-defa-234567890123'::uuid, NULL, now() - interval '8 days');

-- Group members
INSERT INTO group_members (group_id, user_id) VALUES
  ('20000000-0000-0000-0000-000000000001'::uuid, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid),
  ('20000000-0000-0000-0000-000000000001'::uuid, 'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid),
  ('20000000-0000-0000-0000-000000000001'::uuid, 'c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid),
  ('20000000-0000-0000-0000-000000000001'::uuid, 'd4e5f6a7-b8c9-0123-defa-234567890123'::uuid),
  ('20000000-0000-0000-0000-000000000001'::uuid, 'e5f6a7b8-c9d0-1234-efab-345678901234'::uuid),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'f6a7b8c9-d0e1-2345-fabc-456789012345'::uuid),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'a7b8c9d0-e1f2-3456-abcd-567890123456'::uuid),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'e1f2a3b4-c5d6-7890-efab-901234567890'::uuid),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'b8c9d0e1-f2a3-4567-bcde-678901234567'::uuid),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'c9d0e1f2-a3b4-5678-cdef-789012345678'::uuid),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'd4e5f6a7-b8c9-0123-defa-234567890123'::uuid),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'd0e1f2a3-b4c5-6789-defa-890123456789'::uuid),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'f2a3b4c5-d6e7-8901-fabc-012345678901'::uuid),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid);

-- ============================================================
-- 10 Folders (5 top-level + 5 nested)
-- ============================================================
INSERT INTO folders (id, name, owner_id, parent_folder_id, deleted_at, created_at) VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid, 'Work',         'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, NULL,                                            NULL, now() - interval '20 days'),
  ('30000000-0000-0000-0000-000000000002'::uuid, 'Personal',     'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid, NULL,                                            NULL, now() - interval '18 days'),
  ('30000000-0000-0000-0000-000000000003'::uuid, 'Music',        'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, NULL,                                            NULL, now() - interval '15 days'),
  ('30000000-0000-0000-0000-000000000004'::uuid, 'Reading',      'c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid, NULL,                                            NULL, now() - interval '14 days'),
  ('30000000-0000-0000-0000-000000000005'::uuid, 'Travel Plans', 'd4e5f6a7-b8c9-0123-defa-234567890123'::uuid, NULL,                                            NULL, now() - interval '12 days'),
  ('30000000-0000-0000-0000-000000000006'::uuid, 'Projects',     'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, '30000000-0000-0000-0000-000000000001'::uuid,  NULL, now() - interval '16 days'),
  ('30000000-0000-0000-0000-000000000007'::uuid, 'Meeting Notes','a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, '30000000-0000-0000-0000-000000000001'::uuid,  NULL, now() - interval '10 days'),
  ('30000000-0000-0000-0000-000000000008'::uuid, 'Favorites',    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, '30000000-0000-0000-0000-000000000003'::uuid,  NULL, now() - interval '12 days'),
  ('30000000-0000-0000-0000-000000000009'::uuid, 'To Read',      'c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid, '30000000-0000-0000-0000-000000000004'::uuid,  NULL, now() - interval '10 days'),
  ('30000000-0000-0000-0000-000000000010'::uuid, 'Asia 2024',    'd4e5f6a7-b8c9-0123-defa-234567890123'::uuid, '30000000-0000-0000-0000-000000000005'::uuid,  NULL, now() - interval '8 days');

-- Folder tree entries (self-reference depth 0 + parent ancestry depth 1)
INSERT INTO folder_tree (folder_id, ancestor_id, depth) VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 0),
  ('30000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000002'::uuid, 0),
  ('30000000-0000-0000-0000-000000000003'::uuid, '30000000-0000-0000-0000-000000000003'::uuid, 0),
  ('30000000-0000-0000-0000-000000000004'::uuid, '30000000-0000-0000-0000-000000000004'::uuid, 0),
  ('30000000-0000-0000-0000-000000000005'::uuid, '30000000-0000-0000-0000-000000000005'::uuid, 0),
  ('30000000-0000-0000-0000-000000000006'::uuid, '30000000-0000-0000-0000-000000000006'::uuid, 0),
  ('30000000-0000-0000-0000-000000000006'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 1),
  ('30000000-0000-0000-0000-000000000007'::uuid, '30000000-0000-0000-0000-000000000007'::uuid, 0),
  ('30000000-0000-0000-0000-000000000007'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 1),
  ('30000000-0000-0000-0000-000000000008'::uuid, '30000000-0000-0000-0000-000000000008'::uuid, 0),
  ('30000000-0000-0000-0000-000000000008'::uuid, '30000000-0000-0000-0000-000000000003'::uuid, 1),
  ('30000000-0000-0000-0000-000000000009'::uuid, '30000000-0000-0000-0000-000000000009'::uuid, 0),
  ('30000000-0000-0000-0000-000000000009'::uuid, '30000000-0000-0000-0000-000000000004'::uuid, 1),
  ('30000000-0000-0000-0000-000000000010'::uuid, '30000000-0000-0000-0000-000000000010'::uuid, 0),
  ('30000000-0000-0000-0000-000000000010'::uuid, '30000000-0000-0000-0000-000000000005'::uuid, 1);

-- ============================================================
-- 12 Tags
-- ============================================================
INSERT INTO tags (id, color_hex, created_at) VALUES
  ('40000000-0000-0000-0000-000000000001'::uuid, '#ef4444', now()),
  ('40000000-0000-0000-0000-000000000002'::uuid, '#f97316', now()),
  ('40000000-0000-0000-0000-000000000003'::uuid, '#f59e0b', now()),
  ('40000000-0000-0000-0000-000000000004'::uuid, '#22c55e', now()),
  ('40000000-0000-0000-0000-000000000005'::uuid, '#3b82f6', now()),
  ('40000000-0000-0000-0000-000000000006'::uuid, '#8b5cf6', now()),
  ('40000000-0000-0000-0000-000000000007'::uuid, '#ec4899', now()),
  ('40000000-0000-0000-0000-000000000008'::uuid, '#06b6d4', now()),
  ('40000000-0000-0000-0000-000000000009'::uuid, '#84cc16', now()),
  ('40000000-0000-0000-0000-000000000010'::uuid, '#a855f7', now()),
  ('40000000-0000-0000-0000-000000000011'::uuid, '#f43f5e', now()),
  ('40000000-0000-0000-0000-000000000012'::uuid, '#64748b', now());

-- Tag translations
INSERT INTO tag_translations (id, tag_id, language_code, label, created_at) VALUES
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000001'::uuid, 'en', 'Music',     now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000002'::uuid, 'en', 'Video',     now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000003'::uuid, 'en', 'Recipe',    now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000004'::uuid, 'en', 'Work',      now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000005'::uuid, 'en', 'Reading',   now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000006'::uuid, 'en', 'Tech',      now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000007'::uuid, 'en', 'Travel',    now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000008'::uuid, 'en', 'Design',    now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000009'::uuid, 'en', 'Health',    now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000010'::uuid, 'en', 'Ideas',     now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000011'::uuid, 'en', 'Personal',  now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000012'::uuid, 'en', 'Reference', now());

-- Tag edges (2 tags per node)
INSERT INTO tag_edges (id, tag_id, node_id, folder_id, created_at) VALUES
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000012'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000005'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000012'::uuid, '10000000-0000-0000-0000-000000000005'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000006'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000012'::uuid, '10000000-0000-0000-0000-000000000006'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000007'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000007'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000008'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000008'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000009'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000011'::uuid, '10000000-0000-0000-0000-000000000009'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000010'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000011'::uuid, '10000000-0000-0000-0000-000000000010'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000010'::uuid, '10000000-0000-0000-0000-000000000011'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000011'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000012'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000012'::uuid, '10000000-0000-0000-0000-000000000012'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000010'::uuid, '10000000-0000-0000-0000-000000000013'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000013'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000008'::uuid, '10000000-0000-0000-0000-000000000014'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000014'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000007'::uuid, '10000000-0000-0000-0000-000000000015'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000011'::uuid, '10000000-0000-0000-0000-000000000015'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000016'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000012'::uuid, '10000000-0000-0000-0000-000000000016'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000017'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000011'::uuid, '10000000-0000-0000-0000-000000000017'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000008'::uuid, '10000000-0000-0000-0000-000000000018'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000012'::uuid, '10000000-0000-0000-0000-000000000018'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000019'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000012'::uuid, '10000000-0000-0000-0000-000000000019'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000020'::uuid, NULL, now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000012'::uuid, '10000000-0000-0000-0000-000000000020'::uuid, NULL, now());

-- ============================================================
-- NO EDGES OR CAUSES - nodes are private by default
-- ============================================================
