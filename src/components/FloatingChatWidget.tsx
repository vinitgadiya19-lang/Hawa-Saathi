import { useEffect, useRef, useState, type RefObject } from 'react';
import { AlertTriangle, MessageSquare, Send, X } from 'lucide-react';
import { CoachLanguage, fetchAiChat } from '../services/aiCoachApi';
import { WorkerRoleId } from '../types/airQuality';
import { getRoleDefinition } from '../utils/aqi';
import { FormattedCoachReply } from './FormattedCoachReply';

interface FloatingChatWidgetProps {
  roleId: WorkerRoleId;
  aqi?: number;
  aqiBandLabel: string;
  hoursOutside: number;
  mainPollutantSymbol?: string;
  locationName?: string;
  language: CoachLanguage;
  onModelAnswered: (model: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  usedFallback?: boolean;
  isError?: boolean;
}

const STARTER_QUESTIONS: Record<CoachLanguage, string[]> = {
  en: [
    'Is it safe to ride now?',
    'Is a cloth mask enough right now?',
    'Safest hours to work today?',
  ],
  hi: [
    'क्या अभी सवारी करना सुरक्षित है?',
    'क्या अभी कपड़े का मास्क काफी है?',
    'आज काम करने का सबसे साफ समय?',
  ],
  hinglish: [
    'Kya abhi ride karna safe hai?',
    'Kya abhi kapde ka mask kaafi hai?',
    'Aaj kaam ka sabse saaf time?',
  ],
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

function useChatFocusTrap(
  isOpen: boolean,
  panelRef: RefObject<HTMLDivElement | null>,
  inputRef: RefObject<HTMLInputElement | null>,
  launcherRef: RefObject<HTMLButtonElement | null>,
  onClose: () => void
) {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      launcherRef.current?.focus();
    }
    return undefined;
  }, [isOpen, inputRef, launcherRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = getFocusableElements(panelRef.current);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, panelRef]);
}

