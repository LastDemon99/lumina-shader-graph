import type { Connection, ShaderNode, SocketDef, SocketType } from '../types';
import type { Condition, EffectiveSocketDef, SocketDirection, SocketRules, TypeExpr } from './types';

export const isSocketConnected = (
  nodeId: string,
  socketId: string,
  direction: SocketDirection,
  connections: Connection[],
): boolean => {
  if (direction === 'input') {
    return connections.some(c => c.targetNodeId === nodeId && c.targetSocketId === socketId);
  }
  return connections.some(c => c.sourceNodeId === nodeId && c.sourceSocketId === socketId);
};

export const evaluateCondition = (
  cond: Condition | undefined,
  node: ShaderNode,
  connections: Connection[],
): boolean => {
  if (!cond) return true;

  switch (cond.kind) {
    case 'always':
      return true;
    case 'not':
      return !evaluateCondition(cond.cond, node, connections);
    case 'and':
      return cond.conds.every(c => evaluateCondition(c, node, connections));
    case 'or':
      return cond.conds.some(c => evaluateCondition(c, node, connections));
    case 'dataEquals':
      return (node.data as any)?.[cond.key] === cond.value;
    case 'dataIn':
      return cond.values.includes((node.data as any)?.[cond.key]);
    case 'connected':
      return isSocketConnected(node.id, cond.socketId, cond.direction, connections);
    default:
      return true;
  }
};

const resolveTypeExpr = (
  expr: TypeExpr,
  node: ShaderNode,
): SocketType => {
  switch (expr.kind) {
    case 'static':
      return expr.type;
    case 'swizzleMaskLength': {
      const mask = String((node.data as any)?.[expr.maskKey] ?? expr.defaultMask ?? 'xyzw');
      const len = mask.length;
      if (len <= 1) return 'float';
      if (len === 2) return 'vec2';
      if (len === 3) return 'vec3';
      return 'vec4';
    }
    default:
      return 'float';
  }
};

const resolveSocketType = (
  ruleType: SocketType | TypeExpr | undefined,
  socket: SocketDef,
  node: ShaderNode,
): SocketType => {
  if (!ruleType) return socket.type;
  if (typeof ruleType === 'string') return ruleType;
  return resolveTypeExpr(ruleType, node);
};

export const getEffectiveSockets = (
  node: ShaderNode,
  sockets: SocketDef[],
  direction: SocketDirection,
  connections: Connection[],
  socketRules?: SocketRules,
): EffectiveSocketDef[] => {
  const rules = direction === 'input' ? socketRules?.inputs : socketRules?.outputs;

  return sockets.map(socket => {
    const rule = rules?.[socket.id];
    const visible = evaluateCondition(rule?.visibleWhen, node, connections);
    const enabled = evaluateCondition(rule?.enabledWhen, node, connections);
    const type = resolveSocketType(rule?.type as any, socket, node);
    const label = rule?.label ?? socket.label;
    return {
      ...socket,
      label,
      type,
      visible,
      enabled,
      maxConnections: direction === 'input' ? rule?.maxConnections : undefined,
    };
  });
};

export const getFallbackSocketId = (
  node: ShaderNode,
  direction: SocketDirection,
  socketRules?: SocketRules,
): string | undefined => {
  const explicit = direction === 'input' ? socketRules?.fallbackSocket?.input : socketRules?.fallbackSocket?.output;
  if (explicit) return explicit;

  const rules = direction === 'input' ? socketRules?.inputs : socketRules?.outputs;
  if (!rules) return undefined;

  const flagged = Object.entries(rules).find(([, r]) => r.fallbackSocket);
  return flagged?.[0];
};
