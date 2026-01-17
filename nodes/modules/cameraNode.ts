import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const cameraNode: NodeModule = {
  type: 'camera',
  definition: NODE_DEFINITIONS.camera,
};
