import type { NodeModule } from './types';

import { floatNode } from './modules/floatNode';
import { colorNode } from './modules/colorNode';
import { swizzleNode } from './modules/swizzleNode';
import { addNode } from './modules/addNode';
import { subtractNode } from './modules/subtractNode';
import { multiplyNode } from './modules/multiplyNode';
import { divideNode } from './modules/divideNode';
import { remapNode } from './modules/remapNode';
import { clampNode } from './modules/clampNode';
import { reciprocalNode } from './modules/reciprocalNode';
import { powerNode } from './modules/powerNode';
import { inverseLerpNode } from './modules/inverseLerpNode';
import { maximumNode } from './modules/maximumNode';
import { minimumNode } from './modules/minimumNode';
import { ceilingNode } from './modules/ceilingNode';
import { floorNode } from './modules/floorNode';
import { roundNode } from './modules/roundNode';
import { fractionNode } from './modules/fractionNode';
import { truncateNode } from './modules/truncateNode';
import { absoluteNode } from './modules/absoluteNode';
import { sineNode } from './modules/sineNode';
import { cosineNode } from './modules/cosineNode';
import { arccosineNode } from './modules/arccosineNode';
import { arcsineNode } from './modules/arcsineNode';
import { arctangentNode } from './modules/arctangentNode';
import { arctangent2Node } from './modules/arctangent2Node';
import { dotNode } from './modules/dotNode';
import { crossNode } from './modules/crossNode';
import { normalizeNode } from './modules/normalizeNode';
import { lengthNode } from './modules/lengthNode';
import { distanceNode } from './modules/distanceNode';
import { stepNode } from './modules/stepNode';
import { smoothstepNode } from './modules/smoothstepNode';
import { saturateNode } from './modules/saturateNode';
import { oneMinusNode } from './modules/oneMinusNode';
import { negateNode } from './modules/negateNode';
import { posterizeNode } from './modules/posterizeNode';
import { splitNode } from './modules/splitNode';
import { combineNode } from './modules/combineNode';
import { checkerboardNode } from './modules/checkerboardNode';
import { voronoiNode } from './modules/voronoiNode';
import { simpleNoiseNode } from './modules/simpleNoiseNode';
import { channelMaskNode } from './modules/channelMaskNode';
import { colorspaceConversionNode } from './modules/colorspaceConversionNode';
import { invertColorsNode } from './modules/invertColorsNode';
import { contrastNode } from './modules/contrastNode';
import { hueNode } from './modules/hueNode';
import { colorMaskNode } from './modules/colorMaskNode';
import { ditherNode } from './modules/ditherNode';
import { fadeTransitionNode } from './modules/fadeTransitionNode';
import { screenPositionNode } from './modules/screenPositionNode';
import { sceneDepthNode } from './modules/sceneDepthNode';
import { sceneDepthDifferenceNode } from './modules/sceneDepthDifferenceNode';
import { vertexNode } from './modules/vertexNode';
import { outputNode } from './modules/outputNode';
import { previewNode } from './modules/previewNode';
import { objectNode } from './modules/objectNode';
import { cameraNode } from './modules/cameraNode';
import { positionNode } from './modules/positionNode';
import { normalNode } from './modules/normalNode';
import { tangentNode } from './modules/tangentNode';
import { bitangentNode } from './modules/bitangentNode';
import { viewDirectionNode } from './modules/viewDirectionNode';
import { viewVectorNode } from './modules/viewVectorNode';
import { mainLightDirectionNode } from './modules/mainLightDirectionNode';
import { screenNode } from './modules/screenNode';
import { sliderNode } from './modules/sliderNode';
import { timeNode } from './modules/timeNode';
import { uvNode } from './modules/uvNode';
import { vector2Node } from './modules/vector2Node';
import { vector3Node } from './modules/vector3Node';
import { vector4Node } from './modules/vector4Node';
import { rotateNode } from './modules/rotateNode';
import { twirlNode } from './modules/twirlNode';
import { transformNode } from './modules/transformNode';
import { rotateAboutAxisNode } from './modules/rotateAboutAxisNode';
import { radialShearNode } from './modules/radialShearNode';
import { polarCoordinatesNode } from './modules/polarCoordinatesNode';
import { matrixConstructionNode } from './modules/matrixConstructionNode';
import { mixNode } from './modules/mixNode';
import { blendNode } from './modules/blendNode';
import { gradientNode } from './modules/gradientNode';
import { sampleGradientNode } from './modules/sampleGradientNode';
import { dielectricSpecularNode } from './modules/dielectricSpecularNode';
import { metalReflectanceNode } from './modules/metalReflectanceNode';
import { samplerStateNode } from './modules/samplerStateNode';
import { textureNode } from './modules/textureNode';
import { textureAssetNode } from './modules/textureAssetNode';
import { texture2DArrayAssetNode } from './modules/texture2DArrayAssetNode';
import { sampleTexture2DLODNode } from './modules/sampleTexture2DLODNode';
import { gatherTexture2DNode } from './modules/gatherTexture2DNode';
import { sampleTexture2DArrayNode } from './modules/sampleTexture2DArrayNode';
import { textureSizeNode } from './modules/textureSizeNode';
import { calculateLevelOfDetailTextureNode } from './modules/calculateLevelOfDetailTextureNode';
import { parallaxMappingNode } from './modules/parallaxMappingNode';
import { flipbookNode } from './modules/flipbookNode';
import { vertexColorNode } from './modules/vertexColorNode';
import { normalBlendNode } from './modules/normalBlendNode';

