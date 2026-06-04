#!/bin/bash
# Script untuk cek media yang sudah di-grab

export DATABASE_URL=postgresql://postgres@localhost:5433/x_automation
export PATH="/tmp/pgsql/bin:$PATH"

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                    CEK MEDIA YANG SUDAH DI-GRAB                      ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

echo "=== Total Media ==="
psql -p 5433 -U postgres -d x_automation -c "
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videos,
  SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as images
FROM media;
"

echo ""
echo "=== Status Upload DoodStream ==="
psql -p 5433 -U postgres -d x_automation -c "
SELECT 
  dood_status,
  COUNT(*) as count
FROM media 
WHERE type = 'video'
GROUP BY dood_status;
"

echo ""
echo "=== 10 Video Terbaru ==="
psql -p 5433 -U postgres -d x_automation -c "
SELECT 
  id,
  LEFT(original_url, 50) as url,
  dood_status,
  CASE 
    WHEN dood_url IS NOT NULL THEN LEFT(dood_url, 40)
    ELSE 'Not uploaded'
  END as dood_url,
  created_at
FROM media 
WHERE type = 'video'
ORDER BY created_at DESC 
LIMIT 10;
"

echo ""
echo "=== Video dari sjicedrive.com ==="
psql -p 5433 -U postgres -d x_automation -c "
SELECT 
  id,
  original_url,
  dood_status,
  dood_url
FROM media 
WHERE original_url LIKE '%sjicedrive.com%'
ORDER BY created_at DESC;
"
