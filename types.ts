export enum AgentMode {
  FAST = 'FAST', // gemini-3-flash
  ARCHITECT = 'ARCHITECT', // gemini-3-pro with thinking
  DEBUG = 'DEBUG' // gemini-3-pro with iterative verification
}

export enum ViewMode {
  CHAT = 'CHAT',
  GRAPH = 'GRAPH'
}

export interface FileContext {
  id: string;
  name: string;
  content: string; // Text content or base64 for images
  type: 'file' | 'image' | 'log' | 'metric' | 'issue';
  mimeType?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isThinking?: boolean; // For UI state
  thoughts?: string; // Captured reasoning trace
  attachments?: FileContext[]; // Attachments specific to this message
}

export interface AgentState {
  status: 'idle' | 'analyzing' | 'verifying' | 'writing' | 'error';
  currentAction?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: FileContext['type'];
  val?: number; // visual weight
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface DependencyGraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
}