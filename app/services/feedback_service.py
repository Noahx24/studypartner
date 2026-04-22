from __future__ import annotations

import math


def update_multiplier(old_multiplier: float, estimated_minutes: int, actual_minutes: int, feedback_samples: int) -> tuple[float, bool]:
    if estimated_minutes <= 0 or actual_minutes <= 0:
        return old_multiplier, False

    ratio = actual_minutes / estimated_minutes
    if ratio < 0.3 or ratio > 3.0:
        return old_multiplier, False

    alpha = 0.1 if feedback_samples < 3 else 0.2
    new_multiplier = (old_multiplier * (1 - alpha)) + (ratio * alpha)
    clamped = max(0.7, min(1.5, new_multiplier))
    return round(clamped, 4), True


def adjusted_minutes(base_minutes: int, multiplier: float) -> int:
    return max(20, int(math.ceil((base_minutes * multiplier) / 5) * 5))
