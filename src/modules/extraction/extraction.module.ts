import { Module } from "@nestjs/common";
import { AzureStorageModule } from "../azurestorage/azure.storage.module";
import { PdfLibraryModule } from "../pdflibrary/pdf.library.module";
import { AuditTrailModule } from "../audittrail/audit.trail.module";
import { ExtractionController } from "./extraction.controller";
import { ExtractionService } from "./extraction.service";

@Module({
  imports: [AzureStorageModule, PdfLibraryModule, AuditTrailModule],
  controllers: [ExtractionController],
  providers: [ExtractionService],
})
export class ExtractionModule {}  