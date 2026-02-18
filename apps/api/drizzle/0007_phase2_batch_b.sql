-- Migration: Phase 2 Batch B Agents
-- Adds tables for backlink-builder, report-generator, and schema-agent

-- =============================================
-- 1. backlink_opportunities table (backlink-builder agent)
-- =============================================
CREATE TABLE IF NOT EXISTS backlink_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Opportunity details
  opportunity_id VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('link_intersect', 'broken_link', 'guest_post', 'resource_page', 'unlinked_mention')),
  target_domain VARCHAR(255) NOT NULL,
  target_url TEXT NOT NULL,
  
  -- Metrics
  domain_rating INTEGER CHECK (domain_rating >= 0 AND domain_rating <= 100),
  referring_domains INTEGER DEFAULT 0,
  organic_traffic INTEGER DEFAULT 0,
  
  -- Classification
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  reason TEXT,
  competitors_having_link TEXT[], -- Array of competitor domains
  
  -- Link suggestions
  suggested_anchor_text VARCHAR(500),
  suggested_link_target TEXT,
  
  -- Contact information
  contact_email VARCHAR(255),
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered', 'outreach_sent', 'follow_up_sent', 'accepted', 'rejected')),
  
  -- Timestamps
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backlink_opportunities_project_id ON backlink_opportunities(project_id);
CREATE INDEX idx_backlink_opportunities_opportunity_id ON backlink_opportunities(opportunity_id);
CREATE INDEX idx_backlink_opportunities_type ON backlink_opportunities(type);
CREATE INDEX idx_backlink_opportunities_priority ON backlink_opportunities(priority);
CREATE INDEX idx_backlink_opportunities_status ON backlink_opportunities(status);
CREATE INDEX idx_backlink_opportunities_domain_rating ON backlink_opportunities(domain_rating);

-- RLS for backlink_opportunities
ALTER TABLE backlink_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY backlink_opportunities_tenant_isolation ON backlink_opportunities
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- =============================================
-- 2. outreach_campaigns table (backlink-builder agent)
-- =============================================
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES backlink_opportunities(id) ON DELETE CASCADE,
  
  -- Campaign details
  campaign_id VARCHAR(255) NOT NULL UNIQUE,
  target_domain VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  
  -- Email content
  subject VARCHAR(500) NOT NULL,
  email_body TEXT NOT NULL,
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'opened', 'replied', 'accepted', 'rejected')),
  
  -- Timestamps
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  
  -- Follow-up tracking
  follow_up_count INTEGER DEFAULT 0,
  last_follow_up_at TIMESTAMPTZ,
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outreach_campaigns_project_id ON outreach_campaigns(project_id);
CREATE INDEX idx_outreach_campaigns_opportunity_id ON outreach_campaigns(opportunity_id);
CREATE INDEX idx_outreach_campaigns_campaign_id ON outreach_campaigns(campaign_id);
CREATE INDEX idx_outreach_campaigns_status ON outreach_campaigns(status);
CREATE INDEX idx_outreach_campaigns_sent_at ON outreach_campaigns(sent_at);

-- RLS for outreach_campaigns
ALTER TABLE outreach_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY outreach_campaigns_tenant_isolation ON outreach_campaigns
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- =============================================
-- 3. generated_reports table (report-generator agent)
-- =============================================
CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Report metadata
  report_id VARCHAR(255) NOT NULL UNIQUE,
  report_format VARCHAR(50) NOT NULL CHECK (report_format IN ('serp_ranking', 'keyword_growth', 'technical_audit', 'backlink_analysis', 'comprehensive', 'executive_summary')),
  report_period VARCHAR(50) NOT NULL CHECK (report_period IN ('daily', 'weekly', 'monthly', 'quarterly', 'custom')),
  
  -- Date range
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Report content (JSONB for flexible structure)
  sections JSONB NOT NULL DEFAULT '[]',
  summary JSONB NOT NULL DEFAULT '{}',
  
  -- Output files
  output_format VARCHAR(20) NOT NULL CHECK (output_format IN ('pdf', 'html', 'json', 'csv')),
  output_url TEXT,
  file_size_bytes INTEGER,
  
  -- White-label configuration
  white_label_config JSONB,
  
  -- Scheduled delivery
  is_scheduled BOOLEAN DEFAULT false,
  schedule_cron VARCHAR(100),
  recipients TEXT[], -- Array of email addresses
  next_run_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  
  -- Summary statistics
  total_metrics INTEGER DEFAULT 0,
  total_charts INTEGER DEFAULT 0,
  total_insights INTEGER DEFAULT 0,
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Timestamps
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generated_reports_project_id ON generated_reports(project_id);
CREATE INDEX idx_generated_reports_report_id ON generated_reports(report_id);
CREATE INDEX idx_generated_reports_report_format ON generated_reports(report_format);
CREATE INDEX idx_generated_reports_report_period ON generated_reports(report_period);
CREATE INDEX idx_generated_reports_generated_at ON generated_reports(generated_at);
CREATE INDEX idx_generated_reports_is_scheduled ON generated_reports(is_scheduled);
CREATE INDEX idx_generated_reports_next_run_at ON generated_reports(next_run_at);

-- RLS for generated_reports
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY generated_reports_tenant_isolation ON generated_reports
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- =============================================
-- 4. schema_validations table (schema-agent)
-- =============================================
CREATE TABLE IF NOT EXISTS schema_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Target page
  url TEXT NOT NULL,
  
  -- Operation type
  operation VARCHAR(50) NOT NULL CHECK (operation IN ('detect', 'generate', 'validate', 'suggest')),
  
  -- Detected schemas (JSONB array)
  detected_schemas JSONB DEFAULT '[]',
  
  -- Generated schema (JSONB object)
  generated_schema JSONB,
  
  -- Validation result (JSONB object)
  validation_result JSONB,
  
  -- Suggestions (JSONB array)
  suggestions JSONB DEFAULT '[]',
  
  -- Summary statistics
  total_schemas_detected INTEGER DEFAULT 0,
  valid_schemas INTEGER DEFAULT 0,
  invalid_schemas INTEGER DEFAULT 0,
  missing_suggestions INTEGER DEFAULT 0,
  rich_results_eligibility_score INTEGER CHECK (rich_results_eligibility_score >= 0 AND rich_results_eligibility_score <= 100),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schema_validations_project_id ON schema_validations(project_id);
CREATE INDEX idx_schema_validations_url ON schema_validations(url);
CREATE INDEX idx_schema_validations_operation ON schema_validations(operation);
CREATE INDEX idx_schema_validations_rich_results_score ON schema_validations(rich_results_eligibility_score);
CREATE INDEX idx_schema_validations_created_at ON schema_validations(created_at);

-- RLS for schema_validations
ALTER TABLE schema_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY schema_validations_tenant_isolation ON schema_validations
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- =============================================
-- Triggers for updated_at timestamps
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_backlink_opportunities_updated_at
  BEFORE UPDATE ON backlink_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outreach_campaigns_updated_at
  BEFORE UPDATE ON outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_reports_updated_at
  BEFORE UPDATE ON generated_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schema_validations_updated_at
  BEFORE UPDATE ON schema_validations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
