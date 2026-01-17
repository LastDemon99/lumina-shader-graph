import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const uvNode: NodeModule = {
  type: 'uv',
  definition: NODE_DEFINITIONS.uv,
};
