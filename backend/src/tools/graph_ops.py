from typing import Any, Dict, List, Optional, Literal
from pydantic import Field

# Nota: Estas funciones en realidad actúan como "firmas" o "schemas" para Gemini.
# El backend NO ejecuta la lógica interna aquí (como modificar una base de datos real), 
# sino que utiliza los argumentos capturados por Gemini para construir objetos GraphOperation.
# Sin embargo, definirlas como funciones Python reales permite que el SDK de google-genai 
# infiera automáticamente los tipos y descripciones para la API.

def generate_image(prompt: str, type: Literal["basecolor", "normal", "specular", "roughness", "displacement", "emission", "alpha", "sprite_flipbook", "environment_map"]):
    """
    Genera una textura/imagen usando IA basada en un prompt y un tipo específico.
    Esta función NO añade el nodo al grafo automáticamente, solo inicia la generación que ocurre en el backend/frontend.
    El resultado será un nuevo asset disponible en la librería de Lumina.
    
    Args:
        prompt: Descripción detallada de lo que debe contener la imagen (ej. "texture of cracked mud", "sci-fi metal panel").
        type: El tipo técnico de textura a generar. Esto condiciona al modelo (ej. 'normal' generará un mapa de normales azul/morado).
    """
    pass

def edit_image(asset_id: str, prompt: str):
    """
    Edita una imagen EXISTENTE del proyecto (asset) basándose en una instrucción de texto.
    Por ejemplo: "Hazla más oscura", "Añade óxido", "Cambia el color a rojo".
    Esta operación mantiene la resolución y el aspecto general de la imagen original.

    Args:
        asset_id: El ID del asset (imagen) que quieres editar. Este ID debe provenir de la lista de assets disponibles (o inferido del contexto).
        prompt: La instrucción de edición en lenguaje natural.
    """
    pass

def add_node(type: str, x: float = 0.0, y: float = 0.0, label: Optional[str] = None):
    """
    Agrega un nuevo nodo al grafo de shaders.
    IMPORTANTE: Usa tipos de nodo válidos de la lista de definiciones (ej. 'add', 'multiply', 'color', 'texture2D', 'mix', 'saturate').
    
    Args:
        type: El tipo de nodo exacto (case-sensitive según definitions).
        x: Posición X en el canvas (0 es el centro).
        y: Posición Y en el canvas.
        label: Etiqueta opcional para mostrar en el nodo (si se omite, usa el default).
    """
    pass

def remove_node(id: str):
    """
    Elimina un nodo existente del grafo.
    
    Args:
        id: El ID único del nodo a eliminar (ej. 'node_12345').
    """
    pass

def connect_nodes(source_node_id: str, source_socket_id: str, target_node_id: str, target_socket_id: str):
    """
    Crea una conexión (cable) entre dos nodos.
    Los sockets deben ser compatibles (ej. float->float, vec3->vec3, o cast válido).
    
    Args:
        source_node_id: ID del nodo origen (vacío para Master Input si aplica).
        source_socket_id: ID del socket de salida (ej. 'out', 'rgb', 'r', 'g', 'b', 'a').
        target_node_id: ID del nodo destino.
        target_socket_id: ID del socket de entrada (ej. 'in', 'a', 'b', 'color', 'alpha').
    """
    pass

def disconnect_nodes(source_node_id: str, source_socket_id: str, target_node_id: str, target_socket_id: str):
    """
    Elimina una conexión existente entre dos nodos.
    
    Args:
        source_node_id: ID del nodo origen.
        source_socket_id: ID del socket de salida.
        target_node_id: ID del nodo destino.
        target_socket_id: ID del socket de entrada.
    """
    pass

def update_node_value(node_id: str, data_key: str, value: Any):
    """
    Actualiza un valor interno de un nodo (ej. un valor numérico, un checkbox, un modo de mezcla).
    NO usar para conectar nodos, usar connect_nodes para eso.
    
    Args:
        node_id: El ID del nodo.
        data_key: La clave del dato (data) a modificar. Ejemplos comunes:
                  - 'value' (para nodos float/color constantes)
                  - 'blendMode' (para nodo Blend: 'Add', 'Multiply', 'Alpha')
                  - 'channel' (para Channel Mask: 'r', 'g')
                  - 'textureAsset' (para Texture Node: ID del asset)
        value: El nuevo valor a establecer.
    """
    pass

def upload_asset(filename: str, description: str):
    """
    Registra un asset (imagen/textura) proporcionado por el usuario (en el mensaje adjunto) para su uso en el grafo.
    Usa esta función SOLO cuando el usuario suba una imagen en el chat actual y pida usarla.
    Si el usuario pide *generar* una imagen, usa generate_image.
    
    Args:
        filename: El nombre del archivo sugerido (ej. 'texture_01.png').
        description: Breve descripción del contenido para referencia.
    """
    pass
