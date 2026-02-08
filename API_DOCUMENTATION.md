# File Processing & Summary Generation API

This document describes the new API endpoints for manual file processing and AI-powered summary generation.

## Overview

The backend now supports:

1. **Manual File Processing**: Trigger file processing via the worker API
2. **AI-Powered Summaries**: Generate comprehensive summaries using Groq API
3. **Status Tracking**: Monitor processing and summary generation status

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Add to your `.env` file:

```env
WORKER_BASE_URL=http://localhost:8000
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL_ID=qwen/qwen3-32b
```

### 3. Run Database Migrations

```bash
npm run migrate:dev
```

This will create the new `summaries` and `summary_chunks` tables.

### 4. Generate Prisma Client

```bash
npm run generate
```

## API Endpoints

### Processing Endpoints

#### 1. Trigger Manual Processing

```http
POST /api/processing/trigger/:fileId
Authorization: Bearer <token>
```

**Description**: Manually trigger file processing via the worker API. This will process the file, extract text, create chunks, and generate embeddings.

**Response**:

```json
{
  "success": true,
  "message": "File processed successfully",
  "data": {
    "status": "success",
    "fileId": "uuid",
    "jobId": "uuid"
  }
}
```

#### 2. Get Processing Status

```http
GET /api/processing/status/:fileId
Authorization: Bearer <token>
```

**Description**: Get the current processing status for a file.

**Response**:

```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "filename": "document.pdf",
    "processingStatus": "COMPLETED",
    "errorMessage": null,
    "chunkCount": 45,
    "latestJob": {
      "id": "uuid",
      "status": "COMPLETED",
      "attempts": 1,
      "startedAt": "2026-02-03T10:00:00Z",
      "completedAt": "2026-02-03T10:02:30Z"
    }
  }
}
```

#### 3. Check Worker Health

```http
GET /api/processing/health
Authorization: Bearer <token>
```

**Description**: Check if the worker service is available.

**Response**:

```json
{
  "success": true,
  "data": {
    "available": true,
    "status": {
      "status": "healthy",
      "redis": "connected",
      "minio": "connected"
    }
  }
}
```

#### 4. Get Queue Statistics

```http
GET /api/processing/queue/stats
Authorization: Bearer <token>
```

**Description**: Get statistics about the processing queue.

**Response**:

```json
{
  "success": true,
  "data": {
    "pending": 3,
    "processing": 1,
    "worker_status": "running"
  }
}
```

---

### Summary Endpoints

#### 1. Create Summary

```http
POST /api/summary/file/:fileId
Authorization: Bearer <token>
Content-Type: application/json

{
  "customTitle": "Chapter 3 Summary",
  "chunkLimit": 20,
  "useVectorSearch": true,
  "searchQuery": "main concepts and key points"
}
```

**Description**: Generate an AI-powered summary for a file.

**Parameters**:

- `customTitle` (optional): Custom title for the summary
- `chunkLimit` (optional, default: 20): Maximum number of chunks to use
- `useVectorSearch` (optional, default: true): Use vector search to find relevant chunks
- `searchQuery` (optional): Custom search query for vector search

**Response**:

```json
{
  "success": true,
  "message": "Summary created successfully",
  "data": {
    "id": "uuid",
    "fileId": "uuid",
    "userId": "uuid",
    "title": "Summary of document.pdf",
    "content": "## Overview\n\nThis document discusses...",
    "wordCount": 450,
    "tokensUsed": 112,
    "modelUsed": "qwen/qwen3-32b",
    "createdAt": "2026-02-03T10:00:00Z",
    "chunks": [...]
  }
}
```

#### 2. Get File Summaries

```http
GET /api/summary/file/:fileId
Authorization: Bearer <token>
```

**Description**: Get all summaries for a specific file.

**Response**:

```json
{
  "success": true,
  "data": [...],
  "count": 3
}
```

#### 3. Get Specific Summary

```http
GET /api/summary/:summaryId
Authorization: Bearer <token>
```

**Description**: Get a specific summary by ID with full details.

#### 4. Get User Summaries

```http
GET /api/summary?page=1&limit=10&sortBy=createdAt&sortOrder=desc
Authorization: Bearer <token>
```

