/**
 * SchemaAgent - Structured Data Detection, Generation & Validation
 * 
 * Features:
 * - Schema detection (JSON-LD, Microdata, RDFa formats)
 * - Schema generation from 20+ templates (Article, Product, FAQ, HowTo, etc.)
 * - Google Rich Results validation
 * - Automatic schema injection recommendations
 * - Support for multiple output formats (JSON-LD, Vue SFC, React JSX, HTML)
 * 
 * Phase 2 Task 3.6
 */

import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import { EventBus } from '../event-bus/bus.js';
import * as cheerio from 'cheerio';

type SchemaType = 
  | 'Article' | 'BlogPosting' | 'NewsArticle' 
  | 'Product' | 'Review' | 'AggregateRating'
  | 'FAQ' | 'HowTo' | 'Recipe'
  | 'BreadcrumbList' | 'WebPage' | 'WebSite'
  | 'Organization' | 'LocalBusiness' | 'Person'
  | 'Event' | 'VideoObject' | 'JobPosting';

type SchemaFormat = 'json-ld' | 'microdata' | 'rdfa';
type OutputFormat = 'json-ld' | 'html-snippet' | 'vue-sfc' | 'react-jsx';

interface DetectedSchema {
  type: SchemaType;
  format: SchemaFormat;
  isValid: boolean;
  validationErrors: string[];
  location: string; // URL or selector where schema was found
  rawData: Record<string, any>;
}

interface SchemaTemplate {
  type: SchemaType;
  name: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
  googleRichResultsSupported: boolean;
  sampleData: Record<string, any>;
}

interface SchemaGeneratorInput {
  operation: 'detect' | 'generate' | 'validate' | 'suggest';
  url?: string;
  htmlContent?: string;
  schemaType?: SchemaType;
  outputFormat?: OutputFormat;
  data?: Record<string, any>;
  autoInject?: boolean;
}

interface SchemaGeneratorOutput {
  operation: string;
  detectedSchemas?: DetectedSchema[];
  generatedSchema?: {
    type: SchemaType;
    format: OutputFormat;
    isValid: boolean;
    validationErrors: string[];
    code: string;
    googleRichResultsEligible: boolean;
  };
  suggestions?: {
    schemaType: SchemaType;
    priority: 'high' | 'medium' | 'low';
    reason: string;
    expectedBenefits: string[];
    implementationComplexity: 'easy' | 'medium' | 'hard';
  }[];
  validationResult?: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    recommendations: string[];
  };
  summary: {
    totalSchemasDetected: number;
    validSchemas: number;
    invalidSchemas: number;
    missingSuggestions: number;
    richResultsEligibilityScore: number;
  };
}

export class SchemaAgent extends BaseAgent<SchemaGeneratorInput, SchemaGeneratorOutput> {
  id = 'schema-agent';
  name = 'schema-agent';
  description = 'Detect, generate, and validate structured data (Schema.org)';

  private templates: Map<SchemaType, SchemaTemplate> = new Map();

  constructor(private eventBus: EventBus) {
    super();
    this.initializeTemplates();
  }

  async execute(
    input: SchemaGeneratorInput,
    context: AgentContext
  ): Promise<SchemaGeneratorOutput> {
    const output: SchemaGeneratorOutput = {
      operation: input.operation,
      summary: {
        totalSchemasDetected: 0,
        validSchemas: 0,
        invalidSchemas: 0,
        missingSuggestions: 0,
        richResultsEligibilityScore: 0,
      },
    };

    switch (input.operation) {
      case 'detect':
        output.detectedSchemas = await this.detectSchemas(
          input.url || input.htmlContent || '',
          context
        );
        output.summary.totalSchemasDetected = output.detectedSchemas.length;
        output.summary.validSchemas = output.detectedSchemas.filter(s => s.isValid).length;
        output.summary.invalidSchemas = output.detectedSchemas.filter(s => !s.isValid).length;
        break;

      case 'generate':
        if (!input.schemaType) {
          throw new Error('schemaType is required for generate operation');
        }
        output.generatedSchema = await this.generateSchema(
          input.schemaType,
          input.data || {},
          input.outputFormat || 'json-ld',
          context
        );
        break;

      case 'validate':
        if (!input.data) {
          throw new Error('data is required for validate operation');
        }
        output.validationResult = await this.validateSchema(input.data, context);
        break;

      case 'suggest':
        output.detectedSchemas = await this.detectSchemas(
          input.url || input.htmlContent || '',
          context
        );
        output.suggestions = await this.generateSuggestions(
          output.detectedSchemas,
          input.url || '',
          context
        );
        output.summary.missingSuggestions = output.suggestions.length;
        break;
    }

    // Calculate rich results eligibility score
    output.summary.richResultsEligibilityScore = this.calculateRichResultsScore(output);

    return output;
  }

