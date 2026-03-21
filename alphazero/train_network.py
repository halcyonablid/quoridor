"""Train the dual network on self-play data — PyTorch version."""
import pickle
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

from dual_network import DualNetwork, DN_INPUT_SHAPE, DN_OUTPUT_SIZE

NUM_EPOCHS = 100
BATCH_SIZE = 128


def load_data():
    history_path = sorted(Path('./data').glob('*.history'))[-1]
    with history_path.open(mode='rb') as f:
        return pickle.load(f)


def train_network():
    history = load_data()
    s, p, v = zip(*history)

    c, h, w = DN_INPUT_SHAPE
    s = np.array(s, dtype=np.float32).reshape(len(s), c, h, w)
    p = np.array(p, dtype=np.float32)
    v = np.array(v, dtype=np.float32).reshape(-1, 1)

    s_t = torch.from_numpy(s)
    p_t = torch.from_numpy(p)
    v_t = torch.from_numpy(v)

    dataset = TensorDataset(s_t, p_t, v_t)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    model = DualNetwork()
    model.load_state_dict(torch.load('./model/best.pt', weights_only=True))
    model.train()

    optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=0.0005)

    for epoch in range(NUM_EPOCHS):
        total_loss = 0
        batches = 0
        # Learning rate schedule
        lr = 0.001
        if epoch >= 50:
            lr = 0.0005
        if epoch >= 80:
            lr = 0.00025
        for param_group in optimizer.param_groups:
            param_group['lr'] = lr

        for s_b, p_b, v_b in loader:
            policy_pred, value_pred = model(s_b)

            # Policy loss: cross-entropy
            policy_loss = -(p_b * torch.log(policy_pred + 1e-8)).sum(dim=1).mean()
            # Value loss: MSE
            value_loss = nn.functional.mse_loss(value_pred, v_b)

            loss = policy_loss + value_loss

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            batches += 1

        if (epoch + 1) % 10 == 0:
            print(f'  Epoch {epoch+1}/{NUM_EPOCHS}  loss={total_loss/max(batches,1):.4f}')

    torch.save(model.state_dict(), './model/latest.pt')
    print("Saved latest model")


if __name__ == '__main__':
    train_network()
