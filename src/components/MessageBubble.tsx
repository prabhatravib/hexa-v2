import React from 'react';
import { motion } from 'framer-motion';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  type: 'voice' | 'text';
  source: 'voice' | 'text';
}

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUserMessage = message.role === 'user';
  const isVoiceInput = message.type === 'voice' && message.source === 'voice';
  const isTextInput = message.type === 'text' && message.source === 'text';

  let bubbleClasses = '';
  let timestampClasses = '';

  if (isUserMessage) {
    // User messages: green for text input, blue for voice input
    if (isTextInput) {
      bubbleClasses = 'bg-green-500 text-white';
      timestampClasses = 'text-green-100';
    } else if (isVoiceInput) {
      bubbleClasses = 'bg-blue-500 text-white';
      timestampClasses = 'text-blue-100';
    } else {
      bubbleClasses = 'bg-blue-500 text-white';
      timestampClasses = 'text-blue-100';
    }
  } else {
    // Assistant messages: gray
    bubbleClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
    timestampClasses = 'text-gray-500 dark:text-gray-400';
  }

  return (
    <motion.div
      key={message.id}
      initial={{ opacity: 0, x: isUserMessage ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[80%] px-4 py-2 rounded-lg ${bubbleClasses}`}>
        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
        <p className={`text-[8px] mt-1 font-normal leading-tight ${timestampClasses}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
        </p>
      </div>
    </motion.div>
  );
};