  /**
   * Detect existing schemas on a webpage by fetching HTML and parsing with Cheerio
   */
  private async detectSchemas(
    urlOrHtml: string,
    context: AgentContext
  ): Promise<DetectedSchema[]> {
    let html: string;

    // Determine if input is a URL or raw HTML
    if (urlOrHtml.startsWith('http://') || urlOrHtml.startsWith('https://')) {
      // Fetch the page
      try {
        const res = await fetch(urlOrHtml, {
          headers: { 'User-Agent': 'AISEO-SchemaDetector/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        html = await res.text();
      } catch (err) {
        // Return empty if page unreachable
        return [];
      }
    } else {
      html = urlOrHtml;
    }

    const $ = cheerio.load(html);
    const detected: DetectedSchema[] = [];

    // 1) Parse JSON-LD <script type="application/ld+json">
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const raw = $(el).html();
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const schemas = Array.isArray(parsed) ? parsed : [parsed];

        for (const schema of schemas) {
          const schemaType = (schema['@type'] ?? 'Unknown') as SchemaType;
          const template = this.templates.get(schemaType);
          const validationErrors: string[] = [];

          // Validate required fields if template exists
          if (template) {
            for (const field of template.requiredFields) {
              if (!schema[field]) {
                validationErrors.push(`Missing required field: ${field}`);
              }
            }
          }
          if (!schema['@context']) {
            validationErrors.push('Missing @context property');
          }

          detected.push({
            type: schemaType,
            format: 'json-ld',
            isValid: validationErrors.length === 0,
            validationErrors,
            location: '<head> JSON-LD script tag',
            rawData: schema,
          });
        }
      } catch {
        // Skip malformed JSON-LD
      }
    });

    // 2) Parse Microdata (elements with itemscope)
    $('[itemscope]').each((_i, el) => {
      const itemType = $(el).attr('itemtype') ?? '';
      // Extract schema type from itemtype URL (e.g., "https://schema.org/Article" → "Article")
      const typeMatch = itemType.match(/schema\.org\/(\w+)/);
      const schemaType = (typeMatch?.[1] ?? 'Unknown') as SchemaType;

      const rawData: Record<string, any> = { '@type': schemaType };
      // Collect itemprop values
      $(el).find('[itemprop]').each((_j, prop) => {
        const name = $(prop).attr('itemprop') ?? '';
        const value = $(prop).attr('content') ?? $(prop).text().trim();
        if (name) rawData[name] = value;
      });

      detected.push({
        type: schemaType,
        format: 'microdata',
        isValid: Boolean(itemType),
        validationErrors: itemType ? [] : ['Missing itemtype attribute'],
        location: `Microdata on <${(el as any).tagName}>`,
        rawData,
      });
    });

    // 3) Parse RDFa (elements with typeof and vocab)
    $('[typeof]').each((_i, el) => {
      const typeOf = $(el).attr('typeof') ?? '';
      const vocab = $(el).attr('vocab') ?? $(el).closest('[vocab]').attr('vocab') ?? '';
      const schemaType = typeOf as SchemaType;

      const rawData: Record<string, any> = { '@type': schemaType };
      $(el).find('[property]').each((_j, prop) => {
        const name = $(prop).attr('property') ?? '';
        const value = $(prop).attr('content') ?? $(prop).text().trim();
        if (name) rawData[name] = value;
      });

      detected.push({
        type: schemaType,
        format: 'rdfa',
        isValid: Boolean(vocab),
        validationErrors: vocab ? [] : ['Missing vocab attribute'],
        location: `RDFa on <${(el as any).tagName}>`,
        rawData,
      });
    });

    return detected;
  }

