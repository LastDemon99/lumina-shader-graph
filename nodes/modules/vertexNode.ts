import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const vertexNode: NodeModule = {
  type: 'vertex',
  definition: NODE_DEFINITIONS.vertex,
};
