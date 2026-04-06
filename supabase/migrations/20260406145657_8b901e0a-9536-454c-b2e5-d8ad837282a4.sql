
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'vendedor');

-- Create teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  team_id UUID REFERENCES public.teams(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'vendedor',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper to get user's team_id
CREATE OR REPLACE FUNCTION public.get_user_team_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.profiles WHERE user_id = _user_id
$$;

-- Create meetings table
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  lead_name TEXT,
  lead_email TEXT,
  lead_company TEXT,
  team_id UUID REFERENCES public.teams(id),
  status TEXT NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'transcrevendo', 'analisando', 'completo', 'erro')),
  file_url TEXT,
  file_type TEXT,
  youtube_url TEXT,
  duration_seconds INTEGER,
  overall_score NUMERIC(5,2),
  temperature TEXT CHECK (temperature IN ('frio', 'morno', 'quente')),
  meeting_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Create transcriptions table
CREATE TABLE public.transcriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  full_text TEXT NOT NULL,
  speakers JSONB,
  language TEXT DEFAULT 'pt-BR',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.transcriptions ENABLE ROW LEVEL SECURITY;

-- Create analysis_results table
CREATE TABLE public.analysis_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  overall_score NUMERIC(5,2),
  temperature TEXT CHECK (temperature IN ('frio', 'morno', 'quente')),
  bant_score JSONB,
  meddic_score JSONB,
  spin_score JSONB,
  talk_ratio JSONB,
  conversation_metrics JSONB,
  insights JSONB,
  sales_coach JSONB,
  rag_results JSONB,
  raw_analysis JSONB,
  model_used TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;

-- Create highlights table
CREATE TABLE public.highlights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  highlight_type TEXT NOT NULL CHECK (highlight_type IN ('objecao', 'sinal_compra', 'interesse', 'momento_chave')),
  text TEXT NOT NULL,
  timestamp_start INTEGER,
  timestamp_end INTEGER,
  speaker TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

-- Create knowledge_documents table
CREATE TABLE public.knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('pdf', 'doc', 'link')),
  file_url TEXT,
  category TEXT,
  extracted_content TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Create knowledge_items table
CREATE TABLE public.knowledge_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('produto', 'servico', 'case')),
  description TEXT,
  category TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;

-- Create api_usage_logs table
CREATE TABLE public.api_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  meeting_id UUID REFERENCES public.meetings(id),
  model_used TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost NUMERIC(10,6) DEFAULT 0,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('transcricao', 'analise', 'embedding', 'rag')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Create storage bucket for meeting files
INSERT INTO storage.buckets (id, name, public) VALUES ('meeting-files', 'meeting-files', false);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_knowledge_documents_updated_at BEFORE UPDATE ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_knowledge_items_updated_at BEFORE UPDATE ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile and role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'vendedor');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- Teams: all authenticated can view, admins can manage
CREATE POLICY "teams_select" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_admin_insert" ON public.teams FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "teams_admin_update" ON public.teams FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "teams_admin_delete" ON public.teams FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profiles: all authenticated can view, users can update own
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles: viewable by admins, own role viewable by user
CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_update" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Meetings: seller sees own, gestor sees team, admin sees all
CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated
USING (
  seller_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'gestor') AND team_id = public.get_user_team_id(auth.uid()))
);
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated
WITH CHECK (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated
USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated
USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Transcriptions: follow meeting access
CREATE POLICY "transcriptions_select" ON public.transcriptions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'gestor') AND m.team_id = public.get_user_team_id(auth.uid())))));
CREATE POLICY "transcriptions_insert" ON public.transcriptions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Analysis results: follow meeting access
CREATE POLICY "analysis_select" ON public.analysis_results FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'gestor') AND m.team_id = public.get_user_team_id(auth.uid())))));
CREATE POLICY "analysis_insert" ON public.analysis_results FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Highlights: follow meeting access
CREATE POLICY "highlights_select" ON public.highlights FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'gestor') AND m.team_id = public.get_user_team_id(auth.uid())))));
CREATE POLICY "highlights_insert" ON public.highlights FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Knowledge: all authenticated can view, admins can manage
CREATE POLICY "knowledge_docs_select" ON public.knowledge_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "knowledge_docs_admin_insert" ON public.knowledge_documents FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "knowledge_docs_admin_update" ON public.knowledge_documents FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "knowledge_docs_admin_delete" ON public.knowledge_documents FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "knowledge_items_select" ON public.knowledge_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "knowledge_items_admin_insert" ON public.knowledge_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "knowledge_items_admin_update" ON public.knowledge_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "knowledge_items_admin_delete" ON public.knowledge_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- API usage logs: own or admin
CREATE POLICY "api_logs_select" ON public.api_usage_logs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "api_logs_insert" ON public.api_usage_logs FOR INSERT TO authenticated
WITH CHECK (true);

-- Storage policies for meeting-files bucket
CREATE POLICY "meeting_files_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'meeting-files');
CREATE POLICY "meeting_files_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'meeting-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "meeting_files_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'meeting-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "meeting_files_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'meeting-files' AND auth.uid()::text = (storage.foldername(name))[1]);
