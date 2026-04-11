# Security Configuration

## CORS Security

This worker implements strict CORS controls to prevent unauthorized access.

### Production Security (Default)

By default, **ONLY** the configured `ALLOWED_ORIGIN` can access the API:
- ✅ `https://manikantatarun.github.io` (production)
- ❌ localhost blocked
- ❌ any other origin blocked

**Configuration:**
```toml
# wrangler.toml
[vars]
ALLOWED_ORIGIN = "https://manikantatarun.github.io"
# ENABLE_PREVIEW_CORS is NOT set (defaults to false)
```

### Preview/Testing Security

For preview deployments or local development, you can enable localhost access:

**⚠️ WARNING**: Only enable this for non-production environments!

```bash
# In Cloudflare Dashboard or .dev.vars
ENABLE_PREVIEW_CORS=true
```

**When enabled**, the following origins are allowed:
- ✅ Production origin (`ALLOWED_ORIGIN`)
- ✅ `http://localhost:5173` (Vite dev)
- ✅ `http://localhost:4173` (Vite preview)
- ✅ `http://localhost:3000`
- ✅ `http://127.0.0.1:*` variants

### Security Checklist

- [ ] Production deployment has `ENABLE_PREVIEW_CORS` unset or set to `false`
- [ ] `ALLOWED_ORIGIN` points to your production domain (not `*`)
- [ ] GitHub App secrets are encrypted in Cloudflare dashboard
- [ ] Preview deployments use separate worker instances
- [ ] `.dev.vars` is in `.gitignore`
- [ ] Private keys are base64 encoded and never committed

### Attack Scenarios Prevented

1. **Unauthorized localhost access in production**
   - Without `ENABLE_PREVIEW_CORS=true`, localhost is blocked
   - Prevents developers' local apps from accessing production data

2. **CORS bypass attempts**
   - Origin header is validated against allowlist
   - Wildcard (`*`) requires explicit configuration

3. **Preview deployment exposure**
   - Preview CORS only enabled on preview URLs
   - Production URL always uses strict CORS

### Deployment Strategies

#### Strategy 1: Separate Workers (Recommended)
```bash
# Production worker (main branch)
wrangler deploy --env production
# ENABLE_PREVIEW_CORS not set

# Preview worker (feature branches)
wrangler deploy --env preview
# ENABLE_PREVIEW_CORS=true set in dashboard
```

#### Strategy 2: Single Worker (Less Secure)
```bash
# Use environment variable to control
# Set ENABLE_PREVIEW_CORS=true only via dashboard for testing
# Never commit it to wrangler.toml
```

### Verifying CORS Configuration

Test from browser console:
```javascript
// Should succeed from production origin
fetch('https://devnotes.manikanta-tarun.workers.dev/notes/meta')
  .then(r => console.log('✅ Access granted'))
  .catch(e => console.log('❌ CORS blocked'));

// Should fail from random origin (when ENABLE_PREVIEW_CORS=false)
// Open devtools on any site and try:
fetch('https://devnotes.manikanta-tarun.workers.dev/notes/meta')
  .catch(e => console.log('✅ Correctly blocked:', e));
```

### Environment Variable Priority

1. **Cloudflare Dashboard** (highest priority)
   - Settings → Variables → Environment Variables
   - Survives redeployments
   - Can be encrypted

2. **wrangler.toml** `[vars]` section
   - Committed to git
   - Good for non-sensitive values

3. **.dev.vars** (local development only)
   - Not deployed to Cloudflare
   - Good for local secrets

### Incident Response

If you accidentally enable preview CORS in production:

1. **Immediate action**:
   ```bash
   # Remove the variable
   wrangler secret delete ENABLE_PREVIEW_CORS --env production
   
   # Or set to false
   wrangler secret put ENABLE_PREVIEW_CORS --env production
   # Enter: false
   ```

2. **Verify**:
   ```bash
   # Check worker logs for unauthorized access
   wrangler tail --env production
   ```

3. **Rotate secrets** if sensitive data was exposed:
   - GitHub App private key
   - OAuth client secret

### Additional Resources

- See `ENV.md` for all environment variables
- See `.dev.vars.example` for local development setup
- See `wrangler.toml` for deployment configuration
