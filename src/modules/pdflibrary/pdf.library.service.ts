import { AnalyzedDocumentOutput, DocumentPageOutput } from "@azure-rest/ai-document-intelligence";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { AzureStorageService } from "../azurestorage/azure.storage.service";

@Injectable()
export class PdfLibraryService {
    constructor(
        private readonly configService: ConfigService,
        private readonly azureStorageService: AzureStorageService
    ) { }

    public async splitPdf(blobPath: string, analyzeDocumentResult: Array<AnalyzedDocumentOutput>, pages: Array<DocumentPageOutput>) {
        console.log('blobPath', blobPath);
        // Extract container and blob path from SAS URL
        const containerName = this.configService.get("AZURE_BLOB_CONTAINER_RESULT");
        
        // Download the PDF using Azure Storage service
        const pdfStream = await this.azureStorageService.downloadBlobAsStream(containerName, blobPath);
        
        // Convert stream to buffer with size limits
        const chunks: Buffer[] = [];
        let totalSize = 0;
        const maxSize = 100 * 1024 * 1024; // 100MB limit
        
        for await (const chunk of pdfStream) {
            const chunkBuffer = Buffer.from(chunk);
            totalSize += chunkBuffer.length;
            
            if (totalSize > maxSize) {
                throw new Error(`PDF file too large (${Math.round(totalSize / 1024 / 1024)}MB). Maximum size is 100MB.`);
            }
            
            chunks.push(chunkBuffer);
        }
        const pdfBuffer = Buffer.concat(chunks);
        const pdfBytes = new Uint8Array(pdfBuffer);
        
        // Load the PDF document
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pageCount = pdfDoc.getPageCount();
        
        const splitResults: Array<{
            docType: string;
            pageNumbers: number[];
            confidence: number;
            savedPath?: string;
            uploadResult?: any;
        }> = [];
        
        // Group documents by type and merge consecutive pages
        const groupedDocuments = new Map<string, {
            docType: string;
            allPageNumbers: number[];
            confidence: number;
            boundingRegions: any[];
        }>();
        
        // Group documents by type
        for (const document of analyzeDocumentResult) {
            const docType = document.docType;
            const boundingRegions = document.boundingRegions || [];
            
            if (boundingRegions.length === 0) continue;
            
            const pageNumbers = boundingRegions.map(region => region.pageNumber);
            
            if (groupedDocuments.has(docType)) {
                // Merge with existing group
                const existing = groupedDocuments.get(docType)!;
                existing.allPageNumbers.push(...pageNumbers);
                existing.boundingRegions.push(...boundingRegions);
                // Use the highest confidence
                existing.confidence = Math.max(existing.confidence, document.confidence);
            } else {
                // Create new group
                groupedDocuments.set(docType, {
                    docType,
                    allPageNumbers: [...pageNumbers],
                    confidence: document.confidence,
                    boundingRegions: [...boundingRegions]
                });
            }
        }
        
        console.log(`Processing ${groupedDocuments.size} grouped document types`);
        
        // Process each grouped document type
        for (const [docType, group] of groupedDocuments) {
            console.log(`Processing grouped document type: ${docType} with ${group.allPageNumbers.length} total pages`);
            
            // Sort page numbers to ensure consecutive order
            const sortedPageNumbers = [...new Set(group.allPageNumbers)].sort((a, b) => a - b);
            console.log(`Sorted pages for ${docType}: ${sortedPageNumbers.join(', ')}`);
            
            // Create a new PDF document for this grouped document type
            const newPdfDoc = await PDFDocument.create();
            
            // Copy pages from original PDF to new PDF
            let pagesCopied = 0;
            for (const pageNumber of sortedPageNumbers) {
                // PDF page numbers are 0-indexed in pdf-lib, but Azure returns 1-indexed
                const pageIndex = pageNumber - 1;
                
                if (pageIndex >= 0 && pageIndex < pageCount) {
                    const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageIndex]);
                    newPdfDoc.addPage(copiedPage);
                    pagesCopied++;
                } else {
                    console.log(`Skipping page ${pageNumber} - out of range (0-${pageCount})`);
                }
            }
            
            console.log(`Copied ${pagesCopied} pages for grouped ${docType}`);
            
