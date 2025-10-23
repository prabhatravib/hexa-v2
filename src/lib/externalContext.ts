/**
 * External Context Utilities
 * Handles injection of external context into active Realtime sessions using Zustand store
 * Now with session isolation to prevent state bleeding between different contexts
 */

import { useExternalDataStore } from '../store/externalDataStore';
import { sessionIsolation } from './sessionIsolation';

export function stripCodeFences(raw: string): string {
  // Remove ```xxx fences and trim
  let text = raw
    .replace(/^```[\w]*\s*/, '') // Remove opening fence (```mermaid or ```)
    .replace(/```\s*$/, '') // Remove closing fence
    .trim();

  // If we still have content, return it
  if (text) {
    return text;
  }

  // Fallback: if stripping removed everything, return original
  console.log('⚠️ Code fence stripping removed all content, using original text');
  return raw.trim();
}

// Global reference to the active session (maintained for backward compatibility)
let activeSession: any = null;
let baseInstructions = '';
let lastInjectedHash = '';
let lastAspectContextId: string | null = null;
let pendingAspectContext: string | null = null;

// Store global external data that persists across sessions (maintained for backward compatibility)
let globalExternalData: string | null = null;

export function setActiveSession(session: any) {
  // Update session isolation manager
  sessionIsolation.setActiveSession(session);
  
  // Maintain backward compatibility with global variables
  activeSession = session;
  (window as any).activeSession = session; // important
  lastInjectedHash = '';
  lastAspectContextId = null;

  const pending = (window as any).__pendingExternalContext;
  if (pending) {
    (window as any).__pendingExternalContext = null;
    injectExternalContext(pending); // fire-and-forget
  }

  const pendingAspect =
    (window as any).__pendingAspectContext ??
    pendingAspectContext;

  if (pendingAspect) {
    (window as any).__pendingAspectContext = null;
    pendingAspectContext = null;
    updateAspectContext(pendingAspect); // fire-and-forget
  }
}

function isRealtimeReady() {
  const s = (window as any).activeSession || activeSession;
  const ready = !!s && s.state === 'open' && s.transport?.sendEvent;
  console.log('🔍 Realtime ready check:', {
    sessionId: sessionIsolation.getCurrentSessionId(),
    hasSession: !!s,
    state: s?.state,
    hasTransport: !!s?.transport?.sendEvent,
    result: ready,
  });
  return ready;
}

export function setBaseInstructions(instr: string) {
  // Update session isolation manager
  sessionIsolation.setBaseInstructions(instr);
  
  // Maintain backward compatibility
  baseInstructions = instr || '';
}

export function getBaseInstructions(): string {
  // Try session-specific instructions first, fallback to global
  const sessionInstructions = sessionIsolation.getBaseInstructions();
  return sessionInstructions || baseInstructions;
}


export function setGlobalExternalData(data: string) {
  // Update session isolation manager
  sessionIsolation.setExternalData({ text: data });
  
  // Maintain backward compatibility
  globalExternalData = data;
  console.log('🌍 Global external data set:', data);

  // If there's an active session, inject immediately
  if (activeSession) {
    console.log('🔄 Active session found, injecting immediately');
    injectExternalContext({ text: data }); // fire-and-forget
  } else {
    console.log('ℹ️ No active session, will inject when session becomes available');
  }
}

export function getGlobalExternalData(): string | null {
  // Try session-specific data first, fallback to global
  const sessionData = sessionIsolation.getExternalData();
  return sessionData?.text || globalExternalData;
}

// Automatically inject global external data when session becomes active
export async function injectGlobalExternalData() {
  const sessionData = sessionIsolation.getExternalData();
  const sessionActiveSession = sessionIsolation.getSessionContext().activeSession;
  
  // Try session-specific data first, fallback to global
  const dataToInject = sessionData?.text || globalExternalData;
  const activeSessionToUse = sessionActiveSession || activeSession;
  
  if (dataToInject && activeSessionToUse) {
    console.log('🔄 Injecting global external data into new session:', dataToInject);
    await injectExternalContext({ text: dataToInject });
  } else {
    console.log('ℹ️ No global external data or no active session:', {
      hasGlobalData: !!dataToInject,
      hasActiveSession: !!activeSessionToUse,
    });
  }
}

export function clearActiveSession() {
  // Clear session-specific data
  const sessionId = sessionIsolation.getCurrentSessionId();
  const context = sessionIsolation.getSessionContext(sessionId);
  context.activeSession = null;
  context.lastAspectContextId = null;
  
  // Maintain backward compatibility
  activeSession = null;
  lastAspectContextId = null;
}

export function injectCurrentExternalData() {
  const store = useExternalDataStore.getState();
  const currentData = store.currentData;

  if (!currentData || !currentData.text) {
    return;
  }

  injectExternalContext({ text: currentData.text }); // fire-and-forget
}

