from typing import List, Set, Dict, Any
from ..models import GraphState, Node, Connection
from .definitions import NodeDefinition

def validate_graph(graph: GraphState, definitions: List[NodeDefinition]) -> List[str]:
    report = []
    
    # 1. Check for missing masters
    has_output = any(n.type == 'output' for n in graph.nodes)
    if not has_output:
        report.append("CRITICAL: Missing 'Fragment Master' (output) node.")
        
    has_vertex = any(n.type == 'vertex' for n in graph.nodes)
    if not has_vertex:
        # report.append("Warning: Missing 'Vertex Master' node.")
        pass

    # 2. Connectivity
    def_map = {d.type: d for d in definitions}
    
    for node in graph.nodes:
        if node.type not in def_map:
            report.append(f"Unknown node type '{node.type}' (ID: {node.id}).")
            continue
            
        defin = def_map[node.type]
        
        # Check Inputs connectivity
        # Some nodes allow unconnected inputs (they use defaults), so this is weak check unless we know strict requirements
        # But for 'output', it MUST have something connected to 'color' or others
        if node.type == 'output':
            incoming = [c for c in graph.connections if c.targetNodeId == node.id]
            if not incoming:
                report.append(f"Master Output node is not connected to anything.")

    # 3. Cycle detection (DFS)
    visited = set()
    recursion_stack = set()
    
    # Build adj graph for fast traverse
    adj = {n.id: [] for n in graph.nodes}
    for c in graph.connections:
        if c.sourceNodeId in adj:
            adj[c.sourceNodeId].append(c.targetNodeId)
            
    def has_cycle(node_id):
        visited.add(node_id)
        recursion_stack.add(node_id)
        
        for neighbor in adj.get(node_id, []):
            if neighbor not in visited:
                if has_cycle(neighbor):
                    return True
            elif neighbor in recursion_stack:
                return True
                
        recursion_stack.remove(node_id)
        return False
        
    for node in graph.nodes:
        if node.id not in visited:
            if has_cycle(node.id):
                report.append("Cycle detected in graph logic.")
                break
                
    return report
