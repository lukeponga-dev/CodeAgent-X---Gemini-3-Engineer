import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { DependencyGraphData } from '../types';
import { Search, Filter, X, Circle } from 'lucide-react';

interface DependencyGraphProps {
  data: DependencyGraphData;
}

export const DependencyGraph: React.FC<DependencyGraphProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Interaction State
  const [activeType, setActiveType] = useState<string | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Prepare Data (Filter & Clone to handle D3 mutations safety)
  const graphData = useMemo(() => {
    // Deep clone/Sanitize to avoid issues with D3 mutation of props
    // We preserve x/y if they exist to prevent jumping, but ensures links use string IDs
    const allNodes = data.nodes.map(n => ({ ...n }));
    const allLinks = data.links.map(l => ({
        ...l,
        source: typeof l.source === 'object' ? (l.source as any).id : l.source,
        target: typeof l.target === 'object' ? (l.target as any).id : l.target
    }));

    // Filter
    const nodes = allNodes.filter(n => {
        const typeMatch = activeType === 'all' || n.type === activeType;
        const nameMatch = n.name.toLowerCase().includes(searchTerm.toLowerCase());
        return typeMatch && nameMatch;
    });

    const nodeIds = new Set(nodes.map(n => n.id));
    const links = allLinks.filter(l => 
        nodeIds.has(l.source as string) && nodeIds.has(l.target as string)
    );

    return { nodes, links };
  }, [data, activeType, searchTerm]);


  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Clear
    d3.select(svgRef.current).selectAll("*").remove();

    if (graphData.nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .style("font-family", "JetBrains Mono, monospace");

    // Simulation
    const simulation = d3.forceSimulation(graphData.nodes as any)
      .force("link", d3.forceLink(graphData.links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(30));

    // --- Definitions (Markers) ---
    svg.append("defs").selectAll("marker")
      .data(["end"])
      .enter().append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#4b5563");

    // --- Elements ---
    const link = svg.append("g")
      .attr("stroke", "#4b5563")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    const node = svg.append("g")
      .selectAll("g")
      .data(graphData.nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(drag(simulation) as any);

    // Node Visuals
    const getNodeColor = (type: string) => {
        switch(type) {
            case 'log': return '#f87171';
            case 'metric': return '#fbbf24';
            case 'image': return '#c084fc';
            case 'issue': return '#f472b6';
            default: return '#3b82f6';
        }
    };

    const circles = node.append("circle")
      .attr("r", 8)
      .attr("fill", (d: any) => getNodeColor(d.type))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);

    const labels = node.append("text")
      .text((d: any) => d.name)
      .attr("x", 12)
      .attr("y", 4)
      .style("fill", "#e5e7eb")
      .style("font-size", "10px")
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 2px rgba(0,0,0,0.8)");

    // --- Interactions (Hover) ---
    // Pre-calculate neighbors for O(1) lookups
    const neighbors = new Set<string>();
    graphData.links.forEach((l: any) => {
        neighbors.add(`${l.source.id}|${l.target.id}`);
        neighbors.add(`${l.target.id}|${l.source.id}`);
    });

    const isConnected = (a: string, b: string) => {
        return a === b || neighbors.has(`${a}|${b}`);
    };

    node.on("mouseover", (event, d: any) => {
        // Dim unrelated
        node.transition().duration(200).style("opacity", (o: any) => isConnected(d.id, o.id) ? 1 : 0.1);
        link.transition().duration(200).style("opacity", (l: any) => 
            (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.05
        ).attr("stroke", (l: any) => (l.source.id === d.id || l.target.id === d.id) ? "#fff" : "#4b5563");
        
        labels.style("font-weight", (o: any) => isConnected(d.id, o.id) ? "bold" : "normal");
    })
    .on("mouseout", () => {
        node.transition().duration(200).style("opacity", 1);
        link.transition().duration(200).style("opacity", 0.6).attr("stroke", "#4b5563");
        labels.style("font-weight", "normal");
    });

    // --- Ticks ---
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Zoom
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => svg.selectAll("g").attr("transform", event.transform));
    // @ts-ignore
    svg.call(zoom);

  }, [graphData]); // Re-run when filtered data changes

  // Drag Helper
  const drag = (simulation: any) => {
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  };
  
  if (data.nodes.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="mb-2 text-lg">No graph data</p>
            <p className="text-xs">Upload code files with imports to visualize dependencies.</p>
        </div>
    )
  }

  const types = [
    { id: 'all', label: 'All', color: 'bg-gray-500' },
    { id: 'file', label: 'Code', color: 'bg-blue-500' },
    { id: 'metric', label: 'Metric', color: 'bg-amber-500' },
    { id: 'log', label: 'Log', color: 'bg-red-400' },
    { id: 'image', label: 'Image', color: 'bg-purple-400' },
    { id: 'issue', label: 'Issue', color: 'bg-pink-400' },
  ];

  return (
    <div ref={containerRef} className="w-full h-full bg-[#0d1117] overflow-hidden relative">
      {/* Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3 pointer-events-none">
        {/* Search */}
        <div className="pointer-events-auto bg-gray-900/90 backdrop-blur-sm border border-gray-800 rounded-lg shadow-xl p-2 flex items-center gap-2 w-64">
           <Search size={14} className="text-gray-500" />
           <input 
             type="text" 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             placeholder="Search modules..." 
             className="bg-transparent border-none text-xs text-gray-200 focus:outline-none w-full placeholder-gray-600"
           />
           {searchTerm && <button onClick={() => setSearchTerm('')}><X size={14} className="text-gray-500 hover:text-gray-300" /></button>}
        </div>

        {/* Filters */}
        <div className="pointer-events-auto bg-gray-900/90 backdrop-blur-sm border border-gray-800 rounded-lg shadow-xl p-2 flex flex-col gap-1 w-64">
           <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 px-1 mb-1">
             <Filter size={12} />
             <span>FILTER BY TYPE</span>
           </div>
           <div className="grid grid-cols-2 gap-1">
             {types.map(t => (
               <button 
                 key={t.id}
                 onClick={() => setActiveType(t.id)}
                 className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                   activeType === t.id 
                     ? 'bg-gray-800 text-white shadow-inner ring-1 ring-gray-700' 
                     : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                 }`}
               >
                 <span className={`w-2 h-2 rounded-full ${t.color}`}></span>
                 {t.label}
               </button>
             ))}
           </div>
        </div>
      </div>

      <svg ref={svgRef} className="w-full h-full cursor-move outline-none"></svg>
    </div>
  );
};