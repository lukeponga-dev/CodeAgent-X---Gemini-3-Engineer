import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AgentMode, AgentState, FileContext, Message, ViewMode } from './types';
import { sendMessageToGemini } from './services/geminiService';
import { generateDependencyGraph } from './services/dependencyService';
import { fetchGithubRepo } from './services/githubService';
import { FileTree } from './components/FileTree';
import { MessageBubble } from './components/MessageBubble';
import { DependencyGraph } from './components/DependencyGraph';
import { Send, Zap, BrainCircuit, Sparkles, MessageSquare, Network, Brain } from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "I am CodeAgent X, powered by Gemini 3. \n\nI can analyze your codebase, interpret architecture diagrams, and debug failure signals. Upload your files to the context sidebar to get started.",
      timestamp: Date.now()
    }
  ]);
  const [files, setFiles] = useState<FileContext[]>([]);
  const [input, setInput] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>(AgentMode.ARCHITECT);
  const [thinkingBudget, setThinkingBudget] = useState<number>(4096);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CHAT);
  const [agentState, setAgentState] = useState<AgentState>({ status: 'idle' });
  const [isImporting, setIsImporting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (viewMode === ViewMode.CHAT) {
      scrollToBottom();
    }
  }, [messages, viewMode]);

  const handleModeChange = (mode: AgentMode) => {
    setAgentMode(mode);
    // Set default thinking budgets based on mode
    if (mode === AgentMode.ARCHITECT) {
      setThinkingBudget(4096);
    } else {
      setThinkingBudget(0);
    }
  };

  // Memoize graph data calculation to avoid reprocessing on every render
  const graphData = useMemo(() => generateDependencyGraph(files), [files]);

  // Helper to process response text and extract thoughts
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

      // Always use ARCHITECT mode for deep reasoning on new files, with current thinking budget
      const responseText = await sendMessageToGemini(
        prompt,
        AgentMode.ARCHITECT,
        currentFiles,
        [],
        null,
        Math.max(thinkingBudget, 2048) // Ensure at least some thinking for analysis
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
          ? { ...msg, text: "I analyzed the uploaded files but encountered an error generating the report.", isThinking: false }
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
        text: `Successfully imported ${repoFiles.length} files from ${url}. Analyzing...`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, systemMsg]);

      await triggerAutoAnalysis(updatedFiles, repoFiles.length, 'github');
    } catch (error) {
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        text: `GitHub Import Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
      setAgentState({ status: 'error' });
    } finally {
      setIsImporting(false);
      // Ensure state is idle if not analysis is triggered (error case)
      if (agentState.status === 'error') {
          setTimeout(() => setAgentState({ status: 'idle' }), 2000);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAgentState({ status: 'analyzing' }); // Show 'Reasoning...' immediately

      const newFiles: FileContext[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const reader = new FileReader();
        
        const isImage = file.type.startsWith('image/');
        
        await new Promise<void>((resolve) => {
          reader.onload = (event) => {
            const content = event.target?.result as string;
            // Use base64 string for images, text for code/logs
            const finalContent = isImage ? content.split(',')[1] : content; 

            // Simple heuristic for file types
            let type: FileContext['type'] = 'file';
            const lowerName = file.name.toLowerCase();
            if (isImage) {
              type = 'image';
            } else if (lowerName.endsWith('.log')) {
              type = 'log';
            } else if (lowerName.endsWith('.json') || lowerName.endsWith('.csv')) {
              type = 'metric';
            } else if (lowerName.includes('issue') || lowerName.includes('report') || lowerName.includes('ticket')) {
              type = 'issue';
            }

            // Use webkitRelativePath for folder uploads to preserve structure
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
          
          if (isImage) {
            reader.readAsDataURL(file);
          } else {
            reader.readAsText(file);
          }
        });
      }
      
      const updatedFiles = [...files, ...newFiles];
      setFiles(updatedFiles);
      
      // Reset input to allow same file selection again if needed
      e.target.value = '';

      // Trigger the analysis
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

    // Add placeholder thinking message
    const thinkingMsgId = 'thinking-' + Date.now();
    setMessages(prev => [...prev, {
      id: thinkingMsgId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
      isThinking: true
    }]);

    try {
      const responseText = await sendMessageToGemini(
        userMsg.text,
        agentMode,
        files,
        [], 
        null,
        thinkingBudget
      );

      const { text, thoughts } = processResponse(responseText);

      // Replace thinking message with actual response
      setMessages(prev => prev.map(msg => 
        msg.id === thinkingMsgId 
          ? { ...msg, text: text, thoughts: thoughts, isThinking: false }
          : msg
      ));
      setAgentState({ status: 'idle' });

    } catch (error) {
      setMessages(prev => prev.map(msg => 
        msg.id === thinkingMsgId 
          ? { ...msg, text: "I encountered a critical error processing your request.", isThinking: false }
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

  return (
    <div className="flex h-screen w-screen bg-[#0d1117] text-gray-100 font-sans overflow-hidden">
      {/* Sidebar: Repository Context */}
      <FileTree 
        files={files} 
        onRemove={removeFile} 
        onUpload={handleFileUpload}
        onGithubImport={handleGithubImport}
        isImporting={isImporting}
      />

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Header */}
        <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-[#0d1117]/95 backdrop-blur z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-900/20">
              <Sparkles size={18} />
            </div>
            <div>
              <h1 className="font-bold text-gray-100 tracking-tight">CodeAgent X</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className={`w-2 h-2 rounded-full ${agentState.status === 'analyzing' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`}></span>
                {agentState.status === 'analyzing' ? 'Reasoning...' : 'System Online'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* View Toggle */}
            <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
              <button
                onClick={() => setViewMode(ViewMode.CHAT)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === ViewMode.CHAT
                    ? 'bg-gray-800 text-gray-200 shadow-sm border border-gray-700'
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
                    ? 'bg-gray-800 text-gray-200 shadow-sm border border-gray-700'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Network size={14} />
                Graph
              </button>
            </div>

            {/* Mode Toggle */}
            <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
              <button 
                onClick={() => handleModeChange(AgentMode.ARCHITECT)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  agentMode === AgentMode.ARCHITECT 
                    ? 'bg-gray-800 text-emerald-400 shadow-sm border border-gray-700' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <BrainCircuit size={14} />
                Architect
              </button>
              <button 
                onClick={() => handleModeChange(AgentMode.FAST)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  agentMode === AgentMode.FAST 
                    ? 'bg-gray-800 text-blue-400 shadow-sm border border-gray-700' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Zap size={14} />
                Fast
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative">
          {viewMode === ViewMode.CHAT ? (
            <main className="h-full overflow-y-auto p-6 scroll-smooth pb-0">
              <div className="max-w-4xl mx-auto pb-4">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </main>
          ) : (
             <main className="h-full w-full">
                <DependencyGraph data={graphData} />
             </main>
          )}
        </div>

        {/* Input Area */}
        {viewMode === ViewMode.CHAT && (
          <div className="p-6 pt-2 bg-gradient-to-t from-[#0d1117] via-[#0d1117] to-transparent shrink-0">
            <div className="max-w-4xl mx-auto relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
              <div className="relative bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={files.length > 0 ? "Ask about the loaded context..." : "Describe a task or upload files for analysis..."}
                  className="w-full bg-transparent border-none text-gray-200 p-4 focus:ring-0 resize-none min-h-[60px] max-h-[200px] text-sm font-mono placeholder-gray-600"
                  rows={Math.min(input.split('\n').length + 1, 8)}
                />
                <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-t border-gray-800">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="font-bold text-gray-400">⌘ + Enter</span> to send
                    </span>
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() && files.length === 0 || agentState.status === 'analyzing'}
                    className={`p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold ${
                      (!input.trim() && files.length === 0) || agentState.status === 'analyzing'
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                    }`}
                  >
                    {agentState.status === 'analyzing' ? (
                      <span className="flex items-center gap-2">Processing...</span>
                    ) : (
                      <>
                        <span>EXECUTE</span>
                        <Send size={14} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="text-center mt-2">
              <p className="text-[10px] text-gray-600">
                  CodeAgent X interacts with simulated file context. Sensitive data is not persisted.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}