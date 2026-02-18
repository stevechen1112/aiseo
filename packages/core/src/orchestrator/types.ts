export type FlowId = string;

export type WorkflowName = 
  | 'seo-content-pipeline'
  | 'seo-monitoring-pipeline'
  | 'seo-comprehensive-audit'
  | 'local-seo-optimization';

export type StartFlowInput = {
  tenantId: string;
  projectId: string;
  seedKeyword?: string;
  competitorUrls?: string[];
  urls?: string[];
  keywords?: string[];
  businessName?: string;
  expectedNAP?: {
    name: string;
    address: string;
    phone: string;
  };
  location?: string;
};

export type FlowStartResult = {
  flowName: WorkflowName;
  flowJobId: FlowId;
};
