/**
 * Document Parsers
 * Handles TXT, DOCX, PPT, PPTX parsing
 * PDF parsing is delegated to existing pdf-providers
 */

import { createLogger } from '@/lib/logger';
import type { ParsedDocumentContent, DocumentParserConfig } from './types';

const log = createLogger('DocumentParsers');

/**
 * Parse a plain text file
 */
export async function parseTextFile(buffer: Buffer, fileName?: string): Promise<ParsedDocumentContent> {
  const startTime = Date.now();
  
  try {
    const text = buffer.toString('utf-8');
    
    return {
      type: 'txt',
      text,
      images: [],
      metadata: {
        fileName,
        fileSize: buffer.length,
        pageCount: 1,
        parser: 'text-reader',
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    log.error('Failed to parse text file:', error);
    throw new Error(`Text file parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse a DOCX file using mammoth
 * Note: mammoth package needs to be installed
 */
export async function parseDocxFile(buffer: Buffer, fileName?: string): Promise<ParsedDocumentContent> {
  const startTime = Date.now();
  
  try {
    // Dynamic import to avoid bundling if not needed
    const mammoth = await import('mammoth').catch(() => null);
    
    if (!mammoth) {
      throw new Error('mammoth package not installed. Run: npm install mammoth');
    }
    
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    // Mammoth can also extract images, but for now we'll just get text
    // Future enhancement: extract embedded images using mammoth.convertToHtml with image conversion
    
    return {
      type: 'docx',
      text,
      images: [],
      metadata: {
        fileName,
        fileSize: buffer.length,
        pageCount: 1, // DOCX doesn't have explicit pages in the same way as PDF
        parser: 'mammoth',
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    log.error('Failed to parse DOCX file:', error);
    throw new Error(`DOCX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse a PPT/PPTX file
 * Note: officeparser or similar package needs to be installed
 */
export async function parsePptxFile(
  buffer: Buffer,
  fileName?: string,
  fileType: 'ppt' | 'pptx' = 'pptx',
): Promise<ParsedDocumentContent> {
  const startTime = Date.now();
  
  try {
    // For now, we'll use a basic PPTX parser
    // In production, consider using:
    // - officeparser (for text extraction)
    // - pptx2json (for structured data)
    // - LibreOffice headless for slide images
    
    // Attempt to use officeparser if available
    const officeparser = await import('officeparser').catch(() => null);
    
    if (officeparser) {
      // officeparser returns plain text
      const text = await officeparser.parseOfficeAsync(buffer);
      
      return {
        type: fileType,
        text,
        images: [],
        slides: [], // Could be enhanced to extract slide structure
        metadata: {
          fileName,
          fileSize: buffer.length,
          slideCount: 0, // officeparser doesn't provide slide count
          parser: 'officeparser',
          processingTime: Date.now() - startTime,
        },
      };
    }
    
    // Fallback: basic PPTX XML parsing for text extraction
    if (fileType === 'pptx') {
      const extracted = await extractPptxText(buffer);
      
      return {
        type: 'pptx',
        text: extracted.text,
        images: [],
        slides: extracted.slides,
        metadata: {
          fileName,
          fileSize: buffer.length,
          slideCount: extracted.slides.length,
          parser: 'pptx-basic',
          processingTime: Date.now() - startTime,
        },
      };
    }
    
    // PPT (old format) requires special handling
    throw new Error('PPT (old PowerPoint format) parsing requires officeparser. Please upload PPTX instead or install officeparser.');
    
  } catch (error) {
    log.error(`Failed to parse ${fileType.toUpperCase()} file:`, error);
    throw new Error(`${fileType.toUpperCase()} parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text tokens from an XML string by stripping all tags.
 */
function extractTextFromXml(xml: string): string {
  return (xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [])
    .map((m) => m.replace(/<[^>]+>/g, ''))
    .join(' ')
    .trim();
}

/**
 * Parse a slide's XML into a { title, bodyText } pair.
 *
 * Title is taken from shapes whose nvPr contains a ph element with
 * type="title" or type="ctrTitle".  All remaining shapes contribute
 * to the body text.
 */
function parseSlideXml(xml: string): { title: string | undefined; bodyText: string } {
  const titleParts: string[] = [];
  const bodyParts: string[] = [];

  // Match every <p:sp>…</p:sp> shape block
  const shapeRegex = /<p:sp[\s>]([\s\S]*?)<\/p:sp>/g;
  let match: RegExpExecArray | null;

  while ((match = shapeRegex.exec(xml)) !== null) {
    const shapeBody = match[1];

    // Detect title placeholder: ph type="title" or type="ctrTitle"
    const isTitlePh = /<p:ph[^>]+type="(?:title|ctrTitle)"/.test(shapeBody);

    // Extract text from the txBody of this shape
    const txBodyMatch = shapeBody.match(/<p:txBody[\s>]([\s\S]*?)<\/p:txBody>/);
    if (!txBodyMatch) continue;

    const text = extractTextFromXml(txBodyMatch[1]);
    if (!text) continue;

    if (isTitlePh) {
      titleParts.push(text);
    } else {
      bodyParts.push(text);
    }
  }

  return {
    title: titleParts.length > 0 ? titleParts.join(' ').trim() : undefined,
    bodyText: bodyParts.join('\n').trim(),
  };
}

/**
 * Basic PPTX text extraction using JSZip.
 * Extracts per-slide title and body text from slide XML files.
 */
async function extractPptxText(buffer: Buffer): Promise<{
  text: string;
  slides: Array<{ index: number; title?: string; text: string; notes?: string }>;
}> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    
    const slides: Array<{ index: number; title?: string; text: string; notes?: string }> = [];
    let allText = '';
    
    // Get all slide files in order
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/ppt\/slides\/slide\d+\.xml/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
        return numA - numB;
      });
    
    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = slideFiles[i];
      const content = await zip.file(slideFile)?.async('string');
      
      if (content) {
        const { title, bodyText } = parseSlideXml(content);

        // Full slide text = title + body (for backward-compat allText)
        const slideText = [title, bodyText].filter(Boolean).join('\n').trim();
        
        slides.push({
          index: i,
          title,
          text: bodyText || slideText, // body only; title is separate
          notes: undefined,
        });
        
        allText += slideText + '\n\n';
      }
    }
    
    return {
      text: allText.trim(),
      slides,
    };
  } catch (error) {
    log.error('PPTX text extraction failed:', error);
    return { text: '', slides: [] };
  }
}

/**
 * Main document parser dispatcher
 */
export async function parseDocument(
  config: DocumentParserConfig,
  buffer: Buffer,
  fileName?: string,
): Promise<ParsedDocumentContent> {
  switch (config.type) {
    case 'txt':
      return parseTextFile(buffer, fileName);
    
    case 'docx':
      return parseDocxFile(buffer, fileName);
    
    case 'ppt':
    case 'pptx':
      return parsePptxFile(buffer, fileName, config.type);
    
    case 'pdf':
      // PDF parsing is handled by existing pdf-providers
      throw new Error('PDF parsing should use /api/parse-pdf endpoint');
    
    default:
      throw new Error(`Unsupported document type: ${config.type}`);
  }
}

/**
 * Get document type from MIME type or file extension
 */
export function getDocumentType(mimeType: string, fileName?: string): DocumentType | null {
  // MIME type to document type mapping
  const mimeTypeMap = {
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  } as const;
  
  // Extension to document type mapping
  const extensionMap = {
    'pdf': 'pdf',
    'txt': 'txt',
    'docx': 'docx',
    'ppt': 'ppt',
    'pptx': 'pptx',
  } as const;
  
  // Check MIME type first
  if (mimeType in mimeTypeMap) {
    return mimeTypeMap[mimeType as keyof typeof mimeTypeMap] as unknown as DocumentType;
  }
  
  // Fallback to file extension
  if (fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext && ext in extensionMap) {
      return extensionMap[ext as keyof typeof extensionMap] as unknown as DocumentType;
    }
  }
  
  return null;
}
