# Quick Setup Guide for New Features

## 1. Install Dependencies

Run this command to install the new packages (axios and openai):

```bash
npm install
```

## 2. Generate Prisma Client

Generate the Prisma client with the new Summary models:

```bash
npm run generate
```

## 3. Run Database Migration

Create the new tables in your database:

```bash
npm run migrate:dev
```

When prompted for a migration name, use something like: `add_summary_models`

## 4. Verify Environment Variables

Make sure your `.env` file has these variables:

```env
# Worker API
WORKER_BASE_URL=http://localhost:8000

# Groq AI API
GROQ_API_KEY=your_api_key_here
GROQ_MODEL_ID=qwen/qwen3-32b
```

## 5. Start the Worker Service

Make sure the Python worker is running before using processing features:

```bash
cd ../study-tool-worker
python -m app.main
```

Or if using Docker:

```bash
cd ../study-tool-worker
docker-compose up
```

## 6. Start the Backend

```bash
npm run dev
```

## 7. Test the Endpoints

### Test Processing:

```bash
# Get worker health
curl http://localhost:3000/api/processing/health \
  -H "Authorization: Bearer YOUR_TOKEN"

# Trigger processing for a file
curl -X POST http://localhost:3000/api/processing/trigger/FILE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check processing status
curl http://localhost:3000/api/processing/status/FILE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Summary Generation:

```bash
# Create a summary
curl -X POST http://localhost:3000/api/summary/file/FILE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customTitle": "My Summary",
    "chunkLimit": 20,
    "useVectorSearch": true
  }'

# Get summaries for a file
curl http://localhost:3000/api/summary/file/FILE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get all your summaries
curl http://localhost:3000/api/summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Common Issues & Solutions

### Issue: "Cannot find module 'axios' or 'openai'"

**Solution**: Run `npm install` to install dependencies

### Issue: "Property 'summary' does not exist on type 'PrismaClient'"

**Solution**: Run `npm run generate` to regenerate Prisma client

### Issue: "Failed to connect to worker"

**Solution**: Make sure the Python worker is running at http://localhost:8000

### Issue: "File must be fully processed before generating a summary"

**Solution**:

1. Check file status: GET `/api/processing/status/:fileId`
2. If status is PENDING or FAILED, trigger processing: POST `/api/processing/trigger/:fileId`
3. Wait for status to become COMPLETED
4. Then create summary

## New Files Created

- `/src/services/processingService.ts` - Worker API integration
- `/src/services/aiService.ts` - Groq AI integration
- `/src/services/summaryService.ts` - Summary management
- `/src/controllers/processingController.ts` - Processing endpoints
- `/src/controllers/summaryController.ts` - Summary endpoints
- `/src/routes/processing.routes.ts` - Processing routes
- `/src/routes/summary.routes.ts` - Summary routes
- `/API_DOCUMENTATION.md` - Complete API docs
- `/IMPLEMENTATION_NOTES.md` - Implementation summary

## Database Changes

Two new tables:

- `summaries` - Stores AI-generated summaries
- `summary_chunks` - Links summaries to document chunks

See [prisma/schema.prisma](prisma/schema.prisma) for full schema.

## Ready to Use!

Once you've completed steps 1-6, you can start using the new features. Check the [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for detailed endpoint documentation.
