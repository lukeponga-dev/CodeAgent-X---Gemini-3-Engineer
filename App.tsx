import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AgentMode, AgentState, FileContext, Message, ViewMode } from './types';
import { sendMessageToGemini } from './services/geminiService';
import { generateDependencyGraph } from './services/dependencyService';
import { fetchGithubRepo } from './services/githubService';
import { FileTree } from './components/FileTree';
import { MessageBubble } from './components/MessageBubble';
import { DependencyGraph } from './components/DependencyGraph';
import { Send, Zap, BrainCircuit, MessageSquare, Network, Cpu, Command, Bug, PlayCircle, RotateCcw, Trash2, Save } from 'lucide-react';

// Storage keys for persistence
const STORAGE_KEYS = {
  MESSAGES: 'codeagent_messages',
  FILES: 'codeagent_files'
};

const DEFAULT_MESSAGE: Message = {
  id: 'welcome',
  role: 'model',
  text: "# CodeAgent X Online \n\nI am ready to analyze your repository. I can visualize dependencies, debug stack traces, and architect solutions.\n\n### Capabilities\n\n*   **Deep Reasoning**: I use Gemini 3 to think through complex bugs.\n*   **Full Context**: Upload your whole `src` folder for holistic understanding.\n*   **Visual Engineering**: View the architecture graph to spot coupling issues.\n*   **Autonomous Debugging**: Enable 'Debug' mode to verify fixes before applying them.",
  timestamp: Date.now()
};

