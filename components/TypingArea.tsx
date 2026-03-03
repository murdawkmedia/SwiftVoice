import React from 'react';

interface TypingAreaProps {
  targetText: string;
  userInput: string;
  onInputChange?: (value: string) => void; // Optional — speech handles input, not keyboard
  isFinished: boolean;
  isActive: boolean;
  isDark: boolean;
}

const TypingArea: React.FC<TypingAreaProps> = ({
  targetText,
  userInput,
  isFinished,
  isActive,
  isDark
}) => {
  const renderCharacters = () => {
    return targetText.split('').map((char, index) => {
      let colorClass = isDark ? 'text-gray-600' : 'text-gray-300';
      const isCurrent = index === userInput.length;

      if (index < userInput.length) {
        if (userInput[index] === char) {
          colorClass = isDark ? 'text-white' : 'text-gray-800';
        } else {
          colorClass = isDark ? 'text-red-400 bg-red-400/10' : 'text-red-500 bg-red-50';
        }
      }

      return (
        <span
          key={index}
          className={`relative transition-colors duration-150 rounded-[2px] ${colorClass} ${
            isCurrent && isActive
              ? `cursor-blink ${isDark ? 'border-l-2 border-blue-400' : 'border-l-2 border-blue-500'}`
              : ''
          }`}
        >
          {char}
        </span>
      );
    });
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto py-12 px-8 min-h-[200px]">
      <div className="text-2xl md:text-3xl leading-relaxed tracking-tight font-normal text-left select-none">
        {renderCharacters()}
      </div>

      {!isActive && !isFinished && (
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-2xl pointer-events-none transition-all duration-300 ${
            isDark ? 'bg-black/20 backdrop-blur-[1px]' : 'bg-white/40 backdrop-blur-[2px]'
          }`}
        />
      )}
    </div>
  );
};

export default TypingArea;
