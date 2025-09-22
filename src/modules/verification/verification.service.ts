import { Injectable } from "@nestjs/common";
import { ClassifierService } from "../classifier/classifier.service";
import { ExtractionService } from "../extraction/extraction.service";
import { v4 as uuidv4 } from 'uuid';
import { AzureOpenAI } from "openai";
import { AuditTrail, DocumentModule } from "../audittrail/audit.trail.entity";
import { AuditTrailService } from "../audittrail/audit.trail.service";
import { RulesService } from "../rules/rules.service";
import { RuleValidasiTipe } from "../rules/repositories/rules.entity";

@Injectable()
export class VerificationService {
    constructor(
        private readonly classifierService: ClassifierService,
        private readonly extractionService: ExtractionService,
        private readonly auditTrailService: AuditTrailService,
        private readonly rulesService: RulesService,
    ) { }

    public async analyze(body: { blobPath: string, containerName: string, classifierModelId: string, rules?: any[], rulesTemplateId?: string }) {
        const startTime = new Date();

        const { blobPath, containerName, classifierModelId, rules, rulesTemplateId } = body;
        const sessionId = uuidv4();

        // Document Classification
        const classifierResult = await this.classifierService.classify(blobPath, classifierModelId, containerName, false, sessionId);

        const splitPDFResult = classifierResult?.analyzeResult?.splitPdfResult;

        // Process each split PDF with extraction
        const extractionResults: Array<{
            docType: string;
            pageNumbers: number[];
            confidence: number;
            savedPath?: string;
            extractionResult?: any;
            annotatedPath?: string;
            error?: string;
        }> = [];

        if (splitPDFResult && splitPDFResult.length > 0) {
            console.log(`Processing ${splitPDFResult.length} split PDFs for extraction`);

            // Use Promise.all to process all split PDFs concurrently
            const extractionPromises = splitPDFResult.map(async (splitPdf) => {
                try {
                    console.log(`Processing extraction for ${splitPdf.docType} (pages: ${splitPdf.pageNumbers.join(', ')})`);

                    if (!splitPdf.savedPath) {
                        throw new Error('Saved path is undefined');
                    }

                    // Find the appropriate extraction model based on the docType
                    // The modelId has the formatted name like this {docType}_extraction_{version}, like this:
                    // - bast_extraction_v01
                    // - faktur_pajak_extraction_v01
                    // - tagihan_invoice_extraction_v01
                    // - kuitansi_extraction_v01
                    // - etc
                    // Always find the modelId that has the same docType and the latest version

                    const extractionModels = await this.extractionService.listExtractionModels();

                    // Filter models that match the docType pattern
                    const matchingModels = extractionModels.filter(model => {
                        const modelId = model.modelId;
                        const pattern = new RegExp(`^${splitPdf.docType}_extraction_v\\d+$`);
                        return pattern.test(modelId);
                    });

                    if (matchingModels.length === 0) {
                        throw new Error(`No extraction models found for docType: ${splitPdf.docType}`);
                    }

                    // Sort by version number (extract version from modelId) and get the latest
                    const sortedModels = matchingModels.sort((a, b) => {
                        const versionA = parseInt(a.modelId.match(/v(\d+)$/)?.[1] || '0');
                        const versionB = parseInt(b.modelId.match(/v(\d+)$/)?.[1] || '0');
                        return versionB - versionA; // Descending order (latest first)
                    });

                    const latestModel = sortedModels[0];
                    const extractionModelId = latestModel.modelId;

                    console.log(`Found extraction model: ${extractionModelId} for docType: ${splitPdf.docType}`);

                    const extractionResult = await this.extractionService.extraction(
                        splitPdf.savedPath,
                        extractionModelId,
                        containerName,
                        false,
                        sessionId,
                    );

                    return {
                        docType: splitPdf.docType,
                        pageNumbers: splitPdf.pageNumbers,
                        confidence: splitPdf.confidence,
                        savedPath: splitPdf.savedPath,
                        extractionResult: extractionResult,
                        annotatedPath: extractionResult?.analyzeResult?.drawBoundingBoxAnnotationsResult?.savedPath,
                        sessionId: extractionResult?.analyzeResult?.sessionId,
                    };
                } catch (error) {
                    console.error(`Error processing extraction for ${splitPdf.docType}:`, error);
                    return {
                        docType: splitPdf.docType,
                        pageNumbers: splitPdf.pageNumbers,
                        confidence: splitPdf.confidence,
                        savedPath: splitPdf.savedPath,
                        annotatedPath: undefined,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        sessionId: sessionId,
                    };
                }
            });

            // Wait for all extractions to complete
            const results = await Promise.all(extractionPromises);
            extractionResults.push(...results);
        }

        const extractionValue = extractionResults?.map(result => {
            const extractData = result?.extractionResult?.analyzeResult?.documents

            return {
                docType: result?.docType,
                extractedData: extractData,
            }
        });

        // Document Verification
        const verificationResult = await this.verify(extractionValue ?? [], rules ?? [], rulesTemplateId ?? '', sessionId);

        const endTime = new Date();

        // Collect annotated extraction document paths
        const annotatedExtractionPaths = extractionResults
            .filter(result => result.annotatedPath)
            .map(result => result.annotatedPath)
            .join(',');

        await this.auditTrailService.createAuditTrail(new AuditTrail(
            sessionId,
            DocumentModule.VERIFICATION,
            blobPath,
            '',
            '',
            '',
            annotatedExtractionPaths,
            verificationResult,
            (endTime.getTime() - startTime.getTime()) / 1000,
            extractionValue,
        ));

        return {
            sessionId,
            classifierResult: classifierResult,
            extractionResults: extractionResults,
            verificationResult: verificationResult,
        };
    }

