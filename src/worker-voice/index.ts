/// <reference types="@cloudflare/workers-types" />

import { VoiceSession, Env } from './voice-session';
import { indexHtml } from './generated-index';

// Export Durable Objects
export { VoiceSession };

/**
 * Get global Durable Object ID
 * Single DO instance handles all connections with client-side filtering for isolation
 */
function getGlobalDurableObjectId(env: Env): DurableObjectId {
  return env.VOICE_SESSION.idFromName('global');
}

// Main worker
export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // Handle all voice and API routes - Use global DO
    // Client-side filtering prevents session bleeding
    if (url.pathname.startsWith('/voice/') ||
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/external-data.md')) {
      const durableObjectId = getGlobalDurableObjectId(env);
      const durableObject = env.VOICE_SESSION.get(durableObjectId);
      return durableObject.fetch(request);
    }

    // For SPA routing: serve the React app for all non-API routes
    // This handles routes like /enhancedMode, /any-other-route
    // Serve the built index.html with correct asset references (injected at build time)
    return new Response(indexHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      }
    });
  }
};
