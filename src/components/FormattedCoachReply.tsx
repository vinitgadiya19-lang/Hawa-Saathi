import React from 'react';

function cleanMarkdownTokens(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}

export function FormattedCoachReply({
  text,
  className = 'text-base sm:text-lg font-semibold text-[#141414]',
}: {
  text: string;
  className?: string;
}) {
  const lines = cleanMarkdownTokens(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const blocks: Array<
    | { type: 'paragraph'; text: string }
    | { type: 'list'; items: string[] }
  > = [];

  for (const line of lines) {
    const stepMatch = line.match(/^(?:\d+[.)]|[-*•])\s+(.*)$/);
    if (stepMatch) {
      const itemText = stepMatch[1].trim();
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === 'list') {
        prev.items.push(itemText);
      } else {
        blocks.push({ type: 'list', items: [itemText] });
      }
    } else {
      blocks.push({ type: 'paragraph', text: line });
    }
  }

  return (
    <div className={`space-y-2.5 leading-relaxed ${className}`}>
      {blocks.map((block, idx) =>
        block.type === 'paragraph' ? (
          <p key={idx}>{block.text}</p>
        ) : (
          <ol key={idx} className="space-y-2">
            {block.items.map((item, itemIdx) => (
              <li key={itemIdx} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 w-6 h-6 rounded-full bg-[#141414] text-[#FFFDF2] font-mono text-xs font-bold flex items-center justify-center shrink-0"
                >
                  {itemIdx + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  );
}
