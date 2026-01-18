import { ShaderNode, Connection } from '../types';
import { getNodeModule } from '../nodes';
import { getEffectiveSockets } from '../nodes/runtime';

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
    const mod = getNodeModule(node.type);
    const def = mod?.definition as any;
    if (!def) {
      report.push(`Unknown node type '${node.type}' (ID: ${node.id}). Missing module definition.`);
      return;
    }

    // Socket rules / maxConnections checks
    try {
      const effectiveInputs = getEffectiveSockets(node, def.inputs ?? [], 'input', connections, mod?.socketRules);
      for (const socket of effectiveInputs) {
        const incoming = connections.filter(c => c.targetNodeId === node.id && c.targetSocketId === socket.id);
        const max = socket.maxConnections ?? 1;
        if (incoming.length > 0 && (!socket.visible || !socket.enabled)) {
          report.push(
            `Node '${node.label}' (ID: ${node.id}) has connections to a ${!socket.visible ? 'hidden' : 'disabled'} input '${socket.label}'.`,
          );
        }
        if (incoming.length > max) {
          report.push(
            `Node '${node.label}' (ID: ${node.id}) input '${socket.label}' exceeds maxConnections (${incoming.length}/${max}).`,
          );
        }
      }

      const effectiveOutputs = getEffectiveSockets(node, def.outputs ?? [], 'output', connections, mod?.socketRules);
      for (const socket of effectiveOutputs) {
        if (socket.maxConnections === undefined) continue;
        const outgoing = connections.filter(c => c.sourceNodeId === node.id && c.sourceSocketId === socket.id);
        if (outgoing.length > socket.maxConnections) {
          report.push(
            `Node '${node.label}' (ID: ${node.id}) output '${socket.label}' exceeds maxConnections (${outgoing.length}/${socket.maxConnections}).`,
          );
        }
      }
    } catch {
      // Keep linter resilient: never crash graph rendering due to a linter edge-case.
    }

    // Check Inputs
    // We skip nodes marked as 'isSourceNode' or source heuristics in metadata
    const isSourceNode = mod?.metadata?.isSourceNode ?? false;

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
    const isMasterNode = mod?.metadata?.isMasterNode ?? false;
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
