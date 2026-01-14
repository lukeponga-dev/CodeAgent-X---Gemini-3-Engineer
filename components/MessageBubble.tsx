import React, { useState, useEffect } from 'react';
import { Message } from '../types';
import { Bot, User, Cpu, ChevronDown, ChevronRight, Brain, CheckCircle2, ShieldCheck, Terminal, Sparkles, Activity } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MessageBubbleProps {
  message: Message;
  onCodeReview?: (code: string, language: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onCodeReview }) => {
  const isUser = message.role === 'user';
  const [showThinking, setShowThinking] = useState(false);

  // Auto-expand thinking when it becomes available
  useEffect(() => {
    if (message.thoughts) {
      setShowThinking(true);
    }
  }, [message.thoughts]);

  if (isUser) {
    return (
      <div className="flex w-full mb-8 justify-end animate-fade-in-up">
        <div className="flex max-w-[80%] flex-row-reverse gap-4">
          <div className="w-8 h-8 rounded-lg bg-obsidian-800 border border-white/10 flex items-center justify-center shrink-0">
            <User size={16} className="text-gray-400" />
          </div>
          <div className="px-5 py-3 rounded-2xl rounded-tr-sm bg-obsidian-800 border border-white/10 text-gray-200 shadow-md">
            <p className="whitespace-pre-wrap leading-relaxed font-sans">{message.text}</p>
          </div>
        </div>
      </div>
    );
  }

  // Model Message
  return (
    <div className="flex w-full mb-10 justify-start animate-fade-in-up">
      <div className="flex max-w-[90%] flex-row gap-4">
        {/* AI Avatar */}
        <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)] mt-1">
          <Bot size={16} className="text-neon-cyan" />
        </div>

        <div className="flex flex-col w-full gap-2">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-neon-cyan tracking-widest uppercase font-mono">Gemini 3.0</span>
            <span className="text-[10px] text-gray-500 font-mono">{new Date(message.timestamp).toLocaleTimeString()}</span>
          </div>

          {/* 1. Reasoning Engine Visualization */}
          {(message.thoughts || message.isThinking) && (
            <div className="mb-4 w-full">
               <button 
                  onClick={() => setShowThinking(!showThinking)}
                  className={`group relative w-full flex items-center justify-between px-4 py-3 rounded-t-lg border-t border-x transition-all ${
                      showThinking 
                        ? 'bg-obsidian-900 border-neon-purple/30' 
                        : 'bg-obsidian-900/50 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${showThinking ? 'bg-neon-purple/20' : 'bg-white/5'}`}>
                        {message.isThinking ? (
                             <Activity size={14} className="text-neon-purple animate-pulse" />
                        ) : (
                             <Brain size={14} className={showThinking ? "text-neon-purple" : "text-gray-500"} />
                        )}
                    </div>
                    <div className="flex flex-col items-start">
                        <span className={`text-xs font-bold font-mono tracking-wider uppercase ${showThinking ? 'text-neon-purple' : 'text-gray-400'}`}>
                            {message.isThinking ? 'Processing Context...' : 'Reasoning Trace'}
                        </span>
                    </div>
                  </div>
                  {showThinking ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                  
                  {/* Decorative Scanline */}
                  {message.isThinking && <div className="absolute bottom-0 left-0 h-[1px] bg-gradient-to-r from-transparent via-neon-purple to-transparent w-full animate-scanline opacity-50"></div>}
               </button>
               
               {showThinking && (
                 <div className="bg-obsidian-950 border-x border-b border-neon-purple/30 rounded-b-lg overflow-hidden shadow-inner relative">
                    {/* Inner Texture */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#a78bfa 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                    
                    <div className="p-5 text-sm font-mono leading-relaxed text-gray-400 max-h-[500px] overflow-y-auto custom-scrollbar">
                         {message.isThinking && !message.thoughts ? (
                             <div className="flex flex-col gap-2">
                                <span className="flex items-center gap-2 text-neon-purple/70">
                                    <span className="w-1.5 h-1.5 bg-neon-purple rounded-full animate-pulse"></span>
                                    Loading file context...
                                </span>
                                <span className="flex items-center gap-2 text-neon-purple/50 delay-75">
                                    <span className="w-1.5 h-1.5 bg-neon-purple rounded-full animate-pulse"></span>
                                    Analyzing dependencies...
                                </span>
                             </div>
                         ) : (
                             <ReactMarkdown components={{
                                 strong: ({node, ...props}) => <span className="text-neon-purple font-bold" {...props} />,
                                 ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 my-2" {...props} />,
                                 li: ({node, ...props}) => <li className="pl-1 marker:text-neon-purple/50" {...props} />
                             }}>{message.thoughts || ''}</ReactMarkdown>
                         )}
                    </div>
                    <div className="h-6 bg-gradient-to-t from-obsidian-950 to-transparent absolute bottom-0 w-full pointer-events-none"></div>
                 </div>
               )}
            </div>
          )}

          {/* 2. Final Output */}
          {!message.isThinking && (
            <div className="prose prose-invert prose-sm max-w-none leading-7 text-gray-300 font-sans">
                <ReactMarkdown
                components={{
                    h1: ({children}) => <h1 className="text-xl font-bold text-gray-100 mt-6 mb-4 border-b border-white/10 pb-2">{children}</h1>,
                    h2: ({children}) => <h2 className="text-lg font-semibold text-gray-100 mt-5 mb-3">{children}</h2>,
                    h3: ({children}) => <h3 className="text-base font-medium text-neon-cyan mt-4 mb-2 uppercase tracking-wide">{children}</h3>,
                    p: ({children}) => <p className="mb-4 last:mb-0">{children}</p>,
                    a: ({href, children}) => <a href={href} className="text-neon-cyan hover:underline underline-offset-4" target="_blank" rel="noreferrer">{children}</a>,
                    code({node, inline, className, children, ...props}: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : '';
                    const codeContent = String(children).replace(/\n$/, '');

                    return !inline && match ? (
                        <div className="my-6 rounded-lg overflow-hidden border border-white/10 bg-[#1e1e1e] shadow-2xl relative group">
                            {/* Mac-style Window Header */}
                            <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-white/5 select-none">
                                <div className="flex items-center gap-2">
                                    <Terminal size={12} className="text-gray-500" />
                                    <span className="text-xs text-gray-400 font-mono font-medium">{language}</span>
                                </div>
                                {onCodeReview && (
                                    <button 
                                    onClick={() => onCodeReview(codeContent, language)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-[10px] text-neon-emerald hover:text-white bg-neon-emerald/10 hover:bg-neon-emerald/20 px-2 py-1 rounded border border-neon-emerald/20"
                                    >
                                    <ShieldCheck size={12} />
                                    <span>Audit Code</span>
                                    </button>
                                )}
                            </div>
                            <SyntaxHighlighter
                                // @ts-ignore
                                style={vscDarkPlus}
                                language={language}
                                PreTag="div"
                                customStyle={{ margin: 0, padding: '1.5rem', background: 'transparent', fontSize: '13px', lineHeight: '1.6' }}
                                wrapLines={true}
                                {...props}
                            >
                                {codeContent}
                            </SyntaxHighlighter>
                        </div>
                    ) : (
                        <code className="bg-white/10 px-1.5 py-0.5 rounded text-gray-200 font-mono text-[0.9em] border border-white/5">
                        {children}
                        </code>
                    )
                    }
                }}
                >
                {message.text}
                </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};