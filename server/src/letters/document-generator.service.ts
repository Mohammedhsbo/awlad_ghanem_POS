import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../upload/storage.service.js';
import { LetterType } from '@motorcycle-system/shared-types';

export interface DocumentGenerationOptions {
  letterId: string;
  documentType: 'delivery' | 'receipt';
  regenerate?: boolean;
  userId: string;
}

export interface GeneratedDocument {
  id: string;
  storageRef: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  version: number;
  url?: string;
}

@Injectable()
export class DocumentGeneratorService {
  private readonly logger = new Logger(DocumentGeneratorService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService
  ) {}

  /**
   * Generate or regenerate a document for a letter
   */
  async generateDocument(options: DocumentGenerationOptions): Promise<GeneratedDocument> {
    const { letterId, documentType, regenerate = false, userId } = options;

    // Fetch letter with all related data
    const letter = await this.prisma.letter.findUnique({
      where: { id: letterId },
      include: {
        customer: true,
        motorcycle: {
          include: {
            brand: true,
            category: true,
          },
        },
        order: true,
        reservation: true,
        branch: true,
        creator: true,
        confirmer: true,
      },
    });

    if (!letter) {
      throw new Error('LETTER_NOT_FOUND');
    }

    // Check if document already exists
    let version = 1;
    if (!regenerate) {
      const existingDoc = await this.prisma.letterDocument.findFirst({
        where: {
          letterId,
          documentType,
        },
        orderBy: {
          version: 'desc',
        },
      });

      if (existingDoc) {
        // Return existing document
        return {
          id: existingDoc.id,
          storageRef: existingDoc.storageRef,
          fileName: existingDoc.fileName,
          fileSize: existingDoc.fileSize,
          mimeType: existingDoc.mimeType,
          version: existingDoc.version,
        };
      }
    } else {
      // Get next version number
      const lastDoc = await this.prisma.letterDocument.findFirst({
        where: {
          letterId,
          documentType,
        },
        orderBy: {
          version: 'desc',
        },
      });

      version = lastDoc ? lastDoc.version + 1 : 1;
    }

    // Generate HTML content
    const htmlContent = this.generateHTMLDocument(letter, documentType);

    // Create buffer from HTML
    const buffer = Buffer.from(htmlContent, 'utf-8');

    // Upload to storage
    const fileName = `${letter.letterNumber.replace(/[^a-zA-Z0-9-]/g, '_')}_${documentType}_v${version}.html`;
    const key = `letters/${letter.branchId}/${fileName}`;

    // Mock multer file structure for storage service
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: 'text/html',
      buffer: buffer,
      size: buffer.length,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    const uploadResult = await this.storage.uploadFile(mockFile, `letters/${letter.branchId}`);

    // Save document metadata
    const document = await this.prisma.letterDocument.create({
      data: {
        letterId,
        documentType,
        fileName,
        fileSize: buffer.length,
        mimeType: 'text/html',
        storageRef: uploadResult.filename,
        version,
        createdBy: userId,
      },
    });

    this.logger.log(`Generated document ${document.id} for letter ${letterId}, version ${version}`);

    return {
      id: document.id,
      storageRef: document.storageRef,
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      version: document.version,
      url: uploadResult.url,
    };
  }

  /**
   * Get a signed URL for a document
   */
  async getDocumentUrl(storageRef: string): Promise<string> {
    // StorageService builds URLs directly, just return the constructed URL
    // For S3/MinIO, the URL is already accessible if the bucket has public read
    // For private buckets, this would need presigned URL support
    return (this.storage as any).buildUrl(storageRef);
  }

