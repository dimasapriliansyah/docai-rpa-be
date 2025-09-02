import DocumentIntelligence, { AnalyzeOperationOutput, DocumentClassifierBuildOperationDetailsOutput, DocumentModelDetailsOutput, getLongRunningPoller, isUnexpected, paginate } from "@azure-rest/ai-document-intelligence";
import { AzureKeyCredential } from "@azure/core-auth";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AzureStorageService } from "../azurestorage/azure.storage.service";
import { PdfLibraryService } from "../pdflibrary/pdf.library.service";
import { AuditTrail, DocumentModule } from "../audittrail/audit.trail.entity";
import { AuditTrailService } from "../audittrail/audit.trail.service";
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ExtractionService {
    constructor(
        private readonly configService: ConfigService,
        private readonly azureStorageService: AzureStorageService,
        private readonly pdfLibraryService: PdfLibraryService,
        private readonly auditTrailService: AuditTrailService,
    ) { }

    public async extraction(
        blobPath: string,
        modelId: string,
        containerName: string,
        useAsTrainingData: boolean = false,
        sessionId: string | null = null,
        isSplitPdf: boolean = false
    ) {

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
            .path("/documentModels/{modelId}:analyze", modelId)
            .post({
                contentType: "application/json",
                body: {
                    urlSource: sasUrl,
                }
            });

        if (isUnexpected(initialResponse)) {
            throw initialResponse.body.error;
        }

        const poller = getLongRunningPoller(client, initialResponse);
        const analyzeResult = ((await poller.pollUntilDone()).body as AnalyzeOperationOutput)
            .analyzeResult;

        const documents = analyzeResult?.documents;

        const document = documents && documents[0];
        if (!document) {
            throw new Error("Expected at least one document in the result.");
        }

        if (analyzeResult?.documents === undefined || analyzeResult.documents.length === 0) {
            throw new Error("Failed to extract any documents.");
        }

        console.log("--------Analyzing document--------");
        console.log("Document has type", document.docType);
        console.log("Document has confidence", document.confidence);
        console.log("Document was analyzed by model with ID", modelId);

        const extractedFields = document.fields;

        // Filter extracted fields to only include specified values
        const filteredExtractedFields = {};
        if (extractedFields) {
            for (const [name, field] of Object.entries(extractedFields)) {
                filteredExtractedFields[name] = {
                    type: field.type,
                    content: field.content,
                    confidence: field.confidence,
                    valueString: field.valueString
                };
            }
        }


        if (document.fields) {
            for (const [name, field] of Object.entries(document.fields)) {
                console.log(`......found field '${name}' of type '${field.type}' with value '${field.content}' and with confidence ${field.confidence}`);
            }
        }

        const drawBoundingBoxAnnotationsResult = await this.pdfLibraryService.drawExtractionAnnotations(
            blobPath,
            analyzeResult.documents,
            'extractor'
        );

        if (!sessionId) sessionId = uuidv4();

        const endTime = new Date();

        await this.auditTrailService.createAuditTrail(new AuditTrail(
            sessionId,
            DocumentModule.EXTRACTOR,
            blobPath,
            '',
            '',
            drawBoundingBoxAnnotationsResult.savedPath,
            filteredExtractedFields,
            '',
            (endTime.getTime() - startTime.getTime()) / 1000,
            analyzeResult.documents,
        ));

        return { analyzeResult: { documents: filteredExtractedFields, drawBoundingBoxAnnotationsResult, sessionId } };

    }

    public async listExtractionModels() {
        const key = this.configService.get("AZURE_DOCUMENT_INTELLIGENCE_KEY");
        const endpoint = this.configService.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");

        const client = DocumentIntelligence(endpoint, new AzureKeyCredential(key));

        const response = await client.path("/documentModels").get();
        if (isUnexpected(response)) {
            throw response.body.error;
        }

        let models: DocumentModelDetailsOutput[] = [];

        for await (const model of paginate(client, response)) {
            console.log("- ID", model.modelId);
            console.log("  Created:", model.createdDateTime);
            console.log("  Description: ", model.description || "<none>");

            // The model summary does not include `docTypes`, so we must additionally call `getModel` to retrieve them
            const detailedModel = await client.path("/documentModels/{modelId}", model.modelId).get();

            if (isUnexpected(detailedModel)) {
                throw detailedModel.body.error;
            }
            const docTypes = detailedModel.body.docTypes;

            console.log("  Document Types:");
            for (const docType of Object.keys(docTypes || {})) {
                console.log("  -", docType);
            }
            if (!model.modelId.includes('prebuilt-')) {
                models.push(model);
            }
        }

        return models;
    }
}