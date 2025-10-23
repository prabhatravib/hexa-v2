import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';
import { MessageBubble, Message } from './MessageBubble';
import { AspectSelector, AspectConfig } from './AspectSelector';
import { updateAspectContext } from '@/lib/externalContext';

interface ChatPanelProps {
  transcript: string | null;
  response: string | null;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  onSendMessage?: (text: string) => Promise<boolean>;
  isAgentReady?: boolean;
  enhancedMode?: boolean; // Controls whether to show feature count buttons
  aspectCount?: number; // Number of aspect buttons to show (2-10, default 7)
  aspectConfigs?: AspectConfig[]; // Configuration for aspect buttons with titles and descriptions
  isEmbedded?: boolean; // NEW: indicates if chat should use embedded layout
}

type AspectNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface AspectMessages {
  voice: Message[];
  text: Message[];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  transcript,
  response,
  isMinimized = false,
  onToggleMinimize,
  onSendMessage,
  isAgentReady = false,
  enhancedMode = false, // Default to false for backward compatibility
  aspectCount = 7, // Default to 7 for backward compatibility
  aspectConfigs = [], // Default to empty array for backward compatibility
  isEmbedded = false // NEW: Default to false for backward compatibility
}) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'text'>('voice');
  const [voiceMessages, setVoiceMessages] = useState<Message[]>([]);
  const [textMessages, setTextMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingTextMessagesRef = useRef<Array<{ text: string; expiresAt: number }>>([]);
  const responseContextMap = useRef<Map<string, 'voice' | 'text'>>(new Map());
  const recentResponses = useRef<Set<string>>(new Set());
  const { voiceState, isVoiceDisabled } = useAnimationStore();

  // ENHANCED MODE STATE - Simple single panel approach
  const [activeAspect, setActiveAspect] = useState<AspectNumber>(1);
  const [currentContext, setCurrentContext] = useState<string>('');

  // Single unified message arrays (not per-aspect) - using the same variables declared above

  const [isProcessingTextMessage, setIsProcessingTextMessage] = useState(false);

  const canSend = Boolean(onSendMessage) && !isVoiceDisabled && isAgentReady;
  const TEXT_TRANSCRIPT_IGNORE_MS = 3000;

  // Simple aspect switching - just changes context, not messages
  const handleAspectSwitch = useCallback((aspectNum: AspectNumber) => {
    console.log(`🔄 Switching to aspect ${aspectNum}`);
    setActiveAspect(aspectNum);
    // Update context for the AI, but don't change message display
    const aspectData = aspectConfigs.find(config => config.id === aspectNum);
    if (!aspectData || !aspectData.description?.trim()) {
      console.warn(`Invalid aspect data for ID ${aspectNum} - skipping update`);
      return; // Prevent sending empty messages
    }
    setCurrentContext(`Currently focused on: ${aspectData.title} - ${aspectData.description}`);

    // Inject context for voice-triggered aspect changes (replaces all other contexts)
    const contextMessage = `=== ACTIVE CONVERSATION ASPECT ===
Current focus: ${aspectData.description}

This is your current conversation context. Respond based on this aspect focus.
Previous contexts are cleared when switching aspects.
===========================`;

    updateAspectContext(contextMessage)
      .then((applied) => {
        const status = applied ? 'applied' : 'queued';
        console.log(`[aspect-context] ${status} aspect ${aspectNum}:`, aspectData.title);
      })
      .catch(error => {
        console.warn(`[aspect-context] failed to update aspect ${aspectNum} context`, error);
      });
  }, [aspectConfigs]);

  // Expose aspect switching function globally for voice detection
  useEffect(() => {
    (window as any).handleAspectSwitch = handleAspectSwitch;
    return () => {
      delete (window as any).handleAspectSwitch;
    };
  }, [aspectCount, handleAspectSwitch]);

  // Listen for voice aspect focus events as a fallback
  useEffect(() => {
    const handleVoiceAspectFocus = (event: CustomEvent) => {
      const { aspectId, source, text } = event.detail as { aspectId: number | string; source: string; text: string };
      const numericAspect = typeof aspectId === 'string' ? parseInt(aspectId, 10) : aspectId;

      if (!Number.isFinite(numericAspect)) {
        console.warn('[aspect-context] Ignoring invalid aspect focus event', { aspectId, source, text });
        return;
      }

      if (numericAspect < 1 || numericAspect > aspectCount) {
        console.warn('[aspect-context] Ignoring out-of-range aspect focus event', { numericAspect, aspectCount });
        return;
      }

      console.log(`🎯 Voice aspect focus event received: aspect ${numericAspect} from ${source}`);
      handleAspectSwitch(numericAspect as AspectNumber);
    };

    window.addEventListener('voice-aspect-focus', handleVoiceAspectFocus as EventListener);
    return () => {
      window.removeEventListener('voice-aspect-focus', handleVoiceAspectFocus as EventListener);
    };
  }, [handleAspectSwitch]);

  // Use the same messages regardless of aspect (single panel)
  const currentVoiceMessages = voiceMessages;
  const currentTextMessages = textMessages;

  useEffect(() => {
    if (!transcript) {
      return;
    }

    const normalizedTranscript = transcript.trim();
    if (!normalizedTranscript) {
      return;
    }

    const now = Date.now();
    pendingTextMessagesRef.current = pendingTextMessagesRef.current.filter(
      pending => pending.expiresAt > now
    );

    const pendingMatch = pendingTextMessagesRef.current.find(
      pending => pending.text === normalizedTranscript
    );

    if (pendingMatch) {
      pendingMatch.expiresAt = now + TEXT_TRANSCRIPT_IGNORE_MS;
      return;
    }

    // Only add to voice messages if this is NOT from a text message we just sent
    if (!isProcessingTextMessage) {
      const messageId = `user-${Date.now()}`;
      const newMessage: Message = {
        id: messageId,
        role: 'user',
        text: normalizedTranscript,
        timestamp: new Date(),
        type: 'voice',
        source: 'voice'
      };

      // Add to single unified voice messages (not per-aspect)
      setVoiceMessages(prev => [...prev, newMessage]);

      // Store expected context for the next response triggered by this voice input
      // Use a timestamp-based key to track the expected response
      const responseKey = `voice-${Date.now()}`;
      responseContextMap.current.set(responseKey, 'voice');
      
      // Clean up old entries (keep only last 10)
      if (responseContextMap.current.size > 10) {
        const firstKey = responseContextMap.current.keys().next().value;
        if (firstKey) {
          responseContextMap.current.delete(firstKey);
        }
      }
    }
  }, [transcript, isProcessingTextMessage]);

  useEffect(() => {
    if (response && response.trim()) {
      // Check for duplicate responses
      const responseHash = response.trim();
      if (recentResponses.current.has(responseHash)) {
        return; // Skip duplicate response
      }
      recentResponses.current.add(responseHash);
      
      // Clean up old responses (keep only last 20)
      if (recentResponses.current.size > 20) {
        const firstResponse = recentResponses.current.values().next().value;
        if (firstResponse) {
          recentResponses.current.delete(firstResponse);
        }
      }

      // Determine context for this response
      // Look for the most recent context in the map
      let responseContext: 'voice' | 'text' = 'voice'; // Default fallback
      
      // Get the most recent context from the map
      const contexts = Array.from(responseContextMap.current.values());
      if (contexts.length > 0) {
        responseContext = contexts[contexts.length - 1]; // Use most recent
        // Remove the used context to prevent reuse
        const keys = Array.from(responseContextMap.current.keys());
        if (keys.length > 0) {
          responseContextMap.current.delete(keys[keys.length - 1]);
        }
      }

      const newMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: response,
        timestamp: new Date(),
        type: responseContext,
        source: responseContext // Assistant messages inherit the source from their conversation context
      };

      // Add to single unified message arrays (not per-aspect)
      if (responseContext === 'voice') {
        setVoiceMessages(prev => [...prev, newMessage]);
      } else {
        setTextMessages(prev => [...prev, newMessage]);
      }
    }
  }, [response]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentVoiceMessages, currentTextMessages, activeTab]);

  useEffect(() => {
    if (errorMessage && draft.length === 0) {
      setErrorMessage(null);
    }
  }, [draft, errorMessage]);

  const sendMessage = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    if (!onSendMessage || !isAgentReady) {
      setErrorMessage('Voice agent is still connecting');
      return;
    }

    if (isVoiceDisabled) {
      setErrorMessage('Voice is currently disabled');
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    setIsProcessingTextMessage(true); // Mark that we're processing a text message

    try {
      const success = await onSendMessage(trimmed);
      if (success) {
        pendingTextMessagesRef.current.push({
          text: trimmed,
          expiresAt: Date.now() + TEXT_TRANSCRIPT_IGNORE_MS
        });

        // Store expected context for the response triggered by this text message
        const responseKey = `text-${Date.now()}`;
        responseContextMap.current.set(responseKey, 'text');
        
        // Clean up old entries (keep only last 10)
        if (responseContextMap.current.size > 10) {
          const firstKey = responseContextMap.current.keys().next().value;
          if (firstKey) {
            responseContextMap.current.delete(firstKey);
          }
        }

        // Add user message to text messages with source tracking
        const userMessage: Message = {
          id: `user-${Date.now()}`,
          role: 'user',
          text: trimmed,
          timestamp: new Date(),
          type: 'text',
          source: 'text'
        };

        // Add to single unified text messages (not per-aspect)
        setTextMessages(prev => [...prev, userMessage]);
        setDraft('');
      } else {
        setErrorMessage('Message could not be delivered');
      }
    } catch (error) {
      console.error('Failed to send chat panel message:', error);
      setErrorMessage('Message could not be delivered');
    } finally {
      setIsSending(false);
      // Reset the flag after a short delay to ensure transcript processing is complete
      setTimeout(() => setIsProcessingTextMessage(false), 100);
    }
  }, [draft, onSendMessage, canSend, isProcessingTextMessage, enhancedMode, isAgentReady, isVoiceDisabled]);

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  }, [sendMessage]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }, [sendMessage]);

  const clearAllAspects = useCallback(() => {
    // Simple clear - just clear all messages since it's one panel
    setVoiceMessages([]);
    setTextMessages([]);
  }, []);

  // Legacy clear functions for backward compatibility
  const clearVoiceMessages = useCallback(() => {
    setVoiceMessages([]);
  }, []);

  const clearTextMessages = useCallback(() => {
    setTextMessages([]);
  }, []);

  const statusText = errorMessage
    ? errorMessage
    : !isAgentReady
      ? 'Connecting voice agent...'
      : isVoiceDisabled
        ? 'Voice disabled'
        : voiceState === 'listening'
          ? 'Listening...'
          : voiceState === 'thinking'
            ? 'Thinking...'
            : voiceState === 'speaking'
              ? 'Speaking...'
              : voiceState === 'error'
                ? 'Error'
                : enhancedMode
                  ? 'Ready'
                  : 'Ready';

  const computedRows = Math.min(4, Math.max(2, draft.split(/\r?\n/).length));

  // Determine container classes based on embedded mode
  const containerClasses = isEmbedded
    ? 'w-full h-full flex flex-col bg-white dark:bg-gray-800 min-h-0'
    : `fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-600 transition-all duration-300 flex flex-col ${
        isMinimized ? 'w-80' : `w-96 ${enhancedMode ? 'h-[580px]' : 'h-[500px]'}`
      }`;

  return (
    <motion.div
      className={containerClasses}
      initial={{ opacity: 0, y: isEmbedded ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Minimize/Maximize Button - Positioned above tabs */}
      {onToggleMinimize && !isEmbedded && (
        <div className="flex justify-center -mb-1 relative z-10">
          <button
            onClick={onToggleMinimize}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-t-lg px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
          >
            <div className={`w-0 h-0 border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent ${
              isMinimized
                ? 'border-t-[8px] border-t-gray-600 dark:border-t-gray-400'
                : 'border-b-[8px] border-b-gray-400 dark:border-b-gray-600'
            }`} />
          </button>
        </div>
      )}

      {/* Horizontal Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
        <button
          onClick={() => setActiveTab('voice')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'voice'
              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
          aria-label="Voice conversations"
        >
          🎤 Voice chat
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'text'
              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
          aria-label="Text conversations"
        >
          💬 Text chat
        </button>
      </div>

      <AspectSelector
        enhancedMode={enhancedMode}
        aspectCount={aspectCount}
        activeAspect={activeAspect}
        onAspectSwitch={handleAspectSwitch}
        aspectConfigs={aspectConfigs}
      />

      {/* Content Area - Only show when not minimized or when embedded */}
      {(!isMinimized || isEmbedded) && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {activeTab === 'voice' ? (
              <>
                {currentVoiceMessages.length === 0 && (
                  <motion.div 
                    className="text-center text-lg font-semibold mt-8"
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1, 
                      y: 0,
                      color: [
                        "#6b7280", // gray-500
                        "#10b981", // emerald-500
                        "#6b7280"  // back to gray-500
                      ]
                    }}
                    transition={{ 
                      duration: 2.5,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatDelay: 3
                    }}
                    whileHover={{
                      scale: 1.05,
                      color: "#10b981",
                      transition: { duration: 0.3 }
                    }}
                  >
                    Talk to the hexagon!
                  </motion.div>
                )}

                {currentVoiceMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </>
            ) : (
              <>
                {currentTextMessages.length === 0 && (
                  <motion.div 
                    className="text-center text-lg font-semibold mt-8"
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1, 
                      y: 0,
                      color: [
                        "#6b7280", // gray-500
                        "#10b981", // emerald-500
                        "#6b7280"  // back to gray-500
                      ]
                    }}
                    transition={{ 
                      duration: 2.5,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatDelay: 3
                    }}
                    whileHover={{
                      scale: 1.05,
                      color: "#10b981",
                      transition: { duration: 0.3 }
                    }}
                  >
                    Text with the hexagon!
                  </motion.div>
                )}

                {currentTextMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area - Only show in Text Chat mode */}
          {activeTab === 'text' && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
              <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!canSend || isSending}
                    placeholder={!isAgentReady
                      ? 'Voice agent is connecting...'
                      : isVoiceDisabled
                        ? 'Voice agent is disabled'
                        : 'Type your message...'}
                    className="flex-1 resize-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    rows={computedRows}
                  />
                  <button
                    type="submit"
                    disabled={!canSend || isSending || !draft.trim()}
                    className="h-10 px-4 rounded-md bg-blue-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
                  >
                    {isSending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </form>
              <div className="mt-2 flex items-center justify-between">
                <span className={`text-xs ${errorMessage ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                  {statusText}
                </span>
                <button
                  type="button"
                  onClick={clearAllAspects}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Clear button for Voice Chat - Show when in voice mode */}
          {activeTab === 'voice' && !isMinimized && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className={`text-xs ${errorMessage ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                  {statusText}
                </span>
                <button
                  type="button"
                  onClick={clearAllAspects}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </>
      )}

    </motion.div>
  );
};
