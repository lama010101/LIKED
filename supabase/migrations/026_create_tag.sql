create or replace function create_tag_with_translation(
  p_color text,
  p_label text,
  p_lang text
)
returns uuid
language plpgsql
as $$
declare v_tag_id uuid;
begin
  insert into tags (color_hex)
  values (p_color)
  returning id into v_tag_id;

  insert into tag_translations (tag_id, language_code, label)
  values (v_tag_id, p_lang, p_label);

  return v_tag_id;
end;
$$;