            // Only create PDF if pages were actually copied
            if (pagesCopied > 0) {
                // Save the split PDF as bytes
                const splitPdfBytes = await newPdfDoc.save();
                
                // Save to Azure Blob Storage
                const fileName = `${docType}_classifier.pdf`;
                const uploadResult = await this.azureStorageService.uploadFileFromBuffer(
                    containerName,
                    `${blobPath.split('/').slice(0, -1).join('/')}/classifier/${fileName}`,
                    Buffer.from(splitPdfBytes)
                );
                
                splitResults.push({
                    docType: docType,
                    pageNumbers: sortedPageNumbers,
                    confidence: group.confidence,
                    savedPath: `${blobPath.split('/').slice(0, -1).join('/')}/classifier/${fileName}`,
                    uploadResult: uploadResult
                });
                
                console.log(`Successfully created and uploaded grouped ${docType} PDF with ${pagesCopied} pages`);
            } else {
                console.log(`Skipping grouped ${docType} - no valid pages to copy`);
            }
        }
        
        return splitResults;
    }

    public async drawBoundingBoxAnnotations(
        blobPath: string, 
        analyzeDocumentResult: Array<AnalyzedDocumentOutput>, 
        pages: Array<DocumentPageOutput>,
        module: 'classifier' | 'extractor'
    ): Promise<any> {
        console.log('blobPath', blobPath);
        // Extract container and blob path
        const containerName = this.configService.get("AZURE_BLOB_CONTAINER_RESULT");
        
        // Download the original PDF from Azure Storage
        const pdfStream = await this.azureStorageService.downloadBlobAsStream(containerName, blobPath);
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        let totalSize = 0;
        const maxSize = 100 * 1024 * 1024; // 100MB limit
        
        for await (const chunk of pdfStream) {
            const chunkBuffer = Buffer.from(chunk);
            totalSize += chunkBuffer.length;
            
            if (totalSize > maxSize) {
                throw new Error(`PDF file too large (${Math.round(totalSize / 1024 / 1024)}MB). Maximum size is 100MB.`);
            }
            
            chunks.push(chunkBuffer);
        }
        const pdfBuffer = Buffer.concat(chunks);
        const pdfBytes = new Uint8Array(pdfBuffer);
        
        // Load the PDF document
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pdfPages = pdfDoc.getPages();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 12;
        
        // Process each document from the analysis
        for (const document of analyzeDocumentResult) {
            const docType = document.docType;
            const boundingRegions = document.boundingRegions || [];
            
            console.log(`Drawing annotations for ${docType} with ${boundingRegions.length} regions`);
            
            for (const region of boundingRegions) {
                const pageNumber = region.pageNumber - 1; // Convert to 0-indexed
                const page = pdfPages[pageNumber];
                const pageInfo = pages[pageNumber];
                
                if (!page || !pageInfo) continue;
                
                const { width: pdfWidth, height: pdfHeight } = page.getSize();
                const polygon = region.polygon;
                
                if (!polygon || polygon.length < 8) continue;
                
                // Get page dimensions from Azure analysis
                const azureWidth = pageInfo.width || 0;
                const azureHeight = pageInfo.height || 0;
                
                if (azureWidth === 0 || azureHeight === 0) continue;
                
                // Convert Azure coordinates to PDF coordinates
                const scaleX = pdfWidth / azureWidth;
                const scaleY = pdfHeight / azureHeight;
                
                // Extract coordinates from polygon
                const x1 = polygon[0] * scaleX;
                const y1 = polygon[1] * scaleY;
                const x2 = polygon[2] * scaleX;
                const y2 = polygon[3] * scaleY;
                const x3 = polygon[4] * scaleX;
                const y3 = polygon[5] * scaleY;
                const x4 = polygon[6] * scaleX;
                const y4 = polygon[7] * scaleY;
                
                // Calculate bounding box
                const minX = Math.min(x1, x2, x3, x4);
                const maxX = Math.max(x1, x2, x3, x4);
                const minY = Math.min(y1, y2, y3, y4);
                const maxY = Math.max(y1, y2, y3, y4);
                
                // Convert coordinates (Azure Y is top-down, PDF Y is bottom-up)
                const boxX = minX;
                const boxY = pdfHeight - maxY; // Flip Y coordinate
                const boxWidth = maxX - minX;
                const boxHeight = maxY - minY;
                
                // Draw red rectangle border only (no fill)
                page.drawRectangle({
                    x: boxX,
                    y: boxY,
                    width: boxWidth,
                    height: boxHeight,
                    borderWidth: 3,
                    borderColor: rgb(1, 0, 0), // Red border
                });
                
                // Add text annotation
                const text = `${docType}: (${(document.confidence * 100).toFixed(1)}%)`;
                const textWidth = font.widthOfTextAtSize(text, fontSize);
                
                // Position text exactly at the top-left corner of the border
                const textX = boxX;
                const textY = boxY + boxHeight;
                
                // Draw text background as a perfect square
                const squareSize = Math.max(textWidth + 8, fontSize + 8);
                page.drawRectangle({
                    x: textX,
                    y: textY - squareSize,
                    width: squareSize,
                    height: squareSize,
                    color: rgb(1, 1, 1), // White background
                    borderWidth: 1,
                    borderColor: rgb(1, 0, 0), // Red border
                });
                
                // Center text in the square
                const centeredTextX = textX 
                const centeredTextY = textY
                
                // Draw text
                page.drawText(text, {
                    x: centeredTextX,
                    y: centeredTextY,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0), // Black text
                });
            }
        }
        
        // Save the annotated PDF
        const annotatedPdfBytes = await pdfDoc.save();
        
        // Save to Azure Blob Storage in annotations directory
        const fileName = `annotated_${blobPath.split('/').pop()}`;
        const uploadResult = await this.azureStorageService.uploadFileFromBuffer(
            containerName,
            `${blobPath.split('/').slice(0, -1).join('/')}/${module}/${fileName}`,
            Buffer.from(annotatedPdfBytes)
        );
        
        return {
            success: true,
            message: `Annotated PDF saved successfully`,
            savedPath: `${blobPath.split('/').slice(0, -1).join('/')}/${module}/${fileName}`,
            uploadResult: uploadResult,
            documentTypes: analyzeDocumentResult.map(doc => ({
                docType: doc.docType,
                confidence: doc.confidence,
                regions: doc.boundingRegions?.length || 0
            }))
        };
    }

    public async drawExtractionAnnotations(
        blobPath: string, 
        analyzeDocumentResult: Array<AnalyzedDocumentOutput>, 
        pages: Array<DocumentPageOutput>,
        module: 'classifier' | 'extractor'
    ): Promise<any> {
        console.log('blobPath', blobPath);
        // Extract container and blob path
        const containerName = this.configService.get("AZURE_BLOB_CONTAINER_RESULT");
        
        // Download the original PDF from Azure Storage
        const pdfStream = await this.azureStorageService.downloadBlobAsStream(containerName, blobPath);
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        let totalSize = 0;
        const maxSize = 100 * 1024 * 1024; // 100MB limit
        
        for await (const chunk of pdfStream) {
            const chunkBuffer = Buffer.from(chunk);
            totalSize += chunkBuffer.length;
            
            if (totalSize > maxSize) {
                throw new Error(`PDF file too large (${Math.round(totalSize / 1024 / 1024)}MB). Maximum size is 100MB.`);
            }
            
            chunks.push(chunkBuffer);
        }
        const pdfBuffer = Buffer.concat(chunks);
        const pdfBytes = new Uint8Array(pdfBuffer);
        
        // Load the PDF document
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pdfPages = pdfDoc.getPages();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 8;
        
        // Process each document from the analysis
        for (const document of analyzeDocumentResult) {
            const docType = document.docType;
            const fields = document.fields || {};
            
            console.log(`Drawing extraction annotations for ${docType} with ${Object.keys(fields).length} fields`);
            
            // Process each field in the document
            for (const [fieldName, field] of Object.entries(fields)) {
                const boundingRegions = field.boundingRegions || [];
                
                console.log(`Processing field '${fieldName}' with ${boundingRegions.length} regions`);
                
                for (const region of boundingRegions) {
                    const pageNumber = region.pageNumber - 1; // Convert to 0-indexed
                    const page = pdfPages[pageNumber];
                    const pageInfo = pages[pageNumber];
                    
                    if (!page || !pageInfo) continue;
                    
                    const { width: pdfWidth, height: pdfHeight } = page.getSize();
                    const polygon = region.polygon;
                    
                    if (!polygon || polygon.length < 8) continue;
                    
                    // Get page dimensions from Azure analysis
                    const azureWidth = pageInfo.width || 0;
                    const azureHeight = pageInfo.height || 0;
                    
                    if (azureWidth === 0 || azureHeight === 0) continue;
                    
                    // Convert Azure coordinates to PDF coordinates
                    const scaleX = pdfWidth / azureWidth;
                    const scaleY = pdfHeight / azureHeight;
                    
                    // Extract coordinates from polygon
                    const x1 = polygon[0] * scaleX;
                    const y1 = polygon[1] * scaleY;
                    const x2 = polygon[2] * scaleX;
                    const y2 = polygon[3] * scaleY;
                    const x3 = polygon[4] * scaleX;
                    const y3 = polygon[5] * scaleY;
                    const x4 = polygon[6] * scaleX;
                    const y4 = polygon[7] * scaleY;
                    
                    // Calculate bounding box
                    const minX = Math.min(x1, x2, x3, x4);
                    const maxX = Math.max(x1, x2, x3, x4);
                    const minY = Math.min(y1, y2, y3, y4);
                    const maxY = Math.max(y1, y2, y3, y4);
                    
                    // Convert coordinates (Azure Y is top-down, PDF Y is bottom-up)
                    const boxX = minX;
                    const boxY = pdfHeight - maxY; // Flip Y coordinate
                    const boxWidth = maxX - minX;
                    const boxHeight = maxY - minY;
                    
                    // Draw blue rectangle border for extraction fields
                    page.drawRectangle({
                        x: boxX,
                        y: boxY,
                        width: boxWidth,
                        height: boxHeight,
                        borderWidth: 2,
                        borderColor: rgb(0, 0, 1), // Blue border
                    });
                    
                    // Add text annotation with field name, value, and confidence
                    const fieldValue = field.valueString || field.content || '';
                    const truncatedValue = fieldValue.length > 30 ? fieldValue.substring(0, 30) + '...' : fieldValue;
                    const fieldConfidence = field.confidence || 0;
                    const text = `${fieldName}: (${(fieldConfidence * 100).toFixed(1)}%)`;
                    const textWidth = font.widthOfTextAtSize(text, fontSize);
                    
                    // Position text at the top-left corner of the border with smaller offset
                    const textX = boxX;
                    const textY = boxY + boxHeight + 2;
                    
                    // // Draw text background as a smaller rectangle without border
                    // const squareSize = Math.max(textWidth + 4, fontSize + 4);
                    // page.drawRectangle({
                    //     x: textX,
                    //     y: textY - squareSize,
                    //     width: squareSize,
                    //     height: squareSize,
                    //     color: rgb(1, 1, 1), // White background
                    //     // No border to avoid hiding underlying text
                    // });
                    
                    // Center text in the square
                    const centeredTextX = textX 
                    const centeredTextY = textY
                    
                    // Draw text
                    page.drawText(text, {
                        x: centeredTextX,
                        y: centeredTextY,
                        size: fontSize,
                        font: font,
                        color: rgb(1, 0, 0), // Red text
                    });
                }
            }
        }
        
        // Save the annotated PDF
        const annotatedPdfBytes = await pdfDoc.save();
        
        // Save to Azure Blob Storage in annotations directory
        const fileName = `annotated_${blobPath.split('/').pop()}`;
        const uploadResult = await this.azureStorageService.uploadFileFromBuffer(
            containerName,
            `${blobPath.split('/').slice(0, -1).join('/')}/${module}/${fileName}`,
            Buffer.from(annotatedPdfBytes)
        );
        
        return {
            success: true,
            message: `Extraction annotated PDF saved successfully`,
            savedPath: `${blobPath.split('/').slice(0, -1).join('/')}/${module}/${fileName}`,
            uploadResult: uploadResult,
            documentTypes: analyzeDocumentResult.map(doc => ({
                docType: doc.docType,
                confidence: doc.confidence,
                fields: Object.keys(doc.fields || {}).length
            }))
        };
    }
    
}