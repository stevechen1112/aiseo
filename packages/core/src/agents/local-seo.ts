/**
 * LocalSeoAgent - Local SEO Optimization & GMB Management
 * 
 * Features:
 * - Google My Business (GMB) integration for business profile management
 * - Review monitoring and response tracking
 * - NAP (Name, Address, Phone) citation consistency checker
 * - Local ranking tracker
 * - Citation building opportunities
 * 
 * Phase 2 Task 3.9
 */

import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import { EventBus } from '../event-bus/bus.js';

interface BusinessProfile {
  name: string;
  address: string;
  phone: string;
  website: string;
  category: string;
  rating: number;
  reviewCount: number;
  hours: Record<string, string>;
  attributes: string[];
  photos: number;
  posts: number;
}

interface Review {
  reviewId: string;
  author: string;
  rating: number;
  text: string;
  publishedAt: string;
  replied: boolean;
  replyText?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

interface NAPCitation {
  citationId: string;
  source: string;
  url: string;
  name: string;
  address: string;
  phone: string;
  isConsistent: boolean;
  inconsistencies: string[];
  domainAuthority: number;
}

interface LocalRanking {
  keyword: string;
  position: number;
  location: string;
  mapPackPosition?: number;
  organicPosition?: number;
  competitors: {
    businessName: string;
    position: number;
    rating: number;
  }[];
}

interface LocalSeoAgentInput {
  operation: 'profile' | 'reviews' | 'citations' | 'rankings' | 'audit';
  businessName: string;
  expectedNAP?: {
    name: string;
    address: string;
    phone: string;
  };
  keywords?: string[];
  location?: string;
  includeCompetitors?: boolean;
}

interface LocalSeoAgentOutput {
  operation: string;
  businessProfile?: BusinessProfile;
  reviews?: {
    summary: {
      averageRating: number;
      totalReviews: number;
      positiveReviews: number;
      neutralReviews: number;
      negativeReviews: number;
      unrepliedReviews: number;
      replyRate: number;
    };
    recent: Review[];
    needsAttention: Review[];
  };
  citations?: {
    summary: {
      totalCitations: number;
      consistentCitations: number;
      inconsistentCitations: number;
      missingCitations: number;
      consistencyScore: number;
    };
    citations: NAPCitation[];
    inconsistencies: {
      field: 'name' | 'address' | 'phone';
      count: number;
      examples: string[];
    }[];
  };
  rankings?: {
    summary: {
      avgPosition: number;
      inMapPack: number;
      keywords: number;
    };
    rankings: LocalRanking[];
  };
  recommendations: {
    category: 'profile' | 'reviews' | 'citations' | 'rankings';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    actionItems: string[];
  }[];
}

export class LocalSeoAgent extends BaseAgent<LocalSeoAgentInput, LocalSeoAgentOutput> {
  id = 'local-seo';
  name = 'local-seo';
  description = 'Optimize local SEO with GMB management, review monitoring, and NAP citation tracking';

  constructor(private eventBus: EventBus) {
    super();
  }

