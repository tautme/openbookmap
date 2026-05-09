-- spine-vision dataset export.
--
-- Run against the OpenBookMap Supabase Postgres:
--   psql "$SUPABASE_DB_URL" -f export.sql > raw.csv
--
-- Outputs CSV with one row per photo that has at least one
-- human-confirmed book title attached. Columns:
--
--   photo_id        UUID of the photo
--   storage_path    Path inside the `shelf-photos` bucket
--   thumb_path      Path of the small thumbnail (may be NULL)
--   book_titles     JSON array of confirmed titles
--   book_authors    JSON array of authors (parallel to titles, may be NULL)
--   raw_ocr_text    The original OCR text from when the photo was
--                   uploaded; useful for debugging title parsing.
--
-- We deliberately do NOT export uploader_id — contributors should not
-- be identifiable in the training set. The shop is included only as
-- a context aid for ambiguous spines (e.g. a Penguin Classic in a
-- French shop is more likely a French translation).

\copy (
  SELECT
    p.id::text                                    AS photo_id,
    p.storage_path,
    p.thumb_path,
    COALESCE(
      json_agg(b.title ORDER BY b.created_at)
        FILTER (WHERE b.confirmed = true AND b.title IS NOT NULL),
      '[]'::json
    )                                             AS book_titles,
    COALESCE(
      json_agg(b.author ORDER BY b.created_at)
        FILTER (WHERE b.confirmed = true),
      '[]'::json
    )                                             AS book_authors,
    MAX(b.raw_ocr_text)                           AS raw_ocr_text,
    s.country
  FROM public.photos p
  JOIN public.books b      ON b.photo_id = p.id
  JOIN public.shops s      ON s.id       = p.shop_id
  WHERE b.confirmed = true
  GROUP BY p.id, p.storage_path, p.thumb_path, s.country
  HAVING COUNT(b.id) >= 1
) TO STDOUT WITH CSV HEADER;
