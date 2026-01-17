import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const previewNode: NodeModule = {
  type: 'preview',
  definition: NODE_DEFINITIONS.preview,
};
