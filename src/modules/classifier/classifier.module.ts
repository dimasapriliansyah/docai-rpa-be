import { Module } from "@nestjs/common";
import { ClassifierController } from "./classifier.controller";
import { ClassifierService } from "./classifier.service";
import { AzureStorageModule } from "../azurestorage/azure.storage.module";
import { AzureStorageService } from "../azurestorage/azure.storage.service";
import { PdfLibraryModule } from "../pdflibrary/pdf.library.module";
import { PdfLibraryService } from "../pdflibrary/pdf.library.service";
import { AuditTrailModule } from "../audittrail/audit.trail.module";
import { AuditTrailService } from "../audittrail/audit.trail.service";
import { AuditTrailRepository } from "../audittrail/audit.trail.repository";

@Module({
  imports: [AzureStorageModule, PdfLibraryModule, AuditTrailModule],
  controllers: [ClassifierController],
  providers: [ClassifierService],
})
export class ClassifierModule {}  