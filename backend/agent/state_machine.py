import os

from agent.evaluator import run_evaluator
from agent.planner import run_planner
from integrations.execution_client import (
    execute_payments,
    send_approval_sms,
    send_confirmation_sms,
)
from integrations.nexla_client import get_vendor_quotes
from models.schemas import SessionState

MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))


def run_planning_loop(session: SessionState) -> SessionState:
    vendor_quotes = get_vendor_quotes()
    session.logs.append(f"[Nexla]: Retrieved {len(vendor_quotes)} vendor quotes.")

    previous_reason = None
    for attempt in range(1, MAX_RETRIES + 1):
        session.attempts = attempt
        session.logs.append(
            f"[Planner]: Attempt {attempt} — querying vendor quotes for a plan..."
        )
        plan = run_planner(session.request, vendor_quotes, previous_reason)
        session.logs.append(
            f"[Planner]: Proposed total ${plan.total_proposed_cost:.2f} — {plan.notes}"
        )

        result = run_evaluator(session.request, plan, vendor_quotes)
        session.itinerary = plan
        session.evaluator_result = result
        if result.passed:
            session.logs.append(
                f"[Evaluator]: PLAN VALIDATED. Total ${result.total_cost:.2f}, "
                f"${result.budget_diff:.2f} under budget. {result.reason}"
            )
            session.status = "awaiting_approval"
            _trigger_hitl_notification(session)
            return session

        over_by = -result.budget_diff if result.budget_diff < 0 else 0
        session.logs.append(
            f"[Evaluator]: GUARDRAIL TRIGGERED. Budget exceeded by ${over_by:.2f}. "
            f"Rejecting execution. {result.reason}"
        )
        previous_reason = result.reason

    session.status = "rejected_max_retries"
    session.logs.append(
        f"[State Machine]: Max retries ({MAX_RETRIES}) exhausted. Cannot satisfy constraints."
    )
    return session


def _trigger_hitl_notification(session: SessionState) -> None:
    send_approval_sms(
        f"LoopEvent: plan finalized for {session.request.attendees} guests "
        f"(${session.evaluator_result.total_cost:.2f}). "
        "Awaiting your approval on the dashboard."
    )
    session.logs.append("[Zero.xyz -> Twilio]: Approval notification SMS sent.")


def execute_approved_session(session: SessionState) -> SessionState:
    if session.status != "awaiting_approval":
        session.logs.append(
            "[State Machine]: Approve called but session was not awaiting approval. Ignored."
        )
        return session

    execute_payments(session.itinerary)
    session.logs.append("[Zero.xyz]: Mock payment webhooks fired for all itinerary items.")
    send_confirmation_sms(
        f"LoopEvent: your event for {session.request.attendees} guests is booked and confirmed."
    )
    session.logs.append("[Zero.xyz -> Twilio]: Confirmation SMS sent.")
    session.status = "executed"
    session.logs.append("[State Machine]: Execution complete.")
    return session

