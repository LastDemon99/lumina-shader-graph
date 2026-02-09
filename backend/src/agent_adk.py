import base64
import asyncio
import json
import logging
import os
import uuid
import re
import hashlib
import io
import urllib.parse
from typing import Any, Dict, List, Literal, Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.adk.tools import FunctionTool

from .models import AgentResponse, GraphOperation
from .models import GraphState, Node, Connection
from .asset_store import AssetStore
from .tools.definitions import get_node_definitions
from .tools.linter import validate_graph

load_dotenv()

logger = logging.getLogger(__name__)

try:
    from PIL import Image, ImageOps  # type: ignore
except Exception:  # pragma: no cover
    Image = None  # type: ignore
    ImageOps = None  # type: ignore


_TextureType = Literal[
    "basecolor",
    "normal",
    "specular",
    "roughness",
    "displacement",
    "emission",
    "alpha",
    "sprite_flipbook",
    "environment_map",
]


class _InlineAttachment:
    def __init__(self, mime_type: str, data_b64: str, *, kind: str = "user"):
        self.mime_type = mime_type
        self.data_b64 = data_b64
        self.kind = kind

    def to_data_url(self) -> str:
        return f"data:{self.mime_type};base64,{self.data_b64}"


class _RequestContext:
    def __init__(self, graph: Dict[str, Any], attachments: List[_InlineAttachment]):
        self.graph = graph
        self.attachments = attachments
        self.operations: List[GraphOperation] = []
        self.node_types: Dict[str, str] = {
            str(n.get("id")): str(n.get("type"))
            for n in (graph.get("nodes") or [])
            if isinstance(n, dict) and n.get("id") and n.get("type")
        }
        self.explicit_command: Optional[str] = None
        self.routed_command: Optional[str] = None
        self.allow_generate_image: bool = False
        self.latest_uploaded_asset_id: Optional[str] = None
        self.latest_uploaded_asset_name: Optional[str] = None
        self.latest_uploaded_asset_mime: Optional[str] = None

        # All persisted attachment asset ids (in the same order as attachments)
        self.uploaded_attachment_asset_ids: List[str] = []
        # If set, use this attachment as the default source (overrides heuristics)
        self.selected_attachment_asset_id: Optional[str] = None

        # dataUrl/hash -> assetId mapping (used to avoid embedding base64 in prompts)
        self.asset_id_by_dataurl: Dict[str, str] = {}
        # assetId -> metadata
        self.asset_meta: Dict[str, Dict[str, Any]] = {}

        # Backend lint report (best-effort). Frontend has a richer linter; this is
        # mainly to route obvious broken graphs to the refiner automatically.
        self.linter_errors: List[str] = []

        # Some model/tool-call traces refer to newly created nodes as placeholders
        # like "node_0", "node_1" instead of using the returned ids. We track a
        # per-request mapping to resolve those placeholders back to real node ids.
        self._placeholder_node_map: Dict[str, str] = {}
        self._placeholder_node_counter: int = 0

        # Some model tool-calls use typed placeholders like "texture2D-1" or
        # "metalReflectance-1". Track a per-type ordinal -> real id mapping.
        self._typed_placeholder_map: Dict[str, str] = {}
        self._typed_placeholder_counters: Dict[str, int] = {}

        # Track dynamic IO for customFunction nodes so we can auto-wrap code snippets
        # into a valid `void main(...)` signature.
        self.custom_fn_inputs: Dict[str, List[Dict[str, Any]]] = {}
        self.custom_fn_outputs: Dict[str, List[Dict[str, Any]]] = {}
        for n in (graph.get("nodes") or []):
            try:
                if not isinstance(n, dict):
                    continue
                if str(n.get("type") or "").strip() != "customFunction":
                    continue
                nid = str(n.get("id") or "").strip()
                if not nid:
                    continue
                data = n.get("data") if isinstance(n.get("data"), dict) else {}
                if isinstance(data.get("customInputs"), list):
                    self.custom_fn_inputs[nid] = data.get("customInputs")  # type: ignore
                if isinstance(data.get("customOutputs"), list):
                    self.custom_fn_outputs[nid] = data.get("customOutputs")  # type: ignore
            except Exception:
                continue


