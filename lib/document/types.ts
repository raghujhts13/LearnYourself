/**
 * Document Parsing Type Definitions
 * Supports PDF, DOCX, TXT, PPT, PPTX
 */

import type { ParsedPdfContent } from '@/lib/types/pdf';

/**
 * Document type identifiers
 */
export type DocumentType = 'pdf' | 'docx' | 'txt' | 'ppt' | 'pptx';

/**
 * Document Provider IDs (extends PDF providers)
 */
export type DocumentProviderId = 'unpdf' | 'mineru' | 'mammoth' | 'text-reader' | 'pptx-parser';

/**
 * Parsed document content (unified format)
 */
export interface ParsedDocumentContent {
  /** Document type */
  type: DocumentType;
  
  /** Extracted text content */
  text: string;
  
  /** Array of images as base64 data URLs */
  images: string[];
  
  /** Extracted tables (if supported by parser) */
  tables?: Array<{
    page: number;
    data: string[][];
    caption?: string;
  }>;
  
  /** Presentation slides (PPT/PPTX specific) */
  slides?: Array<{
    index: number;
    title?: string;
    text: string;
    notes?: string;
    imageBase64?: string;
  }>;
  
  /** Metadata about the document */
  metadata?: {
    fileName?: string;
    fileSize?: number;
    pageCount?: number;
    slideCount?: number;
    parser?: string;
    processingTime?: number;
    /** Image ID to base64 URL mapping (used in generation pipeline) */
    imageMapping?: Record<string, string>;
    /** PdfImage array with page numbers (used in generation pipeline) */
    pdfImages?: Array<{
      id: string;
      src: string;
      pageNumber: number;
      description?: string;
      width?: number;
      height?: number;
    }>;
    [key: string]: unknown;
  };
}

/**
 * Document Parser Configuration
 */
export interface DocumentParserConfig {
  type: DocumentType;
  providerId?: DocumentProviderId;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Type guard to check if content is from a presentation
 */
export function isPresentationContent(
  content: ParsedDocumentContent,
): content is ParsedDocumentContent & { slides: NonNullable<ParsedDocumentContent['slides']> } {
  return (content.type === 'ppt' || content.type === 'pptx') && !!content.slides;
}

/**
 * Convert ParsedDocumentContent to ParsedPdfContent for backward compatibility
 */
export function documentContentToPdfContent(doc: ParsedDocumentContent): ParsedPdfContent {
  return {
    text: doc.text,
    images: doc.images,
    tables: doc.tables,
    metadata: doc.metadata
      ? {
          ...doc.metadata,
          pageCount: doc.metadata.pageCount ?? doc.metadata.slideCount ?? 0,
        }
      : { pageCount: 0 },
  };
}
