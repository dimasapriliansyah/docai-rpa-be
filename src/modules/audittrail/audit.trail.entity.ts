import { Entity, EntityRepositoryType, Property } from "@mikro-orm/core";
import { AuditTrailRepository } from "./audit.trail.repository";
import { BaseEntity } from "../../base.entity";
import { Enum } from "@mikro-orm/core";

export enum DocumentModule {
    CLASSIFIER = 'classifier',
    EXTRACTOR = 'extractor',
    VERIFICATION = 'verification',
}

@Entity()
export class AuditTrail extends BaseEntity {
    [EntityRepositoryType]?: AuditTrailRepository;

    @Property()
    sessionId: string;

    @Enum(() => DocumentModule)
    module!: DocumentModule;

    // Original document blob path
    @Property()
    documentBlobFilePath: string;

    // Splitted document blob path
    @Property({type: 'text'})
    documentSplithPath: string;

    // Anotated document classifier blob path
    @Property()
    annotatedClassifierDocumentBlobFilePath: string;

    // Anotated document extractor blob path
    @Property()
    annotatedExtractorDocumentBlobFilePath: string;

    // Extraction result
    @Property({type: 'json'})
    extractionResult: any;

    // Verification result
    @Property({type: 'json'})
    verificationResult: any;

    @Property()
    processedInSeconds: number;

    constructor(
        sessionId: string,
        module: DocumentModule,
        documentBlobFilePath: string,
        documentSplithPath: string,
        annotatedClassifierDocumentBlobFilePath: string,
        annotatedExtractorDocumentBlobFilePath: string,
        extractionResult: any,
        verificationResult: any,
        processedInSeconds: number,
    ) {
        super();
        this.sessionId = sessionId;
        this.module = module;
        this.documentBlobFilePath = documentBlobFilePath;
        this.documentSplithPath = documentSplithPath;
        this.annotatedClassifierDocumentBlobFilePath = annotatedClassifierDocumentBlobFilePath;
        this.annotatedExtractorDocumentBlobFilePath = annotatedExtractorDocumentBlobFilePath;
        this.extractionResult = extractionResult;
        this.verificationResult = verificationResult;
        this.processedInSeconds = processedInSeconds;
    }

}