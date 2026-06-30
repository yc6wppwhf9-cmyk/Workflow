-- Move Shriya Kulkarni from the Design team to the Sampling team.
-- Run on production DB (project unuggtqicilzzzxxtizd).
UPDATE profiles
SET role = 'sampling'
WHERE email = 'shriya.kulkarni@hscvpl.com';

-- Lokesh (Fitting) and Ajeet (Digital Print) are NEW accounts.
-- Create them via Admin → Users (role = Sampling) once their real @hscvpl.com
-- emails are known, or fill the placeholders in src/app/api/seed-users/route.ts.
