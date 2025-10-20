/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_VOICE_MODEL: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export class MessageHandlers {
  public openaiConnection: any;  // Changed from private to public
  private broadcastToClients: (message: any) => void;
  private isAgentResponding: boolean = false;
  private currentExternalData: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null = null;
  private core: any; // Reference to VoiceSessionCore
  
  // Email flow state
  private emailFlowActive: boolean = false;
  private emailFlowStep: 'initial' | 'waiting_message' | 'waiting_contact' | 'sending' = 'initial';
  private emailMessageContent: string = '';
  private emailContactInfo: string = '';

  constructor(openaiConnection: any, broadcastToClients: (message: any) => void) {
    this.openaiConnection = openaiConnection;
    this.broadcastToClients = broadcastToClients;
  }

  setCore(core: any): void {
    this.core = core;
  }

  setOpenAIConnection(openaiConnection: any): void {
    this.openaiConnection = openaiConnection;
  }

  private async sendCollectedEmail(): Promise<void> {
    try {
      console.log('📧 Sending collected email...', {
        message: this.emailMessageContent,
        contact: this.emailContactInfo
      });

      const result = await this.core.sendEmailToCreator(
        this.emailMessageContent,
        this.emailContactInfo || 'Anonymous',
        'voice-command'
      );

      if (result.success) {
        console.log('✅ Email sent successfully');
        this.broadcastToClients({
          type: 'email_sent',
          message: 'Your message has been sent to creator developer prabhat!',
          success: true
        });
      } else {
        console.error('❌ Email sending failed:', result.error);
        this.broadcastToClients({
          type: 'email_error',
          message: 'Sorry, I had trouble sending your message. Please try again.',
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('❌ Email sending exception:', error);
      this.broadcastToClients({
        type: 'email_error',
        message: 'Sorry, I had trouble sending your message. Please try again.',
        success: false
      });
    } finally {
      // Reset email flow state
      this.emailFlowActive = false;
      this.emailFlowStep = 'initial';
      this.emailMessageContent = '';
      this.emailContactInfo = '';
    }
  }

  // Method to update external data context
  updateExternalData(externalData: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null): void {
    this.currentExternalData = externalData;
    console.log('📝 Updated external data context in MessageHandlers:', externalData);
  }

  // Method to clear external data context
  clearExternalData(): void {
    this.currentExternalData = null;
    console.log('🗑️ Cleared external data context in MessageHandlers');
  }

  // Method to get current external data context
  getExternalData(): {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null {
    return this.currentExternalData;
  }

  async handleAudioInput(audioData: string, sessionId: string): Promise<void> {
    // Check if OpenAI connection is available
    if (!this.openaiConnection) {
      console.error('❌ OpenAI connection not available');
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Voice service not ready. Please wait a moment and try again.' }
      });
      return;
    }

    // Check if connected, if not try to connect
    if (!this.openaiConnection.isConnected()) {
      console.log('🔧 OpenAI not connected, attempting to connect...');
      try {
        await this.openaiConnection.connect();
      } catch (error) {
        console.error('❌ Failed to connect to OpenAI:', error);
        this.broadcastToClients({
          type: 'error',
          error: { message: 'Failed to connect to voice service. Please try again.' }
        });
        return;
      }
    }
    
    try {
      console.log('🔧 Audio data received, sending session info to frontend for WebRTC connection...');
      
      // NEW: Set external data for WebRTC injection if available
      if (this.currentExternalData) {
        console.log('🔧 Setting external data for WebRTC injection:', this.currentExternalData);
        this.openaiConnection.setExternalData(this.currentExternalData);
      }
      
      // Instead of trying to process audio in the worker, send session info to frontend
      // The frontend will handle the WebRTC connection directly
      const sessionInfo = this.openaiConnection.getSessionInfo();
      
      this.broadcastToClients({
        type: 'session_info',
        sessionId: sessionInfo.sessionId,
        clientSecret: sessionInfo.clientSecret,
        // Keep clientSecret for WebRTC connection, remove apiKey only
        audioData: audioData // Pass the audio data to frontend
      });
      
      console.log('✅ Session info sent to frontend for WebRTC connection');
    } catch (error) {
      console.error('❌ Failed to process audio:', error);
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Failed to process audio. Please try again.' }
      });
    }
  }

  async handleTextInput(text: string, sessionId: string): Promise<void> {
    console.log('📝 Processing text input:', text);
    console.log('📝 Current external data context:', this.currentExternalData);

    // NEW: Detect aspect focus requests from voice input
    const aspectNumber = this.detectAspectFocusRequest(text);
    if (aspectNumber) {
      console.log(`🎯 Voice aspect focus request detected: aspect ${aspectNumber}`);
      this.broadcastToClients({
        type: 'ASPECT_FOCUS_REQUEST',
        aspectId: aspectNumber,
        source: 'voice',
        text: text,
        timestamp: Date.now()
      });
    }

    // Check if OpenAI connection is available
    if (!this.openaiConnection) {
      console.error('❌ OpenAI connection not available');
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Voice service not ready. Please wait a moment and try again.' }
      });
      return;
    }

    // Check if connected, if not try to connect
    if (!this.openaiConnection.isConnected()) {
      console.log('🔧 OpenAI not connected, attempting to connect...');
      try {
        await this.openaiConnection.connect();
      } catch (error) {
        console.error('❌ Failed to connect to OpenAI:', error);
        this.broadcastToClients({
          type: 'error',
          error: { message: 'Failed to connect to voice service. Please try again.' }
        });
        return;
      }
    }
    
    try {
      // Set external data for WebRTC injection if available
      if (this.currentExternalData) {
        console.log('🔧 Setting external data for WebRTC text message:', this.currentExternalData);
        this.openaiConnection.setExternalData(this.currentExternalData);
      }
      
      // Enhance text input with external data context if available
      let enhancedText = text;
      if (this.currentExternalData) {
        if (this.currentExternalData.text) {
          enhancedText = `Context: ${this.currentExternalData.text}\n\nUser question: ${text}`;
        }
        if (this.currentExternalData.prompt) {
          enhancedText = `Context: ${this.currentExternalData.prompt}\n\nUser question: ${text}`;
        }
        console.log('🔧 Enhanced text with external data context:', enhancedText);
      }
      
      // Send text message to OpenAI via HTTP with external data context
      await this.openaiConnection.sendMessage({
        type: 'text',
        text: enhancedText,
        externalData: this.currentExternalData
      });
    } catch (error) {
      console.error('❌ Failed to send text message:', error);
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Failed to send text message. Please try again.' }
      });
    }
  }

  async handleExternalData(externalData: {
    image?: string;        // Optional image data
    text?: string;         // Optional text input
    prompt?: string;       // Optional context/prompt
    type?: string;         // Type of external data
  }, sessionId: string): Promise<void> {
    console.log('📥 Processing external data:', externalData);
    
    // Store the external data for voice context
    this.currentExternalData = externalData;
    console.log('📝 External data stored in MessageHandlers for voice context');
    console.log('📝 External data will now be available for all voice/text interactions');
    
    // Broadcast to clients that external data was received
    this.broadcastToClients({
      type: 'external_data_processed',
      data: externalData,
      sessionId: sessionId,
      message: 'External data received and available for voice discussions'
    });
    
    // If there's text content, we could potentially use it for voice context
    if (externalData.text) {
      this.broadcastToClients({
        type: 'external_text_available',
        text: externalData.text,
        sessionId: sessionId
      });
    }
    
    // If there's an image, notify clients
    if (externalData.image) {
      this.broadcastToClients({
        type: 'external_image_available',
        image: externalData.image,
        dataType: externalData.type || 'image',
        sessionId: sessionId
      });
    }
    
    console.log('✅ External data processed and broadcasted to clients');
  }

  async handleControl(command: string, sessionId: string): Promise<void> {
    // Check if OpenAI connection is available
    if (!this.openaiConnection) {
      console.error('❌ OpenAI connection not available');
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Voice service not ready. Please wait a moment and try again.' }
      });
      return;
    }

    switch (command) {
      case 'interrupt':
        // Send interrupt command to frontend for WebRTC handling
        this.broadcastToClients({
          type: 'control',
          command: 'interrupt'
        });
        break;
        
      case 'clear':
        // Send clear command to frontend for WebRTC handling
        this.broadcastToClients({
          type: 'control',
          command: 'clear'
        });
        
        // Also clear external data context
        this.currentExternalData = null;
        console.log('🗑️ Cleared external data context on clear command');
        break;
        
      case 'get_agents':
        this.broadcastToClients({
          type: 'available_agents',
          agents: ['hexagon', 'customer-support', 'language-tutor']
        });
        break;
    }
  }

  handleOpenAIMessage(data: string): void {
    try {
      console.log('🔍 MessageHandlers.handleOpenAIMessage called with data length:', data.length);
      const message = JSON.parse(data);
      
      // Debug: Log all message types to see what's happening
      console.log('🔍 Worker processing message type:', message.type);
      if (message.type && message.type.includes('transcription')) {
        console.log('📝 Transcription-related message:', message);
      }
      
      switch (message.type) {
        case 'session.created':
          this.broadcastToClients({
            type: 'session_created',
            session: message.session
          });
          break;
          
        case 'input_audio_buffer.speech_started':
          this.broadcastToClients({
            type: 'speech_started'
          });
          break;
          
        case 'input_audio_buffer.speech_stopped':
          this.broadcastToClients({
            type: 'speech_stopped'
          });
          break;
          
        case 'conversation.item.input_audio_transcription.completed':
          console.log('📝 Transcription completed in worker:', message.transcript);
          
          // Check if user is asking to send an email
          const transcript = (message.transcript || '').toLowerCase();
          
          if (!this.emailFlowActive && 
              ((transcript.includes('send') && transcript.includes('email')) ||
              (transcript.includes('send') && transcript.includes('message') && 
               (transcript.includes('creator') || transcript.includes('developer') || transcript.includes('prabhat'))) ||
              (transcript.includes('contact') && 
               (transcript.includes('creator') || transcript.includes('developer') || transcript.includes('prabhat'))))) {
            
            console.log('📧 Email intent detected in user speech');
            this.emailFlowActive = true;
            this.emailFlowStep = 'waiting_message';
            this.emailMessageContent = '';
            this.emailContactInfo = '';
            
            this.broadcastToClients({
              type: 'email_flow_started',
              message: 'Email flow initiated'
            });
          } else if (this.emailFlowActive) {
            // We're in email flow, collect the message
            if (this.emailFlowStep === 'waiting_message') {
              // This is the message they want to send
              this.emailMessageContent = message.transcript;
              this.emailFlowStep = 'waiting_contact';
              console.log('📧 Email message collected:', this.emailMessageContent);
            } else if (this.emailFlowStep === 'waiting_contact') {
              // Check if they're providing contact info or declining
              if (transcript.includes('no') || transcript.includes('skip') || transcript.includes('anonymous')) {
                this.emailContactInfo = '';
                console.log('📧 User declined to provide contact info');
              } else {
                this.emailContactInfo = message.transcript;
                console.log('📧 Email contact info collected:', this.emailContactInfo);
              }
              
              // Now send the email
              this.emailFlowStep = 'sending';
              this.sendCollectedEmail();
            }
          }

          // NEW: Detect aspect focus requests from voice input
          console.log('🔍 Checking voice input for aspect patterns:', message.transcript);
          const aspectNumber = this.detectAspectFocusRequest(message.transcript);
          if (aspectNumber) {
            console.log(`🎯 Voice aspect focus request detected: aspect ${aspectNumber}`);
            this.broadcastToClients({
              type: 'ASPECT_FOCUS_REQUEST',
              aspectId: aspectNumber,
              source: 'voice',
              text: message.transcript,
              timestamp: Date.now()
            });
          } else {
            console.log('❌ No aspect pattern matched in voice input');
            // Add simple fallback detection
            const simpleMatch = message.transcript.match(/(?:aspect|button)\s*(\d{1,2})/i);
            if (simpleMatch) {
              const fallbackNumber = parseInt(simpleMatch[1], 10);
              if (fallbackNumber >= 1 && fallbackNumber <= 10) {
                console.log(`🎯 Fallback aspect detection: aspect ${fallbackNumber}`);
                this.broadcastToClients({
                  type: 'ASPECT_FOCUS_REQUEST',
                  aspectId: fallbackNumber,
                  source: 'voice',
                  text: message.transcript,
                  timestamp: Date.now()
                });
              }
            }
          }

          this.broadcastToClients({
            type: 'transcription',
            text: message.transcript
          });
          break;
          
        case 'response.audio_transcript.delta':
          // Send agent_start on first text delta to trigger mouth animation
          if (!this.isAgentResponding) {
            this.isAgentResponding = true;
            this.broadcastToClients({
              type: 'agent_start'
            });
          }
          
          this.broadcastToClients({
            type: 'response_text_delta',
            text: message.delta
          });
          break;
          
        case 'response.audio.delta':
          // Send agent_start on first audio delta to trigger mouth animation
          if (!this.isAgentResponding) {
            this.isAgentResponding = true;
            this.broadcastToClients({
              type: 'agent_start'
            });
          }
          
          this.broadcastToClients({
            type: 'audio_delta',
            audio: message.delta
          });
          break;
          
        case 'response.audio.done':
          // Send agent_end when audio is done to stop mouth animation
          if (this.isAgentResponding) {
            this.isAgentResponding = false;
            this.broadcastToClients({
              type: 'agent_end'
            });
          }
          
          this.broadcastToClients({
            type: 'audio_done'
          });
          break;
          
        case 'error':
          console.error('OpenAI error:', message.error);
          // Reset agent state on error
          if (this.isAgentResponding) {
            this.isAgentResponding = false;
            this.broadcastToClients({
              type: 'agent_end'
            });
          }
          
          this.broadcastToClients({
            type: 'error',
            error: {
              message: message.error?.message || message.error || 'Unknown OpenAI error',
              details: message.error
            }
          });
          break;

        default:
          console.log('Unknown OpenAI message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse OpenAI message:', error);
    }
  }

  private isValidAspectNumber(value: number | undefined | null): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
  }

  private parseAspectCandidate(value: string | undefined): number | null {
    if (!value) return null;

    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;

    const numericCandidate = normalized.replace(/(st|nd|rd|th)$/, '');
    if (/^\d{1,2}$/.test(numericCandidate)) {
      const parsed = parseInt(numericCandidate, 10);
      if (this.isValidAspectNumber(parsed)) {
        return parsed;
      }
    }

    const ordinalNumber = this.ordinalToNumber(normalized);
    return this.isValidAspectNumber(ordinalNumber) ? ordinalNumber : null;
  }

  private ordinalToNumber(ordinal: string): number | null {
    const normalized = ordinal.trim().toLowerCase();
    const ordinalMap: Record<string, number> = {
      'first': 1, 'one': 1,
      'second': 2, 'two': 2,
      'third': 3, 'three': 3,
      'fourth': 4, 'four': 4,
      'fifth': 5, 'five': 5,
      'sixth': 6, 'six': 6,
      'seventh': 7, 'seven': 7,
      'eighth': 8, 'eight': 8,
      'ninth': 9, 'nine': 9,
      'tenth': 10, 'ten': 10,
    };
    const value = ordinalMap[normalized];
    return this.isValidAspectNumber(value) ? value : null;
  }

  // NEW: Enhanced aspect detection function
  private detectAspectFocusRequest(text: string): number | null {
    const lowerText = text.toLowerCase();
    const logPrefix = '[aspect-detect]';
    console.log(logPrefix, 'testing', lowerText);

    const hasAspectKeyword = /\b(aspect|button|topic|context)\b/i.test(lowerText);

    const explicitNumberPatterns = [
      /(?:focus|switch|change|move|go|jump|shift|discuss)\s+(?:to\s+)?(?:about\s+)?(?:aspect|button)\s*(\d{1,2})/i,
      /(?:show|open|display)\s+(?:about\s+)?(?:aspect|button)\s*(\d{1,2})/i,
      /(?:select|choose|highlight|activate)\s+(?:about\s+)?(?:aspect|button)\s*(\d{1,2})/i,
      /(?:aspect|button)\s+(?:about\s+)?(\d{1,2})/i,
      /(?:aspect|button)\s+number\s*(\d{1,2})/i,
      /number\s*(\d{1,2})\s+(?:aspect|button)/i,
    ];

    for (const pattern of explicitNumberPatterns) {
      const match = pattern.exec(lowerText);
      if (match) {
        const aspectNumber = this.parseAspectCandidate(match[1]);
        if (aspectNumber) {
          console.log(logPrefix, 'explicit match', { pattern: match[0], aspectNumber });
          return aspectNumber;
        }
      }
    }

    const ordinalCapture = '(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)';
    const ordinalPatterns = [
      new RegExp(`(?:focus|switch|change|move|go|talk|discuss|speak)(?:\\s+(?:about|on|to))?\\s+(?:the\\s+)?${ordinalCapture}(?:\\s+(?:aspect|button|topic|thing|item|one))?`, 'i'),
      new RegExp(`(?:select|choose|highlight|activate)\\s+(?:the\\s+)?${ordinalCapture}(?:\\s+(?:aspect|button|option|one|thing|item))?`, 'i'),
      new RegExp(`(?:aspect|button|topic)\\s+${ordinalCapture}`, 'i'),
      new RegExp(`(?:the\\s+)?${ordinalCapture}\\s+(?:aspect|button|topic|one|thing|item)`, 'i'),
      new RegExp(`(?:let's|can we|shall we|i want to)\\s+(?:discuss|talk about|focus on|move to|switch to)\\s+(?:the\\s+)?${ordinalCapture}(?:\\s+(?:aspect|button|topic|thing|item|one))?`, 'i'),
      new RegExp(`aspect\\s+${ordinalCapture}`, 'i'),
      new RegExp(`(?:said|meant)\\s+(?:the\\s+)?${ordinalCapture}(?:\\s+(?:aspect|button|one))?`, 'i'),
    ];

    for (const pattern of ordinalPatterns) {
      const match = pattern.exec(lowerText);
      if (match) {
        const aspectNumber = this.parseAspectCandidate(match[1]);
        if (aspectNumber && (hasAspectKeyword || /aspect|button|topic/.test(pattern.source))) {
          console.log(logPrefix, 'ordinal match', { pattern: match[0], aspectNumber });
          return aspectNumber;
        }
      }
    }

    if (hasAspectKeyword) {
      const contextPatterns = [
        new RegExp(`^(?:the\\s+)?${ordinalCapture}(?:\\s+(?:one|option))?$`, 'i'),
        new RegExp(`${ordinalCapture}\\s+(?:one|option|choice)`, 'i'),
        /number\s*(\d{1,2})/i,
        /option\s*(\d{1,2})/i,
      ];

      for (const pattern of contextPatterns) {
        const match = pattern.exec(lowerText);
        if (match) {
          const aspectNumber = this.parseAspectCandidate(match[1]);
          if (aspectNumber) {
            console.log(logPrefix, 'context match', { pattern: match[0], aspectNumber });
            return aspectNumber;
          }
        }
      }
    }

    return null;
  }


}
