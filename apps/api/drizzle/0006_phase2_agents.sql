-- Migration: Add tables for Phase 2 agents (content-writer, technical-auditor, competitor-monitor)
-- Created: 2026-02-16

-- Content drafts from content-writer agent
CREATE TABLE IF NOT EXISTS content_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Content metadata
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  meta_description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'published')),
  
  -- Content structure
  outline JSONB, -- Array of section titles
  sections JSONB NOT NULL, -- Array of {title, content, wordCount}
  
  -- SEO metrics
  total_word_count INTEGER NOT NULL DEFAULT 0,
  primary_keyword TEXT,
  secondary_keywords TEXT[],
  seo_score INTEGER CHECK (seo_score >= 0 AND seo_score <= 100),
  readability_score INTEGER CHECK (readability_score >= 0 AND readability_score <= 100),
  
  -- Publishing metadata
  cms_platform TEXT, -- 'wordpress', 'shopify', etc.
  cms_post_id TEXT, -- External CMS ID after publishing
  published_url TEXT,
  published_at TIMESTAMPTZ,
  
  -- Review workflow
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_drafts_project ON content_drafts(project_id);
CREATE INDEX idx_content_drafts_status ON content_drafts(status);
CREATE INDEX idx_content_drafts_created ON content_drafts(created_at DESC);

-- RLS policy for content_drafts
ALTER TABLE content_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_drafts_isolation ON content_drafts
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- Technical audit results from technical-auditor agent
CREATE TABLE IF NOT EXISTS audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  url TEXT NOT NULL,
  audited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Lighthouse scores
  lighthouse_performance INTEGER CHECK (lighthouse_performance >= 0 AND lighthouse_performance <= 100),
  lighthouse_seo INTEGER CHECK (lighthouse_seo >= 0 AND lighthouse_seo <= 100),
  lighthouse_accessibility INTEGER CHECK (lighthouse_accessibility >= 0 AND lighthouse_accessibility <= 100),
  lighthouse_best_practices INTEGER CHECK (lighthouse_best_practices >= 0 AND lighthouse_best_practices <= 100),
  
  -- Core Web Vitals
  lcp_ms INTEGER, -- Largest Contentful Paint (milliseconds)
  fid_ms INTEGER, -- First Input Delay (milliseconds)
  cls_score NUMERIC(5, 3), -- Cumulative Layout Shift (0-1 range)
  
  -- Issues detected (JSONB array)
  issues JSONB NOT NULL DEFAULT '[]', -- Array of {severity, category, title, description, recommendation}
  broken_links TEXT[] DEFAULT '{}',
  missing_meta_tags TEXT[] DEFAULT '{}',
  mobile_issues TEXT[] DEFAULT '{}',
  
  -- Summary statistics
  total_issues INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  info_count INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_results_project ON audit_results(project_id);
CREATE INDEX idx_audit_results_url ON audit_results(url);
CREATE INDEX idx_audit_results_audited ON audit_results(audited_at DESC);
CREATE INDEX idx_audit_results_critical ON audit_results(critical_count DESC) WHERE critical_count > 0;

-- RLS policy for audit_results
ALTER TABLE audit_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_results_isolation ON audit_results
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- Competitor analysis results from competitor-monitor agent
CREATE TABLE IF NOT EXISTS competitor_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  competitor_domain TEXT NOT NULL,
  own_domain TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Analysis data (JSONB for flexibility)
  keyword_gaps JSONB, -- Array of {keyword, competitorRank, ownRank, searchVolume, difficulty, opportunity}
  backlink_gaps JSONB, -- Array of {domain, domainRating, linkType, competitorHas, ownHas}
  content_analysis JSONB, -- Array of {url, title, wordCount, keywords, topics, contentType}
  traffic_estimate JSONB, -- {organicTraffic, paidTraffic, topPages}
  
  -- Recommendations (JSONB array)
  recommendations JSONB NOT NULL DEFAULT '[]', -- Array of {category, priority, title, description, actionItems}
  
  -- Summary statistics
  total_keyword_gaps INTEGER NOT NULL DEFAULT 0,
  high_opportunity_keywords INTEGER NOT NULL DEFAULT 0,
  backlink_gaps_count INTEGER NOT NULL DEFAULT 0,
  competitor_content_pieces INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitor_analyses_project ON competitor_analyses(project_id);
CREATE INDEX idx_competitor_analyses_competitor ON competitor_analyses(competitor_domain);
CREATE INDEX idx_competitor_analyses_analyzed ON competitor_analyses(analyzed_at DESC);

-- RLS policy for competitor_analyses
ALTER TABLE competitor_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY competitor_analyses_isolation ON competitor_analyses
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- Update timestamp trigger for content_drafts
CREATE OR REPLACE FUNCTION update_content_drafts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_drafts_updated_at
  BEFORE UPDATE ON content_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_content_drafts_timestamp();
