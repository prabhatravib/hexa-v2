/**
 * Session Isolation Manager
 * 
 * Provides complete session isolation to prevent state bleeding between different
 * iframe instances and contexts. Each session maintains its own isolated state
 * while maintaining backward compatibility with existing global references.
 */

interface SessionContext {
  externalData: any;
  activeSession: any;
  context: string | null;
  lastInjectedHash: string;
  lastAspectContextId: string | null;
  pendingAspectContext: string | null;
  baseInstructions: string;
}

class SessionIsolationManager {
  private sessions: Map<string, SessionContext> = new Map();
  private cachedStandaloneSessionId: string | null = null;

  /**
   * Get the current session ID based on URL parameters or generate a unique one
   * For standalone mode (no URL param), the ID is cached and persisted in localStorage
   */
  getCurrentSessionId(): string {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');

    // If URL has sessionId parameter, use it (iframe/embedded mode)
    if (sessionId) {
      console.log('🔍 Using session ID from URL parameter:', sessionId);
      return sessionId;
    }

    // For standalone mode, check cache first
    if (this.cachedStandaloneSessionId) {
      console.log('🔍 Using cached standalone session ID:', this.cachedStandaloneSessionId);
      return this.cachedStandaloneSessionId;
    }

    // Check localStorage for persisted session ID (survives page reloads)
    try {
      const stored = localStorage.getItem('hexa_standalone_session_id');
      if (stored) {
        this.cachedStandaloneSessionId = stored;
        console.log('🔍 Restored standalone session ID from localStorage:', stored);
        return stored;
      }
    } catch (error) {
      console.warn('⚠️ Failed to access localStorage:', error);
    }

    // Generate NEW standalone session ID (only on first call)
    const newId = `standalone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.cachedStandaloneSessionId = newId;

    try {
      localStorage.setItem('hexa_standalone_session_id', newId);
      console.log('🆕 Generated new standalone session ID:', newId);
    } catch (error) {
      console.warn('⚠️ Failed to persist session ID to localStorage:', error);
    }

    return newId;
  }
  
  /**
   * Get or create session context for a specific session ID
   */
  getSessionContext(sessionId?: string): SessionContext {
    const id = sessionId || this.getCurrentSessionId();
    
    if (!this.sessions.has(id)) {
      this.sessions.set(id, {
        externalData: null,
        activeSession: null,
        context: null,
        lastInjectedHash: '',
        lastAspectContextId: null,
        pendingAspectContext: null,
        baseInstructions: ''
      });
    }
    
    return this.sessions.get(id)!;
  }
  
  /**
   * Set active session for a specific session ID
   */
  setActiveSession(session: any, sessionId?: string): void {
    const context = this.getSessionContext(sessionId);
    context.activeSession = session;
    
    // Set global reference for backward compatibility
    (window as any).activeSession = session;
    
    // Handle pending context for this session
    if (context.pendingAspectContext) {
      // Inject pending context
      this.injectPendingContext(context);
    }
  }
  
  /**
   * Set external data for a specific session ID
   */
  setExternalData(data: any, sessionId?: string): void {
    const context = this.getSessionContext(sessionId);
    context.externalData = data;
  }
  
  /**
   * Get external data for a specific session ID
   */
  getExternalData(sessionId?: string): any {
    const context = this.getSessionContext(sessionId);
    return context.externalData;
  }
  
  /**
   * Set context string for a specific session ID
   */
  setContext(context: string, sessionId?: string): void {
    const sessionContext = this.getSessionContext(sessionId);
    sessionContext.context = context;
  }
  
  /**
   * Get context string for a specific session ID
   */
  getContext(sessionId?: string): string | null {
    const sessionContext = this.getSessionContext(sessionId);
    return sessionContext.context;
  }
  
  /**
   * Set last injected hash for a specific session ID
   */
  setLastInjectedHash(hash: string, sessionId?: string): void {
    const context = this.getSessionContext(sessionId);
    context.lastInjectedHash = hash;
  }
  
  /**
   * Get last injected hash for a specific session ID
   */
  getLastInjectedHash(sessionId?: string): string {
    const context = this.getSessionContext(sessionId);
    return context.lastInjectedHash;
  }
  
  /**
   * Set base instructions for a specific session ID
   */
  setBaseInstructions(instructions: string, sessionId?: string): void {
    const context = this.getSessionContext(sessionId);
    context.baseInstructions = instructions;
  }
  
  /**
   * Get base instructions for a specific session ID
   */
  getBaseInstructions(sessionId?: string): string {
    const context = this.getSessionContext(sessionId);
    return context.baseInstructions;
  }
  
  /**
   * Set last aspect context ID for a specific session ID
   */
  setLastAspectContextId(id: string | null, sessionId?: string): void {
    const context = this.getSessionContext(sessionId);
    context.lastAspectContextId = id;
  }
  
  /**
   * Get last aspect context ID for a specific session ID
   */
  getLastAspectContextId(sessionId?: string): string | null {
    const context = this.getSessionContext(sessionId);
    return context.lastAspectContextId;
  }
  
  /**
   * Set pending aspect context for a specific session ID
   */
  setPendingAspectContext(context: string | null, sessionId?: string): void {
    const sessionContext = this.getSessionContext(sessionId);
    sessionContext.pendingAspectContext = context;
  }
  
  /**
   * Get pending aspect context for a specific session ID
   */
  getPendingAspectContext(sessionId?: string): string | null {
    const context = this.getSessionContext(sessionId);
    return context.pendingAspectContext;
  }
  
  /**
   * Clear a specific session
   */
  clearSession(sessionId?: string): void {
    const id = sessionId || this.getCurrentSessionId();
    this.sessions.delete(id);
    
    // If this was the current session, clear global references
    if (id === this.getCurrentSessionId()) {
      (window as any).activeSession = null;
    }
  }
  
  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessions.clear();
    (window as any).activeSession = null;
  }
  
  /**
   * Inject pending context into active session
   */
  private injectPendingContext(context: SessionContext): void {
    if (context.pendingAspectContext && context.activeSession) {
      // Inject the pending context
      try {
        context.activeSession.transport.sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'system',
            content: [{ type: 'input_text', text: context.pendingAspectContext }],
          },
        });
        context.pendingAspectContext = null;
      } catch (error) {
        console.error('Failed to inject pending context:', error);
      }
    }
  }
  
  /**
   * Get all sessions (for debugging)
   */
  getAllSessions(): Map<string, SessionContext> {
    return new Map(this.sessions);
  }
  
  /**
   * Get current session info (for debugging)
   */
  getCurrentSessionInfo(): { sessionId: string; context: SessionContext } {
    const sessionId = this.getCurrentSessionId();
    return {
      sessionId,
      context: this.getSessionContext(sessionId)
    };
  }
  
  /**
   * Check if a session exists
   */
  hasSession(sessionId?: string): boolean {
    const id = sessionId || this.getCurrentSessionId();
    return this.sessions.has(id);
  }
  
  /**
   * Get session count (for debugging)
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Reset standalone session - generates a new session ID
   * Useful for testing or when you want to start fresh
   */
  resetStandaloneSession(): void {
    this.cachedStandaloneSessionId = null;
    try {
      localStorage.removeItem('hexa_standalone_session_id');
      console.log('🔄 Standalone session reset - new ID will be generated on next access');
    } catch (error) {
      console.warn('⚠️ Failed to clear session ID from localStorage:', error);
    }
  }

  /**
   * Force clear all sessions and reset standalone session
   * Nuclear option for debugging
   */
  resetAll(): void {
    this.sessions.clear();
    this.resetStandaloneSession();
    (window as any).activeSession = null;
    console.log('🔄 All sessions and state cleared');
  }
}

export const sessionIsolation = new SessionIsolationManager();

// Global access for debugging
if (typeof window !== 'undefined') {
  (window as any).__sessionIsolation = sessionIsolation;

  // Add helpful debug commands
  console.log('🐛 Session Isolation Debug Commands:');
  console.log('  window.__sessionIsolation.getCurrentSessionInfo() - View current session');
  console.log('  window.__sessionIsolation.getAllSessions() - View all sessions');
  console.log('  window.__sessionIsolation.resetStandaloneSession() - Reset standalone session ID');
  console.log('  window.__sessionIsolation.resetAll() - Clear all sessions (nuclear option)');
}
