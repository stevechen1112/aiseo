/**
 * BacklinkBuilderAgent - Backlink Opportunity Discovery & Outreach Management
 * 
 * Features:
 * - Ahrefs Link Intersect API integration for competitor backlink analysis
 * - Broken link building opportunity detection
 * - Guest post opportunity identification
 * - Email outreach template generation
 * - Outreach campaign status tracking
 * 
 * Phase 2 Task 3.4
 */

import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import { EventBus } from '../event-bus/bus.js';

interface BacklinkOpportunity {
  opportunityId: string;
  type: 'link_intersect' | 'broken_link' | 'guest_post' | 'resource_page' | 'unlinked_mention';
  targetDomain: string;
  targetUrl: string;
  domainRating: number;
  referringDomains: number;
  organicTraffic: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  competitorsHavingLink: string[];
  suggestedAnchorText: string;
  suggestedLinkTarget: string;
  contactEmail?: string;
  status: 'discovered' | 'outreach_sent' | 'follow_up_sent' | 'accepted' | 'rejected';
  discoveredAt: string;
}

interface OutreachCampaign {
  campaignId: string;
  opportunityId: string;
  targetDomain: string;
  contactEmail: string;
  subject: string;
  emailBody: string;
  status: 'draft' | 'sent' | 'opened' | 'replied' | 'accepted' | 'rejected';
  sentAt?: string;
  openedAt?: string;
  repliedAt?: string;
  followUpCount: number;
  lastFollowUpAt?: string;
  notes: string;
}

interface BacklinkBuilderInput {
  ownDomain: string;
  competitorDomains: string[];
  targetKeywords?: string[];
  minDomainRating?: number;
  maxOpportunities?: number;
  includeTypes?: BacklinkOpportunity['type'][];
  generateOutreachEmails?: boolean;
}

interface BacklinkBuilderOutput {
  opportunities: BacklinkOpportunity[];
  campaigns: OutreachCampaign[];
  summary: {
    totalOpportunities: number;
    highPriorityCount: number;
    mediumPriorityCount: number;
    lowPriorityCount: number;
    avgDomainRating: number;
    totalPotentialReferrals: number;
    campaignsGenerated: number;
  };
  recommendations: {
    category: 'outreach' | 'content' | 'technical';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    actionItems: string[];
  }[];
}

export class BacklinkBuilderAgent extends BaseAgent<BacklinkBuilderInput, BacklinkBuilderOutput> {
  id = 'backlink-builder';
  name = 'backlink-builder';
  description = 'Discover backlink opportunities and manage outreach campaigns';

  constructor(private eventBus: EventBus) {
    super();
  }

