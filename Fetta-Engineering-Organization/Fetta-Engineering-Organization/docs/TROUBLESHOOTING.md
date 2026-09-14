# Fetta Troubleshooting Guide

## Installation Issues

### pnpm install fails with "ERR_PNPM_IGNORED_BUILDS"
**Symptom**: `Ignored build scripts: esbuild@0.28.2`

**Cause**: pnpm security feature requires explicit approval for build scripts

**Solution**: Packages are already installed. This is a safety check. You can:
1. Continue without approving (packages work)
2. Run `pnpm approve-builds` and select esbuild (interactive)

**Note**: esbuild is listed in `onlyBuiltDependencies` in `pnpm-workspace.yaml`, so it's already approved in the workspace configuration.

### TypeScript errors about verificationEvidence
**Symptom**: `'verificationEvidence' does not exist in type`

**Cause**: Database schema not yet updated

**Solution**:
```bash
# Set DATABASE_URL in .env first
pnpm --filter @workspace/db run push
```

## Runtime Issues

### "MODEL_BASE_URL environment variable is required"
**Cause**: Missing environment configuration

**Solution**:
```bash
# Create .env from example
cp .env.example .env

# Edit .env with your settings
```

### "Task failed: Orchestration error"
**Check**:
1. Model API key is valid
2. API key has quota/credits
3. Network connection works
4. Model endpoint is accessible

**Debug**:
```bash
# Check API server logs
pnpm --filter @workspace/api-server run dev
# Look for error details in console
```

### Agent gets stuck in "working" state
**Cause**: Model API call timed out or failed

**Solution**: Task will eventually fail and agents reset. Check:
- Model provider status
- API rate limits
- Network connectivity

### Files not being written
**Check**:
1. Repository path is writable
2. No file permission issues
3. Parent directories exist
4. Agent has error in logs

**Debug**: Check `executeTask` logs in API server console

## Database Issues

### "DATABASE_URL must be set"
**Cause**: Missing database configuration

**Solution**:
```bash
# Set in .env
DATABASE_URL=postgresql://user:password@localhost:5432/fetta
```

### "relation 'tasks' does not exist"
**Cause**: Database schema not created

**Solution**:
```bash
pnpm --filter @workspace/db run push
```

### Schema push fails
**Check**:
1. PostgreSQL is running
2. Database exists
3. User has CREATE privileges
4. Connection string is correct

## Model Provider Issues

### OpenAI API errors
**429 Rate Limit**: 
- Exceeded quota or rate limit
- Wait and retry
- Check billing/usage

**401 Unauthorized**:
- Invalid API key
- Check MODEL_API_KEY in .env

**Model not found**:
- Wrong model name
- Check available models for your account

### Local model (Ollama, etc.)
**Connection refused**:
- Ensure local model server is running
- Check BASE_URL points to correct port
- Default: `http://localhost:11434/v1`

**Model not loaded**:
- Load model first: `ollama pull llama2`
- Set MODEL_NAME to loaded model

## Frontend Issues

### "PORT environment variable is required"
**Cause**: Vite config requires PORT for builds

**Solution**:
```bash
# For development
PORT=3000 BASE_PATH=/ pnpm run dev

# For production
PORT=3000 BASE_PATH=/app pnpm run build
```

### API calls fail with CORS error
**Check**:
1. API server is running (port 8080)
2. CORS is enabled (already configured)
3. Check browser console for URL

**Expected**: API at `http://localhost:8080/api`

### UI shows "Not connected" in settings
**Normal**: Settings UI stores config in localStorage but doesn't check health yet. The API server uses environment variables, not browser storage.

## Agent Issues

### Coordinator produces unclear plans
**Cause**: Objective too vague

**Solution**: Be more specific:
- ❌ "Fix the bug"
- ✅ "Fix the TypeScript error in src/auth.ts line 42"

### Backend produces invalid JSON
**Cause**: Model didn't follow instructions

**Debug**: Check API server logs for:
- `Failed to parse backend response`
- Raw content will be logged

**Solution**: Retry with clearer objective

### Test agent always passes/fails
**Cause**: Model hallucinating or misunderstanding

**Debug**: Check verification evidence in task details

**Solution**: Improve objective specificity

## Performance Issues

### Task execution is slow
**Expected**: 30-60 seconds for 4-agent workflow

**Factors**:
- Model inference time
- File I/O for large repos
- Number of files to inspect

**Optimization** (future):
- Parallel agent execution
- Cached file listings
- Faster models (gpt-3.5-turbo)

### High memory usage
**Cause**: Large repository context

**Mitigation**:
- File listing limited to 100 files
- File content limited to 3KB each
- Depth limited to 3 levels

## Development Issues

### Build fails
**TypeScript errors**:
```bash
# Check all packages
pnpm run typecheck

# Check specific package
cd lib/ai-provider
npx tsc --noEmit
```

**Missing dependencies**:
```bash
pnpm install
```

### Hot reload not working
**API Server**:
- No hot reload by default
- Restart after changes

**Frontend**:
- Vite should auto-reload
- Check browser console for errors

## Debugging Tools

### Check agent execution
```typescript
// In orchestrator.ts
logger.info({ taskId, objective }, "Starting task");
logger.info({ plan }, "Coordinator completed");
logger.info({ guidance }, "Architect completed");
logger.info({ filesModified }, "Backend completed");
logger.info({ passed, evidence }, "Test completed");
```

### Check database state
```sql
-- View tasks
SELECT id, title, status, verification_state FROM tasks;

-- View events
SELECT agent, message, created_at FROM events ORDER BY created_at DESC LIMIT 10;

-- View agent states
SELECT name, status, current_activity FROM agent_definitions;
```

### Check file changes
```bash
# View uncommitted changes
git status
git diff

# View specific file
cat path/to/modified/file.ts
```

## Common Error Messages

### "Response from agent did not match expected format"
**Meaning**: Model returned unexpected JSON structure

**Fix**: Check orchestrator prompts, retry task

### "File not found or cannot be read"
**Meaning**: Agent trying to read non-existent file

**Normal**: Plan mentioned file that doesn't exist

**Fix**: Usually harmless, agent will note in context

### "Failed to write file"
**Meaning**: Permission error or invalid path

**Check**: Repository path, file permissions

## Getting Help

1. Check API server console logs
2. Check browser console (frontend)
3. Examine task verification evidence
4. Review agent event stream
5. Check database for error records

## Clean Slate

If things are completely broken:

```bash
# Reset database (WARNING: loses all data)
pnpm --filter @workspace/db run push-force

# Clear node_modules
rm -rf node_modules
rm -rf **/node_modules
pnpm install

# Rebuild everything
pnpm run build
```
