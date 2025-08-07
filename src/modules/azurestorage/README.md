# Azure Storage Service - Streaming Downloads

This module provides Azure Blob Storage functionality with streaming download capabilities.

## Features

- **Streaming Downloads**: Download files directly as HTTP responses using streams
- **File Downloads**: Download files to local file system
- **Blob Metadata**: Get blob properties and metadata
- **Blob Listing**: List all blobs in a container

## API Endpoints

### 1. Streaming Download
```
GET /azure-storage/download/stream/:containerName/*path
```

Downloads a blob as a streaming HTTP response. The file will be automatically downloaded by the browser.
Supports full blob paths including subdirectories.

**Example:**
```bash
# Simple file
curl -O -J "http://localhost:3000/azure-storage/download/stream/mycontainer/myfile.pdf"

# File in subdirectory
curl -O -J "http://localhost:3000/azure-storage/download/stream/infomediadocaiblob/bast-extraction/SSO_I2P_PO_FCBPI_DPS_2024_06_233_3_PO4500514229-BAST.pdf"
```

### 2. Single File Upload

#### Upload to Specific Path
```
POST /azure-storage/upload/file/:containerName/*path
```

Uploads a single file to Azure Blob Storage using multipart/form-data.
Supports full blob paths including subdirectories.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Form field name: `file`

**Example using curl:**
```bash
curl -X POST \
  -F "file=@/path/to/local/file.pdf" \
  "http://localhost:3000/azure-storage/upload/file/infomediadocaiblob/bast-extraction/myfile.pdf"
```

#### Upload to Container Root
```
POST /azure-storage/upload/file/:containerName
```

Uploads a single file to the root of the container using the original filename.

**Example using curl:**
```bash
curl -X POST \
  -F "file=@/path/to/local/file.pdf" \
  "http://localhost:3000/azure-storage/upload/file/infomediadocaiblob"
```

**Example using JavaScript:**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