class GraphAgentAdk:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")

        self.client = genai.Client(api_key=self.api_key)

        # Configurable Model IDs from ENV
        self.model_id = os.getenv("LUMINA_ADK_MODEL", "gemini-3-flash-preview")
        self.image_model_id = "gemini-3-pro-image-preview"

        persist_dir = os.getenv("LUMINA_ASSET_STORE_DIR")
        self.asset_store = AssetStore(persist_dir=persist_dir)

        # Load node definitions from the lumina-shader-graph repo
        target_path = os.path.join(os.getcwd(), "../lumina-shader-graph/nodes/modules")
        self.nodes_path = os.path.abspath(target_path)

        if not os.path.exists(self.nodes_path):
            logger.warning(
                f"Nodes path not found at {self.nodes_path}. Agent will have no node definitions."
            )
            self.definitions = []
        else:
            self.definitions = get_node_definitions(self.nodes_path)

        # Fast lookup for validation and prompt-building.
        self._definitions_by_type: Dict[str, Any] = {
            str(d.type).strip().lower(): d for d in (self.definitions or []) if getattr(d, "type", None)
        }

        self.definitions_text = self._build_definitions_text()

        # Load instruction packs (Prompt Packs)
        self._instruction_packs: Dict[str, str] = {}
        try:
            repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
            instructions_dir = os.path.join(repo_root, "agent-instructions")
            self._instruction_packs = self._load_instruction_packs(instructions_dir)
        except Exception:
            self._instruction_packs = {}

    def _normalize_mode(self, mode: Optional[str]) -> str:
        """Normalize explicit commands and routed intents into a small stable set.

        This reduces multi-intent conflicts where a slash-command should select a pack
        but still map to the correct behavior.
        """

        m = (mode or "").strip().lower()
        if m.startswith("/"):
            m = m[1:]

        mapping = {
            # packs
            "architect": "architect",
            "generategraph": "architect",
            "newgraph": "architect",
            "editor": "editor",
            "edit": "editor",
            "editgraph": "editor",
            "refiner": "refiner",
            "refine": "refiner",
            "repair": "refiner",
            "lint": "refiner",
            "consultant": "consultant",
            "ask": "consultant",
            "help": "consultant",
            # feature toggles
            "generateimage": "generateimage",
        }
        return mapping.get(m, m)

    def _load_instruction_packs(self, instructions_dir: str) -> Dict[str, str]:
        packs: Dict[str, str] = {}
        if not instructions_dir or not os.path.isdir(instructions_dir):
            return packs

        mapping = {
            "architect": "shader-architect.md",
            "editor": "shader-editor.md",
            "refiner": "shader-refiner.md",
            "consultant": "shader-consultant.md",
        }

        for key, filename in mapping.items():
            path = os.path.join(instructions_dir, filename)
            if not os.path.isfile(path): continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw = f.read()
                packs[key] = self._strip_instruction_noise(raw)
            except Exception: continue
        return packs

    def _strip_instruction_noise(self, text: str) -> str:
        """Remove sections that conflict with ADK tool-calling."""
        src = str(text or "")
        if not src.strip(): return ""
        lower = src.lower()
        cut_markers = ["# output format", "## output format", "output format", "# software_context"]
        cut_at = None
        for m in cut_markers:
            idx = lower.find(m)
            if idx >= 0: cut_at = idx if cut_at is None else min(cut_at, idx)
        if cut_at is not None: src = src[:cut_at]
        src = src.replace("{{SOFTWARE_CONTEXT}}", "").replace("{{AVAILABLE_NODES}}", "")
        return src.strip()

    def _build_definitions_text(self) -> str:
        lines: List[str] = []
        for d in self.definitions:
            inputs = ", ".join([f"{i.id}({i.type})" for i in d.inputs])
            outputs = ", ".join([f"{o.id}({o.type})" for o in d.outputs])
            lines.append(f"- {d.type}: Inputs[{inputs}] -> Outputs[{outputs}]")
        return "\n".join(lines)

    def _extract_attachments(self, messages_data: List[Dict[str, Any]]) -> List[_InlineAttachment]:
        attachments: List[_InlineAttachment] = []
        for msg in messages_data:
            content_raw = msg.get("content")
            if not isinstance(content_raw, list): continue

            preview_context = False
            for item in content_raw:
                if not isinstance(item, dict): continue

                t = item.get("text")
                if isinstance(t, str) and t.strip():
                    # Frontend uses these markers to denote node preview captures.
                    tt = t.strip()
                    if tt.startswith("NODE_PREVIEW_SEQUENCE") or tt.startswith("NODE_PREVIEW"):
                        preview_context = True
                    else:
                        preview_context = False

                inline = item.get("inline_data")
                if not isinstance(inline, dict): continue
                mime = inline.get("mime_type")
                data = inline.get("data")
                if isinstance(mime, str) and isinstance(data, str) and mime and data:
                    attachments.append(_InlineAttachment(mime_type=mime, data_b64=data, kind=("preview" if preview_context else "user")))
        return attachments

    def _extract_preview_attachments_from_last_user_message(self, messages_data: List[Dict[str, Any]]) -> List[_InlineAttachment]:
        last_user = next((m for m in reversed(messages_data or []) if m.get("role") == "user"), None)
        if not last_user:
            return []
        content_raw = last_user.get("content")
        if not isinstance(content_raw, list):
            return []

        preview_context = False
        previews: List[_InlineAttachment] = []
        for item in content_raw:
            if not isinstance(item, dict):
                continue
            t = item.get("text")
            if isinstance(t, str) and t.strip():
                tt = t.strip()
                if tt.startswith("NODE_PREVIEW_SEQUENCE") or tt.startswith("NODE_PREVIEW"):
                    preview_context = True
                else:
                    preview_context = False
            inline = item.get("inline_data")
            if not (preview_context and isinstance(inline, dict)):
                continue
            mime = inline.get("mime_type")
            data = inline.get("data")
            if isinstance(mime, str) and isinstance(data, str) and mime and data:
                previews.append(_InlineAttachment(mime_type=mime, data_b64=data, kind="preview"))

        return previews

    def _guess_texture_role(self, raw: bytes, mime_type: str) -> tuple[str, float]:
        """Best-effort texture role guess from image bytes.

        Returns (role, confidence) where role is one of:
        - basecolor
        - ambient_occlusion
        - normal
        - mask
        - unknown

        This is intentionally heuristic and conservative; it is used to add
        lightweight hints to the LLM prompt.
        """

        if not raw or not (mime_type or "").lower().startswith("image/"):
            return ("unknown", 0.0)
        if Image is None:
            return ("unknown", 0.0)

        try:
            im = Image.open(io.BytesIO(raw))
            im = ImageOps.exif_transpose(im) if ImageOps is not None else im
            im = im.convert("RGB")
            im = im.resize((64, 64))
            px = list(im.getdata())
        except Exception:
            return ("unknown", 0.0)

        if not px:
            return ("unknown", 0.0)

        # Basic channel statistics (0..255)
        n = float(len(px))
        mr = sum(p[0] for p in px) / n
        mg = sum(p[1] for p in px) / n
        mb = sum(p[2] for p in px) / n

        # Saturation proxy: average per-pixel max-min
        sat = sum((max(p) - min(p)) for p in px) / n

        # Grayscale-ish if low sat.
        is_gray = sat < 10.0

        # Normal maps are often bluish/purple: high blue mean, r/g near mid.
        if mb > 140.0 and 80.0 <= mr <= 170.0 and 80.0 <= mg <= 170.0 and sat > 12.0:
            return ("normal", 0.75)

        if is_gray:
            # Many grayscale textures exist (AO/roughness/metallic/height). If it's gray,
            # prefer AO as a default hint because it's commonly paired with basecolor.
            # We'll label as AO with modest confidence and let the LLM override if needed.
            return ("ambient_occlusion", 0.55)

        # Otherwise assume basecolor (albedo)
        return ("basecolor", 0.60)

    def _lint_graph_dict(self, graph: Dict[str, Any]) -> List[str]:
        try:
            nodes_raw = graph.get("nodes") or []
            conns_raw = graph.get("connections") or []
            nodes: List[Node] = []
            conns: List[Connection] = []
            for n in nodes_raw:
                if isinstance(n, dict):
                    try:
                        nodes.append(Node(**n))
                    except Exception:
                        continue
            for c in conns_raw:
                if isinstance(c, dict):
                    try:
                        conns.append(Connection(**c))
                    except Exception:
                        continue
            gs = GraphState(nodes=nodes, connections=conns)
            return validate_graph(gs, self.definitions or [])
        except Exception:
            return []

    def _is_lint_critical(self, errors: List[str]) -> bool:
        for e in errors or []:
            s = str(e or "").strip().lower()
            if not s:
                continue
            if s.startswith("critical"):
                return True
            if "cycle detected" in s:
                return True
            if "will not render" in s:
                return True
            if "missing 'fragment master'" in s:
                return True
        return False

    def _should_retry_empty_ops(self, *, mode: str, user_text: str, ops: List[GraphOperation]) -> bool:
        """Decide whether to auto-retry when the agent returned no (or too few) meaningful ops.

        We only retry in non-consultant modes to avoid looping on Q&A prompts.
        """

        if (mode or "").strip().lower() == "consultant":
            return False
        kinds = [str(getattr(op, "op", "") or "").strip() for op in (ops or [])]

        # Ignore asset uploads and preview requests when deciding if we actually applied edits.
        meaningful = [k for k in kinds if k and k not in ("upload_asset", "request_previews")]

        # If there's any wiring/editing op, we consider this non-empty.
        has_wiring_or_edit = any(
            k in (
                "add_connection",
                "remove_connection",
                "update_node_data",
                "remove_node",
                "move_node",
            )
            for k in meaningful
        )
        if has_wiring_or_edit:
            return False

        # Sparse-op heuristic: a single add_node (optionally plus upload_asset) is often a
        # failure mode after previews, where the model starts but doesn't wire anything.
        add_nodes = sum(1 for k in meaningful if k == "add_node")
        if meaningful and add_nodes > 1:
            return False

        # At this point we consider it effectively empty: nothing changed in the rendered graph.
        if meaningful and add_nodes <= 1:
            pass
        elif meaningful:
            # Some other odd single op type; treat as non-empty.
            return False
        if not (user_text or "").strip():
            return False

        # Heuristic: if it's clearly a question and doesn't mention actions, don't retry.
        t = (user_text or "").strip().lower()
        actionish = any(k in t for k in ("add ", "añad", "agreg", "create", "crear", "connect", "conect", "fix", "arregl", "rotate", "rot", "move", "mueve", "cambia", "change", "edit", "edita"))
        looks_like_question = ("?" in t) or t.startswith(("por que", "porque", "why ", "how ", "como "))
        if looks_like_question and not actionish:
            return False

        raw = os.getenv("LUMINA_RETRY_EMPTY_OPS", "1")
        try:
            n = int(str(raw).strip())
        except Exception:
            n = 1
        return n > 0

    def _template_flag_wave_ops(self, ctx: _RequestContext, *, user_text: str) -> List[GraphOperation]:
        """Deterministic fallback for a simple flag waving vertex displacement.

        Triggered only when the LLM returns 0 meaningful ops for a clearly action-ish request.
        """

        t = (user_text or "").strip().lower()
        if not t:
            return []

        is_flag = any(k in t for k in ("flag", "bandera"))
        is_motion = any(k in t for k in ("wave", "waving", "movement", "move", "mover", "wind", "viento", "flutter", "rippl"))
        if not (is_flag and is_motion):
            return []

        existing_ids: set[str] = set()
        for n in (ctx.graph.get("nodes") or []):
            if isinstance(n, dict) and n.get("id") is not None:
                existing_ids.add(str(n.get("id")))
        existing_ids.update(set((ctx.node_types or {}).keys()))

        vertex_master_id = next((nid for nid, tp in (ctx.node_types or {}).items() if str(tp).strip().lower() == "vertex"), None)
        if not vertex_master_id:
            # If the graph truly lacks masters, we can't safely proceed.
            return []

        def _new_id(prefix: str) -> str:
            while True:
                cand = f"{prefix}_{uuid.uuid4().hex[:10]}"
                if cand not in existing_ids:
                    existing_ids.add(cand)
                    return cand

        def add(node_type: str, x: float, y: float, label: Optional[str] = None) -> str:
            nid = _new_id("node")
            ctx.node_types[str(nid)] = str(node_type)
            ops.append(GraphOperation(op="add_node", nodeId=nid, nodeType=node_type, x=x, y=y, label=label))
            return nid

        def conn(src: str, ss: str, dst: str, ts: str) -> None:
            ops.append(
                GraphOperation(
                    op="add_connection",
                    connectionId=_new_id("conn"),
                    sourceNodeId=src,
                    sourceSocketId=ss,
                    targetNodeId=dst,
                    targetSocketId=ts,
                )
            )

        ops: List[GraphOperation] = []

        # Nodes
        n_time = add("time", -520, 0, "Time")
        n_uv = add("uv", -520, 140, "UV")
        n_split = add("split", -340, 140, "Split")
        n_speed = add("float", -520, -120, "Speed")
        n_freq = add("float", -520, -220, "Frequency")
        n_amp = add("float", -520, -320, "Amplitude")
        n_mul_time = add("multiply", -160, -120, "t*speed")
        n_mul_uv = add("multiply", -160, 80, "uvx*freq")
        n_add_phase = add("add", 40, -20, "phase")
        n_wave = add("noiseSineWave", 240, -20, "wave")
        n_mul_amp = add("multiply", 430, -120, "wave*amp")
        n_mul_mask = add("multiply", 430, 10, "mask")
        n_pos = add("position", -520, 320, "Position")
        n_nrm = add("normal", -520, 460, "Normal")
        n_mul_offset = add("multiply", 640, 120, "normal*wave")
        n_add_pos = add("add", 840, 220, "displaced")

        # Configure constants and spaces
        ops.append(GraphOperation(op="update_node_data", nodeId=n_speed, dataKey="value", dataValue=1.0))
        ops.append(GraphOperation(op="update_node_data", nodeId=n_freq, dataKey="value", dataValue=6.0))
        ops.append(GraphOperation(op="update_node_data", nodeId=n_amp, dataKey="value", dataValue=0.15))
        ops.append(GraphOperation(op="update_node_data", nodeId=n_pos, dataKey="space", dataValue="Object"))
        ops.append(GraphOperation(op="update_node_data", nodeId=n_nrm, dataKey="space", dataValue="Object"))

        # Wiring
        conn(n_uv, "out", n_split, "in")
        # phase = time*out*speed + uvx*freq
        conn(n_time, "out", n_mul_time, "a")
        conn(n_speed, "out", n_mul_time, "b")
        conn(n_split, "r", n_mul_uv, "a")
        conn(n_freq, "out", n_mul_uv, "b")
        conn(n_mul_time, "out", n_add_phase, "a")
        conn(n_mul_uv, "out", n_add_phase, "b")
        # wave = sin(phase) (noiseSineWave)
        conn(n_add_phase, "out", n_wave, "in")
        # waveAmp = wave * amplitude
        conn(n_wave, "out", n_mul_amp, "a")
        conn(n_amp, "out", n_mul_amp, "b")
        # mask by uvx so pole edge stays attached
        conn(n_mul_amp, "out", n_mul_mask, "a")
        conn(n_split, "r", n_mul_mask, "b")
        # offset = normal * waveMasked
        conn(n_nrm, "out", n_mul_offset, "a")
        conn(n_mul_mask, "out", n_mul_offset, "b")
        # displaced = position + offset
        conn(n_pos, "out", n_add_pos, "a")
        conn(n_mul_offset, "out", n_add_pos, "b")
        # to vertex master
        conn(n_add_pos, "out", str(vertex_master_id), "position")

        return ops

    def _try_encode_mp4_from_image_bytes(self, frames: list[bytes], *, fps: int = 2) -> Optional[bytes]:
        # Optional dependency path; if not present, we'll fall back to sending a few frames.
        if not frames or len(frames) < 2:
            return None
        if Image is None:
            return None
        try:
            import numpy as np  # type: ignore
            import imageio  # type: ignore
            import tempfile
        except Exception:
            return None

        arrays = []
        for raw in frames:
            try:
                im = Image.open(io.BytesIO(raw))
                im = ImageOps.exif_transpose(im) if ImageOps is not None else im
                im = im.convert("RGB")
                arrays.append(np.asarray(im))
            except Exception:
                continue

        if len(arrays) < 2:
            return None

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                tmp_path = f.name
            writer = imageio.get_writer(tmp_path, fps=int(fps), codec="libx264")
            try:
                for arr in arrays:
                    writer.append_data(arr)
            finally:
                writer.close()
            with open(tmp_path, "rb") as f:
                return f.read()
        except Exception:
            return None
        finally:
            if tmp_path:
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

    def _preview_inline_parts(self, messages_data: List[Dict[str, Any]], *, max_items: int) -> list[types.Part]:
        if max_items <= 0:
            return []

        previews = self._extract_preview_attachments_from_last_user_message(messages_data)
        if not previews:
            return []

        # Try MP4 encoding when user asked for sequence/video.
        last_text = ""
        for m in reversed(messages_data or []):
            if m.get("role") != "user":
                continue
            c = m.get("content")
            if isinstance(c, str):
                last_text = c
            elif isinstance(c, list):
                last_text = "\n".join([p.get("text", "") for p in c if isinstance(p, dict) and p.get("text")])
            break
        wants_video = any(k in (last_text or "").lower() for k in ("video", "mp4", "frames", "secuencia"))

        if wants_video:
            try:
                raw_frames = [base64.b64decode(p.data_b64) for p in previews if (p.mime_type or "").lower().startswith("image/")]
            except Exception:
                raw_frames = []
            mp4 = self._try_encode_mp4_from_image_bytes(raw_frames[:12], fps=2)
            if mp4:
                return [
                    types.Part(text=f"NODE_PREVIEW_VIDEO frames={min(len(raw_frames), 12)} fps=2"),
                    types.Part(inline_data=types.Blob(data=mp4, mime_type="video/mp4")),
                ]

        # Fallback: attach a few preview frames as images.
        parts: list[types.Part] = [types.Part(text=f"NODE_PREVIEW_FRAMES count={min(len(previews), max_items)}")]
        added = 0
        for p in previews:
            if added >= max_items:
                break
            if not (p.mime_type or "").lower().startswith("image/"):
                continue
            try:
                raw = base64.b64decode(p.data_b64)
                resized, out_mime = self._resize_image_for_model(raw, p.mime_type, max_dim=768)
                parts.append(types.Part(inline_data=types.Blob(data=resized, mime_type=out_mime)))
                added += 1
            except Exception:
                continue

        return parts

    def _resize_image_for_model(self, raw: bytes, mime_type: str, *, max_dim: int = 768) -> tuple[bytes, str]:
        """Downscale image bytes for model input only.

        Keeps original asset bytes intact in AssetStore; this is used only when building
        multimodal Content for Gemini.

        If Pillow isn't available or the image can't be decoded, returns the original bytes.
        """

        if not raw:
            return raw, mime_type

        if Image is None or ImageOps is None:
            logger.warning("Pillow not installed; sending original image bytes to model")
            return raw, mime_type

        mt = (mime_type or "").lower().strip()
        try:
            im = Image.open(io.BytesIO(raw))
            im = ImageOps.exif_transpose(im)
        except Exception:
            return raw, mime_type

        w, h = im.size
        if not w or not h:
            return raw, mime_type

        if max(w, h) <= int(max_dim):
            return raw, mime_type

        scale = float(max_dim) / float(max(w, h))
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))

        try:
            resample = getattr(Image, "Resampling", Image).LANCZOS
        except Exception:
            resample = getattr(Image, "LANCZOS", 1)

        im2 = im.resize((new_w, new_h), resample=resample)

        has_alpha = ("A" in (im2.getbands() or ())) or (im2.mode in ("RGBA", "LA"))

        # Preserve JPEG when possible; otherwise default to PNG.
        if mt in ("image/jpeg", "image/jpg") and not has_alpha:
            out_mime = "image/jpeg"
            fmt = "JPEG"
        else:
            out_mime = "image/png"
            fmt = "PNG"

        out = io.BytesIO()
        save_kwargs: Dict[str, Any] = {}
        if fmt == "JPEG":
            save_kwargs.update({"quality": 90, "optimize": True})
            if im2.mode not in ("RGB",):
                im2 = im2.convert("RGB")
        else:
            if im2.mode in ("P",):
                im2 = im2.convert("RGBA" if has_alpha else "RGB")

        try:
            im2.save(out, format=fmt, **save_kwargs)
            return out.getvalue(), out_mime
        except Exception:
            return raw, mime_type

    def _should_attach_graph_images(self, user_text: str) -> bool:
        t = (user_text or "").lower()
        keywords = (
            "edit image",
            "edit texture",
            "editar imagen",
            "editar textura",
            "pixel",
            "pixels",
            "inpaint",
            "outpaint",
            "mask",
            "mascara",
            "máscara",
            "que ves",
            "qué ves",
            "describe",
            "describir",
            "analiza",
            "análisis",
            "preview",
            "captura",
            "screenshot",
            "render",
        )
        return any(k in t for k in keywords)

    def _extract_focus_node_ids_from_text(self, text: str) -> list[str]:
        # Frontend marker: `FOCUS_NODE_IDS: id1,id2,id3`
        try:
            m = re.search(r"^FOCUS_NODE_IDS:\s*(?P<ids>.+)\s*$", text or "", flags=re.MULTILINE)
            if not m:
                return []
            raw = m.group("ids")
            ids = [p.strip() for p in raw.split(",")]
            return [i for i in ids if i]
        except Exception:
            return []

    def _try_parse_asset_id_from_url(self, url: str) -> Optional[str]:
        if not url:
            return None
        try:
            parsed = urllib.parse.urlparse(url)
            path = parsed.path or ""
            m = re.search(r"/api/v1/assets/(?P<asset_id>[A-Za-z0-9_-]+)$", path)
            return str(m.group("asset_id")) if m else None
        except Exception:
            return None

    def _collect_graph_texture_asset_ids(self, ctx: _RequestContext, focus_node_ids: list[str]) -> list[tuple[str, str]]:
        focus_set = set(focus_node_ids or [])
        out: list[tuple[str, str]] = []
        seen: set[tuple[str, str]] = set()

        def add(node_id: str, asset_id: str) -> None:
            if not node_id or not asset_id:
                return
            key = (node_id, asset_id)
            if key in seen:
                return
            seen.add(key)
            out.append(key)

        # 1) Prefer assets discovered from graph data: URLs during normalization.
        for asset_id, meta in (ctx.asset_meta or {}).items():
            origin = str((meta or {}).get("origin") or "")
            if not origin.startswith("graph:"):
                continue
            # origin example: graph:<nodeId>.textureAsset
            try:
                rest = origin.split("graph:", 1)[1]
                node_id = rest.split(".", 1)[0]
            except Exception:
                continue
            if focus_set and node_id not in focus_set:
                continue
            add(node_id, asset_id)

        # 2) Also scan graph for non-data URLs that might reference our own asset endpoint.
        graph = ctx.graph or {}
        nodes = graph.get("nodes") or []
        if isinstance(nodes, list):
            for n in nodes:
                if not isinstance(n, dict):
                    continue
                node_id = str(n.get("id") or "")
                if not node_id:
                    continue
                if focus_set and node_id not in focus_set:
                    continue
                data = n.get("data") if isinstance(n.get("data"), dict) else {}
                tex = data.get("textureAsset")
                if not isinstance(tex, str) or not tex:
                    continue
                if tex.startswith("data:"):
                    continue
                if tex.startswith("http://") or tex.startswith("https://") or tex.startswith("/"):
                    asset_id = self._try_parse_asset_id_from_url(tex)
                    if asset_id:
                        add(node_id, asset_id)
                else:
                    # Possibly a raw assetId.
                    add(node_id, tex)

        return out

    def _recover_graph_texture_parts(self, ctx: _RequestContext, user_text: str, *, max_images: int) -> list[types.Part]:
        if max_images <= 0:
            return []
        if not self._should_attach_graph_images(user_text):
            return []

        focus_ids = self._extract_focus_node_ids_from_text(user_text)
        candidates = self._collect_graph_texture_asset_ids(ctx, focus_ids)
        if not candidates:
            return []

        parts: list[types.Part] = []
        count = 0
        for node_id, asset_id in candidates:
            if count >= max_images:
                break
            rec = self.asset_store.get(asset_id)
            if not rec or not rec.data:
                continue
            if not str(rec.mime_type or "").lower().startswith("image/"):
                continue
            try:
                resized, out_mime = self._resize_image_for_model(rec.data, rec.mime_type, max_dim=768)
                parts.append(types.Part(text=f"GRAPH_TEXTURE nodeId={node_id} assetId={asset_id}"))
                parts.append(types.Part(inline_data=types.Blob(data=resized, mime_type=out_mime)))
                count += 1
            except Exception:
                continue

        return parts

    def _graph_asset_id(self, ctx: _RequestContext, data_url: str, *, origin: str, name: str = "asset.png") -> Optional[str]:
        """Map a data:...;base64 URL to a stable assetId in AssetStore and return it."""

        s = str(data_url or "")
        if not s.startswith("data:"):
            return None
        if s in ctx.asset_id_by_dataurl:
            return ctx.asset_id_by_dataurl[s]

        m = re.match(r"^data:([^;]+);base64,(.*)$", s, flags=re.IGNORECASE | re.DOTALL)
        if not m:
            return None
        mime = str(m.group(1) or "application/octet-stream")
        b64 = m.group(2) or ""

        try:
            raw = base64.b64decode(b64)
            # Stable ID via hashing decoded bytes (cheaper than hashing huge data URLs)
            h = hashlib.sha256(raw).hexdigest()[:16]
            asset_id = f"asset_{h}"
            self.asset_store.put(asset_id=asset_id, data=raw, mime_type=mime, name=name, description=origin)
        except Exception:
            # If decoding fails, still return a ref id (model can reference it, but retrieval may fail).
            h = hashlib.sha256(s.encode("utf-8", errors="ignore")).hexdigest()[:16]
            asset_id = f"asset_{h}"

        ctx.asset_id_by_dataurl[s] = asset_id
        ctx.asset_meta[asset_id] = {"mime": mime, "name": name, "origin": origin, "b64_len": len(b64)}
        return asset_id

    def _normalized_graph_prompt(self, ctx: _RequestContext) -> str:
        """Normalized, token-efficient graph context.

        Emits a single deterministic structure (no modes) using CSV-style tables:
        - nodes.csv
        - node_inputs.csv
        - node_outputs.csv
        - node_data.csv (variable values only)
        - connections.csv
        - assets.csv (dataurl->assetId mapping)
        """

        graph = ctx.graph or {}
        nodes = graph.get("nodes") or []
        conns = graph.get("connections") or []

        # Omit app default master nodes from the large CSV context.
        # They are already mandated by the system instructions and inflate tokens.
        def _is_master_node(n: Any) -> bool:
            if not isinstance(n, dict):
                return False
            t = str(n.get("type") or "").strip().lower()
            i = str(n.get("id") or "").strip().lower()
            return t in ("vertex", "output") or i in ("vertex", "output")

        filtered_nodes = [n for n in nodes if not _is_master_node(n)]

        defs_by_type: Dict[str, Any] = {d.type: d for d in (self.definitions or [])}

        def fmt(v: Any) -> str:
            if v is None:
                return ""
            if isinstance(v, bool):
                return "1" if v else "0"
            if isinstance(v, (int, float)):
                return str(v)
            s = str(v)
            return s.replace("\n", " ").replace("\r", " ").strip()

        lines: List[str] = []
        lines.append("Estructura normalizada")
        lines.append("")

        # nodes.csv
        lines.append("nodes.csv")
        lines.append("id,type,label,x,y")
        for n in filtered_nodes:
            if not isinstance(n, dict):
                continue
            lines.append(",".join([
                fmt(n.get("id")),
                fmt(n.get("type")),
                fmt(n.get("label") or ""),
                fmt(n.get("x")),
                fmt(n.get("y")),
            ]))

        # node_inputs.csv / node_outputs.csv
        # Compactness rule: only emit sockets for customFunction (dynamic) or unknown node types.
        lines.append("")
        lines.append("node_inputs.csv")
        lines.append("nodeId,id,type")

        node_inputs_rows: List[str] = []
        node_outputs_rows: List[str] = []

        def _custom_sockets(node: Dict[str, Any], kind: str) -> Optional[List[Dict[str, Any]]]:
            data = node.get("data") if isinstance(node.get("data"), dict) else {}
            if not isinstance(data, dict):
                return None
            key = "customInputs" if kind == "inputs" else "customOutputs"
            raw = data.get(key)
            if isinstance(raw, list) and all(isinstance(x, dict) for x in raw):
                return raw  # type: ignore
            return None

        for n in filtered_nodes:
            if not isinstance(n, dict):
                continue
            node_id = fmt(n.get("id"))
            node_type = fmt(n.get("type"))
            if not node_id or not node_type:
                continue

            is_custom = node_type == "customFunction"
            is_unknown = defs_by_type.get(node_type) is None
            if not (is_custom or is_unknown):
                continue

            if is_custom:
                ins = _custom_sockets(n, "inputs") or []
                outs = _custom_sockets(n, "outputs") or []
            else:
                d = defs_by_type.get(node_type)
                ins = [i.model_dump() for i in getattr(d, "inputs", [])] if d else []
                outs = [o.model_dump() for o in getattr(d, "outputs", [])] if d else []

            for s in ins:
                node_inputs_rows.append(",".join([node_id, fmt(s.get("id")), fmt(s.get("type"))]))
            for s in outs:
                node_outputs_rows.append(",".join([node_id, fmt(s.get("id")), fmt(s.get("type"))]))

        lines.extend(node_inputs_rows[:5000])

        lines.append("")
        lines.append("node_outputs.csv")
        lines.append("nodeId,id,type")
        lines.extend(node_outputs_rows[:5000])

        # node_data.csv (only variable values)
        lines.append("")
        lines.append("node_data.csv")
        lines.append("nodeId,key,value")
        for n in filtered_nodes:
            if not isinstance(n, dict):
                continue
            node_id = fmt(n.get("id"))
            if not node_id:
                continue
            data = n.get("data") if isinstance(n.get("data"), dict) else {}
            if not isinstance(data, dict) or not data:
                continue

            # 1) inputValues (preferred for parameters)
            iv = data.get("inputValues")
            if isinstance(iv, dict):
                for k, v in list(iv.items())[:80]:
                    if v is None:
                        continue
                    if isinstance(v, (dict, list)):
                        continue
                    lines.append(",".join([node_id, fmt(k), fmt(v)]))

            # 2) common non-inputValues fields (assets, enums)
            for k in ("value", "textureType", "space", "samplerWrap", "samplerFilter"):
                if k in data and data.get(k) is not None and not isinstance(data.get(k), (dict, list)):
                    lines.append(",".join([node_id, k, fmt(data.get(k))]))

            # 3) textureAsset: map dataurl -> assetId
            tex = data.get("textureAsset")
            if isinstance(tex, str) and tex.startswith("data:"):
                asset_id = self._graph_asset_id(ctx, tex, origin=f"graph:{node_id}.textureAsset", name=f"{node_id}.png")
                if asset_id:
                    lines.append(",".join([node_id, "textureAsset", asset_id]))
            elif isinstance(tex, str) and tex:
                # Already a URL or asset id string
                lines.append(",".join([node_id, "textureAsset", fmt(tex)]))

        # masters_connections.csv (keep a tiny summary so the model knows what's currently wired)
        lines.append("")
        lines.append("masters_connections.csv")
        lines.append("masterNodeId,masterSocketId,sourceNodeId,sourceSocketId")
        for c in conns:
            if not isinstance(c, dict):
                continue
            tgt = fmt(c.get("targetNodeId")).lower()
            if tgt not in ("output", "vertex"):
                continue
            lines.append(",".join([
                fmt(c.get("targetNodeId")),
                fmt(c.get("targetSocketId")),
                fmt(c.get("sourceNodeId")),
                fmt(c.get("sourceSocketId")),
            ]))

        # connections.csv
        lines.append("")
        lines.append("connections.csv")
        lines.append("sourceNodeId,sourceSocketId,targetNodeId,targetSocketId")
        for c in conns:
            if not isinstance(c, dict):
                continue
            # Omit connections involving master nodes to avoid dangling refs after filtering.
            s_id = fmt(c.get("sourceNodeId")).lower()
            t_id = fmt(c.get("targetNodeId")).lower()
            if s_id in ("output", "vertex") or t_id in ("output", "vertex"):
                continue
            lines.append(",".join([
                fmt(c.get("sourceNodeId")),
                fmt(c.get("sourceSocketId")),
                fmt(c.get("targetNodeId")),
                fmt(c.get("targetSocketId")),
            ]))

        # assets.csv
        if ctx.asset_meta:
            lines.append("")
            lines.append("assets.csv")
            lines.append("assetId,mime,name,origin")
            for asset_id, meta in list(ctx.asset_meta.items())[:200]:
                lines.append(",".join([
                    fmt(asset_id),
                    fmt(meta.get("mime")),
                    fmt(meta.get("name")),
                    fmt(meta.get("origin")),
                ]))

        return "\n".join(lines)

    def _build_user_prompt(self, messages_data: List[Dict[str, Any]], ctx: _RequestContext) -> str:
        graph_context = self._normalized_graph_prompt(ctx)
        lines: List[str] = ["CURRENT_GRAPH_STATE_NORMALIZED:", graph_context, ""]

        # Attachments summary (stable + explicit) so the LLM doesn't have to guess.
        if ctx.uploaded_attachment_asset_ids:
            lines.append("ATTACHMENTS:")
            for i, asset_id in enumerate(ctx.uploaded_attachment_asset_ids, start=1):
                meta = ctx.asset_meta.get(asset_id, {}) if isinstance(ctx.asset_meta, dict) else {}
                role = meta.get("role") or "unknown"
                conf = meta.get("roleConfidence")
                conf_s = f"{float(conf):.2f}" if isinstance(conf, (int, float)) else "?"
                name = meta.get("name") or ""
                mime = meta.get("mime") or ""
                lines.append(f"- {i}: asset_id={asset_id} name={name} mime={mime} roleHint={role} roleConfidence={conf_s}")
            lines.append("")

        if ctx.linter_errors:
            lines.append("LINTER_ERRORS:")
            for e in (ctx.linter_errors or [])[:30]:
                lines.append(f"- {e}")
            lines.append("")

        lines.append("CHAT_HISTORY:")

        # attachment index pointer for mapping inline_data parts -> persisted asset ids
        att_i = 0
        for msg in messages_data:
            role = msg.get("role", "user")
            content_raw = msg.get("content")
            if isinstance(content_raw, str):
                lines.append(f"{role.upper()}: {content_raw}")
                continue
            if isinstance(content_raw, list):
                chunk: List[str] = []
                for item in content_raw:
                    if isinstance(item, dict) and item.get("text"): chunk.append(str(item.get("text")))
                    elif isinstance(item, dict) and item.get("inline_data"):
                        inline = item.get("inline_data") or {}
                        # Do NOT embed base64. We store attachments as assets and reference by id.
                        asset_id = ctx.uploaded_attachment_asset_ids[att_i] if att_i < len(ctx.uploaded_attachment_asset_ids) else (ctx.latest_uploaded_asset_id or "<pending>")
                        att_i += 1
                        meta = ctx.asset_meta.get(asset_id, {}) if isinstance(ctx.asset_meta, dict) else {}
                        role = meta.get("role") or "unknown"
                        chunk.append(f"[ATTACHMENT asset_id={asset_id} mime={inline.get('mime_type')} roleHint={role}]" )
                joined = "\n".join(chunk).strip()
                if joined: lines.append(f"{role.upper()}: {joined}")
        return "\n".join(lines)

    def _detect_explicit_command(self, messages_data: List[Dict[str, Any]]) -> Optional[str]:
        last_user = next((msg for msg in reversed(messages_data or []) if msg.get("role") == "user"), None)
        if not last_user: return None
        content = last_user.get("content")
        text = content if isinstance(content, str) else "\n".join([str(p.get("text")) for p in content if isinstance(p, dict) and p.get("text")])
        m = re.match(r"^\s*/([a-zA-Z0-9_-]+)\b", text or "")
        return str(m.group(1)).lower() if m else None

    async def _route_intent(self, text: str) -> str:
        if not text: return "editor"
        router_prompt = f"""Categoriza la intención del usuario para un editor de shader nodes. 
Responde ÚNICAMENTE con una palabra clave en minúsculas:
- architect: si pide crear un shader nuevo, una estructura completa o un efecto desde cero.
- editor: si pide cambiar algo específico, añadir un nodo puntual, conectar elementos o moverlos.
- refiner: si menciona errores, pide arreglar/limpiar el grafo o hacer que funcione.
- consultant: si hace preguntas teóricas, pide explicaciones o no quiere cambios en el grafo.

Usuario: "{text}"
Intención:"""
        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=router_prompt,
                config=types.GenerateContentConfig(temperature=0.0, max_output_tokens=10)
            )
            intent = response.text.strip().lower()
            if intent in ("architect", "editor", "refiner", "consultant"): return intent
        except Exception: pass
        return "editor"

    def _system_instructions(self, mode: Optional[str] = None) -> str:
        cmd = self._normalize_mode(mode)
        if cmd == "architect":
            pack = self._instruction_packs.get("architect", "")
        elif cmd == "consultant":
            pack = self._instruction_packs.get("consultant", "")
        elif cmd == "refiner":
            pack = self._instruction_packs.get("refiner", "")
        else:
            pack = self._instruction_packs.get("editor", "")

        base = f"""You are an advanced AI agent for Lumina Shader Graph (WebGL 2.0).
Your job is to help users create and modify shader graphs by calling TOOLS.

# NODE CATALOG
Valid node types you can create:
{self.definitions_text}

# TOOLING RULES
- Prefer calling tools over describing steps.
- When you create a node via add_node(), store the returned nodeId and use it for follow-up connections/updates.
- If the user attached an image, use it via update_node_value(id, "textureAsset", assetId).
- Do NOT call upload_asset() for user chat attachments; they are already persisted as assets at request start (and emitted as upload_asset operations). Only use upload_asset() when you truly need to re-upload bytes.
- If you need visual confirmation (e.g. the user says the output looks wrong), you may call request_previews() to ask the frontend to attach specific node previews (with previewMode 2d/3d and previewObject sphere/box/quad). IMPORTANT: request ONLY single-frame PNG previews (no sequences/recordings).
- Texture sampling minimalism: prefer `texture2D` + its `rgba` output for simple usage. Only use `sampleTexture2D` when you truly need explicit UV input/sampler override OR you need separate R/G/B/A outputs.
- IMPORTANT: Image generation (generate_image) is ONLY allowed via /generateimage command.
- Do NOT perform pixel-level edits on the backend. Use nodes like 'saturation' or 'blend'.

- Custom Function node code MUST be a full GLSL snippet that defines `void main(...)`.
    - The signature arguments MUST match this node's sockets count/order.
    - Declare outputs as `out <type> <name>` and assign them inside main.
    - If you define helper functions, they must be declared outside main and called from main.
    - If inputs include a `texture` socket, treat it as `sampler2D` in the signature and sample with `texture(tex, uv)`.

- Do NOT perform pixel-level edits on the backend. Use nodes like 'saturation' or 'blend'.

# GRAPH EDITING RULES
- The master node is type 'output' (id may be 'master-node') and its inputs include:
    - color (vec3), smoothness (float), normal (vec3), emission (vec3), occlusion (float), specular (vec3), alpha (float), alphaClip (float)
- Use these sockets correctly:
    - Basecolor/albedo -> output.color
    - Ambient Occlusion (AO) -> output.occlusion (use the texture's 'r' channel or a float conversion)
    - Normal map -> output.normal (tangent space)
    - Metal reflectance/specular color -> output.specular
- Connect final result to the appropriate output inputs; do not multiply specular into basecolor unless explicitly requested.
- Keep responses concise.
"""
        return (base + "\n\n# PACK SPECIFIC INSTRUCTIONS\n" + pack) if pack else base

    def _map_custom_glsl_type(self, t: str) -> str:
        tt = str(t or "").strip()
        if tt == "texture":
            return "sampler2D"
        if tt == "textureArray":
            return "sampler2DArray"
        return tt or "float"

    def _wrap_custom_function_main(self, *, code: str, inputs: List[Dict[str, Any]], outputs: List[Dict[str, Any]]) -> str:
        """Ensure customFunction code defines `void main(...)`.

        If `void main(...) {` already exists, its signature is rewritten to match
        `customInputs`/`customOutputs` (socket count/order) so the graph-generated call
        compiles and wires correctly.

        Otherwise wraps the provided snippet inside a generated main with signature derived
        from `customInputs`/`customOutputs`.
        """

        def _build_sig(ins: List[Dict[str, Any]], outs: List[Dict[str, Any]]) -> str:
            args: List[str] = []
            for s in (ins or []):
                sid = str(s.get("id") or s.get("name") or "").strip()
                st = self._map_custom_glsl_type(str(s.get("type") or "float"))
                if sid:
                    args.append(f"{st} {sid}")
            for s in (outs or []):
                sid = str(s.get("id") or s.get("name") or "").strip()
                st = self._map_custom_glsl_type(str(s.get("type") or "vec3"))
                if sid:
                    args.append(f"out {st} {sid}")
            return f"void main({', '.join(args)})" if args else "void main()"

        src = str(code or "")
        desired_sig = _build_sig(inputs, outputs)

        # If main already exists, normalize its signature (but only for the actual function
        # definition, not a comment string that mentions "void main(...)").
        main_def_pat = re.compile(r"(?ms)^(\s*)void\s+main\s*\((.*?)\)(\s*)\{")
        if re.search(r"(?m)^\s*void\s+main\s*\(", src):
            def _repl(m: re.Match[str]) -> str:
                return f"{m.group(1)}{desired_sig}{m.group(3)}{{"

            fixed, n = main_def_pat.subn(_repl, src, count=1)
            return fixed if n > 0 else src

        # If the snippet seems to contain function definitions, do not try to nest them inside main.
        has_func_def = re.search(
            r"(?m)^\s*(?:float|int|bool|vec[234]|ivec[234]|uvec[234]|mat[234]|void)\s+[A-Za-z_]\w*\s*\([^;]*\)\s*\{",
            src,
        )
        if has_func_def:
            # Add a minimal main so the shader compiles; user/LLM must wire helpers explicitly.
            sig = desired_sig
            body_lines = []
            for s in (outputs or []):
                sid = str(s.get("id") or s.get("name") or "").strip()
                st = self._map_custom_glsl_type(str(s.get("type") or "vec3"))
                if sid:
                    zero = "0.0" if st == "float" else ("vec2(0.0)" if st == "vec2" else ("vec3(0.0)" if st == "vec3" else ("vec4(0.0)" if st == "vec4" else "0.0")))
                    body_lines.append(f"    {sid} = {zero};")
            body = "\n".join(body_lines) if body_lines else "    // TODO: assign outputs\n"
            return (src.rstrip() + "\n\n" + sig + " {\n" + body + "\n}\n")

        sig2 = desired_sig

        snippet = src.strip("\n")
        indented = "\n".join([(f"    {ln}" if ln.strip() else "") for ln in snippet.splitlines()])
        return sig2 + " {\n" + indented + "\n}\n"

    def _build_direct_planner_config(self) -> types.GenerateContentConfig:
        """Config for _direct_plan_ops.

        Uses JSON response mime type when supported by the installed SDK.
        """

        temperature = float(os.getenv("LUMINA_DIRECT_TEMPERATURE", "0.1"))
        max_output_tokens = int(os.getenv("LUMINA_DIRECT_MAX_TOKENS", "2048"))

        try:
            return types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                response_mime_type="application/json",
            )
        except TypeError:
            return types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            )

    def _make_tools(self, ctx: _RequestContext) -> List[FunctionTool]:
        existing_node_ids: set[str] = set()
        for n in (ctx.graph.get("nodes") or []):
            if isinstance(n, dict) and n.get("id") is not None:
                existing_node_ids.add(str(n.get("id")))
        # Include already-known node ids (graph snapshot + any previously added nodes).
        existing_node_ids.update(set((ctx.node_types or {}).keys()))

        existing_conn_ids: set[str] = set()
        for c in (ctx.graph.get("connections") or []):
            if isinstance(c, dict) and c.get("id") is not None:
                existing_conn_ids.add(str(c.get("id")))

        def _max_suffix(existing: set[str], prefix: str) -> int:
            pat = re.compile(rf"^{re.escape(prefix)}_(\\d+)$")
            m = -1
            for s in existing:
                mm = pat.match(str(s))
                if not mm:
                    continue
                try:
                    m = max(m, int(mm.group(1)))
                except Exception:
                    continue
            return m

        counters: Dict[str, int] = {
            "node": _max_suffix(existing_node_ids, "node") + 1,
            "conn": _max_suffix(existing_conn_ids, "conn") + 1,
        }

        def _new_incremental_id(prefix: Literal["node", "conn"]) -> str:
            i = counters.get(prefix, 0)
            while True:
                candidate = f"{prefix}_{i}"
                i += 1
                if prefix == "node":
                    if candidate in existing_node_ids:
                        continue
                    existing_node_ids.add(candidate)
                    counters[prefix] = i
                    return candidate
                else:
                    if candidate in existing_conn_ids:
                        continue
                    existing_conn_ids.add(candidate)
                    counters[prefix] = i
                    return candidate

        def _peek_next_incremental_id(prefix: Literal["node", "conn"]) -> str:
            """Return the next unused id WITHOUT reserving it.

            This is used to map model-guessed ids (e.g. node_8) to an existing master id
            when we prevent duplicate master creation.
            """

            i = int(counters.get(prefix, 0) or 0)
            if prefix == "node":
                while f"node_{i}" in existing_node_ids:
                    i += 1
                return f"node_{i}"
            else:
                while f"conn_{i}" in existing_conn_ids:
                    i += 1
                return f"conn_{i}"

        def _new_asset_id(prefix: str) -> str:
            # Assets are persisted and may live across sessions; keep them globally unique.
            return f"{prefix}_{uuid.uuid4().hex[:10]}"

        def _record_placeholder_node(real_id: str) -> None:
            idx = ctx._placeholder_node_counter
            ctx._placeholder_node_counter += 1
            # Normalize keys to lowercase for robust matching.
            for k in (f"node_{idx}", f"node{idx}"):
                ctx._placeholder_node_map[k.lower()] = str(real_id)

        def _record_typed_placeholder(node_type: Optional[str], real_id: str) -> None:
            t = str(node_type or "").strip()
            if not t:
                return
            # Count starts at 1 for human-style placeholders (type-1, type-2,...)
            n = int(ctx._typed_placeholder_counters.get(t, 0)) + 1
            ctx._typed_placeholder_counters[t] = n
            for k in (f"{t}-{n}", f"{t}_{n}", f"{t}{n}"):
                ctx._typed_placeholder_map[str(k).lower()] = str(real_id)

        def _resolve_node_id(node_id: Any) -> str:
            s = str(node_id or "").strip()
            if not s:
                return s
            # Common master aliases the model may use.
            if s.lower() in ("vertex", "vertex-master", "vertex_master", "vertexnode", "vertex-node"):
                existing_v = next((nid for nid, t in (ctx.node_types or {}).items() if str(t) == "vertex"), None)
                if existing_v:
                    return str(existing_v)
            if s.lower() in ("output", "master", "master-node", "master_node", "output-node", "outputnode"):
                existing_o = next((nid for nid, t in (ctx.node_types or {}).items() if str(t) == "output"), None)
                if existing_o:
                    return str(existing_o)
            mapped = ctx._placeholder_node_map.get(s.lower())
            if mapped:
                return mapped
            mapped2 = ctx._typed_placeholder_map.get(s.lower())
            return mapped2 if mapped2 else s

        def _rgba_to_hex(value: Any) -> Optional[str]:
            if not isinstance(value, (list, tuple)) or len(value) < 3: return None
            rgb = [int(round(max(0.0, min(255.0, float(c) * (255.0 if max(list(map(float, value[:3]))) <= 1.0 else 1.0))))) for c in value[:3]]
            return "#" + "".join(f"{c:02x}" for c in rgb)

        def add_node(type: str, x: float = 0.0, y: float = 0.0, label: Optional[str] = None) -> str:
            # Prevent duplicate master nodes; return existing ids instead.
            if type in ("output", "vertex"):
                existing = next((nid for nid, t in (ctx.node_types or {}).items() if t == type), None)
                if existing:
                    # ADK may batch tool calls; the model sometimes guesses the next node id
                    # (e.g. node_8) for this add_node even though we return an existing master.
                    # Map that guessed id to the existing master so later connect_nodes calls work.
                    try:
                        guessed = _peek_next_incremental_id("node")
                        ctx._placeholder_node_map[str(guessed).lower()] = str(existing)
                    except Exception:
                        pass
                    # Also accept direct aliases like 'vertex'/'output'.
                    ctx._placeholder_node_map[str(type).lower()] = str(existing)
                    _record_typed_placeholder(type, str(existing))
                    return str(existing)
            node_id = _new_incremental_id("node")
            ctx.operations.append(GraphOperation(op="add_node", nodeId=node_id, nodeType=type, x=x, y=y))
            if type: ctx.node_types[str(node_id)] = str(type)
            _record_placeholder_node(node_id)
            _record_typed_placeholder(type, node_id)
            return node_id

        def remove_node(id: str) -> bool:
            rid = _resolve_node_id(id)
            ctx.operations.append(GraphOperation(op="remove_node", nodeId=rid))
            return True

        def connect_nodes(source_node_id: str, source_socket_id: str, target_node_id: str, target_socket_id: str) -> str:
            connection_id = _new_incremental_id("conn")
            s_id = _resolve_node_id(source_node_id)
            t_id = _resolve_node_id(target_node_id)
            ctx.operations.append(GraphOperation(op="add_connection", connectionId=connection_id, sourceNodeId=s_id, sourceSocketId=source_socket_id, targetNodeId=t_id, targetSocketId=target_socket_id))
            return connection_id

        def disconnect_nodes(source_node_id: str, source_socket_id: str, target_node_id: str, target_socket_id: str) -> bool:
            s_id = _resolve_node_id(source_node_id)
            t_id = _resolve_node_id(target_node_id)
            ctx.operations.append(GraphOperation(op="remove_connection", sourceNodeId=s_id, sourceSocketId=source_socket_id, targetNodeId=t_id, targetSocketId=target_socket_id))
            return True

        def update_node_value(node_id: str, data_key: str, value: Any) -> bool:
            if data_key == "label": return True
            rid = _resolve_node_id(node_id)
            node_type = ctx.node_types.get(str(rid))
            if not node_type:
                for n in ctx.graph.get("nodes", []):
                    if str(n.get("id")) == str(rid):
                        node_type = n.get("type")
                        break
            e_key, e_val = data_key, value
            # Alias common mis-namings from LLM outputs.
            if node_type == "metalReflectance" and data_key == "metal":
                e_key = "metalType"

            # Track customFunction IO + auto-wrap code snippets.
            if node_type == "customFunction":
                if data_key == "customInputs" and isinstance(value, list):
                    try:
                        ctx.custom_fn_inputs[str(rid)] = value  # type: ignore
                    except Exception:
                        pass
                if data_key == "customOutputs" and isinstance(value, list):
                    try:
                        ctx.custom_fn_outputs[str(rid)] = value  # type: ignore
                    except Exception:
                        pass
                if data_key == "code" and isinstance(value, str):
                    ins = ctx.custom_fn_inputs.get(str(rid), [])
                    outs = ctx.custom_fn_outputs.get(str(rid), [])
                    e_val = self._wrap_custom_function_main(code=value, inputs=ins, outputs=outs)
            if node_type == "color" and data_key in ("color", "value"):
                if isinstance(value, str) and value.startswith("#"): e_key, e_val = "value", value
                else:
                    h = _rgba_to_hex(value)
                    if h: e_key, e_val = "value", h
            ctx.operations.append(GraphOperation(op="update_node_data", nodeId=rid, dataKey=e_key, dataValue=e_val))
            return True

        def upload_asset(filename: str, description: str) -> str:
            if not ctx.attachments: raise RuntimeError("No attachment found")

            # Idempotency: we already store the first attachment as an asset at request start.
            # If the model calls upload_asset anyway, return that existing assetId instead of
            # duplicating an identical upload + operation.
            existing = ctx.uploaded_attachment_asset_ids or ([] if not ctx.latest_uploaded_asset_id else [ctx.latest_uploaded_asset_id])
            if existing:
                ctx.latest_uploaded_asset_id = existing[0]
                return existing[0]

            asset_id = _new_asset_id("asset")
            att = ctx.attachments[0]
            self.asset_store.put(asset_id=asset_id, data=base64.b64decode(att.data_b64), mime_type=att.mime_type, name=filename, description=description)
            ctx.operations.append(GraphOperation(op="upload_asset", assetId=asset_id, assetName=filename, assetMimeType=att.mime_type))
            return asset_id

        def list_attachments() -> List[Dict[str, Any]]:
            """List persisted attachment assets for this request."""

            ids = ctx.uploaded_attachment_asset_ids or ([] if not ctx.latest_uploaded_asset_id else [ctx.latest_uploaded_asset_id])
            out: List[Dict[str, Any]] = []
            for i, asset_id in enumerate(ids, start=1):
                meta = ctx.asset_meta.get(asset_id, {}) if isinstance(ctx.asset_meta, dict) else {}
                out.append({
                    "index": i,
                    "assetId": asset_id,
                    "name": meta.get("name"),
                    "mime": meta.get("mime"),
                    "selected": bool(ctx.selected_attachment_asset_id == asset_id),
                })
            return out

        def select_attachment(index: int) -> str:
            """Select which attachment should be used as the default texture source (1-based)."""

            ids = ctx.uploaded_attachment_asset_ids or ([] if not ctx.latest_uploaded_asset_id else [ctx.latest_uploaded_asset_id])
            if not ids:
                raise RuntimeError("No attachments available")
            i = int(index)
            if i < 1 or i > len(ids):
                raise RuntimeError(f"Attachment index out of range (1..{len(ids)})")
            ctx.selected_attachment_asset_id = ids[i - 1]
            return ctx.selected_attachment_asset_id

        def generate_image(prompt: str, type: _TextureType) -> str:
            asset_id = _new_asset_id("gen")
            full_prompt = f"Generate a {type} texture. {prompt}"
            img_response = self.client.models.generate_content(
                model=self.image_model_id,
                contents=[types.Content(role="user", parts=[types.Part(text=full_prompt)])],
                config=types.GenerateContentConfig(response_modalities=["IMAGE"], temperature=0.2),
            )
            img_bytes = None
            try:
                for part in img_response.candidates[0].content.parts:
                    if part.inline_data:
                        img_bytes = part.inline_data.data if isinstance(part.inline_data.data, bytes) else base64.b64decode(part.inline_data.data)
                        break
            except Exception: pass
            if not img_bytes: raise RuntimeError("Image model failure")
            self.asset_store.put(asset_id=asset_id, data=img_bytes, mime_type="image/png", name="generated.png", description=f"gen:{type}")
            ctx.operations.append(GraphOperation(op="upload_asset", assetId=asset_id, assetName="generated.png", assetMimeType="image/png"))
            return asset_id

        def request_previews(requests: List[Dict[str, Any]]) -> bool:
            """Ask the frontend to capture and attach node previews.

            NOTE: Recording/sequence previews are disabled for now to avoid long-running
            capture delays. This tool always requests single-frame PNG previews.

            Each request item supports:
            - nodeId: str (required)
            - kind: always forced to 'png'
            - previewMode: '2d' | '3d'
            - previewObject: 'sphere' | 'box' | 'quad'
            - note: str (optional)
            """

            if not isinstance(requests, list) or not requests:
                raise RuntimeError("request_previews: requests must be a non-empty list")

            cleaned: List[Dict[str, Any]] = []
            for r in requests[:3]:
                if not isinstance(r, dict):
                    continue
                node_id = r.get("nodeId")
                if not node_id:
                    continue

                raw_obj = str(r.get("previewObject") or "").strip().lower()
                preview_object = raw_obj if raw_obj in ("sphere", "box", "quad") else "box"

                raw_mode = str(r.get("previewMode") or "").strip().lower()
                preview_mode = raw_mode if raw_mode in ("2d", "3d") else None

                kind = "png"
                item: Dict[str, Any] = {
                    "nodeId": str(node_id),
                    "kind": kind,
                    "previewMode": preview_mode,
                    "previewObject": preview_object,
                    "durationSec": None,
                    "fps": None,
                    "note": r.get("note"),
                }
                cleaned.append(item)

            if not cleaned:
                raise RuntimeError("request_previews: no valid requests")

            ctx.operations.append(GraphOperation(op="request_previews", previewRequests=cleaned))
            return True

        tools = [
            FunctionTool(add_node),
            FunctionTool(remove_node),
            FunctionTool(connect_nodes),
            FunctionTool(disconnect_nodes),
            FunctionTool(update_node_value),
            FunctionTool(upload_asset),
            FunctionTool(list_attachments),
            FunctionTool(select_attachment),
            FunctionTool(request_previews),
        ]
        if ctx.allow_generate_image: tools.append(FunctionTool(generate_image))
        return tools

    def _events_to_text(self, events: List[Any]) -> str:
        t = []
        for e in events:
            try:
                if e.is_final_response():
                    for p in (e.content.parts or []):
                        if p.text: t.append(p.text)
            except Exception: pass
        return "\n".join(t).strip()

    def _fallback_message_from_ops(self, ops: List[GraphOperation]) -> str:
        if not ops:
            return "I didn't get a textual response from the model. Please retry your request."

        upload_ops = [op for op in ops if getattr(op, "op", None) == "upload_asset"]
        if upload_ops and len(ops) == len(upload_ops):
            first = upload_ops[0]
            asset_name = getattr(first, "assetName", None) or "attachment"
            asset_id = getattr(first, "assetId", None) or "(unknown)"
            return f"Asset uploaded: {asset_name} (assetId={asset_id}). Tell me where to use it in the graph (e.g. create a texture node and desaturate it)."

        op_kinds: List[str] = []
        for op in ops:
            k = str(getattr(op, "op", ""))
            if k and k not in op_kinds:
                op_kinds.append(k)
        kinds = ", ".join(op_kinds[:6])
        return f"Applied {len(ops)} operation(s): {kinds}."

    def _optimize_redundant_texture_sampling(self, ops: List[GraphOperation]) -> List[GraphOperation]:
        """Remove redundant sampleTexture2D + uv nodes when only RGBA is needed.

        Pattern optimized (within the same response ops list):
        - add_node texture2D (tex)
        - add_node sampleTexture2D (samp)
        - add_node uv (uv)
        - tex.out -> samp.texture
        - uv.out -> samp.uv
        - samp.rgba -> <target>

        If the sample node is only used via its rgba output, we can connect tex.rgba directly.
        """

        if not ops:
            return ops

        by_id: Dict[str, GraphOperation] = {}
        node_type: Dict[str, str] = {}
        for op in ops:
            if getattr(op, "op", None) == "add_node" and getattr(op, "nodeId", None) and getattr(op, "nodeType", None):
                nid = str(op.nodeId)
                node_type[nid] = str(op.nodeType)
                by_id[nid] = op

        # Gather connections for analysis.
        conns: List[GraphOperation] = [op for op in ops if getattr(op, "op", None) == "add_connection"]

        # Helper indices.
        conns_from: Dict[str, List[GraphOperation]] = {}
        conns_to: Dict[str, List[GraphOperation]] = {}
        for c in conns:
            s = getattr(c, "sourceNodeId", None)
            t = getattr(c, "targetNodeId", None)
            if s:
                conns_from.setdefault(str(s), []).append(c)
            if t:
                conns_to.setdefault(str(t), []).append(c)

        # Find candidate sampleTexture2D nodes.
        candidates = [nid for nid, t in node_type.items() if t == "sampleTexture2D"]
        if not candidates:
            return ops

        remove_node_ids: set[str] = set()
        remove_conn_ids: set[int] = set()  # index in ops
        replacements_by_index: Dict[int, GraphOperation] = {}

        op_index = {id(op): i for i, op in enumerate(ops)}

        for samp_id in candidates:
            # Ensure sample is fed by texture2D.out and uv.out.
            inc = conns_to.get(samp_id, [])
            tex_in = next((c for c in inc if str(getattr(c, "targetSocketId", "")).lower() == "texture"), None)
            uv_in = next((c for c in inc if str(getattr(c, "targetSocketId", "")).lower() == "uv"), None)
            if not tex_in or not uv_in:
                continue

            tex_id = str(getattr(tex_in, "sourceNodeId", ""))
            uv_id = str(getattr(uv_in, "sourceNodeId", ""))

            if node_type.get(tex_id) != "texture2D":
                continue
            if node_type.get(uv_id) != "uv":
                continue
            tex_source_socket = str(getattr(tex_in, "sourceSocketId", "")).lower()
            # texture2D may expose its texture object as 'out' or 'tex' depending on registry.
            if tex_source_socket not in ("out", "tex", "texture"):
                continue
            if str(getattr(uv_in, "sourceSocketId", "")).lower() != "out":
                continue

            # Outgoing from sample: must be only one, from rgba/out.
            out = conns_from.get(samp_id, [])
            if len(out) != 1:
                continue
            rgba_conn = out[0]
            sample_source_socket = str(getattr(rgba_conn, "sourceSocketId", "")).lower()
            if sample_source_socket not in ("rgba", "out"):
                continue

            # If there are any updates targeting sample/uv nodes, don't touch.
            has_updates = any(
                getattr(o, "op", None) == "update_node_data" and str(getattr(o, "nodeId", "")) in (samp_id, uv_id)
                for o in ops
            )
            if has_updates:
                continue

            # Ensure uv is only used for this sample.
            uv_out = conns_from.get(uv_id, [])
            if len(uv_out) != 1 or str(getattr(uv_out[0], "targetNodeId", "")) != samp_id:
                continue

            # Compute replacement connection: tex.rgba -> same target.
            new_conn = GraphOperation(
                op="add_connection",
                connectionId=f"conn_opt_{uuid.uuid4().hex[:10]}",
                sourceNodeId=tex_id,
                sourceSocketId="rgba",
                targetNodeId=getattr(rgba_conn, "targetNodeId", None),
                targetSocketId=getattr(rgba_conn, "targetSocketId", None),
            )

            # Mark removals by index to preserve order.
            for old in (tex_in, uv_in, rgba_conn):
                idx = op_index.get(id(old))
                if idx is not None:
                    remove_conn_ids.add(idx)

            remove_node_ids.add(samp_id)
            remove_node_ids.add(uv_id)

            rgba_idx = op_index.get(id(rgba_conn))
            if rgba_idx is not None:
                replacements_by_index[rgba_idx] = new_conn

        if not remove_node_ids and not remove_conn_ids and not replacements_by_index:
            return ops

        optimized: List[GraphOperation] = []
        for i, op in enumerate(ops):
            # Skip removed add_node ops.
            if getattr(op, "op", None) == "add_node" and str(getattr(op, "nodeId", "")) in remove_node_ids:
                continue
            # Skip any connections involving removed nodes.
            if getattr(op, "op", None) == "add_connection":
                s = str(getattr(op, "sourceNodeId", ""))
                t = str(getattr(op, "targetNodeId", ""))
                if s in remove_node_ids or t in remove_node_ids:
                    continue
            # Drop specific removed connection ops.
            if i in remove_conn_ids:
                # Insert replacement if this was the rgba link.
                if i in replacements_by_index:
                    optimized.append(replacements_by_index[i])
                continue

            optimized.append(op)

        return optimized

    def _validate_ops(self, ctx: _RequestContext, ops: List[GraphOperation]) -> tuple[List[GraphOperation], List[Dict[str, Any]]]:
        """Validate operation references before they reach the frontend.

        Goals:
        - Catch invented/unknown node IDs early (so the frontend doesn't silently drop ops).
        - Validate master-node (output/vertex) socket IDs using known node definitions.

        Behavior:
        - Drops invalid ops (unknown nodeId endpoints, missing required ids).
        - Emits warnings for observability.
        """

        if not ops:
            return ops, []

        base_node_types: Dict[str, str] = dict(ctx.node_types or {})
        known_node_types: Dict[str, str] = dict(base_node_types)
        known_node_ids: set[str] = set(known_node_types.keys())

        vertex_master_id = next((nid for nid, t in known_node_types.items() if str(t).strip().lower() == "vertex"), None)
        output_master_id = next((nid for nid, t in known_node_types.items() if str(t).strip().lower() == "output"), None)

        def _remap_master_alias(nid: str) -> str:
            s = str(nid or "").strip()
            if not s:
                return s
            key = s.lower()
            if key in ("vertex", "vertex-master", "vertex_master", "vertexnode", "vertex-node") and vertex_master_id:
                return str(vertex_master_id)
            if key in ("output", "master", "master-node", "master_node", "outputnode", "output-node") and output_master_id:
                return str(output_master_id)
            return s

        def _node_type(node_id: str) -> str:
            return str(known_node_types.get(node_id) or "").strip().lower()

        def _def_for(node_id: str):
            ntype = _node_type(node_id)
            return self._definitions_by_type.get(ntype)

        def _socket_ids(defn: Any, *, kind: str) -> set[str]:
            if not defn:
                return set()
            sockets = getattr(defn, "outputs" if kind == "out" else "inputs", None) or []
            out: set[str] = set()
            for s in sockets:
                try:
                    sid = str(getattr(s, "id", "") or "").strip()
                    if sid:
                        out.add(sid)
                except Exception:
                    continue
            return out

        warnings: List[Dict[str, Any]] = []
        validated: List[GraphOperation] = []

        # Track customFunction dynamic IO as we walk ops, so we can validate/fix code payloads.
        custom_ins: Dict[str, List[Dict[str, Any]]] = dict(getattr(ctx, "custom_fn_inputs", {}) or {})
        custom_outs: Dict[str, List[Dict[str, Any]]] = dict(getattr(ctx, "custom_fn_outputs", {}) or {})

        def _warn(i: int, reason: str, op: GraphOperation, extra: Optional[Dict[str, Any]] = None) -> None:
            item: Dict[str, Any] = {
                "index": i,
                "op": getattr(op, "op", None),
                "reason": reason,
            }
            if extra:
                item.update(extra)
            warnings.append(item)

        for i, op in enumerate(ops):
            kind = getattr(op, "op", None)

            if kind == "request_previews":
                # Force single-frame previews only (disable recordings).
                prs = getattr(op, "previewRequests", None)
                if isinstance(prs, list):
                    for p in prs:
                        if isinstance(p, dict):
                            p["kind"] = "png"
                            p["durationSec"] = None
                            p["fps"] = None
                        else:
                            try:
                                setattr(p, "kind", "png")
                                if hasattr(p, "durationSec"):
                                    setattr(p, "durationSec", None)
                                if hasattr(p, "fps"):
                                    setattr(p, "fps", None)
                            except Exception:
                                continue
                validated.append(op)
                continue

            if kind == "add_node":
                nid = str(getattr(op, "nodeId", "") or "").strip()
                ntype = str(getattr(op, "nodeType", "") or "").strip()
                if not nid:
                    _warn(i, "add_node missing nodeId", op)
                    continue
                known_node_ids.add(nid)
                if ntype:
                    known_node_types[nid] = ntype
                    if str(ntype).strip().lower() not in self._definitions_by_type:
                        _warn(i, "unknown nodeType (no definition found)", op, {"nodeType": ntype})
                else:
                    _warn(i, "add_node missing nodeType", op, {"nodeId": nid})
                validated.append(op)
                continue

            if kind == "update_node_data":
                nid0 = str(getattr(op, "nodeId", "") or "").strip()
                nid0 = _remap_master_alias(nid0)
                ntype0 = _node_type(nid0)
                k0 = str(getattr(op, "dataKey", "") or "").strip()

                # Track customFunction IO updates.
                if ntype0 == "customfunction":
                    if k0 == "custominputs":
                        dv = getattr(op, "dataValue", None)
                        if isinstance(dv, list):
                            custom_ins[nid0] = dv  # type: ignore
                    if k0 == "customoutputs":
                        dv = getattr(op, "dataValue", None)
                        if isinstance(dv, list):
                            custom_outs[nid0] = dv  # type: ignore
                    if k0 == "code":
                        dv = getattr(op, "dataValue", None)
                        if isinstance(dv, str):
                            ins = custom_ins.get(nid0, [])
                            outs = custom_outs.get(nid0, [])
                            fixed = self._wrap_custom_function_main(code=dv, inputs=ins, outputs=outs)
                            if fixed != dv:
                                try:
                                    setattr(op, "dataValue", fixed)
                                except Exception:
                                    pass

            if kind in ("update_node_data", "move_node", "remove_node"):
                nid = str(getattr(op, "nodeId", "") or "").strip()
                nid = _remap_master_alias(nid)
                if nid and getattr(op, "nodeId", None) != nid:
                    try:
                        setattr(op, "nodeId", nid)
                    except Exception:
                        pass
                if not nid:
                    _warn(i, f"{kind} missing nodeId", op)
                    continue
                if nid not in known_node_ids:
                    _warn(i, f"{kind} references unknown nodeId", op, {"nodeId": nid})
                    continue
                validated.append(op)
                if kind == "remove_node":
                    known_node_ids.discard(nid)
                    known_node_types.pop(nid, None)
                continue

            if kind == "add_connection":
                sid = str(getattr(op, "sourceNodeId", "") or "").strip()
                tid = str(getattr(op, "targetNodeId", "") or "").strip()
                sid2 = _remap_master_alias(sid)
                tid2 = _remap_master_alias(tid)
                if sid2 != sid:
                    try:
                        setattr(op, "sourceNodeId", sid2)
                    except Exception:
                        pass
                if tid2 != tid:
                    try:
                        setattr(op, "targetNodeId", tid2)
                    except Exception:
                        pass
                sid, tid = sid2, tid2
                ss = str(getattr(op, "sourceSocketId", "") or "").strip()
                ts = str(getattr(op, "targetSocketId", "") or "").strip()

                if not sid or not tid:
                    _warn(i, "add_connection missing source/target nodeId", op)
                    continue
                if sid not in known_node_ids or tid not in known_node_ids:
                    _warn(
                        i,
                        "add_connection references unknown nodeId",
                        op,
                        {
                            "sourceNodeId": sid,
                            "targetNodeId": tid,
                            "knownSource": sid in known_node_ids,
                            "knownTarget": tid in known_node_ids,
                        },
                    )
                    continue
                if not ss or not ts:
                    _warn(i, "add_connection missing source/target socketId", op)
                    continue

                # Only hard-validate sockets for master nodes; definitions parsing is
                # regex-based and may be incomplete for arbitrary nodes.
                s_type = _node_type(sid)
                t_type = _node_type(tid)

                if s_type in ("output", "vertex"):
                    sdef = _def_for(sid)
                    valid_out = _socket_ids(sdef, kind="out")
                    if valid_out and ss not in valid_out:
                        _warn(i, "invalid master source socketId", op, {"nodeType": s_type, "socketId": ss})
                        continue
                if t_type in ("output", "vertex"):
                    tdef = _def_for(tid)
                    valid_in = _socket_ids(tdef, kind="in")
                    if valid_in and ts not in valid_in:
                        _warn(i, "invalid master target socketId", op, {"nodeType": t_type, "socketId": ts})
                        continue

                validated.append(op)
                continue

            # remove_connection and other ops are kept as-is (best-effort)
            validated.append(op)

        return validated, warnings

    def _events_to_tool_trace(self, events: List[Any]) -> str:
        tr = []
        for e in events:
            try:
                for fc in e.get_function_calls(): tr.append({"type":"call","name":fc.name,"args":fc.args})
                for fr in e.get_function_responses(): tr.append({"type":"response","name":fr.name,"response":getattr(fr,"response",None)})
            except Exception: pass
        return json.dumps(tr, indent=2)

    def _pick_attachment_asset_id(self, ctx: _RequestContext, user_text: str) -> Optional[str]:
        """Choose which persisted attachment assetId to use by default.

        Heuristic: if the user mentions first/second/third image (English/Spanish), select it.
        Otherwise, default to the first attachment.
        """

        if ctx.selected_attachment_asset_id:
            return ctx.selected_attachment_asset_id

        ids = ctx.uploaded_attachment_asset_ids or ([] if not ctx.latest_uploaded_asset_id else [ctx.latest_uploaded_asset_id])
        if not ids:
            return None

        t = (user_text or "").lower()

        # Common ways users refer to attachment order.
        if re.search(r"\b(3|3ra|3era|tercer|tercera|third)\b", t):
            return ids[2] if len(ids) >= 3 else ids[-1]
        if re.search(r"\b(2|2da|2nda|segund|segunda|second)\b", t):
            return ids[1] if len(ids) >= 2 else ids[0]
        if re.search(r"\b(1|1ra|1era|primer|primera|first)\b", t):
            return ids[0]

        return ids[0]

    async def process_request(self, messages_data: List[Dict[str, Any]], graph: Dict[str, Any]) -> AgentResponse:
        attachments = self._extract_attachments(messages_data)
        ctx = _RequestContext(graph=graph, attachments=attachments)

        # Backend lint (best-effort) for routing + prompt context.
        ctx.linter_errors = self._lint_graph_dict(graph)

        user_attachments = [a for a in (ctx.attachments or []) if getattr(a, "kind", "user") == "user"]

        if user_attachments:
            # Store up to N *user* attachments as assets and reference by ID (never send base64 in text).
            seen_hashes: set[str] = set()
            unique: list[tuple[_InlineAttachment, bytes, str]] = []

            for att in user_attachments:
                if len(unique) >= 3:
                    break
                try:
                    raw = base64.b64decode(att.data_b64)
                except Exception:
                    continue
                if not raw:
                    continue
                h = hashlib.sha256(raw).hexdigest()
                if h in seen_hashes:
                    continue
                seen_hashes.add(h)
                asset_id = f"asset_{h[:16]}"
                unique.append((att, raw, asset_id))

            for idx, (att, raw, asset_id) in enumerate(unique):
                name = f"attachment_{idx+1}.png" if len(unique) > 1 else "attachment.png"

                role, conf = self._guess_texture_role(raw, att.mime_type)
                try:
                    if not self.asset_store.exists(asset_id):
                        self.asset_store.put(
                            asset_id=asset_id,
                            data=raw,
                            mime_type=att.mime_type,
                            name=name,
                            description="chat_attachment",
                        )
                except Exception:
                    pass

                ctx.uploaded_attachment_asset_ids.append(asset_id)
                ctx.asset_meta[asset_id] = {
                    "mime": att.mime_type,
                    "name": name,
                    "origin": "chat_attachment",
                    "b64_len": len(att.data_b64 or ""),
                    "role": role,
                    "roleConfidence": conf,
                }
                ctx.operations.append(
                    GraphOperation(op="upload_asset", assetId=asset_id, assetName=name, assetMimeType=att.mime_type)
                )

            ctx.latest_uploaded_asset_id = ctx.uploaded_attachment_asset_ids[0] if ctx.uploaded_attachment_asset_ids else None

        ctx.explicit_command = self._detect_explicit_command(messages_data)
        
        # Pick the latest *non-empty* user text. Preview follow-up messages often contain
        # only inline images, and using them as last_text breaks intent routing and
        # disables our empty-ops retry heuristics.
        last_text = ""
        for m in reversed(messages_data or []):
            if m.get("role") != "user":
                continue
            c = m.get("content")
            if isinstance(c, str):
                t = c.strip()
                if t:
                    last_text = t
                    break
                continue
            if isinstance(c, list):
                parts = []
                for p in c:
                    if not isinstance(p, dict):
                        continue
                    tx = (p.get("text") or "").strip()
                    if tx:
                        parts.append(tx)
                t = "\n".join(parts).strip()
                if t:
                    last_text = t
                    break

        # If user provided a slash-command, don't spend an extra model call routing intent.
        if ctx.explicit_command:
            mode = self._normalize_mode(ctx.explicit_command)
        else:
            routed = await self._route_intent(last_text)
            mode = self._normalize_mode(routed)

        # If the incoming graph is clearly broken, force the refiner pack unless the
        # user explicitly selected a mode via slash-command.
        if not ctx.explicit_command and self._is_lint_critical(ctx.linter_errors):
            mode = "refiner"
        ctx.allow_generate_image = mode == "generateimage"

        agent = LlmAgent(
            name="lumina_agent",
            model=self.model_id,
            instruction=self._system_instructions(mode),
            tools=self._make_tools(ctx),
            generate_content_config=types.GenerateContentConfig(
                temperature=float(os.getenv("LUMINA_ADK_TEMPERATURE", "0.1")),
                max_output_tokens=int(os.getenv("LUMINA_ADK_MAX_TOKENS", "2048"))
            ),
        )

        try:
            runner = InMemoryRunner(agent=agent)
            # google-adk >= 1.24 defaults to requiring an explicit session; since we
            # construct a new runner per request, enable auto-creation to avoid
            # "Session not found" errors that otherwise yield empty event streams.
            if hasattr(runner, "auto_create_session"):
                runner.auto_create_session = True
            prompt_text = self._build_user_prompt(messages_data, ctx)

            # Multimodal user message: always send text; if there are inline image attachments,
            # attach them as inline_data (downscaled for the model to max 768px).
            parts: List[types.Part] = [types.Part(text=prompt_text)]

            # Keep multimodal payload small and biased toward what the user just asked.
            max_inline_items = 3
            image_inline_count = 0

            # 1) Latest user-provided images (not previews)
            for att in (user_attachments or [])[:max_inline_items]:
                if not (att.mime_type or "").lower().startswith("image/"):
                    continue
                try:
                    raw = base64.b64decode(att.data_b64)
                    resized, out_mime = self._resize_image_for_model(raw, att.mime_type, max_dim=768)
                    parts.append(types.Part(inline_data=types.Blob(data=resized, mime_type=out_mime)))
                    image_inline_count += 1
                except Exception:
                    continue

            remaining = max(0, max_inline_items - image_inline_count)

            # 2) Node previews captured by the frontend (image frames or encoded mp4)
            if remaining:
                preview_parts = self._preview_inline_parts(messages_data, max_items=remaining)
                if preview_parts:
                    parts.extend(preview_parts)
                    # Reserve remaining budget conservatively after adding previews
                    remaining = 0

            # If the user intent implies pixel-level inspection, recover textures referenced
            # in the graph and attach them as inline images (capped to keep requests small).
            if remaining:
                parts.extend(self._recover_graph_texture_parts(ctx, last_text, max_images=remaining))

            events = list(
                runner.run(
                    user_id="user",
                    session_id="session",
                    new_message=types.Content(role="user", parts=parts),
                )
            )

            # Auto-inject attachment asset into the first created texture node, unless the model
            # already set textureAsset explicitly for that node.
            desired_asset_id = self._pick_attachment_asset_id(ctx, last_text)
            if desired_asset_id:
                explicitly_set = {
                    str(op.nodeId)
                    for op in (ctx.operations or [])
                    if op.op == "update_node_data"
                    and str(getattr(op, "dataKey", "") or "").strip().lower() == "textureasset"
                    and op.nodeId
                }

                for op in ctx.operations:
                    if op.op == "add_node" and op.nodeType in ("texture2D", "sampleTexture2D", "texture2DAsset"):
                        if str(op.nodeId) in explicitly_set:
                            continue
                        ctx.operations.append(
                            GraphOperation(
                                op="update_node_data",
                                nodeId=op.nodeId,
                                dataKey="textureAsset",
                                dataValue=desired_asset_id,
                            )
                        )
                        break
            ctx.operations = self._optimize_redundant_texture_sampling(ctx.operations)

            before_validate_len = len(ctx.operations)
            validated_ops, validation_warnings = self._validate_ops(ctx, ctx.operations)
            ctx.operations = validated_ops

            text = self._events_to_text(events)

            # If ADK yields no tool calls and no final text, fall back to a direct JSON planning call.
            # This guards against model/tool-calling incompatibilities.
            upload_ops = [op for op in (ctx.operations or []) if getattr(op, "op", None) == "upload_asset"]
            has_meaningful_ops = bool([op for op in (ctx.operations or []) if getattr(op, "op", None) not in (None, "upload_asset")])
            adk_empty = (not text) and (not has_meaningful_ops)

            direct_thought: Optional[str] = None
            if adk_empty:
                try:
                    direct_message, direct_ops, direct_trace = self._direct_plan_ops(
                        prompt_text=prompt_text,
                        mode=mode,
                        ctx=ctx,
                    )
                    direct_thought = direct_trace

                    # Merge: keep already-emitted upload_asset ops, then append planned ops.
                    merged: List[GraphOperation] = []
                    merged.extend(upload_ops)
                    for op in (direct_ops or []):
                        if getattr(op, "op", None) == "upload_asset":
                            continue
                        merged.append(op)
                    ctx.operations = self._optimize_redundant_texture_sampling(merged)

                    before_validate_len = len(ctx.operations)
                    validated_ops, validation_warnings = self._validate_ops(ctx, ctx.operations)
                    ctx.operations = validated_ops

                    message = direct_message or self._fallback_message_from_ops(ctx.operations)
                    trace = direct_thought if direct_thought is not None else self._events_to_tool_trace(events)

                    if validation_warnings:
                        dropped = max(0, before_validate_len - len(ctx.operations))
                        unknown_ids = []
                        reasons = []
                        for w in validation_warnings:
                            r = w.get("reason")
                            if r and r not in reasons:
                                reasons.append(r)
                            for k in ("nodeId", "sourceNodeId", "targetNodeId"):
                                nid = w.get(k)
                                if nid and nid not in unknown_ids:
                                    unknown_ids.append(nid)
                        short = ", ".join([str(x) for x in unknown_ids[:6]])
                        reason_short = "; ".join([str(x) for x in reasons[:3]])
                        if dropped:
                            message = (
                                f"{message}\n\n[Validator] Dropped {dropped} invalid op(s)."
                                + (f" Reasons: {reason_short}." if reason_short else "")
                                + (f" Unknown nodeIds: {short}." if short else "")
                            )
                        trace = f"{trace}\n\nVALIDATION_WARNINGS:\n{json.dumps(validation_warnings[:60], ensure_ascii=False)}"

                    # If the direct planner produced 0 meaningful ops, auto-retry once with a stricter note.
                    if self._should_retry_empty_ops(mode=mode, user_text=last_text, ops=ctx.operations):
                        try:
                            retry_prompt = (
                                f"{prompt_text}\n\n"
                                "RETRY_NOTE: Your previous response resulted in 0 applied graph operations. "
                                "If the user asked for changes, you MUST return a non-empty operations list. "
                                "Return STRICT JSON with keys 'message' and 'operations'."
                            )
                            retry_message, retry_ops, retry_trace = self._direct_plan_ops(
                                prompt_text=retry_prompt,
                                mode=mode,
                                ctx=ctx,
                            )

                            merged_retry: List[GraphOperation] = []
                            merged_retry.extend(upload_ops)
                            for op in (retry_ops or []):
                                if getattr(op, "op", None) == "upload_asset":
                                    continue
                                merged_retry.append(op)
                            merged_retry = self._optimize_redundant_texture_sampling(merged_retry)

                            before_retry_len = len(merged_retry)
                            validated_retry, retry_warnings = self._validate_ops(ctx, merged_retry)
                            meaningful_retry = [op for op in validated_retry if getattr(op, "op", None) not in (None, "upload_asset")]
                            if meaningful_retry:
                                ctx.operations = validated_retry
                                message = retry_message or message
                                trace = f"{trace}\n\nRETRY_EMPTY_OPS:\n{retry_trace}"
                                if retry_warnings:
                                    dropped2 = max(0, before_retry_len - len(ctx.operations))
                                    reasons2 = []
                                    unknown_ids2 = []
                                    for w in retry_warnings:
                                        r = w.get("reason")
                                        if r and r not in reasons2:
                                            reasons2.append(r)
                                        for k in ("nodeId", "sourceNodeId", "targetNodeId"):
                                            nid = w.get(k)
                                            if nid and nid not in unknown_ids2:
                                                unknown_ids2.append(nid)
                                    reason_short2 = "; ".join([str(x) for x in reasons2[:3]])
                                    short2 = ", ".join([str(x) for x in unknown_ids2[:6]])
                                    if dropped2:
                                        message = (
                                            f"{message}\n\n[Validator] Dropped {dropped2} invalid op(s)."
                                            + (f" Reasons: {reason_short2}." if reason_short2 else "")
                                            + (f" Unknown nodeIds: {short2}." if short2 else "")
                                        )
                                    trace = f"{trace}\n\nVALIDATION_WARNINGS:\n{json.dumps(retry_warnings[:60], ensure_ascii=False)}"
                        except Exception:
                            pass

                    # Deterministic template fallback for common requests if we still have 0 meaningful ops.
                    meaningful_now = [op for op in (ctx.operations or []) if getattr(op, "op", None) not in (None, "upload_asset")]
                    if not meaningful_now and (last_text or "").strip():
                        try:
                            templ = self._template_flag_wave_ops(ctx, user_text=last_text)
                            if templ:
                                merged_templ: List[GraphOperation] = []
                                merged_templ.extend(upload_ops)
                                merged_templ.extend(templ)
                                before_templ_len = len(merged_templ)
                                validated_templ, templ_warnings = self._validate_ops(ctx, merged_templ)
                                ctx.operations = validated_templ
                                message = message or "Created a simple flag waving vertex displacement."
                                trace = f"{trace}\n\nTEMPLATE_FALLBACK: flag_wave"
                                if templ_warnings:
                                    dropped3 = max(0, before_templ_len - len(ctx.operations))
                                    if dropped3:
                                        message = f"{message}\n\n[Validator] Dropped {dropped3} invalid op(s)."
                                    trace = f"{trace}\n\nVALIDATION_WARNINGS:\n{json.dumps(templ_warnings[:60], ensure_ascii=False)}"
                        except Exception:
                            pass
                    return AgentResponse(message=message, operations=ctx.operations, thought_process=trace)
                except Exception as e:
                    # If both ADK and the direct planner fail to produce anything meaningful,
                    # return a diagnostic instead of a silent/ambiguous retry message.
                    logger.exception("Direct planner fallback failed")
                    trace = self._events_to_tool_trace(events)
                    diag = {
                        "error": str(e),
                        "mode": mode,
                        "model": self.model_id,
                        "adk_empty": True,
                        "ops_count": len(ctx.operations or []),
                    }
                    trace = f"{trace}\n\nDIRECT_PLANNER_ERROR:\n{json.dumps(diag, ensure_ascii=False)}"
                    return AgentResponse(
                        message=(
                            "Agent returned an empty response (no tool calls / no text), and the fallback planner also failed. "
                            "Please retry; if it keeps happening, share the DIRECT_PLANNER_ERROR from thought_process."
                        ),
                        operations=ctx.operations,
                        thought_process=trace,
                    )

            message = text if text else self._fallback_message_from_ops(ctx.operations)
            trace = self._events_to_tool_trace(events)
            if validation_warnings:
                dropped = max(0, before_validate_len - len(ctx.operations))
                unknown_ids = []
                reasons = []
                for w in validation_warnings:
                    r = w.get("reason")
                    if r and r not in reasons:
                        reasons.append(r)
                    for k in ("nodeId", "sourceNodeId", "targetNodeId"):
                        nid = w.get(k)
                        if nid and nid not in unknown_ids:
                            unknown_ids.append(nid)
                short = ", ".join([str(x) for x in unknown_ids[:6]])
                if dropped:
                    reason_short = "; ".join([str(x) for x in reasons[:3]])
                    message = (
                        f"{message}\n\n[Validator] Dropped {dropped} invalid op(s)."
                        + (f" Reasons: {reason_short}." if reason_short else "")
                        + (f" Unknown nodeIds: {short}." if short else "")
                    )
                trace = f"{trace}\n\nVALIDATION_WARNINGS:\n{json.dumps(validation_warnings[:60], ensure_ascii=False)}"

            # If we ended up with 0 meaningful ops in a non-consultant mode, auto-retry once
            # with the strict JSON planner to avoid "message but no changes" dead-ends.
            if self._should_retry_empty_ops(mode=mode, user_text=last_text, ops=ctx.operations):
                try:
                    upload_ops_retry = [op for op in (ctx.operations or []) if getattr(op, "op", None) == "upload_asset"]
                    retry_prompt = (
                        f"{prompt_text}\n\n"
                        "RETRY_NOTE: Your previous response resulted in 0 or too-few applied graph operations. "
                        "If the user asked for changes, you MUST return a non-empty operations list. "
                        "If no change is possible, explain why and return operations=[]"
                    )
                    retry_message, retry_ops, retry_trace = self._direct_plan_ops(
                        prompt_text=retry_prompt,
                        mode=mode,
                        ctx=ctx,
                    )

                    merged_retry: List[GraphOperation] = []
                    merged_retry.extend(upload_ops_retry)
                    for op in (retry_ops or []):
                        if getattr(op, "op", None) == "upload_asset":
                            continue
                        merged_retry.append(op)

                    merged_retry = self._optimize_redundant_texture_sampling(merged_retry)
                    before_retry_len = len(merged_retry)
                    validated_retry, retry_warnings = self._validate_ops(ctx, merged_retry)
                    meaningful_retry = [op for op in validated_retry if getattr(op, "op", None) not in (None, "upload_asset")]
                    if meaningful_retry:
                        ctx.operations = validated_retry
                        message = retry_message or message
                        trace = f"{trace}\n\nRETRY_EMPTY_OPS:\n{retry_trace}"
                        if retry_warnings:
                            dropped = max(0, before_retry_len - len(ctx.operations))
                            reasons = []
                            for w in retry_warnings:
                                r = w.get("reason")
                                if r and r not in reasons:
                                    reasons.append(r)
                            reason_short = "; ".join([str(x) for x in reasons[:3]])
                            if dropped:
                                message = f"{message}\n\n[Validator] Dropped {dropped} invalid op(s)." + (f" Reasons: {reason_short}." if reason_short else "")
                            trace = f"{trace}\n\nVALIDATION_WARNINGS:\n{json.dumps(retry_warnings[:60], ensure_ascii=False)}"
                except Exception:
                    pass

            return AgentResponse(message=message, operations=ctx.operations, thought_process=trace)
        except Exception as e:
            logger.exception("Agent failure")
            return AgentResponse(message=f"Error: {e}", operations=[])

    def _direct_plan_ops(self, *, prompt_text: str, mode: str, ctx: _RequestContext) -> tuple[str, List[GraphOperation], str]:
        """Fallback planner that doesn't rely on ADK tool-calling.

        Asks the model to return a strict JSON object containing graph operations.
        """

        sys = self._system_instructions(mode)
        user = f"""You must respond with STRICT JSON only. No markdown.

Return shape:
{{
    \"message\": string,
    \"operations\": [ {{ GraphOperation }} ... ]
}}

GraphOperation (IMPORTANT: use these exact field names):
- op: one of add_node, remove_node, add_connection, remove_connection, update_node_data, move_node, upload_asset, request_previews
- add_node: nodeId (string), nodeType (string), x (number), y (number), optional label
- add_connection: connectionId (string optional), sourceNodeId, sourceSocketId, targetNodeId, targetSocketId
- update_node_data: nodeId, dataKey, dataValue

Rules:
- Prefer editing the existing graph when possible.
- IMPORTANT: Never add new master nodes (nodeType 'output' or 'vertex') if the graph already has them. Use the existing nodeIds.
- Use available attachment assets by referencing their assetId in textureAsset (string).
- If you add a texture node, prefer nodeType 'texture2DAsset' when available.
- Connect final result to output.color.
- Keep ops <= 60.

USER_PROMPT:
{prompt_text}
"""

        resp = self.client.models.generate_content(
            model=self.model_id,
            contents=[
                types.Content(role="system", parts=[types.Part(text=sys)]),
                types.Content(role="user", parts=[types.Part(text=user)]),
            ],
            config=self._build_direct_planner_config(),
        )

        raw = (resp.text or "").strip()
        data: Any = None
        parse_trace: Dict[str, Any] = {}

        def _strip_markdown_fences(text: str) -> str:
            t = (text or "").strip()
            if "```" not in t:
                return t
            # Remove the first fenced block wrapper if present.
            start = t.find("```")
            if start == -1:
                return t
            # Find end of opening fence line.
            nl = t.find("\n", start)
            if nl == -1:
                return t
            # Find closing fence.
            end = t.rfind("```")
            if end != -1 and end > nl:
                return t[nl + 1 : end].strip()
            return t

        def _extract_first_json_block(text: str) -> Optional[str]:
            s = text or ""
            # Find first object/array start.
            start_idx = -1
            start_ch = ""
            for i, ch in enumerate(s):
                if ch in "{[":
                    start_idx = i
                    start_ch = ch
                    break
            if start_idx < 0:
                return None

            end_ch = "}" if start_ch == "{" else "]"
            depth = 0
            in_str = False
            str_quote = ""
            escape = False

            for j in range(start_idx, len(s)):
                ch = s[j]
                if in_str:
                    if escape:
                        escape = False
                        continue
                    if ch == "\\":
                        escape = True
                        continue
                    if ch == str_quote:
                        in_str = False
                        str_quote = ""
                    continue

                if ch in ("\"", "'"):
                    in_str = True
                    str_quote = ch
                    continue

                if ch == start_ch:
                    depth += 1
                    continue
                if ch == end_ch:
                    depth -= 1
                    if depth == 0:
                        return s[start_idx : j + 1].strip()
                    continue
            return None

        def _try_json_loads(text: str) -> tuple[Optional[Any], Optional[str]]:
            try:
                return json.loads(text), None
            except Exception as e:
                return None, f"json: {type(e).__name__}: {e}"

        def _try_json5_loads(text: str) -> tuple[Optional[Any], Optional[str]]:
            try:
                import pyjson5  # type: ignore

                return pyjson5.decode(text), None
            except Exception as e:
                # Includes ImportError; keep message for trace.
                return None, f"json5: {type(e).__name__}: {e}"

        def _parse_jsonish(text: str) -> tuple[Optional[Any], Dict[str, Any]]:
            t0 = _strip_markdown_fences(text)
            block = _extract_first_json_block(t0)
            attempts: List[Dict[str, Any]] = []

            for label, candidate in (
                ("raw", t0),
                ("block", block or ""),
            ):
                if not candidate.strip():
                    continue
                obj, err = _try_json_loads(candidate)
                attempts.append({"kind": label, "parser": "json", "ok": obj is not None, "error": err})
                if obj is not None:
                    return obj, {"used": {"kind": label, "parser": "json"}, "attempts": attempts}

                obj5, err5 = _try_json5_loads(candidate)
                attempts.append({"kind": label, "parser": "json5", "ok": obj5 is not None, "error": err5})
                if obj5 is not None:
                    return obj5, {"used": {"kind": label, "parser": "json5"}, "attempts": attempts}

            return None, {"used": None, "attempts": attempts}

        data, parse_trace = _parse_jsonish(raw)

        # Optional one-shot JSON repair if parsing failed.
        if data is None and str(os.getenv("LUMINA_DIRECT_REPAIR_JSON", "1")).strip() not in ("0", "false", "False"):
            block = _extract_first_json_block(_strip_markdown_fences(raw))
            repair_input = (block or raw or "").strip()
            if repair_input:
                repair_user = (
                    "Return STRICT JSON only (no markdown, no comments, double quotes only). "
                    "Fix any syntax issues in the JSON below without changing its meaning. "
                    "Ensure the output is an object with keys 'message' (string) and 'operations' (array). "
                    "If 'operations' is missing, add it as an empty array.\n\n"
                    "JSON_TO_FIX:\n" + repair_input
                )
                try:
                    repair_resp = self.client.models.generate_content(
                        model=self.model_id,
                        contents=[
                            types.Content(role="system", parts=[types.Part(text="You output only valid JSON.")]),
                            types.Content(role="user", parts=[types.Part(text=repair_user)]),
                        ],
                        config=self._build_direct_planner_config(),
                    )
                    repaired_raw = (repair_resp.text or "").strip()
                    data2, trace2 = _parse_jsonish(repaired_raw)
                    if data2 is not None:
                        data = data2
                        parse_trace = {"repair": True, "first": parse_trace, "second": trace2}
                    else:
                        parse_trace = {"repair": True, "first": parse_trace, "second": trace2}
                except Exception as e:
                    parse_trace = {"repair": True, "first": parse_trace, "repair_error": f"{type(e).__name__}: {e}"}

        # If still unparseable, degrade gracefully to a no-op plan with the model text as message.
        if data is None:
            data = {"message": raw, "operations": []}

        # Normalize top-level shape.
        if isinstance(data, list):
            data = {"message": "", "operations": data}

        msg = str((data or {}).get("message") or "").strip()
        ops_in = (data or {}).get("operations")
        if ops_in is None:
            ops_in = (data or {}).get("ops")
        ops_out: List[GraphOperation] = []
        parse_stats: Dict[str, Any] = {
            "raw_len": len(raw or ""),
            "had_ops_field": isinstance(ops_in, list),
            "ops_in_len": len(ops_in) if isinstance(ops_in, list) else 0,
            "parsed_ops": 0,
        }

        def _snk(item: Dict[str, Any], src: str, dst: str) -> None:
            if dst in item:
                return
            if src in item:
                item[dst] = item.get(src)

        def _map_tool_style(item: Dict[str, Any]) -> Dict[str, Any]:
            """Convert tool-call-like shapes into GraphOperation-compatible dicts."""

            out = dict(item)
            op_kind = str(out.get("op") or out.get("tool") or out.get("name") or "").strip()
            if not op_kind and "function" in out and isinstance(out.get("function"), dict):
                op_kind = str(out["function"].get("name") or "").strip()

            # Normalize common tool naming.
            k = op_kind
            if k in ("connect_nodes", "connectNodes"):
                out["op"] = "add_connection"
                _snk(out, "source_node_id", "sourceNodeId")
                _snk(out, "source_socket_id", "sourceSocketId")
                _snk(out, "target_node_id", "targetNodeId")
                _snk(out, "target_socket_id", "targetSocketId")
                if "connectionId" not in out and "id" in out:
                    out["connectionId"] = out.get("id")
            elif k in ("disconnect_nodes", "disconnectNodes"):
                out["op"] = "remove_connection"
                _snk(out, "source_node_id", "sourceNodeId")
                _snk(out, "source_socket_id", "sourceSocketId")
                _snk(out, "target_node_id", "targetNodeId")
                _snk(out, "target_socket_id", "targetSocketId")
                if "connectionId" not in out and "id" in out:
                    out["connectionId"] = out.get("id")
            elif k in ("update_node_value", "updateNodeValue"):
                out["op"] = "update_node_data"
                _snk(out, "node_id", "nodeId")
                _snk(out, "data_key", "dataKey")
                if "dataValue" not in out:
                    out["dataValue"] = out.get("value")
            elif k in ("add_node", "addNode"):
                out["op"] = "add_node"
                if not out.get("nodeType") and out.get("type"):
                    out["nodeType"] = out.get("type")
                if not out.get("nodeId") and out.get("id"):
                    out["nodeId"] = out.get("id")
            elif k in ("remove_node", "removeNode"):
                out["op"] = "remove_node"
                _snk(out, "node_id", "nodeId")
                if not out.get("nodeId") and out.get("id"):
                    out["nodeId"] = out.get("id")
            elif k in ("move_node", "moveNode"):
                out["op"] = "move_node"
                _snk(out, "node_id", "nodeId")
            elif k in ("request_previews", "requestPreviews"):
                out["op"] = "request_previews"
                if "previewRequests" not in out and "requests" in out:
                    out["previewRequests"] = out.get("requests")
            elif k in ("upload_asset", "uploadAsset"):
                out["op"] = "upload_asset"

            # Common key aliasing.
            if out.get("op") == "add_node":
                out.pop("type", None)
                out.pop("id", None)
            if out.get("op") in ("add_connection", "remove_connection"):
                out.pop("id", None)
            return out

        if isinstance(ops_in, list):
            for item in ops_in[:60]:
                if not isinstance(item, dict):
                    continue
                item2 = _map_tool_style(item)
                # Normalize additional alias keys produced by LLMs.
                op_kind = str(item2.get("op") or "").strip()
                if op_kind == "add_node":
                    if not item2.get("nodeType") and item2.get("type"):
                        item2["nodeType"] = item2.get("type")
                    if not item2.get("nodeId") and item2.get("id"):
                        item2["nodeId"] = item2.get("id")
                    item2.pop("type", None)
                    item2.pop("id", None)
                elif op_kind == "add_connection":
                    if not item2.get("connectionId") and item2.get("id"):
                        item2["connectionId"] = item2.get("id")
                    item2.pop("id", None)
                elif op_kind == "remove_node":
                    if not item2.get("nodeId") and item2.get("id"):
                        item2["nodeId"] = item2.get("id")
                    item2.pop("id", None)
                try:
                    ops_out.append(GraphOperation(**item2))
                    parse_stats["parsed_ops"] = int(parse_stats.get("parsed_ops") or 0) + 1
                except Exception:
                    continue

        # If the model returned an ops list but none could be parsed, surface it for debugging.
        if parse_stats.get("had_ops_field") and parse_stats.get("ops_in_len") and not ops_out:
            msg = msg or "Parsed JSON but could not parse any operations."
            msg = f"{msg}"
            # Attach as a synthetic warning in the trace (returned by caller).
            # (We can't return trace from here directly; caller includes raw in trace.)

        # --- Sanitize ops for frontend compatibility and to avoid graph corruption ---
        graph_nodes = ctx.graph.get("nodes") or []

        def _find_master_id(master_type: str) -> Optional[str]:
            for n in graph_nodes:
                if isinstance(n, dict) and str(n.get("type") or "").strip().lower() == master_type:
                    nid = n.get("id")
                    if nid:
                        return str(nid)
            return None

        existing_output_id = _find_master_id("output")
        existing_vertex_id = _find_master_id("vertex")

        # Build mapping for any mistakenly-created master nodes.
        remap_node_ids: Dict[str, str] = {}
        drop_node_ids: set[str] = set()
        for op in ops_out:
            if getattr(op, "op", None) != "add_node":
                continue
            ntype = str(getattr(op, "nodeType", "") or "").strip().lower()
            nid = getattr(op, "nodeId", None)
            if not nid:
                continue
            nid_s = str(nid)
            if ntype == "output" and existing_output_id:
                remap_node_ids[nid_s] = existing_output_id
                drop_node_ids.add(nid_s)
            if ntype == "vertex" and existing_vertex_id:
                remap_node_ids[nid_s] = existing_vertex_id
                drop_node_ids.add(nid_s)

        # Ensure add_node always has nodeId.
        for op in ops_out:
            if getattr(op, "op", None) == "add_node" and not getattr(op, "nodeId", None):
                setattr(op, "nodeId", f"node_{uuid.uuid4().hex[:10]}")

        # Collect color node ids (existing + newly added).
        color_node_ids: set[str] = set()
        for n in graph_nodes:
            if isinstance(n, dict) and str(n.get("type") or "").strip().lower() == "color" and n.get("id"):
                color_node_ids.add(str(n.get("id")))
        for op in ops_out:
            if getattr(op, "op", None) == "add_node" and str(getattr(op, "nodeType", "") or "").strip().lower() == "color" and getattr(op, "nodeId", None):
                color_node_ids.add(str(op.nodeId))

        def _to_hex(rgb: Any) -> Optional[str]:
            if not isinstance(rgb, (list, tuple)) or len(rgb) < 3:
                return None
            vals = []
            for v in list(rgb)[:3]:
                try:
                    vals.append(float(v))
                except Exception:
                    return None
            mx = max(vals) if vals else 1.0
            scale = 255.0 if mx <= 1.0 else 1.0
            out = []
            for v in vals:
                c = int(round(max(0.0, min(255.0, v * scale))))
                out.append(f"{c:02x}")
            return "#" + "".join(out)

        sanitized: List[GraphOperation] = []
        for op in ops_out:
            kind = getattr(op, "op", None)

            # Drop any add_node that creates a duplicate master.
            if kind == "add_node":
                ntype = str(getattr(op, "nodeType", "") or "").strip().lower()
                nid = str(getattr(op, "nodeId", "") or "")
                if ntype in ("output", "vertex") and nid in drop_node_ids:
                    continue

            # Remap references to dropped master ids.
            if kind in ("add_connection", "remove_connection"):
                for field in ("sourceNodeId", "targetNodeId"):
                    val = getattr(op, field, None)
                    if val and str(val) in remap_node_ids:
                        setattr(op, field, remap_node_ids[str(val)])
            if kind in ("update_node_data", "move_node", "remove_node"):
                val = getattr(op, "nodeId", None)
                if val and str(val) in remap_node_ids:
                    setattr(op, "nodeId", remap_node_ids[str(val)])

            # Normalize color updates: frontend expects color node value as hex string.
            if kind == "update_node_data":
                nid = getattr(op, "nodeId", None)
                key = str(getattr(op, "dataKey", "") or "").strip().lower()
                if nid and str(nid) in color_node_ids and key in ("value", "color"):
                    dv = getattr(op, "dataValue", None)
                    hx = _to_hex(dv)
                    if hx:
                        setattr(op, "dataKey", "value")
                        setattr(op, "dataValue", hx)

            sanitized.append(op)

        ops_out = sanitized

        trace = json.dumps(
            {
                "fallback": "direct_plan_ops",
                "model": self.model_id,
                "raw": raw[:1500],
                "parse_meta": parse_trace,
                "parse_stats": parse_stats,
            },
            ensure_ascii=False,
        )
        return msg, ops_out, trace

    def process_request_sync(self, messages_data: List[Dict[str, Any]], graph: Dict[str, Any]) -> AgentResponse:
        """Sync wrapper used by FastAPI threadpool execution.

        This prevents slow/blocking model calls (or SDK hangs) from blocking the server event loop.
        """
        return asyncio.run(self.process_request(messages_data, graph))
