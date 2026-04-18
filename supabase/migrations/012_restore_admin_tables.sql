CREATE TABLE IF NOT EXISTS folder_admins (
  folder_id   UUID NOT NULL REFERENCES folders(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  granted_by  UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(folder_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_admins (
  group_id    UUID NOT NULL REFERENCES groups(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  granted_by  UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(group_id, user_id)
);

ALTER TABLE folder_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folder_admins_select_authenticated" ON folder_admins FOR SELECT TO authenticated USING (true);
CREATE POLICY "group_admins_select_authenticated" ON group_admins FOR SELECT TO authenticated USING (true);