export const NODE_REGISTRY: Record<string, NodeModule> = {
  [floatNode.type]: floatNode,
  [colorNode.type]: colorNode,
  [swizzleNode.type]: swizzleNode,
  [addNode.type]: addNode,
  [subtractNode.type]: subtractNode,
  [multiplyNode.type]: multiplyNode,
  [divideNode.type]: divideNode,
  [remapNode.type]: remapNode,
  [clampNode.type]: clampNode,
  [reciprocalNode.type]: reciprocalNode,
  [powerNode.type]: powerNode,
  [inverseLerpNode.type]: inverseLerpNode,
  [maximumNode.type]: maximumNode,
  [minimumNode.type]: minimumNode,
  [ceilingNode.type]: ceilingNode,
  [floorNode.type]: floorNode,
  [roundNode.type]: roundNode,
  [fractionNode.type]: fractionNode,
  [truncateNode.type]: truncateNode,
  [absoluteNode.type]: absoluteNode,
  [sineNode.type]: sineNode,
  [cosineNode.type]: cosineNode,
  [arccosineNode.type]: arccosineNode,
  [arcsineNode.type]: arcsineNode,
  [arctangentNode.type]: arctangentNode,
  [arctangent2Node.type]: arctangent2Node,
  [dotNode.type]: dotNode,
  [crossNode.type]: crossNode,
  [normalizeNode.type]: normalizeNode,
  [lengthNode.type]: lengthNode,
  [distanceNode.type]: distanceNode,
  [stepNode.type]: stepNode,
  [smoothstepNode.type]: smoothstepNode,
  [saturateNode.type]: saturateNode,
  [oneMinusNode.type]: oneMinusNode,
  [negateNode.type]: negateNode,
  [posterizeNode.type]: posterizeNode,
  [splitNode.type]: splitNode,
  [combineNode.type]: combineNode,
  [checkerboardNode.type]: checkerboardNode,
  [voronoiNode.type]: voronoiNode,
  [simpleNoiseNode.type]: simpleNoiseNode,
  [channelMaskNode.type]: channelMaskNode,
  [colorspaceConversionNode.type]: colorspaceConversionNode,
  [invertColorsNode.type]: invertColorsNode,
  [contrastNode.type]: contrastNode,
  [hueNode.type]: hueNode,
  [colorMaskNode.type]: colorMaskNode,
  [ditherNode.type]: ditherNode,
  [fadeTransitionNode.type]: fadeTransitionNode,
  [screenPositionNode.type]: screenPositionNode,
  [sceneDepthNode.type]: sceneDepthNode,
  [sceneDepthDifferenceNode.type]: sceneDepthDifferenceNode,
  [vertexNode.type]: vertexNode,
  [outputNode.type]: outputNode,
  [previewNode.type]: previewNode,
  [objectNode.type]: objectNode,
  [cameraNode.type]: cameraNode,
  [positionNode.type]: positionNode,
  [normalNode.type]: normalNode,
  [tangentNode.type]: tangentNode,
  [bitangentNode.type]: bitangentNode,
  [viewDirectionNode.type]: viewDirectionNode,
  [viewVectorNode.type]: viewVectorNode,
  [mainLightDirectionNode.type]: mainLightDirectionNode,
  [screenNode.type]: screenNode,
  [sliderNode.type]: sliderNode,
  [timeNode.type]: timeNode,
  [uvNode.type]: uvNode,
  [vector2Node.type]: vector2Node,
  [vector3Node.type]: vector3Node,
  [vector4Node.type]: vector4Node,
  [rotateNode.type]: rotateNode,
  [twirlNode.type]: twirlNode,
  [transformNode.type]: transformNode,
  [rotateAboutAxisNode.type]: rotateAboutAxisNode,
  [radialShearNode.type]: radialShearNode,
  [polarCoordinatesNode.type]: polarCoordinatesNode,
  [matrixConstructionNode.type]: matrixConstructionNode,
  [mixNode.type]: mixNode,
  [blendNode.type]: blendNode,
  [gradientNode.type]: gradientNode,
  [sampleGradientNode.type]: sampleGradientNode,
  [dielectricSpecularNode.type]: dielectricSpecularNode,
  [metalReflectanceNode.type]: metalReflectanceNode,
  [samplerStateNode.type]: samplerStateNode,
  [textureNode.type]: textureNode,
  [textureAssetNode.type]: textureAssetNode,
  [texture2DArrayAssetNode.type]: texture2DArrayAssetNode,
  [sampleTexture2DLODNode.type]: sampleTexture2DLODNode,
  [gatherTexture2DNode.type]: gatherTexture2DNode,
  [sampleTexture2DArrayNode.type]: sampleTexture2DArrayNode,
  [textureSizeNode.type]: textureSizeNode,
  [calculateLevelOfDetailTextureNode.type]: calculateLevelOfDetailTextureNode,
  [parallaxMappingNode.type]: parallaxMappingNode,
  [flipbookNode.type]: flipbookNode,
  [vertexColorNode.type]: vertexColorNode,
  [normalBlendNode.type]: normalBlendNode,
};

export const getNodeModule = (type: string): NodeModule | undefined => {
  return NODE_REGISTRY[type];
};
