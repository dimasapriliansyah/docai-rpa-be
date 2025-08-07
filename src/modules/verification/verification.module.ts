import { Module } from "@nestjs/common";
import { VerificationController } from "./verification.controller";
import { VerificationService } from "./verification.service";
import { ClassifierModule } from "../classifier/classifier.module";
import { ExtractionModule } from "../extraction/extraction.module";
import { AuditTrailModule } from "../audittrail/audit.trail.module";

@Module({
    imports: [ClassifierModule, ExtractionModule, AuditTrailModule],
    controllers: [VerificationController],
    providers: [VerificationService],
})
export class VerificationModule { }