import {
    AnalyzedDocumentOutput,
    DocumentPageOutput,
} from '@azure-rest/ai-document-intelligence';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { AzureStorageService } from '../azurestorage/azure.storage.service';

@Injectable()
export class PdfLibraryService {
    constructor(
        private readonly configService: ConfigService,
        private readonly azureStorageService: AzureStorageService,
    ) { }

    public async splitPdf(
        blobPath: string,
        analyzeDocumentResult: Array<AnalyzedDocumentOutput>,
        pages: Array<DocumentPageOutput>,
    ) {
        console.log('blobPath', blobPath);
        // Extract container and blob path from SAS URL
        const containerName = this.configService.get('AZURE_BLOB_CONTAINER_RESULT');

        // Download the PDF using Azure Storage service
        const pdfStream = await this.azureStorageService.downloadBlobAsStream(
            containerName,
            blobPath,
        );

        // Convert stream to buffer with size limits
        const chunks: Buffer[] = [];
        let totalSize = 0;
        const maxSize = 100 * 1024 * 1024; // 100MB limit

        for await (const chunk of pdfStream) {
            const chunkBuffer = Buffer.from(chunk);
            totalSize += chunkBuffer.length;

            if (totalSize > maxSize) {
                throw new Error(
                    `PDF file too large (${Math.round(totalSize / 1024 / 1024)}MB). Maximum size is 100MB.`,
                );
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
        const groupedDocuments = new Map<
            string,
            {
                docType: string;
                allPageNumbers: number[];
                confidence: number;
                boundingRegions: any[];
            }
        >();

        // Group documents by type
        for (const document of analyzeDocumentResult) {
            const docType = document.docType;
            const boundingRegions = document.boundingRegions || [];

            if (boundingRegions.length === 0) continue;

            const pageNumbers = boundingRegions.map((region) => region.pageNumber);

            if (groupedDocuments.has(docType)) {
                // Merge with existing group
                const existing = groupedDocuments.get(docType)!;
                existing.allPageNumbers.push(...pageNumbers);
                existing.boundingRegions.push(...boundingRegions);
                // Use the highest confidence
                existing.confidence = Math.max(
                    existing.confidence,
                    document.confidence,
                );
            } else {
                // Create new group
                groupedDocuments.set(docType, {
                    docType,
                    allPageNumbers: [...pageNumbers],
                    confidence: document.confidence,
                    boundingRegions: [...boundingRegions],
                });
            }
        }

        console.log(`Processing ${groupedDocuments.size} grouped document types`);

        // Process each grouped document type
        for (const [docType, group] of groupedDocuments) {
            console.log(
                `Processing grouped document type: ${docType} with ${group.allPageNumbers.length} total pages`,
            );

            // Sort page numbers to ensure consecutive order
            const sortedPageNumbers = [...new Set(group.allPageNumbers)].sort(
                (a, b) => a - b,
            );
            console.log(
                `Sorted pages for ${docType}: ${sortedPageNumbers.join(', ')}`,
            );

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
                    console.log(
                        `Skipping page ${pageNumber} - out of range (0-${pageCount})`,
                    );
                }
            }

            console.log(`Copied ${pagesCopied} pages for grouped ${docType}`);

            // Only create PDF if pages were actually copied
            if (pagesCopied > 0) {
                // Save the split PDF as bytes
                const splitPdfBytes = await newPdfDoc.save();

                // Save to Azure Blob Storage
                const fileName = `${docType}_classifier.pdf`;
                const uploadResult =
                    await this.azureStorageService.uploadFileFromBuffer(
                        containerName,
                        `${blobPath.split('/').slice(0, -1).join('/')}/classifier/${fileName}`,
                        Buffer.from(splitPdfBytes),
                    );

                splitResults.push({
                    docType: docType,
                    pageNumbers: sortedPageNumbers,
                    confidence: group.confidence,
                    savedPath: `${blobPath.split('/').slice(0, -1).join('/')}/classifier/${fileName}`,
                    uploadResult: uploadResult,
                });

                console.log(
                    `Successfully created and uploaded grouped ${docType} PDF with ${pagesCopied} pages`,
                );
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
        module: 'classifier' | 'extractor',
    ): Promise<any> {
        console.log('blobPath', blobPath);
        // Extract container and blob path
        const containerName = this.configService.get('AZURE_BLOB_CONTAINER_RESULT');

        // Download the original PDF from Azure Storage
        const pdfStream = await this.azureStorageService.downloadBlobAsStream(
            containerName,
            blobPath,
        );

        // Convert stream to buffer
        const chunks: Buffer[] = [];
        let totalSize = 0;
        const maxSize = 100 * 1024 * 1024; // 100MB limit

        for await (const chunk of pdfStream) {
            const chunkBuffer = Buffer.from(chunk);
            totalSize += chunkBuffer.length;

            if (totalSize > maxSize) {
                throw new Error(
                    `PDF file too large (${Math.round(totalSize / 1024 / 1024)}MB). Maximum size is 100MB.`,
                );
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

            console.log(
                `Drawing annotations for ${docType} with ${boundingRegions.length} regions`,
            );

            for (const region of boundingRegions) {
                const pageNumber = region.pageNumber - 1; // Convert to 0-indexed
                const page = pdfPages[pageNumber];
                const pageInfo = pages[pageNumber];

                if (!page || !pageInfo) continue;

                const { width: pdfWidth, height: pdfHeight } = page.getSize();
                const polygon = region.polygon;

                if (!polygon || polygon.length < 8) continue;

                // Get page dimensions and rotation from Azure analysis
                const azureWidth = pageInfo.width || 0;
                const azureHeight = pageInfo.height || 0;
                const pageAngle = pageInfo.angle || 0;

                if (azureWidth === 0 || azureHeight === 0) continue;

                console.log(
                    `Page ${pageNumber + 1}: PDF size=${pdfWidth}x${pdfHeight}, Azure size=${azureWidth}x${azureHeight}, angle=${pageAngle}°`,
                );

                // Convert Azure coordinates to PDF coordinates
                // Try different coordinate systems - Azure might provide coordinates in different units
                let scaleX, scaleY;
                let x1, y1, x2, y2, x3, y3, x4, y4;

                // Method 1: Treat as normalized coordinates (0-1 range)
                scaleX = pdfWidth;
                scaleY = pdfHeight;
                x1 = polygon[0] * scaleX;
                y1 = polygon[1] * scaleY;
                x2 = polygon[2] * scaleX;
                y2 = polygon[3] * scaleY;
                x3 = polygon[4] * scaleX;
                y3 = polygon[5] * scaleY;
                x4 = polygon[6] * scaleX;
                y4 = polygon[7] * scaleY;

                console.log(
                    `Document '${docType}' - Method 1 (normalized): x1=${x1}, y1=${y1}, x2=${x2}, y2=${y2}, x3=${x3}, y3=${y3}, x4=${x4}, y4=${y4}`,
                );

                // Method 2: Treat as inches (1 inch = 72 points)
                const scaleXInches = pdfWidth / (azureWidth * 72);
                const scaleYInches = pdfHeight / (azureHeight * 72);
                const x1Inches = polygon[0] * 72 * scaleXInches;
                const y1Inches = polygon[1] * 72 * scaleYInches;
                const x2Inches = polygon[2] * 72 * scaleXInches;
                const y2Inches = polygon[3] * 72 * scaleYInches;
                const x3Inches = polygon[4] * 72 * scaleXInches;
                const y3Inches = polygon[5] * 72 * scaleYInches;
                const x4Inches = polygon[6] * 72 * scaleXInches;
                const y4Inches = polygon[7] * 72 * scaleYInches;

                console.log(
                    `Document '${docType}' - Method 2 (inches): x1=${x1Inches}, y1=${y1Inches}, x2=${x2Inches}, y2=${y2Inches}, x3=${x3Inches}, y3=${y3Inches}, x4=${x4Inches}, y4=${y4Inches}`,
                );

                // Method 3: Treat as points directly (no scaling)
                const x1Points = polygon[0];
                const y1Points = polygon[1];
                const x2Points = polygon[2];
                const y2Points = polygon[3];
                const x3Points = polygon[4];
                const y3Points = polygon[5];
                const x4Points = polygon[6];
                const y4Points = polygon[7];

                console.log(
                    `Document '${docType}' - Method 3 (points): x1=${x1Points}, y1=${y1Points}, x2=${x2Points}, y2=${y2Points}, x3=${x3Points}, y3=${y3Points}, x4=${x4Points}, y4=${y4Points}`,
                );

                // Method 4: Treat as relative to page dimensions in inches
                // But convert inches to points first (1 inch = 72 points)
                const scaleXRelative = (pdfWidth / azureWidth) * 72;
                const scaleYRelative = (pdfHeight / azureHeight) * 72;
                const x1Relative = polygon[0] * scaleXRelative;
                const y1Relative = polygon[1] * scaleYRelative;
                const x2Relative = polygon[2] * scaleXRelative;
                const y2Relative = polygon[3] * scaleYRelative;
                const x3Relative = polygon[4] * scaleXRelative;
                const y3Relative = polygon[5] * scaleYRelative;
                const x4Relative = polygon[6] * scaleXRelative;
                const y4Relative = polygon[7] * scaleYRelative;

                console.log(
                    `Document '${docType}' - Method 4 (relative): x1=${x1Relative}, y1=${y1Relative}, x2=${x2Relative}, y2=${y2Relative}, x3=${x3Relative}, y3=${y3Relative}, x4=${x4Relative}, y4=${y4Relative}`,
                );

                // Scale coordinates relative to page dimensions
                // The coordinates are in inches, scale them to PDF dimensions
                scaleX = pdfWidth / azureWidth;
                scaleY = pdfHeight / azureHeight;
                x1 = polygon[0] * scaleX;
                y1 = polygon[1] * scaleY;
                x2 = polygon[2] * scaleX;
                y2 = polygon[3] * scaleY;
                x3 = polygon[4] * scaleX;
                y3 = polygon[5] * scaleY;
                x4 = polygon[6] * scaleX;
                y4 = polygon[7] * scaleY;

                console.log(`Document '${docType}' polygon: [${polygon.join(', ')}]`);
                console.log(
                    `Document '${docType}' final coordinates: x1=${x1}, y1=${y1}, x2=${x2}, y2=${y2}, x3=${x3}, y3=${y3}, x4=${x4}, y4=${y4}`,
                );

                // Calculate bounding box
                const minX = Math.min(x1, x2, x3, x4);
                const maxX = Math.max(x1, x2, x3, x4);
                const minY = Math.min(y1, y2, y3, y4);
                const maxY = Math.max(y1, y2, y3, y4);

                console.log(
                    `Document '${docType}' bounding box: minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}`,
                );

                // Convert coordinates - Azure coordinates are already correct for the field position
                // We only need to scale and flip the Y coordinate
                const boxX = minX;
                const boxY = pdfHeight - maxY; // Flip Y coordinate (Azure: top-down, PDF: bottom-up)
                const boxWidth = maxX - minX;
                const boxHeight = maxY - minY;

                console.log(
                    `Document '${docType}' final box: x=${boxX}, y=${boxY}, width=${boxWidth}, height=${boxHeight}`,
                );

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

                // Position text at the top-left corner of the bounding box
                const textX = boxX;
                const textY = boxY + boxHeight;
                const squareSize = Math.max(textWidth + 8, fontSize + 8);

                // Draw text background as a perfect square
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
                const centeredTextX = textX + (squareSize - textWidth) / 2;
                const centeredTextY = textY - (squareSize - fontSize) / 2;

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
            Buffer.from(annotatedPdfBytes),
        );

        return {
            success: true,
            message: `Annotated PDF saved successfully`,
            savedPath: `${blobPath.split('/').slice(0, -1).join('/')}/${module}/${fileName}`,
            uploadResult: uploadResult,
            documentTypes: analyzeDocumentResult.map((doc) => ({
                docType: doc.docType,
                confidence: doc.confidence,
                regions: doc.boundingRegions?.length || 0,
            })),
        };
    }

    public async drawExtractionAnnotations(
        blobPath: string,
        analyzeDocumentResult: Array<AnalyzedDocumentOutput>,
        module: 'classifier' | 'extractor',
    ): Promise<any> {
        console.log('blobPath', blobPath);
        console.log('analyzeDocumentResult', JSON.stringify(analyzeDocumentResult));
        // return 'ok';

        const containerName = this.configService.get('AZURE_BLOB_CONTAINER_RESULT');
        const pdfStream = await this.azureStorageService.downloadBlobAsStream(
            containerName,
            blobPath,
        );

        // Convert stream to buffer
        const chunks: Buffer[] = [];
        let totalSize = 0;
        const maxSize = 100 * 1024 * 1024;

        for await (const chunk of pdfStream) {
            const chunkBuffer = Buffer.from(chunk);
            totalSize += chunkBuffer.length;
            if (totalSize > maxSize) {
                throw new Error(
                    `PDF file too large (${Math.round(totalSize / 1024 / 1024)}MB). Maximum size is 100MB.`,
                );
            }
            chunks.push(chunkBuffer);
        }
        const pdfBuffer = Buffer.concat(chunks);
        const pdfBytes = new Uint8Array(pdfBuffer);

        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pdfPages = pdfDoc.getPages();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 8;

        // Draw bounding boxes
        for (const document of analyzeDocumentResult) {
            // Draw document-level bounding boxes
            if (document.boundingRegions) {
                for (const region of document.boundingRegions) {
                    const page = pdfPages[region.pageNumber - 1]; // Convert to 0-based index
                    if (page) {
                        const polygon = region.polygon;
                        const { width: pdfWidth, height: pdfHeight } = page.getSize();

                        console.log(`Page ${region.pageNumber}: PDF size = ${pdfWidth}x${pdfHeight}`);
                        console.log(`Document polygon: [${polygon.join(', ')}]`);

                        // Convert Azure coordinates (inches) to PDF coordinates (points)
                        // Azure coordinates are in inches, convert to points (1 inch = 72 points)
                        // Handle coordinate system mismatch between Azure (portrait) and PDF (landscape)

                        // The document polygon describes a portrait page (8.26" x 11.68")
                        // But the PDF is landscape (841.68 x 595.2 points)
                        // We need to rotate and swap the coordinates

                        // First, convert inches to points
                        const x1_inch = polygon[0] * 72;
                        const y1_inch = polygon[1] * 72;
                        const x2_inch = polygon[2] * 72;
                        const y2_inch = polygon[3] * 72;
                        const x3_inch = polygon[4] * 72;
                        const y3_inch = polygon[5] * 72;
                        const x4_inch = polygon[6] * 72;
                        const y4_inch = polygon[7] * 72;

                        // Calculate bounding box in inches
                        const minX_inch = Math.min(x1_inch, x2_inch, x3_inch, x4_inch);
                        const maxX_inch = Math.max(x1_inch, x2_inch, x3_inch, x4_inch);
                        const minY_inch = Math.min(y1_inch, y2_inch, y3_inch, y4_inch);
                        const maxY_inch = Math.max(y1_inch, y2_inch, y3_inch, y4_inch);

                        // ROTATE AND SWAP: Map portrait coordinates to landscape PDF
                        // Azure portrait: width=8.26", height=11.68"
                        // PDF landscape: width=841.68pt, height=595.2pt

                        // Swap X and Y coordinates and scale appropriately
                        const scaleX = pdfWidth / (11.68 * 72);  // Map Azure height to PDF width
                        const scaleY = pdfHeight / (8.26 * 72);  // Map Azure width to PDF height

                        // Rotate 90 degrees: swap X and Y, then flip Y
                        const boxX = minY_inch * scaleX;
                        const boxY = pdfHeight - (maxX_inch * scaleY); // Flip Y coordinate
                        const boxWidth = (maxY_inch - minY_inch) * scaleX;
                        const boxHeight = (maxX_inch - minX_inch) * scaleY;

                        console.log(`Azure coordinates (inches): x=${minX_inch}, y=${minY_inch}, w=${maxX_inch - minX_inch}, h=${maxY_inch - minY_inch}`);
                        console.log(`PDF coordinates (points): x=${boxX}, y=${boxY}, w=${boxWidth}, h=${boxHeight}`);

                        // Draw rectangle using converted coordinates
                        page.drawRectangle({
                            x: boxX,
                            y: boxY,
                            width: boxWidth,
                            height: boxHeight,
                            borderWidth: 2,
                            borderColor: rgb(1, 0, 0), // Red for document regions
                        });

                        // Add label for document type
                        page.drawText(`Document: ${document.docType}`, {
                            x: boxX,
                            y: boxY + boxHeight + 5,
                            size: fontSize,
                            font: font,
                            color: rgb(1, 0, 0),
                        });
                    }
                }
            }

            // --- Start of Final Corrected and Polished Field Bounding Box Drawing ---
            if (document.fields) {
                // Make sure you have this import at the top of your file
                // import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

                for (const [fieldName, field] of Object.entries(document.fields)) {
                    if (field.boundingRegions) {
                        for (const region of field.boundingRegions) {
                            const page = pdfPages[region.pageNumber - 1];
                            if (page) {
                                const { width: pdfPageWidth, height: pdfPageHeight } = page.getSize();

                                // This is the mathematically correct transformation formula for this specific
                                // 90-degree clockwise rotation between the two coordinate systems.
                                const transformPoint = (azureX_inch: number, azureY_inch: number) => {
                                    const pdfX = pdfPageWidth - (azureY_inch * 72);
                                    const pdfY = pdfPageHeight - (azureX_inch * 72);
                                    return { x: pdfX, y: pdfY };
                                };

                                // Extract and transform all 4 corner points of the polygon
                                const p1 = transformPoint(region.polygon[0], region.polygon[1]); // Original Top-Left
                                const p2 = transformPoint(region.polygon[2], region.polygon[3]); // Original Top-Right
                                const p3 = transformPoint(region.polygon[4], region.polygon[5]); // Original Bottom-Right
                                const p4 = transformPoint(region.polygon[6], region.polygon[7]); // Original Bottom-Left

                                // Create the SVG path to draw the correctly oriented polygon.
                                const pathData = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`;

                                page.drawSvgPath(pathData, {
                                    borderWidth: 1,
                                    borderColor: rgb(0, 0, 1),
                                });

                                // --- Polished Text Label Logic ---
                                // After rotation, Azure's Bottom-Left point (p4) becomes the new Top-Left anchor for drawing.
                                const topLeftAnchor = p4;
                                // After rotation, Azure's Bottom-Right point (p3) becomes the new Bottom-Left anchor.
                                const bottomLeftAnchor = p3;

                                const fieldValue = field.valueString || field.content || '';
                                const truncatedValue =
                                    fieldValue.length > 50
                                        ? fieldValue.substring(0, 50) + '...'
                                        : fieldValue;

                                // The page content is rotated +90deg. To make our annotations upright, we must apply the inverse rotation (-90deg).

                                // Draw the main field label, anchored at the new top-left corner with an offset.
                                page.drawText(`${fieldName}: ${truncatedValue}`, {
                                    x: topLeftAnchor.x,
                                    y: topLeftAnchor.y + 4, // 4pt offset "above" the box
                                    size: fontSize - 2,
                                    font: font,
                                    color: rgb(0, 0, 1),
                                    rotate: degrees(-90),
                                });

                                // Draw the confidence score, anchored at the new bottom-left corner with an offset.
                                if (field.confidence) {
                                    page.drawText(
                                        `Confidence: ${(field.confidence * 100).toFixed(1)}%`,
                                        {
                                            x: bottomLeftAnchor.x,
                                            y: bottomLeftAnchor.y - (fontSize - 2) - 4, // Offset below the box, accounting for font size
                                            size: fontSize - 2,
                                            font: font,
                                            color: rgb(0, 0, 1),
                                            rotate: degrees(-90),
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
            // --- End of Final Corrected and Polished Field Bounding Box Drawing ---
        }

        // Save PDF
        const annotatedPdfBytes = await pdfDoc.save();
        const fileName = `annotated_${blobPath.split('/').pop()}`;
        const savedPath = `${blobPath.split('/').slice(0, -1).join('/')}/${module}/${fileName}`;

        const uploadResult = await this.azureStorageService.uploadFileFromBuffer(
            containerName,
            savedPath,
            Buffer.from(annotatedPdfBytes),
        );

        return {
            success: true,
            message: `Extraction annotated PDF saved successfully`,
            savedPath,
            uploadResult,
            documentTypes: analyzeDocumentResult.map((doc) => ({
                docType: doc.docType,
                confidence: doc.confidence,
                fields: Object.keys(doc.fields || {}).length,
            })),
        };
    }
}