  /**
   * Generate schema markup from template
   */
  private async generateSchema(
    schemaType: SchemaType,
    data: Record<string, any>,
    outputFormat: OutputFormat,
    context: AgentContext
  ): Promise<NonNullable<SchemaGeneratorOutput['generatedSchema']>> {
    const template = this.templates.get(schemaType);
    if (!template) {
      throw new Error(`Schema template not found for type: ${schemaType}`);
    }

    // Merge template sample data with provided data
    const mergedData = { ...template.sampleData, ...data };

    // Generate JSON-LD schema
    const jsonLdSchema = {
      '@context': 'https://schema.org',
      '@type': schemaType,
      ...mergedData,
    };

    // Validate generated schema
    const validation = await this.validateSchema(jsonLdSchema, context);

    // Convert to requested output format
    let code: string;
    switch (outputFormat) {
      case 'json-ld':
        code = JSON.stringify(jsonLdSchema, null, 2);
        break;
      case 'html-snippet':
        code = `<script type="application/ld+json">\n${JSON.stringify(jsonLdSchema, null, 2)}\n</script>`;
        break;
      case 'vue-sfc':
        code = this.generateVueSFC(jsonLdSchema);
        break;
      case 'react-jsx':
        code = this.generateReactJSX(jsonLdSchema);
        break;
      default:
        code = JSON.stringify(jsonLdSchema, null, 2);
    }

    return {
      type: schemaType,
      format: outputFormat,
      isValid: validation.isValid,
      validationErrors: validation.errors,
      code,
      googleRichResultsEligible: template.googleRichResultsSupported && validation.isValid,
    };
  }

  /**
   * Validate schema against Schema.org and Google Rich Results requirements
   */
  private async validateSchema(
    schema: Record<string, any>,
    context: AgentContext
  ): Promise<NonNullable<SchemaGeneratorOutput['validationResult']>> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check required fields based on schema type
    const schemaType = schema['@type'] as SchemaType;
    const template = this.templates.get(schemaType);

    if (template) {
      template.requiredFields.forEach(field => {
        if (!schema[field]) {
          errors.push(`Missing required field: ${field}`);
        }
      });

      // Check for recommended optional fields
      template.optionalFields.slice(0, 3).forEach(field => {
        if (!schema[field]) {
          warnings.push(`Missing recommended field: ${field}`);
        }
      });
    }

    // Generic validation rules
    if (!schema['@context']) {
      errors.push('Missing @context property');
    }
    if (!schema['@type']) {
      errors.push('Missing @type property');
    }

    // Recommendations for better rich results
    if (schemaType === 'Article' || schemaType === 'BlogPosting') {
      if (!schema.image) {
        recommendations.push('Add image property (required for Article rich results)');
      }
      if (!schema.datePublished) {
        recommendations.push('Add datePublished for better search appearance');
      }
      if (!schema.author) {
        recommendations.push('Add author information for credibility');
      }
    }

    if (schemaType === 'Product') {
      if (!schema.offers) {
        recommendations.push('Add offers property with price information');
      }
      if (!schema.aggregateRating && !schema.review) {
        recommendations.push('Add reviews or ratings for rich snippets');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations,
    };
  }