export default function App() {
  // Initialize messages from localStorage or default
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to restore messages from storage:', e);
    }
    return [DEFAULT_MESSAGE];
  });

  // Initialize files from localStorage or empty
  const [files, setFiles] = useState<FileContext[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FILES);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to restore files from storage:', e);
    }
    return [];
  });

  const [input, setInput] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>(AgentMode.ARCHITECT);
  const [thinkingBudget, setThinkingBudget] = useState<number>(4096);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CHAT);
  const [agentState, setAgentState] = useState<AgentState>({ status: 'idle' });
  const [isImporting, setIsImporting] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Persist messages whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
      setLastSaved(Date.now());
    } catch (e) {
      console.error('Failed to save messages to local storage (likely quota exceeded):', e);
    }
  }, [messages]);

  // Persist files whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify(files));
      setLastSaved(Date.now());
    } catch (e) {
      console.error('Failed to save files to local storage (likely quota exceeded):', e);
    }
  }, [files]);

  useEffect(() => {
    if (viewMode === ViewMode.CHAT) {
      scrollToBottom();
    }
  }, [messages, viewMode]);

  const handleModeChange = (mode: AgentMode) => {
    setAgentMode(mode);
    if (mode === AgentMode.ARCHITECT || mode === AgentMode.DEBUG) {
      setThinkingBudget(4096);
    } else {
      setThinkingBudget(0);
    }
  };

  const handleResetSession = () => {
    if (window.confirm("Are you sure you want to reset the session? This will delete all chat history and loaded files locally.")) {
      localStorage.removeItem(STORAGE_KEYS.MESSAGES);
      localStorage.removeItem(STORAGE_KEYS.FILES);
      setMessages([DEFAULT_MESSAGE]);
      setFiles([]);
      setAgentState({ status: 'idle' });
      setViewMode(ViewMode.CHAT);
    }
  };

  const graphData = useMemo(() => generateDependencyGraph(files), [files]);

  const processResponse = (fullText: string): { text: string; thoughts?: string } => {
    const thinkingMatch = fullText.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
      const thoughts = thinkingMatch[1].trim();
      const text = fullText.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
      return { text, thoughts };
    }
    return { text: fullText };
  };

  const triggerAutoAnalysis = async (currentFiles: FileContext[], newFileCount: number, source: 'upload' | 'github') => {
    const thinkingMsgId = 'auto-think-' + Date.now();
    
    setMessages(prev => [...prev, {
      id: thinkingMsgId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
      isThinking: true
    }]);
    
    setAgentState({ status: 'analyzing' });

    try {
      let prompt = '';
      if (source === 'github') {
         prompt = `I have just imported a GitHub repository with ${newFileCount} source files. \n\nPlease perform an initial architectural audit of this codebase. \n1. Identify the main entry points and tech stack.\n2. Spot any potential architectural weaknesses or security concerns in the visible files.\n3. Recommend next steps for working with this repo.\n\nBe concise.`;
      } else {
         prompt = `I have just uploaded ${newFileCount} new file(s) to the workspace. \n\nPlease perform an immediate analysis of the codebase context. \n1. Summarize the architectural structure based on these new additions.\n2. Identify any potential bugs, security risks, or performance bottlenecks.\n3. Suggest the next logical step for development.\n\nKeep the response concise and actionable.`;
      }

      const responseText = await sendMessageToGemini(
        prompt,
        AgentMode.ARCHITECT,
        currentFiles,
        [],
        null,
        Math.max(thinkingBudget, 2048)
      );

      const { text, thoughts } = processResponse(responseText);

      setMessages(prev => prev.map(msg => 
        msg.id === thinkingMsgId 
          ? { ...msg, text: text, thoughts: thoughts, isThinking: false }
          : msg
      ));
      setAgentState({ status: 'idle' });

    } catch (error) {
      console.error(error);
      setMessages(prev => prev.map(msg => 
        msg.id === thinkingMsgId 
          ? { ...msg, text: "System Error: Automated analysis failed.", isThinking: false }
          : msg
      ));
      setAgentState({ status: 'error' });
    }
  };

  const handleGithubImport = async (url: string) => {
    setIsImporting(true);
    setAgentState({ status: 'analyzing' });
    try {
      const repoFiles = await fetchGithubRepo(url);
      const updatedFiles = [...files, ...repoFiles];
      setFiles(updatedFiles);
      
      const systemMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        text: `> System Notification: Imported ${repoFiles.length} files from ${url}. Initializing Analysis Protocol...`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, systemMsg]);

      await triggerAutoAnalysis(updatedFiles, repoFiles.length, 'github');
    } catch (error) {
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        text: `Error: GitHub Import Failed. ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
      setAgentState({ status: 'error' });
    } finally {
      setIsImporting(false);
      if (agentState.status === 'error') {
          setTimeout(() => setAgentState({ status: 'idle' }), 2000);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAgentState({ status: 'analyzing' });

      const newFiles: FileContext[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const reader = new FileReader();
        const isImage = file.type.startsWith('image/');
        
        await new Promise<void>((resolve) => {
          reader.onload = (event) => {
            const content = event.target?.result as string;
            const finalContent = isImage ? content.split(',')[1] : content; 
            let type: FileContext['type'] = 'file';
            const lowerName = file.name.toLowerCase();
            if (isImage) { type = 'image'; } 
            else if (lowerName.endsWith('.log')) { type = 'log'; } 
            else if (lowerName.endsWith('.json') || lowerName.endsWith('.csv')) { type = 'metric'; } 
            else if (lowerName.includes('issue') || lowerName.includes('report')) { type = 'issue'; }

            const fileName = file.webkitRelativePath || file.name;
            newFiles.push({
              id: Math.random().toString(36).substring(7),
              name: fileName,
              content: finalContent,
              type: type,
              mimeType: file.type
            });
            resolve();
          };
          if (isImage) reader.readAsDataURL(file);
          else reader.readAsText(file);
        });
      }
      
      const updatedFiles = [...files, ...newFiles];
      setFiles(updatedFiles);
      e.target.value = '';
      await triggerAutoAnalysis(updatedFiles, newFiles.length, 'upload');
    }
  };

  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const handleSend = async () => {
    if (!input.trim() && files.length === 0) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAgentState({ status: 'analyzing' });

    const thinkingMsgId = 'thinking-' + Date.now();
    setMessages(prev => [...prev, {
      id: thinkingMsgId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
      isThinking: true
    }]);

    try {
      if (agentMode === AgentMode.DEBUG) {
        // --- DEBUG MODE FLOW ---
        
        // Step 1: Generate Initial Fix
        const draftResponseText = await sendMessageToGemini(
          userMsg.text,
          AgentMode.ARCHITECT,
          files,
          [],
          null,
          thinkingBudget
        );
        const draft = processResponse(draftResponseText);
        
        // Step 2: Verify Fix
        setAgentState({ status: 'verifying' });
        
        const verificationPrompt = `
          I have generated a potential solution. Now act as a QA Simulation Environment.
          
          Proposed Solution:
          ${draft.text}
          
          Your Task:
          1. Mentally simulate running this code against the provided file context.
          2. Check for syntax errors, logical flaws, memory leaks, or race conditions.
          3. Determine if it fully addresses the user's original request: "${userMsg.text}".
          
          Output Format:
          If verified: "STATUS: VERIFIED"
          If failed: "STATUS: FAILED \n [Detailed reasons why]"
        `;

        const verificationResponseText = await sendMessageToGemini(
          verificationPrompt,
          AgentMode.ARCHITECT,
          files,
          [{ role: 'user', parts: [{ text: userMsg.text }] }, { role: 'model', parts: [{ text: draftResponseText }] }],
          null,
          2048 // Lower budget for QA
        );
        const verification = processResponse(verificationResponseText);

        let finalThoughts = draft.thoughts || "";
        finalThoughts += `\n\n### 🔍 QA Verification Simulation\n${verification.thoughts || "Executing mental sandbox test suite..."}\n\n**Result:** ${verification.text.includes("STATUS: VERIFIED") ? "Pass" : "Fail"}`;

        if (verification.text.includes("STATUS: VERIFIED")) {
           // Success path
           setMessages(prev => prev.map(msg => 
            msg.id === thinkingMsgId 
              ? { ...msg, text: draft.text, thoughts: finalThoughts, isThinking: false }
              : msg
           ));
        } else {
           // Failure & Fix Path
           setAgentState({ status: 'writing' }); // Refining
           
           const refinementPrompt = `
             The verification simulation failed with the following errors:
             ${verification.text}
             
             Please REWRITE the solution to fix these specific issues. 
             Provide the complete, corrected code.
           `;
           
           const finalFixResponseText = await sendMessageToGemini(
              refinementPrompt,
              AgentMode.ARCHITECT,
              files,
              [
                { role: 'user', parts: [{ text: userMsg.text }] }, 
                { role: 'model', parts: [{ text: draftResponseText }] },
                { role: 'user', parts: [{ text: verificationPrompt }] },
                { role: 'model', parts: [{ text: verificationResponseText }] }
              ],
              null,
              4096
           );
           const finalFix = processResponse(finalFixResponseText);
           
           finalThoughts += `\n\n### 🛠️ Autonomous Repair\nDetected failure in simulation. Applying fixes based on QA feedback.\n${finalFix.thoughts || ""}`;

           setMessages(prev => prev.map(msg => 
            msg.id === thinkingMsgId 
              ? { ...msg, text: finalFix.text, thoughts: finalThoughts, isThinking: false }
              : msg
           ));
        }

      } else {
        // --- STANDARD MODES ---
        const responseText = await sendMessageToGemini(
          userMsg.text,
          agentMode,
          files,
          [], 
          null,
          thinkingBudget
        );

        const { text, thoughts } = processResponse(responseText);

        setMessages(prev => prev.map(msg => 
          msg.id === thinkingMsgId 
            ? { ...msg, text: text, thoughts: thoughts, isThinking: false }
            : msg
        ));
      }
      
      setAgentState({ status: 'idle' });

    } catch (error) {
      setMessages(prev => prev.map(msg => 
        msg.id === thinkingMsgId 
          ? { ...msg, text: "Critical Failure: Unable to generate response.", isThinking: false }
          : msg
      ));
      setAgentState({ status: 'error' });
    }
  };

  const handleCodeReview = async (code: string, language: string) => {
    setAgentState({ status: 'analyzing' });
    const reviewPrompt = `
      Please review the following ${language} code snippet. 
      Focus on: Potential bugs, security, code style, and performance.
      Code to Review:
      \`\`\`${language}
      ${code}
      \`\`\`
    `;

    const thinkingMsgId = 'review-' + Date.now();
    const userMsg: Message = {
      id: 'req-' + Date.now(),
      role: 'user',
      text: `Review this ${language} code for bugs and best practices.`,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMsg, {
      id: thinkingMsgId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
      isThinking: true
    }]);

    try {
      const responseText = await sendMessageToGemini(
        reviewPrompt,
        AgentMode.ARCHITECT,
        files,
        [], 
        null,
        2048
      );
      const { text, thoughts } = processResponse(responseText);

      setMessages(prev => prev.map(msg => 
        msg.id === thinkingMsgId 
          ? { ...msg, text: text, thoughts: thoughts, isThinking: false }
          : msg
      ));
      setAgentState({ status: 'idle' });

    } catch (error) {
      setMessages(prev => prev.map(msg => 
        msg.id === thinkingMsgId 
          ? { ...msg, text: "Code review process failed.", isThinking: false }
          : msg
      ));
      setAgentState({ status: 'error' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getStatusText = () => {
    switch (agentState.status) {
      case 'analyzing': return 'Reasoning...';
      case 'verifying': return 'Simulating...';
      case 'writing': return 'Refining Fix...';
      case 'error': return 'System Error';
      default: return 'Ready';
    }
  };

  const getStatusColor = () => {
     switch (agentState.status) {
      case 'analyzing': return 'bg-neon-purple';
      case 'verifying': return 'bg-neon-amber';
      case 'writing': return 'bg-neon-cyan';
      case 'error': return 'bg-neon-rose';
      default: return 'bg-neon-emerald';
    }
  };

  return (
    <div className="flex h-screen w-screen bg-obsidian-950 text-gray-200 font-sans overflow-hidden bg-grid selection:bg-neon-cyan/20 selection:text-neon-cyan">
      {/* File Tree Sidebar */}
      <div className="z-20 relative h-full flex shrink-0">
          <FileTree 
            files={files} 
            onRemove={removeFile} 
            onUpload={handleFileUpload}
            onGithubImport={handleGithubImport}
            isImporting={isImporting}
          />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative z-10 bg-obsidian-950/50">
        
        {/* Modern Glass Header */}
        <header className="h-16 flex items-center justify-between px-6 backdrop-blur-md border-b border-white/5 z-20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 bg-gradient-to-br from-neon-purple to-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-neon-purple/20">
                 <Cpu size={16} />
               </div>
               <div>
                  <h1 className="font-bold text-gray-100 tracking-tight leading-none">CodeAgent X</h1>
                  <span className="text-[10px] text-gray-500 font-mono tracking-wider uppercase">Architect Preview</span>
               </div>
            </div>
            <div className={`w-[1px] h-6 bg-white/10 mx-2`}></div>
            <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`}></span>
                <span className="text-[10px] text-gray-400 font-mono uppercase">
                  {getStatusText()}
                </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex p-0.5 bg-obsidian-800 rounded-lg border border-white/5 items-center">
                 {/* Persistence Status */}
                 {lastSaved && (
                     <div className="px-2 flex items-center gap-1.5 opacity-50 text-[10px] text-gray-400 font-mono border-r border-white/10 mr-1">
                         <Save size={10} />
                         <span>Saved</span>
                     </div>
                 )}
                 <button 
                  onClick={handleResetSession}
                  className="p-1.5 rounded-md text-gray-500 hover:text-neon-rose hover:bg-neon-rose/10 transition-colors"
                  title="Reset Session & Clear Storage"
                 >
                    <Trash2 size={14} />
                 </button>
             </div>

             <div className="flex p-0.5 bg-obsidian-800 rounded-lg border border-white/5">
                <button
                  onClick={() => setViewMode(ViewMode.CHAT)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === ViewMode.CHAT
                      ? 'bg-obsidian-700 text-white shadow-sm ring-1 ring-white/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <MessageSquare size={14} />
                  Chat
                </button>
                <button
                  onClick={() => setViewMode(ViewMode.GRAPH)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === ViewMode.GRAPH
                      ? 'bg-obsidian-700 text-white shadow-sm ring-1 ring-white/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Network size={14} />
                  Graph
                </button>
             </div>

             <div className="flex p-0.5 bg-obsidian-800 rounded-lg border border-white/5">
                <button 
                  onClick={() => handleModeChange(AgentMode.ARCHITECT)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    agentMode === AgentMode.ARCHITECT 
                      ? 'bg-neon-purple/10 text-neon-purple ring-1 ring-neon-purple/30' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <BrainCircuit size={14} />
                  Think
                </button>
                <button 
                  onClick={() => handleModeChange(AgentMode.DEBUG)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    agentMode === AgentMode.DEBUG 
                      ? 'bg-neon-amber/10 text-neon-amber ring-1 ring-neon-amber/30' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Bug size={14} />
                  Debug
                </button>
                <button 
                  onClick={() => handleModeChange(AgentMode.FAST)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    agentMode === AgentMode.FAST 
                      ? 'bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/30' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Zap size={14} />
                  Fast
                </button>
             </div>
          </div>
        </header>

        {/* Viewport */}
        <div className="flex-1 overflow-hidden relative">
          {viewMode === ViewMode.CHAT ? (
            <main className="h-full overflow-y-auto p-6 scroll-smooth pb-0">
              <div className="max-w-4xl mx-auto pb-4">
                {messages.map((msg) => (
                  <MessageBubble 
                    key={msg.id} 
                    message={msg} 
                    onCodeReview={handleCodeReview}
                  />
                ))}
                <div ref={messagesEndRef} className="h-24" />
              </div>
            </main>
          ) : (
             <main className="h-full w-full">
                <DependencyGraph data={graphData} />
             </main>
          )}
        </div>

        {/* Floating Input Capsule */}
        {viewMode === ViewMode.CHAT && (
          <div className="absolute bottom-6 left-0 right-0 z-30 px-6">
             <div className="max-w-4xl mx-auto">
                <div className={`glass-input rounded-2xl p-1.5 transition-all duration-300 focus-within:ring-1 focus-within:shadow-[0_0_30px_-5px_rgba(6,182,212,0.1)] ${
                    agentMode === AgentMode.DEBUG ? 'focus-within:ring-neon-amber/30 border-neon-amber/20' : 'focus-within:ring-neon-cyan/30'
                }`}>
                   <div className="relative">
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            agentMode === AgentMode.DEBUG 
                             ? "Describe the bug to diagnose..."
                             : files.length > 0 ? "Ask about current context..." : "Initialize task..."
                        }
                        className="w-full bg-transparent border-none text-gray-200 p-4 pr-12 focus:ring-0 resize-none min-h-[56px] max-h-[160px] text-sm font-mono placeholder-gray-600 leading-relaxed custom-scrollbar"
                        rows={1}
                        style={{ height: 'auto', minHeight: '56px' }}
                      />
                      <div className="absolute right-2 bottom-2">
                        <button
                          onClick={handleSend}
                          disabled={!input.trim() && files.length === 0 || agentState.status !== 'idle'}
                          className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
                            (!input.trim() && files.length === 0) || agentState.status !== 'idle'
                              ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                              : agentMode === AgentMode.DEBUG 
                                ? 'bg-neon-amber text-obsidian-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20'
                                : 'bg-neon-cyan text-obsidian-950 hover:bg-cyan-300 shadow-lg shadow-cyan-500/20'
                          }`}
                        >
                          {agentState.status !== 'idle' ? (
                            <div className="w-4 h-4 border-2 border-obsidian-950 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            agentMode === AgentMode.DEBUG ? <Bug size={16} strokeWidth={2.5} /> : <Send size={16} strokeWidth={2.5} />
                          )}
                        </button>
                      </div>
                   </div>
                   <div className="px-4 pb-2 flex items-center gap-4 border-t border-white/5 pt-2">
                       <span className="text-[10px] text-gray-600 font-mono flex items-center gap-1.5">
                           <Command size={10} /> RETURN to send
                       </span>
                       <span className="text-[10px] text-gray-600 font-mono">
                           Context: <span className={files.length > 0 ? "text-neon-emerald" : "text-gray-500"}>{files.length} files</span>
                       </span>
                       {agentMode === AgentMode.DEBUG && (
                           <span className="text-[10px] text-neon-amber font-mono flex items-center gap-1.5 ml-auto">
                               <PlayCircle size={10} /> Auto-Verification Active
                           </span>
                       )}
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}