"""Self-play data generation — PyTorch version."""
import os
import sys
import pickle
import time
from copy import deepcopy
from datetime import datetime

import numpy as np
import torch

from game import State, ACTION_SPACE
from dual_network import DualNetwork, DN_OUTPUT_SIZE
from pv_mcts import pv_mcts_scores

SP_GAME_COUNT = 25       # Games per self-play round
SP_TEMPERATURE = 1.0


def first_player_value(ended_state):
    if ended_state.is_lose():
        return -1 if ended_state.is_first_player() else 1
    return 0


def write_data(history):
    os.makedirs('./data/', exist_ok=True)
    now = datetime.now()
    path = './data/{}.history'.format(now.strftime('%Y%m%d%H%M%S'))
    with open(path, mode='wb') as f:
        pickle.dump(history, f)
    print(f"Saved {len(history)} samples to {path}")


def play(model):
    history = []
    state = State()
    while True:
        if state.is_done():
            break
        scores = pv_mcts_scores(model, deepcopy(state), SP_TEMPERATURE)
        policies = [0] * DN_OUTPUT_SIZE
        for action, policy in zip(state.legal_actions(), scores):
            policies[action] = policy
        history.append([state.pieces_array(), policies, None])
        action = np.random.choice(state.legal_actions(), p=scores)
        state = state.next(action)

    value = first_player_value(state)
    for i in range(len(history)):
        history[i][2] = value
        value = -value
    return history


def self_play():
    history = []
    model = DualNetwork()
    model.load_state_dict(torch.load('./model/best.pt', weights_only=True))
    model.eval()

    for i in range(SP_GAME_COUNT):
        t0 = time.time()
        h = play(model)
        elapsed = time.time() - t0
        history.extend(h)
        print(f'SelfPlay {i+1}/{SP_GAME_COUNT} ({len(h)} moves, {elapsed:.1f}s)', flush=True)
    print('')
    write_data(history)
    return len(history)


if __name__ == '__main__':
    self_play()
