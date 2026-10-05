"""Render the shared training notebook from versioned modules without remote calls."""
import argparse
import base64
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "__V4_SOURCE__":"ml/train_v4.py", "__V5_SOURCE__":"ml/train_v5.py",
    "__CONTRACT_SOURCE__":"agent/src/ml/features.py", "__TRAINER_SOURCE__":"ml/train_serving.py",
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",default="/tmp/bank-serving-notebook.json")
    args = parser.parse_args()
    text = (ROOT/"ml/notebooks/11_executable_fraud_predictions.py").read_text()
    hashes = {}
    for placeholder, relative in SOURCES.items():
        source = (ROOT/relative).read_text()
        hashes[relative] = hashlib.sha256(source.encode()).hexdigest()
        text = text.replace(placeholder,repr(source))
    commit = subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,text=True,capture_output=True,check=True).stdout.strip()
    text = text.replace("__SOURCE_HASHES__",repr(hashes)).replace("__CODE_COMMIT__",repr(commit))
    compile(text,"rendered_serving_notebook","exec")
    payload = {"path":"/Shared/fraud-eda/11_executable_fraud_predictions","format":"SOURCE","language":"PYTHON",
        "overwrite":False,"content":base64.b64encode(text.encode()).decode()}
    Path(args.output).write_text(json.dumps(payload))
    print("Rendered training notebook from commit "+commit)

if __name__ == "__main__":
    main()
