import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const twirlNode: NodeModule = {
  type: 'twirl',
  definition: NODE_DEFINITIONS.twirl,
};
