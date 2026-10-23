-- 037: a B-roll category in Assets (Tait, 2026-10-23: "add another category
-- in assets called B-roll. I may drop in downloaded Broll clips from youtube
-- etc that can be added to videos."). Safe to re-run. Run after 036.

alter table social_style_assets drop constraint if exists social_style_assets_kind_check;
alter table social_style_assets add constraint social_style_assets_kind_check
  check (kind in ('music', 'sfx', 'lut', 'motion', 'font', 'broll', 'caption_line', 'video_type'));
