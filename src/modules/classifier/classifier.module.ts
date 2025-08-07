import { Module } from "@nestjs/common";
import { ClassifierController } from "./classifier.controller";
import { ClassifierService } from "./classifier.service";
import { AzureStorageModule } from "../azurestorage/azure.storage.module";
import { PdfLibraryModule } from "../pdflibrary/pdf.library.module";
import { AuditTrailModule } from "../audittrail/audit.trail.module";

@Module({
  imports: [AzureStorageModule, PdfLibraryModule, AuditTrailModule],
  controllers: [ClassifierController],
  providers: [ClassifierService],
  exports: [ClassifierService],
})
export class ClassifierModule {}  