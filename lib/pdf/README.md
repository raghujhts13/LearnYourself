# PDF Parsing System

Provides a unified interface to support multiple PDF parsing providers.

## Supported Providers

### 1. unpdf (Built-in)

- **Cost**: Free, built-in
- **Features**: Basic text extraction, image extraction
- **Requirements**: None
- **Usage**: Directly upload PDF files

### 2. MinerU (Self-hosted)

- **Cost**: Free (requires self-deployment)
- **Features**:
  - Advanced text extraction (retains Markdown layout)
  - Table recognition
  - Formula extraction (LaTeX)
  - Better OCR support
  - Multiple output formats (markdown, JSON, docx, html, latex)
- **Requirements**:
  - Deploy MinerU service (Docker or source code)
  - Configure server address
- **Advantages**: Data privacy, no file size limits

## Quick Start

### Deploy MinerU (Optional)

```bash
# Docker deployment (Recommended)
docker pull opendatalab/mineru:latest
docker run -d --name mineru -p 8080:8080 opendatalab/mineru:latest

# Verify
curl http://localhost:8080/api/health
```

### API Usage

#### Using unpdf (File upload)

```typescript
const formData = new FormData();
formData.append('pdf', pdfFile);
formData.append('providerId', 'unpdf');

const response = await fetch('/api/parse-pdf', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
// result.data: ParsedPdfContent
```

#### Using MinerU (Local server)

```typescript
const formData = new FormData();
formData.append('pdf', pdfFile);
formData.append('providerId', 'mineru');
formData.append('baseUrl', 'http://localhost:8080');

const response = await fetch('/api/parse-pdf', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
// result.data: ParsedPdfContent with imageMapping
```

## Response Format

```typescript
interface ParsedPdfContent {
  text: string; // Extracted text (Markdown for MinerU)
  images: string[]; // Base64 image array

  // Extended features (MinerU)
  tables?: Array<{
    page: number;
    data: string[][];
    caption?: string;
  }>;

  formulas?: Array<{
    page: number;
    latex: string;
    position?: { x: number; y: number; width: number; height: number };
  }>;

  layout?: Array<{
    page: number;
    type: 'title' | 'text' | 'image' | 'table' | 'formula';
    content: string;
    position?: { x: number; y: number; width: number; height: number };
  }>;

  metadata?: {
    pageCount: number;
    parser: 'unpdf' | 'mineru';
    fileName?: string;
    fileSize?: number;
    processingTime?: number;

    // Used for content generation workflow (MinerU)
    imageMapping?: Record<string, string>; // img_1 -> base64 URL
    pdfImages?: Array<{
      id: string; // img_1, img_2, etc.
      src: string; // base64 data URL
      pageNumber: number; // PDF page number
      description?: string; // Image description
    }>;
  };
}
```

## Integrated Content Generation

The MinerU parser smoothly integrates with the content generation workflow:

```typescript
// 1. Parse PDF
const parseResult = await parsePDF(
  {
    providerId: 'mineru',
    baseUrl: 'http://localhost:8080',
  },
  buffer,
);

// 2. Extract Data
const pdfText = parseResult.text; // Markdown (with img_1 references)
const pdfImages = parseResult.metadata.pdfImages; // Image array
const imageMapping = parseResult.metadata.imageMapping; // Image mapping

// 3. Generate Scene Outlines
await generateSceneOutlinesFromRequirements(
  requirements,
  pdfText, // Markdown content
  pdfImages, // Images with page numbers
  aiCall,
);

// 4. Generate Scene (with images)
await buildSceneFromOutline(
  outline,
  aiCall,
  stageId,
  assignedImages, // Filtered from pdfImages
  imageMapping, // Used to resolve img_1 to actual URL
);
```

## Image Processing Workflow

MinerU image processing:

1. **Extract**: PDF → MinerU → Markdown + Images
2. **Convert**: `![alt](images/img_1.png)` → `![alt](img_1)`
3. **Map**: Create `{ "img_1": "data:image/png;base64,..." }`
4. **Generate**: AI uses `img_1` reference to generate slides
5. **Resolve**: `resolveImageIds()` replaces references with actual URL
6. **Render**: Slide displays the images

