"""Rétrécissement bayésien unique pour toutes les statistiques observées."""
import math


def shrink(value: float, n: int, k: int) -> float:
    n = max(0, int(n))
    return value * n / (n + k) if n + k > 0 else 0.0


def shrink_sd(n: int, k: int) -> float:
    return 50.0 / math.sqrt(max(0, int(n)) + k)
