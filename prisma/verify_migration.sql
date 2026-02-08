-- Verification Script: Check all new tables and columns
-- Run this in your PostgreSQL client to verify the migration

-- Check if new enum type was created
SELECT typname FROM pg_type WHERE typname = 'ProcessingStatus';

-- Check files table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'files' 
ORDER BY ordinal_position;

-- Check file_processing_jobs table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'file_processing_jobs' 
ORDER BY ordinal_position;

-- Check document_chunks table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'document_chunks' 
ORDER BY ordinal_position;

-- Check vector_embeddings table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'vector_embeddings' 
ORDER BY ordinal_position;

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verify existing files still exist
SELECT id, filename, "processingStatus", "createdAt", "updatedAt" 
FROM files;
