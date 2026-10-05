"""Render the self-contained V8 Databricks source notebook without credentials."""
import argparse
import base64
import hashlib
import json
import subprocess
from pathlib import Path


def render():
    root = Path(__file__).resolve().parents[1]
    sources = {
        "__V4_SOURCE__": root / "ml/train_v4.py",
        "__V5_SOURCE__": root / "ml/train_v5.py",
        "__CONTRACT_SOURCE__": root / "agent/src/ml/features.py",
        "__TRAINER_SOURCE__": root / "ml/train_v8.py",
    }
    source = (root / "ml/notebooks/12_digital_history_challenger.py").read_text()
    hashes = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sources.values()}
    replacements = {name: repr(path.read_text()) for name, path in sources.items()}
    model = (root / "agent/configs/fraud-model/model.cbm").read_bytes()
    manifest = json.loads((root / "agent/configs/fraud-model/manifest.json").read_text())
    if hashlib.sha256(model).hexdigest() != manifest["model_sha256"]:
        raise ValueError("The deployed baseline binary does not match its manifest")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    replacements.update({"__SOURCE_HASHES__": repr(hashes), "__CODE_COMMIT__": repr(commit),
        "__BASELINE_BINARY__": repr(base64.b64encode(model).decode()), "__BASELINE_MANIFEST__": repr(manifest)})
    for name, value in replacements.items():
        if source.count(name) != 1:
            raise ValueError(f"Expected one notebook placeholder: {name}")
        source = source.replace(name, value)
    compile(source, "rendered_v8_notebook", "exec")
    return source


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.write_text(render())
    print(f"Rendered self-contained V8 notebook: {args.output}")
