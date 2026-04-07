
-- Allow admins to insert profiles for other users (e.g. virtual executivos/SDRs)
CREATE POLICY "profiles_admin_insert" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete profiles
CREATE POLICY "profiles_admin_delete" ON public.profiles
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update any profile
CREATE POLICY "profiles_admin_update" ON public.profiles
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