function ChatMessageHistory({
  messages,
  isLoading,
  roleLabel,
  messagesEndRef,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  roleLabel: string;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      aria-live="polite"
      className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3 bg-[#FFFDF8]"
    >
      {messages.length === 0 && (
        <div className="rounded-2xl border-2 border-[#141414] bg-white p-3.5 text-sm font-semibold text-[#262626]">
          Ask about air quality, N95 masks, safest work hours, or route tips for {roleLabel}.
        </div>
      )}

      {messages.map((msg) =>
        msg.sender === 'user' ? (
          <div key={msg.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm border-2 border-[#141414] bg-[#141414] text-[#FFFDF2] px-3.5 py-2.5 text-sm sm:text-base font-semibold break-words">
              {msg.text}
            </div>
          </div>
        ) : (
          <div key={msg.id} className="flex justify-start">
            <div
              className={`max-w-[92%] rounded-2xl rounded-bl-sm border-2 border-[#141414] px-3.5 py-3 space-y-2 break-words ${
                msg.isError ? 'bg-[#FFE0EA]' : 'bg-[#FFF3B0]'
              }`}
            >
              {msg.usedFallback && (
                <div className="inline-flex items-center rounded-lg border-2 border-[#141414] bg-[#FFD23F] px-2.5 py-0.5 text-xs font-extrabold text-[#141414]">
                  Basic answer (AI unavailable)
                </div>
              )}

              {msg.isError ? (
                <div className="flex items-start gap-2 text-sm font-bold text-[#141414]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{msg.text}</span>
                </div>
              ) : (
                <FormattedCoachReply
                  text={msg.text}
                  className="text-sm sm:text-base font-semibold text-[#141414]"
                />
              )}
            </div>
          </div>
        )
      )}

      {isLoading && (
        <div className="flex justify-start">
          <div className="rounded-2xl border-2 border-[#141414] bg-[#FFF3B0] px-3.5 py-2.5 text-sm font-bold text-[#141414]">
            Checking air guidance...
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

export function FloatingChatWidget({
  roleId,
  aqi,
  aqiBandLabel,
  hoursOutside,
  mainPollutantSymbol,
  locationName,
  language,
  onModelAnswered,
}: FloatingChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const role = getRoleDefinition(roleId);

  useChatFocusTrap(isOpen, panelRef, inputRef, launcherRef, () => setIsOpen(false));

  // Scroll to newest message inside the panel respecting reduced-motion settings
  useEffect(() => {
    if (isOpen) {
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      messagesEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  const sendQuestion = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'user',
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setIsLoading(true);
    setLiveAnnouncement('Checking air guidance.');

    try {
      const res = await fetchAiChat({
        role: roleId,
        aqiBand: aqiBandLabel,
        aqi,
        hoursOutside,
        mainPollutant: mainPollutantSymbol,
        locationName,
        language,
        question: trimmed,
      });

      onModelAnswered(res.model);
      setLiveAnnouncement(`Hawa Saathi replied: ${res.answer}`);
      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sender: 'bot',
          text: res.answer,
          usedFallback: res.usedFallback,
        },
      ]);
    } catch (err) {
      const errorText =
        err instanceof Error ? err.message : 'Could not get an answer right now.';
      setLiveAnnouncement(`Chat error: ${errorText}`);
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sender: 'bot',
          text: errorText,
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/45 sm:bg-transparent sm:pointer-events-none"
        />
      )}

      {isOpen && (
        <div
          ref={panelRef}
          id="hawa-saathi-chat-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="floating-chat-title"
          className="fixed z-50 inset-x-0 bottom-0 w-full h-[80dvh] max-h-[80vh] sm:inset-x-auto sm:w-[380px] sm:h-[520px] sm:max-h-[calc(100dvh-7rem)] sm:bottom-[calc(max(1rem,env(safe-area-inset-bottom))+72px)] sm:right-[max(1rem,env(safe-area-inset-right))] bg-[#FFFDF2] border-t-2 border-x-2 sm:border-2 border-[#141414] rounded-t-3xl sm:rounded-3xl shadow-[0_-4px_0_#141414] sm:shadow-[4px_4px_0_#141414] flex flex-col overflow-hidden"
        >
          <div className="shrink-0 bg-[#EAD6FF] border-b-2 border-[#141414] px-4 py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2
                id="floating-chat-title"
                className="font-serif text-lg sm:text-xl font-bold text-[#141414] leading-tight truncate"
              >
                Ask Hawa Saathi
              </h2>
              <p className="text-xs font-bold text-[#262626] truncate">
                {role.shortLabel}
                {typeof aqi === 'number' ? ` · ${aqi} AQI (${aqiBandLabel})` : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="brutal-btn shrink-0 bg-[#FFFDF2] text-[#141414] w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {liveAnnouncement}
          </div>

          <ChatMessageHistory
            messages={messages}
            isLoading={isLoading}
            roleLabel={role.label}
            messagesEndRef={messagesEndRef}
          />

          <div
            aria-label="Suggested questions"
            className="shrink-0 border-t-2 border-[#141414]/15 bg-[#FFFDF2] px-3 py-2 flex flex-wrap gap-1.5"
          >
            {STARTER_QUESTIONS[language].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => sendQuestion(chip)}
                disabled={isLoading}
                className="border-2 border-[#141414] bg-white hover:bg-[#EAD6FF] active:translate-y-px text-left text-xs font-bold text-[#141414] px-2.5 py-1.5 rounded-xl min-h-[36px] cursor-pointer disabled:opacity-60"
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion(question);
            }}
            className="shrink-0 border-t-2 border-[#141414] bg-[#FFFDF2] px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 flex items-center gap-2"
          >
            <label htmlFor="floating-chat-input" className="sr-only">
              Ask Hawa Saathi a question
            </label>
            <input
              ref={inputRef}
              id="floating-chat-input"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about masks, routes, AQI..."
              className="flex-1 min-w-0 min-h-[46px] px-3.5 py-2 text-sm sm:text-base font-semibold text-[#141414] placeholder:text-[#52525B] bg-white border-2 border-[#141414] rounded-xl"
            />
            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              aria-label="Send message"
              className="brutal-btn shrink-0 bg-[#FF4D8D] text-[#141414] font-extrabold text-sm px-3.5 min-h-[46px] rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55"
            >
              <Send className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
        aria-controls="hawa-saathi-chat-panel"
        className={`brutal-btn fixed z-50 bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] w-[60px] h-[60px] rounded-full bg-[#FFD23F] text-[#141414] items-center justify-center cursor-pointer ${
          isOpen ? 'hidden sm:flex' : 'flex'
        }`}
      >
        {isOpen ? (
          <X className="w-7 h-7 stroke-[2.5]" aria-hidden="true" />
        ) : (
          <MessageSquare className="w-7 h-7 stroke-[2.5]" aria-hidden="true" />
        )}
      </button>
    </>
  );
}