    public async verify(extractionValue: any[], rules: any[], rulesTemplateId: string, sessionId: string) {
        const endpoint = process.env["AZURE_OPENAI_ENDPOINT"]
        const apiKey = process.env["AZURE_OPENAI_API_KEY"]
        const apiVersion = "2025-01-01-preview";
        const deployment = "infomediadocaiopenai"; // This must match your deployment name

        const client = new AzureOpenAI({ endpoint, apiKey, deployment, apiVersion, });

        if (rulesTemplateId !== '') {
            rules = await this.rulesService.getRules(rulesTemplateId);
        }

        const rulesString = rules.map((rule: any, index) => {
            return `${index + 1}. Value from field '${rule.dokAcuanParameter}' from docType '${rule.dokAcuanJenis}' must be ${rule.ruleValidasiTipe === RuleValidasiTipe.SIMILARITY ? 'similar' : rule.ruleValidasiTipe} with the value from field  '${rule.dokPembandingParameter}' from docType '${rule.dokPembandingJenis}'.\n`;
        }).join('\n');

        const rulesPrompt = `
        Here are the document types and their respective extracted data:
        ${extractionValue.map(item => `- ${item.docType}: ${JSON.stringify(item.extractedData)}`).join('\n')}

        And here are the rules to verify the document value of the document type against one or more other value of the others document type:
        ${rulesString}
        `

        // console.log(rulesPrompt);
        // return { rules: rules, rulesPrompt: rulesPrompt };

        const result = await client.chat.completions.create({
            model: deployment,
            messages: [
                {
                    role: "system",
                    content: `
                                You are an AI assistant tasks for document verification. You will be given the document payload with the document type and their respective extracted data. You will be given set of rules to verify the document value of the document type against one or more other value of the others document type. Pay attention to the rules carefully. You will need to verify the document based on the rules and return the verification result for each rules. Verification result value can be 'success' if the value is according to the rules, otherwise 'failed'.
                                The return must be in JSON format with the following structure for each rules verification:
                                [
                                 {
                                    "verificationRule": "The verification rule",
                                    "verificationResult": "success" | "failed",
                                    "verificationReason": "The reason why the verification result based on the verification rule is success or failed",
                                    "verificationData": [
                                        {
                                            "documentType": "The document type",
                                            "documentField": "The document field",
                                            "documentValue": "The document value"
                                        },
                                        ... more document type and their respective extracted data used in the rules stated in the verification rule
                                    ],
                                    "confidence": "The confidence level of the verification result. Between 0 and 1. 1 is the highest confidence."
                                 },
                                 ... more rules verification
                                ]
                            `
                },
                { role: "user", content: rulesPrompt }
            ],
            max_tokens: 1638,
            temperature: 0.7,
            top_p: 0.95,
            frequency_penalty: 0,
            presence_penalty: 0,
            stop: null
        });

        return {
            extractionValue: extractionValue,
            rules: rules,
            verificationResult: JSON.parse(result.choices[0].message.content || '[]'),
            sessionId: sessionId,
        };
    }
}