  async execute(
    input: BacklinkBuilderInput,
    context: AgentContext
  ): Promise<BacklinkBuilderOutput> {
    const minDR = input.minDomainRating ?? 30;
    const maxOpp = input.maxOpportunities ?? 100;
    const includeTypes = input.includeTypes ?? ['link_intersect', 'broken_link', 'guest_post'];

    // Discover backlink opportunities from various sources
    const opportunities: BacklinkOpportunity[] = [];

    // 1. Link Intersect Analysis (competitors have link, we don't)
    if (includeTypes.includes('link_intersect')) {
      const linkIntersect = await this.findLinkIntersectOpportunities(
        input.ownDomain,
        input.competitorDomains,
        minDR,
        context
      );
      opportunities.push(...linkIntersect);
    }

    // 2. Broken Link Building
    if (includeTypes.includes('broken_link')) {
      const brokenLinks = await this.findBrokenLinkOpportunities(
        input.ownDomain,
        input.targetKeywords ?? [],
        minDR,
        context
      );
      opportunities.push(...brokenLinks);
    }

    // 3. Guest Post Opportunities
    if (includeTypes.includes('guest_post')) {
      const guestPosts = await this.findGuestPostOpportunities(
        input.ownDomain,
        input.targetKeywords ?? [],
        minDR,
        context
      );
      opportunities.push(...guestPosts);
    }

    // 4. Resource Page Opportunities
    if (includeTypes.includes('resource_page')) {
      const resourcePages = await this.findResourcePageOpportunities(
        input.ownDomain,
        input.targetKeywords ?? [],
        minDR,
        context
      );
      opportunities.push(...resourcePages);
    }

    // 5. Unlinked Brand Mentions
    if (includeTypes.includes('unlinked_mention')) {
      const unlinkedMentions = await this.findUnlinkedMentions(
        input.ownDomain,
        minDR,
        context
      );
      opportunities.push(...unlinkedMentions);
    }

    // Sort by priority and limit
    const sortedOpportunities = opportunities
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return b.domainRating - a.domainRating;
      })
      .slice(0, maxOpp);

    // Generate outreach email campaigns if requested
    const campaigns: OutreachCampaign[] = [];
    if (input.generateOutreachEmails) {
      for (const opp of sortedOpportunities) {
        if (opp.contactEmail && (opp.priority === 'high' || opp.priority === 'medium')) {
          const campaign = await this.generateOutreachCampaign(opp, input.ownDomain, context);
          campaigns.push(campaign);
        }
      }
    }

    // Calculate summary statistics
    const summary = this.calculateSummary(sortedOpportunities, campaigns);

    // Generate actionable recommendations
    const recommendations = this.generateRecommendations(sortedOpportunities, summary);

    return {
      opportunities: sortedOpportunities,
      campaigns,
      summary,
      recommendations,
    };
  }

  /**
   * Find link intersect opportunities (competitors have link, we don't)
   * Uses Ahrefs Link Intersect API
   */
  private async findLinkIntersectOpportunities(
    ownDomain: string,
    competitorDomains: string[],
    minDR: number,
    context: AgentContext
  ): Promise<BacklinkOpportunity[]> {
    // MVP: Mock data (real implementation would call Ahrefs Link Intersect API)
    // Real: POST https://api.ahrefs.com/v3/site-explorer/link-intersect
    // Body: { target: ownDomain, targets2: competitorDomains, mode: 'prefix', limit: 100 }

    const mockOpportunities: BacklinkOpportunity[] = [
      {
        opportunityId: `li_${Date.now()}_1`,
        type: 'link_intersect' as const,
        targetDomain: 'techcrunch.com',
        targetUrl: 'https://techcrunch.com/resources',
        domainRating: 92,
        referringDomains: 15000,
        organicTraffic: 500000,
        priority: 'high' as const,
        reason: '3 out of 5 competitors have backlinks from this domain',
        competitorsHavingLink: competitorDomains.slice(0, 3),
        suggestedAnchorText: 'SEO platform',
        suggestedLinkTarget: `https://${ownDomain}/tools`,
        contactEmail: 'editor@techcrunch.com',
        status: 'discovered' as const,
        discoveredAt: new Date().toISOString(),
      },
      {
        opportunityId: `li_${Date.now()}_2`,
        type: 'link_intersect' as const,
        targetDomain: 'searchengineland.com',
        targetUrl: 'https://searchengineland.com/seo-tools-guide',
        domainRating: 87,
        referringDomains: 8000,
        organicTraffic: 300000,
        priority: 'high' as const,
        reason: '4 out of 5 competitors have backlinks from this domain',
        competitorsHavingLink: competitorDomains.slice(0, 4),
        suggestedAnchorText: 'enterprise SEO solution',
        suggestedLinkTarget: `https://${ownDomain}`,
        contactEmail: 'contact@searchengineland.com',
        status: 'discovered' as const,
        discoveredAt: new Date().toISOString(),
      },
    ].filter(opp => opp.domainRating >= minDR);

    return mockOpportunities;
  }

  /**
   * Find broken link building opportunities
   */
  private async findBrokenLinkOpportunities(
    ownDomain: string,
    keywords: string[],
    minDR: number,
    context: AgentContext
  ): Promise<BacklinkOpportunity[]> {
    // MVP: Mock data (real implementation would crawl competitor pages for 404s)
    const mockOpportunities: BacklinkOpportunity[] = [
      {
        opportunityId: `bl_${Date.now()}_1`,
        type: 'broken_link' as const,
        targetDomain: 'moz.com',
        targetUrl: 'https://moz.com/blog/seo-tools-2022',
        domainRating: 91,
        referringDomains: 12000,
        organicTraffic: 400000,
        priority: 'medium' as const,
        reason: 'Page has broken link to old SEO tool, we can offer replacement',
        competitorsHavingLink: [],
        suggestedAnchorText: 'modern SEO platform',
        suggestedLinkTarget: `https://${ownDomain}/platform`,
        contactEmail: 'content@moz.com',
        status: 'discovered' as const,
        discoveredAt: new Date().toISOString(),
      },
    ].filter(opp => opp.domainRating >= minDR);

    return mockOpportunities;
  }

  /**
   * Find guest post opportunities
   */
  private async findGuestPostOpportunities(
    ownDomain: string,
    keywords: string[],
    minDR: number,
    context: AgentContext
  ): Promise<BacklinkOpportunity[]> {
    // MVP: Mock data (real implementation would search for "write for us" pages)
    const mockOpportunities: BacklinkOpportunity[] = [
      {
        opportunityId: `gp_${Date.now()}_1`,
        type: 'guest_post' as const,
        targetDomain: 'contentmarketinginstitute.com',
        targetUrl: 'https://contentmarketinginstitute.com/write-for-us',
        domainRating: 85,
        referringDomains: 10000,
        organicTraffic: 250000,
        priority: 'high' as const,
        reason: 'Accepts guest posts on SEO and content marketing topics',
        competitorsHavingLink: [],
        suggestedAnchorText: 'AI-powered SEO tools',
        suggestedLinkTarget: `https://${ownDomain}/blog`,
        contactEmail: 'editors@contentmarketinginstitute.com',
        status: 'discovered' as const,
        discoveredAt: new Date().toISOString(),
      },
    ].filter(opp => opp.domainRating >= minDR);

    return mockOpportunities;
  }

  /**
   * Find resource page opportunities
   */
  private async findResourcePageOpportunities(
    ownDomain: string,
    keywords: string[],
    minDR: number,
    context: AgentContext
  ): Promise<BacklinkOpportunity[]> {
    // MVP: Mock data
    const mockOpportunities: BacklinkOpportunity[] = [
      {
        opportunityId: `rp_${Date.now()}_1`,
        type: 'resource_page' as const,
        targetDomain: 'hubspot.com',
        targetUrl: 'https://hubspot.com/resources/seo-tools',
        domainRating: 93,
        referringDomains: 20000,
        organicTraffic: 600000,
        priority: 'high' as const,
        reason: 'Resource page listing SEO tools, we qualify for inclusion',
        competitorsHavingLink: [],
        suggestedAnchorText: ownDomain,
        suggestedLinkTarget: `https://${ownDomain}`,
        contactEmail: 'resources@hubspot.com',
        status: 'discovered' as const,
        discoveredAt: new Date().toISOString(),
      },
    ].filter(opp => opp.domainRating >= minDR);

    return mockOpportunities;
  }

  /**
   * Find unlinked brand mentions
   */
  private async findUnlinkedMentions(
    ownDomain: string,
    minDR: number,
    context: AgentContext
  ): Promise<BacklinkOpportunity[]> {
    // MVP: Mock data (real implementation would use Ahrefs Content Explorer or Google Search)
    const brandName = ownDomain.split('.')[0];
    const mockOpportunities: BacklinkOpportunity[] = [
      {
        opportunityId: `um_${Date.now()}_1`,
        type: 'unlinked_mention' as const,
        targetDomain: 'searchenginejournal.com',
        targetUrl: 'https://searchenginejournal.com/seo-platforms-comparison',
        domainRating: 88,
        referringDomains: 9000,
        organicTraffic: 350000,
        priority: 'medium' as const,
        reason: `Article mentions "${brandName}" but doesn't link to our site`,
        competitorsHavingLink: [],
        suggestedAnchorText: brandName,
        suggestedLinkTarget: `https://${ownDomain}`,
        contactEmail: 'editorial@searchenginejournal.com',
        status: 'discovered' as const,
        discoveredAt: new Date().toISOString(),
      },
    ].filter(opp => opp.domainRating >= minDR);

    return mockOpportunities;
  }

  /**
   * Generate personalized outreach email campaign
   */
  private async generateOutreachCampaign(
    opportunity: BacklinkOpportunity,
    ownDomain: string,
    context: AgentContext
  ): Promise<OutreachCampaign> {
    const templates = {
      link_intersect: {
        subject: `Quick question about ${opportunity.targetDomain}'s resource page`,
        body: `Hi there,

I was browsing your excellent resource page at ${opportunity.targetUrl} and noticed you've listed several great SEO tools.

I wanted to reach out because we've recently launched ${ownDomain}, an enterprise SEO platform that I think would be a valuable addition to your list. We offer [unique value proposition].

Would you be open to taking a look? I'd be happy to provide any additional information you need.

Thanks for your time!

Best regards`,
      },
      broken_link: {
        subject: `Found a broken link on ${opportunity.targetDomain}`,
        body: `Hi,

I was reading your article at ${opportunity.targetUrl} and noticed one of your links appears to be broken (the one about [topic]).

I actually wrote a comprehensive guide on the same topic that might serve as a good replacement: ${opportunity.suggestedLinkTarget}

Let me know if you'd like me to send you more details!

Best`,
      },
      guest_post: {
        subject: `Guest post contribution for ${opportunity.targetDomain}`,
        body: `Hi,

I'm a regular reader of ${opportunity.targetDomain} and have been impressed by your content on [topic area].

I'd love to contribute a guest post on [specific topic] that I think your audience would find valuable. I have experience in [credentials/expertise].

Here are a few topic ideas:
- [Topic 1]
- [Topic 2]
- [Topic 3]

Would you be interested in a submission?

Thanks,`,
      },
      resource_page: {
        subject: `Resource suggestion for ${opportunity.targetDomain}`,
        body: `Hi,

I came across your resource page at ${opportunity.targetUrl} and found it really helpful.

I wanted to suggest adding ${ownDomain} to your list. It's an enterprise SEO platform that offers [key features]. Many of your visitors might find it useful for [specific use case].

Here's a quick overview: ${opportunity.suggestedLinkTarget}

Let me know if you'd like more information!

Best regards`,
      },
      unlinked_mention: {
        subject: `Thank you for mentioning ${ownDomain}!`,
        body: `Hi,

I noticed you mentioned ${ownDomain} in your article at ${opportunity.targetUrl} - thank you!

I wanted to reach out to see if you'd be open to linking to our site (${opportunity.suggestedLinkTarget}) so your readers can learn more about our platform.

I'd be happy to return the favor by sharing your article with our audience.

Thanks for considering!

Best`,
      },
    };

    const template = templates[opportunity.type];

    return {
      campaignId: `camp_${Date.now()}_${opportunity.opportunityId}`,
      opportunityId: opportunity.opportunityId,
      targetDomain: opportunity.targetDomain,
      contactEmail: opportunity.contactEmail || `editor@${opportunity.targetDomain}`,
      subject: template.subject,
      emailBody: template.body,
      status: 'draft',
      followUpCount: 0,
      notes: `Auto-generated campaign for ${opportunity.type} opportunity`,
    };
  }

  private calculateSummary(
    opportunities: BacklinkOpportunity[],
    campaigns: OutreachCampaign[]
  ): BacklinkBuilderOutput['summary'] {
    const highPriority = opportunities.filter(o => o.priority === 'high').length;
    const mediumPriority = opportunities.filter(o => o.priority === 'medium').length;
    const lowPriority = opportunities.filter(o => o.priority === 'low').length;

    const avgDR = opportunities.length > 0
      ? opportunities.reduce((sum, o) => sum + o.domainRating, 0) / opportunities.length
      : 0;

    const totalReferrals = opportunities.reduce((sum, o) => sum + o.referringDomains, 0);

    return {
      totalOpportunities: opportunities.length,
      highPriorityCount: highPriority,
      mediumPriorityCount: mediumPriority,
      lowPriorityCount: lowPriority,
      avgDomainRating: Math.round(avgDR),
      totalPotentialReferrals: totalReferrals,
      campaignsGenerated: campaigns.length,
    };
  }

  private generateRecommendations(
    opportunities: BacklinkOpportunity[],
    summary: BacklinkBuilderOutput['summary']
  ): BacklinkBuilderOutput['recommendations'] {
    const recommendations: BacklinkBuilderOutput['recommendations'] = [];

    if (summary.highPriorityCount > 0) {
      recommendations.push({
        category: 'outreach',
        priority: 'high',
        title: '優先處理高價值連結機會',
        description: `發現 ${summary.highPriorityCount} 個高優先級連結機會，這些網站的 Domain Rating 較高且競品已有連結`,
        actionItems: [
          '立即發送個性化 Outreach 郵件給前 5 個高 DR 網站',
          '在郵件中強調獨特價值主張和相關性',
          '設定提醒在 3-5 天後進行 Follow-up',
        ],
      });
    }

    const guestPostOpps = opportunities.filter(o => o.type === 'guest_post').length;
    if (guestPostOpps > 0) {
      recommendations.push({
        category: 'content',
        priority: 'high',
        title: '準備 Guest Post 內容',
        description: `發現 ${guestPostOpps} 個 Guest Post 機會`,
        actionItems: [
          '選擇 2-3 個最相關的主題撰寫文章',
          '確保內容符合目標網站的風格和要求',
          '在文章中自然嵌入 1-2 個相關連結',
        ],
      });
    }

    const brokenLinkOpps = opportunities.filter(o => o.type === 'broken_link').length;
    if (brokenLinkOpps > 0) {
      recommendations.push({
        category: 'technical',
        priority: 'medium',
        title: 'Broken Link Building 機會',
        description: `發現 ${brokenLinkOpps} 個 Broken Link 機會`,
        actionItems: [
          '確認我們有對應內容可替換 Broken Link',
          '如無對應內容，考慮創建相關頁面',
          '聯繫網站管理員提供替換連結',
        ],
      });
    }

    if (summary.avgDomainRating >= 70) {
      recommendations.push({
        category: 'outreach',
        priority: 'high',
        title: '高權威網站連結建設',
        description: `平均 Domain Rating 達 ${summary.avgDomainRating}，機會質量優秀`,
        actionItems: [
          '提高 Outreach 郵件質量，增加個性化內容',
          '考慮提供獨家內容或數據以提高回應率',
          '建立長期關係而非一次性連結請求',
        ],
      });
    }

    return recommendations;
  }
}
