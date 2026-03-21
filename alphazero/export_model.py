"""Export trained PyTorch model to JSON for browser inference."""
import json
import os

import torch

from game import BOARD_SIZE, ACTION_SPACE
from dual_network import DualNetwork, DN_FILTERS, DN_RESIDUAL_NUM


def export_to_json(model_path='./model/best.pt', output_path=None):
    if output_path is None:
        output_path = os.path.join(os.path.dirname(model_path), 'model_browser.json')

    model = DualNetwork()
    model.load_state_dict(torch.load(model_path, weights_only=True))
    model.eval()

    state = model.state_dict()

    def to_list(t):
        return t.detach().cpu().tolist()

    weights = {}
    for key, tensor in state.items():
        weights[key] = to_list(tensor)

    structured = {
        "format": "quoridor-alphazero-resnet-v1",
        "board_size": BOARD_SIZE,
        "action_space": ACTION_SPACE,
        "channels": 6,
        "residual_blocks": DN_RESIDUAL_NUM,
        "filters": DN_FILTERS,
        "weights": weights,
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(structured, f, ensure_ascii=False)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Exported to {output_path} ({size_mb:.1f} MB)")


if __name__ == '__main__':
    export_to_json()
