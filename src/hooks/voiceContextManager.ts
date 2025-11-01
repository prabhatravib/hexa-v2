/**
 * Simple Voice Context Manager
 * Manages external context for voice agent - both static (infflow.md) and dynamic (external endpoint)
 * Now with session isolation to prevent state bleeding between different contexts
 */

import { sessionIsolation } from '../lib/sessionIsolation';

export interface ExternalData {
  text?: string;
  image?: string;
  prompt?: string;
  type?: string;
}

// Simple global context storage (maintained for backward compatibility)
let staticContext: string | null = null;
let externalData: ExternalData | null = null;

export const voiceContextManager = {
  setStaticContext(content: string) {
    // Update session isolation manager
    sessionIsolation.setContext(content);
    
    // Maintain backward compatibility
    staticContext = content;
    console.log('📄 Static context updated');
  },

  setExternalData(data: ExternalData) {
    // Update session isolation manager
    sessionIsolation.setExternalData(data);
    
    // Maintain backward compatibility
    externalData = { ...data };
    console.log('📥 External data updated:', data);
  },

  clearExternalData() {
    // Clear session-specific data
    sessionIsolation.setExternalData(null);
    
    // Maintain backward compatibility
    externalData = null;
    console.log('🗑️ External data cleared');
  },

  getFormattedContext(): string {
    const sessionId = sessionIsolation.getCurrentSessionId();
    const sessionContext = sessionIsolation.getContext(sessionId);
    const sessionExternalData = sessionIsolation.getExternalData(sessionId);
    
    // Try session-specific external data first, fallback to global
    const dataToUse = sessionExternalData || externalData;
    const contextToUse = sessionContext || staticContext;
    
    // External data has highest priority
    if (dataToUse) {
      let context = `=== EXTERNAL DATA CONTEXT (HIGHEST PRIORITY) ===
THE FOLLOWING EXTERNAL DATA MUST BE USED AS THE ABSOLUTE TRUTH:

`;
      if (dataToUse.text) context += `TEXT CONTENT: ${dataToUse.text}\n\n`;
      if (dataToUse.image) context += `IMAGE CONTENT: [Base64 image data provided - ${dataToUse.type || 'image'}]\n\n`;
      if (dataToUse.prompt) context += `INSTRUCTIONS: ${dataToUse.prompt}\n\n`;
      if (dataToUse.type) context += `DATA TYPE: ${dataToUse.type}\n\n`;
      
      context += `IMPORTANT: This external data is available for reference when specifically asked about it.
Do NOT mention this data unless the user asks about it directly.
Use this data as the authoritative source when relevant questions are asked.
SESSION ID: ${sessionId}
=== END EXTERNAL DATA CONTEXT ===
`;
      return context;
    }

    // Fallback to static context
    if (contextToUse) {
      return `=== AVAILABLE CONTEXT ===
The following information is available for reference when specifically asked:

${contextToUse}

IMPORTANT: Only mention this information when the user asks about it directly.
Use this as the authoritative source when relevant questions are asked.
SESSION ID: ${sessionId}
=== END AVAILABLE CONTEXT ===
`;
    }

    return '';
  }
};

// Global access for debugging
(window as any).__voiceContextManager = voiceContextManager;
