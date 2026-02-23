-- Add notes column to parts table for production memos (한글 메모)
-- Run this in Supabase SQL Editor
ALTER TABLE parts ADD COLUMN IF NOT EXISTS notes TEXT;
