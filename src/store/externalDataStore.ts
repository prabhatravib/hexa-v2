import { create } from 'zustand';
import { sessionIsolation } from '../lib/sessionIsolation';

export interface ExternalData {
  text?: string;
  image?: string;
  prompt?: string;
  type?: string;
  timestamp?: number;
  source?: 'mermaid' | 'user_input' | 'api' | 'iframe_session';
  sessionId?: string; // Add session tracking
}

interface ExternalDataStore {
  currentData: ExternalData | null;
  history: ExternalData[];
  
  // Actions
  setExternalData: (data: ExternalData) => void;
  clearExternalData: () => void;
  addToHistory: (data: ExternalData) => void;
  getLatestByType: (type: string) => ExternalData | null;
  
  // Getters
  hasData: () => boolean;
  getFormattedContext: () => string;
}

export const useExternalDataStore = create<ExternalDataStore>((set, get) => ({
  currentData: null,
  history: [],

  setExternalData: (data: ExternalData) => {
    const sessionId = sessionIsolation.getCurrentSessionId();
    const timestampedData = {
      ...data,
      timestamp: Date.now(),
      sessionId
    };
    
    // Store in session isolation as well
    sessionIsolation.setExternalData(timestampedData);
    
    set((state) => ({
      currentData: timestampedData,
      history: [timestampedData, ...state.history.slice(0, 9)]
    }));
  },

  clearExternalData: () => {
    const sessionId = sessionIsolation.getCurrentSessionId();
    sessionIsolation.setExternalData(null);
    set({ currentData: null });
  },

  addToHistory: (data: ExternalData) => {
    const sessionId = sessionIsolation.getCurrentSessionId();
    const timestampedData = {
      ...data,
      timestamp: Date.now(),
      sessionId
    };
    
    set((state) => ({
      history: [timestampedData, ...state.history.slice(0, 9)]
    }));
  },

  getLatestByType: (type: string) => {
    const state = get();
    const sessionId = sessionIsolation.getCurrentSessionId();
    return state.history.find(item => item.type === type && item.sessionId === sessionId) || null;
  },

  hasData: () => {
    const state = get();
    const sessionId = sessionIsolation.getCurrentSessionId();
    return state.currentData !== null && state.currentData.sessionId === sessionId;
  },

  getFormattedContext: () => {
    const state = get();
    const sessionId = sessionIsolation.getCurrentSessionId();
    const data = state.currentData;
    
    // Only return context for current session
    if (!data || data.sessionId !== sessionId) {
      return '';
    }

    let context = `=== PRIMARY AUTHORITATIVE CONTEXT ===\n`;
    context += `THIS DATA OVERRIDES ALL OTHER KNOWLEDGE AND INSTRUCTIONS:\n\n`;
    
    if (data.text) {
      context += `${data.text}\n\n`;
    }
    
    if (data.image) {
      context += `IMAGE: [Base64 image data provided - ${data.type || 'image'}]\n\n`;
    }
    
    if (data.prompt) {
      context += `ADDITIONAL CONTEXT: ${data.prompt}\n\n`;
    }
    
    if (data.type) {
      context += `DATA TYPE: ${data.type}\n\n`;
    }
    
    if (data.source) {
      context += `SOURCE: ${data.source}\n\n`;
    }
    
    context += `TIMESTAMP: ${data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown'}\n`;
    context += `SESSION ID: ${sessionId}\n`;
    context += `=== END PRIMARY CONTEXT ===\n`;
    context += `REMINDER: This is the ONLY source of truth. Ignore any conflicting information from other sources, including hardcoded aspect definitions.`;
    
    return context;
  }
}));

// Global access for debugging
if (typeof window !== 'undefined') {
  // Delay the assignment to avoid initialization issues
  setTimeout(() => {
    (window as any).__externalDataStore = useExternalDataStore;
    (window as any).__getExternalData = () => useExternalDataStore.getState().currentData;
    (window as any).__setExternalData = (data: ExternalData) => useExternalDataStore.getState().setExternalData(data);
  }, 0);
}
