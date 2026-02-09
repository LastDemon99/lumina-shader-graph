import os
import re
import json
from typing import List, Optional
from ..models import NodeDefinition, SocketModel

def _clean_field(val: str) -> str:
    return val.strip().strip("'").strip('"')

def _parse_ts_file(content: str, filename: str) -> Optional[NodeDefinition]:
    try:
        # Extract type object with regex (simplistic)
        # Assuming export const X: NodeModule = { ... }
        
        # 1. Type
        type_match = re.search(r"type:\s*['\"]([\w-]+)['\"]", content)
        if not type_match:
            return None
        node_type = type_match.group(1)
        
        # 2. Defintion block
        def_match = re.search(r"definition:\s*\{([\s\S]*?)\},", content)
        if not def_match:
            return None
        def_block = def_match.group(1)
        
        # Label inside definition
        label_match = re.search(r"label:\s*['\"]([^'\"]+)['\"]", def_block)
        label = label_match.group(1) if label_match else node_type
        
        # Inputs array
        inputs = []
        inputs_match = re.search(r"inputs:\s*\[([\s\S]*?)\]", def_block)
        if inputs_match:
            chunk = inputs_match.group(1)
            # Find objects inside array: { ... }
            # Simplification: split by '},'
            items = re.findall(r"\{([\s\S]*?)\}", chunk)
            for item in items:
                id_m = re.search(r"id:\s*['\"]([\w-]+)['\"]", item)
                lbl_m = re.search(r"label:\s*['\"]([^'\"]+)['\"]", item)
                typ_m = re.search(r"type:\s*['\"]([\w-]+)['\"]", item)
                if id_m:
                    inputs.append(SocketModel(
                        id=id_m.group(1),
                        label=lbl_m.group(1) if lbl_m else id_m.group(1),
                        type=typ_m.group(1) if typ_m else "float"
                    ))
                    
        # Outputs array
        outputs = []
        outputs_match = re.search(r"outputs:\s*\[([\s\S]*?)\]", def_block)
        if outputs_match:
            chunk = outputs_match.group(1)
            items = re.findall(r"\{([\s\S]*?)\}", chunk)
            for item in items:
                id_m = re.search(r"id:\s*['\"]([\w-]+)['\"]", item)
                lbl_m = re.search(r"label:\s*['\"]([^'\"]+)['\"]", item)
                typ_m = re.search(r"type:\s*['\"]([\w-]+)['\"]", item)
                if id_m:
                    outputs.append(SocketModel(
                        id=id_m.group(1),
                        label=lbl_m.group(1) if lbl_m else id_m.group(1),
                        type=typ_m.group(1) if typ_m else "float"
                    ))

        return NodeDefinition(
            type=node_type,
            label=label,
            inputs=inputs,
            outputs=outputs
        )

    except Exception as e:
        print(f"Error parsing {filename}: {e}")
        return None

def get_node_definitions(modules_path: str) -> List[NodeDefinition]:
    # modules_path should be absolute path
    definitions = []
    if not os.path.exists(modules_path):
        print(f"Warning: Module path {modules_path} does not exist.")
        return []
        
    for f in os.listdir(modules_path):
        if f.endswith(".ts"):
            full_path = os.path.join(modules_path, f)
            with open(full_path, "r", encoding="utf-8") as file:
                content = file.read()
                defin = _parse_ts_file(content, f)
                if defin:
                    definitions.append(defin)
    
    # Sort by label
    definitions.sort(key=lambda x: x.label)
    return definitions

# Usage example (will be called by main)
# abs_path = os.path.abspath(os.path.join(os.getcwd(), "../../lumina-shader-graph/nodes/modules"))
# defs = get_node_definitions(abs_path)