  /**
   * Generate HTML document content
   */
  private generateHTMLDocument(letter: any, documentType: string): string {
    const isDelivery = documentType === 'delivery';
    const title = isDelivery ? 'Motorcycle Delivery Document' : 'Motorcycle Receipt Document';

    const currentDate = new Date().toLocaleDateString('en-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${letter.letterNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 40px;
    }
    .header h1 { color: #2563eb; font-size: 28px; margin-bottom: 10px; }
    .header .letter-number { 
      font-size: 16px; 
      color: #666; 
      font-weight: 600;
      letter-spacing: 1px;
    }
    .section {
      margin-bottom: 30px;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
      border-left: 4px solid #2563eb;
    }
    .section h2 {
      color: #1e40af;
      font-size: 18px;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    .info-item {
      display: flex;
      flex-direction: column;
    }
    .info-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .info-value {
      font-size: 15px;
      color: #111827;
      font-weight: 500;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-issued { background: #fef3c7; color: #92400e; }
    .status-received { background: #d1fae5; color: #065f46; }
    .status-not_received { background: #fee2e2; color: #991b1b; }
    .signature-section {
      margin-top: 60px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
    }
    .signature-box {
      border-top: 2px solid #333;
      padding-top: 15px;
    }
    .signature-label {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 5px;
    }
    .signature-name {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
    }
    .note-box {
      background: #fffbeb;
      border: 1px solid #fbbf24;
      border-radius: 6px;
      padding: 15px;
      margin-top: 20px;
    }
    .note-box p {
      font-size: 14px;
      color: #92400e;
    }
    @media print {
      body { padding: 20px; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <p class="letter-number">Letter Number: ${letter.letterNumber}</p>
    <p style="font-size: 14px; color: #6b7280; margin-top: 10px;">Date: ${currentDate}</p>
  </div>

  <!-- Status Section -->
  <div class="section">
    <h2>Document Status</h2>
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div>
        <span class="status-badge status-${letter.status}">${letter.status.replace('_', ' ')}</span>
      </div>
      <div style="text-align: right;">
        <div class="info-label">Issued At</div>
        <div class="info-value">${new Date(letter.issuedAt).toLocaleString('en-EG')}</div>
      </div>
    </div>
    ${letter.confirmedAt ? `
    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
      <div class="info-label">Confirmed At</div>
      <div class="info-value">${new Date(letter.confirmedAt).toLocaleString('en-EG')}</div>
    </div>
    ` : ''}
  </div>

  <!-- Customer Information -->
  <div class="section">
    <h2>Customer Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Customer Name</div>
        <div class="info-value">${letter.customer.name}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Phone</div>
        <div class="info-value">${letter.customer.phone}</div>
      </div>
      ${letter.customer.email ? `
      <div class="info-item">
        <div class="info-label">Email</div>
        <div class="info-value">${letter.customer.email}</div>
      </div>
      ` : ''}
      ${letter.customer.nationalId ? `
      <div class="info-item">
        <div class="info-label">National ID</div>
        <div class="info-value">${letter.customer.nationalId}</div>
      </div>
      ` : ''}
    </div>
  </div>

  <!-- Motorcycle Information -->
  <div class="section">
    <h2>Motorcycle Details</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Brand</div>
        <div class="info-value">${letter.motorcycle.brand.nameEn}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Model</div>
        <div class="info-value">${letter.motorcycle.model}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Year</div>
        <div class="info-value">${letter.motorcycle.year}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Color</div>
        <div class="info-value">${letter.motorcycle.color || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">VIN</div>
        <div class="info-value" style="font-family: monospace;">${letter.motorcycle.vin}</div>
      </div>
      ${letter.motorcycle.engineSize ? `
      <div class="info-item">
        <div class="info-label">Engine Size</div>
        <div class="info-value">${letter.motorcycle.engineSize}</div>
      </div>
      ` : ''}
    </div>
  </div>

  <!-- Transaction Information -->
  ${letter.order || letter.reservation ? `
  <div class="section">
    <h2>Transaction Information</h2>
    <div class="info-grid">
      ${letter.order ? `
      <div class="info-item">
        <div class="info-label">Order Number</div>
        <div class="info-value">${letter.order.orderNumber}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Order Status</div>
        <div class="info-value">${letter.order.status.replace('_', ' ')}</div>
      </div>
      ` : ''}
      ${letter.reservation ? `
      <div class="info-item">
        <div class="info-label">Reservation Number</div>
        <div class="info-value">${letter.reservation.reservationNumber}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Reservation Status</div>
        <div class="info-value">${letter.reservation.status.replace('_', ' ')}</div>
      </div>
      ` : ''}
    </div>
  </div>
  ` : ''}

  <!-- Branch Information -->
  <div class="section">
    <h2>Branch Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Branch</div>
        <div class="info-value">${letter.branch.nameEn}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Created By</div>
        <div class="info-value">${letter.creator.name}</div>
      </div>
      ${letter.confirmer ? `
      <div class="info-item">
        <div class="info-label">Confirmed By</div>
        <div class="info-value">${letter.confirmer.name}</div>
      </div>
      ` : ''}
    </div>
  </div>

  ${letter.notes ? `
  <div class="note-box">
    <p><strong>Notes:</strong> ${letter.notes}</p>
  </div>
  ` : ''}

  <!-- Signature Section -->
  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-label">Customer Signature</div>
      <div class="signature-name">${letter.customer.name}</div>
      <div style="margin-top: 40px; height: 60px; border-bottom: 1px solid #333;"></div>
      <div style="margin-top: 5px; font-size: 12px; color: #6b7280;">Date: _____________________</div>
    </div>
    <div class="signature-box">
      <div class="signature-label">Staff Signature</div>
      <div class="signature-name">${letter.creator.name}</div>
      <div style="margin-top: 40px; height: 60px; border-bottom: 1px solid #333;"></div>
      <div style="margin-top: 5px; font-size: 12px; color: #6b7280;">Date: _____________________</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>This is an official ${isDelivery ? 'delivery' : 'receipt'} document for motorcycle handover.</p>
    <p style="margin-top: 5px;">Generated on ${currentDate} | Document Version ${1}</p>
  </div>
</body>
</html>`;
  }
}
