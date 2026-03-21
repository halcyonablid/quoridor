"""Monte Carlo Tree Search with Policy-Value network — PyTorch version."""
import numpy as np
from copy import deepcopy
from math import sqrt

import torch

from game import ACTION_SPACE, BOARD_SIZE
from dual_network import DN_INPUT_SHAPE, DualNetwork

PV_EVALUATE_COUNT = 50  # MCTS simulations per move


def predict(model, state):
    """Run neural network inference on a state."""
    c, h, w = DN_INPUT_SHAPE
    x = np.array(state.pieces_array(), dtype=np.float32)
    x = x.reshape(1, c, h, w)
    x_tensor = torch.from_numpy(x)

    model.eval()
    with torch.no_grad():
        policy, value = model(x_tensor)

    policy = policy.numpy()[0]
    value = float(value.numpy()[0][0])

    legal = state.legal_actions()
    policies = policy[legal]
    s = np.sum(policies)
    policies = policies / s if s > 0 else np.ones(len(legal)) / len(legal)
    return policies, value


def pv_mcts_scores(model, state, temperature):
    """Run MCTS and return visit count distribution over legal actions."""

    class Node:
        def __init__(self, state, p):
            self.state = state
            self.p = p
            self.w = 0
            self.n = 0
            self.child_nodes = None

        def evaluate(self):
            if self.state.is_done():
                value = -1 if self.state.is_lose() else 0
                self.w += value
                self.n += 1
                return value
            if not self.child_nodes:
                policies, value = predict(model, self.state)
                self.w += value
                self.n += 1
                self.child_nodes = []
                for action, policy in zip(self.state.legal_actions(), policies):
                    self.child_nodes.append(Node(self.state.next(action), policy))
                return value
            else:
                value = -self.next_child_node().evaluate()
                self.w += value
                self.n += 1
                return value

        def next_child_node(self):
            C_PUCT = 1.0
            t = sum(c.n for c in self.child_nodes)
            pucb_values = []
            for child in self.child_nodes:
                q = (-child.w / child.n) if child.n else 0.0
                u = C_PUCT * child.p * sqrt(t) / (1 + child.n)
                pucb_values.append(q + u)
            return self.child_nodes[np.argmax(pucb_values)]

    root = Node(state, 0)
    for _ in range(PV_EVALUATE_COUNT):
        root.evaluate()

    scores = [c.n for c in root.child_nodes]
    if temperature == 0:
        action = np.argmax(scores)
        scores = np.zeros(len(scores))
        scores[action] = 1
    else:
        scores = boltzman(scores, temperature)
    return scores


def pv_mcts_action(model, temperature=0):
    """Return a function that selects actions using MCTS."""
    def action_fn(state):
        scores = pv_mcts_scores(model, deepcopy(state), temperature)
        return np.random.choice(state.legal_actions(), p=scores)
    return action_fn


def boltzman(xs, temperature):
    xs = [x ** (1 / temperature) for x in xs]
    s = sum(xs)
    return [x / s if s > 0 else 1 / len(xs) for x in xs]