fetch('/azure-storage/upload/file/mycontainer', {
  method: 'POST',
  body: formData
});
```

### 3. Multiple Files Upload

#### Upload to Specific Path
```
POST /azure-storage/upload/files/:containerName/*path
```

Uploads multiple files to Azure Blob Storage using multipart/form-data.
Supports up to 10 files per request.
Files are stored with their original names in the specified path.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Form field name: `files` (array)
- Maximum files: 10

**Example using curl:**
```bash
curl -X POST \
  -F "files=@/path/to/file1.pdf" \
  -F "files=@/path/to/file2.docx" \
  -F "files=@/path/to/file3.jpg" \
  "http://localhost:3000/azure-storage/upload/files/infomediadocaiblob/bast-extraction/"
```

#### Upload to Container Root
```
POST /azure-storage/upload/files/:containerName
```

Uploads multiple files to the root of the container using their original filenames.

**Example using curl:**
```bash
curl -X POST \
  -F "files=@/path/to/file1.pdf" \
  -F "files=@/path/to/file2.docx" \
  -F "files=@/path/to/file3.jpg" \
  "http://localhost:3000/azure-storage/upload/files/infomediadocaiblob"
```

**Example using JavaScript:**
```javascript
const formData = new FormData();
formData.append('files', fileInput1.files[0]);
formData.append('files', fileInput2.files[0]);
formData.append('files', fileInput3.files[0]);

fetch('/azure-storage/upload/files/mycontainer', {
  method: 'POST',
  body: formData
});
```

**Example using JavaScript:**
```javascript
const formData = new FormData();
formData.append('files', fileInput1.files[0]);
formData.append('files', fileInput2.files[0]);
formData.append('files', fileInput3.files[0]);

fetch('/azure-storage/upload/files/mycontainer/folder/', {
  method: 'POST',
  body: formData
});
```

**Response for Multiple Files:**
```json
{
  "success": true,
  "message": "Uploaded 3 files successfully",
  "results": [
    {
      "success": true,
      "originalName": "file1.pdf",
      "blobPath": "folder/file1.pdf",
      "etag": "\"0x8D...\"",
      "lastModified": "2024-01-01T00:00:00.000Z",
      "fileSize": 12345,
      "mimetype": "application/pdf"
    }
  ],
  "errors": [],
  "totalFiles": 3,
  "successfulUploads": 3,
  "failedUploads": 0
}
```

### 3. File Download
```
POST /azure-storage/download/file/:containerName/*path
```

Downloads a blob to a specified file path on the server.
Supports full blob paths including subdirectories.

**Request Body:**
```json
{
  "filePath": "/path/to/save/file.pdf"
}
```

### 3. Get Blob Metadata
```
GET /azure-storage/metadata/:containerName/*path
```

Returns blob metadata including size, content type, last modified date, etc.
Supports full blob paths including subdirectories.

### 4. List Blobs
```
GET /azure-storage/list/blobs/:containerName
```

Returns a list of all blobs in the specified container.

## Service Methods

### `downloadBlobAsStream(containerName: string, blobName: string): Promise<Readable>`
Returns a readable stream that can be piped to HTTP responses or other writable streams.

### `uploadFile(containerName: string, blobPath: string, file: Express.Multer.File): Promise<any>`
Uploads a single file from multer to Azure Blob Storage.
Returns upload response with metadata.

### `uploadMultipleFiles(containerName: string, basePath: string, files: Express.Multer.File[]): Promise<any>`
Uploads multiple files from multer to Azure Blob Storage.
Files are stored with their original names in the specified base path.
Returns detailed response with results and errors for each file.

### `uploadFileFromPath(containerName: string, blobPath: string, filePath: string): Promise<any>`
Uploads a file from local file system to Azure Blob Storage.
Returns upload response with metadata.

### `downloadBlobToFile(containerName: string, blobName: string, filePath: string): Promise<void>`
Downloads a blob to a local file path.

### `getBlobMetadata(containerName: string, blobName: string)`
Returns blob metadata including:
- `name`: Blob name
- `size`: File size in bytes
- `contentType`: MIME type
- `lastModified`: Last modified date
- `etag`: ETag for caching

### `listBlobsByContainer(containerName: string): Promise<BlobItem[]>`
Returns an array of all blobs in the container.

## Environment Variables

Make sure to set these environment variables:
- `AZURE_STORAGE_ACCOUNT_NAME`: Your Azure Storage account name
- `AZURE_STORAGE_ACCESS_KEY`: Your Azure Storage access key

## Usage Examples

### Streaming Download in Controller
```typescript
@Get("download/:containerName/*path")
async downloadFile(
    @Param("containerName") containerName: string,
    @Param("path") blobPath: string,
    @Res() res: Response
) {
    const stream = await this.azureStorageService.downloadBlobAsStream(containerName, blobPath);
    stream.pipe(res);
}
```

### Upload Files
```typescript
// Upload single file from multer
const result = await this.azureStorageService.uploadFile(
    "mycontainer", 
    "folder/myfile.pdf", 
    multerFile
);
console.log(`Upload successful: ${result.message}`);

// Upload multiple files from multer
const result = await this.azureStorageService.uploadMultipleFiles(
    "mycontainer", 
    "folder/", 
    multerFiles
);
console.log(`Uploaded ${result.successfulUploads} files successfully`);
console.log(`Failed uploads: ${result.failedUploads}`);

// Upload from local file path
const result = await this.azureStorageService.uploadFileFromPath(
    "mycontainer", 
    "folder/myfile.pdf", 
    "/tmp/local-file.pdf"
);
console.log(`Upload successful: ${result.message}`);
```

### Download to File
```typescript
await this.azureStorageService.downloadBlobToFile(
    "mycontainer", 
    "myfile.pdf", 
    "/tmp/downloaded-file.pdf"
);
```

### Get Metadata
```typescript
const metadata = await this.azureStorageService.getBlobMetadata("mycontainer", "myfile.pdf");
console.log(`File size: ${metadata.size} bytes`);
console.log(`Content type: ${metadata.contentType}`);
```

## Error Handling

The service includes proper error handling for:
- Missing blobs (404 Not Found)
- Invalid credentials
- Network errors
- Stream errors

All errors are properly propagated with meaningful error messages. 