export async function injectExternalContext(data: { text: string } | string): Promise<boolean> {
  // Handle both object and string formats for backward compatibility
  const text = typeof data === 'string' ? data : data?.text;
  if (!text) {
    console.log('❌ No text to inject');
    return false;
  }

  const stripped = stripCodeFences(text);
  if (!stripped) {
    console.log('❌ Text became empty after stripping');
    return false;
  }

  if (!isRealtimeReady()) {
    console.log('⏳ Session not ready, queuing external context for later injection');
    (window as any).__pendingExternalContext = stripped;
    return false;
  }

  const s = (window as any).activeSession || activeSession;

  if (!s) {
    console.log('❌ No active session found');
    (window as any).__pendingExternalContext = stripped;
    return false;
  }

  // Check for duplicates using session-specific hash
  const sessionId = sessionIsolation.getCurrentSessionId();
  const context = sessionIsolation.getSessionContext(sessionId);
  const hash = await cryptoDigest(stripped);
  
  if (hash === context.lastInjectedHash) {
    console.log('⏭️ Skipping duplicate injection (same content already injected)');
    return true;
  }
  
  // Update both session-specific and global hash for backward compatibility
  context.lastInjectedHash = hash;
  lastInjectedHash = hash;

  // Silent system context. No response.create here.
  try {
    console.log('📤 Injecting external context via transport.sendEvent...');
    s.transport.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: stripped }],
      },
    });
    console.log('✅ External context successfully injected into voice session!');
    console.log('📝 Injected text:', stripped.substring(0, 200) + '...');
    return true;
  } catch (e) {
    console.error('❌ Failed to inject external context:', e);
    // Fallback to queue
    (window as any).__pendingExternalContext = stripped;
    return false;
  }
}

export async function updateAspectContext(raw: string): Promise<boolean> {
  const stripped = stripCodeFences(raw);
  if (!stripped) {
    console.log('[aspect-context] no aspect context provided');
    return false;
  }

  if (!isRealtimeReady()) {
    console.log('[aspect-context] session not ready, queueing update');
    const sessionId = sessionIsolation.getCurrentSessionId();
    const context = sessionIsolation.getSessionContext(sessionId);
    context.pendingAspectContext = stripped;
    pendingAspectContext = stripped;
    (window as any).__pendingAspectContext = stripped;
    return false;
  }

  const session = (window as any).activeSession || activeSession;
  if (!session || !session.transport?.sendEvent) {
    console.warn('[aspect-context] session transport unavailable; queueing update');
    const sessionId = sessionIsolation.getCurrentSessionId();
    const context = sessionIsolation.getSessionContext(sessionId);
    context.pendingAspectContext = stripped;
    pendingAspectContext = stripped;
    (window as any).__pendingAspectContext = stripped;
    return false;
  }

  const messageId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `aspect-${crypto.randomUUID()}`
      : `aspect-${Date.now().toString(36)}`;

  try {
    session.transport.sendEvent({
      type: 'conversation.item.create',
      item: {
        id: messageId,
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: stripped }],
      },
    });

    // Update both session-specific and global state for backward compatibility
    const sessionId = sessionIsolation.getCurrentSessionId();
    const context = sessionIsolation.getSessionContext(sessionId);
    context.lastAspectContextId = messageId;
    context.pendingAspectContext = null;
    lastAspectContextId = messageId;
    pendingAspectContext = null;
    (window as any).__pendingAspectContext = null;

    console.log('[aspect-context] applied to session', {
      sessionId,
      messageId,
      preview: stripped.slice(0, 120),
    });
    return true;
  } catch (error) {
    console.error('[aspect-context] failed to apply aspect context; will retry when session is ready', error);
    const sessionId = sessionIsolation.getCurrentSessionId();
    const context = sessionIsolation.getSessionContext(sessionId);
    context.pendingAspectContext = stripped;
    pendingAspectContext = stripped;
    (window as any).__pendingAspectContext = stripped;
    return false;
  }
}


// Simple browser crypto hash
async function cryptoDigest(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Function to inject external data from Zustand store on demand
export function injectExternalDataFromStore() {
  const store = useExternalDataStore.getState();
  const formattedContext = store.getFormattedContext();

  if (!formattedContext) {
    return;
  }

  // Check both session-specific and global active session
  const sessionId = sessionIsolation.getCurrentSessionId();
  const context = sessionIsolation.getSessionContext(sessionId);
  const activeSessionToUse = context.activeSession || activeSession;

  if (!activeSessionToUse) {
    return;
  }

  // Use the same injection method as injectExternalContext
  injectExternalContext({ text: formattedContext }); // fire-and-forget
}

// Global access for debugging
(window as any).__injectExternalContext = injectExternalContext;
(window as any).__setActiveSession = setActiveSession;
(window as any).__injectFromStore = injectExternalDataFromStore;
(window as any).__injectCurrentData = injectCurrentExternalData;
(window as any).__updateAspectContext = updateAspectContext;
