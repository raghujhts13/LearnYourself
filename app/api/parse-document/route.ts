/**
 * Document Parsing API Route
 * Handles PDF, DOCX, TXT, PPT, PPTX files
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { parseDocument, getDocumentType } from '@/lib/document/parsers';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import type { ParsedDocumentContent } from '@/lib/document/types';
import type { PDFParserConfig } from '@/lib/pdf/types';

const log = createLogger('ParseDocument');

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds for large documents

export async function POST(request: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    log.info(`Parsing document: ${file.name} (${file.type}, ${file.size} bytes)`);

    // Get document type
    const documentType = getDocumentType(file.type, file.name);

    if (!documentType) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type: ${file.type}. Supported types: PDF, DOCX, TXT, PPT, PPTX`,
        },
        { status: 400 },
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let result: ParsedDocumentContent;

    // Handle PDF separately using existing PDF providers
    if (documentType === 'pdf') {
      // Get PDF provider config from form data
      const providerId = (formData.get('providerId') as string) || 'unpdf';
      const apiKey = formData.get('apiKey') as string | null;
      const baseUrl = formData.get('baseUrl') as string | null;

      const config: PDFParserConfig = {
        providerId: providerId as 'unpdf' | 'mineru',
        ...(apiKey && { apiKey }),
        ...(baseUrl && { baseUrl }),
      };

      // Use existing PDF parser (note: config first, then buffer)
      const pdfResult = await parsePDF(config, buffer);

      // Convert to unified document format
      result = {
        type: 'pdf',
        text: pdfResult.text,
        images: pdfResult.images,
        tables: pdfResult.tables,
        metadata: pdfResult.metadata,
      };
    } else {
      // Parse other document types
      result = await parseDocument(
        {
          type: documentType,
        },
        buffer,
        file.name,
      );
    }

    log.info(
      `Document parsed successfully: ${result.text.length} chars, ${result.images.length} images`,
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    log.error('Document parsing error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 },
    );
  }
}