**Description**: Get all summaries for the authenticated user with pagination.

**Query Parameters**:

- `page` (optional, default: 1)
- `limit` (optional, default: 10)
- `sortBy` (optional): `createdAt` or `wordCount`
- `sortOrder` (optional): `asc` or `desc`

#### 5. Delete Summary

```http
DELETE /api/summary/:summaryId
Authorization: Bearer <token>
```

**Description**: Delete a summary.

#### 6. Update Summary Title

```http
PATCH /api/summary/:summaryId
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "New Title"
}
```

**Description**: Update the title of a summary.

---

## Workflow Example

### Complete File Processing and Summary Generation

1. **Upload a file**:

```bash
POST /api/file/upload
```

2. **Check if processing is needed**:

```bash
GET /api/processing/status/:fileId
```

3. **Trigger processing if needed**:

```bash
POST /api/processing/trigger/:fileId
```

4. **Wait for processing to complete** (poll status endpoint)

5. **Generate summary**:

```bash
POST /api/summary/file/:fileId
{
  "customTitle": "Study Notes - Chapter 1",
  "chunkLimit": 25,
  "useVectorSearch": true
}
```

6. **Retrieve summary**:

```bash
GET /api/summary/:summaryId
```

---

## Database Schema

### Summary Model

```prisma
model Summary {
  id          String          @id @default(uuid())
  fileId      String
  file        File            @relation(...)
  userId      String
  user        User            @relation(...)
  title       String
  content     String          @db.Text
  wordCount   Int
  tokensUsed  Int             @default(0)
  modelUsed   String          @default("qwen/qwen3-32b")
  chunks      SummaryChunk[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}
```

### SummaryChunk Model

```prisma
model SummaryChunk {
  id        String   @id @default(uuid())
  summaryId String
  summary   Summary  @relation(...)
  chunkId   String
  createdAt DateTime @default(now())
}
```

---

## AI Prompts

The system uses carefully crafted prompts for summary generation:

### Document Summary Prompt

- Captures all key concepts, theories, and details
- Maintains academic rigor and precision
- Organizes information hierarchically
- Highlights definitions, formulas, and takeaways
- Uses clear, student-friendly language

### Chunk Synthesis Prompt

- Synthesizes multiple chunks into coherent summary
- Eliminates redundancy while preserving unique information
- Maintains logical flow and structure
- Creates unified narrative

---

## Services Architecture

### Processing Service (`processingService.ts`)

- Handles worker API communication
- Manages processing jobs and status
- Tracks processing attempts and errors

### AI Service (`aiService.ts`)

- Groq API integration
- Pre-constructed prompts for different tasks
- Token and word counting utilities

### Summary Service (`summaryService.ts`)

- Vector search integration for chunk retrieval
- Summary creation and management
- Chunk tracking for summaries

---

## Error Handling

All endpoints return structured error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common errors:

- `401`: Unauthorized (missing or invalid token)
- `404`: Resource not found
- `500`: Server error (includes detailed message)

---

## Notes

1. Files must be fully processed (status: `COMPLETED`) before summaries can be generated
2. The worker service must be running at `WORKER_BASE_URL`
3. Summaries use vector embeddings to find the most relevant chunks
4. Multiple summaries can be created for the same file with different parameters
5. All operations are user-scoped and require authentication

---

## Testing

### Manual Processing Test

```bash
# 1. Upload a file
curl -X POST http://localhost:3000/api/file/upload \
  -H "Authorization: Bearer <token>" \
  -F "files=@document.pdf"

# 2. Trigger processing
curl -X POST http://localhost:3000/api/processing/trigger/<fileId> \
  -H "Authorization: Bearer <token>"

# 3. Check status
curl http://localhost:3000/api/processing/status/<fileId> \
  -H "Authorization: Bearer <token>"
```

### Summary Generation Test

```bash
# 1. Create summary
curl -X POST http://localhost:3000/api/summary/file/<fileId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "customTitle": "Test Summary",
    "chunkLimit": 20,
    "useVectorSearch": true
  }'

# 2. Get summary
curl http://localhost:3000/api/summary/<summaryId> \
  -H "Authorization: Bearer <token>"
```
