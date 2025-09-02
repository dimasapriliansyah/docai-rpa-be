import DocumentIntelligence, { AnalyzeOperationOutput, DocumentClassifierDetailsOutput, getLongRunningPoller, isUnexpected, paginate } from "@azure-rest/ai-document-intelligence";
import { AzureKeyCredential } from "@azure/core-auth";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AzureStorageService } from "../azurestorage/azure.storage.service";
import { PdfLibraryService } from "../pdflibrary/pdf.library.service";
import { AuditTrail, DocumentModule } from "../audittrail/audit.trail.entity";
import { AuditTrailService } from "../audittrail/audit.trail.service";
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ClassifierService {
    constructor(
        private readonly configService: ConfigService,
        private readonly azureStorageService: AzureStorageService,
        private readonly pdfLibraryService: PdfLibraryService,
        private readonly auditTrailService: AuditTrailService,
    ) { }

    public async classify(blobPath: string, modelId: string, containerName: string, useAsTrainingData: boolean = false, sessionId: string | null = null) {

        const startTime = new Date();

        const key = this.configService.get("AZURE_DOCUMENT_INTELLIGENCE_KEY");
        const endpoint = this.configService.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");
        const blobContainer = containerName || this.configService.get("AZURE_BLOB_CONTAINER_RESULT") || '';
        const trainingDataContainer = this.configService.get("AZURE_BLOB_CONTAINER") || '';

        if (useAsTrainingData) {
            const copyResult = await this.azureStorageService.copyBlob(blobContainer, blobPath, trainingDataContainer, blobPath);
            console.log('copyResult', copyResult);
        }

        const client = DocumentIntelligence(endpoint, new AzureKeyCredential(key));

        const sasUrl = this.azureStorageService.getSASUrl(blobContainer, blobPath);

        const initialResponse = await client
            .path("/documentClassifiers/{classifierId}:analyze", modelId)
            .post({
                contentType: "application/json",
                body: {
                    urlSource: sasUrl,
                },
                queryParameters: {
                    split: "auto",
                },
            });

        if (isUnexpected(initialResponse)) {
            throw initialResponse.body.error;
        }

        const poller = getLongRunningPoller(client, initialResponse);
        const analyzeResult = ((await poller.pollUntilDone()).body as AnalyzeOperationOutput)
            .analyzeResult;

        if (analyzeResult?.documents === undefined || analyzeResult.documents.length === 0) {
            throw new Error("Failed to extract any documents.");
        }

        for (const document of analyzeResult.documents) {
            console.log(
                `Extracted a document with type '${document.docType}' on page ${document.boundingRegions?.[0].pageNumber} (confidence: ${document.confidence})`,
            );
        }

        const splitPdfResult = await this.pdfLibraryService.splitPdf(blobPath, analyzeResult.documents, analyzeResult.pages);

        const drawBoundingBoxAnnotationsResult = await this.pdfLibraryService.drawBoundingBoxAnnotations(blobPath, analyzeResult.documents, analyzeResult.pages, 'classifier');

        if (!sessionId) sessionId = uuidv4();

        const endTime = new Date();

        await this.auditTrailService.createAuditTrail(new AuditTrail(
            sessionId,
            DocumentModule.CLASSIFIER,
            blobPath,
            splitPdfResult.map(result => result.savedPath).join(','),
            drawBoundingBoxAnnotationsResult.savedPath,
            '',
            '',
            '',
            (endTime.getTime() - startTime.getTime()) / 1000,
            analyzeResult.documents,
        ));

        return { analyzeResult: { documents: analyzeResult.documents, splitPdfResult, drawBoundingBoxAnnotationsResult, sessionId } };

    }

    public async listClassifiers() {
        const key = this.configService.get("AZURE_DOCUMENT_INTELLIGENCE_KEY");
        const endpoint = this.configService.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");

        const client = DocumentIntelligence(endpoint, new AzureKeyCredential(key));

        const response = await client.path("/documentClassifiers").get();
        return response;
    }

    public async listClassifierModels() {
        const key = this.configService.get("AZURE_DOCUMENT_INTELLIGENCE_KEY");
        const endpoint = this.configService.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");

        const client = DocumentIntelligence(endpoint, new AzureKeyCredential(key));

        const response = await client.path("/documentClassifiers").get();
        if (isUnexpected(response)) {
            throw response.body.error;
        }

        let models: DocumentClassifierDetailsOutput[] = [];

        for await (const model of paginate(client, response)) {
            console.log("- ID", model.classifierId);
            console.log("  Created:", model.createdDateTime);
            console.log("  Description: ", model.description || "<none>");

            // The model summary does not include `docTypes`, so we must additionally call `getModel` to retrieve them
            const detailedModel = await client.path("/documentClassifiers/{classifierId}", model.classifierId).get();

            if (isUnexpected(detailedModel)) {
                throw detailedModel.body.error;
            }
            const docTypes = detailedModel.body.docTypes;

            console.log("  Document Types:");
            for (const docType of Object.keys(docTypes || {})) {
                console.log("  -", docType);
            }
            models.push(model);
        }

        return models;
    }
}