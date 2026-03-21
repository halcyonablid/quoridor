"""Dual network (ResNet) for Quoridor 9x9 AlphaZero — PyTorch version.

Architecture:
  Input: (6, 9, 9) — 6 channels
  Conv 3x3 -> BN -> ReLU
  16x ResidualBlock(Conv->BN->ReLU->Conv->BN->Add->ReLU)
  GlobalAveragePooling
  Policy head: Dense(209, softmax)
  Value head: Dense(1, tanh)
"""
import os
import torch
import torch.nn as nn
import torch.nn.functional as F

from game import BOARD_SIZE, ACTION_SPACE

DN_FILTERS = 128
DN_RESIDUAL_NUM = 16
DN_INPUT_SHAPE = (6, BOARD_SIZE, BOARD_SIZE)  # channels first for PyTorch
DN_OUTPUT_SIZE = ACTION_SPACE  # 209


class ResidualBlock(nn.Module):
    def __init__(self, channels):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x):
        residual = x
        x = F.relu(self.bn1(self.conv1(x)))
        x = self.bn2(self.conv2(x))
        x = F.relu(x + residual)
        return x


class DualNetwork(nn.Module):
    def __init__(self):
        super().__init__()
        # Initial conv
        self.conv_init = nn.Conv2d(6, DN_FILTERS, 3, padding=1, bias=False)
        self.bn_init = nn.BatchNorm2d(DN_FILTERS)

        # Residual blocks
        self.res_blocks = nn.Sequential(
            *[ResidualBlock(DN_FILTERS) for _ in range(DN_RESIDUAL_NUM)]
        )

        # Global average pooling is done in forward()

        # Policy head
        self.policy_head = nn.Linear(DN_FILTERS, DN_OUTPUT_SIZE)

        # Value head
        self.value_head = nn.Linear(DN_FILTERS, 1)

    def forward(self, x):
        # x: (batch, 6, 9, 9)
        x = F.relu(self.bn_init(self.conv_init(x)))
        x = self.res_blocks(x)
        x = x.mean(dim=[2, 3])  # global average pooling -> (batch, 128)

        policy = F.softmax(self.policy_head(x), dim=1)
        value = torch.tanh(self.value_head(x))
        return policy, value


def create_model():
    return DualNetwork()


def dual_network():
    """Create initial model if it doesn't exist."""
    model_path = './model/best.pt'
    if os.path.exists(model_path):
        return
    model = create_model()
    os.makedirs('./model/', exist_ok=True)
    torch.save(model.state_dict(), model_path)
    print(f"Created initial model: {model_path}")
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Parameters: {total_params:,}")


if __name__ == '__main__':
    dual_network()
    model = create_model()
    total_params = sum(p.numel() for p in model.parameters())
    print(f"DualNetwork parameters: {total_params:,}")
    # Test forward pass
    x = torch.randn(1, 6, 9, 9)
    p, v = model(x)
    print(f"Policy shape: {p.shape}, Value shape: {v.shape}")
