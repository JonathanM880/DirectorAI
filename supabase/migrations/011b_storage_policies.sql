-- Migration: 011_storage_policies
-- Purpose: Allow authenticated users to upload and read their own files in the assets bucket.

-- Enable RLS on storage.objects just in case it isn't
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow users to upload files to their own folder (folder name = user_id)
CREATE POLICY "Allow users to upload files to their own folder" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view/download files in their own folder
CREATE POLICY "Allow users to view own files" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (
  bucket_id = 'assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own files
CREATE POLICY "Allow users to update own files" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (
  bucket_id = 'assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Allow users to delete own files" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (
  bucket_id = 'assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
