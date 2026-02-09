import base64
import os
import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple


@dataclass(frozen=True)
class AssetRecord:
    asset_id: str
    name: str
    mime_type: str
    data: bytes
    description: str = ""
    created_at: float = 0.0


def _mime_to_ext(mime_type: str) -> str:
    mt = (mime_type or "").lower()
    if mt == "image/png":
        return ".png"
    if mt in ("image/jpeg", "image/jpg"):
        return ".jpg"
    if mt == "image/webp":
        return ".webp"
    return ""


def _ext_to_mime(ext: str) -> str:
    e = (ext or "").lower()
    if e == ".png":
        return "image/png"
    if e in (".jpg", ".jpeg"):
        return "image/jpeg"
    if e == ".webp":
        return "image/webp"
    return "application/octet-stream"


class AssetStore:
    """Minimal backend-side asset store.

    - Always keeps an in-memory copy (fast access for img ops).
    - Optionally persists to disk if `persist_dir` is provided.

    This is intentionally simple; it is not a full media service.
    """

    def __init__(self, persist_dir: Optional[str] = None):
        self._assets: Dict[str, AssetRecord] = {}
        self._persist_dir = persist_dir
        if self._persist_dir:
            os.makedirs(self._persist_dir, exist_ok=True)

    def exists(self, asset_id: str) -> bool:
        if not asset_id:
            return False
        if asset_id in self._assets:
            return True
        if not self._persist_dir:
            return False
        try:
            for name in os.listdir(self._persist_dir):
                if name == asset_id or name.startswith(f"{asset_id}."):
                    return True
        except Exception:
            return False
        return False

    def list_assets(self) -> list[dict]:
        """List assets from persistence directory (or in-memory fallback).

        Returns lightweight metadata only; does not load full bytes.
        """

        out: list[dict] = []

        # Prefer disk persistence when available (survives reloads).
        if self._persist_dir:
            try:
                for filename in os.listdir(self._persist_dir):
                    path = os.path.join(self._persist_dir, filename)
                    if not os.path.isfile(path):
                        continue
                    asset_id, ext = os.path.splitext(filename)
                    if not asset_id:
                        continue
                    mime_type = _ext_to_mime(ext)
                    try:
                        st = os.stat(path)
                        size_bytes = int(st.st_size)
                        created_at = float(st.st_mtime)
                    except Exception:
                        size_bytes = 0
                        created_at = 0.0
                    out.append(
                        {
                            "assetId": asset_id,
                            "name": filename,
                            "mimeType": mime_type,
                            "sizeBytes": size_bytes,
                            "createdAt": created_at,
                        }
                    )
            except Exception:
                out = []

        # Fallback: in-memory list (useful when not persisting).
        if not out:
            for rec in self._assets.values():
                out.append(
                    {
                        "assetId": rec.asset_id,
                        "name": rec.name,
                        "mimeType": rec.mime_type,
                        "sizeBytes": len(rec.data or b""),
                        "createdAt": rec.created_at,
                    }
                )

        out.sort(key=lambda a: float(a.get("createdAt") or 0.0), reverse=True)
        return out

    def put(
        self,
        *,
        asset_id: str,
        data: bytes,
        mime_type: str,
        name: str,
        description: str = "",
    ) -> AssetRecord:
        record = AssetRecord(
            asset_id=asset_id,
            name=name,
            mime_type=mime_type,
            data=data,
            description=description or "",
            created_at=time.time(),
        )
        self._assets[asset_id] = record

        if self._persist_dir:
            ext = _mime_to_ext(mime_type)
            filename = f"{asset_id}{ext}" if ext else asset_id
            path = os.path.join(self._persist_dir, filename)
            with open(path, "wb") as f:
                f.write(data)

        return record

    def get(self, asset_id: str) -> Optional[AssetRecord]:
        rec = self._assets.get(asset_id)
        if rec:
            return rec

        # Lazy-load from disk persistence when available.
        if not self._persist_dir:
            return None

        try:
            candidates = []
            for name in os.listdir(self._persist_dir):
                if name == asset_id or name.startswith(f"{asset_id}."):
                    candidates.append(name)
            if not candidates:
                return None

            # Prefer known image extensions if present.
            candidates.sort(key=lambda n: (0 if os.path.splitext(n)[1].lower() in (".png", ".jpg", ".jpeg", ".webp") else 1, n))
            filename = candidates[0]
            path = os.path.join(self._persist_dir, filename)
            with open(path, "rb") as f:
                data = f.read()
            ext = os.path.splitext(filename)[1]
            mime_type = _ext_to_mime(ext)
            record = AssetRecord(
                asset_id=asset_id,
                name=filename,
                mime_type=mime_type,
                data=data,
                description="lazy_loaded",
                created_at=time.time(),
            )
            self._assets[asset_id] = record
            return record
        except Exception:
            return None

    def get_bytes(self, asset_id: str) -> Optional[bytes]:
        rec = self.get(asset_id)
        return rec.data if rec else None

    def to_data_url(self, asset_id: str) -> Optional[str]:
        rec = self.get(asset_id)
        if not rec:
            return None
        b64 = base64.b64encode(rec.data).decode("utf-8")
        return f"data:{rec.mime_type};base64,{b64}"

    def delete(self, asset_id: str) -> bool:
        if not asset_id:
            return False

        removed = False

        if asset_id in self._assets:
            try:
                del self._assets[asset_id]
                removed = True
            except Exception:
                pass

        if self._persist_dir:
            try:
                for name in os.listdir(self._persist_dir):
                    if name == asset_id or name.startswith(f"{asset_id}."):
                        path = os.path.join(self._persist_dir, name)
                        try:
                            os.remove(path)
                            removed = True
                        except Exception:
                            pass
            except Exception:
                pass

        return removed

    @staticmethod
    def parse_data_url(data_url: str) -> Tuple[str, bytes]:
        if not isinstance(data_url, str) or not data_url.startswith("data:"):
            raise ValueError("Not a data URL")
        header, encoded = data_url.split(",", 1)
        # header: data:<mime>;base64
        mime = header[5:].split(";", 1)[0] if ";" in header else header[5:]
        raw = base64.b64decode(encoded)
        return mime or "application/octet-stream", raw