## Configuration

### Global Settings

```typescript
import { useSettingsStore } from '@/lib/store/settings';

useSettingsStore.setState({
  pdfProviderId: 'mineru',
  pdfProvidersConfig: {
    mineru: {
      baseUrl: 'http://localhost:8080',
      apiKey: 'optional-if-needed',
    },
  },
});
```

### Request-Level Configuration

```typescript
// Override global settings per API call
formData.append('providerId', 'mineru');
formData.append('baseUrl', 'http://your-server:8080');
formData.append('apiKey', 'optional');
```

## Adding new providers

### 1. Define Provider

`lib/pdf/constants.ts`:

```typescript
export const PDF_PROVIDERS = {
  myProvider: {
    id: 'myProvider',
    name: 'My Provider',
    requiresApiKey: true,
    features: ['text', 'images'],
  },
};
```

### 2. Implement Parser

`lib/pdf/pdf-providers.ts`:

```typescript
async function parseWithMyProvider(
  config: PDFParserConfig,
  pdfBuffer: Buffer
): Promise<ParsedPdfContent> {
  // Parsing logic
  return {
    text: '...',
    images: [...],
    metadata: {
      pageCount: 0,
      parser: 'myProvider',
    },
  };
}
```

### 3. Add to Routing

```typescript
switch (config.providerId) {
  case 'unpdf':
    result = await parseWithUnpdf(pdfBuffer);
    break;
  case 'mineru':
    result = await parseWithMinerU(config, pdfBuffer);
    break;
  case 'myProvider':
    result = await parseWithMyProvider(config, pdfBuffer);
    break;
}
```

## Debugging Tools

Visit `http://localhost:3000/debug/pdf-parser` to test the parsing function:

- Switch provider (unpdf/MinerU)
- Upload PDF file
- Configure server address
- View parsed results
- Check image mapping

## FAQ

### Q: Cannot connect to MinerU service?

**A**: Check:

```bash
# Service status
docker ps | grep mineru

# Network connectivity
curl http://localhost:8080/api/health

# Logs
docker logs mineru
```

### Q: Images not displaying?

**A**: Verify:

1. `imageMapping` is correctly passed to scene-stream API
2. Image ID format is correct (e.g. img_1, img_2)
3. Base64 encoding is complete

### Q: Slow parsing speed?

**A**: Optimize:

```bash
# Increase Docker resources
docker run -d \
  --name mineru \
  -p 8080:8080 \
  --memory=4g \
  --cpus=2 \
  opendatalab/mineru:latest
```

### Q: When to choose unpdf vs MinerU?

**A**: Recommendations:

| Scenario                     | Suggested |
| ---------------------------- | --------- |
| Simple PDF (pure text)       | unpdf     |
| Contains formulas / tables   | MinerU    |
| Required to preserve layout  | MinerU    |
| Quick Testing                | unpdf     |
| Production                   | MinerU    |
| Unable to deploy service     | unpdf     |

## Performance Suggestions

### MinerU Concurrent Processing

```typescript
const files = [file1, file2, file3];

const results = await Promise.all(
  files.map((file) => {
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('providerId', 'mineru');
    return fetch('/api/parse-pdf', {
      method: 'POST',
      body: formData,
    }).then((r) => r.json());
  }),
);
```

### Results Caching

```typescript
// Consider caching the results
const cacheKey = `pdf_${fileHash}`;
const cached = localStorage.getItem(cacheKey);
if (cached) {
  return JSON.parse(cached);
}
```

## References

- **MinerU GitHub**: https://github.com/opendatalab/MinerU
- **Quickstart**: `/MINERU_QUICKSTART.md`
- **Changelog**: `/MINERU_LOCAL_DEPLOYMENT.md`
- **Debugging**: http://localhost:3000/debug/pdf-parser

---

**Last Updated**: 2026-02-11
**Mode**: Local Self-hosted
**Status**: Production Ready
