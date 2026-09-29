import hashlib
from functools import lru_cache
from pathlib import Path

from src.config import settings

_PROMPTS_DIR = Path(__file__).resolve().parent


@lru_cache(maxsize=1)
def prompt_version() -> str:
    """12 hex characters that change only when a prompt file or the routing file changes."""
    files = [*sorted(path for path in _PROMPTS_DIR.iterdir() if path.is_file()), Path(settings.routing_path)]
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]
