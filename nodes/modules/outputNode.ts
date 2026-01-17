import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const outputNode: NodeModule = {
  type: 'output',
  definition: NODE_DEFINITIONS.output,
};