  async execute(
    input: LocalSeoAgentInput,
    context: AgentContext
  ): Promise<LocalSeoAgentOutput> {
    const output: LocalSeoAgentOutput = {
      operation: input.operation,
      recommendations: [],
    };

    switch (input.operation) {
      case 'profile':
        output.businessProfile = await this.fetchBusinessProfile(input.businessName, context);
        output.recommendations.push(...this.generateProfileRecommendations(output.businessProfile));
        break;

      case 'reviews':
        output.reviews = await this.fetchReviews(input.businessName, context);
        output.recommendations.push(...this.generateReviewRecommendations(output.reviews));
        break;

      case 'citations':
        if (!input.expectedNAP) {
          throw new Error('expectedNAP is required for citations operation');
        }
        output.citations = await this.checkCitations(input.businessName, input.expectedNAP, context);
        output.recommendations.push(...this.generateCitationRecommendations(output.citations));
        break;

      case 'rankings':
        if (!input.keywords || !input.location) {
          throw new Error('keywords and location are required for rankings operation');
        }
        output.rankings = await this.trackLocalRankings(
          input.businessName,
          input.keywords,
          input.location,
          input.includeCompetitors ?? true,
          context
        );
        output.recommendations.push(...this.generateRankingRecommendations(output.rankings));
        break;

      case 'audit':
        output.businessProfile = await this.fetchBusinessProfile(input.businessName, context);
        output.reviews = await this.fetchReviews(input.businessName, context);
        if (input.expectedNAP) {
          output.citations = await this.checkCitations(input.businessName, input.expectedNAP, context);
        }
        if (input.keywords && input.location) {
          output.rankings = await this.trackLocalRankings(
            input.businessName,
            input.keywords,
            input.location,
            input.includeCompetitors ?? true,
            context
          );
        }
        output.recommendations.push(
          ...this.generateProfileRecommendations(output.businessProfile),
          ...this.generateReviewRecommendations(output.reviews),
          ...(output.citations ? this.generateCitationRecommendations(output.citations) : []),
          ...(output.rankings ? this.generateRankingRecommendations(output.rankings) : [])
        );
        break;
    }

    return output;
  }

  /**
   * Fetch Google My Business profile
   */
  private async fetchBusinessProfile(
    businessName: string,
    context: AgentContext
  ): Promise<BusinessProfile> {
    // MVP: Mock data (real implementation would use GMB API)
    // Real: GET https://mybusinessbusinessinformation.googleapis.com/v1/{name}

    return {
      name: businessName,
      address: '123 Main St, San Francisco, CA 94102',
      phone: '+1-415-555-0123',
      website: 'https://example.com',
      category: 'SEO Agency',
      rating: 4.6,
      reviewCount: 127,
      hours: {
        monday: '9:00 AM - 6:00 PM',
        tuesday: '9:00 AM - 6:00 PM',
        wednesday: '9:00 AM - 6:00 PM',
        thursday: '9:00 AM - 6:00 PM',
        friday: '9:00 AM - 5:00 PM',
        saturday: 'Closed',
        sunday: 'Closed',
      },
      attributes: ['wheelchair_accessible', 'free_wifi', 'online_appointments'],
      photos: 45,
      posts: 12,
    };
  }

  /**
   * Fetch and analyze reviews
   */
  private async fetchReviews(
    businessName: string,
    context: AgentContext
  ): Promise<NonNullable<LocalSeoAgentOutput['reviews']>> {
    // MVP: Mock data (real implementation would use GMB API)
    // Real: GET https://mybusiness.googleapis.com/v4/{parent}/reviews

    const mockReviews: Review[] = [
      {
        reviewId: 'rev_1',
        author: 'John D.',
        rating: 5,
        text: 'Excellent SEO services! Our organic traffic increased by 150% in 3 months.',
        publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        replied: true,
        replyText: 'Thank you for the kind words! We\'re glad to help grow your business.',
        sentiment: 'positive' as const,
      },
      {
        reviewId: 'rev_2',
        author: 'Sarah M.',
        rating: 4,
        text: 'Good results, but communication could be better.',
        publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        replied: false,
        sentiment: 'positive' as const,
      },
      {
        reviewId: 'rev_3',
        author: 'Mike L.',
        rating: 2,
        text: 'Not satisfied with the results. Expected more for the price.',
        publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        replied: false,
        sentiment: 'negative' as const,
      },
      {
        reviewId: 'rev_4',
        author: 'Emily R.',
        rating: 5,
        text: 'Amazing team! Very professional and knowledgeable.',
        publishedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        replied: true,
        replyText: 'We appreciate your feedback!',
        sentiment: 'positive' as const,
      },
      {
        reviewId: 'rev_5',
        author: 'David K.',
        rating: 3,
        text: 'Average experience. Nothing special.',
        publishedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        replied: false,
        sentiment: 'neutral' as const,
      },
    ];

    const positiveReviews = mockReviews.filter(r => r.rating >= 4).length;
    const neutralReviews = mockReviews.filter(r => r.rating === 3).length;
    const negativeReviews = mockReviews.filter(r => r.rating <= 2).length;
    const unrepliedReviews = mockReviews.filter(r => !r.replied).length;
    const avgRating = mockReviews.reduce((sum, r) => sum + r.rating, 0) / mockReviews.length;
    const replyRate = ((mockReviews.length - unrepliedReviews) / mockReviews.length) * 100;

    const needsAttention = mockReviews
      .filter(r => !r.replied && (r.sentiment === 'negative' || r.rating <= 3))
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return {
      summary: {
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews: mockReviews.length,
        positiveReviews,
        neutralReviews,
        negativeReviews,
        unrepliedReviews,
        replyRate: Math.round(replyRate),
      },
      recent: mockReviews.slice(0, 5),
      needsAttention,
    };
  }

