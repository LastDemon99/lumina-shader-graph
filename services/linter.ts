
import { ShaderNode, Connection, NodeType } from '../types';
import { NODE_DEFINITIONS } from '../constants';
import { getNodeModule } from '../nodes';

export const lintGraph = (nodes: ShaderNode[], connections: Connection[]): string[] => {
  const report: string[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));

  // 1. Check for Master Node
  const hasFragmentMaster = nodes.some(n => n.type === 'output');
  if (!hasFragmentMaster) {
    report.push("CRITICAL: Missing 'Fragment Master' (output) node. The graph will not render.");
  }

  // 2. Connectivity Checks
  nodes.forEach(node => {
    const def = (getNodeModule(node.type)?.definition ?? NODE_DEFINITIONS[node.type as NodeType]) as any;
    if (!def) return;

    // Check Inputs
    // We skip 'color', 'float', 'time', 'uv', 'position', 'normal' as they are sources
    const isSourceNode = ['color', 'float', 'time', 'uv', 'position', 'normal'].includes(node.type);
    
    if (!isSourceNode && def.inputs.length > 0) {
      const connectedInputs = connections.filter(c => c.targetNodeId === node.id);
      if (connectedInputs.length === 0) {
        report.push(`Node '${node.label}' (ID: ${node.id}) has NO connected inputs. It needs data.`);
      } else if (connectedInputs.length < def.inputs.length) {
         // This is a warning, some nodes like 'mix' might work with defaults, but usually bad practice in graph generation
         report.push(`Node '${node.label}' (ID: ${node.id}) has unconnected input sockets.`);
      }
    }

    // Check Outputs
    const isMasterNode = ['output', 'vertex'].includes(node.type);
    if (!isMasterNode && def.outputs.length > 0) {
      const connectedOutputs = connections.filter(c => c.sourceNodeId === node.id);
      if (connectedOutputs.length === 0) {
        report.push(`Node '${node.label}' (ID: ${node.id}) is a dead end (no outputs connected).`);
      }
    }
  });

  // 3. Layout Check (Heuristic)
  let backwardsFlowCount = 0;
  connections.forEach(conn => {
    const source = nodes.find(n => n.id === conn.sourceNodeId);
    const target = nodes.find(n => n.id === conn.targetNodeId);
    if (source && target) {
      if (source.x >= target.x) {
        backwardsFlowCount++;
      }
    }
  });

  if (backwardsFlowCount > 0) {
    report.push(`Layout Issue: ${backwardsFlowCount} connections are flowing backwards or vertically stacked. Organize Left -> Right.`);
  }

  return report;
};