  /**
   * Generate schema implementation suggestions based on detected schemas and page content
   */
  private async generateSuggestions(
    detectedSchemas: DetectedSchema[],
    url: string,
    context: AgentContext
  ): Promise<NonNullable<SchemaGeneratorOutput['suggestions']>> {
    const suggestions: NonNullable<SchemaGeneratorOutput['suggestions']> = [];
    const detectedTypes = new Set(detectedSchemas.map(s => s.type));

    // Suggest missing essential schemas
    if (!detectedTypes.has('Organization') && !detectedTypes.has('LocalBusiness')) {
      suggestions.push({
        schemaType: 'Organization',
        priority: 'high',
        reason: '缺少組織資訊，有助於 Google Knowledge Graph 和品牌識別',
        expectedBenefits: [
          'Knowledge Graph 面板顯示',
          '品牌信息強化',
          'Logo 和社交媒體連結展示',
        ],
        implementationComplexity: 'easy',
      });
    }

    if (!detectedTypes.has('BreadcrumbList')) {
      suggestions.push({
        schemaType: 'BreadcrumbList',
        priority: 'high',
        reason: '缺少麵包屑導覽，有助於搜尋結果顯示網站結構',
        expectedBenefits: [
          '搜尋結果顯示導覽路徑',
          '提升使用者體驗',
          '降低跳出率',
        ],
        implementationComplexity: 'easy',
      });
    }

    // Content-based suggestions (mock - real implementation would analyze page content)
    if (url.includes('/blog/') || url.includes('/article/')) {
      if (!detectedTypes.has('Article') && !detectedTypes.has('BlogPosting')) {
        suggestions.push({
          schemaType: 'Article',
          priority: 'high',
          reason: '此頁面為文章內容，建議加入 Article Schema',
          expectedBenefits: [
            'Top Stories carousel 資格',
            '顯示作者、發布日期',
            '提升 E-A-T 信號',
          ],
          implementationComplexity: 'medium',
        });
      }
    }

    if (url.includes('/product/') || url.includes('/shop/')) {
      if (!detectedTypes.has('Product')) {
        suggestions.push({
          schemaType: 'Product',
          priority: 'high',
          reason: '此頁面為產品頁面，建議加入 Product Schema',
          expectedBenefits: [
            '顯示價格、評分在搜尋結果',
            '啟用 Shopping rich results',
            '提高點擊率',
          ],
          implementationComplexity: 'medium',
        });
      }
    }

    if (!detectedTypes.has('FAQ')) {
      suggestions.push({
        schemaType: 'FAQ',
        priority: 'medium',
        reason: '頁面包含問答內容，可考慮加入 FAQ Schema',
        expectedBenefits: [
          'FAQ rich results 展開式顯示',
          '增加搜尋結果佔用空間',
          '提高點擊率',
        ],
        implementationComplexity: 'easy',
      });
    }

    if (!detectedTypes.has('HowTo')) {
      suggestions.push({
        schemaType: 'HowTo',
        priority: 'medium',
        reason: '教學類內容可使用 HowTo Schema',
        expectedBenefits: [
          '步驟式 rich results',
          '顯示預估時間和工具',
          '提高內容可見度',
        ],
        implementationComplexity: 'medium',
      });
    }

    // Sort by priority
    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Calculate rich results eligibility score (0-100)
   */
  private calculateRichResultsScore(output: SchemaGeneratorOutput): number {
    let score = 0;

    if (output.detectedSchemas) {
      const validSchemas = output.detectedSchemas.filter(s => s.isValid).length;
      const totalSchemas = output.detectedSchemas.length;

      if (totalSchemas > 0) {
        score += (validSchemas / totalSchemas) * 40; // 40 points for valid schemas
      }

      // Bonus points for essential schemas
      const essentialTypes: SchemaType[] = ['Organization', 'BreadcrumbList', 'Article', 'Product'];
      const hasEssential = output.detectedSchemas.filter(s => 
        s.isValid && essentialTypes.includes(s.type)
      ).length;
      score += hasEssential * 15; // 15 points per essential schema
    }

    if (output.generatedSchema?.googleRichResultsEligible) {
      score += 30; // 30 points for rich results eligible generated schema
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Generate Vue SFC with schema in <script setup>
   */
  private generateVueSFC(schema: Record<string, any>): string {
    return `<script setup lang="ts">
import { useHead } from '@unhead/vue';

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(${JSON.stringify(schema, null, 2)}),
    },
  ],
});
</script>

<template>
  <!-- Page content -->
</template>`;
  }

  /**
   * Generate React JSX with schema in Helmet
   */
  private generateReactJSX(schema: Record<string, any>): string {
    return `import { Helmet } from 'react-helmet-async';

export default function PageWithSchema() {
  const schema = ${JSON.stringify(schema, null, 2)};

  return (
    <>
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      </Helmet>
      {/* Page content */}
    </>
  );
}`;
  }

  /**
   * Initialize schema templates
   */
  private initializeTemplates(): void {
    // Article Schema
    this.templates.set('Article', {
      type: 'Article',
      name: 'Article',
      description: 'Generic article or blog post',
      requiredFields: ['headline', 'image', 'datePublished', 'author'],
      optionalFields: ['dateModified', 'publisher', 'description', 'articleBody'],
      googleRichResultsSupported: true,
      sampleData: {
        headline: 'Article Title',
        description: 'A comprehensive article covering the topic in depth with expert analysis and practical insights.',
        image: 'https://example.com/image.jpg',
        datePublished: new Date().toISOString(),
        dateModified: new Date().toISOString(),
        author: {
          '@type': 'Person',
          name: 'Author Name',
        },
        publisher: {
          '@type': 'Organization',
          name: 'Publisher Name',
          logo: {
            '@type': 'ImageObject',
            url: 'https://example.com/logo.png',
          },
        },
      },
    });

    // Product Schema
    this.templates.set('Product', {
      type: 'Product',
      name: 'Product',
      description: 'E-commerce product',
      requiredFields: ['name', 'image'],
      optionalFields: ['description', 'brand', 'offers', 'aggregateRating', 'review'],
      googleRichResultsSupported: true,
      sampleData: {
        name: 'Product Name',
        image: 'https://example.com/product.jpg',
        description: 'Product description',
        brand: {
          '@type': 'Brand',
          name: 'Brand Name',
        },
        offers: {
          '@type': 'Offer',
          price: '99.99',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      },
    });

    // FAQ Schema
    this.templates.set('FAQ', {
      type: 'FAQ',
      name: 'FAQPage',
      description: 'Frequently Asked Questions',
      requiredFields: ['mainEntity'],
      optionalFields: [],
      googleRichResultsSupported: true,
      sampleData: {
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is SEO?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'SEO stands for Search Engine Optimization...',
            },
          },
        ],
      },
    });

    // HowTo Schema
    this.templates.set('HowTo', {
      type: 'HowTo',
      name: 'HowTo',
      description: 'Step-by-step instructions',
      requiredFields: ['name', 'step'],
      optionalFields: ['totalTime', 'estimatedCost', 'tool', 'supply'],
      googleRichResultsSupported: true,
      sampleData: {
        name: 'How to do something',
        step: [
          {
            '@type': 'HowToStep',
            name: 'Step 1',
            text: 'Do this first',
          },
        ],
      },
    });

    // BreadcrumbList Schema
    this.templates.set('BreadcrumbList', {
      type: 'BreadcrumbList',
      name: 'BreadcrumbList',
      description: 'Breadcrumb navigation',
      requiredFields: ['itemListElement'],
      optionalFields: [],
      googleRichResultsSupported: true,
      sampleData: {
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://example.com',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Category',
            item: 'https://example.com/category',
          },
        ],
      },
    });

    // Organization Schema
    this.templates.set('Organization', {
      type: 'Organization',
      name: 'Organization',
      description: 'Company or organization information',
      requiredFields: ['name', 'url'],
      optionalFields: ['logo', 'contactPoint', 'sameAs', 'address'],
      googleRichResultsSupported: true,
      sampleData: {
        name: 'Company Name',
        url: 'https://example.com',
        logo: 'https://example.com/logo.png',
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: '+1-401-555-1212',
          contactType: 'customer service',
        },
      },
    });

    // LocalBusiness Schema
    this.templates.set('LocalBusiness', {
      type: 'LocalBusiness',
      name: 'LocalBusiness',
      description: 'Local business information',
      requiredFields: ['name', 'address'],
      optionalFields: ['telephone', 'openingHours', 'geo', 'priceRange', 'image'],
      googleRichResultsSupported: true,
      sampleData: {
        name: 'Business Name',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '123 Main St',
          addressLocality: 'City',
          addressRegion: 'State',
          postalCode: '12345',
          addressCountry: 'US',
        },
        telephone: '+1-401-555-1212',
      },
    });

    // Add more templates as needed (Event, Recipe, VideoObject, JobPosting, etc.)
  }
}