  /**
   * Check NAP citations across the web
   */
  private async checkCitations(
    businessName: string,
    expectedNAP: NonNullable<LocalSeoAgentInput['expectedNAP']>,
    context: AgentContext
  ): Promise<NonNullable<LocalSeoAgentOutput['citations']>> {
    // MVP: Mock data (real implementation would crawl citation sites)
    // Real: Check Yelp, Yellow Pages, Facebook, Bing Places, Apple Maps, etc.

    const mockCitations: NAPCitation[] = [
      {
        citationId: 'cit_1',
        source: 'Yelp',
        url: 'https://yelp.com/biz/example',
        name: expectedNAP.name,
        address: expectedNAP.address,
        phone: expectedNAP.phone,
        isConsistent: true,
        inconsistencies: [],
        domainAuthority: 93,
      },
      {
        citationId: 'cit_2',
        source: 'Yellow Pages',
        url: 'https://yellowpages.com/example',
        name: expectedNAP.name + ' Inc.', // Inconsistent name
        address: expectedNAP.address,
        phone: expectedNAP.phone.replace('+1-', ''), // Inconsistent phone format
        isConsistent: false,
        inconsistencies: ['name', 'phone'],
        domainAuthority: 87,
      },
      {
        citationId: 'cit_3',
        source: 'Facebook',
        url: 'https://facebook.com/example',
        name: expectedNAP.name,
        address: expectedNAP.address + ', USA', // Inconsistent address
        phone: expectedNAP.phone,
        isConsistent: false,
        inconsistencies: ['address'],
        domainAuthority: 96,
      },
      {
        citationId: 'cit_4',
        source: 'Bing Places',
        url: 'https://bing.com/maps/example',
        name: expectedNAP.name,
        address: expectedNAP.address,
        phone: expectedNAP.phone,
        isConsistent: true,
        inconsistencies: [],
        domainAuthority: 95,
      },
      {
        citationId: 'cit_5',
        source: 'Apple Maps',
        url: 'https://maps.apple.com/example',
        name: expectedNAP.name,
        address: expectedNAP.address,
        phone: expectedNAP.phone,
        isConsistent: true,
        inconsistencies: [],
        domainAuthority: 98,
      },
    ];

    const consistentCitations = mockCitations.filter(c => c.isConsistent).length;
    const inconsistentCitations = mockCitations.filter(c => !c.isConsistent).length;
    const consistencyScore = (consistentCitations / mockCitations.length) * 100;

    // Count inconsistencies by field
    const nameInconsistencies = mockCitations.filter(c => c.inconsistencies.includes('name'));
    const addressInconsistencies = mockCitations.filter(c => c.inconsistencies.includes('address'));
    const phoneInconsistencies = mockCitations.filter(c => c.inconsistencies.includes('phone'));

    return {
      summary: {
        totalCitations: mockCitations.length,
        consistentCitations,
        inconsistentCitations,
        missingCitations: 15 - mockCitations.length, // Top 15 citation sources
        consistencyScore: Math.round(consistencyScore),
      },
      citations: mockCitations,
      inconsistencies: [
        {
          field: 'name' as const,
          count: nameInconsistencies.length,
          examples: nameInconsistencies.map(c => `${c.source}: ${c.name}`),
        },
        {
          field: 'address' as const,
          count: addressInconsistencies.length,
          examples: addressInconsistencies.map(c => `${c.source}: ${c.address}`),
        },
        {
          field: 'phone' as const,
          count: phoneInconsistencies.length,
          examples: phoneInconsistencies.map(c => `${c.source}: ${c.phone}`),
        },
      ].filter(i => i.count > 0),
    };
  }

