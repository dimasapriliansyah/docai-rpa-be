import { Module } from "@nestjs/common";
import { PdfLibraryService } from "./pdf.library.service";
import { AzureStorageModule } from "../azurestorage/azure.storage.module";
import { AzureStorageService } from "../azurestorage/azure.storage.service";

@Module({
    imports: [AzureStorageModule],
    providers: [PdfLibraryService, AzureStorageService],
    exports: [PdfLibraryService]
})
export class PdfLibraryModule {}    