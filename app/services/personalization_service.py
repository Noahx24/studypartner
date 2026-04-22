from __future__ import annotations

from app.storage import add_feedback, get_session, get_user_multiplier, update_user_multiplier


def update_multiplier_from_feedback(user_id: str, session_id: str, actual_time_minutes: int) -> dict:
    session = get_session(session_id)
    if not session:
        raise ValueError("Session not found")
    if session.user_id != user_id:
        raise ValueError("Session does not belong to user")
    if session.status != "completed":
        raise ValueError("Session must be completed before feedback")
    if actual_time_minutes <= 0 or actual_time_minutes > 600:
        raise ValueError("Actual time must be between 1 and 600 minutes")

    estimated = max(1, session.planned_minutes)
    ratio = actual_time_minutes / estimated
    if ratio < 0.3 or ratio > 3.0:
        return {
            "ignored": True,
            "reason": "outlier",
            "multiplier": get_user_multiplier(user_id)[0],
            "estimated_time_minutes": estimated,
            "actual_time_minutes": actual_time_minutes,
        }

    old_multiplier, sample_count = get_user_multiplier(user_id)

    # Gradual adaptation: weaker adjustment until enough data is accumulated.
    alpha = 0.1 if sample_count < 3 else 0.2
    new_multiplier = (old_multiplier * (1 - alpha)) + (ratio * alpha)
    new_multiplier = max(0.7, min(1.5, new_multiplier))

    add_feedback(user_id, session_id, session.unit_id, estimated, actual_time_minutes, ratio)
    update_user_multiplier(user_id, new_multiplier, sample_count + 1)

    return {
        "ignored": False,
        "estimated_time_minutes": estimated,
        "actual_time_minutes": actual_time_minutes,
        "ratio": round(ratio, 3),
        "old_multiplier": round(old_multiplier, 3),
        "new_multiplier": round(new_multiplier, 3),
        "feedback_samples": sample_count + 1,
        "message": f"Estimates adjusted based on your pace ({new_multiplier:.2f}x).",
    }