  /**
   * Track local rankings for keywords
   */
  private async trackLocalRankings(
    businessName: string,
    keywords: string[],
    location: string,
    includeCompetitors: boolean,
    context: AgentContext
  ): Promise<NonNullable<LocalSeoAgentOutput['rankings']>> {
    // MVP: Mock data (real implementation would use local rank tracking API)
    // Real: Use BrightLocal API or custom crawler with location-based IP

    const mockRankings: LocalRanking[] = keywords.map((keyword, index) => ({
      keyword,
      position: 3 + index,
      location,
      mapPackPosition: index < 2 ? index + 1 : undefined,
      organicPosition: 3 + index,
      competitors: includeCompetitors ? [
        { businessName: 'Competitor A', position: 1, rating: 4.8 },
        { businessName: 'Competitor B', position: 2, rating: 4.5 },
        { businessName: 'Competitor C', position: 4, rating: 4.3 },
      ] : [],
    }));

    const avgPosition = mockRankings.reduce((sum, r) => sum + r.position, 0) / mockRankings.length;
    const inMapPack = mockRankings.filter(r => r.mapPackPosition !== undefined).length;

    return {
      summary: {
        avgPosition: Math.round(avgPosition * 10) / 10,
        inMapPack,
        keywords: mockRankings.length,
      },
      rankings: mockRankings,
    };
  }

  /**
   * Generate profile recommendations
   */
  private generateProfileRecommendations(
    profile: BusinessProfile
  ): LocalSeoAgentOutput['recommendations'] {
    const recommendations: LocalSeoAgentOutput['recommendations'] = [];

    if (profile.photos < 50) {
      recommendations.push({
        category: 'profile' as const,
        priority: 'high' as const,
        title: '增加 Google My Business 照片',
        description: `目前僅有 ${profile.photos} 張照片，建議至少 50 張`,
        actionItems: [
          '上傳高品質的外觀、內部、產品照片',
          '定期更新照片展示最新的業務動態',
          '包含團隊照片增加信任感',
        ],
      });
    }

    if (profile.posts < 20) {
      recommendations.push({
        category: 'profile' as const,
        priority: 'medium' as const,
        title: '定期發布 GMB 貼文',
        description: `目前僅有 ${profile.posts} 則貼文，建議每週發布`,
        actionItems: [
          '分享業務更新、特別優惠、活動資訊',
          '使用號召性用語（CTA）按鈕',
          '加入相關關鍵字和地理標記',
        ],
      });
    }

    if (profile.attributes.length < 5) {
      recommendations.push({
        category: 'profile' as const,
        priority: 'medium' as const,
        title: '完善商家屬性',
        description: '增加更多商家屬性有助於提升搜尋可見度',
        actionItems: [
          '檢查所有可用屬性並選擇適用項目',
          '突出獨特賣點（如免費停車、無線網路）',
          '定期檢視並更新屬性',
        ],
      });
    }

    return recommendations;
  }

