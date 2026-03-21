"""Full AlphaZero training cycle — PyTorch version.

Usage:
  python train_cycle.py                                  # run locally
  nohup python train_cycle.py > train.log 2>&1 &         # run on VPS
  tail -f train.log                                       # monitor progress
"""
import time
import json
import os
from datetime import datetime

from dual_network import dual_network
from self_play import self_play
from train_network import train_network
from evaluate_network import evaluate_network

NUM_CYCLES = 100
STATS_FILE = './stats.json'


def load_stats():
    if os.path.exists(STATS_FILE):
        with open(STATS_FILE, 'r') as f:
            return json.load(f)
    return {
        'total_cycles': 0,
        'total_games': 0,
        'total_samples': 0,
        'model_updates': 0,
        'total_time_hours': 0,
        'history': [],
    }


def save_stats(stats):
    with open(STATS_FILE, 'w') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)


if __name__ == '__main__':
    dual_network()
    stats = load_stats()
    start_cycle = stats['total_cycles']

    for i in range(start_cycle, start_cycle + NUM_CYCLES):
        cycle_start = time.time()
        print(f'\n{"="*50}', flush=True)
        print(f'CYCLE {i+1} | Started: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}', flush=True)
        print(f'Total games so far: {stats["total_games"]} | Samples: {stats["total_samples"]} | Model updates: {stats["model_updates"]}', flush=True)
        print(f'{"="*50}', flush=True)

        # 1. Self-play
        print('\n--- Self-Play ---', flush=True)
        sp_start = time.time()
        sp_samples = self_play()
        sp_time = time.time() - sp_start
        print(f'Self-play done: {sp_time:.0f}s', flush=True)

        # 2. Train
        print('\n--- Training ---', flush=True)
        tr_start = time.time()
        train_network()
        tr_time = time.time() - tr_start
        print(f'Training done: {tr_time:.0f}s', flush=True)

        # 3. Evaluate
        print('\n--- Evaluation ---', flush=True)
        ev_start = time.time()
        updated = evaluate_network()
        ev_time = time.time() - ev_start
        print(f'Evaluation done: {ev_time:.0f}s', flush=True)

        cycle_time = time.time() - cycle_start

        # Update stats
        stats['total_cycles'] = i + 1
        stats['total_games'] += 25  # SP_GAME_COUNT
        stats['total_time_hours'] = round(stats['total_time_hours'] + cycle_time / 3600, 2)
        if updated:
            stats['model_updates'] += 1
        stats['history'].append({
            'cycle': i + 1,
            'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'cycle_seconds': round(cycle_time),
            'selfplay_seconds': round(sp_time),
            'train_seconds': round(tr_time),
            'eval_seconds': round(ev_time),
            'model_updated': updated,
        })
        save_stats(stats)

        # Summary
        print(f'\n--- Cycle {i+1} Summary ---', flush=True)
        print(f'Time: {cycle_time:.0f}s (SP:{sp_time:.0f}s TR:{tr_time:.0f}s EV:{ev_time:.0f}s)', flush=True)
        print(f'Model: {"UPDATED" if updated else "unchanged"}', flush=True)
        print(f'Cumulative: {stats["total_cycles"]} cycles, {stats["total_games"]} games, {stats["model_updates"]} updates, {stats["total_time_hours"]:.1f}h', flush=True)

    print('\nTraining complete.', flush=True)
