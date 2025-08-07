import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BlobItem, BlobServiceClient, StorageSharedKeyCredential, BlockBlobClient, ContainerClient, SASProtocol, ContainerSASPermissions, generateBlobSASQueryParameters } from "@azure/storage-blob";
import { Readable } from "stream";
import * as fs from "fs";
import { Express } from "express";

@Injectable()
export class AzureStorageService {
    constructor(private readonly configService: ConfigService) { }

    private getAzureCredentials() {
        const AZURE_STORAGE_ACCESS_KEY = this.configService.get(
            "AZURE_STORAGE_ACCESS_KEY",
        );
        const AZURE_STORAGE_ACCOUNT_NAME = this.configService.get(
            "AZURE_STORAGE_ACCOUNT_NAME",
        );
        const credential = new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCESS_KEY);

        const blobServiceClient = new BlobServiceClient(
            `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
            credential
        );

        return { blobServiceClient, AZURE_STORAGE_ACCOUNT_NAME, credential };
    }

    async downloadBlobAsStream(containerName: string, blobName: string): Promise<Readable> {
        const { blobServiceClient } = this.getAzureCredentials();

        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobName);

        const downloadResponse = await blobClient.download();

        if (!downloadResponse.readableStreamBody) {
            throw new Error('Failed to get readable stream from blob');
        }

        return downloadResponse.readableStreamBody as Readable;
    }

    async getBlobMetadata(containerName: string, blobName: string) {
        const { blobServiceClient } = this.getAzureCredentials();

        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobName);

        const properties = await blobClient.getProperties();
        return {
            name: blobName,
            size: properties.contentLength,
            contentType: properties.contentType,
            lastModified: properties.lastModified,
            etag: properties.etag
        };
    }

    async listBlobsByContainer(containerName: string): Promise<BlobItem[]> {
        const { blobServiceClient } = this.getAzureCredentials();

        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobs = containerClient.listBlobsFlat();

        let result: BlobItem[] = [];

        for await (const blob of blobs) {
            result.push(blob);
        }

        return result;
    }

    async uploadFile(containerName: string, blobPath: string, file: Express.Multer.File): Promise<any> {
        const { blobServiceClient } = this.getAzureCredentials();

        const containerClient = blobServiceClient.getContainerClient(containerName);

        // Create a readable stream from the file buffer
        const stream = new Readable();
        stream.push(file.buffer);
        stream.push(null); // End the stream

        // Upload using streaming method
        const uploadResponse = await this.uploadBlobFromReadStream(
            containerClient,
            blobPath,
            stream,
            file.mimetype
        );

        return {
            success: true,
            message: `File uploaded successfully to ${blobPath}`,
            etag: uploadResponse.etag,
            lastModified: uploadResponse.lastModified,
            requestId: uploadResponse.requestId,
            versionId: uploadResponse.versionId,
            fileSize: file.size,
            originalName: file.originalname,
            mimetype: file.mimetype
        };
    }

    async uploadMultipleFiles(containerName: string, basePath: string, files: Express.Multer.File[]): Promise<any> {
        const { blobServiceClient } = this.getAzureCredentials();
        const containerClient = blobServiceClient.getContainerClient(containerName);

        const results: any[] = [];
        const errors: any[] = [];

        for (const file of files) {
            try {
                // Create blob path using original filename
                let blobPath = `${basePath}/${file.originalname}`;
                if (basePath === '') {
                    blobPath = file.originalname;
                }

                // Create a readable stream from the file buffer
                const stream = new Readable();
                stream.push(file.buffer);
                stream.push(null); // End the stream

                // Upload using streaming method
                const uploadResponse = await this.uploadBlobFromReadStream(
                    containerClient,
                    blobPath,
                    stream,
                    file.mimetype
                );

                results.push({
                    success: true,
                    originalName: file.originalname,
                    blobPath: blobPath,
                    etag: uploadResponse.etag,
                    lastModified: uploadResponse.lastModified,
                    requestId: uploadResponse.requestId,
                    versionId: uploadResponse.versionId,
                    fileSize: file.size,
                    mimetype: file.mimetype
                });
            } catch (error) {
                errors.push({
                    originalName: file.originalname,
                    error: error.message
                });
            }
        }

        return {
            success: errors.length === 0,
            message: `Uploaded ${results.length} files successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
            results: results,
            errors: errors,
            totalFiles: files.length,
            successfulUploads: results.length,
            failedUploads: errors.length
        };
    }

    async uploadFileFromPath(containerName: string, blobPath: string, filePath: string): Promise<any> {
        const { blobServiceClient } = this.getAzureCredentials();

        const containerClient = blobServiceClient.getContainerClient(containerName);

        // Create a readable stream from the file
        const fileStream = fs.createReadStream(filePath);

        // Upload using streaming method
        const uploadResponse = await this.uploadBlobFromReadStream(
            containerClient,
            blobPath,
            fileStream,
            this.getMimeType(filePath)
        );

        // Get file stats for metadata
        const stats = fs.statSync(filePath);

        return {
            success: true,
            message: `File uploaded successfully to ${blobPath}`,
            etag: uploadResponse.etag,
            lastModified: uploadResponse.lastModified,
            requestId: uploadResponse.requestId,
            versionId: uploadResponse.versionId,
            fileSize: stats.size
        };
    }

    async uploadFileFromBuffer(containerName: string, blobPath: string, buffer: Buffer, contentType?: string): Promise<any> {
        const { blobServiceClient } = this.getAzureCredentials();

        const containerClient = blobServiceClient.getContainerClient(containerName);

        // Create a readable stream from the buffer
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null); // End the stream

        // Upload using streaming method
        const uploadResponse = await this.uploadBlobFromReadStream(
            containerClient,
            blobPath,
            stream,
            contentType || 'application/pdf'
        );

        return {
            success: true,
            message: `File uploaded successfully to ${blobPath}`,
            etag: uploadResponse.etag,
            lastModified: uploadResponse.lastModified,
            requestId: uploadResponse.requestId,
            versionId: uploadResponse.versionId,
            fileSize: buffer.length
        };
    }

    private async uploadBlobFromReadStream(
        containerClient: ContainerClient,
        blobName: string,
        readStream: Readable,
        contentType?: string
    ): Promise<any> {
        // Create blob client from container client
        const blockBlobClient: BlockBlobClient = containerClient.getBlockBlobClient(blobName);

        const options = contentType ? {
            blobHTTPHeaders: {
                blobContentType: contentType,
            },
        } : undefined;

        return await blockBlobClient.uploadStream(readStream, undefined, undefined, options);
    }

    private getMimeType(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const mimeTypes: { [key: string]: string } = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'txt': 'text/plain',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'mp4': 'video/mp4',
            'mp3': 'audio/mpeg',
            'zip': 'application/zip',
            'rar': 'application/x-rar-compressed'
        };
        return mimeTypes[ext || ''] || 'application/octet-stream';
    }

    public getSASUrl(containerName: string, blobPath: string) {
        const { credential, AZURE_STORAGE_ACCOUNT_NAME } = this.getAzureCredentials();

        const now = new Date();

        const sasToken = generateBlobSASQueryParameters({
            containerName: containerName,
            blobName: blobPath,
            permissions: ContainerSASPermissions.parse("r"),
            startsOn: now,
            // 1 Hour expiration
            expiresOn: new Date(Date.now() + 1000 * 60 * 60)
        }, credential);

        const sasString = sasToken.toString();

        const sasUrl = `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${containerName}/${blobPath}?${sasString}`;
        return sasUrl;
    }

    public async copyBlob(sourceContainerName: string, sourceBlobPath: string, destinationContainerName: string, destinationBlobPath: string) {
        const { blobServiceClient } = this.getAzureCredentials();

        const sourceContainerClient = blobServiceClient.getContainerClient(sourceContainerName);
        const sourceBlobClient = sourceContainerClient.getBlobClient(sourceBlobPath);

        const destinationContainerClient = blobServiceClient.getContainerClient(destinationContainerName);
        const destinationBlobClient = destinationContainerClient.getBlobClient(destinationBlobPath);

        // Start the copy
        const copyPoller = await destinationBlobClient.beginCopyFromURL(
            sourceBlobClient.url
        );
        const result = await copyPoller.pollUntilDone();

        return result;
    }
}