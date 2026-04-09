/**
 * GitHub App Authentication Helpers
 * 
 * Required Environment Variables:
 * - GITHUB_APP_ID: Your GitHub App's ID
 * - GITHUB_APP_PRIVATE_KEY: Your GitHub App's private key (PEM format)
 * - GITHUB_APP_INSTALLATION_ID: Installation ID for your repo
 */

import { CACHE_KEYS, GITHUB, getGitHubAppConfig } from './config.js';

/**
 * Generate a JWT for GitHub App authentication
 * @param {string} appId - GitHub App ID
 * @param {string} privateKey - PEM-formatted private key
 * @returns {Promise<string>} JWT token
 */
async function generateGitHubAppJWT(appId, privateKey) {
  // JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // JWT payload - issued at (iat) and expires in 10 minutes
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds in the past to account for clock drift
    exp: now + 600, // Expires in 10 minutes
    iss: appId,
  };

  // Encode header and payload
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const toSign = `${encodedHeader}.${encodedPayload}`;

  // Import the private key
  const keyData = pemToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(toSign)
  );

  const encodedSignature = base64urlEncode(signature);
  return `${toSign}.${encodedSignature}`;
}

/**
 * Get an installation access token using the GitHub App
 * @param {string} jwt - GitHub App JWT
 * @param {string} installationId - Installation ID
 * @returns {Promise<{token: string, expiresAt: string}>}
 */
async function getGitHubAppInstallationToken(jwt, installationId) {
  const response = await fetch(
    `${GITHUB.API_BASE}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'X-GitHub-Api-Version': GITHUB.API_VERSION,
        'User-Agent': GITHUB.USER_AGENT,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to get installation token: ${error.message || response.statusText}`
    );
  }

  const data = await response.json();
  return {
    token: data.token,
    expiresAt: data.expires_at,
  };
}

/**
 * Get a GitHub App installation access token with caching in KV
 * @param {object} env - Worker environment bindings
 * @returns {Promise<string>} Installation access token
 */
async function getGitHubAppToken(env) {
  const cacheKey = CACHE_KEYS.GITHUB_APP_TOKEN;
  
  // Try to get cached token from KV
  const cached = await env.CACHE_KV.get(cacheKey, 'json');
  if (cached && cached.token && cached.expiresAt) {
    const expiresAt = new Date(cached.expiresAt).getTime();
    const now = Date.now();
    // Refresh if less than 5 minutes remaining
    if (expiresAt - now > 5 * 60 * 1000) {
      return cached.token;
    }
  }

  // Generate new token
  const { appId, privateKey, installationId } = getGitHubAppConfig(env);
  const jwt = await generateGitHubAppJWT(appId, privateKey);

  const { token, expiresAt } = await getGitHubAppInstallationToken(
    jwt,
    installationId
  );

  // Cache the token with TTL until expiration (max 1 hour)
  const ttl = Math.min(
    3600,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000) - 300
  );

  await env.CACHE_KV.put(
    cacheKey,
    JSON.stringify({ token, expiresAt }),
    { expirationTtl: ttl }
  );

  return token;
}

/**
 * Convert PEM private key to ArrayBuffer
 */
function pemToArrayBuffer(pem) {
  const pemContents = pem
    .replace(/-----BEGIN .*-----/, '')
    .replace(/-----END .*-----/, '')
    .replace(/\s/g, '');
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Base64 URL encode
 */
function base64urlEncode(data) {
  let base64;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else if (data instanceof ArrayBuffer) {
    base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  } else {
    throw new Error('Unsupported data type for base64url encoding');
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export {
  generateGitHubAppJWT,
  getGitHubAppInstallationToken,
  getGitHubAppToken,
};
