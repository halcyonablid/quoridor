"""Evaluate latest model against best model — PyTorch version."""
from shutil import copy

import numpy as np
import torch

from game import State
from dual_network import DualNetwork
from pv_mcts import pv_mcts_action

EN_GAME_COUNT = 10
EN_TEMPERATURE = 1.0


def first_player_point(ended_state):
    if ended_state.is_lose():
        return 0 if ended_state.is_first_player() else 1
    return 0.5


def play(next_actions):
    state = State()
    while True:
        if state.is_done():
            break
        next_action = next_actions[0] if state.is_first_player() else next_actions[1]
        action = next_action(state)
        state = state.next(action)
    return first_player_point(state)


def evaluate_network():
    model0 = DualNetwork()
    model0.load_state_dict(torch.load('./model/latest.pt', weights_only=True))
    model0.eval()

    model1 = DualNetwork()
    model1.load_state_dict(torch.load('./model/best.pt', weights_only=True))
    model1.eval()

    next_action0 = pv_mcts_action(model0, EN_TEMPERATURE)
    next_action1 = pv_mcts_action(model1, EN_TEMPERATURE)

    total_point = 0
    for i in range(EN_GAME_COUNT):
        if i % 2 == 0:
            total_point += play((next_action0, next_action1))
        else:
            total_point += 1 - play((next_action1, next_action0))
        print(f'\rEvaluate {i+1}/{EN_GAME_COUNT}', end='')
    print('')

    average_point = total_point / EN_GAME_COUNT
    print(f'AveragePoint {average_point:.2f}')

    if average_point > 0.5:
        copy('./model/latest.pt', './model/best.pt')
        print('ACCEPTED new model as best')
        return True
    else:
        print('REJECTED new model, keeping old best')
        return False


if __name__ == '__main__':
    evaluate_network()
