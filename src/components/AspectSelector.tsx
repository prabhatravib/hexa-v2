import React, { useCallback, useEffect, useRef, useState } from 'react';

type AspectNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface AspectConfig {
  id: number;
  title: string;
  description: string;
}

interface AspectSelectorProps {
  enhancedMode: boolean;
  aspectCount: number;
  activeAspect: AspectNumber;
  onAspectSwitch: (aspect: AspectNumber) => void;
  aspectConfigs: AspectConfig[];
}

export const AspectSelector: React.FC<AspectSelectorProps> = ({
  enhancedMode,
  aspectCount,
  activeAspect,
  onAspectSwitch,
  aspectConfigs
}) => {
  const [hoveredAspect, setHoveredAspect] = useState<AspectNumber | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to get tooltip text (button number by default, external title when available)
  const getTooltipText = (aspectNum: number): string => {
    const config = aspectConfigs.find(config => config.id === aspectNum);
    const result = config?.title || `${aspectNum}`;
    console.log(`🔍 Tooltip for aspect ${aspectNum}:`, result, 'Config:', config);
    return result;
  };

  // Function to calculate optimal tooltip position to stay within viewport
  const calculateTooltipPosition = useCallback((mouseX: number, mouseY: number) => {
    const tooltipWidth = 200; // Approximate tooltip width
    const tooltipHeight = 40; // Approximate tooltip height
    const offset = 10; // Distance from cursor
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = mouseX + offset;
    let y = mouseY - tooltipHeight - offset;

    if (x + tooltipWidth > viewportWidth) {
      x = mouseX - tooltipWidth - offset;
    }

    if (y < 0) {
      y = mouseY + offset;
    }

    if (x < 0) {
      x = offset;
    }

    if (y + tooltipHeight > viewportHeight) {
      y = viewportHeight - tooltipHeight - offset;
    }

    return { x, y };
  }, []);

  // Smooth tooltip hover handlers
  const handleMouseEnter = useCallback((aspectNum: AspectNumber, e: React.MouseEvent) => {
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    console.log(`🖱️ Mouse enter aspect ${aspectNum}`);
    setHoveredAspect(aspectNum);

    // Show tooltip immediately for smooth transition
    setIsTooltipVisible(true);

    const position = calculateTooltipPosition(e.clientX, e.clientY);
    setTooltipPosition(position);
    setTooltipStyle({
      left: position.x,
      top: position.y,
    });
  }, [calculateTooltipPosition]);

  const handleMouseLeave = useCallback(() => {
    console.log(`🖱️ Mouse leave aspect`);

    // Add a small delay before hiding tooltip to prevent blinking
    hoverTimeoutRef.current = setTimeout(() => {
      setIsTooltipVisible(false);
      // Clear hovered aspect after fade out completes
      setTimeout(() => setHoveredAspect(null), 150);
    }, 100);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (hoveredAspect) {
      const position = calculateTooltipPosition(e.clientX, e.clientY);
      setTooltipPosition(position);
      setTooltipStyle({
        left: position.x,
        top: position.y,
      });
    }
  }, [hoveredAspect, calculateTooltipPosition]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleAspectSwitch = useCallback((aspectNum: AspectNumber) => {
    onAspectSwitch(aspectNum);
  }, [onAspectSwitch]);

  // NEW: Listen for voice aspect changes and update visual state
  useEffect(() => {
    const handleVoiceAspectChange = (event: CustomEvent) => {
      const rawId = (event.detail as { aspectId: number | string }).aspectId;
      const numericAspect = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;

      if (!Number.isFinite(numericAspect)) {
        console.warn('🎯 Ignoring voice aspect change event with invalid aspectId:', rawId);
        return;
      }

      if (numericAspect < 1 || numericAspect > aspectCount) {
        console.warn('🎯 Ignoring voice aspect change outside configured range:', numericAspect);
        return;
      }

      console.log(`🎯 Voice aspect change to ${numericAspect}`);
      onAspectSwitch(numericAspect as AspectNumber); // Update visual state through parent callback
    };

    window.addEventListener('voice-aspect-focus', handleVoiceAspectChange as EventListener);
    return () => {
      window.removeEventListener('voice-aspect-focus', handleVoiceAspectChange as EventListener);
    };
  }, [aspectCount, onAspectSwitch]);

  if (!enhancedMode) return null;

  return (
    <>
      {/* Aspect Selection Buttons */}
      <div className="flex border-b border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-750 py-2 justify-center gap-1 overflow-hidden relative">
        {Array.from({ length: aspectCount }, (_, i) => i + 1).map(aspectNum => (
          <div key={aspectNum} className="relative">
            <button
              onClick={() => handleAspectSwitch(aspectNum as AspectNumber)}
              onMouseEnter={(e) => handleMouseEnter(aspectNum as AspectNumber, e)}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className={`w-10 h-10 rounded-md text-sm font-semibold transition-all ${
                activeAspect === aspectNum
                  ? 'bg-blue-500 text-white shadow-md scale-105'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600'
              }`}
              aria-label={`Aspect ${aspectNum}`}
            >
              {aspectNum}
            </button>
          </div>
        ))}
      </div>

      {/* Cursor-following tooltip */}
      {hoveredAspect && (
        <div
          className={`fixed px-3 py-2 bg-gray-800 text-white text-sm rounded-md shadow-lg z-[9999] pointer-events-none whitespace-nowrap transition-opacity duration-150 ${
            isTooltipVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={tooltipStyle}
        >
          {(() => {
            console.log(`🎯 Rendering cursor tooltip for aspect ${hoveredAspect}`);
            return getTooltipText(hoveredAspect);
          })()}
        </div>
      )}
    </>
  );
};
