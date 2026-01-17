import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const timeNode: NodeModule = {
  type: 'time',
  definition: NODE_DEFINITIONS.time,
};
