"""Quoridor 9x9 game logic for AlphaZero training.

Board representation (from current player's perspective):
  - Player starts at row 8 (bottom), goal is row 0 (top)
  - Enemy starts at row 0 (top), goal is row 8 (bottom)
  - Walls stored as flat array of (N-1)^2 = 64 cells, value 0/1/2 (none/horizontal/vertical)

Action space (209 total):
  - 0..80:    move pawn to cell (row*9+col)
  - 81..144:  place horizontal wall at anchor (idx-81) -> row*(N-1)+col
  - 145..208: place vertical wall at anchor (idx-145)

State is always stored from the current player's perspective (canonical form).
"""
from __future__ import annotations

import random
from collections import deque
from copy import deepcopy

BOARD_SIZE = 9
NUM_WALLS = 10
WALL_GRID = BOARD_SIZE - 1  # 8
ACTION_SPACE = BOARD_SIZE * BOARD_SIZE + 2 * WALL_GRID * WALL_GRID  # 81 + 128 = 209
DRAW_DEPTH = 200
DIRECTIONS = [(-1, 0), (1, 0), (0, -1), (0, 1)]


class State:
    """Quoridor game state, always from current player's perspective."""

    def __init__(self, player_pos=None, enemy_pos=None,
                 player_walls=NUM_WALLS, enemy_walls=NUM_WALLS,
                 walls=None, depth=0):
        # Positions as (row, col) tuples
        self.player_pos = player_pos if player_pos is not None else (BOARD_SIZE - 1, BOARD_SIZE // 2)
        self.enemy_pos = enemy_pos if enemy_pos is not None else (0, BOARD_SIZE // 2)
        self.player_walls = player_walls
        self.enemy_walls = enemy_walls
        # walls[r][c] = 0 (empty), 1 (horizontal), 2 (vertical) for anchor (r,c)
        self.walls = walls if walls is not None else [[0] * WALL_GRID for _ in range(WALL_GRID)]
        self.depth = depth

    # ── Game status ──

    def is_lose(self):
        """Current player loses if enemy reached row 8 (enemy's goal)."""
        return self.enemy_pos[0] == BOARD_SIZE - 1

    def is_win(self):
        """Current player wins if they reached row 0."""
        return self.player_pos[0] == 0

    def is_draw(self):
        return self.depth >= DRAW_DEPTH

    def is_done(self):
        return self.is_lose() or self.is_win() or self.is_draw()

    # ── Wall traversal checks ──

    def _blocked_down(self, r, c):
        """Is moving from (r,c) to (r+1,c) blocked by a horizontal wall?"""
        for wc in (c - 1, c):
            if 0 <= wc < WALL_GRID and 0 <= r < WALL_GRID and self.walls[r][wc] == 1:
                return True
        return False

    def _blocked_right(self, r, c):
        """Is moving from (r,c) to (r,c+1) blocked by a vertical wall?"""
        for wr in (r - 1, r):
            if 0 <= wr < WALL_GRID and 0 <= c < WALL_GRID and self.walls[wr][c] == 2:
                return True
        return False

    def can_traverse(self, fr, fc, tr, tc):
        """Can a pawn move from (fr,fc) to adjacent (tr,tc)?"""
        dr, dc = tr - fr, tc - fc
        if dr == 1:
            return not self._blocked_down(fr, fc)
        if dr == -1:
            return not self._blocked_down(tr, tc)
        if dc == 1:
            return not self._blocked_right(fr, fc)
        if dc == -1:
            return not self._blocked_right(tr, tc)
        return False

    # ── Legal pawn moves ──

    def _legal_pawn_moves(self):
        """Return list of (row, col) the current player can move to."""
        pr, pc = self.player_pos
        er, ec = self.enemy_pos
        moves = []
        for dr, dc in DIRECTIONS:
            nr, nc = pr + dr, pc + dc
            if not (0 <= nr < BOARD_SIZE and 0 <= nc < BOARD_SIZE):
                continue
            if not self.can_traverse(pr, pc, nr, nc):
                continue
            if (nr, nc) == (er, ec):
                # Try jump straight over
                jr, jc = nr + dr, nc + dc
                if 0 <= jr < BOARD_SIZE and 0 <= jc < BOARD_SIZE and self.can_traverse(nr, nc, jr, jc):
                    moves.append((jr, jc))
                else:
                    # Diagonal jumps
                    for sdr, sdc in (DIRECTIONS if dr == 0 else [(0, -1), (0, 1)]) if dc == 0 else ([(-1, 0), (1, 0)]):
                        sr, sc = nr + sdr, nc + sdc
                        if 0 <= sr < BOARD_SIZE and 0 <= sc < BOARD_SIZE and self.can_traverse(nr, nc, sr, sc):
                            moves.append((sr, sc))
            else:
                moves.append((nr, nc))
        # Deduplicate
        return list(set(moves))

    # ── Legal wall placements ──

    def _wall_conflicts(self, r, c, orientation):
        """Check if placing wall at (r,c) with given orientation conflicts."""
        if self.walls[r][c] != 0:
            return True
        if orientation == 1:  # horizontal
            if c > 0 and self.walls[r][c - 1] == 1:
                return True
            if c < WALL_GRID - 1 and self.walls[r][c + 1] == 1:
                return True
        else:  # vertical
            if r > 0 and self.walls[r - 1][c] == 2:
                return True
            if r < WALL_GRID - 1 and self.walls[r + 1][c] == 2:
                return True
        return False

    def _has_path(self, start_r, start_c, goal_row):
        """BFS check if there's a path from (start_r, start_c) to goal_row."""
        visited = set()
        queue = deque([(start_r, start_c)])
        visited.add((start_r, start_c))
        while queue:
            r, c = queue.popleft()
            if r == goal_row:
                return True
            for dr, dc in DIRECTIONS:
                nr, nc = r + dr, c + dc
                if 0 <= nr < BOARD_SIZE and 0 <= nc < BOARD_SIZE and (nr, nc) not in visited:
                    if self.can_traverse(r, c, nr, nc):
                        visited.add((nr, nc))
                        queue.append((nr, nc))
        return False

    def _legal_wall_actions(self):
        """Return list of wall action indices."""
        if self.player_walls <= 0:
            return []
        actions = []
        for r in range(WALL_GRID):
            for c in range(WALL_GRID):
                for orientation in (1, 2):
                    if self._wall_conflicts(r, c, orientation):
                        continue
                    # Temporarily place wall
                    self.walls[r][c] = orientation
                    # Check both players can still reach goals
                    pr, pc = self.player_pos
                    er, ec = self.enemy_pos
                    if self._has_path(pr, pc, 0) and self._has_path(er, ec, BOARD_SIZE - 1):
                        idx = BOARD_SIZE * BOARD_SIZE
                        if orientation == 1:
                            idx += r * WALL_GRID + c
                        else:
                            idx += WALL_GRID * WALL_GRID + r * WALL_GRID + c
                        actions.append(idx)
                    self.walls[r][c] = 0
        return actions

    # ── Combined legal actions ──

    def legal_actions(self):
        """Return list of legal action indices."""
        actions = []
        for r, c in self._legal_pawn_moves():
            actions.append(r * BOARD_SIZE + c)
        actions.extend(self._legal_wall_actions())
        return actions

    # ── State transition ──

    def next(self, action):
        """Execute action and return new state (swapped perspective)."""
        walls_copy = [row[:] for row in self.walls]
        new_player_pos = self.player_pos
        new_player_walls = self.player_walls

        if action < BOARD_SIZE * BOARD_SIZE:
            # Pawn move
            r = action // BOARD_SIZE
            c = action % BOARD_SIZE
            new_player_pos = (r, c)
        elif action < BOARD_SIZE * BOARD_SIZE + WALL_GRID * WALL_GRID:
            # Horizontal wall
            idx = action - BOARD_SIZE * BOARD_SIZE
            wr = idx // WALL_GRID
            wc = idx % WALL_GRID
            walls_copy[wr][wc] = 1
            new_player_walls -= 1
        else:
            # Vertical wall
            idx = action - BOARD_SIZE * BOARD_SIZE - WALL_GRID * WALL_GRID
            wr = idx // WALL_GRID
            wc = idx % WALL_GRID
            walls_copy[wr][wc] = 2
            new_player_walls -= 1

        # Flip board: swap and mirror for opponent's perspective
        flipped_walls = [[0] * WALL_GRID for _ in range(WALL_GRID)]
        for r in range(WALL_GRID):
            for c in range(WALL_GRID):
                flipped_walls[r][c] = walls_copy[WALL_GRID - 1 - r][WALL_GRID - 1 - c]

        # Mirror positions
        new_enemy_r = BOARD_SIZE - 1 - new_player_pos[0]
        new_enemy_c = BOARD_SIZE - 1 - new_player_pos[1]
        new_player_r = BOARD_SIZE - 1 - self.enemy_pos[0]
        new_player_c = BOARD_SIZE - 1 - self.enemy_pos[1]

        return State(
            player_pos=(new_player_r, new_player_c),
            enemy_pos=(new_enemy_r, new_enemy_c),
            player_walls=self.enemy_walls,
            enemy_walls=new_player_walls,
            walls=flipped_walls,
            depth=self.depth + 1,
        )

    # ── Neural network input ──

    def pieces_array(self):
        """Encode state as 6-channel 9x9 tensor (flat list for NN input).

        Channels:
          0: current player pawn position
          1: enemy pawn position
          2: horizontal walls
          3: vertical walls
          4: current player wall count (uniform)
          5: enemy wall count (uniform)
        """
        channels = []
        N = BOARD_SIZE

        # Channel 0: player position
        ch = [0.0] * (N * N)
        pr, pc = self.player_pos
        ch[pr * N + pc] = 1.0
        channels.append(ch)

        # Channel 1: enemy position
        ch = [0.0] * (N * N)
        er, ec = self.enemy_pos
        ch[er * N + ec] = 1.0
        channels.append(ch)

        # Channel 2: horizontal walls
        ch = [0.0] * (N * N)
        for r in range(WALL_GRID):
            for c in range(WALL_GRID):
                if self.walls[r][c] == 1:
                    ch[r * N + c] = 1.0
                    if c + 1 < N:
                        ch[r * N + c + 1] = 1.0
        channels.append(ch)

        # Channel 3: vertical walls
        ch = [0.0] * (N * N)
        for r in range(WALL_GRID):
            for c in range(WALL_GRID):
                if self.walls[r][c] == 2:
                    ch[r * N + c] = 1.0
                    if r + 1 < N:
                        ch[(r + 1) * N + c] = 1.0
        channels.append(ch)

        # Channel 4: player walls remaining (normalized)
        val = self.player_walls / NUM_WALLS
        channels.append([val] * (N * N))

        # Channel 5: enemy walls remaining (normalized)
        val = self.enemy_walls / NUM_WALLS
        channels.append([val] * (N * N))

        return channels

    def is_first_player(self):
        return self.depth % 2 == 0

    def __str__(self):
        N = BOARD_SIZE
        lines = []
        lines.append(f"Depth={self.depth} {'P1' if self.is_first_player() else 'P2'} to move")
        lines.append(f"Player@{self.player_pos} walls={self.player_walls}")
        lines.append(f"Enemy@{self.enemy_pos} walls={self.enemy_walls}")
        grid = [['.' for _ in range(N)] for _ in range(N)]
        grid[self.player_pos[0]][self.player_pos[1]] = 'P'
        grid[self.enemy_pos[0]][self.enemy_pos[1]] = 'E'
        for row in grid:
            lines.append(' '.join(row))
        return '\n'.join(lines)


def random_action(state):
    actions = state.legal_actions()
    return random.choice(actions)


if __name__ == '__main__':
    state = State()
    print(state)
    print(f"Legal actions: {len(state.legal_actions())}")
    while not state.is_done():
        action = random_action(state)
        state = state.next(action)
    print(state)
    print("Done!", "Lose" if state.is_lose() else "Win" if state.is_win() else "Draw")