  /**
   * Generate review recommendations
   */
  private generateReviewRecommendations(
    reviews: NonNullable<LocalSeoAgentOutput['reviews']>
  ): LocalSeoAgentOutput['recommendations'] {
    const recommendations: LocalSeoAgentOutput['recommendations'] = [];

    if (reviews.summary.replyRate < 80) {
      recommendations.push({
        category: 'reviews' as const,
        priority: 'high' as const,
        title: '提高評論回覆率',
        description: `目前回覆率僅 ${reviews.summary.replyRate}%，建議達到 90% 以上`,
        actionItems: [
          `立即回覆 ${reviews.summary.unrepliedReviews} 則未回覆評論`,
          '設定自動通知以即時收到新評論',
          '建立標準回覆模板以加快回覆速度',
        ],
      });
    }

    if (reviews.needsAttention.length > 0) {
      recommendations.push({
        category: 'reviews' as const,
        priority: 'high' as const,
        title: '處理需要關注的評論',
        description: `${reviews.needsAttention.length} 則負面或中立評論需要回覆`,
        actionItems: [
          '優先回覆負面評論，展現解決問題的誠意',
          '提供具體解決方案和聯絡方式',
          '將問題轉為私下溝通以深入處理',
        ],
      });
    }

    if (reviews.summary.averageRating < 4.5) {
      recommendations.push({
        category: 'reviews' as const,
        priority: 'medium' as const,
        title: '提升平均評分',
        description: `目前平均評分 ${reviews.summary.averageRating}，建議達到 4.5 以上`,
        actionItems: [
          '主動向滿意客戶索取評論',
          '改善服務品質以減少負面評論',
          '在適當時機（如完成服務後）請求評論',
        ],
      });
    }

    return recommendations;
  }

  /**
   * Generate citation recommendations
   */
  private generateCitationRecommendations(
    citations: NonNullable<LocalSeoAgentOutput['citations']>
  ): LocalSeoAgentOutput['recommendations'] {
    const recommendations: LocalSeoAgentOutput['recommendations'] = [];

    if (citations.summary.consistencyScore < 90) {
      recommendations.push({
        category: 'citations' as const,
        priority: 'high' as const,
        title: '修正 NAP 不一致問題',
        description: `NAP 一致性僅 ${citations.summary.consistencyScore}%，影響本地 SEO`,
        actionItems: [
          `更新 ${citations.summary.inconsistentCitations} 個不一致的 Citation`,
          '使用統一的商家名稱、地址、電話格式',
          '定期審核所有 Citation 確保資訊一致',
        ],
      });
    }

    if (citations.summary.missingCitations > 5) {
      recommendations.push({
        category: 'citations' as const,
        priority: 'medium' as const,
        title: '建立更多 Citation',
        description: `在 ${citations.summary.missingCitations} 個重要平台上缺少 Citation`,
        actionItems: [
          '在 Top 15 Citation 網站上建立商家檔案',
          '優先處理高 DA 網站（如 Yellow Pages、Yelp）',
          '確保新 Citation 使用標準化的 NAP 資訊',
        ],
      });
    }

    if (citations.inconsistencies.length > 0) {
      citations.inconsistencies.forEach(inconsistency => {
        recommendations.push({
          category: 'citations' as const,
          priority: 'high' as const,
          title: `修正 ${inconsistency.field.toUpperCase()} 不一致`,
          description: `${inconsistency.count} 個 Citation 的 ${inconsistency.field} 資訊不一致`,
          actionItems: inconsistency.examples.map(ex => `更新: ${ex}`),
        });
      });
    }

    return recommendations;
  }

  /**
   * Generate ranking recommendations
   */
  private generateRankingRecommendations(
    rankings: NonNullable<LocalSeoAgentOutput['rankings']>
  ): LocalSeoAgentOutput['recommendations'] {
    const recommendations: LocalSeoAgentOutput['recommendations'] = [];

    const mapPackCoverage = (rankings.summary.inMapPack / rankings.summary.keywords) * 100;

    if (mapPackCoverage < 50) {
      recommendations.push({
        category: 'rankings' as const,
        priority: 'high' as const,
        title: '提升 Map Pack 出現率',
        description: `僅 ${rankings.summary.inMapPack}/${rankings.summary.keywords} 個關鍵字出現在 Map Pack`,
        actionItems: [
          '優化 GMB 檔案完整度',
          '增加在地關鍵字和內容',
          '爭取更多在地評論',
        ],
      });
    }

    if (rankings.summary.avgPosition > 5) {
      recommendations.push({
        category: 'rankings' as const,
        priority: 'medium' as const,
        title: '改善本地排名',
        description: `平均排名 ${rankings.summary.avgPosition}，需要優化`,
        actionItems: [
          '加強網站的在地 SEO 優化',
          '建立更多高品質 Citation',
          '創建以地點為主的內容頁面',
        ],
      });
    }

    return recommendations;
  }
}
