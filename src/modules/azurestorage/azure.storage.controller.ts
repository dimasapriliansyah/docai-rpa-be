import { Body, Controller, Get, Param, Post, Res, HttpStatus, NotFoundException, Query, UseInterceptors, UploadedFile, UploadedFiles } from "@nestjs/common";
import { Response } from "express";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { AzureStorageService } from "./azure.storage.service";

@Controller("azure-storage")
export class AzureStorageController {
    constructor(private readonly azureStorageService: AzureStorageService) { }

    @Get("download/stream/:containerName/*path")
    async downloadBlobAsStream(
        @Param("containerName") containerName: string, 
        @Param("path") blobPath: string | string[],
        @Res() res: Response
    ) {
        try {
            // Handle case where blobPath might be an array
            const blobPathString = Array.isArray(blobPath) ? blobPath.join('/') : blobPath;
            console.log('Blob path:', blobPathString);
            
            const metadata = await this.azureStorageService.getBlobMetadata(containerName, blobPathString);
            
            // Extract just the filename for the Content-Disposition header
            const fileName = blobPathString.split('/').pop() || blobPathString;
            
            res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
            res.setHeader('Content-Length', metadata.size?.toString() || '0');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Last-Modified', metadata.lastModified?.toUTCString() || '');
            res.setHeader('ETag', metadata.etag || '');

            const stream = await this.azureStorageService.downloadBlobAsStream(containerName, blobPathString);
            stream.pipe(res);
        } catch (error) {
            if (error.message.includes('Failed to get readable stream')) {
                throw new NotFoundException(`Blob not found in container ${containerName}`);
            }
            throw error;
        }
    }

    @Get("metadata/:containerName/*path")
    async getBlobMetadata(
        @Param("containerName") containerName: string, 
        @Param("path") blobPath: string | string[]
    ) {
        try {
            // Handle case where blobPath might be an array
            const blobPathString = Array.isArray(blobPath) ? blobPath.join('/') : blobPath;
            console.log('Metadata blob path:', blobPathString);
            
            return await this.azureStorageService.getBlobMetadata(containerName, blobPathString);
        } catch (error) {
            throw new NotFoundException(`Blob not found in container ${containerName}`);
        }
    }

    @Post("upload/file/:containerName/*path")
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @Param("containerName") containerName: string, 
        @Param("path") blobPath: string | string[],
        @UploadedFile() file: Express.Multer.File
    ) {
        // Handle case where blobPath might be an array
        const blobPathString = Array.isArray(blobPath) ? blobPath.join('/') : blobPath;
        console.log('Upload blob path:', blobPathString);
        
        return this.azureStorageService.uploadFile(containerName, blobPathString, file);
    }

    @Post("upload/file/:containerName")
    @UseInterceptors(FileInterceptor('file'))
    async uploadFileToContainer(
        @Param("containerName") containerName: string, 
        @UploadedFile() file: Express.Multer.File
    ) {
        console.log('Upload file to container root:', containerName);
        
        return this.azureStorageService.uploadFile(containerName, file.originalname, file);
    }

    @Post("upload/files/:containerName/*path")
    @UseInterceptors(FilesInterceptor('files', 10)) // Allow up to 10 files
    async uploadMultipleFiles(
        @Param("containerName") containerName: string, 
        @Param("path") blobPath: string | string[],
        @UploadedFiles() files: Express.Multer.File[]
    ) {
        // Handle case where blobPath might be an array
        const blobPathString = Array.isArray(blobPath) ? blobPath.join('/') : blobPath;
        console.log('Upload multiple files to path:', blobPathString);
        
        // Ensu les is always an array
        const filesArray = files || [];
        
        return this.azureStorageService.uploadMultipleFiles(containerName, blobPathString, filesArray);
    }

    @Post("upload/files/:containerName")
    @UseInterceptors(FilesInterceptor('files', 10)) // Allow up to 10 files
    async uploadMultipleFilesToContainer(
        @Param("containerName") containerName: string, 
        @UploadedFiles() files: Express.Multer.File[]
    ) {
        console.log('Upload multiple files to container root:', containerName);
        
        // Ensure files is always an array
        const filesArray = files || [];
        
        return this.azureStorageService.uploadMultipleFiles(containerName, '', filesArray);
    }

    @Get("list/blobs/:containerName")
    async listBlobsByContainer(@Param("containerName") containerName: string) {
        return this.azureStorageService.listBlobsByContainer(containerName);
    }
}