import React, { useState } from 'react';
import { FileContext } from '../types';
import { FileCode, FileImage, Trash2, Upload, AlertCircle, Activity, MessageSquareWarning, Github, X, Check, FolderInput, File } from 'lucide-react';

interface FileTreeProps {
  files: FileContext[];
  onRemove: (id: string) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGithubImport: (url: string) => Promise<void>;
  isImporting?: boolean;
}

export const FileTree: React.FC<FileTreeProps> = ({ files, onRemove, onUpload, onGithubImport, isImporting }) => {
  const [showGithubInput, setShowGithubInput] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');

  const getIcon = (type: FileContext['type']) => {
    switch (type) {
      case 'image': return <FileImage size={14} className="text-neon-purple shrink-0" />;
      case 'log': return <AlertCircle size={14} className="text-neon-rose shrink-0" />;
      case 'metric': return <Activity size={14} className="text-neon-amber shrink-0" />;
      case 'issue': return <MessageSquareWarning size={14} className="text-gray-400 shrink-0" />;
      default: return <FileCode size={14} className="text-neon-cyan shrink-0" />;
    }
  };

  const handleGithubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim()) return;
    await onGithubImport(githubUrl);
    setShowGithubInput(false);
    setGithubUrl('');
  };

  return (
    <div className="w-64 bg-obsidian-900 border-r border-white/5 flex flex-col h-full shrink-0 z-20">
      {/* Header */}
      <div className="h-16 flex items-center px-5 border-b border-white/5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
           Project Context
           <span className="text-[10px] text-gray-600 font-normal ml-auto">{files.length} Files</span>
        </h2>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-10 opacity-40 gap-4 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <File size={24} className="text-gray-500" />
            </div>
            <p className="text-xs text-gray-500 font-medium">Drag files or use buttons below to load context.</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {files.map((file) => (
              <div key={file.id} className="group flex items-center justify-between px-3 py-2 rounded-md hover:bg-white/5 transition-all cursor-default text-gray-400 hover:text-gray-200">
                <div className="flex items-center gap-3 overflow-hidden">
                  {getIcon(file.type)}
                  <span className="text-xs truncate font-mono tracking-tight" title={file.name}>{file.name}</span>
                </div>
                <button 
                  onClick={() => onRemove(file.id)}
                  className="text-gray-600 hover:text-neon-rose opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-white/5 bg-obsidian-900">
        {showGithubInput ? (
          <form onSubmit={handleGithubSubmit} className="bg-obsidian-950 p-3 rounded-xl border border-white/10 shadow-lg animate-fade-in-up">
            <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Github URL</label>
                <button type="button" onClick={() => setShowGithubInput(false)}><X size={12} className="text-gray-600 hover:text-gray-400"/></button>
            </div>
            <input 
              type="text" 
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="owner/repo"
              className="w-full bg-obsidian-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-neon-cyan/50 mb-3 font-mono"
              autoFocus
            />
            <button 
                type="submit"
                disabled={isImporting}
                className="w-full bg-neon-cyan/10 hover:bg-neon-cyan/20 text-neon-cyan text-xs py-2 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors border border-neon-cyan/20"
              >
                 {isImporting ? <span className="animate-spin">⟳</span> : <Github size={12} />}
                 Import
              </button>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 text-xs rounded-lg cursor-pointer transition-colors border border-transparent hover:border-white/5 group">
                <Upload size={14} className="group-hover:-translate-y-0.5 transition-transform" />
                <span className="font-medium">Files</span>
                <input type="file" multiple className="hidden" onChange={onUpload} />
              </label>
              <label className="flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 text-xs rounded-lg cursor-pointer transition-colors border border-transparent hover:border-white/5 group">
                <FolderInput size={14} className="group-hover:-translate-y-0.5 transition-transform" />
                <span className="font-medium">Dir</span>
                <input type="file" multiple 
                  // @ts-ignore
                  webkitdirectory="" directory="" 
                  className="hidden" onChange={onUpload} />
              </label>
            </div>
            <button 
              onClick={() => setShowGithubInput(true)}
              className="flex items-center justify-center w-full px-3 py-2 gap-2 bg-transparent hover:bg-white/5 text-gray-500 hover:text-gray-300 text-xs rounded-lg cursor-pointer transition-colors border border-dashed border-gray-700 hover:border-gray-500 font-medium"
            >
              <Github size={14} />
              <span>Clone Repository</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};